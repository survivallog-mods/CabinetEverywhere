/* T12 root harness（railui-root-harness.html）断言（Playwright，serve.cjs 须已在 8180）。
   真装配路径（Root+#iframe-container+12 iframe+ensureMounted 循环）上的整理全流程：
   ① 机器场景主侧栏（Cooking）：快照→drain {op:'tidy',owner:bag}→mock 合并回推→差量
      toast 数字对账（铁钉 40+12 并 52，10 叠→9 叠）+ 网格同步；
   ② lastTidyFail 失败路：降级 toast/不差量/基座不动/标志一次性消费且未闩死；
   ③ rack 左面板 sbTidy=背包整理（MaterialRack duo）：drain owner=bag + toast 主侧栏 +
      T8 桩 16 回归；
   ④ 全库视图 srTidy 隐藏回归（真装配路径 render 规则）。 */
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8180';
const EXEC = 'C:/Users/wangk/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' : '') + (detail || ''));
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXEC });
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
  const ftxt = (key, sel) => frameOf(key).evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel);
  const fhidden = (key, sel) => frameOf(key).evaluate((s) => { const e = document.querySelector(s); return !e || e.hidden; }, sel);
  const drain = () => page.evaluate(() => window.__CERAIL__.drain());
  const showScene = async (key) => { await page.getByRole('button', { name: key, exact: true }).click(); await waitRail(key); };

  /* ---- ① Cooking 机器场景主侧栏整理（背包对象，harness 默认基座 bag=10 叠） ---- */
  await waitRail('Cooking');
  await frameOf('Cooking').waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '背包', null, { timeout: 9000 });
  await page.waitForFunction(() => window.__CERAIL__.drain() === '[]', null, { timeout: 5000 });
  check('root:tidy-visible-bag', !(await fhidden('Cooking', '#srTidy')), 'Cooking bag 页 srTidy 可见');
  const items0 = await frameOf('Cooking').evaluate(() => document.querySelectorAll('#srGrid .sr-slot[data-it]').length);
  check('root:bag-10-before', items0 === 10, '前置背包 10 叠=' + items0);
  await frameOf('Cooking').locator('#srTidy').click();
  await page.waitForTimeout(120);
  const d1 = JSON.parse(await drain());
  check('root:cmd-json', d1.length === 1 && d1[0].op === 'tidy' && d1[0].owner === 900001,
    'drain=' + JSON.stringify(d1));
  const toast1 = await ftxt('Cooking', '#srToast');
  check('root:delta-toast', toast1 === '已整理：10 叠合并为 9 叠', 'toast=' + toast1);
  const bagAfter = await page.evaluate(() => {
    const m = window.__HZ_MOCKSET__();
    return { rows: m.items.bag.length, nail: m.items.bag.filter((r) => r[1] === 5).map((r) => r[2]) };
  });
  check('root:merge-accounts', bagAfter.rows === 9 && bagAfter.nail.length === 1 && bagAfter.nail[0] === 52,
    'mock 基座 9 叠 & 铁钉并 52（40+12 件数守恒） ' + JSON.stringify(bagAfter));
  const grid1 = await frameOf('Cooking').evaluate(() => document.querySelectorAll('#srGrid .sr-slot[data-it]').length);
  check('root:grid-9', grid1 === 9, '网格同步 9 叠=' + grid1);

  /* ---- ② lastTidyFail 失败路 ---- */
  await page.evaluate(() => { window.__HZ_TIDYFAIL__ = true; });
  await frameOf('Cooking').locator('#srTidy').click();
  await page.waitForTimeout(120);
  const toast2 = await ftxt('Cooking', '#srToast');
  check('root:fail-toast', toast2 === '本界面暂不支持整理', '降级 toast=' + toast2);
  check('root:fail-not-success', toast2.indexOf('已整理') < 0, '不误报成功');
  const bagAfterFail = await page.evaluate(() => {
    const m = window.__HZ_MOCKSET__();
    return { rows: m.items.bag.length, flag: m.ctx && m.ctx.lastTidyFail };
  });
  check('root:fail-no-merge-consumed', bagAfterFail.rows === 9 && bagAfterFail.flag === false,
    '基座未合并（9 叠）& 标志一次性消费 ' + JSON.stringify(bagAfterFail));
  await page.evaluate(() => { window.__HZ_TIDYFAIL__ = false; });
  await frameOf('Cooking').locator('#srTidy').click();
  await page.waitForTimeout(120);
  await drain();
  const toast2b = await ftxt('Cooking', '#srToast');
  check('root:fail-not-latched', toast2b === '已整理：9 叠合并为 9 叠', '标志未闩死：后续 tidy 正常差量（无可并 N=M 照打）=' + toast2b);

  /* ---- ③ rack 左面板 sbTidy=背包整理 + T8 桩回归 ---- */
  await showScene('MaterialRack');
  await frameOf('MaterialRack').waitForFunction(() => !!document.getElementById('sbGrid'), null, { timeout: 9000 });
  /* 注入两叠铁钉背包（差量数字干净：2 叠→1 叠） */
  await page.evaluate(() => {
    const j = JSON.parse(JSON.stringify(window.__HZ_MOCKSET__()));
    j.items.bag = [[950, 5, 40, 0, 0, 0, 1, 1, 0], [951, 5, 12, 0, 1, 0, 1, 1, 0]];
    window.__HZ_MOCKSET__(j);
    window.__HZ_PUSH__('MaterialRack');
  });
  await frameOf('MaterialRack').waitForFunction(() => document.querySelectorAll('#sbGrid .sr-slot[data-it]').length === 2, null, { timeout: 5000 });
  await page.waitForFunction(() => window.__CERAIL__.drain() === '[]', null, { timeout: 5000 });
  await frameOf('MaterialRack').locator('#sbTidy').click();
  await page.waitForTimeout(120);
  const d3 = JSON.parse(await drain());
  check('root:sb-cmd-json', d3.length === 1 && d3[0].op === 'tidy' && d3[0].owner === 900001,
    'sbTidy drain=' + JSON.stringify(d3));
  const toast3 = await ftxt('MaterialRack', '#srToast');
  check('root:sb-delta-toast', toast3 === '已整理：2 叠合并为 1 叠', 'sbTidy toast 走主侧栏 #srToast=' + toast3);
  const sbAfter = await frameOf('MaterialRack').evaluate(() => document.querySelectorAll('#sbGrid .sr-slot[data-it]').length);
  check('root:sb-grid-1', sbAfter === 1, 'sbGrid 同步 1 叠=' + sbAfter);
  const stubs = await frameOf('MaterialRack').evaluate(() => {
    const els = [...document.querySelectorAll('[data-cer-stub]')];
    return { n: els.length, allHidden: els.every((e) => e.hidden && e.style.display === 'none'), hostGone: !document.getElementById('rackSystem') };
  });
  check('root:stubs-host-regression', stubs.n === 16 && stubs.allHidden && stubs.hostGone,
    'T8 桩 16 全隐藏 + #rackSystem 消亡（回归） ' + JSON.stringify(stubs));
  /* sbTidy 空背包：零命令 */
  await page.evaluate(() => {
    const j = JSON.parse(JSON.stringify(window.__HZ_MOCKSET__()));
    j.items.bag = [];
    window.__HZ_MOCKSET__(j);
    window.__HZ_PUSH__('MaterialRack');
  });
  await frameOf('MaterialRack').waitForFunction(() => document.querySelectorAll('#sbGrid .sr-slot[data-it]').length === 0, null, { timeout: 5000 });
  await page.waitForFunction(() => window.__CERAIL__.drain() === '[]', null, { timeout: 5000 });
  await frameOf('MaterialRack').locator('#sbTidy').click();
  await page.waitForTimeout(100);
  const toast3b = await ftxt('MaterialRack', '#srToast');
  check('root:sb-empty-toast', toast3b === '背包是空的', 'sbTidy 空背包 toast=' + toast3b);
  check('root:sb-empty-nocmd', (await drain()) === '[]', 'sbTidy 空背包零命令');

  /* ---- ④ 全库视图 srTidy 隐藏回归（回 Cooking，真装配路径） ---- */
  await showScene('Cooking');
  await frameOf('Cooking').waitForFunction(() => !!document.getElementById('srRail') && !!document.getElementById('srScope'), null, { timeout: 9000 });
  await frameOf('Cooking').locator('#srScope').click();
  await frameOf('Cooking').waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '全库搜索', null, { timeout: 5000 });
  const globalHidden = await fhidden('Cooking', '#srTidy');
  check('root:global-tidy-hidden', globalHidden === true, '全库视图 srTidy hidden=' + globalHidden);
  await frameOf('Cooking').locator('#srScope').click();
  await frameOf('Cooking').waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '背包', null, { timeout: 5000 });
  check('root:local-tidy-visible', !(await fhidden('Cooking', '#srTidy')), '回本柜视图复显');

  check('root:console-clean', consoleErrors.length === 0 && pageErrors.length === 0,
    'console errors=' + consoleErrors.length + ' pageErrors=' + pageErrors.length + (consoleErrors[0] ? ' | ' + consoleErrors[0] : '') + (pageErrors[0] ? ' | ' + pageErrors[0] : ''));

  await browser.close();
  const fails = results.filter((r) => !r.ok).length;
  console.log('---- root harness: ' + (results.length - fails) + '/' + results.length + ' PASS ----');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('DRIVER ERROR', e); process.exit(2); });
