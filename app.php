<?php

/**
 * 直链分享（dl）
 * 为文件生成永久、可停用、匿名可访问的短直链。
 *
 * 链接形态：index.php?plugin/dl/<token>
 * token 直接作为路由末段（无需 token= 参数），长度与字符类型可在插件配置中调整。
 * 插件控制器路由的末段会参与类名/文件解析，无法承载动态 token，
 * 因此通过 globalRequest 钩子在路由分发前接管该请求。
 */
class dlPlugin extends PluginBase
{
	// 当前请求是否正在输出直链文件内容（用于覆盖核心默认缓存头）
	private static $directOut = false;

	function __construct(){
		parent::__construct();
	}

	public function regist(){
		$this->hookRegist(array(
			'user.commonJs.insert'           => 'dlPlugin.echoJs',
			'globalRequest'                  => 'dlPlugin.route',
		));
	}

	public function echoJs(){
		$this->echoFile('static/main.js');
	}

	/**
	 * 直链内容输出前覆盖核心默认的 30 天缓存头：
	 * 直链支持随时停用，不允许浏览器/代理继续使用缓存副本。
	 * 钩子在核心写入默认缓存头之后、输出正文之前触发。
	 */
	public function fileOutHeaders($file = '', $fileSize = 0, $filename = '', $ext = ''){
		if(!self::$directOut) return;
		self::$directOut = false;
		header('Cache-Control: private, no-store, max-age=0', true);
		header('Pragma: no-cache', true);
		header('Expires: 0', true);
		header_remove('Cache-Pragma');
	}

	/**
	 * 直链路由接管：plugin/dl/<token>
	 * 插件控制器路由的末段会参与类名/文件解析（每个 token 对应一个控制器文件），
	 * 因此在路由分发前直接接管，token 作为唯一路径段；
	 * 与插件接口方法同名的路由（list/create 等）放行给正常控制器处理。
	 */
	public function route(){
		$in = isset($this->in) && is_array($this->in) ? $this->in : _get($GLOBALS,'in',array());
		$remote = _get($in,'URLremote',array());
		if(!is_array($remote) || count($remote) != 3) return;
		if(strtolower(_get($remote,0,'')) != 'plugin') return;
		if(strtolower(_get($remote,1,'')) != 'dl') return;
		$token = _get($remote,2,'');
		if(!is_string($token)) return;
		if(in_array(strtolower($token),$this->reservedActions())) return;
		if(!preg_match('/^[0-9A-Za-z_-]{4,64}$/',$token)){
			// plugin/dl/ 空路径交回核心按 index 处理；其他非法 token 统一 404
			if($token !== '') $this->notFound();
			return;
		}
		$this->file($token);
	}

	/**
	 * 直链 token 与这些插件方法同名时按正常接口处理（plugin/dl/list 等），不做直链解析。
	 * 由当前类的公开方法动态生成，新增接口方法后无需再手工维护。
	 */
	private function reservedActions(){
		static $list = false;
		if($list === false){
			$list = array();
			// get_class_methods 在类作用域内会返回 private 方法；
			// 这里只认公开方法，避免 plugin/dl/initTable 之类路由绕过直链接管。
			$ref = new ReflectionClass($this);
			foreach($ref->getMethods(ReflectionMethod::IS_PUBLIC) as $method){
				$list[] = strtolower($method->getName());
			}
			$list = array_values(array_unique($list));
		}
		return $list;
	}

	/**
	 * 当前用户直链管理页（顶部菜单 iframe）
	 */
	public function index(){
		header('Content-Type: text/html; charset=utf-8');
		$user = Session::get('kodUser');
		if(!$user){
			$this->notFound($this->t('dl.tips.notLogin','请先登录','Please login first'));
		}
		$this->initTable();

		$labels = $this->pageLabels();
		$boot = array(
			'api' => urlApi('plugin/dl', null),
			't'   => $labels,
		);

		$host = rtrim($this->pluginHost,'/').'/';
		// 页面内同时引用 page.js 与 page.css，取两者较新的修改时间做缓存版本;
		$version = max(
			intval(@filemtime($this->pluginPath.'static/page.js')),
			intval(@filemtime($this->pluginPath.'static/page.css'))
		);
		// 用户页 iframe 需要直接引用核心 CSS，这里给出与核心 linkHref 一致的静态路径;
		$staticPath = defined('STATIC_PATH') ? STATIC_PATH : '';
		if(!$staticPath && isset($GLOBALS['config']['settings']['staticPath'])){
			$staticPath = $GLOBALS['config']['settings']['staticPath'];
		}
		if(!$staticPath) $staticPath = APP_HOST.'static/';
		if(substr($staticPath,-1) != '/') $staticPath .= '/';
		$boot['static'] = $staticPath;

		$page = file_get_contents($this->pluginPath.'static/page.html');
		$replace = array(
			'{{pluginHost}}'      => $host,
			'{{staticPath}}'      => $staticPath,
			'{{staticVersion}}'   => KOD_VERSION.'.'.KOD_VERSION_BUILD,
			'{{package.version}}' => $version ? $version : '1',
			'{{BOOTSTRAP}}'       => json_encode($boot, JSON_UNESCAPED_UNICODE|JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT),
		);
		echo str_replace(array_keys($replace),array_values($replace),$page);
		exit;
	}

	/**
	 * 生成直链（登录用户，校验文件下载权限）
	 */
	public function create(){
		$userID = $this->checkLogin();
		$this->checkCsrf();
		$this->initTable();

		$path = Input::get('path','require');
		// 共享/外链内容不支持生成匿名直链：直链不随分享或权限收回而失效，会绕过分享的密码/有效期等限制；
		$parse = KodIO::parse($path);
		if($parse && in_array(_get($parse,'type'),$this->sharePathTypes())){
			show_json($this->t('dl.tips.sharePath','共享内容不支持生成直链，请对文件所有者操作','Direct links cannot be created from shared content'),false);
		}
		// 前端传入的可能是 source 下级的相对路径（{source:5}/dir/file.txt），
		// IO::info 只识别路径首段，需用 infoFull 解析到真实文件后取其规范路径
		$info = $this->fileInfo($path,true);
		if(!$info){
			show_json($this->t('dl.tips.invalidFile','文件不存在或不可用','File not found or unavailable'),false);
		}
		if($this->isFolderInfo($info)){
			show_json($this->t('dl.tips.folder','仅支持文件，不支持文件夹','Only files are supported'),false);
		}
		// 文件级下载权限，以及角色维度的下载权限点（与 explorer.index.fileDownload 保持一致）
		if(!Action('user.authRole')->authCanDownload() || !Action('explorer.auth')->fileCanDownload($path)){
			show_json($this->t('dl.tips.noPermission','没有该文件的下载权限','No download permission for this file'),false);
		}

		$truePath = $info['path'];
		// 匿名请求无法可靠还原 {driver} 等会话级路径，只允许 source 与物理 io 路径；
		// 分享类路径已在前面单独拦截。
		$trueParse = KodIO::parse($truePath);
		$pathType  = _get($trueParse,'type');
		if($pathType && $pathType != KodIO::KOD_SOURCE && $pathType != KodIO::KOD_IO){
			show_json($this->t('dl.tips.pathType','该路径类型不支持生成直链','This path type cannot be shared as a direct link'),false);
		}

		$model = Model('plugin_dl');
		$exists = $model->where(array('userID'=>$userID,'path'=>$truePath))->find();
		if($exists){
			// 复用已有直链。上面已确认当前文件可读，这里不再二次校验：
			// 瞬时读取失败时若删除旧记录，会让所有已分发的链接永久失效。
			show_json(array(
				'id'    => intval($exists['id']),
				'name'  => $exists['name'],
				'token' => $exists['token'],
				'url'   => $this->linkUrl($exists['token']),
				'status'=> intval($exists['status']),
				'exist' => true,
			),true);
		}

		$token = $this->makeToken();
		if(!$token){
			show_json($this->t('dl.tips.createFail','直链生成失败','Failed to create direct link'),false);
		}
		$now = time();
		$data = array(
			'token'      => $token,
			'path'       => $truePath,
			'fileID'     => intval(_get($info,'fileID',0)),
			'name'       => _get($info,'name',''),
			'ext'        => _get($info,'ext',''),
			'size'       => intval(_get($info,'size',0)),
			'userID'     => $userID,
			'status'     => 1,
			'numView'    => 0,
			'lastViewTime'=> 0,
			'createTime' => $now,
			'modifyTime' => $now,
		);
		$model->setDataAuto(false);
		$id = $model->add($data);
		if(!$id){
			show_json($this->t('dl.tips.createFail','直链生成失败','Failed to create direct link'),false);
		}
		show_json(array(
			'id'    => intval($id),
			'name'  => $data['name'],
			'token' => $token,
			'url'   => $this->linkUrl($token),
			'status'=> 1,
			'exist' => false,
		),true);
	}

	/**
	 * 当前用户的直链列表
	 */
	public function list(){
		$userID = $this->checkLogin();
		$this->initTable();

		$model = Model('plugin_dl');
		$base = array('userID'=>$userID);
		$where = $this->listWhere($base);
		// 回收站中/已彻底删除的文件对应直链不展示（只读接口不删除记录）
		$hidden = $this->hiddenLinkIDs($userID);
		$where = $this->notHidden($where,$hidden);

		$page = max(1,intval(_get($this->in,'page',1)));
		$pageNum = intval(_get($this->in,'pageNum',10));
		$pageNum = $pageNum < 5 ? 5 : ($pageNum > 100 ? 100 : $pageNum);

		// 核心 selectPage 会优先读取 $in 中的 page/pageNum（上限 100000），
		// 不重置则上面的参数限制失效，可被请求方放大分页大小。
		$model->selectPageReset();
		$result = $model->where($where)->order('createTime desc')->selectPage($pageNum,$page);
		if(!is_array($result)) $result = array();
		$result['list'] = $this->listFormat(_get($result,'list',array()));
		$statWhere = $this->notHidden($base,$hidden);
		$result['stats'] = $this->statusStats($statWhere);
		unset($result['stats']['disable']);
		show_json($result);
	}

	/**
	 * 启用/停用（仅本人）
	 */
	public function setStatus(){
		$userID = $this->checkLogin();
		$this->checkCsrf();
		$this->initTable();
		$id = intval(_get($this->in,'id',0));
		$status = intval(_get($this->in,'status',0)) == 1 ? 1 : 0;
		$row = Model('plugin_dl')->where(array('id'=>$id,'userID'=>$userID))->find();
		if(!$row){
			show_json($this->t('dl.tips.noRecord','记录不存在或无权操作','Record not found or no permission'),false);
		}
		Model('plugin_dl')->setDataAuto(false);
		$res = Model('plugin_dl')->where(array('id'=>$id,'userID'=>$userID))->save(array(
			'status'=>$status,'modifyTime'=>time(),
		));
		// 状态未变化时 save 返回 0（影响行数），这不是失败
		show_json(LNG('explorer.success'),$res !== false);
	}

	/**
	 * 删除直链（仅本人，不删除文件）
	 */
	public function remove(){
		$userID = $this->checkLogin();
		$this->checkCsrf();
		$this->initTable();
		$id = intval(_get($this->in,'id',0));
		$row = Model('plugin_dl')->where(array('id'=>$id,'userID'=>$userID))->find();
		if(!$row){
			show_json($this->t('dl.tips.noRecord','记录不存在或无权操作','Record not found or no permission'),false);
		}
		$res = Model('plugin_dl')->where(array('id'=>$id,'userID'=>$userID))->delete();
		show_json(LNG('explorer.success'),$res !== false);
	}

	/**
	 * 匿名输出直链文件
	 * 路由：plugin/dl/<token>，由 route() 在分发前接管。
	 */
	public function file($token = ''){
		if(!$token) $this->notFound();
		if(!$token || !preg_match('/^[0-9A-Za-z_-]{4,64}$/',$token)){
			$this->notFound();
		}
		$this->initTable();
		$row = Model('plugin_dl')->where(array('token'=>$token,'status'=>1))->find();
		// MySQL 默认 utf8mb4_general_ci 对 token 列大小写不敏感，这里严格比对一次，
		// 保证 mixed 类型 token 的大小写有效（SQLite 本身区分大小写）。
		if(!$row || _get($row,'token') !== $token){
			$this->failRateLimit();
			$this->notFound();
		}
		// 创建者当前已无下载权限（角色收回、部门权限变更、用户被删除等）时直链失效
		if(!$this->creatorCanDownload($row)){
			$this->failRateLimit();
			$this->notFound();
		}

		$info = $this->fileInfo($row['path']);
		if(!$info || $this->isFolderInfo($info)){
			$this->notFound();
		}

		$ext = strtolower(_get($info,'ext',_get($row,'ext','')));
		$download = intval(_get($this->in,'download',0)) == 1;
		// 可在本站域内直接执行的类型强制下载，避免匿名直链造成 XSS
		if(in_array($ext,$this->forceDownloadExts())){
			$download = true;
		}
		// 视频/大文件的分段请求会重复访问同一文件，只按首个请求计数
		$range = isset($_SERVER['HTTP_RANGE']) ? trim($_SERVER['HTTP_RANGE']) : '';
		$isRangePart = $range && !preg_match('/^bytes=0-/i',$range);

		$upData = array();
		// 访问与下载统一计为访问量；同一次访问产生的重复请求（见 markViewed）只计一次
		if(!$isRangePart && REQUEST_METHOD !== 'HEAD' && $this->markViewed($row)){
			$upData['numView']      = array('exp','numView + 1');
			$upData['lastViewTime'] = time();
		}
		// 文件被重命名后直链仍指向同一文件（路径基于 sourceID），这里同步最新的名称/大小;
		$name = _get($info,'name','');
		if($name && $name != $row['name']){
			$upData['name'] = $name;
			$upData['ext']  = _get($info,'ext','');
			$upData['size'] = intval(_get($info,'size',0));
		}
		if($upData){
			$upData['modifyTime'] = time();
			Model('plugin_dl')->setDataAuto(false);
			Model('plugin_dl')->where(array('id'=>intval($row['id'])))->save($upData);
		}

		header('X-Content-Type-Options: nosniff');
		if($download){Hook::trigger('explorer.fileDownload',$row['path']);}
		Hook::trigger('explorer.fileOut',$row['path']);
		if(!$name) $name = $row['name'];
		// 每次请求内绑定，不依赖插件安装时持久化的钩子列表（升级后无需重装插件）
		Hook::bind('PathDriverBase.fileOut.before','dlPlugin.fileOutHeaders');
		self::$directOut = true;
		IO::fileOut($row['path'],$download,$name);
		self::$directOut = false;
		exit;
	}

	/**
	 * 文件封面（图片缩略图，仅登录用户可访问）
	 * 用户只能查看自己的直链封面，管理员可查看全部；
	 * 返回值直接作为 img src 使用，失败时返回 404 由前端回退为文件图标。
	 */
	public function cover(){
		$this->initTable();
		$id = intval(_get($this->in,'id',0));
		$userID = KodUser::id();
		$row = ($id && $userID) ? Model('plugin_dl')->where(array('id'=>$id))->find() : null;
		if(!$row){ $this->coverNotFound(); }
		if(intval($row['userID']) !== intval($userID) && !KodUser::isRoot()){
			$this->coverNotFound();
		}
		// 创建者已无访问权限时不再输出封面（与直链本体失效保持一致）
		if(!$this->creatorCanDownload($row)){ $this->coverNotFound(); }
		$info = $this->fileInfo($row['path']);
		if(!$info || $this->isFolderInfo($info)){ $this->coverNotFound(); }
		$ext = strtolower(_get($info,'ext',''));
		if(!in_array($ext,$this->imageExts()) && !in_array($ext,$this->videoExts())){
			$this->coverNotFound();
		}

		// 视频封面交给 fileThumb 插件生成（未启用时 404，由前端回退为类型图标）
		if(in_array($ext,$this->videoExts())){
			$url = urlApi('plugin/fileThumb/cover','path='.rawurlencode($row['path']).'&width=250');
			header('Location: '.$url);
			exit;
		}

		header('X-Content-Type-Options: nosniff');
		Hook::bind('PathDriverBase.fileOut.before','dlPlugin.fileOutHeaders');
		$path = $row['path'];
		if(in_array($ext,array('jpg','jpeg','png','bmp')) && function_exists('imagecolorallocate') && intval(_get($info,'size',0)) >= 1024*50){
			$width = intval(_get($this->in,'width',250));
			$width = $width < 100 ? 250 : ($width > 600 ? 600 : $width);
			self::$directOut = true;
			IO::fileOutImage($path,$width);
			self::$directOut = false;
			exit;
		}
		self::$directOut = true;
		IO::fileOut($path,false);
		self::$directOut = false;
		exit;
	}

	private function coverNotFound(){
		http_response_code(404);
		header('Content-Type: image/svg+xml; charset=utf-8');
		echo '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';
		exit;
	}

	private function imageExts(){
		// 不包含 svg：SVG 可携带脚本，不能作为封面内联输出（直接访问可造成存储型 XSS）
		return array('jpg','jpeg','png','bmp','gif','webp','avif','heic','heif');
	}

	/**
	 * 分享类路径类型：匿名直链绕过分享限制，不允许据此创建
	 */
	private function sharePathTypes(){
		return array(
			KodIO::KOD_SHARE_LINK, KodIO::KOD_SHARE_ITEM, KodIO::KOD_SHARE_OUTER,
			KodIO::KOD_USER_SHARE, KodIO::KOD_USER_SHARE_LINK, KodIO::KOD_USER_SHARE_TO_ME,
		);
	}

	/**
	 * 可在本站域内直接执行的类型：匿名直链一律强制下载
	 */
	private function forceDownloadExts(){
		return array(
			'html','htm','xhtml','xht','shtml','shtm','svg','xml','xsl','xslt',
			'js','mjs','swf','hta','mht','mhtml',
		);
	}

	private function videoExts(){
		return array('mp4','m4v','mov','avi','mkv','wmv','flv','webm','mpg','mpeg','3gp','rmvb','rm');
	}

	/**
	 * 后台：全部用户直链
	 */
	public function adminList(){
		KodUser::checkRoot();
		$this->initTable();

		$where = $this->listWhere(array());
		$userID = intval(_get($this->in,'userID',0));
		if($userID > 0){
			$where['userID'] = $userID;
		}
		// 全局同步：回收站中/已彻底删除的文件对应直链不展示（只读接口不删除记录）
		$hidden = $this->hiddenLinkIDs(0);
		$where = $this->notHidden($where,$hidden);

		$page = max(1,intval(_get($this->in,'page',1)));
		$pageNum = intval(_get($this->in,'pageNum',10));
		$pageNum = $pageNum < 5 ? 5 : ($pageNum > 100 ? 100 : $pageNum);

		$model = Model('plugin_dl');
		// 同上：避免核心 selectPage 从 $in 读取未限制的 pageNum/page
		$model->selectPageReset();
		$result = $model->where($where)->order('createTime desc')->selectPage($pageNum,$page);
		if(!is_array($result)) $result = array();
		$result['list'] = $this->listFormat(_get($result,'list',array()),true);

		$userIDs = array_to_keyvalue($result['list'],'','userID');
		$userList = $this->usersInfo($userIDs);
		foreach($result['list'] as &$item){
			$userInfo = _get($userList,$item['userID'],array());
			$item['userInfo'] = array(
				'userID'   => $item['userID'],
				'name'     => _get($userInfo,'name',''),
				'nickName' => _get($userInfo,'nickName',''),
				'avatar'   => $this->avatarUrl(_get($userInfo,'avatar','')),
			);
		}
		unset($item);

		// 筛选下拉使用的用户列表（含头像与直链数量），不受当前筛选条件影响;
		$userRows = Model('plugin_dl')->where($this->notHidden(array(),$hidden))
			->field(array('userID','count(id)'=>'num'))->group('userID')->select();
		$users = array();
		$userRows = is_array($userRows) ? $userRows : array();
		$allIDs = $userRows ? array_to_keyvalue($userRows,'','userID') : array();
		$allUsers = $allIDs ? $this->usersInfo($allIDs) : array();
		foreach($userRows as $u){
			$uid = intval($u['userID']);
			$uInfo = _get($allUsers,$uid,array());
			$users[] = array(
				'userID'   => $uid,
				'name'     => _get($uInfo,'name',''),
				'nickName' => _get($uInfo,'nickName',''),
				'avatar'   => $this->avatarUrl(_get($uInfo,'avatar','')),
				'num'      => intval(_get($u,'num',0)),
			);
		}
		$result['users'] = $users;

		$statWhere = $this->notHidden(array(),$hidden);
		$result['stats'] = $this->statusStats($statWhere);
		show_json($result);
	}

	/**
	 * 后台：启用/停用
	 */
	public function adminSetStatus(){
		KodUser::checkRoot();
		$this->checkCsrf();
		$this->initTable();
		$id = intval(_get($this->in,'id',0));
		$status = intval(_get($this->in,'status',0)) == 1 ? 1 : 0;
		$row = $id ? Model('plugin_dl')->where(array('id'=>$id))->find() : null;
		if(!$row) show_json($this->t('dl.tips.noRecord','记录不存在','Record not found'),false);
		Model('plugin_dl')->setDataAuto(false);
		$res = Model('plugin_dl')->where(array('id'=>$id))->save(array('status'=>$status,'modifyTime'=>time()));
		// 状态未变化时 save 返回 0（影响行数），这不是失败
		show_json(LNG('explorer.success'),$res !== false);
	}

	/**
	 * 后台：删除（支持逗号分隔批量）
	 */
	public function adminRemove(){
		KodUser::checkRoot();
		$this->checkCsrf();
		$this->initTable();
		$ids = trim(_get($this->in,'ids',''));
		$id = intval(_get($this->in,'id',0));
		if($ids){
			$ids = array_filter(array_map('intval',explode(',',$ids)));
		}else{
			$ids = $id ? array($id) : array();
		}
		if(!$ids){
			show_json($this->t('dl.tips.noRecord','记录不存在','Record not found'),false);
		}
		$res = Model('plugin_dl')->where(array('id'=>array('in',$ids)))->delete();
		show_json(LNG('explorer.success'),!!$res);
	}

	/* ------------------------------ 内部工具 ------------------------------ */

	/**
	 * 文件状态同步（参考官方分享管理对外链的处理）：
	 * - 文件在回收站（io_source.isDelete=1）：直链保留但不在列表展示，还原后自动恢复展示；
	 * - 文件已彻底删除（io_source 记录不存在）：仅隐藏，不在列表接口中删除记录。
	 * 列表接口保持只读：删除动作只发生在明确的用户操作（remove/adminRemove/create 清理）中。
	 * @param int $userID 0 表示全部用户（后台）
	 * @return array 需要隐藏的直链 ID
	 */
	private function hiddenLinkIDs($userID = 0){
		static $cache = array();
		$key = $userID ? 'u'.intval($userID) : 'all';
		if(isset($cache[$key])) return $cache[$key];

		$base = $userID ? array('userID'=>intval($userID)) : array();
		$rows = Model('plugin_dl')->where($base)->field(array('id','path'))->select();
		$rows = is_array($rows) ? $rows : array();
		if(!$rows){
			$cache[$key] = array();
			return $cache[$key];
		}

		$sourceLinks = array();	// sourceID => 直链ID列表
		$otherLinks  = array();	// 非 source 路径（协作分享、物理路径等）=> 直链ID
		foreach($rows as $row){
			$id = intval($row['id']);
			$path = _get($row,'path','');
			$parse = false;
			try{
				$parse = KodIO::parse($path);
			}catch(Exception $e){}
			$sourceID = $parse ? intval(_get($parse,'id',0)) : 0;
			if($parse && _get($parse,'type') == KodIO::KOD_SOURCE && $sourceID > 0){
				$sourceLinks[$sourceID][] = $id;
			}else{
				$otherLinks[$id] = $path;
			}
		}

		// 批量读取 source 状态，避免逐条查询
		$sourceInfo = array();
		foreach(array_chunk(array_keys($sourceLinks),500) as $ids){
			$list = Model('Source')->where(array('sourceID'=>array('in',$ids)))
				->field('sourceID,isDelete')->select();
			$list = is_array($list) ? $list : array();
			foreach($list as $item){
				$sourceInfo[intval($item['sourceID'])] = intval(_get($item,'isDelete',0));
			}
		}

		$hidden = array();
		foreach($sourceLinks as $sourceID => $linkIDs){
			// 记录不存在（已彻底删除）或已在回收站：均不展示
			if(!isset($sourceInfo[$sourceID]) || $sourceInfo[$sourceID] == 1){
				$hidden = array_merge($hidden,$linkIDs);
			}
		}
		// 无法判定来源类型的路径：文件不可读时仅隐藏
		foreach($otherLinks as $id => $path){
			if(!$this->fileInfo($path)){
				$hidden[] = $id;
			}
		}

		$cache[$key] = $hidden;
		return $hidden;
	}

	/**
	 * 一次分组查询得到 total/active/disable，避免每次列表 3 次全表 COUNT
	 * @return array
	 */
	private function statusStats($where){
		$rows = Model('plugin_dl')->where($where)
			->field(array('status','count(id)'=>'num'))->group('status')->select();
		$rows = is_array($rows) ? $rows : array();
		$stats = array('total'=>0,'active'=>0,'disable'=>0);
		foreach($rows as $row){
			$num = intval(_get($row,'num',0));
			$stats['total'] += $num;
			if(intval(_get($row,'status',0)) == 1){
				$stats['active'] += $num;
			}else{
				$stats['disable'] += $num;
			}
		}
		return $stats;
	}

	/**
	 * 追加“排除回收站直链”的查询条件
	 */
	private function notHidden($where,$hidden){
		if($hidden){
			$where['id'] = array('not in',$hidden);
		}
		return $where;
	}

	private function checkLogin(){
		$userID = KodUser::id();
		if(!$userID){
			show_json($this->t('dl.tips.notLogin','请先登录','Please login first'),false);
		}
		return $userID;
	}

	/**
	 * 状态变更接口的 CSRF 校验：
	 * 核心的 csrf 过滤器对 plugin.* 直接放行（插件内部自行处理），这里按核心同样的规则校验。
	 * 使用 accessToken 的 API 调用跳过（与核心 filter/post 一致）。
	 */
	private function checkCsrf(){
		if(isset($this->in['accessToken']) && $this->in['accessToken']) return;
		$token = _get($this->in,'CSRF_TOKEN','');
		if($token && $token === Cookie::get('CSRF_TOKEN')) return;
		show_json('CSRF_TOKEN error!',false);
	}

	/**
	 * 同一次访问去重。
	 * 浏览器直接打开视频直链时会先后发出两次完整请求：一次不带 Range 的文档导航请求，
	 * 一次 Range: bytes=0- 的媒体请求；两者都会到达这里且无法从请求本身区分，
	 * 因此按 直链 + 客户端（IP/UA）在短时间窗口内只计一次访问。
	 * @return bool 本次请求是否计数
	 */
	private function markViewed($row){
		$ip = function_exists('get_client_ip') ? get_client_ip() : '';
		if(!$ip) return true;
		$ua = _get($_SERVER,'HTTP_USER_AGENT','');
		$key = 'plugin_dl_view_'.md5(_get($row,'id','').'|'.$ip.'|'.$ua);
		if(Cache::get($key)) return false;
		Cache::set($key,1,5);
		return true;
	}

	/**
	 * 失败访问限频：防止短 token 被批量枚举（5 分钟内同一 IP 最多 120 次失败）
	 */
	private function failRateLimit(){
		$ip = function_exists('get_client_ip') ? get_client_ip() : '';
		if(!$ip) return;
		$key = 'plugin_dl_fail_'.md5($ip);
		$count = intval(Cache::get($key));
		if($count >= 120){
			http_response_code(429);
			header('Retry-After: 300');
			header('Content-Type: text/plain; charset=utf-8');
			echo 'Too Many Requests';
			exit;
		}
		Cache::set($key,$count + 1,300);
	}

	/**
	 * 直链创建者当前是否仍具备该文件的下载权限；
	 * 用于分享/部门权限变更、创建者被禁用或删除后自动让直链失效。
	 *
	 * 匿名请求没有登录会话，不能用 explorerAuthUser::can()（其内部按当前会话判断角色），
	 * 这里按 creator 的身份复刻相同的判断逻辑。
	 */
	private function creatorCanDownload($row){
		$userID = intval(_get($row,'userID',0));
		if(!$userID) return false;
		try{
			$authRole = Action('user.authRole');
			$roleInfo = $authRole->userRoleGet($userID);
			if(!$roleInfo) return false;
			$isRoot = _get($roleInfo,'info.administrator') == 1;
			if(!$isRoot && !$authRole->authCanUser('explorer.download',$userID)) return false;

			$parse = KodIO::parse($row['path']);
			if(!$parse) return false;
			$ioType = _get($parse,'type');
			// 物理/io 路径：管理员且开启物理路径访问（与 explorerAuthUser::can 一致）
			if($ioType == KodIO::KOD_IO || !$ioType){
				$allowIO = $isRoot || intval(_get($roleInfo,'allowAction.admin.storage.edit',0)) == 1;
				return $allowIO && !empty($this->config['ADMIN_ALLOW_IO']);
			}
			// 白名单：只有 source 路径能在匿名请求中做实时权限复检；
			// 分享类、{driver} 等类型无法安全复检，一律按失效处理。
			if($ioType != KodIO::KOD_SOURCE) return false;
			if($isRoot && !empty($this->config['ADMIN_ALLOW_SOURCE'])) return true;

			$sourceID = intval(_get($parse,'id',0));
			$pathInfo = $sourceID ? Model('Source')->sourceInfo($sourceID) : false;
			if(!$pathInfo || intval(_get($pathInfo,'isDelete',0)) == 1) return false;
			$targetType = intval(_get($pathInfo,'targetType',-1));
			$targetID   = intval(_get($pathInfo,'targetID',0));
			if($targetType == SourceModel::TYPE_USER){
				return $targetID === $userID;	// 个人空间：仍须为本人
			}
			if($targetType == SourceModel::TYPE_GROUP){	// 部门空间：仍须在该部门且有下载权限
				$authList = Model('SourceAuth')->getSourceList(array($sourceID),false,$userID);
				$auth = ($authList && isset($authList[$sourceID]))
					? $authList[$sourceID]
					: Action('explorer.listGroup')->pathGroupAuthMake($targetID,$userID);
				if(!$auth) return false;
				return (bool)Model('Auth')->authCheckAction($auth['authValue'],'download');
			}
			return false;
		}catch(Exception $e){
			return false;
		}
	}

	private function lang(){
		$lang = strtolower(I18n::getType());
		return strpos($lang,'zh') === 0 ? 'zh' : 'en';
	}

	private function t($key,$zh,$en=''){
		$val = LNG($key);
		if($val && $val !== $key) return $val;
		$lang = $this->lang();
		return $lang == 'zh' ? $zh : ($en ? $en : $zh);
	}

	/**
	 * 文件夹判定：source 路径用 isFolder，物理/io 路径可能只返回 type=folder
	 */
	private function isFolderInfo($info){
		return _get($info,'isFolder') == '1' || _get($info,'type') == 'folder';
	}

	private function fileInfo($path,$resolveNested = false){
		try{
			// 列表/直链记录里保存的是规范路径（{source:ID}/），用 info 即可；
			// 创建直链时用户传入的可能是父目录下的相对路径，需要 infoFull 解析
			$info = $resolveNested ? IO::infoFull($path) : IO::info($path);
		}catch(Exception $e){
			return false;
		}
		if(!is_array($info) || !_get($info,'path')){
			return false;
		}
		if(_get($info,'isDelete') == '1'){
			return false;
		}
		return $info;
	}

	private function linkUrl($token){
		return urlApi('plugin/dl/'.$token, null);
	}

	private function listWhere($base){
		$where = $base;
		$status = _get($this->in,'status','');
		if($status === '0' || $status === '1'){
			$where['status'] = intval($status);
		}
		$keyword = trim(_get($this->in,'keyword',''));
		if($keyword !== '' && $keyword !== null){
			$where['name'] = array('like','%'.$keyword.'%');
		}
		$start = $this->parseDate(_get($this->in,'startTime',''),false);
		$end = $this->parseDate(_get($this->in,'endTime',''),true);
		if($start !== false || $end !== false){
			if($start === false) $start = 0;
			if($end === false) $end = 2147483647;
			if($start > $end){ $tmp = $start; $start = $end; $end = $tmp; }
			$where['createTime'] = array('between',array($start,$end));
		}
		return $where;
	}

	/**
	 * 解析日期筛选参数：支持 YYYY-MM-DD（按本地时区整日）与时间戳
	 * @param mixed $val
	 * @param bool  $isEnd 仅日期格式时，结束时间补到当天 23:59:59
	 * @return int|false
	 */
	private function parseDate($val,$isEnd=false){
		$val = trim((string)$val);
		if($val === '') return false;
		if(preg_match('/^\d{4}-\d{2}-\d{2}$/',$val)){
			$ts = strtotime($val.' 00:00:00');
			if($ts === false) return false;
			return $isEnd ? $ts + 86399 : $ts;
		}
		if(is_numeric($val)) return intval($val);
		$ts = strtotime($val);
		return $ts === false ? false : $ts;
	}

	private function avatarUrl($avatar){
		if(!$avatar) return '';
		return Action('user.view')->parseUrl($avatar);
	}

	/**
	 * 批量获取用户展示信息（一次查询，避免逐条 N+1）
	 */
	private function usersInfo($ids){
		$result = array();
		$ids = is_array($ids) ? $ids : array($ids);
		$ids = array_values(array_unique(array_map('intval',$ids)));
		$ids = array_filter($ids);
		if(!$ids) return $result;
		$list = Model('User')->userListInfo($ids);
		if(!is_array($list)) return $result;
		foreach($list as $uid => $info){
			if(is_array($info)) $result[intval($uid)] = $info;
		}
		return $result;
	}

	private function listFormat($list,$admin=false){
		$imageExts = $this->imageExts();
		$result = array();
		foreach($list as $item){
			$item['id'] = intval($item['id']);
			$item['fileID'] = intval($item['fileID']);
			$item['size'] = intval($item['size']);
			$item['userID'] = intval($item['userID']);
			$item['status'] = intval($item['status']);
			$item['numView'] = intval($item['numView']);
			unset($item['numDownload']);	// 下载量已并入访问量，不再对外输出
			$item['lastViewTime'] = intval($item['lastViewTime']);
			$item['createTime'] = intval($item['createTime']);
			$item['ext'] = strtolower(_get($item,'ext',''));
			$item['url'] = $this->linkUrl($item['token']);
			$item['cover'] = (in_array($item['ext'],$imageExts) || in_array($item['ext'],$this->videoExts()))
				? urlApi('plugin/dl/cover','id='.$item['id'].'&width=250') : '';
			$result[] = $item;
		}
		return $result;
	}

	/**
	 * 按配置生成不重复的 token
	 */
	private function makeToken(){
		$config = $this->getConfig();
		$type = _get($config,'tokenType','lower');
		$len = intval(_get($config,'tokenLen',12));
		// 纯数字字符集小，最低 8 位（1e8），避免 4 位可被快速枚举；其他类型最低 6 位
		$lenMin = $type == 'num' ? 8 : 6;
		$len = $len < $lenMin ? $lenMin : ($len > 32 ? 32 : $len);
		$chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
		if($type == 'num'){
			$chars = '0123456789';
		}else if($type == 'mixed'){
			$chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
		}
		$max = strlen($chars) - 1;
		for($i = 0; $i < 10; $i ++){
			$token = '';
			for($j = 0; $j < $len; $j ++){
				$pos = function_exists('random_int') ? random_int(0,$max) : mt_rand(0,$max);
				$token .= $chars[$pos];
			}
			// 与插件接口方法同名会被路由优先当作接口处理，跳过;
			if(in_array(strtolower($token),$this->reservedActions())) continue;
			if(!Model('plugin_dl')->where(array('token'=>$token))->find()){
				return $token;
			}
		}
		return false;
	}

	private function initTable(){
		static $done = false;
		if($done) return;

		// tableReady 存最近一次校验时间：短期内直接信任，避免匿名直链每次请求都查表；
		// 超过间隔（或旧版本写入的 "1"）重新比对表是否存在，表被删除/恢复丢失时可自动重建，
		// 而不是永久报 "table doesn't exist"。
		$now  = time();
		$last = Model('SystemOption')->get('tableReady','dl');
		if(is_numeric($last) && intval($last) > 0 && $now - intval($last) < 60){
			$done = true;
			return;
		}
		$tables = Model()->db()->getTables();
		if(!in_array('plugin_dl',$tables)){
			$path = $this->pluginPath.'lib/data/plugin_dl.sql';
			if(getDatabaseType() == 'sqlite'){
				$path = $this->pluginPath.'lib/data/plugin_dl.sqlite.sql';
			}
			$sqlArr = sqlSplit(file_get_contents($path));
			foreach($sqlArr as $sql){
				Model()->db()->execute($sql);
			}
		}
		Model('SystemOption')->set('tableReady',$now,'dl');
		$done = true;
	}

	private function notFound($msg=''){
		if(!$msg) $msg = $this->t('dl.tips.notFound','直链无效或已被停用','Direct link is invalid or disabled');
		http_response_code(404);
		header('Content-Type: text/html; charset=utf-8');
		echo '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
			.'<title>404</title><style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;'
			.'background:#f6f8fb;color:#5b6472;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}'
			.'.box{text-align:center;padding:40px 56px;background:#fff;border-radius:14px;box-shadow:0 8px 30px rgba(30,50,90,.08)}'
			.'.box h2{margin:0 0 8px;font-size:20px;color:#232b38}</style></head><body><div class="box"><h2>404</h2>'
			.'<p>'.htmlspecialchars($msg,ENT_QUOTES,'UTF-8').'</p></div></body></html>';
		exit;
	}

	/**
	 * 管理页文案统一取自插件 i18n（config/i18n 同源），避免与 dl.* 词条双份维护。
	 */
	private function pageLabels(){
		$map = array(
			'title'=>'dl.page.title','desc'=>'dl.page.desc',
			'total'=>'dl.page.total','active'=>'dl.page.active','disabled'=>'dl.page.disabled',
			'search'=>'dl.page.search','all'=>'dl.page.all','refresh'=>'dl.page.refresh',
			'name'=>'dl.page.name','url'=>'dl.page.url','size'=>'dl.page.size','time'=>'dl.page.time',
			'views'=>'dl.page.views','status'=>'dl.page.status','actions'=>'dl.page.actions',
			'copy'=>'dl.page.copy','open'=>'dl.page.open','download'=>'dl.page.download',
			'delete'=>'dl.page.delete','clear'=>'dl.page.clear',
			'copied'=>'dl.tips.copied','deleted'=>'dl.page.deleted',
			'enable'=>'dl.page.enable','disable'=>'dl.page.disable','empty'=>'dl.page.empty',
			'loading'=>'dl.page.loading','prev'=>'dl.page.prev','next'=>'dl.page.next',
			'firstPage'=>'dl.page.firstPage','lastPage'=>'dl.page.lastPage',
			'onePage'=>'dl.page.onePage','pageUnit'=>'dl.page.pageUnit',
			'records'=>'dl.page.records','perPage'=>'dl.page.perPage',
			'confirmDelete'=>'dl.page.confirmDelete','confirmTitle'=>'dl.page.confirmTitle',
			'cancel'=>'dl.page.cancel','confirmDeleteInfo'=>'dl.page.confirmDeleteInfo',
			'startDate'=>'dl.page.dateStart','endDate'=>'dl.page.dateEnd','clearDate'=>'dl.page.clearDate',
			'enabled'=>'dl.page.enabled','disabledTag'=>'dl.page.disabledTag',
		);
		$labels = array();
		foreach($map as $key => $lngKey){
			$labels[$key] = LNG($lngKey);
		}
		return $labels;
	}
}
