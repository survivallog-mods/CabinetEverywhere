/* cookingfx.page.js —— 烹饪界面改造前端（Cooking Recipe FX 批1/批2）。
 * C# bootstrap 注入 Root 文档执行（TagFilter 同位）；DOM 装进 Cooking 场景 iframe 文档
 * （#iframe-container iframe#Cooking，railui scanFrames 同款定位；harness 直跑同文档兜底）。
 * 数据入口（C# ExecuteJavaScript 直调）：
 *   window.__CEFX__.setRecipes(json)  静态排序键表 {菜名:[VD1..5,菜谱ID]}（Normal 档口径；
 *                                     键=菜名——官方 .book-item 不带 rid，行键只有 .book-nm 文本）
 *   window.__CEFX__.setPred(json)     这一锅区间包 {entries:[{recipeId,name,dims:[[min,max]|null×4]}]}
 *   window.__CEFX__.setIcons(json)    官方图标字形包 {d0..d4:字形}（CoreUI1 AttrIcon；缺=回退 SVG）
 * 实机选择器（2026-11-15 实机定版，源=官方 Cooking.html 979/1023/2358 行 + gamekb 取证）：
 *   菜谱列表=#recipeList（子项 .book-item/.book-nm）；预测=#predictionList（官方行 .pot-card/.pot-nm，
 *   append 模式=对官方行内挂 chips，不重建不抹除）；chips 容器插在 #recipePanelTitle 后。
 * harness 兼容：SEL 双值（官方值优先，harness 值兜底）；预测宿主无 .pot-card=重建模式（防抹守卫照旧）。
 * 三条重排硬约束（原型实测定版）：①自触发环防线（重入门卫+序未变零操作）；
 * ②applying 经 queueMicrotask 复位（防官方序快照污染）；③tiebreak=数值降序→同值 ID 升序→无键垫底→
 * craftLocked 垫尾。自愈（I1）：500ms 查装配痕迹，miss 即重 boot（railui scanFrames 同款）。 */
(function () {
  'use strict';
  if (window.__CEFX__) return; /* 幂等：C# 重复注入只生效一次 */

  var SEL = {
    frame: '#iframe-container iframe#Cooking',
    bookList: ['#recipeList', '#bookList'],
    predList: ['#predictionList', '#predList'],
    chipsAnchor: '#recipePanelTitle'
  };

  var DIM_LABEL = ['饱腹', '心态', '精力', '生命', '经验'];
  /* dim 槽位：0..3=VD1..VD4，4=经验（cookExp）。批改6③：生命维保留（作者令）——当前配置表
   * 食物 VD4 非零数为 0（排序恒垫底），图标用自绘 SVG 心（官方 d3 字形空、借 d4 的 ❤️ 游戏字体渲染斜） */
  var CHIP_DIMS = [-1, 0, 1, 2, 3, 4];
  /* 图标回退：内联 SVG 五枚（官方字形包缺失/空时；作者批改#3 官方字形优先；经验无官方字形恒 SVG 星） */
  var DIM_ICON = [
    '<svg viewBox="0 0 16 16"><path d="M2.5 8h11a5.5 5.5 0 0 1-11 0z" fill="currentColor"/><circle cx="8" cy="5.6" r="1.7" fill="currentColor"/></svg>',
    '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.1" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="5.9" cy="7.1" r="1" fill="currentColor"/><circle cx="10.1" cy="7.1" r="1" fill="currentColor"/><path d="M5.5 9.9a3.3 3.3 0 0 0 5 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    '<svg viewBox="0 0 16 16"><path d="M9.2 1.5 3.8 9.2h3L6.2 14.5 12.5 6.8H9.4z" fill="currentColor"/></svg>',
    '<svg viewBox="0 0 16 16"><path d="M8 13.8C4.6 11.4 2 9.3 2 6.6 2 4.6 3.6 3 5.6 3c1 0 2 .5 2.4 1.3C8.4 3.5 9.4 3 10.4 3 12.4 3 14 4.6 14 6.6c0 2.7-2.6 4.8-6 7.2z" fill="currentColor"/></svg>',
    '<svg viewBox="0 0 16 16"><path d="M8 1.6l1.9 4 4.4.5-3.3 3 1 4.3L8 11.2l-4 2.2 1-4.3-3.3-3 4.4-.5z" fill="currentColor"/></svg>'
  ];
  /* 排序键取值：dim 0/1/2=VD1..3（饱腹/心态/精力）；dim 3=生命=VD5(Vitality，表 idx4)——
   * 批改7 根因纠正：游戏文案 Vitality=「生命」、Health=「健康」(食物数据全 0)；dim 4=经验（idx6） */
  function sortKeyValue(vd, dim) {
    if (!vd) return null;
    if (dim === 3) return vd[4];
    return dim < 3 ? vd[dim] : vd[6];
  }
  var recipes = null;      /* {菜名:[vd1..vd5, id]} */
  var predPack = null;     /* {entries:[...]} */
  var iconPack = null;     /* {d0..d4:字形} 官方字形包（null=SVG 回退态） */
  var sortDim = -1;        /* -1=默认官方序；0..3=按维降序 */
  var chipsHost = null;    /* chips 容器（复用/自建） */
  var applying = false;    /* 硬约束①：重入门卫 */
  var officialOrder = null;/* 官方最近一次渲染顺序（"默认"还原依据） */
  var watched = false;     /* 观察器已挂（自愈重装时复位） */
  var predApplying = false;/* 预测观察器防自激门卫（批改5②） */
  var predWarned = false;  /* 防抹守卫告警一次 */
  var predOps = [];        /* 观察器触发时间窗（超频保险丝，卡死教训 v5） */
  var predFused = false;   /* 熔断告警一次 */

  /* ---- 目标文档：实机=Cooking iframe contentDocument；harness/兜底=当前文档 ---- */
  function doc() {
    try {
      var f = document.querySelector(SEL.frame);
      if (f && f.contentDocument && f.contentDocument.body) return f.contentDocument;
    } catch (e) { /* 跨文档异常按兜底 */ }
    return document;
  }

  function q(d, sels) {
    for (var i = 0; i < sels.length; i++) {
      var el = d.querySelector(sels[i]);
      if (el) return el;
    }
    return null;
  }

  function rowName(el) {
    var nm = el.querySelector('.book-nm, .nm');
    if (!nm) return null;
    /* 行键只取首个文本节点——行内排序值(span.cefx-sortval)注入 .book-nm 尾部后，
     * textContent 被"菜名+数值"污染会导致查表全失配（排序退化，实测定位） */
    for (var i = 0; i < nm.childNodes.length; i++) {
      var n = nm.childNodes[i];
      if (n.nodeType === 3 && (n.textContent || '').trim()) return n.textContent.trim();
    }
    return null;
  }

  function dimIcon(i) {
    /* 经验(4)/生命(3)恒自绘 SVG：经验无官方字形；生命官方 d3 字形空、借 d4 的 ❤️ 在游戏字体
     * 渲染是斜的（作者批改6③/5① 实测）——心形 SVG 正且稳定 */
    if (i === 4 || i === 3) return DIM_ICON[i];
    var g = iconPack && iconPack['d' + i];
    return g ? '<span class="cefx-glyph">' + g + '</span>' : DIM_ICON[i];
  }

  window.__CEFX__ = {
    setRecipes: function (json) { recipes = typeof json === 'string' ? JSON.parse(json) : json; renderChips(); applySort(); },
    setPred: function (json) { predPack = typeof json === 'string' ? JSON.parse(json) : json; renderPred(); },
    setIcons: function (json) { iconPack = typeof json === 'string' ? JSON.parse(json) : json; renderPred(); renderSortVals(); },
    setSort: function (dim) { sortDim = dim; renderChips(); applySort(); }
  };

  /* ---- CSS 自足注入（贴官方暖金暗色调）---- */
  function ensureCss(d) {
    if (d.getElementById('cefx-style')) return;
    var st = d.createElement('style');
    st.id = 'cefx-style';
    st.textContent =
      /* 批改5③：单行 chips（UX 指引 Compact Label Overflow——固定词标签 nowrap 不换行不截断） */
      '.cefx-chips{display:flex;flex-wrap:nowrap;gap:4px;margin:4px 0 6px;min-height:22px;justify-content:space-between;}' +
      '.cefx-chip{flex:1 1 0;padding:2px 4px;border-radius:9px;background:rgba(40,32,25,0.9);border:1px solid rgba(122,99,68,0.6);color:#c9b799;cursor:pointer;user-select:none;font-size:11px;text-align:center;white-space:nowrap;}' +
      '.cefx-chip.on{background:rgba(90,61,26,0.9);border-color:rgba(251,176,52,0.7);color:#ffd9a0;}' +
      '.cefx-pred{display:flex;flex-wrap:wrap;gap:3px;margin-top:3px;}' +
      '.cefx-pred b{font-weight:normal;font-size:10px;padding:1px 6px;border-radius:8px;display:inline-flex;align-items:center;gap:2px;white-space:nowrap;}' +
      '.cefx-pred b.cefx-vd1{background:rgba(58,51,32,0.85);color:#e6cf7e;}' +
      '.cefx-pred b.cefx-vd2{background:rgba(58,36,48,0.85);color:#e0a4cc;}' +
      '.cefx-pred b.cefx-vd3{background:rgba(32,57,58,0.85);color:#8fd4d8;}' +
      '.cefx-pred b.cefx-vd4{background:rgba(56,34,42,0.85);color:#e08c9c;}' +
      '.cefx-ico{display:inline-flex;width:12px;height:12px;flex-shrink:0;}' +
      '.cefx-ico svg{width:100%;height:100%;display:block;}' +
      '.cefx-ico .cefx-glyph{font-size:11px;line-height:1;}' +
      /* 批改5④：行尾右对齐——margin-left:auto 推到行尾紧贴 .st 状态徽章 */
      '.cefx-sortval{margin-left:auto;font-size:11px;font-weight:normal;color:#c9b799;display:inline-flex;align-items:center;gap:3px;flex-shrink:0;padding-right:6px;}' +
      '.cefx-sortval .cefx-ico{width:12px;height:12px;}';
    (d.head || d.documentElement).appendChild(st);
  }

  /* ---- 排序 chips（实机插 #recipePanelTitle 后；harness 复用 #cefxChips / bookList 前自建）---- */
  function ensureChipsHost(d) {
    if (chipsHost && d.contains(chipsHost)) return chipsHost;
    var existing = d.getElementById('cefxChips');
    if (existing) { chipsHost = existing; existing.classList.add('cefx-chips'); return existing; }
    var anchor = d.querySelector(SEL.chipsAnchor);
    if (anchor && anchor.parentNode) {
      chipsHost = d.createElement('div');
      chipsHost.className = 'cefx-chips';
      chipsHost.id = 'cefxChips';
      anchor.parentNode.insertBefore(chipsHost, anchor.nextSibling); /* 标题行与列表之间 */
      return chipsHost;
    }
    var list = q(d, SEL.bookList);
    if (!list || !list.parentNode) return null;
    chipsHost = d.createElement('div');
    chipsHost.className = 'cefx-chips';
    chipsHost.id = 'cefxChips';
    list.parentNode.insertBefore(chipsHost, list);
    return chipsHost;
  }

  function renderChips() {
    var d = doc();
    var host = ensureChipsHost(d);
    if (!host) return;
    host.innerHTML = '';
    CHIP_DIMS.forEach(function (k) {
      var c = d.createElement('span');
      c.className = 'cefx-chip' + (k === sortDim ? ' on' : '');
      c.textContent = k < 0 ? '默认' : DIM_LABEL[k];
      c.onclick = function () { window.__CEFX__.setSort(k); };
      host.appendChild(c);
    });
  }

  /* ---- 行内排序值（作者批改4③+5④：排序时行尾显示 图标+数值，右对齐紧贴填装/就绪按钮）---- */
  function fmtSingle(v) { var r = Math.round(v * 10) / 10; return r === Math.floor(r) ? '' + r : r.toFixed(1); }

  function renderSortVals(d) {
    d = d || doc();
    var list = q(d, SEL.bookList);
    if (!list) return;
    Array.prototype.forEach.call(list.children, function (el) {
      var old = el.querySelectorAll('.cefx-sortval');
      old.forEach(function (x) { x.remove(); });
      if (sortDim < 0) return;
      var vd = recipes[rowName(el)];
      var v = sortKeyValue(vd, sortDim);
      if (v == null) return;
      var span = d.createElement('span');
      span.className = 'cefx-sortval';
      span.innerHTML = '<i class="cefx-ico">' + dimIcon(sortDim) + '</i>' + fmtSingle(v);
      /* 批改6②+7：有状态徽章（官方 .st-ready/.st-fill）插徽章前＝按钮左侧；材料不足行官方无徽章
       * （stHtml=''，行尾即 book-bd）——直接 append 行尾，margin-left:auto 右推（防插到图标与菜名间） */
      var badge = el.querySelector('.st-ready, .st-fill');
      if (badge) el.insertBefore(span, badge);
      else el.appendChild(span);
    });
  }

  /* ---- 官方序快照（观察器沿更新；首载即记）---- */
  function snapshotOfficial(d) {
    var list = q(d, SEL.bookList);
    if (!list) return;
    var names = Array.prototype.map.call(list.children, rowName);
    if (names.length) officialOrder = names;
  }

  /* ---- DOM 稳定重排（三条硬约束；行键=菜名；作者批改4①：可制作分层主键——
   *     ready|fillable 组在前、insuff 组次之、craftLocked 垫尾，层内属性降序→同值 ID）---- */
  function applySort(d) {
    d = d || doc();
    var list = q(d, SEL.bookList);
    if (!list || !recipes || applying) { renderSortVals(d); return; }
    var items = Array.prototype.slice.call(list.children);
    if (items.length < 2) { renderSortVals(d); return; }
    renderSortVals(d); /* 行内值与序独立刷新（切维时序可能同但值必须换） */
    var offIdx = {};
    (officialOrder || items.map(rowName)).forEach(function (r, i) { offIdx[r] = i; });
    var off = function (el) { var v = offIdx[rowName(el)]; return v === undefined ? 1e9 : v; }; /* 新解锁名不在快照→垫尾 */
    var order;
    if (sortDim < 0) {
      order = items.slice().sort(function (a, b) { return off(a) - off(b); });
    } else {
      var tier = function (el) {
        if (el.classList.contains('craft-locked')) return 2;                       /* 锁定垫尾 */
        return (el.classList.contains('ready') || el.classList.contains('fillable')) ? 0 : 1; /* 可制作在前 */
      };
      order = items
        .map(function (el) {
          var vd = recipes[rowName(el)];
          return { el: el, id: vd ? vd[5] : 0, key: sortKeyValue(vd, sortDim), t: tier(el) };
        })
        .sort(function (a, b) {
          if (a.t !== b.t) return a.t - b.t;                        /* 可制作分层主键（批改4①） */
          var ax = a.key != null, bx = b.key != null;
          if (ax && bx) return b.key - a.key || a.id - b.id;        /* 层内降序，同值 ID 升序（批改#2） */
          if (ax !== bx) return ax ? -1 : 1;                         /* 无键垫底（负键算有键） */
          return a.id - b.id;
        })
        .map(function (x) { return x.el; });
    }
    var cur = items.map(rowName).join('\u0001');
    var want = order.map(rowName).join('\u0001');
    if (cur === want) return;                                       /* 硬约束①：序未变零操作 */
    /* 硬约束②：applying 经 queueMicrotask 复位——同步复位会让紧随的观察器微任务误判官方重建 */
    applying = true;
    try { order.forEach(function (el) { list.appendChild(el); }); }
    finally { queueMicrotask(function () { applying = false; }); }
  }

  /* ---- 观察器：官方重渲染自动重挂（先记官方序再重挂）---- */
  function watchList(d) {
    d = d || doc();
    if (watched) return;
    var list = q(d, SEL.bookList);
    if (!list) return;
    watched = true;
    new MutationObserver(function () {
      if (applying) return;
      snapshotOfficial(d);
      applySort(d);
      renderPred();
    }).observe(list, { childList: true });
    /* 批改5②：预测容器观察器——官方预测行（.pot-card）常在 C# 区间包之后才渲染（竞态=「有时不显示」根因），
     * 行增删沿重挂 chips。实机卡死教训（v5）：禁止 subtree——chips 注入/hint 删除都在行的孙级，
     * subtree 会把官方行内任何高频更新放大成全清重挂风暴；无 subtree 只看直接子级行增删，
     * 孙级注入天然不触发观察器（免自激双保险，predApplying 仍保留）。超频保险丝兜底任何残留源。 */
    var pred = q(d, SEL.predList);
    if (pred) {
      new MutationObserver(function () {
        var now = Date.now();
        predOps = predOps.filter(function (t) { return now - t < 1000; });
        if (predOps.length >= 20) { /* >20 次/秒=异常风暴，熔断本轮 */
          if (!predFused) { predFused = true; try { console.warn('[CookingFx] 预测观察器超频熔断'); } catch (e) { } }
          return;
        }
        predOps.push(now);
        renderPred();
      }).observe(pred, { childList: true });
    }
  }

  /* ---- 这一锅区间 chips（图标+数值，全 0 维隐藏）---- */
  function fmt(lo, hi) {
    var f = function (v) { var r = Math.round(v * 10) / 10; return r === Math.floor(r) ? '' + r : r.toFixed(1); };
    return Math.abs(hi - lo) < 0.05 ? f(lo) : f(lo) + '~' + f(hi);
  }

  function chipsHtml(entry) {
    if (!entry.dims) return '';
    var html = '<div class="cefx-pred">';
    entry.dims.forEach(function (dim, i) {
      if (!dim) return;
      html += '<b class="cefx-vd' + (i + 1) + '" title="' + DIM_LABEL[i] + '">' +
              '<i class="cefx-ico">' + dimIcon(i) + '</i>' + fmt(dim[0], dim[1]) + '</b>';
    });
    return html + '</div>';
  }

  function renderPred() {
    if (predApplying) return; /* 观察器重入（自身 DOM 变动），queueMicrotask 复位后放行 */
    predApplying = true;
    try { renderPredInner(); }
    finally { queueMicrotask(function () { predApplying = false; }); }
  }

  function renderPredInner() {
    var d = doc();
    var host = q(d, SEL.predList);
    if (!host) return;

    /* 实机 append 模式（官方行 .pot-card 在场）：chips 挂 .pot-bd 内菜名下（作者批改4②——
     * 不再挂卡片尾避免与菜名横向挤压；已知行的官方 .pot-hint「已知菜谱·必出」移除腾位——作者令）。
     * 先全清旧 chips 再按包重挂（空包=全清；hint 由官方重渲染重建，下轮有包再删） */
    if (host.querySelector('.pot-card')) {
      host.querySelectorAll('.cefx-pred').forEach(function (x) { x.remove(); });
      /* 名→卡队列：单独烹饪模式一锅同菜多份=官方逐份建同名单卡，键唯一会让前几份漏挂区间
       * （实测：三份只有最后一份有 chips）——按包序逐张 shift 消费，包与官方行同源同序恒对齐 */
      var byName = {};
      Array.prototype.forEach.call(host.querySelectorAll('.pot-card'), function (card) {
        var nm = card.querySelector('.pot-nm');
        if (!nm) return;
        var k = (nm.textContent || '').trim();
        (byName[k] = byName[k] || []).push(card);
      });
      (predPack && predPack.entries || []).forEach(function (e) {
        var card = byName[e.name] && byName[e.name].shift();
        if (!card) return;
        var bd = card.querySelector('.pot-bd') || card;
        var html = chipsHtml(e);
        if (!html) return;
        /* 幂等短路：已挂且内容相同则零 DOM 操作（卡死教训 v5：防任何重挂风暴源） */
        var prev = card.querySelector('.cefx-pred');
        if (prev && prev.innerHTML === html.replace(/^<div class="cefx-pred">|<\/div>$/g, '') && !card.querySelector('.pot-hint')) return;
        var hint = card.querySelector('.pot-hint'); /* 已知行提示行去掉，chips 放该位 */
        if (hint) hint.remove();
        if (prev) prev.remove();
        var wrap = d.createElement('div');
        wrap.innerHTML = html;
        bd.appendChild(wrap.firstChild);
      });
      return;
    }

    /* harness 重建模式 + 防抹守卫（终审 C1）：宿主含非本模块节点=只清自己的行，绝不 innerHTML='' */
    var own = Array.prototype.filter.call(host.children, function (c) { return c.classList && c.classList.contains('cefx-row'); });
    var foreign = host.children.length - own.length;
    if (foreign > 0) {
      own.forEach(function (c) { host.removeChild(c); });
      if (!predWarned) { predWarned = true; try { console.warn('[CookingFx] 预测容器含官方节点，跳过重建'); } catch (e) { } }
      return;
    }
    host.innerHTML = '';
    (predPack && predPack.entries || []).forEach(function (e) {
      var row = d.createElement('div');
      row.className = 'pred-row cefx-row';
      var html = '';
      if (e.name !== undefined) html += '<div class="nm">' + String(e.name).replace(/</g, '&lt;') + '</div>';
      if (e.hint !== undefined) html += '<div class="hint">' + String(e.hint).replace(/</g, '&lt;') + '</div>';
      html += chipsHtml(e);
      row.innerHTML = html;
      host.appendChild(row);
    });
  }

  /* ---- 启动（批改6①：每次打开界面恒选「默认」——不跨界面记忆；会话内点击照常） ---- */
  sortDim = -1;
  function boot() {
    var d = doc();
    ensureCss(d);
    renderChips();
    snapshotOfficial(d);
    watchList(d);
    if (window.COOKFX_RECIPES) window.__CEFX__.setRecipes(window.COOKFX_RECIPES); /* harness：fixtures 当 C# 首包 */
    renderPred();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* 自愈（I1）：Cooking iframe 随场景重载（root 探针在 root 文档看不见），500ms 查装配痕迹，
   * miss 即复位装配态重跑 boot（幂等）。间隔随文档销毁自然清。 */
  setInterval(function () {
    try {
      var d = doc();
      if (d.getElementById('cefxChips') && d.getElementById('cefx-style')) return;
      chipsHost = null; watched = false; officialOrder = null;
      boot();
    } catch (e) { /* 自愈失败等下周期 */ }
  }, 500);
})();
