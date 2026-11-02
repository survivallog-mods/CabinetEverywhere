/* T11 root harness（railui-root-harness.html）断言（Playwright，serve.cjs 须已在 8180）。
   真装配路径（Root+#iframe-container+12 iframe+ensureMounted 循环）上的全流程：
   ① 机器场景主侧栏入口（Cooking）：显隐/确认文案对账/豁免不秒关/Esc/取消/确认→drain
      JSON 带 order→mock 执行→差量 toast 数字对账/背包网格态；
   ② rack 左面板入口（MaterialRack duo）：主侧栏隐/左面板显、确认→order、零命中分支
      （bag=医疗 7 件→全留背包 toast）、空背包 sbToast；
   ③ 回归：T8 桩 16、宿主消亡、T9 切柜（rack 本地渲染路）、A→B→A 重访后入库弹窗仍活。 */
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' : '') + (detail || ''));
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/wangk/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe' });
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
  const fhtml = (key, sel) => frameOf(key).evaluate((s) => (document.querySelector(s) || {}).innerHTML || '', sel);
  const fhidden = (key, sel) => frameOf(key).evaluate((s) => { const e = document.querySelector(s); return !e || e.hidden; }, sel);
  const fesc = (key) => frameOf(key).evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  const drain = () => page.evaluate(() => window.__CERAIL__.drain());
  const showScene = async (key) => { await page.getByRole('button', { name: key, exact: true }).click(); await waitRail(key); };

  /* ---- ① Cooking：机器场景主侧栏入口 ---- */
  await waitRail('Cooking');
  await frameOf('Cooking').waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '背包', null, { timeout: 9000 });
  check('root:cook-sr-visible', !(await fhidden('Cooking', '#srStoreAll')), 'Cooking bag 页 srStoreAll 可见');
  await frameOf('Cooking').locator('#srStoreAll').click();
  await page.waitForTimeout(150);
  check('root:no-insta-close', !(await fhidden('Cooking', '#srStoreConfirm')), '真装配路径点开不秒关（豁免清单）');
  const ctext = await fhtml('Cooking', '#srStoreText');
  check('root:confirm-text', /背包现有 <b>128<\/b> 件（10 叠）/.test(ctext) && ctext.indexOf('柜满顺延下一个同标签柜') >= 0, '文案=128 件（10 叠）+柜满顺延…');
  await fesc('Cooking');
  check('root:esc-close', await fhidden('Cooking', '#srStoreConfirm'), 'Esc 关闭');
  await frameOf('Cooking').locator('#srStoreAll').click();
  const reopenOk = !(await fhidden('Cooking', '#srStoreConfirm'));
  await frameOf('Cooking').locator('#srStoreCancel').click();
  check('root:reopen-cancel', reopenOk && await fhidden('Cooking', '#srStoreConfirm'), '重开+取消');
  await frameOf('Cooking').locator('#srStoreAll').click();
  await frameOf('Cooking').locator('#srStoreGo').click();
  await page.waitForTimeout(100);
  const d1 = JSON.parse(await drain());
  check('root:cmd-json', d1.length === 1 && d1[0].op === 'storeAll' && JSON.stringify(d1[0].order) === '[900101,900102,900103,900104]',
    'drain=' + JSON.stringify(d1[0]));
  const toast1 = await ftxt('Cooking', '#srToast');
  check('root:delta-toast', toast1 === '已入库 121 件 → 食材柜×41 · 材料架×80；7 件无匹配柜或柜已满，留在背包', 'toast=' + toast1);
  const bagGrid = await frameOf('Cooking').evaluate(() => ({
    items: document.querySelectorAll('#srGrid .sr-slot[data-it]').length,
    emptyMsg: !!document.querySelector('#srGrid .sr-empty'),
    cells: document.querySelectorAll('#srGrid .sr-slot').length
  }));
  check('root:bag-grid-leftover', bagGrid.items === 2 && !bagGrid.emptyMsg && bagGrid.cells === 50, '背包剩 2 叠 + 空格补位（非「没有匹配的物品」） ' + JSON.stringify(bagGrid));

  /* ---- ② MaterialRack：左面板入口（bag 现存医疗 7 件 → 零命中分支） ---- */
  await showScene('MaterialRack');
  await frameOf('MaterialRack').waitForFunction(() => !!document.getElementById('sbGrid'), null, { timeout: 9000 });
  const rackVis = await frameOf('MaterialRack').evaluate(() => ({ sr: document.getElementById('srStoreAll').hidden, sb: document.getElementById('sbStoreAll').hidden }));
  check('root:rack-visibility', rackVis.sr === true && rackVis.sb === false, '主侧栏隐/左面板显 ' + JSON.stringify(rackVis));
  const stubs = await frameOf('MaterialRack').evaluate(() => {
    const els = [...document.querySelectorAll('[data-cer-stub]')];
    return { n: els.length, allHidden: els.every((e) => e.hidden && e.style.display === 'none'), hostGone: !document.getElementById('rackSystem') };
  });
  check('root:stubs-host', stubs.n === 16 && stubs.allHidden && stubs.hostGone, 'T8 桩 16 全隐藏 + #rackSystem 消亡（回归） ' + JSON.stringify(stubs));
  await frameOf('MaterialRack').locator('#sbStoreAll').click();
  await page.waitForTimeout(150);
  check('root:sb-no-insta-close', !(await fhidden('MaterialRack', '#sbConfirm')), 'sbStoreAll 豁免不秒关');
  const sbText = await fhtml('MaterialRack', '#sbText');
  check('root:sb-confirm-text', /背包现有 <b>7<\/b> 件（2 叠）/.test(sbText), '医疗剩量文案=7 件（2 叠）');
  await fesc('MaterialRack');
  check('root:sb-esc', await fhidden('MaterialRack', '#sbConfirm'), 'Esc 关 sbConfirm');
  await frameOf('MaterialRack').locator('#sbStoreAll').click();
  await frameOf('MaterialRack').locator('#sbGo').click();
  await page.waitForTimeout(100);
  const d2 = JSON.parse(await drain());
  check('root:sb-cmd-json', d2.length === 1 && d2[0].op === 'storeAll' && JSON.stringify(d2[0].order) === '[900101,900102,900103,900104]',
    'rack order=' + JSON.stringify(d2[0].order));
  const toast2 = await ftxt('MaterialRack', '#srToast');
  check('root:all-stay-toast', toast2 === '7 件无匹配柜或柜已满，留在背包', '零命中分支 toast=' + toast2);
  const bagIntact = await frameOf('MaterialRack').evaluate(() => document.querySelectorAll('#sbGrid .sr-slot[data-it]').length);
  check('root:bag-intact', bagIntact === 2, '背包原样 2 叠');

  /* 空背包（__HZ_MOCKSET__ 注入 + __HZ_PUSH__ 重推）→ sbToast 不弹窗 + sbGrid 空格网格 */
  await page.evaluate(() => {
    const j = JSON.parse(JSON.stringify(window.__HZ_MOCKSET__()));
    j.items.bag = [];
    window.__HZ_MOCKSET__(j);
    window.__HZ_PUSH__('MaterialRack');
  });
  await frameOf('MaterialRack').waitForFunction(() => document.querySelectorAll('#sbGrid .sr-slot[data-it]').length === 0, null, { timeout: 5000 });
  const sbEmpty = await frameOf('MaterialRack').evaluate(() => document.querySelectorAll('#sbGrid .sr-slot.empty').length);
  check('root:sb-empty-grid', sbEmpty === 50, 'sbGrid 容器空=50 空格');
  await frameOf('MaterialRack').locator('#sbStoreAll').click();
  await page.waitForTimeout(100);
  const sbEmptyToast = await ftxt('MaterialRack', '#sbToast');
  check('root:sb-empty-toast', sbEmptyToast === '背包是空的' && await fhidden('MaterialRack', '#sbConfirm'), 'sb 空背包 sbToast 不弹窗零命令');

  /* ---- ③ 回归：rack 切柜（本地渲染路）+ A→B→A 重访后入库弹窗仍活 ---- */
  await frameOf('MaterialRack').evaluate(() => document.querySelector('#srPinRow [data-ctn="900101"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await frameOf('MaterialRack').waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '食材柜', null, { timeout: 5000 });
  const swTitle = await ftxt('MaterialRack', '#srTitle');
  check('root:switch-local', swTitle === '食材柜', 'rack 切柜本地渲染 title=' + swTitle + '（无页签族 bail 路）');
  await showScene('BackpackUI');
  await frameOf('BackpackUI').waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 9000 });
  check('root:bagonly-visible', !(await fhidden('BackpackUI', '#srStoreAll')), 'BackpackUI bagonly 入库可见');
  await showScene('MaterialRack'); /* A→B→A 重访（rebindFrame 路） */
  await frameOf('MaterialRack').waitForFunction(() => !!document.getElementById('sbGrid'), null, { timeout: 9000 });
  /* 恢复非空背包（上一步空背包注入仍在基座）：重绑后的确认前置才有弹窗可开 */
  await page.evaluate(() => {
    const j = JSON.parse(JSON.stringify(window.__HZ_MOCKSET__()));
    j.items.bag = [[930, 4, 6, 3600, 0, 0, 1, 1, 0]];
    window.__HZ_MOCKSET__(j);
    window.__HZ_PUSH__('MaterialRack');
  });
  await frameOf('MaterialRack').waitForFunction(() => document.querySelectorAll('#sbGrid .sr-slot[data-it]').length === 1, null, { timeout: 5000 });
  await frameOf('MaterialRack').locator('#sbStoreAll').click();
  await page.waitForTimeout(120);
  const rebindPopup = !(await fhidden('MaterialRack', '#sbConfirm'));
  await fesc('MaterialRack');
  check('root:rebind-storeall-alive', rebindPopup, '重访重绑后 sbStoreAll→sbConfirm 仍活（T11×T9）');

  check('root:console-clean', consoleErrors.length === 0 && pageErrors.length === 0,
    'console errors=' + consoleErrors.length + ' pageErrors=' + pageErrors.length + (consoleErrors[0] ? ' | ' + consoleErrors[0] : '') + (pageErrors[0] ? ' | ' + pageErrors[0] : ''));

  await browser.close();
  const fails = results.filter((r) => !r.ok).length;
  console.log('---- root harness: ' + (results.length - fails) + '/' + results.length + ' PASS ----');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('DRIVER ERROR', e); process.exit(2); });
