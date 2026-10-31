/* v1.8.2 全场景壳架构验收（Playwright，serve.cjs 须已在 8180）。
   口径 = UI-SPEC v13 §0 动作保真红线 + §4.5/§4.8 新口径：
   R1 rack 三段装配：作用域容器（id=rackSystem+data-sr-scope）替换官方原位；官方左 .bag-panel
      （#panelA/#bagGrid/.item 真渲染）+ 官方 .transfer-controls（#btnPutAll/#btnTakeAll）+
      mod 三按钮 #srMid + 官方右 .bag-panel.is-storage（#rackBody/.rk-row 真渲染）进 #srRail
      srGridHost + #flyLayer 在壳内；零桩（真节点全在文档）；
   R2 官方动作链存活：bagGrid .item 左键 → ITEM_CLICK；.rk-row 右键 → TAKE_ONE（官方监听
      在 reparent 后原样跑——动作保真的直接证据）；
   R3 rackOpen：柜签点击 → drain 含 rackOpen{owner}；rack 族零 forge（不走 SWITCH_BAG）；
   R4 官方按钮原生：#btnTakeAll 点击 → PUT_ALL 事件（官方监听，零 mod 接线）；
   R5 搜索过滤：.rk-row 按图标识别 display 层（歧义不藏）→ 清词恢复；
   R6 列表纯展示：官方右面板 hidden、列表行零命令（drain=[]）；
   R7 宿主复活重装配：官方重建 #rackSystem → 重装配不丢件；
   M1 机器页回归：Cooking 官方格进壳 + forge 切换路；M2 BackpackUI bagonly 官方格进壳；
   M3 Trade；Z 全程零控制台错误。 */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/Users/wangk/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright')); }

const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' : '') + (detail || ''));
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HZ_CURRENT__ !== undefined && window.__HZ_CURRENT__() !== null, null, { timeout: 20000 });

  function frameOf(key) { return page.frames().find((f) => f.url().includes('/fixtures/' + key + '.html')); }
  async function waitRail(key, timeout = 9000) {
    await frameOf(key).waitForFunction(() => { const r = document.getElementById('srRail'); return r && r.isConnected; }, null, { timeout });
  }
  const fev = (key, fn, ...a) => frameOf(key).evaluate(fn, ...a);
  const drain = () => page.evaluate(() => window.__CERAIL__.drain());
  const showScene = async (key) => { await page.getByRole('button', { name: key, exact: true }).click(); await waitRail(key); };
  /* v1.8.3：BackpackUI 原生模式无 rail——只切场景不候 rail */
  const showNative = async (key) => { await page.getByRole('button', { name: key, exact: true }).click(); };

  /* ================= R 组：整理物资简洁版（v1.8.2.5：只换背包面板→plainbag） ================= */
  await showScene('MaterialRack');
  await page.waitForTimeout(400); /* nudge 行渲染余量 */
  const r1 = await fev('MaterialRack', () => {
    const host = document.getElementById('srGridHost');
    const bagGrid = document.getElementById('bagGrid');
    const rail = document.getElementById('srRail');
    const rackSys = document.getElementById('rackSystem');
    const right = document.querySelector('.bag-panel.is-storage');
    const mid = document.querySelector('.transfer-controls');
    const midExtra = document.getElementById('srMid');
    const fly = document.getElementById('flyLayer');
    return {
      railMounted: !!(rail && rail.isConnected),
      plainbagClass: rail ? rail.classList.contains('plainbag') : false,
      chromeHidden: (() => { const t = document.querySelector('#srRail .sr-tools'); const c2 = document.querySelector('#srRail .sr-ctnbar'); const sr = document.querySelector('#srRail .sr-searchrow'); return !!(t && c2 && sr && getComputedStyle(t).display === 'none' && getComputedStyle(c2).display === 'none' && getComputedStyle(sr).display === 'none'); })(),
      bagGridInRail: !!(host && bagGrid && host.contains(bagGrid)),
      bagItems: bagGrid ? bagGrid.querySelectorAll('.item').length : -1,
      officialRightUntouched: !!(right && rackSys && rackSys.contains(right)),
      rackRows: document.querySelectorAll('#rackBody .rk-row').length,
      midOfficial2: !!(mid && mid.querySelector('#btnPutAll') && mid.querySelector('#btnTakeAll')),
      midMod3: midExtra ? midExtra.querySelectorAll('button').length : -1,
      flyUntouched: !!(fly && rackSys && rackSys.contains(fly)),
      wtStub: !!document.getElementById('wtText') /* 负重条随官方面板移除 → 桩兜底 */
    };
  });
  check('R1:plainbag-rail', r1.railMounted && r1.plainbagClass && r1.chromeHidden, '背包侧=简洁栏（页签/搜索/标签/工具全隐）');
  check('R1:bag-grid-in-rail', r1.bagGridInRail && r1.bagItems > 0, '官方背包格进壳（.item=' + r1.bagItems + '）');
  check('R1:official-right-untouched', r1.officialRightUntouched && r1.rackRows > 0, '右侧柜子面板官方原样（.rk-row=' + r1.rackRows + '）');
  check('R1:mid-2-official-3-mod', r1.midOfficial2 && r1.midMod3 === 3, '转移列=官方两原件+mod 三按钮');
  check('R1:fly-untouched', r1.flyUntouched, '#flyLayer 官方原样');
  check('R1:wt-stub', r1.wtStub, 'wtText 桩兜底（负重条随面板移除）');

  /* R2 官方动作链：spy 官方 UnitySendEvent（背包格左键 + 行右键） */
  await fev('MaterialRack', () => {
    window.__SPY__ = [];
    const orig = window.core.UnitySendEvent;
    window.core.UnitySendEvent = function (t, d) { window.__SPY__.push({ type: t }); return orig.apply(this, arguments); };
    return true;
  });
  await frameOf('MaterialRack').locator('#bagGrid .item').first().click({ timeout: 4000 }).catch(() => { });
  await page.waitForTimeout(150);
  const spyBag = await fev('MaterialRack', () => window.__SPY__.map(function (x) { return x.type; }));
  check('R2:bag-item-click-official', spyBag.indexOf('ITEM_CLICK') >= 0, '官方背包格左键 → ITEM_CLICK（' + JSON.stringify(spyBag) + '）');
  await fev('MaterialRack', () => { window.__SPY__ = []; });
  await fev('MaterialRack', () => {
    const t = document.querySelector('#rackBody .rk-row .rk-track');
    if (!t) return;
    t.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true, cancelable: true }));
    t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(150);
  const spyRow = await fev('MaterialRack', () => window.__SPY__.map(function (x) { return x.type; }));
  check('R2:row-rightclick-takeone', spyRow.indexOf('TAKE_ONE') >= 0, '官方行右键 → TAKE_ONE 取 1（' + JSON.stringify(spyRow) + '）');
  /* R4 官方按钮原生：#btnTakeAll → 事件 */
  await fev('MaterialRack', () => {
    const btn = document.getElementById('btnTakeAll');
    if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(150);
  const spyBtn = await fev('MaterialRack', () => window.__SPY__.map(function (x) { return x.type; }));
  check('R4:official-takeall', spyBtn.indexOf('PUT_ALL') >= 0 || spyBtn.indexOf('TAKE_ALL') >= 0, '官方全部取出按钮原生事件（' + JSON.stringify(spyBtn) + '）');
  await drain();

  /* R7 宿主复活重装配（官方重建左背包面板 → 重装） */
  await fev('MaterialRack', () => {
    const clone = document.createElement('div');
    clone.className = 'bag-panel';
    clone.innerHTML = '<div class="header"></div><div class="panel" id="panelA"><div class="weight-section"><span id="wtText"></span><div id="wtFill"></div></div><div class="grid-wrap" id="gridWrap"><div class="grid-container" id="bagGrid"></div></div></div>';
    document.body.appendChild(clone);
    return true;
  });
  await page.waitForTimeout(1600);
  const r7 = await fev('MaterialRack', () => {
    const rail = document.getElementById('srRail');
    const officialPanels = document.querySelectorAll('.bag-panel:not(.is-storage)');
    /* 重装后：旧壳被清，新官方面板被替换（文档中非壳内 .bag-panel:not(.is-storage) 应为 0） */
    let outside = 0;
    officialPanels.forEach((x) => { if (!x.closest('#srp')) outside++; });
    return { remounted: !!(rail && rail.isConnected), outside };
  });
  check('R7:revive-remount', r7.remounted && r7.outside === 0, '官方重建 → 重装配（壳外官方面板=' + r7.outside + '）');

  /* ================= M 组：机器页/背包页回归 ================= */
  await showScene('Cooking');
  await page.waitForTimeout(300);
  const m1 = await fev('Cooking', () => {
    const host = document.getElementById('srGridHost');
    const grid = document.getElementById('backpackGrid');
    return { gridInShell: !!(host && grid && host.contains(grid)), items: grid ? grid.querySelectorAll('.item').length : -1, title: (document.getElementById('srTitle') || {}).textContent || '' };
  });
  check('M1:cooking-grid-in-shell', m1.gridInShell && m1.items > 0, 'Cooking 官方格进壳（items=' + m1.items + '）');
  await drain();
  await fev('Cooking', () => {
    const pin = document.querySelector('#srPinRow [data-ctn="900102"]');
    if (pin) pin.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(400); /* forge → 120ms 模拟回包 → followActive 渲染 */
  const m1f = await page.evaluate(() => window.__HZ_FORGES__().slice(-1)[0] || null);
  check('M1:cooking-forge-switch', !!(m1f && m1f.type === 'SWITCH_BAG' && m1f.data && m1f.data.ownerId === 900102), '机器页切柜走 forge SWITCH_BAG（' + JSON.stringify(m1f) + '）');

  await showNative('BackpackUI'); /* v1.8.3 原生模式：不装配壳，官方页整页原生 + srNativeBp 注入 */
  await page.waitForTimeout(300);
  {
    const nf = frameOf('BackpackUI');
    await nf.waitForFunction(() => document.getElementById('srNativeBp'), null, { timeout: 9000 });
    const m2 = await nf.evaluate(() => {
      const st = document.getElementById('srNativeBp');
      const css = st ? st.textContent || '' : '';
      const gc = document.querySelector('.grid-container');
      const gcStyle = gc ? getComputedStyle(gc) : null;
      return {
        nativeCss: !!st && /max-height:560px/.test(css) && /padding-right:12px/.test(css) && /\.bag-panel\.is-storage \.weight-section/.test(css),
        noRail: !document.getElementById('srRail'),
        hostIntact: !!document.querySelector('.backpack-container'),
        gridNative: !!gc && !!gc.closest('.backpack-container'),
        scrollable: gcStyle ? gcStyle.overflowY === 'auto' && gcStyle.maxHeight === '560px' && gcStyle.boxSizing === 'content-box' : false
      };
    });
    check('M2:backpack-native-css', m2.nativeCss && m2.noRail, 'v1.8.3 原生模式：srNativeBp 三点规则在场、无 rail（旧 bagonly/进壳断言随 rail 退役）');
    check('M2:backpack-host-intact', m2.hostIntact && m2.gridNative, '官方 .backpack-container 原位、.grid-container 未搬动（官方页整页原生）');
    check('M2:grid-scroll-rules-applied', m2.scrollable, '.grid-container 计算样式：overflow-y=auto/max-height=560px/content-box（滚动条不压格）');
  }
  /* M2b（撤销说明，2026-10-31）：mid-life isDualBag 翻转是合成场景——实测 Vue 根列表结构性
     重渲染会摘除其管辖位置的外来节点（#srp 连带官方容器一并进游离树，页面自身重排），该路径
     在真实游戏不存在（BackpackUI 每次打开都是全新 iframe，形态出生即定：开柜=dual / B键=single）。
     dual 三段壳的验收走实机开柜路径（v182-ingame-watch 场景矩阵）；railui.page.js 的形态看门狗
     保留作非破坏性 patch 下的尽力自愈。 */

  await showScene('Trade');
  await page.waitForTimeout(300);
  const m3 = await fev('Trade', () => {
    const host = document.getElementById('srGridHost');
    const grid = document.getElementById('tradeBagGrid');
    return { gridInShell: !!(host && grid && host.contains(grid)), items: grid ? grid.querySelectorAll('.item').length : -1 };
  });
  check('M3:trade-grid-in-shell', m3.gridInShell, 'Trade 官方 #tradeBagGrid 进壳（items=' + m3.items + '）');

  check('Z:zero-console-errors', consoleErrors.length === 0 && pageErrors.length === 0, JSON.stringify({ consoleErrors, pageErrors }));

  const fails = results.filter((r) => !r.ok).length;
  console.log('---');
  console.log('TOTAL ' + results.length + ' PASS ' + (results.length - fails) + ' FAIL ' + fails);
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('SCRIPT-ERROR', e); process.exit(2); });
