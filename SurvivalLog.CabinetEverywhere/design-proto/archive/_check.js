
    (function () {
      var root = document.getElementById('sls-proto');
      if (!root) return;

      var COLORS = {
        '食材': '#8fc06e',
        '菜品': '#e8a33d',
        '材料': '#7aa2d6',
        '药品': '#d68ab8',
        '饮品': '#6fc7c9',
        '工具': '#b0a89a'
      };

      var POOL = [
        { n: '生态香米', e: '🍚', c: '食材', v: 12, s: 180, sat: 15 },
        { n: '野兔肉', e: '🍖', c: '食材', v: 28, s: 36, sat: 35 },
        { n: '胡萝卜', e: '🥕', c: '食材', v: 8, s: 60, sat: 10 },
        { n: '土豆', e: '🥔', c: '食材', v: 6, s: 90, sat: 14 },
        { n: '蘑菇', e: '🍄', c: '食材', v: 9, s: 24, sat: 8 },
        { n: '河鱼', e: '🐟', c: '食材', v: 22, s: 18, sat: 28 },
        { n: '面包', e: '🍞', c: '菜品', v: 18, s: 12, sat: 30 },
        { n: '炖菜', e: '🍲', c: '菜品', v: 45, s: 8, sat: 55 },
        { n: '烤肉', e: '🍗', c: '菜品', v: 38, s: 10, sat: 48 },
        { n: '铁钉', e: '🔩', c: '材料', v: 4, s: 999, sat: 0 },
        { n: '木板', e: '🪵', c: '材料', v: 5, s: 999, sat: 0 },
        { n: '布料', e: '🧵', c: '材料', v: 7, s: 999, sat: 0 },
        { n: '草药', e: '🌿', c: '药品', v: 15, s: 120, sat: 0 },
        { n: '绷带', e: '🩹', c: '药品', v: 20, s: 999, sat: 0 },
        { n: '净水', e: '💧', c: '饮品', v: 10, s: 30, sat: 5 },
        { n: '咖啡', e: '☕', c: '饮品', v: 25, s: 20, sat: 2 },
        { n: '罐头', e: '🥫', c: '食材', v: 16, s: 240, sat: 18 },
        { n: '苹果', e: '🍎', c: '食材', v: 7, s: 42, sat: 9 },
        { n: '鸡蛋', e: '🥚', c: '食材', v: 11, s: 28, sat: 12 },
        { n: '面粉', e: '🌾', c: '材料', v: 9, s: 200, sat: 0 },
        { n: '酒曲', e: '🧪', c: '材料', v: 30, s: 999, sat: 0 },
        { n: '止痛药', e: '💊', c: '药品', v: 26, s: 999, sat: 0 },
        { n: '热汤', e: '🥣', c: '菜品', v: 32, s: 6, sat: 40 },
        { n: '茶', e: '🍵', c: '饮品', v: 14, s: 24, sat: 3 }
      ];

      var SIZE_TITLES = {
        '6x5': '储物柜（小型置物架）',
        '8x7': '冰箱',
        '14x10': '储物柜（中型置物架）',
        '20x16': '储物柜（大型置物架）',
        '24x18': '储物柜（超大型置物架）'
      };

      var RECIPES = [
        { n: '蘑菇炖兔肉', e: '🍲', m: '野兔肉 ×2 · 蘑菇 ×3', ok: true },
        { n: '烤土豆', e: '🥔', m: '土豆 ×2 · 燃料 ×1', ok: true },
        { n: '蔬菜汤', e: '🥣', m: '胡萝卜 ×2 · 净水 ×1', ok: true },
        { n: '香煎河鱼', e: '🐟', m: '河鱼 ×1 · 油脂 ×1', ok: false },
        { n: '大米饭', e: '🍚', m: '生态香米 ×2 · 净水 ×1', ok: true },
        { n: '面包', e: '🍞', m: '面粉 ×3 · 净水 ×1', ok: false },
        { n: '烤肉串', e: '🍗', m: '野兔肉 ×2 · 木签 ×2', ok: true },
        { n: '草药茶', e: '🍵', m: '草药 ×2 · 净水 ×1', ok: true },
        { n: '苹果派', e: '🥧', m: '苹果 ×3 · 面粉 ×2', ok: false },
        { n: '炖菜', e: '🍜', m: '土豆 ×2 · 胡萝卜 ×2', ok: true }
      ];

      var state = {
        size: '20x16',
        tab: 'cabinet',
        lastCabinetSize: '20x16',
        mode: 'grid',
        sort: 'category',
        cat: '全部',
        query: '',
        selectedId: null,
        items: [],
        cells: 320,
        cols: 20,
        rows: 16
      };

      var els = {
        topHint: document.getElementById('topHint'),
        railTitle: document.getElementById('railTitle'),
        railFixed: document.getElementById('railFixed'),
        railCap: document.getElementById('railCap'),
        tabs: document.getElementById('tabs'),
        searchInput: document.getElementById('searchInput'),
        chips: document.getElementById('chips'),
        sortSelect: document.getElementById('sortSelect'),
        modeSeg: document.getElementById('modeSeg'),
        body: document.getElementById('body'),
        grid: document.getElementById('grid'),
        list: document.getElementById('list'),
        hoverDetail: document.getElementById('hoverDetail'),
        fillStatus: document.getElementById('fillStatus'),
        viewStatus: document.getElementById('viewStatus'),
        recipeList: document.getElementById('recipeList'),
        expandBtn: document.getElementById('expandBtn'),
        workspace: document.getElementById('workspace'),
        wsSearch: document.getElementById('wsSearch'),
        wsSort: document.getElementById('wsSort'),
        wsChips: document.getElementById('wsChips'),
        wsGrid: document.getElementById('wsGrid'),
        wsSub: document.getElementById('wsSub'),
        wsStatus: document.getElementById('wsStatus'),
        wsClose: document.getElementById('wsClose'),
        ghost: document.getElementById('ghost'),
        ghostLabel: document.getElementById('ghostLabel'),
        compareToggle: document.getElementById('compareToggle'),
        controls: document.getElementById('controls')
      };

      function parseSize(size) {
        var parts = size.split('x');
        return { cols: parseInt(parts[0], 10), rows: parseInt(parts[1], 10) };
      }

      function sizeLabel(size) {
        var p = parseSize(size);
        return p.cols + '×' + p.rows;
      }

      function makeItems(size) {
        var p = parseSize(size);
        var cells = p.cols * p.rows;
        var count = Math.max(6, Math.round(cells * 0.82));
        var items = [];
        for (var i = 0; i < count; i++) {
          var base = POOL[i % POOL.length];
          var bump = (i * 7) % 9;
          items.push({
            id: i,
            name: base.n,
            emoji: base.e,
            cat: base.c,
            count: 1 + ((i * 5 + 3) % 9),
            value: base.v + bump * 2,
            shelf: Math.max(2, base.s - bump * 3),
            sat: base.sat + (bump % 4),
            fav: i % 13 === 0,
            fresh: i % 17 === 0
          });
        }
        return { items: items, cells: cells, cols: p.cols, rows: p.rows };
      }

      function sortItems(items) {
        var catOrder = { '食材': 0, '菜品': 1, '材料': 2, '药品': 3, '饮品': 4, '工具': 5 };
        var out = items.slice();
        out.sort(function (a, b) {
          if (state.sort === 'value') return b.value - a.value;
          if (state.sort === 'shelf') return a.shelf - b.shelf;
          if (state.sort === 'sat') return b.sat - a.sat;
          var ca = catOrder[a.cat] == null ? 9 : catOrder[a.cat];
          var cb = catOrder[b.cat] == null ? 9 : catOrder[b.cat];
          if (ca !== cb) return ca - cb;
          return a.id - b.id;
        });
        return out;
      }

      function visibleItems() {
        var q = state.query.trim().toLowerCase();
        return sortItems(state.items.filter(function (it) {
          if (state.cat !== '全部' && it.cat !== state.cat) return false;
          if (!q) return true;
          return it.name.toLowerCase().indexOf(q) >= 0 || it.cat.toLowerCase().indexOf(q) >= 0;
        }));
      }

      function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }

      function slotHtml(it, cls) {
        var color = COLORS[it.cat] || '#b0a89a';
        return '<button type="button" class="' + cls + (it.fav ? ' fav' : '') + (state.selectedId === it.id ? ' selected' : '') + '" ' +
          'data-item-id="' + it.id + '" aria-label="' + esc(it.name + ' ×' + it.count) + '" ' +
          'style="--cat:' + color + '">' +
          '<span class="p-dot"></span>' +
          '<span aria-hidden="true">' + it.emoji + '</span>' +
          '<span class="p-cnt">' + it.count + '</span>' +
          (it.fresh ? '<span class="p-new"></span>' : '') +
          '</button>';
      }

      function renderRecipes() {
        var html = '';
        for (var i = 0; i < RECIPES.length; i++) {
          var r = RECIPES[i];
          html += '<div class="p-recipe">' +
            '<div class="p-recipe-ico" aria-hidden="true">' + r.e + '</div>' +
            '<div><div class="p-recipe-name">' + esc(r.n) + '</div><div class="p-recipe-mat">' + esc(r.m) + '</div></div>' +
            '<span class="p-recipe-tag' + (r.ok ? '' : ' miss') + '">' + (r.ok ? '可做' : '缺料') + '</span>' +
            '</div>';
        }
        els.recipeList.innerHTML = html;
      }

      function syncInputs() {
        if (els.searchInput.value !== state.query) els.searchInput.value = state.query;
        if (els.wsSearch.value !== state.query) els.wsSearch.value = state.query;
        if (els.sortSelect.value !== state.sort) els.sortSelect.value = state.sort;
        if (els.wsSort.value !== state.sort) els.wsSort.value = state.sort;
      }

      function syncChips() {
        var groups = [els.chips, els.wsChips];
        for (var g = 0; g < groups.length; g++) {
          var buttons = groups[g].querySelectorAll('[data-cat]');
          for (var i = 0; i < buttons.length; i++) {
            buttons[i].classList.toggle('active', buttons[i].getAttribute('data-cat') === state.cat);
          }
        }
      }

      function render() {
        var p = parseSize(state.size);
        var filtered = visibleItems();
        var visibleCols = Math.min(p.cols, 8);
        var canFit = p.cols <= 8 && p.rows <= 10;
        var title = state.tab === 'backpack' ? '角色背包' : (state.tab === 'fridge' ? '冰箱' : (SIZE_TITLES[state.size] || '储物柜'));

        els.railTitle.textContent = title;
        els.railCap.textContent = sizeLabel(state.size);
        els.topHint.textContent = '柜子 ' + sizeLabel(state.size) + ' · 侧栏 340px 固定';
        els.fillStatus.textContent = filtered.length + ' / ' + state.cells + ' 格';
        els.viewStatus.textContent = canFit ? '全部可见 · 无滚动' : (visibleCols + ' 列可见 · 内部滚动');
        els.wsSub.textContent = title + ' · ' + sizeLabel(state.size) + ' · ' + filtered.length + ' 件';
        els.wsStatus.textContent = filtered.length + ' / ' + state.cells + ' 格';

        var tabs = els.tabs.querySelectorAll('[data-tab]');
        for (var t = 0; t < tabs.length; t++) {
          tabs[t].classList.toggle('active', tabs[t].getAttribute('data-tab') === state.tab);
        }

        var seg = els.modeSeg.querySelectorAll('[data-mode]');
        for (var s = 0; s < seg.length; s++) {
          seg[s].classList.toggle('active', seg[s].getAttribute('data-mode') === state.mode);
        }

        syncChips();
        syncInputs();

        if (state.mode === 'grid') {
          els.grid.hidden = false;
          els.list.hidden = true;
          els.grid.style.setProperty('--cols', p.cols);
          var html = '';
          if (!filtered.length) {
            html = '<div class="p-empty" style="grid-column:1/-1">没有匹配的物品</div>';
          } else {
            for (var i = 0; i < state.cells; i++) {
              if (i < filtered.length) html += slotHtml(filtered[i], 'p-slot');
              else html += '<div class="p-slot empty" aria-hidden="true"></div>';
            }
          }
          els.grid.innerHTML = html;
        } else {
          els.grid.hidden = true;
          els.list.hidden = false;
          var rowHtml = '<div class="p-list-head"><span></span><span>物品</span><span style="text-align:right">数量</span><span style="text-align:right">价值</span></div>';
          if (!filtered.length) {
            rowHtml += '<div class="p-empty">没有匹配的物品</div>';
          } else {
            for (var j = 0; j < filtered.length; j++) {
              var it = filtered[j];
              rowHtml += '<button type="button" class="p-row' + (state.selectedId === it.id ? ' selected' : '') + '" data-item-id="' + it.id + '">' +
                '<span class="p-row-ico" aria-hidden="true">' + it.emoji + '</span>' +
                '<span class="p-row-main"><span class="p-row-name">' + esc(it.name) + '</span><span class="p-row-sub">' + esc(it.cat) + ' · 保质 ' + it.shelf + 'h · 饱食 +' + it.sat + '</span></span>' +
                '<span class="p-row-cnt">×' + it.count + '</span>' +
                '<span class="p-row-val">' + it.value + '</span>' +
                '</button>';
            }
          }
          els.list.innerHTML = rowHtml;
        }

        var wsHtml = '';
        if (!filtered.length) {
          wsHtml = '<div class="p-empty" style="grid-column:1/-1">没有匹配的物品</div>';
        } else {
          for (var k = 0; k < state.cells; k++) {
            if (k < filtered.length) wsHtml += slotHtml(filtered[k], 'p-ws-slot');
            else wsHtml += '<div class="p-ws-slot empty" aria-hidden="true"></div>';
          }
        }
        els.wsGrid.innerHTML = wsHtml;
        updateGhost();
      }

      function setSize(size, remember) {
        var p = parseSize(size);
        state.size = size;
        if (remember !== false) state.lastCabinetSize = size;
        state.cells = p.cols * p.rows;
        state.cols = p.cols;
        state.rows = p.rows;
        var made = makeItems(size);
        state.items = made.items;
        state.cells = made.cells;
        state.selectedId = null;
        render();
      }

      function setTab(tab) {
        state.tab = tab;
        if (tab === 'backpack') setSize('6x5', false);
        else if (tab === 'fridge') setSize('8x7', false);
        else setSize(state.lastCabinetSize, false);
      }

      function findItem(id) {
        for (var i = 0; i < state.items.length; i++) {
          if (state.items[i].id === id) return state.items[i];
        }
        return null;
      }

      function showHover(it) {
        if (!it) {
          els.hoverDetail.textContent = '悬停查看物品 · 拖入烹饪台';
          return;
        }
        els.hoverDetail.innerHTML = '<b>' + esc(it.name) + '</b> ×' + it.count +
          ' · 交易 <span class="p-hv-gold">' + it.value + '</span>' +
          ' · 保质 ' + it.shelf + 'h · 饱食 +' + it.sat;
      }

      function updateGhost() {
        if (!els.compareToggle.checked) {
          els.ghost.classList.remove('on');
          return;
        }
        var p = parseSize(state.size);
        var official = p.cols * 40 + (p.cols - 1) * 6 + 20 + 30;
        els.ghost.style.width = official + 'px';
        els.ghostLabel.textContent = '官方 ~' + official + 'px' + (official > 340 ? ' → 整页缩' : '');
        els.ghost.classList.add('on');
      }

      function openWorkspace() {
        els.workspace.hidden = false;
        syncInputs();
        render();
        setTimeout(function () { els.wsSearch.focus(); }, 60);
      }

      function closeWorkspace() {
        els.workspace.hidden = true;
        els.searchInput.focus();
      }

      els.tabs.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-tab]');
        if (!btn) return;
        setTab(btn.getAttribute('data-tab'));
      });

      els.chips.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-cat]');
        if (!btn) return;
        state.cat = btn.getAttribute('data-cat');
        render();
      });

      els.wsChips.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-cat]');
        if (!btn) return;
        state.cat = btn.getAttribute('data-cat');
        render();
      });

      els.searchInput.addEventListener('input', function () {
        state.query = els.searchInput.value;
        render();
      });

      els.wsSearch.addEventListener('input', function () {
        state.query = els.wsSearch.value;
        render();
      });

      els.sortSelect.addEventListener('change', function () {
        state.sort = els.sortSelect.value;
        render();
      });

      els.wsSort.addEventListener('change', function () {
        state.sort = els.wsSort.value;
        render();
      });

      els.modeSeg.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-mode]');
        if (!btn) return;
        state.mode = btn.getAttribute('data-mode');
        render();
      });

      els.body.addEventListener('mouseover', function (e) {
        var el = e.target.closest('[data-item-id]');
        if (!el) return;
        showHover(findItem(parseInt(el.getAttribute('data-item-id'), 10)));
      });

      els.body.addEventListener('mouseleave', function () {
        showHover(null);
      });

      els.body.addEventListener('click', function (e) {
        var el = e.target.closest('[data-item-id]');
        if (!el) return;
        var id = parseInt(el.getAttribute('data-item-id'), 10);
        state.selectedId = state.selectedId === id ? null : id;
        render();
        if (state.selectedId !== null) showHover(findItem(state.selectedId));
      });

      els.controls.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-size]');
        if (!btn) return;
        state.tab = 'cabinet';
        setSize(btn.getAttribute('data-size'));
        var all = els.controls.querySelectorAll('[data-size]');
        for (var i = 0; i < all.length; i++) {
          var active = all[i] === btn;
          all[i].classList.toggle('btn-primary', active);
        }
      });

      els.compareToggle.addEventListener('change', updateGhost);
      els.expandBtn.addEventListener('click', openWorkspace);
      els.wsClose.addEventListener('click', closeWorkspace);

      window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !els.workspace.hidden) closeWorkspace();
      });

      renderRecipes();
      setSize('20x16');
      render();
    })();
  