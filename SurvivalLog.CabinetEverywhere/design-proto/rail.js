(function () {
  var root = document.getElementById('srp');
  if (!root || root.__srInit) return;
  root.__srInit = true;

  var DATA = JSON.parse(document.getElementById('scene-data').textContent);
  /* v13.8 作者拍板（2026-10-31）：所有柜子统一 12 列（对齐 BackpackUI live 场景 12 列口径）。
     12×34px + 11×6px = 474px，侧栏宽 494px（v13 壳宽跟格 428-640 区间内）；
     容量只决定行数（纵向滚动）。 */
  var COLS = 12, SLOT = 34, GAP = 6;
  var CAT_COLORS = { '食材': '#8fc06e', '菜品': '#e8a33d', '材料': '#7aa2d6', '医疗': '#d68ab8', '饮品': '#6fc7c9', '燃料': '#b08968' };
  var POOL = [
    { n: '生态香米', e: '🍚', c: '食材', v: 12, s: 180, sat: 15, hp: 0, en: 0, mind: 0 }, { n: '野兔肉', e: '🍖', c: '食材', v: 28, s: 36, sat: 35, hp: 5, en: 0, mind: 0 },
    { n: '胡萝卜', e: '🥕', c: '食材', v: 8, s: 60, sat: 10, hp: 0, en: 2, mind: 0 }, { n: '土豆', e: '🥔', c: '食材', v: 6, s: 90, sat: 14, hp: 0, en: 2, mind: 0 },
    { n: '蘑菇', e: '🍄', c: '食材', v: 9, s: 24, sat: 8, hp: 0, en: 1, mind: 0 }, { n: '河鱼', e: '🐟', c: '食材', v: 22, s: 18, sat: 28, hp: 4, en: 0, mind: 0 },
    { n: '苹果', e: '🍎', c: '食材', v: 7, s: 42, sat: 9, hp: 0, en: 0, mind: 3 }, { n: '鸡蛋', e: '🥚', c: '食材', v: 11, s: 28, sat: 12, hp: 2, en: 0, mind: 0 },
    { n: '面包', e: '🍞', c: '菜品', v: 18, s: 12, sat: 30, hp: 2, en: 4, mind: 2 }, { n: '炖菜', e: '🍲', c: '菜品', v: 45, s: 8, sat: 55, hp: 8, en: 5, mind: 6 },
    { n: '烤肉', e: '🍗', c: '菜品', v: 38, s: 10, sat: 48, hp: 6, en: 6, mind: 2 }, { n: '热汤', e: '🥣', c: '菜品', v: 32, s: 6, sat: 40, hp: 5, en: 3, mind: 5 },
    { n: '铁钉', e: '🔩', c: '材料', v: 4, s: 999, sat: 0, hp: 0, en: 0, mind: 0 }, { n: '木板', e: '🪵', c: '材料', v: 5, s: 999, sat: 0, hp: 0, en: 0, mind: 0 },
    { n: '布料', e: '🧵', c: '材料', v: 7, s: 999, sat: 0, hp: 0, en: 0, mind: 0 }, { n: '面粉', e: '🌾', c: '材料', v: 9, s: 200, sat: 0, hp: 0, en: 0, mind: 0 },
    { n: '草药', e: '🌿', c: '医疗', v: 15, s: 120, sat: 0, hp: 12, en: 0, mind: 0 }, { n: '绷带', e: '🩹', c: '医疗', v: 20, s: 999, sat: 0, hp: 20, en: 0, mind: 0 },
    { n: '止痛药', e: '💊', c: '医疗', v: 26, s: 999, sat: 0, hp: 35, en: 0, mind: -5 }, { n: '净水', e: '💧', c: '饮品', v: 10, s: 30, sat: 5, hp: 0, en: 2, mind: 0 },
    { n: '咖啡', e: '☕', c: '饮品', v: 25, s: 20, sat: 2, hp: 0, en: 15, mind: 5 }, { n: '茶', e: '🍵', c: '饮品', v: 14, s: 24, sat: 3, hp: 0, en: 8, mind: 12 },
    { n: '柴火', e: '🪵', c: '燃料', v: 3, s: 999, sat: 0, hp: 0, en: 0, mind: 0 }, { n: '煤块', e: '🪨', c: '燃料', v: 6, s: 999, sat: 0, hp: 0, en: 0, mind: 0 }
  ];
  var TAG_GROUPS = [
    { g: '食品类', tags: ['食材', '菜品', '主食', '肉类', '蔬果', '饮品', '调味', '甜品', '需冷藏', '易腐'] },
    { g: '材料类', tags: ['材料', '工具', '零件', '燃料', '医疗', '种子', '书籍', '贵重品'] },
    { g: '功能类', tags: ['种植', '堆肥', '染色', '酿造', '交易硬货', '任务物品', '备用', '回收'] }
  ];
  /* 一键整理的分类归位顺序：按 POOL 出现顺序（食材/菜品/材料/医疗/饮品/燃料） */
  var CAT_ORDER = [];
  for (var ci = 0; ci < POOL.length; ci++) if (CAT_ORDER.indexOf(POOL[ci].c) < 0) CAT_ORDER.push(POOL[ci].c);
  var COMMON_DEFAULT = ['食材', '菜品', '材料', '医疗', '饮品'];
  var COMMON = COMMON_DEFAULT.slice();   /* 快捷筛选栏：筛选即快捷标签，一个状态 */
  var CUSTOM = [];                       /* 手动添加的自定义标签 */
  var GROUP_COLOR = { 食品类: '#A3B550', 材料类: '#7AA2D6', 功能类: '#6FC7C9', 自定义: '#C9915A' };
  /* 排序：默认数值高的在前（↓），可切倒序（↑）；交易价值按 单价×数量 总价计 */
  var SORTS = [
    { k: 'value', label: '交易价值' }, { k: 'shelf', label: '保质期' }, { k: 'sat', label: '饱食度' },
    { k: 'hp', label: '生命' }, { k: 'en', label: '精力' }, { k: 'mind', label: '心态' }
  ];
  var GLOBAL_LIMIT = 300;
  /* v13.5 机器界面简化（作者 2026-10-31 需求）：9 个机器场景侧栏去掉搜索行/快捷标签行/
     排序工具行（plain）。食品类设施（烹饪/酿酒桶/老鼠笼/食物压制器/颜料桶）页脚左下角
     加排序按钮：默认（官方原顺序）+ 饱食度/生命值/精力值/心态值/保质期，选属性排序时
     每个物品格右上角显示该维数值角标。 */
  var PLAIN = ['cook', 'brew', 'cage', 'shred', 'press', 'dye', 'tool', 'trade', 'drone'];
  var FOODS = ['cook', 'brew', 'cage', 'press', 'dye'];
  /* v13.7 排序菜单按作者参考图：7 项+图标+参考图顺序（默认→饱腹→心态→精力→生命→交易价值→保质期） */
  var FSORTS = [
    { k: 'official', label: '默认', ico: '⊞' },
    { k: 'sat', label: '饱腹', ico: '🍗' },
    { k: 'mind', label: '心态', ico: '🧠' },
    { k: 'en', label: '精力', ico: '⚡' },
    { k: 'hp', label: '生命', ico: '❤️' },
    { k: 'value', label: '交易价值', ico: '💲' },
    { k: 'shelf', label: '保质期', ico: '🕐' }
  ];
  var BADGE_COLOR = { sat: '#8fc06e', hp: '#e07ab0', en: '#6fc7c9', mind: '#b08fd6', shelf: '#f0b03c', value: '#f0b03c', tvalue: '#f0b03c' };
  /* 无人机交易：每个交易点/人物各有品类喜好 → 计算后交易价值 = 单价×数量×(1+品类加成)。
     原型内置三个演示买家，点买家条切换（正式实现由当前交易对象驱动，无切换控件） */
  var TRADES = [
    { n: '收购商·老周', prefs: { '食材': 0.40, '医疗': 0.25 } },
    { n: '小卖部·胖姐', prefs: { '菜品': 0.35, '饮品': 0.20 } },
    { n: '军需·老韩', prefs: { '燃料': 0.50, '材料': 0.30 } }
  ];
  var tradeIdx = 0;
  function tradeCur() { return TRADES[tradeIdx]; }
  function tradeBonus(cat) { var p = tradeCur().prefs[cat]; return p || 0; }
  function tval(it) { return Math.round(it.value * it.count * (1 + tradeBonus(it.cat))); }
  /* 场景入口默认容器：B 键单独背包 → 背包页（bagonly 纯背包）；整理柜 → 架子本体
     （官方左背包保留在页面，侧栏=纯柜子页，背包页签不进侧栏）；其余机器界面（官方被
     替换的原面板就是背包）→ 背包页。柜子页签仍在，随时可切。 */
  var SCENE_DEF = { rack: 2 };
  /* 侧栏里可见的容器：整理柜场景排除背包（背包=左侧官方面板，进侧栏就成了第二个背包） */
  function railCtns() {
    return CTN.filter(function (c) { return c.id !== 1 || st.scene !== 'rack'; });
  }
  /* cap = 总格数。同一张 9 列网格渲染，容量只决定行数。fixed = 角色背包固定首位、不可拖拽 */
  var CTN = [
    { id: 1, n: '背包', cap: 40, tags: [], pin: true, fixed: true },
    { id: 2, n: '大型置物架 A', cap: 480, tags: ['材料', '零件'], pin: true },
    { id: 3, n: '大型置物架 B', cap: 336, tags: ['材料', '燃料'], pin: true },
    { id: 4, n: '食材架', cap: 216, tags: ['食材', '蔬果'], pin: true },
    { id: 5, n: '双开门冰箱', cap: 96, tags: ['需冷藏', '易腐'], pin: true },
    { id: 6, n: '大容量冰柜', cap: 180, tags: ['需冷藏'] },
    { id: 7, n: '菜品柜', cap: 144, tags: ['菜品'] },
    { id: 8, n: '饮品柜', cap: 144, tags: ['饮品'] },
    { id: 9, n: '调味架', cap: 90, tags: ['调味'] },
    { id: 10, n: '甜品柜', cap: 90, tags: ['甜品'] },
    { id: 11, n: '粮食柜', cap: 216, tags: ['主食'] },
    { id: 12, n: '肉类冰柜', cap: 144, tags: ['肉类', '需冷藏'] },
    { id: 13, n: '蔬果架', cap: 144, tags: ['蔬果'] },
    { id: 14, n: '医疗柜', cap: 120, tags: ['医疗'] },
    { id: 15, n: '工具柜', cap: 144, tags: ['工具'] },
    { id: 16, n: '材料架（长料）', cap: 240, tags: ['材料'] },
    { id: 17, n: '燃料库', cap: 180, tags: ['燃料'] },
    { id: 18, n: '零件盒', cap: 54, tags: ['零件'] },
    { id: 19, n: '书架', cap: 90, tags: ['书籍'] },
    { id: 20, n: '贵重品保险箱', cap: 45, tags: ['贵重品'] },
    { id: 21, n: '种子收纳盒', cap: 45, tags: ['种子'] },
    { id: 22, n: '染色材料柜', cap: 108, tags: ['染色'] },
    { id: 23, n: '酿造原料架', cap: 108, tags: ['酿造'] },
    { id: 24, n: '金属柜 A', cap: 90, tags: ['材料'] },
    { id: 25, n: '金属柜 B', cap: 90, tags: ['材料'] },
    { id: 26, n: '衣柜', cap: 120, tags: [] },
    { id: 27, n: '床头柜', cap: 54, tags: [] },
    { id: 28, n: 'SUV 后备箱', cap: 180, tags: ['交易硬货'] },
    { id: 29, n: '任务暂存箱', cap: 45, tags: ['任务物品'] }
  ];
  function groupOf(tag) {
    for (var i = 0; i < TAG_GROUPS.length; i++) if (TAG_GROUPS[i].tags.indexOf(tag) >= 0) return TAG_GROUPS[i].g;
    return CUSTOM.indexOf(tag) >= 0 ? '自定义' : null;
  }
  function tagColor(t) { var g = groupOf(t); return g ? GROUP_COLOR[g] : '#888'; }

  var st = {
    scene: null, currentId: 2, mode: 'grid', prevMode: 'grid', sort: 'value', dir: 1,
    query: '', global: false, tags: [], sel: null,
    items: [], cap: 0, rows: 0, dragId: null, editId: null, editTags: []
  };
  var el = {};
  var GCACHE = null;
  var LISTGRP = [];   /* 列表模式当前渲染的同名汇总行（右键按行取出用） */
  /* 容器改名与容器标签覆盖：id → 自定义值（localStorage 持久化） */
  var NAMES = {};
  var TAGOV = {};
  function saveNames() {
    try { localStorage.setItem('srp_ctn_names', JSON.stringify(NAMES)); } catch (e) { }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ctnById(id) { for (var i = 0; i < CTN.length; i++) if (CTN[i].id === id) return CTN[i]; return null; }
  function ctn() { return ctnById(st.currentId) || CTN[0]; }
  function nm(c) { return NAMES[c.id] || c.n; }
  function totalCap() { var s = 0; for (var i = 0; i < CTN.length; i++) s += CTN[i].cap; return s; }
  function mkItems(cells) {
    var n = Math.min(Math.max(6, Math.round(cells * 0.72)), 640), out = [];
    for (var i = 0; i < n; i++) {
      var b = POOL[i % POOL.length], u = (i * 7) % 9;
      out.push({ id: i, name: b.n, emoji: b.e, cat: b.c, count: 1 + ((i * 5 + 3) % 9), value: b.v + u * 2, shelf: Math.max(2, b.s - u * 3), sat: b.sat + (u % 4), hp: b.hp, en: b.en, mind: b.mind, fav: i % 13 === 0, fresh: i % 17 === 0 });
    }
    return out;
  }
  /* 每容器物品缓存（ICTN）：转移（一键入库/右键取出）会真实增删这些数组；
     id = 容器号×100000+序号，跨容器不冲突；src/ctnId 记来源 */
  var ICTN = {};
  function itemsOf(id) {
    if (!ICTN[id]) {
      var c = ctnById(id), arr = mkItems(c.cap);
      for (var j = 0; j < arr.length; j++) { arr[j].id = id * 100000 + j; arr[j].src = nm(c); arr[j].ctnId = id; }
      ICTN[id] = arr;
    }
    return ICTN[id];
  }
  /* 全库物品：各容器缓存拼合，懒加载缓存一次；任何转移后 GCACHE=null 重建 */
  function gitems() {
    if (GCACHE) return GCACHE;
    var out = [];
    for (var i = 0; i < CTN.length; i++) out = out.concat(itemsOf(CTN[i].id));
    GCACHE = out;
    return out;
  }
  function entryById(id) {
    var arr = st.global ? gitems() : st.items;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }
  /* 容量只换行数：10 列固定，rows = ceil(cap / 10) */
  function applySize(cap) {
    st.cap = cap;
    st.rows = Math.max(3, Math.ceil(cap / COLS));
    st.items = itemsOf(st.currentId);
    GCACHE = null;
  }
  /* 排序键：交易价值 = 单价 × 数量（多份按总数计）；tvalue = 交易场景计算后价值；
     official = 官方原顺序（取得顺序，不走数值比较）；其余为单体属性 */
  function sortVal(it) {
    if (st.sort === 'value') return it.value * it.count;
    if (st.sort === 'tvalue') return tval(it);
    if (st.sort === 'shelf') return it.shelf;
    return it[st.sort] || 0;
  }
  function sortArr(arr) {
    if (st.sort === 'official') return arr.slice().sort(function (a, b) { return a.id - b.id; });
    return arr.slice().sort(function (a, b) {
      var d = sortVal(b) - sortVal(a);           /* dir=1：数值高的在前 */
      if (d) return d * st.dir;
      return a.id - b.id;
    });
  }
  function visItems() {
    var q = st.query.trim().toLowerCase(), tags = st.tags, arr;
    if (st.global) {
      arr = gitems().filter(function (it) {
        if (q && it.name.toLowerCase().indexOf(q) < 0 && it.cat.toLowerCase().indexOf(q) < 0 && it.src.toLowerCase().indexOf(q) < 0) return false;
        if (tags.length) {
          var c = ctnById(it.ctnId);
          var hit = tags.indexOf(it.cat) >= 0 || (c && c.tags.some(function (t) { return tags.indexOf(t) >= 0; }));
          if (!hit) return false;
        }
        return true;
      });
    } else {
      arr = st.items.filter(function (it) {
        if (q && it.name.toLowerCase().indexOf(q) < 0 && it.cat.toLowerCase().indexOf(q) < 0) return false;
        if (tags.length && tags.indexOf(it.cat) < 0) return false;
        return true;
      });
    }
    return sortArr(arr);
  }
  var DYN = {
    value: { label: '总价值', f: function (i) { return i.value * i.count; } },
    tvalue: { label: '交易额', f: function (i) { return tval(i); } },
    shelf: { label: '保质(h)', f: function (i) { return i.shelf; } },
    sat: { label: '饱食', f: function (i) { return i.sat > 0 ? '+' + i.sat : '—'; } },
    hp: { label: '生命', f: function (i) { return i.hp ? '+' + i.hp : '—'; } },
    en: { label: '精力', f: function (i) { return i.en ? '+' + i.en : '—'; } },
    mind: { label: '心态', f: function (i) { return i.mind ? (i.mind > 0 ? '+' + i.mind : String(i.mind)) : '—'; } }
  };
  function sortLabel() {
    if (st.sort === 'official') return '官方默认';
    if (st.sort === 'tvalue') return '交易价值';
    for (var i = 0; i < SORTS.length; i++) if (SORTS[i].k === st.sort) return SORTS[i].label;
    return '按分类';
  }
  /* 格子右上角数值角标（v13.5）：食品类设施按属性排序 / 交易场景按计算后交易价值 */
  var BADGE = null;
  function badgeMode() {
    if (st.scene === 'trade') return { k: 'tvalue', color: BADGE_COLOR.tvalue };
    if (FOODS.indexOf(st.scene) >= 0 && st.sort !== 'official') return { k: st.sort, color: BADGE_COLOR[st.sort] };
    return null;
  }
  function badgeText(it, k) {
    if (k === 'tvalue') return String(tval(it));
    if (k === 'value') return String(it.value * it.count);
    if (k === 'shelf') return it.shelf + 'h';
    var v = it[k];
    return v > 0 ? String(v) : (v < 0 ? String(v) : '—');
  }
  function slotHtml(it, cls) {
    var col = CAT_COLORS[it.cat] || '#b0a89a';
    var bd = BADGE ? badgeText(it, BADGE.k) : '';
    return '<button type="button" class="' + cls + (it.fav ? ' fav' : '') + (st.sel === it.id ? ' selected' : '') + '" data-it="' + it.id + '" aria-label="' + esc(it.name + ' ×' + it.count) + '" style="--cat:' + col + '">' +
      '<span class="s-dot"></span><span aria-hidden="true">' + it.emoji + '</span><span class="s-cnt">' + it.count + '</span>' +
      (bd ? '<span class="s-badge" style="color:' + BADGE.color + '">' + bd + '</span>' : (it.fresh ? '<span class="s-new"></span>' : '')) + '</button>';
  }

  /* 侧栏 DOM（每次切场景重建后重绑）。
     控件入口各只有一个：容器 ▾ / 标签 ＋ / 排序 ⇅ 下拉 + 方向切换。 */
  var RAIL_HTML =
    '<div class="sr-head"><div class="sr-headtxt"><div class="sr-title" id="srTitle"></div>' +
    '<div class="sr-sub"><b id="srCols"></b><span id="srCap"></span><span id="srTags"></span></div></div></div>' +
    '<div class="sr-ctnbar"><div class="sr-pinrow" id="srPinRow"></div>' +
    '<button class="sr-allctn" id="srAllCtn" type="button" aria-label="全部容器" title="全部容器">▾</button></div>' +
    '<div class="sr-tradeinfo" id="srTrade" hidden></div>' +
    '<div class="sr-searchrow"><div class="sr-search">🔍 <input id="srSearch" type="text" placeholder="搜索物品" autocomplete="off"></div>' +
    '<button class="sr-scope" id="srScope" type="button" title="筛选范围：当前容器 / 全部容器">本柜</button></div>' +
    '<div class="sr-tagrow"><div class="sr-tags" id="srTagRow"></div>' +
    '<button class="sr-tagadd" id="srTagAdd" type="button" aria-label="添加筛选标签">＋</button></div>' +
    '<div class="sr-tools"><button class="sr-sortbtn" id="srSortBtn" type="button">⇅ <span id="srSortLbl"></span><span class="sb-caret">▾</span></button>' +
    '<button class="sr-dir" id="srDir" type="button" title="排序方向：高→低 / 低→高">↓</button>' +
    '<div class="sr-seg" id="srSeg"><button class="active" data-mode="grid" type="button">网格</button>' +
    '<button data-mode="list" type="button">列表</button></div></div>' +
    '<div class="sr-body" id="srBody"><div class="sr-grid" id="srGrid"></div><div class="sr-list" id="srList" hidden></div></div>' +
    '<div class="sr-hover" id="srHover">悬停查看物品详情</div>' +
    '<div class="sr-foot"><button class="sr-act sr-fsort" id="srFoodSort" type="button" hidden title="排序：官方默认，或按属性排序（格子右上角显示数值）"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg><span id="srFoodSortLbl">排序</span><span class="sb-caret2" aria-hidden="true">▾</span></button>' +
    '<div class="sr-foot-l"><span id="srFill"></span><span class="fr" id="srView"></span></div>' +
    '<div class="sr-actrow">' +
    '<button class="sr-act primary" id="srStoreAll" type="button" hidden title="按物品分类自动放入带对应标签的柜子（柜满顺延，无匹配留在背包）">📦 一键入库</button>' +
    '<button class="sr-act" id="srTidy" type="button" title="同名叠合并，按分类归位"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>一键整理</button>' +
    '</div></div>' +
    '<div class="sr-toast" id="srToast" hidden></div>' +
    '<div class="sr-pop sr-popctn" id="srCtnPop" hidden><div class="sr-popbody" id="srCtnPopBody"></div></div>' +
    '<div class="sr-pop sr-popedit" id="srCtnEdit" hidden><div class="sr-pophead"><span>容器设置</span></div>' +
    '<div class="sr-popbody"><label class="sr-edit-lbl">名称</label><input id="srEditName" class="sr-edit-name" type="text" maxlength="8">' +
    '<label class="sr-edit-lbl">标签</label><div class="sr-tagwrap" id="srEditTags"></div></div>' +
    '<div class="sr-popfoot"><button class="sr-popclear" id="srEditCancel" type="button">取消</button>' +
    '<button class="sr-edit-save" id="srEditSave" type="button">保存</button></div></div>' +
    '<div class="sr-pop sr-popstore" id="srStoreConfirm" hidden><div class="sr-pophead"><span>一键入库</span></div>' +
    '<div class="sr-popbody" id="srStoreText"></div>' +
    '<div class="sr-popfoot"><button class="sr-popclear" id="srStoreCancel" type="button">取消</button>' +
    '<button class="sr-edit-save" id="srStoreGo" type="button">确认入库</button></div></div>' +
    '<div class="sr-pop" id="srTagManage" hidden><div class="sr-pophead"><span>筛选标签（点击启用，再点停用）</span>' +
    '<button class="sr-popclear" id="srTagManageX" type="button">完成</button></div>' +
    '<div class="sr-popbody"><div class="sr-tagwrap" id="srTagManageBody"></div>' +
    '<div class="sr-tm-add"><input id="srTagNew" type="text" placeholder="自定义标签（≤6字）" maxlength="6">' +
    '<button class="sr-popclear" id="srTagNewBtn" type="button">添加</button></div></div></div>' +
    '<div class="sr-pop sr-popsort" id="srSortPop" hidden><div class="sr-pophead"><span>排序方式</span></div>' +
    '<div class="sr-popbody" id="srSortPopBody"></div></div>' +
    '<div class="sr-pop sr-popfsort" id="srFootSortPop" hidden><div class="sr-pophead"><span>排序方式</span></div>' +
    '<div class="sr-popbody" id="srFootSortBody"></div></div>';

  function closePops(keep) {
    if (keep !== 'ctn') el.srCtnPop.hidden = true;
    if (keep !== 'tag') el.srTagManage.hidden = true;
    if (keep !== 'sort') el.srSortPop.hidden = true;
    if (keep !== 'fsort') el.srFootSortPop.hidden = true;
    if (keep !== 'edit') el.srCtnEdit.hidden = true;
    if (keep !== 'store') el.srStoreConfirm.hidden = true;
  }
  function bind() {
    var ids = ['srTitle', 'srCols', 'srCap', 'srTags', 'srTidy', 'srStoreAll', 'srStoreConfirm', 'srStoreText', 'srStoreCancel', 'srStoreGo',
      'srPinRow', 'srAllCtn', 'srSearch', 'srScope',
      'srTagRow', 'srTagAdd', 'srSortBtn', 'srSortLbl', 'srDir', 'srSeg', 'srBody', 'srGrid', 'srList', 'srHover', 'srFill', 'srView', 'srToast',
      'srCtnPop', 'srCtnPopBody',
      'srCtnEdit', 'srEditName', 'srEditTags', 'srEditSave', 'srEditCancel',
      'srTagManage', 'srTagManageX', 'srTagManageBody', 'srTagNew', 'srTagNewBtn', 'srSortPop', 'srSortPopBody',
      'srFoodSort', 'srFoodSortLbl', 'srFootSortPop', 'srFootSortBody', 'srTrade'];
    el = {};
    for (var i = 0; i < ids.length; i++) el[ids[i]] = document.getElementById(ids[i]);

    /* 容器：唯一入口 = ▾ 小按钮；点空白处收起（document 级监听只挂一次） */
    el.srAllCtn.onclick = function () { closePops('ctn'); el.srCtnPop.hidden = !el.srCtnPop.hidden; renderCtnPop(); };
    el.srCtnPopBody.onclick = function (e) {
      var b = e.target.closest('[data-ctn]'); if (!b) return;
      st.currentId = parseInt(b.getAttribute('data-ctn'), 10);
      applySize(ctn().cap); st.sel = null;
      /* 单击只切换不关菜单（关了第二次点击就没处落，双击永远触发不了）；点空白/Esc 关 */
      el.srCtnPopBody.querySelectorAll('[data-ctn]').forEach(function (x) {
        x.classList.toggle('cur', x === b);
      });
      render();
    };
    if (!root.__srDocBound) {
      root.__srDocBound = true;
      document.addEventListener('click', function (e) {
        if (!el.srCtnPop) return;
        var t = e.target;
        if (t.closest && t.closest('.sr-pop')) return;
        if (t.closest && (t.closest('#srAllCtn') || t.closest('#srTagAdd') || t.closest('#srSortBtn') || t.closest('#srStoreAll') || t.closest('#srFoodSort'))) return;
        closePops();
        var sbC = document.getElementById('sbConfirm');
        if (sbC && !sbC.hidden && t.closest && !t.closest('#sbStoreAll')) sbC.hidden = true;
        /* 官方分类下拉：点下拉外任意处收起（wrapper 内豁免，防同次点击开合互搏） */
        if (document.querySelector('.category-dropdown:not([hidden])') && t.closest && !t.closest('.category-dropdown-wrapper')) closeMidMenus();
      });
    }
    /* 双击容器（页签或菜单行）→ 弹窗设置：改名称 + 打标签 */
    function openEditById(id) { openEdit(parseInt(id, 10)); }
    el.srPinRow.addEventListener('dblclick', function (e) {
      var b = e.target.closest('[data-ctn]'); if (b) openEditById(b.getAttribute('data-ctn'));
    });
    el.srCtnPopBody.addEventListener('dblclick', function (e) {
      var b = e.target.closest('[data-ctn]'); if (b) { el.srCtnPop.hidden = true; openEditById(b.getAttribute('data-ctn')); }
    });
    el.srEditTags.onclick = function (e) {
      var b = e.target.closest('[data-tg]'); if (!b) return;
      var t = b.getAttribute('data-tg'), i = st.editTags.indexOf(t);
      if (i >= 0) st.editTags.splice(i, 1); else st.editTags.push(t);
      renderEditTags();
    };
    el.srEditSave.onclick = saveEdit;
    el.srEditCancel.onclick = function () { el.srCtnEdit.hidden = true; };
    el.srEditName.onkeydown = function (e) { if (e.key === 'Enter') saveEdit(); };
    /* 一键整理（对齐官方背包标题行 action-btn）+ 一键入库（弹窗确认后执行） */
    el.srTidy.onclick = function () { tidy(); };
    el.srStoreAll.onclick = openStoreConfirm;
    el.srStoreGo.onclick = function () { el.srStoreConfirm.hidden = true; storeAll(); };
    el.srStoreCancel.onclick = function () { el.srStoreConfirm.hidden = true; };
    /* 搜索 + 范围切换 */
    el.srSearch.oninput = function () { st.query = el.srSearch.value; render(); };
    el.srScope.onclick = function () {
      st.global = !st.global;
      if (st.global) { st.prevMode = st.mode; st.mode = 'list'; }
      else st.mode = st.prevMode || 'grid';
      render();
    };
    /* 快捷标签：chip 点切换筛选，× 移出快捷栏；＋ 打开唯一的管理弹层 */
    el.srTagRow.onclick = function (e) {
      var x = e.target.closest('[data-tx]');
      if (x) {
        var tx = x.getAttribute('data-tx'), i = COMMON.indexOf(tx);
        if (i >= 0) COMMON.splice(i, 1);
        var ci = CUSTOM.indexOf(tx); if (ci >= 0) CUSTOM.splice(ci, 1);
        var f = st.tags.indexOf(tx); if (f >= 0) st.tags.splice(f, 1);
        saveCommon(); render(); return;
      }
      var b = e.target.closest('[data-tag]'); if (!b) return;
      var t = b.getAttribute('data-tag');
      if (t === '__all') st.tags = [];
      else { var i2 = st.tags.indexOf(t); if (i2 >= 0) st.tags.splice(i2, 1); else st.tags.push(t); }
      render();
    };
    el.srTagAdd.onclick = function () { closePops('tag'); el.srTagManage.hidden = !el.srTagManage.hidden; renderTagManage(); };
    el.srTagManageX.onclick = function () { el.srTagManage.hidden = true; };
    el.srTagManageBody.onclick = function (e) {
      var b = e.target.closest('[data-tg]'); if (!b) return;
      var t = b.getAttribute('data-tg'), i = COMMON.indexOf(t);
      if (i >= 0) {
        COMMON.splice(i, 1);
        var ci = CUSTOM.indexOf(t); if (ci >= 0) CUSTOM.splice(ci, 1);
        var f = st.tags.indexOf(t); if (f >= 0) st.tags.splice(f, 1);
        saveCommon(); render(); renderTagManage();
      } else if (tryAddQuick(t)) {
        st.tags.push(t);
        saveCommon(); render(); renderTagManage();
      }
    };
    function addCustom() {
      var v = el.srTagNew.value.trim();
      if (!v) return;
      if (COMMON.indexOf(v) >= 0) { toast('该标签已在快捷栏'); return; }
      if (!tryAddQuick(v)) { el.srTagNew.value = ''; return; }
      CUSTOM.push(v); st.tags.push(v); saveCustom();
      el.srTagNew.value = '';
      render(); renderTagManage();
    }
    el.srTagNewBtn.onclick = addCustom;
    el.srTagNew.onkeydown = function (e) { if (e.key === 'Enter') addCustom(); };
    /* 排序：自定义下拉 + 方向切换 */
    el.srSortBtn.onclick = function () { closePops('sort'); el.srSortPop.hidden = !el.srSortPop.hidden; renderSortPop(); };
    el.srSortPopBody.onclick = function (e) {
      var b = e.target.closest('[data-sort]'); if (!b) return;
      st.sort = b.getAttribute('data-sort');
      el.srSortPop.hidden = true; render();
    };
    el.srDir.onclick = function () { st.dir = -st.dir; render(); };
    /* 设施排序（食品类设施页脚左下角）：上弹 6 项，选属性排序时格子上角显示数值 */
    el.srFoodSort.onclick = function () { closePops('fsort'); el.srFootSortPop.hidden = !el.srFootSortPop.hidden; renderFootSortPop(); };
    el.srFootSortBody.onclick = function (e) {
      var b = e.target.closest('[data-fsort]'); if (!b) return;
      st.sort = b.getAttribute('data-fsort');
      el.srFootSortPop.hidden = true; render();
      toast(st.sort === 'official' ? '已恢复官方默认排序' : '已按「' + fsortLabel(st.sort) + '」排序 · 格子右上角显示数值');
    };
    /* 交易买家条：点击买家名切换演示买家（品类加成→计算后价值→排序联动刷新） */
    el.srTrade.onclick = function (e) {
      if (!e.target.closest('.ti-buyer')) return;
      tradeIdx = (tradeIdx + 1) % TRADES.length;
      toast('买家切换为 ' + tradeCur().n + '，按计算后交易价值重新排序');
      render();
    };
    el.srSeg.onclick = function (e) {
      if (st.global) return; /* 全库模式锁定列表视图 */
      var b = e.target.closest('[data-mode]'); if (b) { st.mode = b.getAttribute('data-mode'); render(); }
    };
    el.srBody.onmouseover = function (e) {
      var gr = e.target.closest('[data-grp]');
      if (gr) {
        var g = LISTGRP[parseInt(gr.getAttribute('data-grp'), 10)];
        if (g) el.srHover.innerHTML = '<b>' + esc(g.name) + '</b> ×' + g.total + ' · ' + g.entries.length + ' 叠 · 保质 ' + g.minShelf + 'h' +
          (g.srcs.length ? ' · 来自 ' + esc(g.srcs[0]) + (g.srcs.length > 1 ? ' 等 ' + g.srcs.length + ' 处' : '') : '') +
          ' · 纯汇总展示（只读）';
        return;
      }
      var n = e.target.closest('[data-it]'); if (!n) return;
      var it = entryById(parseInt(n.getAttribute('data-it'), 10)); if (!it) return;
      if (st.scene === 'trade') {
        var bn = tradeBonus(it.cat);
        el.srHover.innerHTML = '<b>' + esc(it.name) + '</b> ×' + it.count + ' · 基础 ' + (it.value * it.count) +
          (bn ? ' · <span style="color:#8fc06e">' + it.cat + ' +' + Math.round(bn * 100) + '%</span>' : ' · 无品类加成') +
          ' → 计算后 <b>' + tval(it) + '</b>' +
          (it.src ? ' · 来自 ' + esc(it.src) : '') + ' · 官方原生：右键快转 · 高亮键批转';
        return;
      }
      el.srHover.innerHTML = '<b>' + esc(it.name) + '</b> ×' + it.count + ' · 交易 ' + it.value + ' · 保质 ' + it.shelf + 'h · 饱食 +' + it.sat +
        (it.src ? ' · 来自 ' + esc(it.src) : '') + ' · 官方原生：右键快转 · 高亮键批转';
    };
    el.srBody.onmouseleave = function () { el.srHover.textContent = '悬停查看物品详情'; };
    el.srBody.onclick = function (e) {
      var n = e.target.closest('[data-it]'); if (!n) return;
      var id = parseInt(n.getAttribute('data-it'), 10);
      st.sel = st.sel === id ? null : id; render();
    };
    /* 【原型模拟，非实现口径】v13 实现口径：网格=官方 DOM 原件，右键/拖拽/高亮键全官方
       原生（mod 零接线）；列表=纯展示行零事件。下面的模拟取物仅用于原型演示数据流动。 */
    el.srBody.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.srGrid.addEventListener('contextmenu', function (e) {
      var n = e.target.closest('[data-it]'); if (!n) return;
      var it = entryById(parseInt(n.getAttribute('data-it'), 10));
      if (it) takeEntries([it], e.shiftKey);
    });
    el.srList.addEventListener('contextmenu', function (e) {
      var r = e.target.closest('[data-grp]'); if (!r) return;
      var g = LISTGRP[parseInt(r.getAttribute('data-grp'), 10)];
      if (g) takeEntries(g.entries.slice(), e.shiftKey);
    });
    el.pinRow = el.srPinRow;
    el.pinRow.onclick = function (e) {
      var ed = e.target.closest('.p-edit');
      if (ed) {
        e.stopPropagation();
        openEdit(parseInt(ed.closest('[data-ctn]').getAttribute('data-ctn'), 10));
        return;
      }
      var b = e.target.closest('[data-ctn]'); if (!b) return;
      st.currentId = parseInt(b.getAttribute('data-ctn'), 10);
      applySize(ctn().cap); st.sel = null; render();
    };
    /* ✎ 上按下不启动拖拽（draggable=false 之外再加一道保险） */
    el.srPinRow.addEventListener('mousedown', function (e) {
      if (e.target.closest('.p-edit')) e.stopPropagation();
    });
    bindPinDrag();
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closePops();
        closeMidMenus();
        var sbC = document.getElementById('sbConfirm');
        if (sbC) sbC.hidden = true;
      }
    });
  }
  /* 快捷标签上限两行：先试着加，量一下是否溢出，溢出就回退并提示 */
  function tryAddQuick(t) {
    COMMON.push(t);
    renderTags();
    if (el.srTagRow.scrollHeight > el.srTagRow.clientHeight + 2) {
      COMMON.splice(COMMON.indexOf(t), 1);
      renderTags();
      toast('快捷标签最多两行，请先移除一个');
      return false;
    }
    return true;
  }
  var toastTimer = null;
  function toastAt(tEl, msg) {
    if (!tEl) return;
    tEl.textContent = msg;
    tEl.hidden = false;
    tEl.classList.add('on');
    if (tEl.__t) clearTimeout(tEl.__t);
    tEl.__t = setTimeout(function () {
      tEl.classList.remove('on');
      setTimeout(function () { tEl.hidden = true; }, 250);
    }, 2000);
  }
  function toast(msg) { toastAt(el.srToast, msg); }
  function sbToast(msg) { toastAt(document.getElementById('sbToast'), msg); }

  /* 转移副本的 id 序列号：与「容器号×100000+序号」的原生 id 空间隔离，防选中/悬停错位 */
  var SEQ = 90000000;

  /* 一键入库：背包物品按物品分类（食材/菜品/材料/医疗/饮品/燃料）匹配柜子标签，
     按页签顺序优先（常用柜在前），柜满顺延下一个同标签柜；无匹配/全满的留在背包 */
  function storeAll() {
    var bag = itemsOf(1);
    if (!bag.length) { toast('背包是空的'); return; }
    var keep = [], moved = 0, stay = 0, cnt = {}, order = [];
    for (var i = 0; i < bag.length; i++) {
      var it = bag[i], tgt = null;
      for (var cI = 0; cI < CTN.length; cI++) {
        var cc = CTN[cI];
        if (cc.id !== 1 && cc.tags.indexOf(it.cat) >= 0 && itemsOf(cc.id).length < cc.cap) { tgt = cc; break; }
      }
      if (tgt) {
        var arr = itemsOf(tgt.id);
        it.id = ++SEQ; it.ctnId = tgt.id; it.src = nm(tgt);
        arr.push(it);
        cnt[tgt.id] = (cnt[tgt.id] || 0) + 1;
        if (order.indexOf(tgt.id) < 0) order.push(tgt.id);
        moved++;
      } else { keep.push(it); stay++; }
    }
    ICTN[1] = keep;
    st.sel = null; GCACHE = null;
    applySize(ctn().cap);
    refreshAll();
    var parts = [];
    for (var q = 0; q < order.length && q < 4; q++) parts.push(nm(ctnById(order[q])) + '×' + cnt[order[q]]);
    var msg = '已入库 ' + moved + ' 件 → ' + parts.join(' · ') + (order.length > 4 ? ' 等' : '');
    if (stay) msg += '；' + stay + ' 件无匹配柜或柜已满，留在背包';
    toast(msg);
  }

  /* 一键整理：同名叠合并 + 按分类归位（官方背包底部 action-btn 同位同图标） */
  function tidyById(id) {
    var arr = itemsOf(id);
    if (!arr.length) { toast(id === st.currentId && id !== 1 ? '这里没有物品' : '背包是空的'); return; }
    var order = [], byName = {};
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i], g = byName[it.name];
      if (!g) { byName[it.name] = it; order.push(it); }
      else g.count += it.count;
    }
    order.sort(function (a, b) {
      var ca = CAT_ORDER.indexOf(a.cat), cb = CAT_ORDER.indexOf(b.cat);
      if (ca !== cb) return ca - cb;
      return b.count - a.count;
    });
    var before = arr.length;
    ICTN[id] = order;
    st.sel = null; GCACHE = null;
    if (id === st.currentId) applySize(ctn().cap);
    refreshAll();
    toast('已整理：' + before + ' 叠合并为 ' + order.length + ' 叠');
  }
  function tidy() { tidyById(st.currentId); }

  /* 一键入库确认弹窗：先给分布预估，确认后才转移 */
  function openStoreConfirm() {
    var bag = itemsOf(1);
    if (!bag.length) { toast('背包是空的'); return; }
    var pieces = 0;
    for (var i = 0; i < bag.length; i++) pieces += bag[i].count;
    el.srStoreText.innerHTML = '背包现有 <b>' + pieces + '</b> 件（' + bag.length + ' 叠），将按<b>物品分类</b>放入带对应标签的柜子。<br>柜满顺延下一个同标签柜；无匹配/全满的留在背包。';
    closePops('store');
    el.srStoreConfirm.hidden = false;
  }

  /* 【原型模拟，非实现口径】取出/放入在实现里=官方 DOM 原件上的官方原生动作
     （webui-bag 右键快转/高亮键批转/拖拽；rackrows 行拖拽/右键取1）。
     本函数仅供原型演示数据流动，实现侧无对应物。 */
  function takeEntries(entries, all) {
    var bag = itemsOf(1), bagCap = ctnById(1).cap, total = 0, name = entries.length ? entries[0].name : '';
    for (var i = 0; i < entries.length; i++) {
      var it = entries[i];
      if (it.ctnId === 1) continue;                 /* 背包自己的行/格：取出无意义 */
      var n = all ? it.count : 1;
      if (n <= 0) continue;
      var stack = null;
      for (var b = 0; b < bag.length; b++) if (bag[b].name === it.name) { stack = bag[b]; break; }
      if (stack) stack.count += n;
      else if (bag.length < bagCap) {
        var cp = {};
        for (var k in it) cp[k] = it[k];
        cp.id = ++SEQ; cp.ctnId = 1; cp.src = nm(ctnById(1)); cp.count = n;
        bag.push(cp);
      } else { toast('背包已满'); break; }
      it.count -= n; total += n;
      if (it.count <= 0) {
        var src = itemsOf(it.ctnId), ix = src.indexOf(it);
        if (ix >= 0) src.splice(ix, 1);
      }
      if (!all) break;                               /* 只取一件即止 */
    }
    if (!total) { toast('已经在背包里了'); return; }
    st.sel = null; GCACHE = null;
    refreshAll();
    toast('取出 ' + name + ' ×' + total + (all ? '（整堆）' : ''));
  }

  /* 容器设置弹窗：改名称 + 打标签（双击页签或菜单行打开） */
  function openEdit(id) {
    var c = ctnById(id); if (!c) return;
    st.editId = id;
    st.editTags = c.tags.slice();
    el.srEditName.value = nm(c);
    renderEditTags();
    el.srCtnEdit.hidden = false;
    closePops('edit');
    setTimeout(function () { try { el.srEditName.focus(); el.srEditName.select(); } catch (x) { } }, 0);
  }
  function renderEditTags() {
    var h = '';
    var groups = TAG_GROUPS.concat(CUSTOM.length ? [{ g: '自定义', tags: CUSTOM.slice() }] : []);
    for (var g = 0; g < groups.length; g++) {
      h += '<div class="sr-grp">' + groups[g].g + '</div><div class="sr-tagwrap">';
      for (var t = 0; t < groups[g].tags.length; t++) {
        var tg = groups[g].tags[t];
        h += '<button type="button" class="sr-tag2' + (st.editTags.indexOf(tg) >= 0 ? ' active' : '') + '" data-tg="' + esc(tg) + '">' +
          '<span class="t-dot" style="background:' + tagColor(tg) + '"></span>' + esc(tg) + '</button>';
      }
      h += '</div>';
    }
    el.srEditTags.innerHTML = h;
  }
  function saveEdit() {
    var c = ctnById(st.editId); if (!c) { el.srCtnEdit.hidden = true; return; }
    var v = el.srEditName.value.trim();
    if (v && v !== c.n) NAMES[c.id] = v; else delete NAMES[c.id];
    var sameTags = c.tags.length === st.editTags.length && c.tags.every(function (t) { return st.editTags.indexOf(t) >= 0; });
    if (sameTags) delete TAGOV[c.id]; else TAGOV[c.id] = st.editTags.slice();
    c.tags = st.editTags.slice();
    var arr = ICTN[c.id];
    if (arr) for (var q = 0; q < arr.length; q++) arr[q].src = nm(c);
    saveNames(); saveCtnTags();
    GCACHE = null;
    el.srCtnEdit.hidden = true;
    render();
  }
  function saveCtnTags() {
    try { localStorage.setItem('srp_ctn_tags', JSON.stringify(TAGOV)); } catch (e) { }
  }

  /* 整理柜专属（v13 口径）：左段 = **官方背包面板原件占位**（实现=官方 #panelA reparent，
     负重条+官方背包格，拖拽/详情/高亮键全原生——本原型用自绘网格模拟其布局与尺寸，
     模拟交互不构成实现口径）。底部动作组 = 一键整理（入库走官方放入流程，本场景无入库按钮）。 */
  var BAGPANEL_HTML =
    '<div class="sr-head"><div class="sr-headtxt"><div class="sr-title">背包</div>' +
    '<div class="sr-sub"><b>' + COLS + ' 列</b><span> · ' + ctnById(1).cap + ' 格</span></div></div></div>' +
    '<div class="sr-body" id="sbBody"><div class="sr-grid" id="sbGrid"></div></div>' +
    '<div class="sr-hover" id="sbHover">官方原件区 · 右键快转/高亮键批转（官方原生）</div>' +
    '<div class="sr-foot"><div class="sr-foot-l"><span id="sbFill"></span><span class="fr" id="sbView"></span></div>' +
    '<div class="sr-actrow">' +
    '<button class="sr-act" id="sbTidy" type="button" title="同名叠合并，按分类归位"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>一键整理</button>' +
    '<button class="sr-act primary" id="sbStoreAll" type="button" title="按物品分类自动放入带对应标签的柜子（柜满顺延，无匹配留在背包）">📦 一键入库</button>' +
    '</div></div>' +
    '<div class="sr-toast" id="sbToast" hidden></div>' +
    '<div class="sr-pop sr-popstore" id="sbConfirm" hidden><div class="sr-pophead"><span>一键入库</span></div>' +
    '<div class="sr-popbody" id="sbText"></div>' +
    '<div class="sr-popfoot"><button class="sr-popclear" id="sbCancel" type="button">取消</button>' +
    '<button class="sr-edit-save" id="sbGo" type="button">确认入库</button></div></div>';

  function bagEntry(id) {
    var arr = itemsOf(1);
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }
  function renderBagPanel() {
    var g = document.getElementById('sbGrid');
    if (!g || !st.scene) return;
    var arr = itemsOf(1), cap = ctnById(1).cap, rows = Math.max(3, Math.ceil(cap / COLS));
    g.style.gridTemplateColumns = 'repeat(' + COLS + ', ' + SLOT + 'px)';
    var h = '';
    for (var i = 0; i < rows * COLS; i++) h += i < arr.length ? slotHtml(arr[i], 'sr-slot') : '<div class="sr-slot empty"></div>';
    g.innerHTML = h;
    document.getElementById('sbFill').textContent = arr.length + ' / ' + cap + ' 格';
    document.getElementById('sbView').textContent = rows + ' 行';
    /* 按标签放入：标签色点跟右侧当前柜走（官方 ruleChips 同位） */
    var tp = document.getElementById('srTagPutIn');
    if (tp) {
      var tgt = ctnById(st.currentId), tags = tgt && tgt.id !== 1 ? tgt.tags : [];
      var chips = document.getElementById('srTagChips');
      var ico = '<span class="putin-ico">' + tags.slice(0, 3).map(function (t) {
        return '<i class="pi-dot" style="background:' + tagColor(t) + '" title="' + esc(t) + '"></i>';
      }).join('') + '</span>';
      var more = tags.length > 3 ? '<span class="putin-more">+' + (tags.length - 3) + '</span>' : '';
      chips.innerHTML = tags.length ? ico + more : '';
      tp.classList.toggle('has-ico', tags.length > 0);
      tp.title = tags.length ? '按「' + tags.join('·') + '」标签放入背包中的对应物品' : '右侧柜子未设置标签';
    }
  }
  /* 【原型模拟，非实现口径】背包→柜在实现里=官方原生（拖拽入 #panelB / 官方放入按钮 /
     高亮键批转）。本函数仅原型演示用。 */
  function putEntries(it, all) {
    var tgt = ctnById(st.currentId);
    if (!tgt || tgt.id === 1) { sbToast('请先在右侧选择要放入的柜子'); return; }
    var n = all ? it.count : 1, arr = itemsOf(tgt.id), stack = null;
    for (var b = 0; b < arr.length; b++) if (arr[b].name === it.name) { stack = arr[b]; break; }
    if (stack) stack.count += n;
    else if (arr.length < tgt.cap) {
      var cp = {};
      for (var k in it) cp[k] = it[k];
      cp.id = ++SEQ; cp.ctnId = tgt.id; cp.src = nm(tgt); cp.count = n;
      arr.push(cp);
    } else { sbToast(nm(tgt) + ' 已满'); return; }
    it.count -= n;
    if (it.count <= 0) {
      var bi = itemsOf(1).indexOf(it);
      if (bi >= 0) itemsOf(1).splice(bi, 1);
    }
    GCACHE = null; st.sel = null;
    refreshAll();
    sbToast('放入 ' + nm(tgt) + ' ×' + n + (all ? '（整堆）' : ''));
  }
  /* 转移匹配：cat = null(全部) | 分类名 | 标签数组（按标签放入） */
  function catMatch(it, cat) {
    if (!cat) return true;
    if (Array.isArray(cat)) return cat.indexOf(it.cat) >= 0;
    return it.cat === cat;
  }
  function catLabel(cat) { return Array.isArray(cat) ? cat.join('·') : cat; }
  /* 中间转移按钮（官方改版背包同款五按钮）：全部取出/放入 = 整叠批量互转；
     分类取出/分类放入 = 只转指定分类；按标签放入 = 按右侧柜子标签规则放。
     满则整叠跳过计数，绝不半叠拆分 */
  function putAllToCabinet(cat) {
    var tgt = ctnById(st.currentId);
    if (!tgt || tgt.id === 1) return;
    var bag = itemsOf(1).slice();
    if (!bag.length) { sbToast('背包是空的'); return; }
    var moved = 0, stay = 0;
    for (var i = 0; i < bag.length; i++) {
      var it = bag[i];
      if (!catMatch(it, cat)) continue;
      var arr = itemsOf(tgt.id), stack = null;
      for (var b = 0; b < arr.length; b++) if (arr[b].name === it.name) { stack = arr[b]; break; }
      if (stack) stack.count += it.count;
      else if (arr.length < tgt.cap) {
        var cp = {};
        for (var k in it) cp[k] = it[k];
        cp.id = ++SEQ; cp.ctnId = tgt.id; cp.src = nm(tgt);
        arr.push(cp);
      } else { stay++; continue; }
      moved += it.count;
      var bi = itemsOf(1).indexOf(it);
      if (bi >= 0) itemsOf(1).splice(bi, 1);
    }
    GCACHE = null; st.sel = null;
    refreshAll();
    if (!moved && !stay) { sbToast('背包里没有命中「' + catLabel(cat) + '」的物品'); return; }
    sbToast(moved ? '已放入 ' + nm(tgt) + ' ' + moved + ' 件' + (cat ? '（' + catLabel(cat) + '）' : '') + (stay ? '，柜满剩 ' + stay + ' 叠' : '') : nm(tgt) + ' 已满');
  }
  function tagPutIn() {
    var tgt = ctnById(st.currentId);
    if (!tgt || tgt.id === 1) return;
    if (!tgt.tags.length) { sbToast(nm(tgt) + ' 未设置标签'); return; }
    putAllToCabinet(tgt.tags.slice());
  }
  function takeAllFromCabinet(cat) {
    var tgt = ctnById(st.currentId);
    if (!tgt || tgt.id === 1) return;
    var arr = itemsOf(tgt.id).slice();
    if (!arr.length) { toast('柜子是空的'); return; }
    var bag = itemsOf(1), bagCap = ctnById(1).cap, moved = 0, stay = 0;
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (!catMatch(it, cat)) continue;
      var stack = null;
      for (var b = 0; b < bag.length; b++) if (bag[b].name === it.name) { stack = bag[b]; break; }
      if (stack) stack.count += it.count;
      else if (bag.length < bagCap) {
        var cp = {};
        for (var k in it) cp[k] = it[k];
        cp.id = ++SEQ; cp.ctnId = 1; cp.src = nm(ctnById(1));
        bag.push(cp);
      } else { stay++; continue; }
      moved += it.count;
      var ix = itemsOf(tgt.id).indexOf(it);
      if (ix >= 0) itemsOf(tgt.id).splice(ix, 1);
    }
    GCACHE = null; st.sel = null;
    refreshAll();
    if (!moved && !stay) { toast('柜子里没有' + catLabel(cat)); return; }
    toast(moved ? '已取出 ' + moved + ' 件' + (cat ? '（' + catLabel(cat) + '）' : '') + (stay ? '，背包满剩 ' + stay + ' 叠' : '') : '背包已满');
  }
  /* 分类下拉：选项 = 对应容器里实际存在的分类（官方 smartCategories 同义） */
  function closeMidMenus() {
    document.querySelectorAll('.category-dropdown').forEach(function (m) { m.hidden = true; });
    document.querySelectorAll('.category-dropdown-btn.open').forEach(function (b) { b.classList.remove('open'); });
  }
  function catsOf(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) if (arr[i].cat && out.indexOf(arr[i].cat) < 0) out.push(arr[i].cat);
    return out;
  }

  function bindBagPanel() {
    var g = document.getElementById('sbGrid'); if (!g) return;
    var pa = document.getElementById('srPutAll');
    if (pa) pa.onclick = function () { closeMidMenus(); putAllToCabinet(); };
    var ta = document.getElementById('srTakeAll');
    if (ta) ta.onclick = function () { closeMidMenus(); takeAllFromCabinet(); };
    var tp = document.getElementById('srTagPutIn');
    if (tp) tp.onclick = function () { closeMidMenus(); tagPutIn(); };
    var tc = document.getElementById('srTakeCat'), tcm = document.getElementById('srTakeCatMenu');
    var pc = document.getElementById('srPutCat'), pcm = document.getElementById('srPutCatMenu');
    function bindCat(btn, menu, srcArr, fn) {
      if (!btn) return;
      btn.onclick = function () {
        var reopen = menu.hidden;
        closeMidMenus();
        if (!reopen) return;
        var cs = catsOf(srcArr());
        menu.innerHTML = cs.length
          ? cs.map(function (c) { return '<div class="category-option" data-cat="' + c + '">' + c + '</div>'; }).join('')
          : '<div class="category-empty">无可转移物品</div>';
        menu.hidden = false;
        btn.classList.add('open');
      };
      menu.onclick = function (e) {
        var o = e.target.closest('[data-cat]'); if (!o) return;
        closeMidMenus();
        fn(o.getAttribute('data-cat'));
      };
    }
    bindCat(tc, tcm, function () { return itemsOf(st.currentId); }, function (c) { takeAllFromCabinet(c); });
    bindCat(pc, pcm, function () { return itemsOf(1); }, function (c) { putAllToCabinet(c); });
    g.addEventListener('mouseover', function (e) {
      var n = e.target.closest('[data-it]'); if (!n) return;
      var it = bagEntry(parseInt(n.getAttribute('data-it'), 10)); if (!it) return;
      document.getElementById('sbHover').innerHTML = '<b>' + esc(it.name) + '</b> ×' + it.count +
        ' · 交易 ' + it.value + ' · 保质 ' + it.shelf + 'h · 官方原生：右键快转 · 高亮键批转';
    });
    g.addEventListener('mouseleave', function () {
      document.getElementById('sbHover').textContent = '官方原件区 · 拖拽/右键/高亮键（官方原生）';
    });
    g.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      /* 原型模拟（实现=官方原生右键快转，mod 零接线） */
      var n = e.target.closest('[data-it]'); if (!n) return;
      var it = bagEntry(parseInt(n.getAttribute('data-it'), 10));
      if (it) putEntries(it, e.shiftKey);
    });
    document.getElementById('sbTidy').onclick = function () { tidyById(1); };
    document.getElementById('sbStoreAll').onclick = function () {
      var bag = itemsOf(1);
      if (!bag.length) { sbToast('背包是空的'); return; }
      var pieces = 0;
      for (var i = 0; i < bag.length; i++) pieces += bag[i].count;
      document.getElementById('sbText').innerHTML = '背包现有 <b>' + pieces + '</b> 件（' + bag.length +
        ' 叠），将按<b>物品分类</b>放入带对应标签的柜子。<br>柜满顺延下一个同标签柜；无匹配/全满的留在背包。';
      closePops();
      document.getElementById('sbConfirm').hidden = false;
    };
    document.getElementById('sbCancel').onclick = function () { document.getElementById('sbConfirm').hidden = true; };
    document.getElementById('sbGo').onclick = function () {
      document.getElementById('sbConfirm').hidden = true;
      storeAll();
    };
  }
  /* 双面板联动：主侧栏任何渲染（含切柜/切视图）都连带刷新背包面板（含按标签色点） */
  function refreshAll() { render(); }


  function pinKey() { return 'srp_pin_order_' + st.scene; }
  function commonKey() { return 'srp_common_tags_' + st.scene; }
  function loadScenePrefs() {
    try {
      var sc = JSON.parse(localStorage.getItem(commonKey()) || 'null');
      COMMON = Array.isArray(sc) && sc.length ? sc.slice() : COMMON_DEFAULT.slice();
      var po = JSON.parse(localStorage.getItem(pinKey()) || 'null');
      applyPinOrder(Array.isArray(po) ? po : null);
    } catch (e) { applyPinOrder(null); }
    PIN_KEY = '';
  }
  function applyPinOrder(po) {
    var fixedC = CTN.filter(function (c) { return c.pin && c.fixed; });
    var map = {}, rest = [];
    CTN.forEach(function (c) { if (c.pin && !c.fixed) map[c.id] = c; else if (!c.pin) rest.push(c); });
    var ordered;
    if (po && po.length) {
      ordered = po.map(function (id) { return map[id]; }).filter(Boolean);
      Object.keys(map).forEach(function (k) { if (ordered.indexOf(map[k]) < 0) ordered.push(map[k]); });
    } else {
      ordered = Object.keys(map).map(function (k) { return map[k]; });
    }
    CTN.length = 0;
    fixedC.forEach(function (c) { CTN.push(c); });
    ordered.forEach(function (c) { CTN.push(c); });
    rest.forEach(function (c) { CTN.push(c); });
  }
  function saveCommon() {
    try { localStorage.setItem(commonKey(), JSON.stringify(COMMON)); } catch (e) { }
  }
  function saveCustom() {
    try { localStorage.setItem('srp_custom_tags', JSON.stringify(CUSTOM)); } catch (e) { }
  }
  var PIN_KEY = '';
  function renderCtnBar() {
    var pins = railCtns().filter(function (x) { return x.pin; });
    /* 结构（id+顺序+名称）没变就不重建 DOM：单击切换容器时保住节点，
       否则第二次点击落在重建后的新节点上，浏览器会把 dblclick 派发到公共祖先，双击就失效 */
    var key = pins.map(function (p) { return p.id + ':' + nm(p); }).join('-');
    if (key !== PIN_KEY) {
      PIN_KEY = key;
      el.pinRow.innerHTML = pins.map(function (p) {
        var main = !!p.fixed;
        /* 方案2定稿：仅选中页签右侧显示 ✎（CSS 控制显隐）；双击保留为隐藏快捷方式 */
        return '<button type="button" draggable="' + (main ? 'false' : 'true') + '" class="sr-pin' + (main ? ' main' : '') + '" data-ctn="' + p.id + '" title="' + esc(nm(p)) + (main ? '（固定首位）' : '（拖拽排序）') + '">' +
          '<span class="p-lb">' + esc(nm(p)) + '</span>' +
          '<span class="p-edit" draggable="false" role="button" aria-label="编辑名称与标签" title="编辑名称与标签">✎</span></button>';
      }).join('');
    }
    el.pinRow.querySelectorAll('[data-ctn]').forEach(function (b) {
      b.classList.toggle('active', parseInt(b.getAttribute('data-ctn'), 10) === st.currentId);
    });
  }
  function renderCtnPop() {
    var html = '', RC = railCtns();
    for (var g = 0; g < TAG_GROUPS.length; g++) {
      var list = RC.filter(function (c) {
        return c.tags.some(function (t) { return TAG_GROUPS[g].tags.indexOf(t) >= 0; });
      });
      if (!list.length) continue;
      html += '<div class="sr-grp">' + TAG_GROUPS[g].g + '</div>';
      for (var i = 0; i < list.length; i++) html += ctnItemHtml(list[i]);
    }
    var customC = RC.filter(function (c) {
      return c.tags.some(function (t) { return CUSTOM.indexOf(t) >= 0; });
    });
    if (customC.length) {
      html += '<div class="sr-grp">自定义标签</div>';
      for (var k = 0; k < customC.length; k++) html += ctnItemHtml(customC[k]);
    }
    var untag = RC.filter(function (c) { return c.tags.length === 0; });
    if (untag.length) {
      html += '<div class="sr-grp">未打标签</div>';
      for (var u = 0; u < untag.length; u++) html += ctnItemHtml(untag[u]);
    }
    el.srCtnPopBody.innerHTML = html || '<div class="sr-empty">没有容器</div>';
  }
  function ctnItemHtml(c) {
    return '<button type="button" class="sr-ctnitem' + (c.id === st.currentId ? ' cur' : '') + '" data-ctn="' + c.id + '" title="' + esc(nm(c)) + '（单击切换 · 双击设置）">' +
      '<span class="cin">' + esc(nm(c)) + '</span></button>';
  }
  function renderTagManage() {
    if (el.srTagManage.hidden) return;
    var h = '';
    var groups = TAG_GROUPS.concat(CUSTOM.length ? [{ g: '自定义', tags: CUSTOM.slice() }] : []);
    for (var g = 0; g < groups.length; g++) {
      h += '<div class="sr-grp">' + groups[g].g + '</div><div class="sr-tagwrap">';
      for (var t = 0; t < groups[g].tags.length; t++) {
        var tg = groups[g].tags[t];
        h += '<button type="button" class="sr-tag2' + (st.tags.indexOf(tg) >= 0 ? ' active' : '') + '" data-tg="' + esc(tg) + '">' +
          '<span class="t-dot" style="background:' + tagColor(tg) + '"></span>' + esc(tg) + '</button>';
      }
      h += '</div>';
    }
    el.srTagManageBody.innerHTML = h;
  }
  function renderSortPop() {
    if (el.srSortPop.hidden) return;
    var h = '';
    for (var i = 0; i < SORTS.length; i++) {
      var s = SORTS[i];
      h += '<button type="button" class="sr-sortopt' + (s.k === st.sort ? ' active' : '') + '" data-sort="' + s.k + '">' + s.label + '</button>';
    }
    el.srSortPopBody.innerHTML = h;
  }
  /* 设施排序弹层（v13.7 参考图样式：图标+文字独立按钮堆叠，选中=金色） */
  function fsortLabel(k) { for (var i = 0; i < FSORTS.length; i++) if (FSORTS[i].k === k) return FSORTS[i].label; return k; }
  function renderFootSortPop() {
    if (el.srFootSortPop.hidden) return;
    var h = '';
    for (var i = 0; i < FSORTS.length; i++) {
      var s = FSORTS[i];
      h += '<button type="button" class="sr-fsopt' + (s.k === st.sort ? ' active' : '') + '" data-fsort="' + s.k + '">' +
        '<span class="f-ico" aria-hidden="true">' + s.ico + '</span>' + s.label + '</button>';
    }
    el.srFootSortBody.innerHTML = h;
  }
  /* 交易买家条：当前交易对象名下品类加成 chips + 排序口径说明 */
  function renderTradeInfo() {
    var t = el.srTrade; if (!t) return;
    t.hidden = st.scene !== 'trade';
    if (t.hidden) return;
    var c = tradeCur(), ps = [];
    for (var k in c.prefs) {
      ps.push('<i class="ti-pref"><span class="t-dot" style="background:' + (CAT_COLORS[k] || '#b0a89a') + '"></span>' + k + ' +' + Math.round(c.prefs[k] * 100) + '%</i>');
    }
    t.innerHTML = '<button type="button" class="ti-buyer" title="每个交易点/人物各有品类喜好（演示：点击切换买家）">' + esc(c.n) + ' <span class="ti-arr" aria-hidden="true">▸</span></button>' +
      '<span class="ti-prefs">' + ps.join('') + '</span>' +
      '<span class="ti-mode" title="交易价值 = 单价 × 数量 × (1 + 品类加成)">按交易价值排序</span>';
  }
  function bindPinDrag() {
    var row = el.srPinRow;
    row.addEventListener('dragstart', function (e) {
      var b = e.target.closest('[data-ctn]'); if (!b) return;
      st.dragId = parseInt(b.getAttribute('data-ctn'), 10);
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(st.dragId)); } catch (x) { }
      b.classList.add('dragging');
    });
    row.addEventListener('dragend', function () {
      st.dragId = null;
      row.querySelectorAll('.sr-pin').forEach(function (b) { b.classList.remove('dragging', 'drop-before', 'drop-after'); });
      render();
    });
    row.addEventListener('dragover', function (e) {
      if (st.dragId == null) return;
      e.preventDefault();
      var b = e.target.closest('[data-ctn]');
      row.querySelectorAll('.sr-pin').forEach(function (x) { x.classList.remove('drop-before', 'drop-after'); });
      if (!b || parseInt(b.getAttribute('data-ctn'), 10) === st.dragId) return;
      var r = b.getBoundingClientRect();
      b.classList.add((e.clientX - r.left) < r.width / 2 ? 'drop-before' : 'drop-after');
    });
    row.addEventListener('drop', function (e) {
      e.preventDefault();
      var b = e.target.closest('[data-ctn]'); if (!b || st.dragId == null) return;
      var target = parseInt(b.getAttribute('data-ctn'), 10);
      if (target === st.dragId) return;
      /* 角色背包固定首位不参与排序，只在其余固定页签之间重排 */
      var fixedC = CTN.filter(function (x) { return x.pin && x.fixed; });
      var pins = CTN.filter(function (x) { return x.pin && !x.fixed; });
      if (target === (fixedC[0] && fixedC[0].id)) return;
      var from = -1, to = -1;
      for (var i = 0; i < pins.length; i++) {
        if (pins[i].id === st.dragId) from = i;
        if (pins[i].id === target) to = i;
      }
      if (from < 0 || to < 0) return;
      var r = b.getBoundingClientRect();
      var after = (e.clientX - r.left) >= r.width / 2;
      var order = pins.map(function (p) { return p.id; });
      order.splice(from, 1);
      order.splice(order.indexOf(target) + (after ? 1 : 0), 0, st.dragId);
      var pinMap = {};
      pins.forEach(function (p) { pinMap[p.id] = p; });
      var restCtn = CTN.filter(function (x) { return !x.pin; });
      CTN.length = 0;
      fixedC.forEach(function (p) { CTN.push(p); });
      order.forEach(function (id) { CTN.push(pinMap[id]); });
      restCtn.forEach(function (p) { CTN.push(p); });
      try { localStorage.setItem(pinKey(), JSON.stringify(order)); } catch (x) { }
    });
  }
  function renderTags() {
    var h = '<button type="button" class="sr-tag' + (!st.tags.length ? ' active' : '') + '" data-tag="__all">全部</button>';
    for (var i = 0; i < COMMON.length; i++) {
      var t = COMMON[i];
      h += '<button type="button" class="sr-tag' + (st.tags.indexOf(t) >= 0 ? ' active' : '') + '" data-tag="' + esc(t) + '">' +
        '<span class="t-dot" style="background:' + tagColor(t) + '"></span>' + esc(t) +
        '<span class="t-x" data-tx="' + esc(t) + '" role="button" aria-label="移除标签">×</span></button>';
    }
    el.srTagRow.innerHTML = h;
    renderTagManage();
  }

  function render() {
    if (!st.scene) return;
    var c = ctn(), fiAll = visItems(), limited = st.global && fiAll.length > GLOBAL_LIMIT;
    var fi = limited ? fiAll.slice(0, GLOBAL_LIMIT) : fiAll;
    el.srTitle.textContent = st.global ? '全库搜索' : nm(c);
    /* 动作组：整理在任意容器可用（全库视图下对象不明，隐藏）；入库仅背包页（整理柜场景
       侧栏无背包页——背包是左侧官方面板，互转走官方转移按钮） */
    el.srTidy.hidden = !!st.global;
    el.srStoreAll.hidden = st.currentId !== 1 || st.scene === 'rack';
    el.srCols.textContent = COLS + ' 列';
    el.srCap.textContent = ' · ' + (st.global ? totalCap() + ' 格' : c.cap + ' 格');
    el.srTags.textContent = st.global ? ' · ' + CTN.length + ' 个容器' : (c.tags.length ? ' · ' + c.tags.join('·') : '');
    el.srScope.textContent = st.global ? '全库' : '本柜';
    el.srScope.classList.toggle('active', st.global);
    el.srSeg.classList.toggle('lock', st.global);
    el.srSortLbl.textContent = sortLabel();
    el.srDir.textContent = st.dir === 1 ? '↓' : '↑';
    el.srDir.title = st.dir === 1 ? '当前：数值高在前（点击切倒序）' : '当前：数值低在前（点击切回）';
    /* v13.5/v13.7：食品类设施页脚排序按钮（左下角，参考图样式）+ 交易买家条 + 格子数值角标 */
    el.srFoodSort.hidden = FOODS.indexOf(st.scene) < 0;
    renderTradeInfo();
    if (!el.srFootSortPop.hidden) renderFootSortPop();
    BADGE = badgeMode();
    el.srFill.textContent = st.global
      ? '匹配 ' + fiAll.length + ' 件' + (limited ? '（显示前 ' + GLOBAL_LIMIT + '）' : '')
      : fi.length + ' / ' + st.cap + ' 格';
    var natH = st.rows * (SLOT + GAP) + 8, canScroll = !st.global && natH > el.srBody.clientHeight + 2;
    el.srView.textContent = st.global ? '全库模式' : st.rows + ' 行 · ' + (canScroll ? '↓ 纵向滚动' : '全部可见');

    var seg = el.srSeg.querySelectorAll('[data-mode]');
    for (var s = 0; s < seg.length; s++) seg[s].classList.toggle('active', seg[s].getAttribute('data-mode') === st.mode);
    renderCtnBar(); renderTags();
    if (!el.srSortPop.hidden) renderSortPop();

    if (st.mode === 'grid' && !st.global) {
      el.srGrid.hidden = false; el.srList.hidden = true;
      el.srGrid.style.gridTemplateColumns = 'repeat(' + COLS + ', ' + SLOT + 'px)';
      var h = '';
      /* 容器本身空（如一键入库后的背包）= 画满空格；有货但筛完为 0 = 提示无匹配 */
      if (!fi.length && st.items.length) h = '<div class="sr-empty">没有匹配的物品</div>';
      else for (var i = 0; i < st.rows * COLS; i++) h += i < fi.length ? slotHtml(fi[i], 'sr-slot') : '<div class="sr-slot empty"></div>';
      el.srGrid.innerHTML = h;
    } else {
      el.srGrid.hidden = true; el.srList.hidden = false;
      var d = DYN[st.sort] || DYN.value;
      /* 列表 = 同名汇总：一行一种物品，数量 = 各叠合计（右键取 1，Shift+右键整行） */
      var groups = [], byName = {};
      for (var j = 0; j < fi.length; j++) {
        var it = fi[j];
        var g = byName[it.name];
        if (!g) {
          g = { name: it.name, emoji: it.emoji, cat: it.cat, total: 0, entries: [], minShelf: it.shelf, val: 0, srcs: [] };
          byName[it.name] = g; groups.push(g);
        }
        g.total += it.count; g.entries.push(it);
        g.val += it.value * it.count;
        if (it.shelf < g.minShelf) g.minShelf = it.shelf;
        if (it.src && g.srcs.indexOf(it.src) < 0) g.srcs.push(it.src);
      }
      LISTGRP = groups;
      var lh = '<div class="sr-lhead"><span></span><span>物品</span><span class="num">数量</span><span class="num">' + d.label + '</span></div>';
      for (var gi = 0; gi < groups.length; gi++) {
        var g2 = groups[gi];
        var dyn = st.sort === 'value' ? g2.val : d.f(g2.entries[0]);
        lh += '<button type="button" class="sr-row' + (st.sel === g2.entries[0].id ? ' selected' : '') + '" data-grp="' + gi + '" data-it="' + g2.entries[0].id + '">' +
          '<span class="ico">' + g2.emoji + '</span><span class="main"><span class="nm">' + esc(g2.name) + '</span>' +
          '<span class="sub">' + g2.cat + ' · ' + g2.entries.length + ' 叠 · 保质 ' + g2.minShelf + 'h' +
          (g2.srcs.length ? ' · <i class="src">' + esc(g2.srcs[0]) + (g2.srcs.length > 1 ? ' 等' + g2.srcs.length + ' 处' : '') + '</i>' : '') +
          '</span></span><span class="cnt">×' + g2.total + '</span><span class="dyn">' + dyn + '</span></button>';
      }
      if (!fi.length) lh = '<div class="sr-empty">没有匹配的物品</div>';
      el.srList.innerHTML = lh;
    }
    renderBagPanel();
    if (typeof fitPage === 'function') fitPage();
  }

  /* ================= v13.2 取用/整理物资：官方页 iframe 真渲染 =================
     mod 改造点（仅此三项，其余官方原生）：
     ① 宽度统一 12 列（mock gridCols=12；正式实现=数据层包/柜 cols 统一 12）
     ② 高度扩容+纵向滚动（max-height+overflow+scrollbar-gutter:stable 不压格）
     ③ 柜子面板不显示负重条（.weight-section 隐藏；取用=整个面板即柜子；整理物资=B 侧柜子）
     取用=单柜面板（InfoAMsg 绑柜子 + canTag:true → 头部=柜名·分类标签按钮，官方原生渲染）；
     整理物资=官方双背包（InfoA/InfoB/ItemsA/ItemsB 喂数）。 */
  var ICOA2 = 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==#a';
  var ICOB2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==#b';
  function liveItem(id, x, y, n, ico) { return { id: id, x: x, y: y, w: 1, h: 1, icon: ico || ICOA2, name: '物品' + id, count: n || 3, quality: 3 }; }
  function liveBag(n, rows) {
    var out = [], id = 901;
    for (var y = 0; y < rows; y++) for (var x = 0; x < 12 && out.length < n; x++)
      out.push(liveItem(id++, x, y, 2 + ((id * 7) % 40), (x + y) % 3 === 0 ? ICOB2 : ICOA2));
    return out;
  }
  function livePost(fr, type, data) { try { fr.contentWindow.postMessage({ type: type, data: data }, '*'); } catch (e) { } }
  function liveMods(fr, extra) {
    try {
      var d = fr.contentDocument;
      var st = d.createElement('style');
      st.setAttribute('data-proto-mod', '1');
      st.textContent = '/* mod 点②③ */' +
        '.grid-container{max-height:560px;overflow-y:auto;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:rgba(255,193,7,.5) transparent}' +
        '.grid-container::-webkit-scrollbar{width:8px}.grid-container::-webkit-scrollbar-thumb{background:rgba(255,193,7,.45);border-radius:4px}' +
        /* 滚动条不得压格：官方 JS 写死 .grid-container{width:cols*56px}+全页 border-box，滚动槽(~10px)会从
           该宽度里扣 → 格底 repeat(12,56px) 轨道与绝对定位物品层一起被顶进滚动条底下。
           content-box+行末 padding 让滚动槽加在官方宽度之外：格底/物品恢复完整 12×56，滚动条独立在右侧 */
        '.grid-container{box-sizing:content-box;padding-right:12px}' +
        (extra || '');
      d.head.appendChild(st);
      var bd = d.createElement('div');
      bd.textContent = '原型 · 12列 · 高度滚动';
      bd.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:999;padding:4px 10px;border-radius:99px;background:rgba(20,24,36,.92);border:1px solid rgba(240,176,60,.55);color:#ffe1a0;font-size:12px;pointer-events:none';
      d.body.appendChild(bd);
    } catch (e) { }
  }
  function feedLive(fr, kind) {
    if (kind === 'access') {
      /* 取用=单柜面板：柜名+分类标签按钮（canTag），无负重条 */
      livePost(fr, 'WebUI_Backpack_InfoAMsg', { ownerId: 900103, backpackName: '床头柜', gridCols: 12, gridRows: 14, currentWeight: 0, maxWeight: 0 });
      /* 分类标签按钮：canTag 在 InfoBMsg 处理器里（官方结构）——单袋形态补喂一笔仅翻 canTag，
         不带其余字段（bagB 不参与 single 渲染）→ 头部= 柜名 · ＋分类（官方原生） */
      livePost(fr, 'WebUI_Backpack_InfoBMsg', { canTag: true });
      livePost(fr, 'WebUI_Backpack_ItemsAMsg', { itemsJson: JSON.stringify(liveBag(60, 14).map(function (it) { it.id += 700; it.name = '柜藏' + it.id; return it; })) });
      liveMods(fr, '.weight-section{display:none !important}'); /* mod 点③：柜子无负重条 */
    } else if (kind === 'backpack') {
      /* v13.3 单独背包=B 键纯背包页：对齐整理物资背包侧（同一只 仓管背包·12列·同数据），
         负重条保留（mod 点③只藏柜侧），无 InfoB/canTag（单袋形态，头部无分类按钮） */
      livePost(fr, 'WebUI_Backpack_InfoAMsg', { ownerId: 900001, backpackName: '仓管背包', gridCols: 12, gridRows: 12, currentWeight: 8, maxWeight: 60 });
      livePost(fr, 'WebUI_Backpack_ItemsAMsg', { itemsJson: JSON.stringify(liveBag(48, 12)) });
      liveMods(fr, '');
    } else {
      livePost(fr, 'WebUI_Backpack_InfoAMsg', { ownerId: 900001, backpackName: '仓管背包', gridCols: 12, gridRows: 12, currentWeight: 8, maxWeight: 60, isDualBag: true });
      livePost(fr, 'WebUI_Backpack_InfoBMsg', { ownerId: 900103, backpackName: '床头柜', gridCols: 12, gridRows: 12, currentWeight: 0, maxWeight: 0, canTag: true });
      livePost(fr, 'WebUI_Backpack_ItemsAMsg', { itemsJson: JSON.stringify(liveBag(48, 12)) });
      livePost(fr, 'WebUI_Backpack_ItemsBMsg', { itemsJson: JSON.stringify(liveBag(40, 12).map(function (it) { it.id += 500; it.name = '柜藏' + it.id; return it; })) });
      liveMods(fr, '.bag-panel.is-storage .weight-section{display:none !important}'); /* mod 点③：柜侧无负重条（背包侧保留） */
    }
  }
  function setSceneLive(key) {
    var kind = DATA.scenes[key].live;
    var g = document.getElementById('gpage');
    /* width:100% 必须显式给：.gfit 绝对定位无宽度会 shrink-to-fit 塌到 iframe 默认 300px，
       官方页 applyViewportFit 按容器算 zoom → 整页被压到 ~17%（"放大镜"病根） */
    g.innerHTML = '<div class="gfit" style="width:100%;height:100%">' + DATA.scenes[key].body + '</div>';
    var fr = g.querySelector('iframe.proto-live');
    if (!fr) return;
    fr.style.cssText = 'width:100%;height:100%;border:0;border-radius:14px;background:#111;display:block';
    var fed = 0;
    fr.addEventListener('load', function () { setTimeout(function () { feedLive(fr, kind); }, 500); });
    var t = setInterval(function () {
      fed++;
      try { if (fr.contentDocument && fr.contentDocument.body && fr.contentDocument.body.children.length) { feedLive(fr, kind); if (fed > 5) clearInterval(t); } } catch (e) { }
      if (fed > 20) clearInterval(t);
    }, 1200);
  }

  /* 场景切换：换官方页 DOM + 启用对应 CSS + 载入该场景的页签顺序/快捷标签 + 回入口默认容器 + 插入侧栏 */
  function setScene(key) {
    st.scene = key;
    /* v13.2：取用/整理物资=官方页 iframe 真渲染场景——不注入 rail，喂数+mod CSS */
    if (DATA.scenes[key] && DATA.scenes[key].live) { setSceneLive(key); return; }
    loadScenePrefs();
    st.currentId = SCENE_DEF[key] || 1;
    /* B 键单独背包 = 纯背包页：柜子页签栏/全库切换都不显示（bagonly），跨柜搜索一并关闭 */
    if (key === 'backpack' && st.global) { st.global = false; st.mode = st.prevMode || 'grid'; }
    /* 机器界面（plain，v13.5）：搜索/快捷标签/工具行不显示 → 固定网格+本柜+清筛选；
       排序随场景：食品类设施=官方默认（页脚左下角可改），交易=计算后交易价值，其余=官方默认 */
    if (PLAIN.indexOf(key) >= 0) {
      st.global = false; st.mode = 'grid'; st.tags = []; st.query = ''; st.dir = 1;
      st.sort = key === 'trade' ? 'tvalue' : 'official';
    } else if (st.sort === 'official' || st.sort === 'tvalue') st.sort = 'value';
    applySize(ctn().cap);
    st.sel = null;
    var styles = root.querySelectorAll('style.gs');
    for (var i = 0; i < styles.length; i++) styles[i].disabled = (styles[i].id !== 'gs-' + key);
    var g = document.getElementById('gpage');
    g.innerHTML = '<div class="gfit">' + DATA.scenes[key].body + '</div>';
    // 图片占位（相对路径在原型里不可达）
    var imgs = g.querySelectorAll('img');
    for (var m = 0; m < imgs.length; m++) imgs[m].src = 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
    // 插入侧栏（v13：整理柜 = 三段壳，左/右物品区=官方原件占位[实现 reparent]，跨柜=rackOpen）
    var host = findRailHost(g);
    var rail = document.createElement('div');
    rail.className = 'sr-rail ' + DATA.scenes[key].shell + (key === 'backpack' ? ' bagonly' : '') +
      (PLAIN.indexOf(key) >= 0 ? ' plain' : '') + (key === 'trade' ? ' trade' : '');
    rail.id = 'srRail';
    rail.innerHTML = RAIL_HTML;
    if (key === 'rack') {
      var duo = document.createElement('div');
      duo.className = 'sr-duo';
      var bp = document.createElement('div');
      bp.className = 'sr-rail bagpanel';
      bp.id = 'srBagP';
      bp.innerHTML = BAGPANEL_HTML;
      /* v13.1（作者 2026-10-31 裁决）：右段=**普通存储取物面板**——仅 柜名标题+格数副标+
         官方格网格+底栏用量；页签栏/搜索栏/快捷标签栏/排序栏/网格列表切换 一律不要 */
      /* 中段转移按钮列（v13 口径）：「全部取出◀」「放入▶」= 官方 btnTakeAll/btnPutAll 原件
         （实现 reparent，官方监听原样）；「分类取出/分类放入/按标签放入」= mod 增值按钮
         （官方 .transfer-btn 样式，C# 命令通道）。右段物品区 = 官方 #panelB 汇总行原件占位。 */
      var mid = document.createElement('div');
      mid.className = 'transfer-controls';
      mid.innerHTML =
        '<button class="transfer-btn transfer-btn-primary btn-dir-left" id="srTakeAll" type="button" title="右侧当前柜全部取出到背包（整叠，背包满跳过）"><span class="btn-arrow">◀</span><span class="btn-label">全部取出</span></button>' +
        '<div class="category-dropdown-wrapper">' +
        '<button class="transfer-btn category-dropdown-btn btn-dir-left" id="srTakeCat" type="button"><span class="btn-arrow">◀</span><span class="btn-label">分类取出</span></button>' +
        '<div class="category-dropdown" id="srTakeCatMenu" hidden></div></div>' +
        '<div class="transfer-controls-spacer"></div>' +
        '<button class="transfer-btn transfer-btn-primary btn-dir-right" id="srPutAll" type="button" title="背包全部放入右侧当前柜（整叠，柜满跳过）"><span class="btn-label">放入</span><span class="btn-arrow">▶</span></button>' +
        '<div class="category-dropdown-wrapper">' +
        '<button class="transfer-btn category-dropdown-btn btn-dir-right" id="srPutCat" type="button"><span class="btn-label">分类放入</span><span class="btn-arrow">▶</span></button>' +
        '<div class="category-dropdown" id="srPutCatMenu" hidden></div></div>' +
        '<button class="transfer-btn tag-putin-btn" id="srTagPutIn" type="button" title="按右侧柜子的标签规则放入（背包中分类命中标签的物品）">' +
        '<span class="putin-row" id="srTagChips"></span>' +
        '<span class="putin-row putin-main"><span class="btn-label">按标签放入</span><span class="btn-arrow">▶</span></span>' +
        '</button>';
      var plain = document.createElement('div');
      plain.className = 'sr-rail ctnpanel';
      plain.id = 'srCtnP';
      var curCtn = ctnById(st.currentId) || CTN[1];
      plain.innerHTML =
        '<div class="sr-head"><div class="sr-headtxt"><div class="sr-title">' + esc(curCtn.name) + '</div>' +
        '<div class="sr-sub"><b>' + COLS + ' 列</b><span> · ' + curCtn.cap + ' 格</span></div></div></div>' +
        '<div class="sr-body" id="scBody"><div class="sr-grid" id="scGrid"></div></div>' +
        '<div class="sr-hover" id="scHover">官方原件区 · 拖拽/右键/高亮键（官方原生）</div>' +
        '<div class="sr-foot"><div class="sr-foot-l"><span id="scFill"></span><span class="fr" id="scView"></span></div></div>';
      duo.appendChild(bp);
      duo.appendChild(mid);
      duo.appendChild(plain);
      host.parentNode.replaceChild(duo, host);
    } else {
      host.parentNode.replaceChild(rail, host);
    }
    bind();
    bindBagPanel();
    el.rail = rail;
    refreshAll();
  }
  function findRailHost(g) {
    var w = document.createTreeWalker(g, NodeFilter.SHOW_COMMENT, null);
    var n; while ((n = w.nextNode())) if (n.nodeValue === 'RAIL') return n;
    throw new Error('RAIL host not found');
  }

  /* 控制行：只有场景切换 */
  document.getElementById('controls').addEventListener('click', function (e) {
    var sc = e.target.closest('[data-scene]');
    if (!sc) return;
    setScene(sc.getAttribute('data-scene'));
    var all = this.querySelectorAll('[data-scene]');
    for (var i = 0; i < all.length; i++) all[i].classList.toggle('scb-on', all[i] === sc);
    fitPage(); fit();
  });

  /* 1:1 缩放：整块画布永远 1536×864，只按窗口等比缩放；页内容恒定，不随柜子/容器变化 */
  var fitwrap = document.getElementById('fitwrap');
  function fit() {
    var w = fitwrap.clientWidth || 960, s = Math.min(1, w / 1536);
    var g = document.getElementById('gpage');
    g.style.transform = s < 1 ? 'scale(' + s + ')' : '';
    fitwrap.style.height = (864 * s + 2) + 'px';
    var badge = document.getElementById('scaleBadge');
    if (badge) badge.textContent = '1536×864 · ' + Math.round(s * 100) + '%';
  }
  /* 页内容适配（同游戏 createViewportFit）：仅当某场景天然超出 1536×864 时等比缩小；
     侧栏高度恒定 816px，同一场景内切柜不再改变页面尺寸 */
  function fitPage() {
    var gf = document.querySelector('#srp .gfit');
    if (!gf) return;
    gf.style.transform = '';
    var w = gf.scrollWidth, h = gf.scrollHeight;
    var k = Math.min(1, 1536 / w, 864 / h);
    gf.style.transform = 'translate(-50%,-50%)' + (k < 1 ? ' scale(' + k + ')' : '');
  }
  window.addEventListener('resize', function () { fitPage(); fit(); });

  try {
    var nt = JSON.parse(localStorage.getItem('srp_ctn_names') || 'null');
    if (nt && typeof nt === 'object') NAMES = nt;
    var tg = JSON.parse(localStorage.getItem('srp_ctn_tags') || 'null');
    if (tg && typeof tg === 'object') {
      TAGOV = tg;
      CTN.forEach(function (c) { if (Array.isArray(TAGOV[c.id])) c.tags = TAGOV[c.id].slice(); });
    }
    var cu = JSON.parse(localStorage.getItem('srp_custom_tags') || 'null');
    if (Array.isArray(cu)) CUSTOM = cu;
  } catch (e) { }
  setScene('cook');
  fitPage();
  fit();
})();
