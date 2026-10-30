(function () {
  var root = document.getElementById('srp');
  if (!root || root.__srInit) return;
  root.__srInit = true;

  var DATA = JSON.parse(document.getElementById('scene-data').textContent);
  var SLOT = 40, GAP = 6, MAXCOLS = 8;
  var CAT_COLORS = { '食材': '#8fc06e', '菜品': '#e8a33d', '材料': '#7aa2d6', '医疗': '#d68ab8', '饮品': '#6fc7c9', '燃料': '#b08968' };
  var POOL = [
    { n: '生态香米', e: '🍚', c: '食材', v: 12, s: 180, sat: 15 }, { n: '野兔肉', e: '🍖', c: '食材', v: 28, s: 36, sat: 35 },
    { n: '胡萝卜', e: '🥕', c: '食材', v: 8, s: 60, sat: 10 }, { n: '土豆', e: '🥔', c: '食材', v: 6, s: 90, sat: 14 },
    { n: '蘑菇', e: '🍄', c: '食材', v: 9, s: 24, sat: 8 }, { n: '河鱼', e: '🐟', c: '食材', v: 22, s: 18, sat: 28 },
    { n: '苹果', e: '🍎', c: '食材', v: 7, s: 42, sat: 9 }, { n: '鸡蛋', e: '🥚', c: '食材', v: 11, s: 28, sat: 12 },
    { n: '面包', e: '🍞', c: '菜品', v: 18, s: 12, sat: 30 }, { n: '炖菜', e: '🍲', c: '菜品', v: 45, s: 8, sat: 55 },
    { n: '烤肉', e: '🍗', c: '菜品', v: 38, s: 10, sat: 48 }, { n: '热汤', e: '🥣', c: '菜品', v: 32, s: 6, sat: 40 },
    { n: '铁钉', e: '🔩', c: '材料', v: 4, s: 999, sat: 0 }, { n: '木板', e: '🪵', c: '材料', v: 5, s: 999, sat: 0 },
    { n: '布料', e: '🧵', c: '材料', v: 7, s: 999, sat: 0 }, { n: '面粉', e: '🌾', c: '材料', v: 9, s: 200, sat: 0 },
    { n: '草药', e: '🌿', c: '医疗', v: 15, s: 120, sat: 0 }, { n: '绷带', e: '🩹', c: '医疗', v: 20, s: 999, sat: 0 },
    { n: '止痛药', e: '💊', c: '医疗', v: 26, s: 999, sat: 0 }, { n: '净水', e: '💧', c: '饮品', v: 10, s: 30, sat: 5 },
    { n: '咖啡', e: '☕', c: '饮品', v: 25, s: 20, sat: 2 }, { n: '茶', e: '🍵', c: '饮品', v: 14, s: 24, sat: 3 },
    { n: '柴火', e: '🪵', c: '燃料', v: 3, s: 999, sat: 0 }, { n: '煤块', e: '🪨', c: '燃料', v: 6, s: 999, sat: 0 }
  ];
  var TAG_GROUPS = [
    { g: '食品类', tags: ['食材', '菜品', '主食', '肉类', '蔬果', '饮品', '调味', '甜品', '需冷藏', '易腐'] },
    { g: '材料类', tags: ['材料', '工具', '零件', '燃料', '医疗', '种子', '书籍', '贵重品'] },
    { g: '功能类', tags: ['种植', '堆肥', '染色', '酿造', '交易硬货', '任务物品', '备用', '回收'] }
  ];
  var COMMON = ['食材', '菜品', '材料', '医疗', '饮品'];
  var GROUP_COLOR = { 食品类: '#A3B550', 材料类: '#7AA2D6', 功能类: '#6FC7C9' };
  var CTN = [
    { id: 1, n: '角色背包', cols: 6, rows: 5, tags: [], pin: true },
    { id: 2, n: '大型置物架 A', cols: 20, rows: 16, tags: ['材料', '零件'], pin: true },
    { id: 3, n: '大型置物架 B', cols: 18, rows: 14, tags: ['材料', '燃料'], pin: true },
    { id: 4, n: '食材架', cols: 16, rows: 12, tags: ['食材', '蔬果'], pin: true },
    { id: 5, n: '双开门冰箱', cols: 8, rows: 7, tags: ['需冷藏', '易腐'], pin: true },
    { id: 6, n: '大容量冰柜', cols: 12, rows: 10, tags: ['需冷藏'] },
    { id: 7, n: '菜品柜', cols: 14, rows: 10, tags: ['菜品'] },
    { id: 8, n: '饮品柜', cols: 14, rows: 10, tags: ['饮品'] },
    { id: 9, n: '调味架', cols: 10, rows: 8, tags: ['调味'] },
    { id: 10, n: '甜品柜', cols: 10, rows: 8, tags: ['甜品'] },
    { id: 11, n: '粮食柜', cols: 16, rows: 12, tags: ['主食'] },
    { id: 12, n: '肉类冰柜', cols: 12, rows: 10, tags: ['肉类', '需冷藏'] },
    { id: 13, n: '蔬果架', cols: 14, rows: 10, tags: ['蔬果'] },
    { id: 14, n: '医疗柜', cols: 12, rows: 10, tags: ['医疗'] },
    { id: 15, n: '工具柜', cols: 14, rows: 10, tags: ['工具'] },
    { id: 16, n: '材料架（长料）', cols: 20, rows: 12, tags: ['材料'] },
    { id: 17, n: '燃料库', cols: 16, rows: 12, tags: ['燃料'] },
    { id: 18, n: '零件盒', cols: 8, rows: 6, tags: ['零件'] },
    { id: 19, n: '书架', cols: 10, rows: 8, tags: ['书籍'] },
    { id: 20, n: '贵重品保险箱', cols: 8, rows: 6, tags: ['贵重品'] },
    { id: 21, n: '种子收纳盒', cols: 8, rows: 6, tags: ['种子'] },
    { id: 22, n: '染色材料柜', cols: 12, rows: 10, tags: ['染色'] },
    { id: 23, n: '酿造原料架', cols: 12, rows: 10, tags: ['酿造'] },
    { id: 24, n: '金属柜 A', cols: 10, rows: 8, tags: ['材料'] },
    { id: 25, n: '金属柜 B', cols: 10, rows: 8, tags: ['材料'] },
    { id: 26, n: '衣柜', cols: 12, rows: 10, tags: [] },
    { id: 27, n: '床头柜', cols: 8, rows: 6, tags: [] },
    { id: 28, n: 'SUV 后备箱', cols: 18, rows: 10, tags: ['交易硬货'] },
    { id: 29, n: '任务暂存箱', cols: 8, rows: 6, tags: ['任务物品'] }
  ];
  function groupOf(tag) {
    for (var i = 0; i < TAG_GROUPS.length; i++) if (TAG_GROUPS[i].tags.indexOf(tag) >= 0) return TAG_GROUPS[i].g;
    return null;
  }
  function tagColor(t) { var g = groupOf(t); return g ? GROUP_COLOR[g] : '#888'; }

  var st = {
    scene: null, currentId: 2, mode: 'grid', sort: 'category', query: '',
    tags: [], sel: null, items: [], cells: 0, cols: MAXCOLS, rows: 0,
    srcC: 0, srcR: 0, ctnQ: ''
  };
  var el = {};

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ctn() { for (var i = 0; i < CTN.length; i++) if (CTN[i].id === st.currentId) return CTN[i]; return CTN[0]; }
  function mkItems(cells) {
    var n = Math.min(Math.max(6, Math.round(cells * 0.72)), 640), out = [];
    for (var i = 0; i < n; i++) {
      var b = POOL[i % POOL.length], u = (i * 7) % 9;
      out.push({ id: i, name: b.n, emoji: b.e, cat: b.c, count: 1 + ((i * 5 + 3) % 9), value: b.v + u * 2, shelf: Math.max(2, b.s - u * 3), sat: b.sat + (u % 4), fav: i % 13 === 0, fresh: i % 17 === 0 });
    }
    return out;
  }
  function applySize(c, r) {
    var cells = c * r, dc = Math.min(c, MAXCOLS), dr = Math.ceil(cells / dc);
    st.srcC = c; st.srcR = r; st.cols = dc; st.rows = dr; st.cells = cells; st.items = mkItems(cells);
  }
  function visItems() {
    var q = st.query.trim().toLowerCase();
    var arr = st.items.filter(function (it) { return !q || it.name.toLowerCase().indexOf(q) >= 0 || it.cat.toLowerCase().indexOf(q) >= 0; });
    var ord = { '食材': 0, '菜品': 1, '材料': 2, '医疗': 3, '饮品': 4, '燃料': 5 };
    return arr.sort(function (a, b) {
      if (st.sort === 'value') return b.value - a.value;
      if (st.sort === 'shelf') return a.shelf - b.shelf;
      if (st.sort === 'sat') return b.sat - a.sat;
      if (st.sort === 'count') return b.count - a.count;
      var ca = ord[a.cat] == null ? 9 : ord[a.cat], cb = ord[b.cat] == null ? 9 : ord[b.cat];
      return ca !== cb ? ca - cb : a.id - b.id;
    });
  }
  var DYN = {
    value: { label: '价值', f: function (i) { return i.value; }, cls: '' },
    shelf: { label: '保质(h)', f: function (i) { return i.shelf; }, cls: '' },
    sat: { label: '饱食', f: function (i) { return i.sat > 0 ? '+' + i.sat : '—'; }, cls: '' },
    count: { label: '数量', f: function (i) { return '×' + i.count; }, cls: '' },
    category: { label: '分类', f: function (i) { return i.cat; }, cls: 'cat' }
  };
  function slotHtml(it, cls) {
    var col = CAT_COLORS[it.cat] || '#b0a89a';
    return '<button type="button" class="' + cls + (it.fav ? ' fav' : '') + (st.sel === it.id ? ' selected' : '') + '" data-it="' + it.id + '" aria-label="' + esc(it.name + ' ×' + it.count) + '" style="--cat:' + col + '">' +
      '<span class="s-dot"></span><span aria-hidden="true">' + it.emoji + '</span><span class="s-cnt">' + it.count + '</span>' + (it.fresh ? '<span class="s-new"></span>' : '') + '</button>';
  }

  /* 侧栏 DOM（每次切场景重建后重绑） */
  var RAIL_HTML =
    '<div class="sr-head"><div style="min-width:0"><div class="sr-title" id="srTitle"></div>' +
    '<div class="sr-sub"><b id="srCols"></b> · <span id="srCap"></span><span id="srTags"></span></div></div>' +
    '<button class="sr-expand" id="srExpand" type="button">⤢ 放大</button></div>' +
    '<div class="sr-ctnbar"><button class="sr-ctncur" id="srCtnCur" type="button">…</button>' +
    '<div class="sr-pinrow" id="srPinRow"></div>' +
    '<button class="sr-allctn" id="srAllCtn" type="button">☰ 全部</button></div>' +
    '<div class="sr-search">🔍 <input id="srSearch" type="text" placeholder="搜索物品" autocomplete="off"></div>' +
    '<div class="sr-tagrow"><div class="sr-tags" id="srTagRow"></div>' +
    '<button class="sr-tagmore" id="srTagMore" type="button">更多标签 ▾</button></div>' +
    '<div class="sr-tools"><label class="sr-sort">⇅ <select id="srSort" aria-label="排序">' +
    '<option value="category">按分类</option><option value="value">按交易价值</option>' +
    '<option value="shelf">按保质期</option><option value="sat">按饱食度</option><option value="count">按数量</option>' +
    '</select></label><div class="sr-seg" id="srSeg"><button class="active" data-mode="grid" type="button">网格</button>' +
    '<button data-mode="list" type="button">列表</button></div></div>' +
    '<div class="sr-body" id="srBody"><div class="sr-grid" id="srGrid"></div><div class="sr-list" id="srList" hidden></div></div>' +
    '<div class="sr-hover" id="srHover">悬停查看物品详情</div>' +
    '<div class="sr-foot"><span id="srFill"></span><span class="fr" id="srView"></span></div>' +
    '<div class="sr-pop" id="srCtnPop" hidden><div class="sr-popsearch">🔍 <input id="srCtnQ" type="text" placeholder="搜索容器名 / 标签"></div>' +
    '<div class="sr-popbody" id="srCtnPopBody"></div><div class="sr-popfoot"><span id="srCtnPopCnt"></span>' +
    '<button class="sr-popclear" id="srCtnPopX" type="button">收起</button></div></div>' +
    '<div class="sr-pop sr-poptag" id="srTagPop" hidden><div class="sr-pophead"><span>按标签筛选（可多选）</span></div>' +
    '<div class="sr-popbody" id="srTagPopBody"></div><div class="sr-popfoot"><span id="srTagPopCnt"></span>' +
    '<button class="sr-popclear" id="srTagClr" type="button">清除筛选</button></div></div>';

  function bind() {
    var ids = ['srTitle', 'srCols', 'srCap', 'srTags', 'srExpand', 'srCtnCur', 'srPinRow', 'srAllCtn', 'srSearch',
      'srTagRow', 'srTagMore', 'srSort', 'srSeg', 'srBody', 'srGrid', 'srList', 'srHover', 'srFill', 'srView',
      'srCtnPop', 'srCtnQ', 'srCtnPopBody', 'srCtnPopCnt', 'srCtnPopX', 'srTagPop', 'srTagPopBody', 'srTagPopCnt', 'srTagClr'];
    el = {};
    for (var i = 0; i < ids.length; i++) el[ids[i]] = document.getElementById(ids[i]);

    el.srExpand.onclick = function () { el.ws.classList.remove('off'); render(); };
    el.srCtnCur.onclick = el.srAllCtn.onclick = function () { renderCtnPop(); el.srTagPop.hidden = true; el.srCtnPop.hidden = !el.srCtnPop.hidden; };
    el.srCtnPopX.onclick = function () { el.srCtnPop.hidden = true; };
    el.srCtnQ.oninput = function () { st.ctnQ = el.srCtnQ.value; renderCtnPop(); };
    el.srCtnPopBody.onclick = function (e) {
      var b = e.target.closest('[data-ctn]'); if (!b) return;
      st.currentId = parseInt(b.getAttribute('data-ctn'), 10);
      var c = ctn(); applySize(c.cols, c.rows); st.sel = null; el.srCtnPop.hidden = true; render();
    };
    el.srSearch.oninput = function () { st.query = el.srSearch.value; render(); };
    el.srTagRow.onclick = function (e) {
      var b = e.target.closest('[data-tag]'); if (!b) return;
      var t = b.getAttribute('data-tag');
      if (t === '__all') st.tags = [];
      else { var i = st.tags.indexOf(t); if (i >= 0) st.tags.splice(i, 1); else st.tags.push(t); }
      render();
    };
    el.srTagMore.onclick = function () { el.srCtnPop.hidden = true; el.srTagPop.hidden = !el.srTagPop.hidden; };
    el.srTagPopBody.onclick = function (e) {
      var b = e.target.closest('[data-tg]'); if (!b) return;
      var t = b.getAttribute('data-tg'), i = st.tags.indexOf(t);
      if (i >= 0) st.tags.splice(i, 1); else st.tags.push(t);
      renderTags();
    };
    el.srTagClr.onclick = function () { st.tags = []; render(); };
    el.srSort.onchange = function () { st.sort = el.srSort.value; render(); };
    el.srSeg.onclick = function (e) { var b = e.target.closest('[data-mode]'); if (b) { st.mode = b.getAttribute('data-mode'); render(); } };
    el.srBody.onmouseover = function (e) {
      var n = e.target.closest('[data-it]'); if (!n) return;
      var it = st.items[parseInt(n.getAttribute('data-it'), 10)]; if (!it) return;
      el.srHover.innerHTML = '<b>' + esc(it.name) + '</b> ×' + it.count + ' · 交易 ' + it.value + ' · 保质 ' + it.shelf + 'h · 饱食 +' + it.sat;
    };
    el.srBody.onmouseleave = function () { el.srHover.textContent = '悬停查看物品详情'; };
    el.srBody.onclick = function (e) {
      var n = e.target.closest('[data-it]'); if (!n) return;
      var id = parseInt(n.getAttribute('data-it'), 10);
      st.sel = st.sel === id ? null : id; render();
    };
    el.pinRow = el.srPinRow;
    el.pinRow.onclick = function (e) {
      var b = e.target.closest('[data-ctn]'); if (!b) return;
      st.currentId = parseInt(b.getAttribute('data-ctn'), 10);
      var c = ctn(); applySize(c.cols, c.rows); st.sel = null; render();
    };
    // 工作区
    if (!document.getElementById('srWs')) {
      var g = document.getElementById('gpage');
      var ws = document.createElement('div');
      ws.className = 'sr-ws'; ws.id = 'srWs'; ws.classList.add('off');
      ws.innerHTML = '<div class="sr-wshead"><div><div class="sr-wstitle">储物工作区</div><div class="sr-wssub" id="srWsSub"></div></div>' +
        '<div class="sr-wsact"><div class="sr-search" style="width:340px;height:34px;margin:0">🔍 <input id="srWsQ" type="text" placeholder="全局搜索：名称 / 分类 / 标签"></div>' +
        '<button class="sr-expand" id="srWsX" style="height:34px" type="button">✕ 收起 (ESC)</button></div></div>' +
        '<div class="sr-wsbody"><div class="sr-wsgrid" id="srWsGrid"></div></div>' +
        '<div class="sr-wsfoot"><span id="srWsFill"></span><span>全屏工作区：自适应列数，纵向滚动</span></div>';
      g.appendChild(ws);
      document.getElementById('srWsX').onclick = function () { ws.classList.add('off'); };
      document.getElementById('srWsQ').oninput = function (e) { st.query = e.target.value; render(); };
      el.ws = ws;
    } else el.ws = document.getElementById('srWs');
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { el.ws.classList.add('off'); el.srCtnPop.hidden = true; el.srTagPop.hidden = true; }
    });
  }

  function renderCtnBar() {
    var c = ctn();
    var dots = c.tags.slice(0, 3).map(function (t) { return '<span class="cc-dot" style="background:' + tagColor(t) + '"></span>'; }).join('');
    el.srCtnCur.innerHTML = '<span class="cc-dots">' + dots + '</span>' + esc(c.n) + ' ▾';
    el.pinRow.innerHTML = CTN.filter(function (x) { return x.pin; }).map(function (p) {
      return '<button type="button" class="sr-pin' + (p.id === st.currentId ? ' active' : '') + '" data-ctn="' + p.id + '">' +
        '<span class="p-dot" style="background:' + ((p.tags[0] && tagColor(p.tags[0])) || '#888') + '"></span>' + esc(p.n) + '</button>';
    }).join('');
  }
  function renderCtnPop() {
    var q = st.ctnQuery.trim().toLowerCase(), html = '';
    for (var g = 0; g < TAG_GROUPS.length; g++) {
      var list = CTN.filter(function (c) {
        var hit = !q || c.n.toLowerCase().indexOf(q) >= 0 || c.tags.some(function (t) { return t.toLowerCase().indexOf(q) >= 0; });
        return hit && c.tags.some(function (t) { return TAG_GROUPS[g].tags.indexOf(t) >= 0; });
      });
      if (!list.length) continue;
      html += '<div class="sr-grp">' + TAG_GROUPS[g].g + ' · ' + list.length + '</div>';
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        html += '<button type="button" class="sr-ctnitem' + (c.id === st.currentId ? ' cur' : '') + '" data-ctn="' + c.id + '">' +
          '<span class="cim"><span class="cin">' + esc(c.n) + '</span><span class="cis">' + (c.tags.length ? esc(c.tags.join(' · ')) : '未打标签') + '</span></span>' +
          '<span class="cmeta">' + c.cols + '×' + c.rows + '</span></button>';
      }
    }
    // 未打标签组
    var untag = CTN.filter(function (c) { return c.tags.length === 0 && (!q || c.n.toLowerCase().indexOf(q) >= 0); });
    if (untag.length) {
      html += '<div class="sr-grp">未打标签 · ' + untag.length + '</div>';
      for (var u = 0; u < untag.length; u++)
        html += '<button type="button" class="sr-ctnitem' + (untag[u].id === st.currentId ? ' cur' : '') + '" data-ctn="' + untag[u].id + '">' +
          '<span class="cim"><span class="cin">' + esc(untag[u].n) + '</span><span class="cis">未打标签</span></span><span class="cmeta">' + untag[u].cols + '×' + untag[u].rows + '</span></button>';
    }
    el.srCtnPopBody.innerHTML = html || '<div class="sr-empty">没有匹配的容器</div>';
    el.srCtnPopCnt.textContent = '共 ' + CTN.length + ' 个容器';
  }
  function renderTags() {
    var h = '<button type="button" class="sr-tag' + (!st.tags.length ? ' active' : '') + '" data-tag="__all">全部</button>';
    for (var i = 0; i < COMMON.length; i++)
      h += '<button type="button" class="sr-tag' + (st.tags.indexOf(COMMON[i]) >= 0 ? ' active' : '') + '" data-tag="' + COMMON[i] + '"><span class="t-dot" style="background:' + tagColor(COMMON[i]) + '"></span>' + COMMON[i] + '</button>';
    el.srTagRow.innerHTML = h;
    el.srTagMore.className = 'sr-tagmore' + (st.tags.length ? ' has' : '');
    el.srTagMore.innerHTML = '更多标签' + (st.tags.length ? '<span class="sr-mbadge">' + st.tags.length + '</span>' : '') + ' ▾';
    var p = '';
    for (var g = 0; g < TAG_GROUPS.length; g++) {
      p += '<div class="sr-grp">' + TAG_GROUPS[g].g + '</div><div class="sr-tagwrap">';
      for (var j = 0; j < TAG_GROUPS[g].tags.length; j++) {
        var t = TAG_GROUPS[g].tags[j];
        p += '<button type="button" class="sr-tag2' + (st.tags.indexOf(t) >= 0 ? ' active' : '') + '" data-tg="' + t + '"><span class="t-dot" style="background:' + GROUP_COLOR[TAG_GROUPS[g].g] + '"></span>' + t + '</button>';
      }
      p += '</div>';
    }
    el.srTagPopBody.innerHTML = p;
    el.srTagPopCnt.textContent = st.tags.length ? '已选 ' + st.tags.length + ' 个' : '未选择（显示全部）';
  }

  function render() {
    if (!st.scene) return;
    var c = ctn(), clamped = st.srcC > MAXCOLS, fi = visItems();
    el.srTitle.textContent = c.n;
    el.srCols.textContent = clamped ? '8 列封顶' : st.cols + ' 列';
    el.srCap.textContent = st.cols + '×' + st.rows;
    el.srTags.textContent = c.tags.length ? ' · ' + c.tags.join('·') : '';
    el.srFill.textContent = fi.length + ' / ' + st.cells + ' 格';
    el.srView.textContent = clamped ? '宽度 ' + st.srcC + '→8 封顶 · ' + st.rows + ' 行'
      : (st.rows * 46 + 18 > el.srBody.clientHeight + 2 && el.srBody.style.maxHeight ? '↓ 纵向滚动' : '全部可见');
    el.srView.className = 'fr' + (clamped ? ' warn' : '');
    var natH = st.rows * (SLOT + GAP) + 18;
    var bodyMax = 528;
    el.srBody.style.maxHeight = Math.min(bodyMax, natH) + 'px';

    var seg = el.srSeg.querySelectorAll('[data-mode]');
    for (var s = 0; s < seg.length; s++) seg[s].classList.toggle('active', seg[s].getAttribute('data-mode') === st.mode);
    renderCtnBar(); renderTags();

    if (st.mode === 'grid') {
      el.srGrid.hidden = false; el.srList.hidden = true;
      el.srGrid.style.gridTemplateColumns = 'repeat(' + st.cols + ', ' + SLOT + 'px)';
      var h = '';
      if (!fi.length) h = '<div class="sr-empty">没有匹配的物品</div>';
      else for (var i = 0; i < st.cells; i++) h += i < fi.length ? slotHtml(fi[i], 'sr-slot') : '<div class="sr-slot empty"></div>';
      el.srGrid.innerHTML = h;
    } else {
      el.srGrid.hidden = true; el.srList.hidden = false;
      var d = DYN[st.sort] || DYN.category;
      var lh = '<div class="sr-lhead"><span></span><span>物品</span><span class="num">数量</span><span class="num">' + d.label + '</span></div>';
      for (var j = 0; j < fi.length; j++) {
        var it = fi[j];
        lh += '<button type="button" class="sr-row' + (st.sel === it.id ? ' selected' : '') + '" data-it="' + it.id + '">' +
          '<span class="ico">' + it.emoji + '</span><span class="main"><span class="nm">' + esc(it.name) + '</span>' +
          '<span class="sub">' + it.cat + ' · 保质 ' + it.shelf + 'h · 饱食 +' + it.sat + ' · 价值 ' + it.value + '</span></span>' +
          '<span class="cnt">×' + it.count + '</span><span class="dyn ' + d.cls + '">' + d.f(it) + '</span></button>';
      }
      el.srList.innerHTML = lh;
    }
    var wh = '';
    for (var k = 0; k < st.cells; k++) wh += k < fi.length ? slotHtml(fi[k], 'sr-wsslot') : '<div class="sr-wsslot empty"></div>';
    document.getElementById('srWsGrid').innerHTML = wh;
    document.getElementById('srWsSub').textContent = c.n + ' · ' + st.cols + '×' + st.rows + '（原 ' + st.srcC + '×' + st.srcR + '）· ' + fi.length + ' 件';
    document.getElementById('srWsFill').textContent = fi.length + ' / ' + st.cells + ' 格';
    if (typeof fitPage === 'function') fitPage();
  }

  /* 场景切换：换官方页 DOM + 启用对应 CSS + 插入侧栏 */
  function setScene(key) {
    st.scene = key;
    var styles = root.querySelectorAll('style.gs');
    for (var i = 0; i < styles.length; i++) styles[i].disabled = (styles[i].id !== 'gs-' + key);
    var g = document.getElementById('gpage');
    g.innerHTML = '<div class="gfit">' + DATA.scenes[key].body + '</div>';
    // 图片占位（相对路径在原型里不可达）
    var imgs = g.querySelectorAll('img');
    for (var m = 0; m < imgs.length; m++) imgs[m].src = 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
    // 插入侧栏
    var host = g.querySelector('script[type="rail-placeholder"]') || findRailHost(g);
    var rail = document.createElement('div');
    rail.className = 'sr-rail ' + DATA.scenes[key].shell;
    rail.id = 'srRail';
    rail.innerHTML = RAIL_HTML;
    host.parentNode.replaceChild(rail, host);
    bind();
    el.rail = rail;
    render();
  }
  function findRailHost(g) {
    var c = g.querySelector('comment[data-rail]');
    if (c) return c;
    // 遍历找 <!--RAIL--> 注释
    var w = document.createTreeWalker(g, NodeFilter.SHOW_COMMENT, null);
    var n; while ((n = w.nextNode())) if (n.nodeValue === 'RAIL') return n;
    throw new Error('RAIL host not found');
  }

  /* 控制行 */
  document.getElementById('controls').addEventListener('click', function (e) {
    var sc = e.target.closest('[data-scene]');
    if (sc) {
      setScene(sc.getAttribute('data-scene'));
      var all = this.querySelectorAll('[data-scene]');
      for (var i = 0; i < all.length; i++) all[i].classList.toggle('btn-primary', all[i] === sc);
      fitPage(); fit(); return;
    }
    var pr = e.target.closest('[data-preset]');
    if (pr) {
      var p = pr.getAttribute('data-preset').split('x'), c = ctn();
      c.cols = parseInt(p[0], 10); c.rows = parseInt(p[1], 10);
      applySize(c.cols, c.rows); st.sel = null; render();
      var ap = this.querySelectorAll('[data-preset]');
      for (var j = 0; j < ap.length; j++) ap[j].classList.toggle('btn-primary', ap[j] === pr);
    }
  });

  /* 1:1 缩放 */
  var fitwrap = document.getElementById('fitwrap');
  /* 页内容适配：复刻游戏 createViewportFit —— 内容超出 1536×864 视口即整页等比缩小 */
  function fitPage() {
    var gf = document.querySelector('#srp .gfit');
    if (!gf) return;
    gf.style.transform = '';
    var w = gf.scrollWidth, h = gf.scrollHeight;
    var k = Math.min(1, (1536 - 44) / w, (864 - 44) / h);
    gf.style.transform = 'translate(-50%,-50%)' + (k < 1 ? ' scale(' + k + ')' : '');
  }
  function fit() {
    var w = fitwrap.clientWidth || 960, s = Math.min(1, w / 1536);
    var g = document.getElementById('gpage');
    g.style.transform = s < 1 ? 'scale(' + s + ')' : '';
    fitwrap.style.height = (864 * s + 2) + 'px';
    document.getElementById('scaleBadge').textContent = '1536×864 · ' + Math.round(s * 100) + '%';
  }
  window.addEventListener('resize', function () { fitPage(); fit(); });

  applySize(20, 16);
  setScene('cook');
  fitPage();
  fit();
})();

