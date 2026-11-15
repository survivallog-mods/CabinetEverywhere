// cookfx.proto.js —— 烹饪界面改造原型（设计 §5.1/§5.2 前端侧形态验证）
// 实机形态：本段逻辑并入 railui.page.js Cooking 场景段；数据来自 C# 侧通道
// window.__CEFX__.setRecipes（静态排序键表）/ setPred（这一锅区间包）。
// 纪律：排序=DOM 节点重排（观察器自动重挂，零触碰官方数据流）；区间 chips=壳层 overlay。
(function () {
  'use strict';

  var DIM_LABEL = ['饱腹', '心态', '精力', '生命'];   // 悬停提示用（vd5 活力数据带全、暂不渲染）
  // 属性图标（作者批改#1：不用文字标签；批改#3：用官方原生字形）：
  // 官方 HUD 五维在 CoreUI1（WebView），图标=C# 下发的 attrIcon 字形（unicode 字符）。
  // C# 侧运行时读 State_Web_CoreUI1.AttrList（AttrNameKey 枚举→AttrIcon.Value）随数据包下发；
  // 读不到（HUD 未激活/字段缺失/字形空）回退内联 SVG。
  var DIM_ICON = [
    '<svg viewBox="0 0 16 16"><path d="M2.5 8h11a5.5 5.5 0 0 1-11 0z" fill="currentColor"/><circle cx="8" cy="5.6" r="1.7" fill="currentColor"/></svg>',                                        // 饱腹=饭碗（回退）
    '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.1" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="5.9" cy="7.1" r="1" fill="currentColor"/><circle cx="10.1" cy="7.1" r="1" fill="currentColor"/><path d="M5.5 9.9a3.3 3.3 0 0 0 5 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',  // 心态=笑脸（回退）
    '<svg viewBox="0 0 16 16"><path d="M9.2 1.5 3.8 9.2h3L6.2 14.5 12.5 6.8H9.4z" fill="currentColor"/></svg>',                                                                               // 精力=闪电（回退）
    '<svg viewBox="0 0 16 16"><path d="M8 13.8C4.6 11.4 2 9.3 2 6.6 2 4.6 3.6 3 5.6 3c1 0 2 .5 2.4 1.3C8.4 3.5 9.4 3 10.4 3 12.4 3 14 4.6 14 6.6c0 2.7-2.6 4.8-6 7.2z" fill="currentColor"/></svg>' // 生命=心（回退）
  ];
  var iconPack = null;   // 官方字形包 {d0:'🍗',d1:'🙂',d2:'⚡',d3:'❤'}（C# setIcons 下发；null=SVG 回退态）
  function dimIcon(i) {
    var g = iconPack && iconPack['d' + i];
    return g ? '<span class="cefx-glyph">' + g + '</span>' : DIM_ICON[i];
  }
  var LS_KEY = 'cefx_sort_v1';

  var recipes = null;      // {rid: [vd1..vd5]}
  var sortDim = -1;        // -1=默认官方序；0..3=按维降序
  var predPack = null;

  window.__CEFX__ = {
    setRecipes: function (json) { recipes = typeof json === 'string' ? JSON.parse(json) : json; renderChips(); applySort(); },
    setPred: function (json) { predPack = typeof json === 'string' ? JSON.parse(json) : json; renderPred(); },
    setIcons: function (json) { iconPack = typeof json === 'string' ? JSON.parse(json) : json; renderPred(); },  // 官方字形包（批改#3）
    setSort: function (dim) { sortDim = dim; try { localStorage.setItem(LS_KEY, '' + dim); } catch (e) {} renderChips(); applySort(); }
  };

  // ---- 排序 chips（菜谱书头部注入）----
  function renderChips() {
    var host = document.getElementById('cefxChips');
    if (!host) return;
    var keys = [-1, 0, 1, 2, 3];
    var names = { '-1': '默认' };
    DIM_LABEL.forEach(function (n, i) { names['' + i] = n; });
    host.innerHTML = '';
    keys.forEach(function (k) {
      var c = document.createElement('span');
      c.className = 'cefx-chip' + (k === sortDim ? ' on' : '');
      c.textContent = names['' + k];
      c.onclick = function () { window.__CEFX__.setSort(k); };
      host.appendChild(c);
    });
  }

  // ---- DOM 稳定重排：有键降序在前 → 无键保持官方相对序 → 锁定垫尾 ----
  // 自触发环防线（spike 实测抓到：观察器回调里 appendChild 又触发观察器 → 无限环卡死主线程）：
  // ①applying 重入门卫；②目标序与当前序一致时零 DOM 操作早退。
  // 官方序快照 officialOrder：每次官方重建（观察器沿，非自身操作）先记 rids——
  // "默认"chip 靠它还原官方序（spike 实测抓到：默认态 no-op 会残留上次排序序）。
  var applying = false;
  var officialOrder = null;   // [rid...]，官方最近一次渲染顺序

  function snapshotOfficial() {
    var list = document.getElementById('bookList');
    if (!list) return;
    var rids = Array.prototype.map.call(list.children, function (el) { return el.dataset.rid; });
    if (rids.length) officialOrder = rids;
  }

  function applySort() {
    var list = document.getElementById('bookList');
    if (!list || !recipes || applying) return;
    var items = Array.prototype.slice.call(list.children);
    if (items.length < 2) return;
    var offIdx = {};   // 官方序下标（无快照时用当前 DOM 序）
    (officialOrder || items.map(function (el) { return el.dataset.rid; })).forEach(function (r, i) { offIdx[r] = i; });
    var order;
    if (sortDim < 0) {
      order = items.slice().sort(function (a, b) { return offIdx[a.dataset.rid] - offIdx[b.dataset.rid]; });
    } else {
      order = items
        .map(function (el) {
          var vd = recipes[el.dataset.rid];
          return { el: el, rid: parseInt(el.dataset.rid, 10) || 0, key: vd ? vd[sortDim] : null, locked: el.classList.contains('craft-locked') };
        })
        .sort(function (a, b) {
          if (a.locked !== b.locked) return a.locked ? 1 : -1;        // 锁定垫尾
          var ax = a.key != null, bx = b.key != null;
          if (ax && bx) return b.key - a.key || a.rid - b.rid;        // 降序，同值按 ID 升序（确定性，作者批改#2）
          if (ax !== bx) return ax ? -1 : 1;                           // 无键垫底（组内也按 ID）
          return a.rid - b.rid;
        })
        .map(function (x) { return x.el; });
    }
    var cur = items.map(function (el) { return el.dataset.rid; }).join(',');
    var want = order.map(function (el) { return el.dataset.rid; }).join(',');
    if (cur === want) return;                                          // 序未变零操作
    // 自触发环 + 快照污染双防线（spike 实测两连环抓到）：
    // applying 在本次同步移动后经 queueMicrotask 复位——观察器回调是紧随的微任务，
    // 若同步复位（finally），回调执行时标志已 false，自身移动会被误判为官方重建、
    // 污染 officialOrder 快照（"默认"从此还原成污染序）。排队复位让标志穿过该回调。
    applying = true;
    try { order.forEach(function (el) { list.appendChild(el); }); }
    finally { queueMicrotask(function () { applying = false; }); }
  }

  // 官方重渲染自动重挂（实机=Vue 重建菜谱容器；harness=打乱按钮）
  function watchList() {
    var list = document.getElementById('bookList');
    if (!list) return;
    new MutationObserver(function () {
      if (applying) return;
      snapshotOfficial();   // 官方重建沿：先记官方序再重挂
      applySort();
      renderPred();
    }).observe(list, { childList: true });
  }

  // ---- 这一锅区间 chips（已知菜谱 Level===2 条目行内注入）----
  function fmt(lo, hi) {
    var f = function (v) { var r = Math.round(v * 10) / 10; return r === Math.floor(r) ? '' + r : r.toFixed(1); };
    return Math.abs(hi - lo) < 0.05 ? f(lo) : f(lo) + '~' + f(hi);
  }

  function renderPred() {
    var host = document.getElementById('predList');
    if (!host) return;
    if (!predPack || !predPack.entries) { host.innerHTML = '<div class="pred-row"><span class="hint">锅内暂无匹配</span></div>'; return; }
    host.innerHTML = '';
    predPack.entries.forEach(function (e) {
      var row = document.createElement('div');
      row.className = 'pred-row';
      var html = '<div class="nm">' + e.name + '</div><div class="hint">' + e.hint + '</div>';
      if (e.dims) {
        html += '<div class="cefx-pred cefx-vd-wrap">';
        e.dims.forEach(function (d, i) {
          if (!d) return;                                    // 全 0 维不显示（null=数据层已隐藏）
          html += '<b class="cefx-vd' + (i + 1) + '" title="' + DIM_LABEL[i] + '">' +
                  '<i class="cefx-ico">' + dimIcon(i) + '</i>' + fmt(d[0], d[1]) + '</b>';
        });
        html += '</div>';
      }
      row.innerHTML = html;
      host.appendChild(row);
    });
  }

  // ---- 启动 ----
  try { sortDim = parseInt(localStorage.getItem(LS_KEY) || '-1', 10); if (isNaN(sortDim)) sortDim = -1; } catch (e) { sortDim = -1; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  function boot() {
    renderChips();
    watchList();
    snapshotOfficial();   // 首载官方序（harness 首渲染先于 DOMContentLoaded）
    // harness：fixtures 直接当 C# 首包；实机=探活后一次性 setRecipes + 刷新沿 setPred
    if (window.COOKFX_RECIPES) window.__CEFX__.setRecipes(window.COOKFX_RECIPES);
    renderPred();
  }
})();
