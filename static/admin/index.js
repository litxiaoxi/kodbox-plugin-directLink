ClassBase.define({
	init: function(param){
		this.initParentView(param);
		this.state = {
			page:1,
			pageNum:10,
			keyword:'',
			status:'',
			userID:0,
			userName:'',
			startTime:'',
			endTime:'',
			users:[],
			list:[],
			pageInfo:{},
			selected:{}
		};
		this.$('.panel-body').addClass('dl-admin-page');
		this.staticPath = window.STATIC_PATH || './static/';
		if(this.staticPath.slice(-1) !== '/') this.staticPath += '/';

		var self = this, started = false;
		var start = function(){
			if(started) return;
			started = true;
			self.render();
			self.loadList();
		};
		requireAsync([self.cssUrl()], start);
		setTimeout(start, 800); // CSS 加载异常时的兜底，避免页面不渲染
	},

	cssUrl: function(){
		var host = (window.__DL_PLUGIN__ && window.__DL_PLUGIN__.host) || './plugins/dl/';
		if(host.slice(-1) !== '/') host += '/';
		return host + 'static/admin/index.css?v=' + time();
	},

	render: function(){
		var html = ''
			+ '<div class="dl-admin-head">'
			+ '	<div class="dl-admin-title">'
			+ '		<h2>' + LNG['dl.admin.title'] + '</h2>'
			+ '		<p>' + LNG['dl.admin.desc'] + '</p>'
			+ '	</div>'
			+ '	<div class="dl-admin-stats">'
			+ '		<span class="label label-blue-light">' + LNG['dl.page.total'] + ' <b data-stat="total">0</b></span>'
			+ '		<span class="label label-green-light">' + LNG['dl.page.active'] + ' <b data-stat="active">0</b></span>'
			+ '		<span class="label label-grey-light">' + LNG['dl.page.disabled'] + ' <b data-stat="disable">0</b></span>'
			+ '	</div>'
			+ '</div>'
			+ '<div class="kodTable dl-admin-table">'
			+ '	<div class="toolbar">'
			+ '		<div class="left">'
			+ '			<div class="btn-group btn-group-segment btn-group-sm dl-admin-status">'
			+ '				<span class="btn btn-default btn-active" data-status="">' + LNG['dl.page.total'] + '</span>'
			+ '				<span class="btn btn-default" data-status="1">' + LNG['dl.page.active'] + '</span>'
			+ '				<span class="btn btn-default" data-status="0">' + LNG['dl.page.disabled'] + '</span>'
			+ '			</div>'
			+ '			<div class="dl-admin-user-filter">'
			+ '				<span class="dl-admin-user-select" title="' + LNG['dl.admin.filterUser'] + '">'
			+ '					<i class="font-icon ri-user-line"></i><em>' + LNG['dl.admin.allUser'] + '</em>'
			+ '					<i class="font-icon ri-arrow-down-s-line"></i>'
			+ '				</span>'
			+ '				<div class="dl-admin-user-dropdown hidden"></div>'
			+ '			</div>'
			+ '			<div class="dl-admin-date-range">'
			+ '				<i class="font-icon ri-calendar-line"></i>'
			+ '				<input type="date" class="dl-admin-date-start" title="' + LNG['dl.page.dateStart'] + '">'
			+ '				<span class="dl-date-sep">~</span>'
			+ '				<input type="date" class="dl-admin-date-end" title="' + LNG['dl.page.dateEnd'] + '">'
			+ '				<i class="font-icon ri-close-line dl-admin-date-clear hidden" title="' + LNG['dl.page.clearDate'] + '"></i>'
			+ '			</div>'
			+ '		</div>'
			+ '		<div class="right">'
			+ '			<div class="search-box">'
			+ '				<input type="text" class="dl-admin-keyword" autocomplete="off" spellcheck="false" placeholder="' + LNG['dl.page.search'] + '">'
			+ '				<i class="btn-close font-icon ri-close-line hidden dl-admin-clear"></i>'
			+ '				<i class="btn-search font-icon ri-search-line dl-admin-search-btn"></i>'
			+ '			</div>'
			+ '			<button type="button" class="btn btn-default dl-admin-batch hidden">'
			+ '				<i class="font-icon ri-delete-bin-line-6"></i>' + LNG['dl.admin.batchDelete'] + ' (<span>0</span>)'
			+ '			</button>'
			+ '			<button type="button" class="btn btn-default dl-admin-refresh">'
			+ '				<i class="font-icon ri-refresh-line"></i>' + LNG['dl.page.refresh']
			+ '			</button>'
			+ '		</div>'
			+ '	</div>'
			+ '	<div class="content">'
			+ '		<div class="list-table dl-admin-list-table">'
			+ '			<div class="list-row title">'
			+ '				<div class="list-col col-check"><input type="checkbox" class="kui-checkbox size-small dl-admin-check-all"></div>'
			+ '				<div class="list-col col-name">' + LNG['dl.page.name'] + '</div>'
			+ '				<div class="list-col col-url">' + LNG['dl.page.url'] + '</div>'
			+ '				<div class="list-col col-user">' + LNG['dl.admin.user'] + '</div>'
			+ '				<div class="list-col col-time">' + LNG['dl.page.time'] + '</div>'
			+ '				<div class="list-col col-views">' + LNG['dl.page.views'] + '</div>'
			+ '				<div class="list-col col-status">' + LNG['dl.page.status'] + '</div>'
			+ '				<div class="list-col setting col-act">' + LNG['dl.page.actions'] + '</div>'
			+ '			</div>'
			+ '		</div>'
			+ '		<div class="table-empty-info hidden dl-admin-empty"><span></span></div>'
			+ '		<div class="loading-msg dl-admin-loading hidden">'
			+ '			<div class="loading-mask"></div>'
			+ '			<div class="loading-msg-content">'
			+ '				<div class="loading-msg-box">'
			+ '					<img class="dl-admin-loading-img" src="' + this.staticPath + 'images/common/loading-pin3.gif" alt="">'
			+ '					<img class="dl-admin-loading-img dl-admin-loading-img-dark" src="' + this.staticPath + 'images/common/loading-pin3-dark.gif" alt="">'
			+ '					<div class="loader loader-moon"><div></div><div></div><div></div><div></div></div>'
			+ '				</div>'
			+ '				<div class="loading-msg-title">' + (LNG['explorer.loading'] || LNG['dl.page.loading']) + '</div>'
			+ '			</div>'
			+ '		</div>'
			+ '	</div>'
			+ '	<div class="footerbar mt-5 hidden dl-admin-footer">'
			+ '		<div class="list-page dl-admin-pager"></div>'
			+ '		<div class="clear"></div>'
			+ '	</div>'
			+ '</div>';
		this.$('.panel-body').html(html);
		this.bindEvents();
	},

	bindEvents: function(){
		var self = this;
		var $keyword = this.$('.dl-admin-keyword');
		var $clear = this.$('.dl-admin-clear');

		var doSearch = function(){
			self.state.keyword = $keyword.val().trim();
			self.state.page = 1;
			self.loadList();
		};
		$keyword.bind('input', function(){
			clearTimeout(self._keywordTimer);
			$clear.toggleClass('hidden', !$keyword.val());
			self._keywordTimer = setTimeout(doSearch, 320);
		}).bind('keydown', function(e){
			if(e.key == 'Enter'){
				clearTimeout(self._keywordTimer);
				doSearch();
			}
		});
		$clear.bind('click', function(){
			$keyword.val('');
			$clear.addClass('hidden');
			doSearch();
		});
		this.$('.dl-admin-search-btn').bind('click', function(){
			clearTimeout(self._keywordTimer);
			doSearch();
		});

		this.$('.dl-admin-status').delegate('.btn', 'click', function(){
			self.$('.dl-admin-status .btn').removeClass('btn-active');
			$(this).addClass('btn-active');
			self.state.status = $(this).attr('data-status');
			self.state.page = 1;
			self.loadList();
		});
		this.$('.dl-admin-refresh').bind('click', function(){ self.loadList(); });

		// 用户筛选下拉
		this.$('.dl-admin-user-select').bind('click', function(e){
			e.stopPropagation();
			self.$('.dl-admin-user-dropdown').toggleClass('hidden');
		});
		this.$('.dl-admin-user-dropdown').delegate('.dl-admin-user-option', 'click', function(e){
			e.stopPropagation();
			self.applyUserFilter(Number($(this).attr('data-id')), $(this).attr('data-name') || '');
			self.$('.dl-admin-user-dropdown').addClass('hidden');
		});
		$(document).bind('click.dlAdmin', function(){
			self.$('.dl-admin-user-dropdown').addClass('hidden');
		});
		// 离开管理页时解绑文档级事件，避免页面销毁后仍被触发
		this.bind('onRemove', function(){ $(document).unbind('click.dlAdmin'); });

		// 日期筛选
		var dateStart = this.$('.dl-admin-date-start'), dateEnd = this.$('.dl-admin-date-end');
		var dateClear = this.$('.dl-admin-date-clear');
		var applyDate = function(){
			self.state.startTime = dateStart.val() || '';
			self.state.endTime = dateEnd.val() || '';
			dateClear.toggleClass('hidden', !self.state.startTime && !self.state.endTime);
			self.state.page = 1;
			self.loadList();
		};
		dateStart.bind('change', applyDate);
		dateEnd.bind('change', applyDate);
		dateClear.bind('click', function(){
			dateStart.val('');
			dateEnd.val('');
			applyDate();
		});
		this.$('.dl-admin-batch').bind('click', function(){ self.batchRemove(); });
		this.$('.dl-admin-check-all').bind('change', function(){
			var checked = $(this).prop('checked');
			self.$('.dl-admin-check').each(function(){
				$(this).prop('checked', checked);
				var id = $(this).attr('data-id');
				if(checked){ self.state.selected[id] = true; }else{ delete self.state.selected[id]; }
			});
			self.updateSelected();
		});
		this.$('.panel-body').delegate('.dl-admin-check', 'change', function(){
			var id = $(this).attr('data-id');
			if($(this).prop('checked')){ self.state.selected[id] = true; }else{ delete self.state.selected[id]; }
			self.updateSelected();
		});
		this.$('.panel-body').delegate('.dl-admin-copy', 'click', function(){
			var url = $(this).attr('data-url');
			copyText(url);
			Tips.tips(LNG['dl.tips.copied']);
		});
		this.$('.panel-body').delegate('.dl-admin-toggle', 'change', function(){
			var $btn = $(this);
			var on = $btn.prop('checked');
			self.setStatus(Number($btn.attr('data-id')), on ? 1 : 0);
		});
		this.$('.panel-body').delegate('.dl-admin-remove', 'click', function(){
			var id = Number($(this).attr('data-id'));
			var name = $(this).attr('data-name') || '';
			var content = '<h5>' + esc(LNG['dl.page.confirmDeleteInfo']) + '</h5>' + esc(name);
			$.dialog.confirm(content, function(){
				self.remove([id]);
			}, false, LNG['common.delete'] || LNG['dl.page.delete']);
		});
		this.$('.panel-body').delegate('.dl-admin-user', 'click', function(){
			self.applyUserFilter(Number($(this).attr('data-id')), $(this).attr('data-name') || '');
		});
		this.$('.panel-body').delegate('.dl-open-location', 'click', function(){
			self.openLocation($(this).attr('data-path'));
		});
	},

	/**
	 * 打开文件所在位置（不是打开文件）：
	 * 与官方分享管理页一致，在资源管理器弹窗中定位并选中该文件。
	 */
	openLocation: function(path){
		if(!path) return;
		var self = this;
		if(this.explorer){
			try{
				this.explorer.pathAction.openFatherSelect(path);
				if(this.explorer.$el && this.explorer.$el.flash) this.explorer.$el.flash();
				return;
			}catch(e){ this.explorer = null; }
		}
		var Dialog = window.kodApi && window.kodApi.explorer;
		if(Dialog){
			this.explorer = new Dialog({
				pathFile: path,
				closeBefore: function(){ self.explorer = null; }
			});
			return;
		}
		var action = window.kodApp && window.kodApp.pathAction;
		if(action && typeof action.openFatherSelect === 'function') action.openFatherSelect(path);
	},

	loadList: function(){
		var self = this, s = this.state;
		this.$('.dl-admin-loading').removeClass('hidden');
		this.$('.dl-admin-empty').addClass('hidden');
		var params = {page:s.page, pageNum:s.pageNum};
		if(s.keyword) params.keyword = s.keyword;
		if(s.status !== '') params.status = s.status;
		if(s.userID) params.userID = s.userID;
		if(s.startTime) params.startTime = s.startTime;
		if(s.endTime) params.endTime = s.endTime;
		kodApi.requestSend('plugin/dl/adminList', params, function(result){
			self.$('.dl-admin-loading').addClass('hidden');
			if(!result || !result.code){
				Tips.tips(result && result.data ? result.data : LNG['dl.page.empty'], 'error');
				return;
			}
			var data = result.data || {};
			s.list = data.list || [];
			s.pageInfo = data.pageInfo || {};
			s.selected = {};
			self.$('.dl-admin-check-all').prop('checked', false);
			self.renderStats(data.stats || {});
			self.renderUsers(data.users || [], data.stats || {});
			self.renderList();
		});
	},

	renderStats: function(stats){
		this.$('[data-stat="total"]').text(Number(stats.total || 0));
		this.$('[data-stat="active"]').text(Number(stats.active || 0));
		this.$('[data-stat="disable"]').text(Number(stats.disable || 0));
	},

	/**
	 * 用户筛选下拉：全部用户 + 有直链的用户（头像、名称、数量）
	 */
	renderUsers: function(users, stats){
		this.state.users = users || [];
		var s = this.state;
		var total = Number(stats.total || 0);
		var html = '<div class="dl-admin-user-option' + (!s.userID ? ' active' : '') + '" data-id="0" data-name="">'
			+ '<span class="dl-avatar is-all"><i class="font-icon ri-group-line"></i></span>'
			+ '<span class="dl-admin-user-option-name">' + LNG['dl.admin.allUser'] + '</span>'
			+ '<em>' + total + '</em></div>';
		for(var i = 0; i < this.state.users.length; i ++){
			var u = this.state.users[i];
			var name = u.nickName || u.name || ('#' + u.userID);
			html += '<div class="dl-admin-user-option' + (Number(u.userID) === Number(s.userID) ? ' active' : '') + '"'
				+ ' data-id="' + Number(u.userID) + '" data-name="' + esc(name) + '">'
				+ avatarHtml(u.avatar)
				+ '<span class="dl-admin-user-option-name">' + esc(name) + '</span>'
				+ '<em>' + Number(u.num || 0) + '</em></div>';
		}
		this.$('.dl-admin-user-dropdown').html(html);
		this.updateUserLabel();
	},

	updateUserLabel: function(){
		var s = this.state;
		var name = s.userID ? (s.userName || ('#' + s.userID)) : LNG['dl.admin.allUser'];
		this.$('.dl-admin-user-select em').text(name);
		this.$('.dl-admin-user-select').toggleClass('is-active', !!s.userID);
	},

	applyUserFilter: function(userID, userName){
		this.state.userID = userID || 0;
		this.state.userName = userName || '';
		this.state.page = 1;
		this.updateUserLabel();
		this.$('.dl-admin-user-dropdown .dl-admin-user-option').each(function(){
			$(this).toggleClass('active', Number($(this).attr('data-id')) === Number(userID));
		});
		this.loadList();
	},

	renderList: function(){
		var s = this.state, table = this.$('.dl-admin-list-table');
		table.find('.row-content').remove();

		var html = '';
		for(var i = 0; i < s.list.length; i ++){
			var item = s.list[i];
			var on = Number(item.status) == 1;
			var userInfo = item.userInfo || {};
			var userName = userInfo.nickName || userInfo.name || ('#' + item.userID);
			var url = String(item.url || '');
			var cover = item.cover
				? '<img src="' + esc(item.cover) + '" alt="" loading="lazy" onerror="this.remove()">'
				: '';
			var path = String(item.path || '');
			html += '<div class="list-row row-content" data-id="' + Number(item.id) + '">'
				+ '<div class="list-col col-check"><input type="checkbox" class="kui-checkbox size-small dl-admin-check" data-id="' + Number(item.id) + '"></div>'
				+ '<div class="list-col col-name"><div class="dl-file-cell">'
				+ '<span class="dl-file-thumb dl-open-location" data-path="' + esc(path) + '" title="' + esc(item.name) + '"><i class="font-icon ' + fileIcon(item.ext) + '"></i>' + cover + '</span>'
				+ '<div class="dl-file-main">'
				+ '<span class="dl-admin-file-name dl-open-location" data-path="' + esc(path) + '" title="' + esc(item.name) + '">' + esc(item.name || '--') + '</span>'
				+ '</div></div></div>'
				+ '<div class="list-col col-url"><div class="dl-url-wrap">'
				+ '<a href="' + esc(url) + '" target="_blank" rel="noopener" title="' + esc(url) + '">' + esc(url) + '</a>'
				+ '<i class="do-action font-icon ri-file-copy-line dl-admin-copy" data-url="' + esc(url) + '" title="' + LNG['dl.page.copy'] + '"></i>'
				+ '</div></div>'
				+ '<div class="list-col col-user"><span class="dl-admin-user" data-id="' + Number(item.userID) + '" data-name="' + esc(userName) + '" title="' + esc(userName) + '">'
				+ avatarHtml(userInfo.avatar) + '<span class="dl-admin-user-name">' + esc(userName) + '</span></span></div>'
				+ '<div class="list-col col-time"><span class="dl-admin-meta">' + esc(formatTime(item.createTime)) + '</span></div>'
				+ '<div class="list-col col-views"><span class="dl-admin-meta"><b>' + Number(item.numView || 0) + '</b> / ' + Number(item.numDownload || 0) + '</span></div>'
				+ '<div class="list-col col-status"><label>'
				+ '<input type="checkbox" class="kui-checkbox-ios size-small dl-admin-toggle" data-id="' + Number(item.id) + '"'
				+ (on ? ' checked' : '') + ' title="' + esc(on ? LNG['dl.page.disable'] : LNG['dl.page.enable']) + '"><em></em>'
				+ '</label></div>'
				+ '<div class="list-col setting col-act">'
				+ '<i class="do-action font-icon ri-file-copy-line dl-admin-copy" data-url="' + esc(url) + '" title="' + LNG['dl.page.copy'] + '"></i>'
				+ '<a class="do-action font-icon ri-external-link-line" href="' + esc(url) + '" target="_blank" rel="noopener" title="' + LNG['dl.page.open'] + '"></a>'
				+ '<i class="do-action font-icon ri-delete-bin-line-6 dl-admin-remove" data-id="' + Number(item.id) + '" data-name="' + esc(item.name || '') + '" title="' + LNG['dl.page.delete'] + '"></i>'
				+ '</div></div>';
		}
		if(html) table.append(html);

		var isEmpty = !s.list.length;
		var $empty = this.$('.dl-admin-empty');
		$empty.toggleClass('hidden', !isEmpty);
		if(isEmpty) $empty.find('span').text(LNG['dl.page.empty']);
		this.$('.dl-admin-check-all').prop('checked', false);

		this.renderPager(Number(s.pageInfo.pageTotal || 0));
		this.updateSelected();
	},

	renderPager: function(pageTotal){
		var self = this, s = this.state;
		var $bar = this.$('.dl-admin-footer');
		var $pager = this.$('.dl-admin-pager');
		var totalNum = Number(s.pageInfo.totalNum || 0);
		if(!totalNum){
			$pager.html('');
			$bar.addClass('hidden');
			return;
		}
		$bar.removeClass('hidden');
		pageTotal = Math.max(1, Number(pageTotal) || 1);
		// 删除末页数据后自动回退到有效页
		if(s.page > pageTotal){
			s.page = pageTotal;
			this.loadList();
			return;
		}

		// 复用官方分页组件（与 #admin/storage/share 一致）：
		// 固定 5 个页码、页码跳转输入框、每页条数下拉。
		$pager.pageBox({
			totalNum: totalNum,
			pageTotal: pageTotal,
			pageShow: 5,
			pageCurrent: s.page,
			pageSize: s.pageNum,
			// 与服务端 pageNum 上限（100）保持一致
			pageSizeArray: [10,20,50,100],
			callback: function(page, pageSize){
				var oldPage = s.page, oldSize = s.pageNum;
				pageSize = Number(pageSize) || oldSize;
				page = pageSize === oldSize ? (Number(page) || 1) : 1;
				page = Math.min(Math.max(1, page), pageTotal);
				if(page === oldPage && pageSize === oldSize) return;
				s.page = page;
				s.pageNum = pageSize;
				self.loadList();
			}
		});
	},

	updateSelected: function(){
		var count = 0, s = this.state;
		for(var k in s.selected){ if(s.selected.hasOwnProperty(k)) count ++; }
		this.$('.dl-admin-batch').toggleClass('hidden', !count);
		this.$('.dl-admin-batch span').text(count);
	},

	setStatus: function(id, status){
		var self = this;
		kodApi.requestSend('plugin/dl/adminSetStatus', {id:id, status:status, CSRF_TOKEN:csrfToken()}, function(result){
			if(result && result.code){
				self.loadList();
			}else{
				Tips.tips(result && result.data ? result.data : LNG['dl.page.empty'], 'error');
				self.loadList();
			}
		});
	},

	remove: function(ids){
		var self = this;
		kodApi.requestSend('plugin/dl/adminRemove', {ids:ids.join(','), CSRF_TOKEN:csrfToken()}, function(result){
			if(result && result.code){
				Tips.tips(LNG['explorer.success']);
				self.state.selected = {};
				self.loadList();
			}else{
				Tips.tips(result && result.data ? result.data : LNG['dl.page.empty'], 'error');
			}
		});
	},

	batchRemove: function(){
		var self = this, ids = [], names = [];
		for(var k in this.state.selected){
			if(!this.state.selected.hasOwnProperty(k)) continue;
			ids.push(Number(k));
			for(var i = 0; i < this.state.list.length; i ++){
				if(Number(this.state.list[i].id) === Number(k)){
					names.push(this.state.list[i].name || '');
					break;
				}
			}
		}
		if(!ids.length) return;
		var tip = names.length > 1
			? esc(names[0]) + '... <span class="label label-warning border-circle">' + ids.length + LNG['dl.admin.items'] + '</span>'
			: esc(names[0] || '');
		var content = '<h5>' + esc(LNG['dl.admin.confirmDel']) + '</h5>' + tip;
		$.dialog.confirm(content, function(){
			self.remove(ids);
		}, false, LNG['common.delete'] || LNG['dl.page.delete']);
	},
});

function csrfToken(){
	var match = document.cookie.match(/(?:^|;\s*)CSRF_TOKEN=([^;]+)/);
	return match ? decodeURIComponent(match[1]) : '';
}

// 核心 $.copyText 在非安全上下文/权限被拒时返回 rejected Promise，统一兜底
function copyText(text){
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
}

function esc(str){
	return String(str == undefined ? '' : str)
		.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
		.replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function avatarHtml(avatar){
	return '<span class="dl-avatar">'
		+ (avatar ? '<img src="' + esc(avatar) + '" alt="" loading="lazy" onerror="this.remove()">' : '')
		+ '<i class="font-icon ri-user-line"></i></span>';
}

function fileIcon(ext){
	ext = String(ext || '').toLowerCase();
	if(['jpg','jpeg','png','gif','webp','bmp','avif','heic','heif','svg','ico'].indexOf(ext) >= 0) return 'ri-image-line';
	if(['mp4','mov','m4v','avi','mkv','wmv','flv','webm','mpg','mpeg','3gp','rmvb','rm'].indexOf(ext) >= 0) return 'ri-movie-line';
	if(['mp3','wav','flac','aac','ogg','m4a','wma','ape'].indexOf(ext) >= 0) return 'ri-music-line';
	if(ext === 'pdf') return 'ri-file-pdf-line';
	if(ext === 'doc' || ext === 'docx') return 'ri-file-word-line';
	if(ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'ri-file-excel-line';
	if(ext === 'ppt' || ext === 'pptx') return 'ri-file-ppt-line';
	if(['zip','rar','7z','tar','gz','bz2','xz'].indexOf(ext) >= 0) return 'ri-file-zip-line';
	if(['txt','md','log','json','xml','ini','conf'].indexOf(ext) >= 0) return 'ri-file-text-line';
	if(['html','htm','js','css','php','py','java','c','cpp','sh'].indexOf(ext) >= 0) return 'ri-file-code-line';
	return 'ri-file-line';
}

function pad(n){ return n < 10 ? '0' + n : '' + n; }

function formatTime(sec){
	if(!sec) return '--';
	var d = new Date(sec * 1000);
	return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate())
		+ ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}