(function(){
	var B = window.__DL__ || {};
	var T = B.t || {};
	var state = {
		page:1,
		pageNum:10,
		keyword:'',
		status:'',
		startTime:'',
		endTime:'',
		total:0,
		pageTotal:1
	};
	// 与服务端 pageNum 上限（100）保持一致
	var PAGE_SIZE_ARRAY = [10,20,50,100];
	var PAGE_SHOW = 5;
	var $ = function(id){ return document.getElementById(id); };

	function t(key, def){ return T[key] || def || key; }
	function esc(str){
		return String(str == undefined ? '' : str)
			.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
			.replace(/"/g,'&quot;').replace(/'/g,'&#39;');
	}
	function pad(n){ return n < 10 ? '0' + n : '' + n; }
	function formatTime(sec){
		if(!sec) return '--';
		var d = new Date(sec * 1000);
		return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate())
			+ ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
	}
	function formatSize(size){
		size = Number(size) || 0;
		if(size <= 0) return '0 B';
		var units = ['B','KB','MB','GB','TB','PB'];
		var i = Math.floor(Math.log(size) / Math.log(1024));
		i = i < 0 ? 0 : (i >= units.length ? units.length - 1 : i);
		var val = size / Math.pow(1024, i);
		return (i === 0 ? val : val.toFixed(val >= 100 ? 0 : 1)) + ' ' + units[i];
	}
	function querify(obj){
		var parts = [];
		for(var k in obj){
			if(!obj.hasOwnProperty(k)) continue;
			if(obj[k] === undefined || obj[k] === null || obj[k] === '') continue;
			parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(obj[k])));
		}
		return parts.join('&');
	}
	function apiUrl(method, params){
		var base = String(B.api || 'plugin/dl').replace(/\/+$/,'') + '/' + method;
		var qs = params ? querify(params) : '';
		if(!qs) return base;
		return base + (base.indexOf('?') >= 0 ? '&' : '?') + qs;
	}
	function withQuery(url, key, value){
		return url + (url.indexOf('?') >= 0 ? '&' : '?') + key + '=' + value;
	}

	var toastTimer = false;
	function toast(msg, isError){
		var box = $('dl-toast');
		box.textContent = msg;
		box.className = 'dl-toast is-show' + (isError ? ' is-error' : '');
		clearTimeout(toastTimer);
		toastTimer = setTimeout(function(){ box.className = 'dl-toast'; }, 2400);
	}

	function applyLabels(){
		var nodes = document.querySelectorAll('[data-t]');
		for(var i = 0; i < nodes.length; i ++){
			var key = nodes[i].getAttribute('data-t');
			if(T[key]) nodes[i].textContent = T[key];
		}
		var inputs = document.querySelectorAll('[data-t-placeholder]');
		for(var j = 0; j < inputs.length; j ++){
			var pkey = inputs[j].getAttribute('data-t-placeholder');
			if(T[pkey]) inputs[j].setAttribute('placeholder', T[pkey]);
		}
		var titles = document.querySelectorAll('[data-t-title]');
		for(var m = 0; m < titles.length; m ++){
			var tkey = titles[m].getAttribute('data-t-title');
			if(T[tkey]) titles[m].setAttribute('title', T[tkey]);
		}
		document.title = T.title || 'Direct Links';
	}

	function setLoading(loading){
		$('dl-loading').className = 'loading-msg dl-loading' + (loading ? '' : ' hidden');
		if(loading) $('dl-empty').className = 'table-empty-info hidden';
	}

	function renderStats(data){
		var total = Number(data.total || 0);
		var active = Number(data.active || 0);
		$('stat-total').textContent = total;
		$('stat-active').textContent = active;
		$('stat-disabled').textContent = Math.max(0, total - active);
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

	function renderRow(item){
		var on = Number(item.status) === 1;
		var url = String(item.url || '');
		var ext = String(item.ext || '').toLowerCase();
		var cover = item.cover
			? '<img src="' + esc(item.cover) + '" alt="" loading="lazy" onerror="this.remove()">'
			: '';
		var path = String(item.path || '');
		return '<div class="list-row row-content" data-id="' + Number(item.id) + '">'
			+ '<div class="list-col col-name">'
			+ '<div class="dl-file-cell">'
			+ '<span class="dl-file-thumb dl-open-location" data-path="' + esc(path) + '" title="' + esc(item.name) + '"><i class="font-icon ' + fileIcon(ext) + '"></i>' + cover + '</span>'
			+ '<span class="dl-file-name dl-open-location" data-path="' + esc(path) + '" title="' + esc(item.name) + '">' + esc(item.name || '--') + '</span>'
			+ '</div>'
			+ '</div>'
			+ '<div class="list-col col-url"><div class="dl-url-wrap">'
			+ '<a href="' + esc(url) + '" target="_blank" rel="noopener" title="' + esc(url) + '">' + esc(url) + '</a>'
			+ '<i class="do-action font-icon ri-file-copy-line dl-copy" data-url="' + esc(url) + '" title="' + esc(t('copy')) + '"></i>'
			+ '</div></div>'
			+ '<div class="list-col col-size"><span class="dl-meta">' + esc(formatSize(item.size)) + '</span></div>'
			+ '<div class="list-col col-time"><span class="dl-meta">' + esc(formatTime(item.createTime)) + '</span></div>'
			+ '<div class="list-col col-views"><span class="dl-meta"><b>' + Number(item.numView || 0) + '</b> / ' + Number(item.numDownload || 0) + '</span></div>'
			+ '<div class="list-col col-status"><label>'
			+ '<input type="checkbox" class="kui-checkbox-ios size-small dl-toggle" data-id="' + Number(item.id) + '"'
			+ (on ? ' checked' : '') + ' title="' + esc(on ? t('disable') : t('enable')) + '"><em></em>'
			+ '</label></div>'
			+ '<div class="list-col setting col-actions">'
			+ '<i class="do-action font-icon ri-file-copy-line dl-copy" data-url="' + esc(url) + '" title="' + esc(t('copy')) + '"></i>'
			+ '<a class="do-action font-icon ri-external-link-line" href="' + esc(url) + '" target="_blank" rel="noopener" title="' + esc(t('open')) + '"></a>'
			+ '<a class="do-action font-icon ri-download-line" href="' + esc(withQuery(url,'download',1)) + '" target="_blank" rel="noopener" title="' + esc(t('download')) + '"></a>'
			+ '<i class="do-action font-icon ri-delete-bin-line-6 dl-remove" data-id="' + Number(item.id) + '" data-name="' + esc(item.name || '') + '" title="' + esc(t('delete')) + '"></i>'
			+ '</div></div>';
	}

	/* 分页：结构与官方 $.fn.pageBox 保持一致（页码窗口、当前页输入、每页条数），
	   iframe 未加载 vendor.js，这里按同一套 DOM/CSS 复刻。 */
	function renderPager(pageTotal){
		var box = $('dl-pager');
		var footer = $('dl-footerbar');
		var total = Number(state.total || 0);
		pageTotal = Math.max(1, Number(pageTotal) || 1);
		state.pageTotal = pageTotal;
		if(!total){
			box.innerHTML = '';
			footer.className = 'footerbar mt-5 hidden';
			return;
		}
		footer.className = 'footerbar mt-5';
		// 删除末页数据后自动回退到有效页
		if(state.page > pageTotal){
			state.page = pageTotal;
			loadList();
			return;
		}

		var page = Math.min(Math.max(1, state.page), pageTotal);
		var start = Math.max(1, page - 2);
		var end = Math.min(pageTotal, start + PAGE_SHOW - 1);
		start = Math.max(1, end - PAGE_SHOW + 1);

		var pages = '';
		for(var i = start; i <= end; i ++){
			pages += '<li class="page-' + i + (i === page ? ' active' : '') + '" data-page="' + i + '">'
				+ '<span class="num-' + String(i).length + '">' + i + '</span></li>';
		}
		var itemWidth = 30;
		var coverWidth = itemWidth * (end - start + 1);
		var listWidth = itemWidth * pageTotal;
		var activeLeft = (page - start) * itemWidth;
		var onePage = pageTotal <= 1;

		var options = '';
		for(var n = 0; n < PAGE_SIZE_ARRAY.length; n ++){
			var size = PAGE_SIZE_ARRAY[n];
			options += '<option value="' + size + '"' + (size === state.pageNum ? ' selected' : '') + '>'
				+ size + ' ' + esc(t('perPage', '条/页')) + '</option>';
		}
		var records = total + ' ' + esc(t('records', '条记录'));
		var infoText = onePage
			? t('onePage', '共1页') + ' <span class="grey-6">(' + records + ')</span>'
			: '/ ' + pageTotal + t('pageUnit', '页') + ' <span class="grey-6">(' + records + ')</span>';

		var icon = function(name, title){
			return '<i class="font-icon ' + name + '" title-timeout="100" title="' + esc(title) + '"></i>';
		};
		box.innerHTML = '<div class="my-page-box' + (onePage ? ' data-only-one-page' : '') + '" data-page-total="' + pageTotal + '">'
			+ '<div class="page-content">'
			+ '<div class="page-to at-first' + (page <= 1 ? ' disable' : '') + '" data-page="first">' + icon('ri-skip-back-mini-fill', t('firstPage', '首页')) + '</div>'
			+ '<div class="page-to' + (page <= 1 ? ' disable' : '') + '" data-page="prev">' + icon('ri-arrow-left-s-line', t('prev', '上一页')) + '</div>'
			+ '<div class="page-cover" style="width:' + coverWidth + 'px">'
			+ '<ul style="width:' + listWidth + 'px;left:0">'
			+ '<div class="page-active-bg" style="left:' + activeLeft + 'px"></div>'
			+ '<div class="ul-items">' + pages + '</div>'
			+ '</ul></div>'
			+ '<div class="page-to' + (page >= pageTotal ? ' disable' : '') + '" data-page="next">' + icon('ri-arrow-right-s-line', t('next', '下一页')) + '</div>'
			+ '<div class="page-to at-last' + (page >= pageTotal ? ' disable' : '') + '" data-page="last">' + icon('ri-skip-forward-mini-fill', t('lastPage', '尾页')) + '</div>'
			+ '<div class="clear"></div>'
			+ '</div>'
			+ '<div class="page-info">'
			+ '<input type="text" value="' + page + '">'
			+ '<span class="page-info-text">' + infoText + '</span>'
			+ '</div>'
			+ '<div class="page-select">'
			+ '<select>' + options + '</select>'
			+ '<i class="select-icon font-icon ri-arrow-up-down-line"></i>'
			+ '</div>'
			+ '<div class="clear"></div>'
			+ '</div>';
	}

	function gotoPage(page){
		var pageTotal = Math.max(1, Number(state.pageTotal || 1));
		page = Math.min(Math.max(1, Number(page) || 1), pageTotal);
		if(page === state.page) { renderPager(pageTotal); return; }
		state.page = page;
		loadList();
	}

	function renderList(data){
		var list = (data && data.list) || [];
		var pageInfo = (data && data.pageInfo) || {};
		var totalNum = Number(pageInfo.totalNum != undefined ? pageInfo.totalNum
			: ((data && data.stats && data.stats.total) || 0));
		var pageTotal = Number(pageInfo.pageTotal || 0);
		state.total = totalNum;

		var table = $('dl-list');
		var rows = table.querySelectorAll('.row-content');
		for(var r = 0; r < rows.length; r ++) table.removeChild(rows[r]);

		var html = '';
		for(var i = 0; i < list.length; i ++) html += renderRow(list[i]);
		if(html) table.insertAdjacentHTML('beforeend', html);

		var isEmpty = !list.length;
		var emptyBox = $('dl-empty');
		emptyBox.className = 'table-empty-info' + (isEmpty ? '' : ' hidden');
		if(isEmpty) emptyBox.querySelector('span').textContent = t('empty');

		renderPager(pageTotal);
	}

	function csrfToken(){
		var match = document.cookie.match(/(?:^|;\s*)CSRF_TOKEN=([^;]+)/);
		return match ? decodeURIComponent(match[1]) : '';
	}

	function request(method, params, callback, isPost){
		params = params || {};
		// 插件接口在核心 CSRF 过滤器白名单内，状态变更接口由插件自行校验 token
		if(isPost) params.CSRF_TOKEN = csrfToken();
		var url = apiUrl(method, isPost ? null : params);
		var opts = {method: isPost ? 'POST' : 'GET', credentials:'same-origin'};
		if(isPost){
			opts.headers = {'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'};
			opts.body = querify(params || {});
		}
		fetch(url, opts).then(function(res){
			return res.json();
		}).then(function(result){
			callback(result || {});
		}).catch(function(){
			callback({code:false, data:t('loading')});
		});
	}

	function loadList(){
		setLoading(true);
		var params = {page:state.page, pageNum:state.pageNum};
		if(state.keyword) params.keyword = state.keyword;
		if(state.status !== '') params.status = state.status;
		if(state.startTime) params.startTime = state.startTime;
		if(state.endTime) params.endTime = state.endTime;
		request('list', params, function(result){
			setLoading(false);
			if(!result || result.code !== true){
				renderList({list:[],pageInfo:{}});
				var msg = typeof result.data === 'string' && result.data ? result.data : t('empty');
				var emptyBox = $('dl-empty');
				emptyBox.className = 'table-empty-info';
				emptyBox.querySelector('span').textContent = msg;
				return;
			}
			var data = result.data || {};
			renderStats(data.stats || {});
			renderList(data);
		}, false);
	}

	function setStatus(id, status){
		request('setStatus', {id:id, status:status}, function(result){
			if(result && result.code === true){
				loadList();
			}else{
				toast(typeof result.data === 'string' ? result.data : t('loading'), true);
				loadList();
			}
		}, true);
	}

	/* 与文件删除一致的确认弹窗（复用核心 artDialog 的 .aui-* 结构） */
	function confirmDialog(content, onOk, okText){
		var mask = document.createElement('div');
		mask.className = 'dl-confirm-mask';
		mask.innerHTML = '<div class="dl-confirm-box Confirm artDialog dialog-confirm-box confirm-warning aui-state-focus">'
			+ '<div class="aui-outer">'
			+ '<table class="aui-dialog"><tbody>'
			+ '<tr><td colspan="2" class="aui-header"><div class="aui-title-bar">'
			+ '<div class="aui-title">' + esc(t('confirmTitle', '提示')) + '</div>'
			+ '<div class="aui-btn-box"><a class="aui-close"></a></div>'
			+ '</div></td></tr>'
			+ '<tr><td class="aui-icon"><div class="aui-icon-bg"></div></td>'
			+ '<td class="aui-main"><div class="aui-content">' + content + '</div></td></tr>'
			+ '<tr><td colspan="2" class="aui-footer"><div class="aui-buttons">'
			+ '<button type="button" class="aui-state-highlight">' + esc(okText || t('delete')) + '</button>'
			+ '<button type="button" class="dl-cancel">' + esc(t('cancel', '取消')) + '</button>'
			+ '</div></td></tr>'
			+ '</tbody></table></div></div>';
		var icon = mask.querySelector('.aui-icon-bg');
		if(icon && B.static){
			icon.style.backgroundImage = 'url("' + B.static + 'app/vender/artDialog-icon/question.png")';
			icon.style.backgroundRepeat = 'no-repeat';
			icon.style.backgroundPosition = 'center center';
		}
		var close = function(){ if(mask.parentNode) mask.parentNode.removeChild(mask); document.removeEventListener('keydown', onKey); };
		var onKey = function(e){ if(e.key === 'Escape') close(); };
		mask.querySelector('.aui-close').addEventListener('click', close);
		mask.querySelector('.dl-cancel').addEventListener('click', close);
		mask.querySelector('.aui-state-highlight').addEventListener('click', function(){
			close();
			if(typeof onOk === 'function') onOk();
		});
		document.addEventListener('keydown', onKey);
		document.body.appendChild(mask);
	}

	function removeItem(id, name){
		var content = '<h5>' + esc(t('confirmDeleteInfo', '删除后，访客将无法通过该直链访问文件')) + '</h5>'
			+ '<span class="dl-confirm-file">' + esc(name || '') + '</span>';
		confirmDialog(content, function(){
			request('remove', {id:id}, function(result){
				if(result && result.code === true){
					toast(t('deleted'));
					loadList();
				}else{
					toast(typeof result.data === 'string' ? result.data : t('loading'), true);
				}
			}, true);
		}, t('delete'));
	}

	function copyUrl(url){
		if(!url) return;
		var done = function(){ toast(t('copied', '已复制')); };
		if(navigator.clipboard && navigator.clipboard.writeText){
			navigator.clipboard.writeText(url).then(done).catch(function(){
				legacyCopy(url); done();
			});
			return;
		}
		legacyCopy(url); done();
	}
	function legacyCopy(text){
		var area = document.createElement('textarea');
		area.value = text;
		area.style.cssText = 'position:fixed;left:-9999px;top:0;';
		document.body.appendChild(area);
		area.select();
		try{ document.execCommand('copy'); }catch(e){}
		document.body.removeChild(area);
	}

	/* 打开文件所在位置（不是打开文件）：与官方分享管理页一致，
	   在主界面弹出资源管理器并定位、选中该文件 */
	var locationDialog = null;
	function openLocation(path){
		if(!path) return;
		var parentWin = null;
		try{
			if(window.parent && window.parent !== window) parentWin = window.parent;
		}catch(e){}
		var Dialog = (parentWin && parentWin.kodApi && parentWin.kodApi.explorer) || null;
		if(Dialog){
			if(locationDialog){
				try{
					locationDialog.pathAction.openFatherSelect(path);
					if(locationDialog.$el && locationDialog.$el.flash) locationDialog.$el.flash();
					return;
				}catch(e){ locationDialog = null; }
			}
			locationDialog = new Dialog({
				pathFile: path,
				closeBefore: function(){ locationDialog = null; }
			});
			return;
		}
		var action = parentWin && parentWin.kodApp && parentWin.kodApp.pathAction;
		if(action && typeof action.openFatherSelect === 'function'){
			action.openFatherSelect(path);
		}
	}

	function setActiveSegment(btn){
		var seg = $('dl-status');
		var buttons = seg.querySelectorAll('.btn');
		for(var i = 0; i < buttons.length; i ++){
			if(buttons[i] === btn) buttons[i].classList.add('btn-active');
			else buttons[i].classList.remove('btn-active');
		}
	}

	function bindEvents(){
		var keyword = $('dl-keyword');
		var clearBtn = $('dl-clear');

		var doSearch = function(){
			state.keyword = keyword.value.trim();
			state.page = 1;
			loadList();
		};
		keyword.addEventListener('input', function(){
			clearTimeout(keyword._timer);
			clearBtn.classList.toggle('hidden', !keyword.value);
			keyword._timer = setTimeout(doSearch, 320);
		});
		keyword.addEventListener('keydown', function(e){
			if(e.key === 'Enter'){
				clearTimeout(keyword._timer);
				doSearch();
			}
		});
		clearBtn.addEventListener('click', function(){
			keyword.value = '';
			clearBtn.classList.add('hidden');
			doSearch();
		});
		$('dl-search').addEventListener('click', function(){
			clearTimeout(keyword._timer);
			doSearch();
		});

		$('dl-status').addEventListener('click', function(e){
			var btn = e.target.closest('.btn');
			if(!btn) return;
			setActiveSegment(btn);
			state.status = btn.getAttribute('data-status');
			state.page = 1;
			loadList();
		});
		$('dl-refresh').addEventListener('click', function(){ loadList(); });

		var dateStart = $('dl-date-start'), dateEnd = $('dl-date-end'), dateClear = $('dl-date-clear');
		var applyDate = function(){
			state.startTime = dateStart.value || '';
			state.endTime = dateEnd.value || '';
			dateClear.classList.toggle('hidden', !state.startTime && !state.endTime);
			state.page = 1;
			loadList();
		};
		dateStart.addEventListener('change', applyDate);
		dateEnd.addEventListener('change', applyDate);
		dateClear.addEventListener('click', function(){
			dateStart.value = '';
			dateEnd.value = '';
			applyDate();
		});

		$('dl-pager').addEventListener('click', function(e){
			var target = e.target.closest('[data-page]');
			if(!target || target.classList.contains('disable')) return;
			var action = target.getAttribute('data-page');
			var pageTotal = Math.max(1, Number(state.pageTotal || 1));
			var page;
			if(action === 'first') page = 1;
			else if(action === 'last') page = pageTotal;
			else if(action === 'prev') page = state.page - 1;
			else if(action === 'next') page = state.page + 1;
			else page = Number(action) || 1;
			gotoPage(page);
		});
		$('dl-pager').addEventListener('keydown', function(e){
			if(!e.target || e.target.tagName !== 'INPUT') return;
			if(e.key === 'Enter'){
				e.preventDefault();
				gotoPage(e.target.value);
			}else if(e.key === 'ArrowDown'){
				e.preventDefault();
				gotoPage(state.page - 1);
			}else if(e.key === 'ArrowUp'){
				e.preventDefault();
				gotoPage(state.page + 1);
			}
		});
		$('dl-pager').addEventListener('change', function(e){
			var select = e.target.closest('.page-select select');
			if(!select) return;
			var size = Number(select.value) || state.pageNum;
			if(size === state.pageNum) return;
			state.pageNum = size;
			state.page = 1;
			loadList();
		});

		$('dl-list').addEventListener('click', function(e){
			var target = e.target;
			var copyBtn = target.closest('.dl-copy');
			if(copyBtn){ copyUrl(copyBtn.getAttribute('data-url')); return; }
			var remove = target.closest('.dl-remove');
			if(remove){ removeItem(Number(remove.getAttribute('data-id')), remove.getAttribute('data-name')); return; }
			var open = target.closest('.dl-open-location');
			if(open) openLocation(open.getAttribute('data-path'));
		});
		$('dl-list').addEventListener('change', function(e){
			var toggle = e.target.closest('.dl-toggle');
			if(!toggle) return;
			setStatus(Number(toggle.getAttribute('data-id')), toggle.checked ? 1 : 0);
		});
	}

	/* ---------------- 主题同步：iframe 跟随主界面 html.dark-mode / body.theme-* ---------------- */
	function parentDocument(){
		try{
			var d = window.parent && window.parent.document;
			return d && d.documentElement ? d : null;
		}catch(e){ return null; }
	}
	function syncTheme(){
		var doc = parentDocument();
		if(!doc) return false;
		var dark = doc.documentElement.classList.contains('dark-mode');
		document.documentElement.classList.toggle('dark-mode', dark);
		document.documentElement.classList.toggle('light', !dark);
		var bodyClasses = [];
		if(doc.body){
			for(var i = 0; i < doc.body.classList.length; i ++){
				var cls = doc.body.classList[i];
				if(cls.indexOf('theme-') === 0) bodyClasses.push(cls);
			}
		}
		document.body.className = bodyClasses.join(' ');
		return true;
	}
	function bindTheme(){
		if(!syncTheme()){
			setTimeout(bindTheme, 500);
			return;
		}
		try{
			var mo = new MutationObserver(syncTheme);
			mo.observe(window.parent.document.documentElement, {attributes:true, attributeFilter:['class']});
			if(window.parent.document.body){
				mo.observe(window.parent.document.body, {attributes:true, attributeFilter:['class']});
			}
		}catch(e){}
		document.addEventListener('visibilitychange', syncTheme);
	}

	// 兼容旧浏览器缺少 closest
	if(!Element.prototype.closest){
		Element.prototype.closest = function(selector){
			var node = this;
			while(node && node.nodeType === 1){
				if((node.matches || node.msMatchesSelector).call(node, selector)) return node;
				node = node.parentNode;
			}
			return null;
		};
	}

	applyLabels();
	bindEvents();
	bindTheme();
	loadList();
})();