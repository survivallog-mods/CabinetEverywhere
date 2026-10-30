
    (function () {
      var root = document.getElementById('sr2');
      if (!root) return;

      var SLOT = 40, GAP = 6, MAXCOLS = 8;
      var CAT_COLORS = { '食材': '#8fc06e', '菜品': '#e8a33d', '材料': '#7aa2d6', '医疗': '#d68ab8', '饮品': '#6fc7c9', '燃料': '#b08968' };
      var POOL = [
        { n: '生态香米', e: '🍚', c: '食材', v: 12, s: 180, sat: 15 },
        { n: '野兔肉', e: '🍖', c: '食材', v: 28, s: 36, sat: 35 },
        { n: '胡萝卜', e: '🥕', c: '食材', v: 8, s: 60, sat: 10 },
        { n: '土豆', e: '🥔', c: '食材', v: 6, s: 90, sat: 14 },
        { n: '蘑菇', e: '🍄', c: '食材', v: 9, s: 24, sat: 8 },
        { n: '河鱼', e: '🐟', c: '食材', v: 22, s: 18, sat: 28 },
        { n: '苹果', e: '🍎', c: '食材', v: 7, s: 42, sat: 9 },
        { n: '鸡蛋', e: '🥚', c: '食材', v: 11, s: 28, sat: 12 },
        { n: '面包', e: '🍞', c: '菜品', v: 18, s: 12, sat: 30 },
        { n: '炖菜', e: '🍲', c: '菜品', v: 45, s: 8, sat: 55 },
        { n: '烤肉', e: '🍗', c: '菜品', v: 38, s: 10, sat: 48 },
        { n: '热汤', e: '🥣', c: '菜品', v: 32, s: 6, sat: 40 },
        { n: '铁钉', e: '🔩', c: '材料', v: 4, s: 999, sat: 0 },
        { n: '木板', e: '🪵', c: '材料', v: 5, s: 999, sat: 0 },
        { n: '布料', e: '🧵', c: '材料', v: 7, s: 999, sat: 0 },
        { n: '面粉', e: '🌾', c: '材料', v: 9, s: 200, sat: 0 },
        { n: '草药', e: '🌿', c: '医疗', v: 15, s: 120, sat: 0 },
        { n: '绷带', e: '🩹', c: '医疗', v: 20, s: 999, sat: 0 },
        { n: '止痛药', e: '💊', c: '医疗', v: 26, s: 999, sat: 0 },
        { n: '净水', e: '💧', c: '饮品', v: 10, s: 30, sat: 5 },
        { n: '咖啡', e: '☕', c: '饮品', v: 25, s: 20, sat: 2 },
        { n: '茶', e: '🍵', c: '饮品', v: 14, s: 24, sat: 3 },
        { n: '柴火', e: '🪵', c: '燃料', v: 3, s: 999, sat: 0 },
        { n: '煤块', e: '🪨', c: '燃料', v: 6, s: 999, sat: 0 }
      ];
      var TAG_GROUPS = [
        { g: '食品类', tags: [
          { id: '食材', c: '#A3B550' }, { id: '菜品', c: '#C97B4A' }, { id: '主食', c: '#E8A33D' },
          { id: '肉类', c: '#C97B4A' }, { id: '蔬果', c: '#8FC06E' }, { id: '饮品', c: '#6FC7C9' },
          { id: '调味', c: '#D9A066' }, { id: '甜品', c: '#D68AB8' }, { id: '需冷藏', c: '#7AA2D6' },
          { id: '易腐', c: '#E07A5F' }
        ] },
        { g: '材料类', tags: [
          { id: '材料', c: '#7AA2D6' }, { id: '工具', c: '#B0A89A' }, { id: '零件', c: '#9AA5B1' },
          { id: '燃料', c: '#B08968' }, { id: '医疗', c: '#D68AB8' }, { id: '种子', c: '#8FC06E' },
          { id: '书籍', c: '#C9B037' }, { id: '贵重品', c: '#F0B03C' }
        ] },
        { g: '功能类', tags: [
          { id: '种植', c: '#8FC06E' }, { id: '堆肥', c: '#A3B550' }, { id: '染色', c: '#D68AB8' },
          { id: '酿造', c: '#C97B4A' }, { id: '交易硬货', c: '#F0B03C' }, { id: '任务物品', c: '#E07A5F' },
          { id: '备用', c: '#9AA5B1' }, { id: '回收', c: '#6FC7C9' }
        ] }
      ];
      var COMMON_TAGS = ['食材', '菜品', '材料', '医疗', '饮品'];
      var CONTAINERS = [
        { id: 1, n: '角色背包', cols: 6, rows: 5, tags: [], pin: true, kind: '背包' },
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
      var tagColor = {};
      for (var gi = 0; gi < TAG_GROUPS.length; gi++)
        for (var ti = 0; ti < TAG_GROUPS[gi].tags.length; ti++)
          tagColor[TAG_GROUPS[gi].tags[ti].id] = TAG_GROUPS[gi].tags[ti].c;

      var state = {
        scene: 'cook', currentId: 2, mode: 'grid', sort: 'category',
        query: '', tags: [], selectedId: null, items: [], cells: 0,
        cols: MAXCOLS, rows: 0, srcCols: 0, srcRows: 0, ctnQuery: ''
      };

      var $ = function (id) { return document.getElementById(id); };
      var els = {
        stage: $('stage'), fitwrap: $('fitwrap'), scaleBadge: $('scaleBadge'),
        scenes: $('scenes'), rail: $('rail'), railTitle: $('railTitle'),
        railCols: $('railCols'), railCap: $('railCap'), railTags: $('railTags'),
        ctnCur: $('ctnCur'), pinRow: $('pinRow'), allCtn: $('allCtn'),
        ctnPop: $('ctnPop'), ctnSearch: $('ctnSearch'), ctnPopBody: $('ctnPopBody'),
        ctnPopCount: $('ctnPopCount'), ctnPopClose: $('ctnPopClose'),
        searchInput: $('searchInput'), tagRow: $('tagRow'), tagMore: $('tagMore'),
        tagPop: $('tagPop'), tagPopBody: $('tagPopBody'), tagPopCount: $('tagPopCount'),
        tagClear: $('tagClear'), sortSelect: $('sortSelect'), modeSeg: $('modeSeg'),
        body: $('body'), grid: $('grid'), list: $('list'), hoverDetail: $('hoverDetail'),
        fillStatus: $('fillStatus'), viewStatus: $('viewStatus'),
        center: $('center'), right: $('right'),
        expandBtn: $('expandBtn'), workspace: $('workspace'), wsGrid: $('wsGrid'),
        wsSub: $('wsSub'), wsStatus: $('wsStatus'), wsClose: $('wsClose'), wsSearch: $('wsSearch'),
        controls: $('controls')
      };

      function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }
      function currentCtn() {
        for (var i = 0; i < CONTAINERS.length; i++) if (CONTAINERS[i].id === state.currentId) return CONTAINERS[i];
        return CONTAINERS[0];
      }
      function makeItems(cells) {
        var count = Math.min(Math.max(6, Math.round(cells * 0.72)), 640);
        var out = [];
        for (var i = 0; i < count; i++) {
          var b = POOL[i % POOL.length], bump = (i * 7) % 9;
          out.push({
            id: i, name: b.n, emoji: b.e, cat: b.c,
            count: 1 + ((i * 5 + 3) % 9),
            value: b.v + bump * 2,
            shelf: Math.max(2, b.s - bump * 3),
            sat: b.sat + (bump % 4),
            fav: i % 13 === 0, fresh: i % 17 === 0
          });
        }
        return out;
      }

      /* ── 尺寸规则：宽度封顶转高度 ── */
      function applySizeRule(cols, rows) {
        var cells = cols * rows;
        var dCols = Math.min(cols, MAXCOLS);
        var dRows = Math.ceil(cells / dCols);
        state.srcCols = cols; state.srcRows = rows;
        state.cols = dCols; state.rows = dRows; state.cells = cells;
        state.items = makeItems(cells);
      }
      function railWidthPx(cols) { return cols * SLOT + (cols - 1) * GAP + 47; }

      function sortItems(items) {
        var order = { '食材': 0, '菜品': 1, '材料': 2, '医疗': 3, '饮品': 4, '燃料': 5 };
        return items.slice().sort(function (a, b) {
          if (state.sort === 'value') return b.value - a.value;
          if (state.sort === 'shelf') return a.shelf - b.shelf;
          if (state.sort === 'sat') return b.sat - a.sat;
          if (state.sort === 'count') return b.count - a.count;
          var ca = order[a.cat] == null ? 9 : order[a.cat], cb = order[b.cat] == null ? 9 : order[b.cat];
          if (ca !== cb) return ca - cb;
          return a.id - b.id;
        });
      }
      function visibleItems() {
        var q = state.query.trim().toLowerCase();
        return sortItems(state.items.filter(function (it) {
          if (q && it.name.toLowerCase().indexOf(q) < 0 && it.cat.toLowerCase().indexOf(q) < 0) return false;
          return true;
        }));
      }
      var DYN = {
        value: { label: '价值', cell: function (it) { return it.value; }, cls: '' },
        shelf: { label: '保质(h)', cell: function (it) { return it.shelf; }, cls: '' },
        sat: { label: '饱食', cell: function (it) { return it.sat > 0 ? '+' + it.sat : '—'; }, cls: '' },
        count: { label: '数量', cell: function (it) { return '×' + it.count; }, cls: '' },
        category: { label: '分类', cell: function (it) { return it.cat; }, cls: 'cat' }
      };

      function slotHtml(it, cls) {
        var color = CAT_COLORS[it.cat] || '#b0a89a';
        return '<button type="button" class="' + cls + (it.fav ? ' fav' : '') + (state.selectedId === it.id ? ' selected' : '') + '"' +
          ' data-item-id="' + it.id + '" aria-label="' + esc(it.name + ' ×' + it.count) + '" style="--cat:' + color + '">' +
          '<span class="s-dot"></span><span aria-hidden="true">' + it.emoji + '</span>' +
          '<span class="s-cnt">' + it.count + '</span>' + (it.fresh ? '<span class="s-new"></span>' : '') + '</button>';
      }

      /* ── 容器选择 ── */
      function renderCtnBar() {
        var c = currentCtn();
        var dots = c.tags.slice(0, 3).map(function (t) {
          return '<span class="cc-dot" style="background:' + (tagColor[t] || '#888') + '"></span>';
        }).join('');
        els.ctnCur.innerHTML = '<span class="cc-dots">' + dots + '</span>' + esc(c.n) +
          '<i data-lucide="chevron-down" aria-hidden="true"></i>';
        var pins = CONTAINERS.filter(function (x) { return x.pin; });
        els.pinRow.innerHTML = pins.map(function (p) {
          return '<button type="button" class="sr2-pin' + (p.id === state.currentId ? ' active' : '') + '" data-ctn="' + p.id + '">' +
            '<span class="p-dot" style="background:' + ((p.tags[0] && tagColor[p.tags[0]]) || '#888') + '"></span>' +
            esc(p.n) + '</button>';
        }).join('');
      }
      function renderCtnPop() {
        var q = state.ctnQuery.trim().toLowerCase();
        var html = '';
        for (var g = 0; g < TAG_GROUPS.length; g++) {
          var grp = TAG_GROUPS[g].g;
          var list = CONTAINERS.filter(function (c) {
            var hit = !q || c.n.toLowerCase().indexOf(q) >= 0 || c.tags.some(function (t) { return t.toLowerCase().indexOf(q) >= 0; });
            if (!hit) return false;
            if (g === 0) return c.tags.some(function (t) { return ['食材', '菜品', '主食', '肉类', '蔬果', '饮品', '调味', '甜品', '需冷藏', '易腐'].indexOf(t) >= 0; });
            if (g === 1) return c.tags.some(function (t) { return ['材料', '工具', '零件', '燃料', '医疗', '种子', '书籍', '贵重品'].indexOf(t) >= 0; });
            return c.tags.some(function (t) { return ['种植', '堆肥', '染色', '酿造', '交易硬货', '任务物品', '备用', '回收'].indexOf(t) >= 0; }) || c.tags.length === 0;
          });
          if (!list.length) continue;
          html += '<div class="sr2-grp-title">' + grp + ' · ' + list.length + '</div>';
          for (var i = 0; i < list.length; i++) {
            var c = list[i];
            html += '<button type="button" class="sr2-ctn-item' + (c.id === state.currentId ? ' cur' : '') + '" data-ctn="' + c.id + '">' +
              '<span class="sr2-ci-main"><span class="sr2-ci-name">' + esc(c.n) + '</span>' +
              '<span class="sr2-ci-sub">' + (c.tags.length ? c.tags.map(esc).join(' · ') : '未打标签') + '</span></span>' +
              '<span class="sr2-ci-meta">' + c.cols + '×' + c.rows + '</span></button>';
          }
        }
        if (!html) html = '<div class="sr2-empty">没有匹配的容器</div>';
        els.ctnPopBody.innerHTML = html;
        els.ctnPopCount.textContent = '共 ' + CONTAINERS.length + ' 个容器';
      }

      /* ── 标签 ── */
      function renderTags() {
        var html = '<button type="button" class="sr2-tag' + (state.tags.length === 0 ? ' active' : '') + '" data-tag="__all">全部</button>';
        for (var i = 0; i < COMMON_TAGS.length; i++) {
          var t = COMMON_TAGS[i];
          html += '<button type="button" class="sr2-tag' + (state.tags.indexOf(t) >= 0 ? ' active' : '') + '" data-tag="' + esc(t) + '">' +
            '<span class="t-dot" style="background:' + (tagColor[t] || '#888') + '"></span>' + esc(t) + '</button>';
        }
        els.tagRow.innerHTML = html;
        els.tagMore.className = 'sr2-tag-more' + (state.tags.length ? ' has' : '');
        els.tagMore.innerHTML = '更多标签' + (state.tags.length ? '<span class="sr2-more-badge">' + state.tags.length + '</span>' : '') +
          '<i data-lucide="chevron-down" aria-hidden="true"></i>';
        var pop = '';
        for (var g = 0; g < TAG_GROUPS.length; g++) {
          pop += '<div class="sr2-grp-title">' + TAG_GROUPS[g].g + '</div><div class="sr2-tagwrap">';
          for (var j = 0; j < TAG_GROUPS[g].tags.length; j++) {
            var tg = TAG_GROUPS[g].tags[j];
            pop += '<button type="button" class="sr2-tag2' + (state.tags.indexOf(tg.id) >= 0 ? ' active' : '') + '" data-tagm="' + esc(tg.id) + '">' +
              '<span class="t-dot" style="background:' + tg.c + '"></span>' + esc(tg.id) + '</button>';
          }
          pop += '</div>';
        }
        els.tagPopBody.innerHTML = pop;
        els.tagPopCount.textContent = state.tags.length ? '已选 ' + state.tags.length + ' 个标签' : '未选择（显示全部）';
      }

      /* ── 场景 ── */
      var SCENES = {
        cook: {
          center: '<section class="sr2-panel sc-cook">' +
            '<div class="sr2-panel-title"><span class="sr2-tbar"></span>烹饪操作台</div>' +
            '<div class="sr2-pot-wrap"><div class="sr2-pot-ring"></div><div class="sr2-pot">🍲</div></div>' +
            '<div style="color:var(--g-muted);font-size:12.5px">等待食材投入…</div>' +
            '<div style="color:var(--g-dim);font-size:11.5px;margin-top:-4px">从储物栏拖入，或右键快速转移</div>' +
            '<div class="sr2-fuel"><div class="sr2-fuel-head"><span>燃料队列</span><span>已加 1 / 3</span></div>' +
            '<div class="sr2-fuel-slots"><div class="sr2-fuel-slot">🪵</div><div class="sr2-fuel-slot empty">+</div><div class="sr2-fuel-slot empty">+</div></div></div>' +
            '<button class="sr2-primary" type="button">开始烹饪</button></section>',
          right: recipesPanel('菜谱书', [
            { n: '蘑菇炖兔肉', e: '🍲', m: '野兔肉×2 · 蘑菇×3', ok: true },
            { n: '烤土豆', e: '🥔', m: '土豆×2 · 燃料×1', ok: true },
            { n: '蔬菜汤', e: '🥣', m: '胡萝卜×2 · 净水×1', ok: true },
            { n: '香煎河鱼', e: '🐟', m: '河鱼×1 · 油脂×1', ok: false },
            { n: '大米饭', e: '🍚', m: '生态香米×2 · 净水×1', ok: true },
            { n: '面包', e: '🍞', m: '面粉×3 · 净水×1', ok: false },
            { n: '烤肉串', e: '🍗', m: '野兔肉×2 · 木签×2', ok: true },
            { n: '草药茶', e: '🍵', m: '草药×2 · 净水×1', ok: true },
            { n: '苹果派', e: '🥧', m: '苹果×3 · 面粉×2', ok: false },
            { n: '炖菜', e: '🍜', m: '土豆×2 · 胡萝卜×2', ok: true }
          ])
        },
        tool: {
          center: '<section class="sr2-panel sc-tool">' +
            '<div class="sr2-panel-title"><span class="sr2-tbar"></span>制作台<span class="sr2-pcount">投入材料后自动匹配配方</span></div>' +
            '<div class="sr2-bench"><div class="sr2-grp-title" style="margin-top:10px">工作台格（5×4）</div><div class="sr2-bench-grid">' +
            '<div class="sr2-bslot">🔩</div><div class="sr2-bslot">🪵</div><div class="sr2-bslot drop">+</div><div class="sr2-bslot drop">+</div><div class="sr2-bslot drop">+</div>' +
            '<div class="sr2-bslot drop">+</div><div class="sr2-bslot drop">+</div><div class="sr2-bslot drop">+</div><div class="sr2-bslot drop">+</div><div class="sr2-bslot drop">+</div>' +
            '<div class="sr2-bslot drop">+</div><div class="sr2-bslot drop">+</div><div class="sr2-bslot drop">+</div><div class="sr2-bslot drop">+</div><div class="sr2-bslot drop">+</div>' +
            '<div class="sr2-bslot drop">+</div><div class="sr2-bslot drop">+</div><div class="sr2-bslot drop">+</div><div class="sr2-bslot drop">+</div><div class="sr2-bslot drop">+</div>' +
            '</div></div>' +
            '<div class="sr2-queue"><div class="sr2-grp-title">制作队列 · 铁钉 ×20（材料来自储物栏与家中柜子）</div>' +
            '<div class="sr2-q-bar"><div class="sr2-q-fill"></div></div>' +
            '<div style="display:flex;justify-content:space-between;margin-top:8px;color:var(--g-dim);font-size:11.5px"><span>预计 00:42</span><span>铁块 14/20 · 可从材料架自动补料</span></div>' +
            '<button class="sr2-primary" style="max-width:none" type="button">开始制作</button></div></section>',
          right: recipesPanel('配方列表', [
            { n: '铁钉 ×10', e: '🔩', m: '铁块×2', ok: true },
            { n: '木板 ×5', e: '🪵', m: '原木×2', ok: true },
            { n: '布料', e: '🧵', m: '麻绳×3', ok: true },
            { n: '绷带', e: '🩹', m: '布料×2', ok: true },
            { n: '捕鼠夹', e: '🪤', m: '铁钉×4 · 木板×2', ok: false },
            { n: '净水滤芯', e: '💧', m: '活性炭×3', ok: false },
            { n: '修理包', e: '🧰', m: '布料×2 · 铁钉×6', ok: true }
          ])
        },
        trade: {
          center: '<section class="sc-trade"><div class="sc-trade-inner">' +
            '<div class="sr2-peer"><span class="sr2-avatar">陈</span>' +
            '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">陈阿姨 · 以物易物</div>' +
            '<div style="font-size:11px;color:var(--g-dim)">对方想要：食材类 · 出售：医疗类</div></div>' +
            '<span style="color:var(--g-gold);font-size:12px;font-family:Consolas,monospace">信誉 82</span></div>' +
            '<div class="sr2-shelf">' +
            shelfRow('💊', '止痛药', '医疗 · 她的存货', 4) +
            shelfRow('🩹', '绷带', '医疗 · 她的存货', 7) +
            shelfRow('🧵', '布料', '材料 · 她的存货', 12) +
            shelfRow('🍞', '面包', '菜品 · 我方提供', 3) +
            shelfRow('🍖', '野兔肉', '食材 · 我方提供', 6) +
            shelfRow('🍚', '生态香米', '食材 · 我方提供', 15) +
            '</div>' +
            '<div class="sr2-deal"><span class="sr2-deal-info">预计成交：<b>+38</b> 交易价值 · 需从储物栏补 2 件食材</span>' +
            '<button class="sr2-primary" style="max-width:160px;height:34px;margin:0" type="button">成交</button></div>' +
            '</div></section>',
          right: recipesPanel('求购物资', [
            { n: '野兔肉', e: '🍖', m: '求购 6 件 · 出价高', ok: true },
            { n: '生态香米', e: '🍚', m: '求购 15 件', ok: true },
            { n: '苹果', e: '🍎', m: '求购 10 件', ok: false },
            { n: '咖啡', e: '☕', m: '她囤了很多', ok: true }
          ])
        },
        drone: {
          center: '<section class="sr2-panel sc-drone">' +
            '<div class="sr2-panel-title"><span class="sr2-tbar"></span>机队状态<span class="sr2-pcount">3 台在岗</span></div>' +
            '<div class="sr2-fleet">' +
            '<div class="sr2-drone"><span class="sr2-drone-ico">🛸</span><div style="flex:1;min-width:0"><div class="sr2-shelf-name">无人机 01 · 运输</div><div class="sr2-shelf-sub">任务：超市 → 家 · 剩余 2 趟</div></div><span class="sr2-batt"><i style="width:76%"></i></span><span class="sr2-ci-meta">76%</span></div>' +
            '<div class="sr2-drone"><span class="sr2-drone-ico">🛸</span><div style="flex:1;min-width:0"><div class="sr2-shelf-name">无人机 02 · 搜刮</div><div class="sr2-shelf-sub">任务：医院 B2 · 剩余 4 趟</div></div><span class="sr2-batt"><i style="width:42%"></i></span><span class="sr2-ci-meta">42%</span></div>' +
            '<div class="sr2-drone"><span class="sr2-drone-ico">🛸</span><div style="flex:1;min-width:0"><div class="sr2-shelf-name">无人机 03 · 充电中</div><div class="sr2-shelf-sub">预计 00:12 完成</div></div><span class="sr2-batt"><i style="width:88%"></i></span><span class="sr2-ci-meta">88%</span></div>' +
            '</div>' +
            '<div class="sr2-grp-title" style="margin-top:10px">装货清单（从储物栏 / 全部柜子调货）</div>' +
            '<div style="display:flex;gap:7px;flex-wrap:wrap">' +
            '<div class="sr2-bslot" style="width:46px;height:46px">💊</div><div class="sr2-bslot" style="width:46px;height:46px">🩹</div>' +
            '<div class="sr2-bslot drop" style="width:46px;height:46px">+</div><div class="sr2-bslot drop" style="width:46px;height:46px">+</div>' +
            '</div><button class="sr2-primary" style="max-width:none" type="button">下发任务</button></section>',
          right: recipesPanel('无人机仓库', [
            { n: '止痛药 ×12', e: '💊', m: '中控台仓库', ok: true },
            { n: '绷带 ×20', e: '🩹', m: '中控台仓库', ok: true },
            { n: '咖啡 ×6', e: '☕', m: '待入库', ok: false },
            { n: '煤块 ×30', e: '🪨', m: '中控台仓库', ok: true }
          ])
        }
      };
      function shelfRow(e, n, sub, num) {
        return '<div class="sr2-shelf-row"><span class="sr2-shelf-ico">' + e + '</span>' +
          '<span class="sr2-shelf-main"><span class="sr2-shelf-name">' + n + '</span><span class="sr2-shelf-sub">' + sub + '</span></span>' +
          '<span class="sr2-num">×' + num + '</span></div>';
      }
      function recipesPanel(title, list) {
        var rows = list.map(function (r) {
          return '<div class="sr2-ritem"><span class="sr2-ri-ico">' + r.e + '</span>' +
            '<span style="min-width:0"><span class="sr2-ri-name">' + esc(r.n) + '</span><br><span class="sr2-ri-sub">' + esc(r.m) + '</span></span>' +
            '<span class="sr2-ri-tag' + (r.ok ? '' : ' miss') + '">' + (r.ok ? '可做' : '缺料') + '</span></div>';
        }).join('');
        return '<section class="sr2-panel sr2-right" style="position:static;width:auto;flex:1">' +
          '<div class="sr2-panel-title"><span class="sr2-tbar"></span>' + title + '<span class="sr2-pcount">' + list.length + ' 项</span></div>' +
          '<div class="sr2-rlist">' + rows + '</div></section>';
      }

      function renderScene() {
        els.center.innerHTML = SCENES[state.scene].center;
        els.right.innerHTML = SCENES[state.scene].right;
        var btns = els.scenes.querySelectorAll('[data-scene]');
        for (var i = 0; i < btns.length; i++)
          btns[i].classList.toggle('active', btns[i].getAttribute('data-scene') === state.scene);
      }

      /* ── 主渲染 ── */
      function render() {
        var c = currentCtn();
        var clamped = state.srcCols > MAXCOLS;
        els.railTitle.textContent = c.n;
        els.railCap.textContent = state.cols + '×' + state.rows;
        els.rail.style.width = railWidthPx(state.cols) + 'px';

        var filtered = visibleItems();
        var bodyChrome = 262;                    /* 侧栏头部控件总高 */
        var bodyMax = 790 - bodyChrome;          /* 可用网格高度 */
        var naturalH = state.rows * (SLOT + GAP) + 18;
        els.body.style.maxHeight = Math.min(bodyMax, naturalH) + 'px';

        els.fillStatus.textContent = filtered.length + ' / ' + state.cells + ' 格';
        if (clamped) {
          els.viewStatus.textContent = '宽度 ' + state.srcCols + '→' + MAXCOLS + ' 封顶 · 转为 ' + state.rows + ' 行';
          els.viewStatus.className = 'fr warn';
        } else {
          els.viewStatus.textContent = naturalH > bodyMax ? '↓ 纵向滚动查看' : '全部可见';
          els.viewStatus.className = 'fr';
        }
        els.railCols.textContent = clamped ? '8 列封顶' : state.cols + ' 列';
        els.railTags.textContent = c.tags.length ? ' · ' + c.tags.join('·') : '';

        var seg = els.modeSeg.querySelectorAll('[data-mode]');
        for (var s = 0; s < seg.length; s++)
          seg[s].classList.toggle('active', seg[s].getAttribute('data-mode') === state.mode);

        renderCtnBar(); renderTags();

        if (state.mode === 'grid') {
          els.grid.hidden = false; els.list.hidden = true;
          els.grid.style.gridTemplateColumns = 'repeat(' + state.cols + ', ' + SLOT + 'px)';
          var html = '';
          if (!filtered.length) html = '<div class="sr2-empty">没有匹配的物品</div>';
          else for (var i = 0; i < state.cells; i++)
            html += i < filtered.length ? slotHtml(filtered[i], 'sr2-slot') : '<div class="sr2-slot empty" aria-hidden="true"></div>';
          els.grid.innerHTML = html;
        } else {
          els.grid.hidden = true; els.list.hidden = false;
          var dyn = DYN[state.sort] || DYN.category;
          var lh = '<div class="sr2-list-head"><span></span><span>物品</span><span class="num">数量</span><span class="num">' + dyn.label + '</span></div>';
          if (!filtered.length) lh += '<div class="sr2-empty">没有匹配的物品</div>';
          else for (var j = 0; j < filtered.length; j++) {
            var it = filtered[j];
            lh += '<button type="button" class="sr2-row' + (state.selectedId === it.id ? ' selected' : '') + '" data-item-id="' + it.id + '">' +
              '<span class="sr2-row-ico" aria-hidden="true">' + it.emoji + '</span>' +
              '<span class="sr2-row-main"><span class="sr2-row-name">' + esc(it.name) + '</span>' +
              '<span class="sr2-row-sub">' + esc(it.cat) + ' · 保质 ' + it.shelf + 'h · 饱食 +' + it.sat + ' · 价值 ' + it.value + '</span></span>' +
              '<span class="sr2-row-cnt">×' + it.count + '</span>' +
              '<span class="sr2-row-dyn ' + dyn.cls + '">' + dyn.cell(it) + '</span></button>';
          }
          els.list.innerHTML = lh;
        }

        els.wsSub.textContent = c.n + ' · ' + state.cols + '×' + state.rows + '（原 ' + state.srcCols + '×' + state.srcRows + '）· ' + filtered.length + ' 件';
        els.wsStatus.textContent = filtered.length + ' / ' + state.cells + ' 格';
        var wh = '';
        if (!filtered.length) wh = '<div class="sr2-empty">没有匹配的物品</div>';
        else for (var k = 0; k < state.cells; k++)
          wh += k < filtered.length ? slotHtml(filtered[k], 'sr2-ws-slot') : '<div class="sr2-ws-slot empty" aria-hidden="true"></div>';
        els.wsGrid.innerHTML = wh;
      }

      function findItem(id) {
        for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i];
        return null;
      }
      function showHover(it) {
        if (!it) { els.hoverDetail.textContent = '悬停查看物品详情'; return; }
        els.hoverDetail.innerHTML = '<b>' + esc(it.name) + '</b> ×' + it.count +
          ' · 交易 <span class="hv-gold">' + it.value + '</span> · 保质 ' + it.shelf + 'h · 饱食 +' + it.sat;
      }

      /* ── 事件 ── */
      els.scenes.addEventListener('click', function (e) {
        var b = e.target.closest('[data-scene]');
        if (b) { state.scene = b.getAttribute('data-scene'); renderScene(); }
      });
      els.pinRow.addEventListener('click', function (e) {
        var b = e.target.closest('[data-ctn]');
        if (!b) return;
        state.currentId = parseInt(b.getAttribute('data-ctn'), 10);
        var c = currentCtn(); applySizeRule(c.cols, c.rows); state.selectedId = null; render();
      });
      els.ctnCur.addEventListener('click', function () {
        renderCtnPop(); els.tagPop.hidden = true; els.ctnPop.hidden = !els.ctnPop.hidden;
      });
      els.allCtn.addEventListener('click', function () {
        renderCtnPop(); els.tagPop.hidden = true; els.ctnPop.hidden = !els.ctnPop.hidden;
      });
      els.ctnPopClose.addEventListener('click', function () { els.ctnPop.hidden = true; });
      els.ctnSearch.addEventListener('input', function () { state.ctnQuery = els.ctnSearch.value; renderCtnPop(); });
      els.ctnPopBody.addEventListener('click', function (e) {
        var b = e.target.closest('[data-ctn]');
        if (!b) return;
        state.currentId = parseInt(b.getAttribute('ctn') || b.getAttribute('data-ctn'), 10);
        var c = currentCtn(); applySizeRule(c.cols, c.rows); state.selectedId = null;
        els.ctnPop.hidden = true; render();
      });
      els.tagRow.addEventListener('click', function (e) {
        var b = e.target.closest('[data-tag]');
        if (!b) return;
        var t = b.getAttribute('data-tag');
        if (t === '__all') state.tags = [];
        else {
          var i = state.tags.indexOf(t);
          if (i >= 0) state.tags.splice(i, 1); else state.tags.push(t);
        }
        render();
      });
      els.tagMore.addEventListener('click', function () {
        els.ctnPop.hidden = true; els.tagPop.hidden = !els.tagPop.hidden;
      });
      els.tagPopBody.addEventListener('click', function (e) {
        var b = e.target.closest('[data-tagm]');
        if (!b) return;
        var t = b.getAttribute('data-tagm');
        var i = state.tags.indexOf(t);
        if (i >= 0) state.tags.splice(i, 1); else state.tags.push(t);
        renderTags();
      });
      els.tagClear.addEventListener('click', function () { state.tags = []; render(); });
      els.searchInput.addEventListener('input', function () { state.query = els.searchInput.value; render(); });
      els.wsSearch.addEventListener('input', function () { state.query = els.wsSearch.value; render(); });
      els.sortSelect.addEventListener('change', function () { state.sort = els.sortSelect.value; render(); });
      els.modeSeg.addEventListener('click', function (e) {
        var b = e.target.closest('[data-mode]');
        if (b) { state.mode = b.getAttribute('data-mode'); render(); }
      });
      els.body.addEventListener('mouseover', function (e) {
        var el = e.target.closest('[data-item-id]');
        if (el) showHover(findItem(parseInt(el.getAttribute('data-item-id'), 10)));
      });
      els.body.addEventListener('mouseleave', function () { showHover(null); });
      els.body.addEventListener('click', function (e) {
        var el = e.target.closest('[data-item-id]');
        if (!el) return;
        var id = parseInt(el.getAttribute('data-item-id'), 10);
        state.selectedId = state.selectedId === id ? null : id;
        render();
        if (state.selectedId !== null) showHover(findItem(state.selectedId));
      });
      els.controls.addEventListener('click', function (e) {
        var b = e.target.closest('[data-preset]');
        if (!b) return;
        var p = b.getAttribute('data-preset').split('x');
        var c = currentCtn();
        c.cols = parseInt(p[0], 10); c.rows = parseInt(p[1], 10);
        applySizeRule(c.cols, c.rows); state.selectedId = null; render();
        var all = els.controls.querySelectorAll('[data-preset]');
        for (var i = 0; i < all.length; i++) all[i].classList.toggle('btn-primary', all[i] === b);
      });
      els.expandBtn.addEventListener('click', function () { els.workspace.hidden = false; render(); });
      els.wsClose.addEventListener('click', function () { els.workspace.hidden = true; });
      window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { els.workspace.hidden = true; els.ctnPop.hidden = true; els.tagPop.hidden = true; }
      });

      /* ── 1:1 缩放适配 ── */
      function fit() {
        var w = els.fitwrap.clientWidth || 960;
        var s = Math.min(1, w / 1536);
        els.stage.style.transform = s < 1 ? 'scale(' + s + ')' : '';
        els.fitwrap.style.height = (864 * s + 2) + 'px';
        els.scaleBadge.textContent = '1536 × 864 · ' + Math.round(s * 100) + '%';
      }
      window.addEventListener('resize', fit);

      /* ── 启动：大柜（触发宽度封顶规则演示） ── */
      applySizeRule(20, 16);
      renderScene();
      render();
      fit();
    })();
  