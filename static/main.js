kodReady.push(function(){
	LNG.set(jsonDecode(urlDecode("{{LNG}}")));
	var t = function(key, def){
		return LNG[key] || def || key;
	};
	if(!window.G || !G.user || !G.user.userID) return;

	// 插件静态资源/接口前缀，供后台页面复用（与 {{pluginHost}} 保持同一来源）。
	window.__DL_PLUGIN__ = window.__DL_PLUGIN__ || {
		host:'{{pluginHost}}',
		api:'{{pluginApi}}'
	};

	// 后台菜单：存储管理 → 分享管理之后
	Events.bind('admin.leftMenu.before',function(menuList){
		if(G.user.isRoot != 1) return;
		menuList.push({
			title:t('dl.admin.menu','直链管理'),
			icon:'ri-link-m',
			link:'admin/storage/directLink',
			after:'admin/storage/share',
			fileSrc:'{{pluginHost}}static/admin/index.js?v='+time()
		});
	});

	// 顶部菜单「直链分享」：与官方插件一致，通过 main.menu.loadBefore 注册，
	// 这样菜单管理页（admin/setting/menu）可以控制显示、排序和打开方式。
	Events.bind('main.menu.loadBefore',function(listData){
		// 仅支持嵌入页面/对话框/新窗口；菜单编辑里选“当前页”时退回嵌入页面，
		// 避免把插件页当作应用内路由而跳出主界面。
		var target = '{{config.openWith}}';
		if(['inline','dialog','_blank'].indexOf(target) < 0) target = 'inline';
		listData['dl'] = {
			name:t('dl.menu.title','直链分享'),
			url:'{{pluginApi}}index',
			target:target,
			subMenu:'{{config.menuSubMenu}}' || '0',
			menuAdd:'{{config.menuAdd}}' || '1',
			icon:'ri-link-m bg-blue-6'
		};
	});

	// 仍保留 iframe 路由，兼容直接访问 #dl 的链接。
	Router.mapIframe({
		page:'dl',
		title:t('dl.menu.title','直链分享'),
		url:'{{pluginApi}}index',
		ignoreLogin:false
	});

	var apiUrl = function(method){
		return 'plugin/dl/' + method;
	};
	var csrfToken = function(){
		if(window.Cookie && Cookie.get) return Cookie.get('CSRF_TOKEN') || '';
		var match = document.cookie.match(/(?:^|;\s*)CSRF_TOKEN=([^;]+)/);
		return match ? decodeURIComponent(match[1]) : '';
	};
	// 复制文本：核心 $.copyText 在非安全上下文/权限被拒时返回 rejected Promise，
	// 这里统一兜底，避免未处理的 Promise 报错且保证提示照常出现。
	var copyText = function(text){
		var fallback = function(){
			var area = document.createElement('textarea');
			area.value = text;
			area.style.cssText = 'position:fixed;left:-9999px;top:0;';
			document.body.appendChild(area);
			area.select();
			try{ document.execCommand('copy'); }catch(e){}
			document.body.removeChild(area);
		};
		try{
			var res = $.copyText(text);
			if(res && res.catch) res.catch(fallback);
		}catch(e){
			fallback();
		}
	};
	var esc = function(str){
		return String(str == undefined ? '' : str).replace(/&/g,'&amp;').replace(/</g,'&lt;')
			.replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
	};

	// 取出当前右键/多选的文件，过滤文件夹与无读取权限的项
	var pickFiles = function(){
		var list = [],pathAction = _.get(window,'kodApp.pathAction');
		if(!pathAction) return list;
		var listSelect = pathAction.makeParamSelect() || [];
		_.each(listSelect,function(item){
			if(!item || !item.path) return;
			if(item.type == 'folder') return;
			if(item.isFolder == '1') return;
			// 服务端要求下载权限；无 canDownload 时退回读权限判断
			if(pathAction.auth){
				if(pathAction.auth.canDownload && !pathAction.auth.canDownload(item)) return;
				if(!pathAction.auth.canDownload && pathAction.auth.canRead && !pathAction.auth.canRead(item)) return;
			}
			list.push({path:item.path,name:item.name});
		});
		return list;
	};

	var dialogStyle = function(){
		$.addStyle('\
			.dl-result{max-height:320px;overflow:auto;margin:-8px -10px 0;}\
			.dl-result-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #eef1f6;}\
			.dl-result-row:last-child{border-bottom:0;}\
			.dl-result-icon{flex:0 0 30px;width:30px;height:30px;border-radius:4px;background:#e6f7ff;color:#1890ff;display:flex;align-items:center;justify-content:center;font-size:15px;}\
			.dl-result-main{flex:1;min-width:0;}\
			.dl-result-name{font-size:13px;color:#444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}\
			.dl-result-off{color:#f78e3d;font-size:12px;margin-left:6px;}\
			.dl-result-url{font-size:12px;color:#1890ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;}\
			.dl-result-fail .dl-result-url{color:#ff4d4f;}\
			.dl-result-copy{flex:0 0 auto;padding:4px 10px;border-radius:4px;border:1px solid #ddd;background:#fefefe;color:#777;font-size:12px;cursor:pointer;}\
			.dl-result-copy:hover{border-color:#1890ff;color:#1890ff;}\
			.dl-result-tip{font-size:12px;color:#888;padding:10px 12px;}\
		');
	};
	var styleReady = false;

	var renderResult = function(results){
		var html = '<div class="dl-result">';
		var successNum = 0;
		_.each(results,function(item){
			if(item.url){
				successNum ++;
				html += '<div class="dl-result-row">'
					+'<span class="dl-result-icon"><i class="ri-link-m"></i></span>'
					+'<div class="dl-result-main">'
					+'<div class="dl-result-name">'+esc(item.name)
					+(item.status === 0 ? ' <span class="dl-result-off">'+esc(t('dl.page.disabledTag','已停用'))+'</span>' : '')+'</div>'
					+'<div class="dl-result-url" data-url="'+esc(item.url)+'" title="'+esc(item.url)+'">'+esc(item.url)+'</div>'
					+'</div>'
					+'<button type="button" class="dl-result-copy" data-url="'+esc(item.url)+'">'+esc(t('dl.page.copy','复制'))+'</button>'
					+'</div>';
			}else{
				html += '<div class="dl-result-row dl-result-fail">'
					+'<span class="dl-result-icon"><i class="ri-error-warning-line"></i></span>'
					+'<div class="dl-result-main">'
					+'<div class="dl-result-name">'+esc(item.name)+'</div>'
					+'<div class="dl-result-url">'+esc(item.error || t('dl.tips.createFail','直链生成失败'))+'</div>'
					+'</div></div>';
			}
		});
		if(!successNum) html += '<div class="dl-result-tip">'+esc(t('dl.tips.createFail','直链生成失败'))+'</div>';
		html += '</div>';

		var opts = {
			id:'dl-result-dialog',
			title:t('dl.menu.get','获取直链'),
			width:'520px',
			ico:'<i class="font-icon ri-link-m"></i>',
			fixed:true,
			ok:false,
			content:html,
		};
		if(results.length > 3) opts.height = '380px';
		var dialog = $.dialog(opts);
		var $main = dialog.$main;
		$main.find('.dl-result-copy, .dl-result-url').bind('click',function(){
			var url = $(this).attr('data-url');
			if(!url) return;
			copyText(url);
			Tips.tips(t('dl.tips.copied','直链已复制'));
		});
		return dialog;
	};

	var createLinks = function(files){
		if(!files.length) return;
		var MAX_PARALLEL = 4;	// 多选时限制并发，避免一次涌出大量请求
		var loading = Tips.loading(LNG['explorer.loading'] || t('dl.page.loading','操作中...'));
		var results = [],done = 0,queue = files.slice(),active = 0;
		var finish = function(){
			Tips.close();
			if(!results.length) return;
			if(results.length == 1){
				var item = results[0];
				if(item.url){
					copyText(item.url);
					var disabled = item.status === 0;
					Tips.tips(disabled ? t('dl.tips.disabled','直链已停用') : t('dl.tips.copied','直链已复制'), disabled ? 'warning' : 'success');
				}else{
					Tips.tips(item.error || t('dl.tips.createFail','直链生成失败'),'error');
				}
				return;
			}
			if(!styleReady){ styleReady=true; dialogStyle(); }
			renderResult(results);
		};
		var next = function(){
			if(!queue.length) return;
			while(active < MAX_PARALLEL && queue.length){
				active ++;
				(function(file){
					kodApi.requestSend(apiUrl('create'),{path:file.path,CSRF_TOKEN:csrfToken()},function(result){
						var item = {name:file.name || ''};
						if(result && result.code && result.data && result.data.url){
							item.url = result.data.url;
							item.name = result.data.name || item.name;
							item.status = Number(result.data.status);
							if(result.data.exist){
								// 已存在：复用已有直链
								item.exist = true;
							}
						}else{
							item.error = (result && (result.data || result.info)) || t('dl.tips.createFail','直链生成失败');
							if(typeof item.error !== 'string') item.error = t('dl.tips.createFail','直链生成失败');
						}
						results.push(item);
						done ++;
						active --;
						if(done >= files.length) finish();
						else next();
					});
				})(queue.shift());
			}
		};
		next();
	};

	var menuShow = function(menu){
		if(!menu || !menu.$menu) return;
		if(!menu.$menu.find('.dl-get-link').exists()){
			// 插入到“下载”与“外链分享”之间；L 已被外链分享占用，快捷键改用 G
			$.contextMenu.menuAdd({
				'dl-get-link':{
					name:t('dl.menu.get','获取直链'),
					icon:'ri-link-m',
					accesskey:'g',
					className:'dl-get-link',
					callback:function(){
						createLinks(pickFiles());
					}
				}
			},menu,'.download','.share-link-file');
		}
		var files = pickFiles();
		var method = _.isEmpty(files) ? 'menuItemHide' : 'menuItemShow';
		$.contextMenu[method](menu,'dl-get-link');
	};

	Events.bind({
		'rightMenu.beforeShow@.menu-path-more':menuShow,
		'rightMenu.beforeShow@.menu-toolbar-source-more':menuShow,
		'rightMenu.beforeShow@.menu-path-guest-more':menuShow,
		'rightMenu.beforeShow@.menu-toolbar-pathDefault-more':menuShow,
		'rightMenu.beforeShow@.menu-simple-more':menuShow,
		'rightMenu.beforeShow@.menu-toolbar-userRencent-more':menuShow,
		'rightMenu.beforeShow@.menu-path-file':menuShow,
		'rightMenu.beforeShow@.menu-simple-file':menuShow,
		'rightMenu.beforeShow@.menu-path-mini-file':menuShow,
	});
});
