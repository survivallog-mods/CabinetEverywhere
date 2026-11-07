/* 高度修改批 harness（Task4，spec 2026-11-07-bag-height §9.2 + Review Focus5；serve.cjs 须已在 8180）。
   口径注：侧栏 state.rows=ceil(cap/壳宽列数) 是装饰性估算（page.js applySize「容量换列数+行数
   cosmetic」），Cooking 壳宽=10 列 → cap216→22 行、cap600→60 行；**包高本体由官方格断言**
   （bagMsg 12×N → backpack.resize → .slot 数=12×N）。
   五查：
   ① 18 行：ctn cap=216(12×18)+bagMsg 12×18 → state.cap==216、官方格 216 枚、
      srView「22 行 · ↓ 纵向滚动」（=ceil(216/10)）、srBody scrollHeight>clientHeight
   ② 50 行/600 格：cap=600 + bagMsg 12×50 → 600 枚、渲染 <2s（Review Focus5 渲染压力）
   ③ cap 增长重算：同页 216→600 → cap/rows 22→60 即时重算（无重载不回包）
   ④ 燃油发电机高背包：__HZ_FGROWS__=50 先置后切页（夹具旋钮=实机「调整背包高度后重开」
      复现路）→ 左背包格 12×50=600 枚
   ⑤ 尾声：零 console error / pageerror */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/temp/baidu_up/node_modules/playwright-core')); }

const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' : '') + (detail || ''));
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HZ_CURRENT__ !== undefined && window.__HZ_CURRENT__() !== null, null, { timeout: 20000 });

  function frameOf(key) { return page.frames().find((f) => f.url().includes('/fixtures/' + key + '.html')); }
  async function waitRail(key, timeout = 12000) {
    await frameOf(key).waitForFunction(() => { const r = document.getElementById('srRail'); return r && r.isConnected; }, null, { timeout });
  }
  const post = (key, data) => page.evaluate(([k, d]) => window.__HZ_POST__(k, d), [key, data]);
  /* ctn[0]=900101 食材柜 的 cap 直改+重推（高度修改批=改 Config_Bag 高→cap=12×H 的夹具等价物） */
  const setCtn0Cap = (cap) => page.evaluate((c) => {
    const m = JSON.parse(JSON.stringify(window.__HZ_MOCKSET__()));
    m.ctn[0][3] = c;
    window.__HZ_MOCKSET__(m);
    window.__HZ_PUSH__('Cooking');
  }, cap);
  const bagMsg = (rows) => ({ type: 'WebUI_Cooking_BagMsg', data: { bagOwnerId: 900001, bagCols: 12, bagRows: rows, bagItems: [], workbenchItems: [] } });
  const railState = () => page.evaluate(() => {
    const s = window.__CERAIL__.state || {};
    return { rows: s.rows, cap: s.cap, currentId: s.currentId };
  });
  const slotCount = () => frameOf('Cooking').evaluate(() => document.querySelectorAll('#srGridHost .slot').length);
  const railGeom = () => frameOf('Cooking').evaluate(() => {
    const body = document.getElementById('srBody');
    const view = document.getElementById('srView');
    return { scrollH: body ? body.scrollHeight : 0, clientH: body ? body.clientHeight : 0, view: view ? view.textContent : '' };
  });
  /* 官方页签点击（bag 族 SWITCH_BAG 签名照 harness-switch-cabinet 附录 A） */
  const clickOfficialTab = (id) => page.evaluate((i) => {
    const d = document.getElementById('Cooking').contentDocument;
    const want = String(i);
    let el = null;
    d.querySelectorAll('#bagTabs .bag-tab').forEach((t) => { if (String(t._ownerId) === want) el = t; });
    if (!el) { const list = d.querySelectorAll('#bagTabsScroll .bag-tab'); el = list[Number(want) - 900001 - 1] || null; }
    if (!el) throw new Error('official tab not found: #' + i);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, id);
  async function waitTitle(want, timeout = 8000) {
    await frameOf('Cooking').waitForFunction((w) => (document.getElementById('srTitle') || {}).textContent === w, want, { timeout });
  }
  const sleep = (ms) => page.waitForTimeout(ms);

  /* ④ 前置：FGROWS=50 先置（FuelGenerator 帧未加载，旋钮随帧加载消费） */
  await page.evaluate(() => { window.__HZ_FGROWS__ = 50; });

  /* ---- Cooking 准备 ---- */
  await page.evaluate(() => window.__HZ_SHOW__('Cooking'));
  await waitRail('Cooking');
  await post('Cooking', { type: 'WebUI_Cooking_BagMsg', data: { bagTabs: [{ ownerId: 900001, name: '背包' }, { ownerId: 900101, name: '食材柜' }, { ownerId: 900102, name: '冷藏柜' }], bagOwnerId: 900001, bagItems: [], workbenchItems: [] } });
  await sleep(80);

  /* ---- ① 18 行（bagMsg 先行Resize官方格，再切柜避免回包翻回背包）---- */
  await post('Cooking', bagMsg(18));
  await frameOf('Cooking').waitForFunction(() => document.querySelectorAll('#srGridHost .slot').length >= 216, null, { timeout: 6000 }).catch(() => { });
  await setCtn0Cap(216);
  await clickOfficialTab(900101);
  await waitTitle('食材柜');
  await sleep(150);
  const s18 = await railState();
  const g18 = await railGeom();
  check('① 18 行：state.cap==216 且 rows==22(=ceil(216/壳10列))', s18.cap === 216 && s18.rows === 22, JSON.stringify(s18));
  check('① 18 行：官方格 216 枚(12×18)', (await slotCount()) === 216, 'slots=' + (await slotCount()));
  check('① 18 行：srView 报「22 行 · ↓ 纵向滚动」', /22 行 · ↓ 纵向滚动/.test(g18.view), 'view="' + g18.view + '"');
  check('① 18 行：srBody 纵向滚动启用', g18.scrollH > g18.clientH, 'scroll=' + g18.scrollH + ' client=' + g18.clientH);

  /* ---- ③/② 50 行（同页 216→600：③ 即时重算；② 官方格+渲染时限）---- */
  await setCtn0Cap(600);
  await sleep(150);
  const s50 = await railState();
  const g50 = await railGeom();
  check('③ cap 增长重算：cap 216→600、rows 22→60（无重载）', s50.cap === 600 && s50.rows === 60, JSON.stringify(s50));
  check('③ srView 报「60 行 · ↓ 纵向滚动」', /60 行 · ↓ 纵向滚动/.test(g50.view), 'view="' + g50.view + '"');
  const t0 = Date.now();
  await post('Cooking', bagMsg(50));
  await frameOf('Cooking').waitForFunction(() => document.querySelectorAll('#srGridHost .slot').length >= 600, null, { timeout: 6000 }).catch(() => { });
  const renderMs = Date.now() - t0;
  check('② 50 行：官方格 600 枚(12×50)', (await slotCount()) === 600, 'slots=' + (await slotCount()));
  check('② 50 行：渲染 <2s', renderMs < 2000, renderMs + 'ms');

  /* ---- ④ 燃油发电机高背包（12×50）：bagtabs 装配页无 #srRail，等 #srfgTabs（fuelgen harness 同路）；
   *    直投 BagMsg 12×50（=官方对高度改写的回包形状，比 FGROWS 旋钮更贴本批语义）---- */
  await page.getByRole('button', { name: 'FuelGenerator', exact: true }).click();
  await frameOf('FuelGenerator').waitForFunction(() => document.getElementById('srfgTabs'), null, { timeout: 12000 });
  await post('FuelGenerator', { type: 'WebUI_FuelGenerator_BagMsg', data: { bagOwnerId: 900001, bagCols: 12, bagRows: 50, bagItems: [], fuelSlotCount: 8, fuelItems: [], generatorName: '中型' } });
  await frameOf('FuelGenerator').waitForFunction(() => {
    const g = document.getElementById('backpackGrid');
    return g && g.querySelectorAll('.slot').length >= 600;
  }, null, { timeout: 12000 }).catch(() => { });
  const fgSlots = await frameOf('FuelGenerator').evaluate(() => {
    const g = document.getElementById('backpackGrid');
    return g ? g.querySelectorAll('.slot').length : 0;
  });
  const fgBody = await frameOf('FuelGenerator').evaluate(() => {
    /* 背包页签=官方格整幅直显：量官方左面板（.generator-system 左 panel，fgSyncHeight 778 钳）
       ——600 格高背包的既定契约=面板**不越界**（scrollH≤clientH+2；夹具渐进渲染把超高吃在格区内） */
    const p = document.querySelector('.generator-system > .panel:not(.gen-panel)');
    const g = document.getElementById('backpackGrid');
    return p ? { panelScrollH: p.scrollHeight, panelClientH: p.clientHeight, gridH: g ? g.offsetHeight : 0 } : null;
  });
  check('④ 燃油发电机：高背包 12×50=600 枚渲染', fgSlots === 600, 'slots=' + fgSlots);
  check('④ 燃油发电机：高背包面板不越界（scrollH≤clientH+2）', fgBody != null && fgBody.panelScrollH <= fgBody.panelClientH + 2 && fgBody.gridH > 0, JSON.stringify(fgBody));

  /* ---- ⑤ 收尾 ---- */
  check('⑤ 零 console error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' || '));
  check('⑤ 零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' || '));

  const pass = results.filter((r) => r.ok).length;
  console.log('harness-height: ' + pass + '/' + results.length);
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
