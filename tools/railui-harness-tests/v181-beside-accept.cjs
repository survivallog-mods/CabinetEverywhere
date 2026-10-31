/* v1.8.1 旁挂架构验收（Playwright，serve.cjs 须已在 8180）。
   缺陷修复口径（作者 2026-10-31 裁决：只改界面布局样式，动作交互一律原生语义）：
   B1 beside 装配：官方面板/物品格/页签原样（不替换、无桩），#srp 旁挂 body，壳不透明
        --sr-slot=官方尺寸，柜列纯本地切柜（零 forge）且官方背包区不被带动；
   B2 崩溃防御：畸形契约行（null 行）不炸渲染通道，页签照常（reading 'n' 类病灶回归门）；
   B3 列表口径：同质（保质+flags 全同）才并一行，随机属性逐叠；右键=行首实叠取 1、
        Shift=整堆（ids=[首叠]，不再总量语义/跨柜群发）；
   B4 duo/bagonly 定版回归：MaterialRack 双面板+官方五按钮原样；BackpackUI 纯背包页
        cell=56；B5 全程零控制台错误。 */
const { chromium } = require('playwright');

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

  /* ================= B1 beside（Cooking 首场景） ================= */
  await waitRail('Cooking');
  const b1 = await fev('Cooking', () => {
    const rail = document.getElementById('srRail');
    const grid = document.getElementById('backpackGrid');
    const tabs = document.getElementById('bagTabs');
    const srp = document.getElementById('srp');
    const items = grid ? grid.querySelectorAll('.item').length : -1;
    const stubs = document.querySelectorAll('[data-cer-stub]').length;
    const cs = getComputedStyle(rail);
    return {
      officialGridAlive: !!grid && grid.isConnected && items > 0,
      officialItems: items,
      officialTabsAlive: !!tabs && tabs.isConnected,
      srpInBody: !!srp && srp.parentNode === document.body,
      besideClass: rail.className.indexOf('beside') >= 0,
      noStubs: stubs === 0,
      bg: cs.backgroundColor,
      slotVar: rail.style.getPropertyValue('--sr-slot'),
      title: (document.getElementById('srTitle') || {}).textContent || ''
    };
  });
  check('B1:official-grid-alive', b1.officialGridAlive, '官方 #backpackGrid 在位 items=' + b1.officialItems);
  check('B1:official-tabs-alive', b1.officialTabsAlive, '官方 #bagTabs 在位（页签原生）');
  check('B1:srp-beside-body', b1.srpInBody && b1.besideClass, '#srp 旁挂 body + .beside');
  check('B1:no-stubs', b1.noStubs, '旁挂零桩');
  check('B1:bg-opaque', /rgba?\([^)]*,\s*1\)|#[0-9a-f]{6}/i.test(b1.bg) && b1.bg.indexOf('0, 0') < 0, '壳底不透明 bg=' + b1.bg);
  check('B1:slot-40', b1.slotVar === '40px', '--sr-slot=' + b1.slotVar + '（官方 Cooking 40px）');
  check('B1:entry-first-ctn', b1.title === '食材柜', '入口默认=首个容器（柜列无背包页）title=' + b1.title);
  const gridCols = await fev('Cooking', () => (document.querySelector('.sr-grid') || {}).style ? document.querySelector('.sr-grid').style.gridTemplateColumns : '');
  check('B1:cols-adapt', /repeat\(8,\s*40px\)/.test(gridCols), '列数自适应 grid=' + gridCols);

  // 柜列本地切柜：零 forge、官方背包区不动
  const forges0 = await page.evaluate(() => window.__HZ_FORGES__().length);
  await fev('Cooking', () => {
    const pin = document.querySelector('#srPinRow [data-ctn="900102"]');
    if (pin) pin.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  const b1s = await fev('Cooking', () => ({
    title: (document.getElementById('srTitle') || {}).textContent || '',
    officialItems: document.querySelectorAll('#backpackGrid .item').length
  }));
  const forges1 = await page.evaluate(() => window.__HZ_FORGES__().length);
  check('B1:local-switch', b1s.title === '冷藏柜', '柜列本地切柜 title=' + b1s.title);
  check('B1:zero-forge', forges1 === forges0, '切柜零 forge（' + forges0 + '→' + forges1 + '）');
  check('B1:official-untouched', b1s.officialItems === b1.officialItems, '官方背包区未被带动 items=' + b1s.officialItems);

  // 旁挂右键取出仍走命令通道（柜格右键=取 1）
  await fev('Cooking', () => {
    const cell = document.querySelector('#srGrid [data-it]');
    if (cell) cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(80);
  const d0 = JSON.parse(await drain());
  check('B1:ctxmenu-take', d0.length === 1 && d0[0].op === 'take' && d0[0].from === 900101 && d0[0].all === false,
    '柜格右键 take from=900101 → ' + JSON.stringify(d0[0] || {}));

  /* ================= B2 崩溃防御（畸形契约行） ================= */
  const b2 = await page.evaluate(() => {
    const j = {
      rev: 99,
      ctx: { page: 'Cooking', family: 'bag', bagOnly: false, rackOwner: 0, bagCap: 42 },
      bag: 900001,
      ctn: [null, [900101, '食材柜', 'c', 40, 101], [900102, '冷藏柜', 'f', 24, 102]],
      lib: [null, [101, '食材', 4, 1, '', '#8fc06e'], [102, '需冷藏', 3, 2, '', '#6fc7c9']],
      icfg: [null, [1, '生态香米', 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 12, 99, 1, 1, '食材', 0, 15, 0, 0, 0, 0], [2, '烤肉', 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 38, 20, 1, 2, '食材', 0, 48, 2, 6, 0, 6]],
      items: { bag: [[901, 1, 30, 7200, 0, 0, 1, 1, 0], null], '900101': [[911, 1, 60, 86400, 0, 0, 1, 1, 0], [912, 2, 8, 21600, 1, 0, 1, 1, 0]], '900102': [] }
    };
    let threw = null;
    try { window.__CERAIL__.setData(j); } catch (e) { threw = String(e && e.message || e); }
    const rail = document.getElementById('srRail');
    return {
      threw,
      title: (document.getElementById('srTitle') || {}).textContent || '',
      pins: document.querySelectorAll('#srPinRow [data-ctn]').length,
      gridCells: document.querySelectorAll('#srGrid .sr-slot').length
    };
  });
  check('B2:no-throw', b2.threw === null, '畸形行 setData 不抛 ' + (b2.threw || ''));
  check('B2:tabs-render', b2.pins >= 2 && b2.title === '食材柜', '页签照常 pins=' + b2.pins + ' title=' + b2.title);
  check('B2:grid-render', b2.gridCells > 0, '网格照常 cells=' + b2.gridCells);
  await page.evaluate(() => window.__HZ_PUSH__('Cooking')); // 恢复干净 MOCK 态
  await page.waitForTimeout(150);

  /* ================= B3 列表口径（材料架 900103） ================= */
  await page.evaluate(() => {
    const M = window.__HZ_MOCKSET__();
    M.items['900103'] = [
      [917, 5, 200, 0, 0, 0, 1, 1, 0],   /* 铁钉 200 保质0 flags0 */
      [960, 5, 50, 0, 1, 0, 1, 1, 0],    /* 铁钉 50  同质 → 与上并一行 ×250 */
      [961, 2, 8, 21600, 2, 0, 1, 1, 0], /* 烤肉 8  保质21600 */
      [962, 2, 1, 3600, 3, 0, 1, 1, 0],  /* 烤肉 1  保质3600 → 随机属性不并，逐叠 */
      [963, 9, 10, 0, 4, 0, 1, 1, 0],    /* 钨锭 10 flags0 */
      [964, 9, 4, 0, 5, 0, 1, 1, 1]      /* 钨锭 4  flags1 → 逐叠 */
    ];
    window.__HZ_MOCKSET__(M);
    window.__HZ_PUSH__('Cooking');
  });
  await page.waitForTimeout(150);
  await fev('Cooking', () => {
    const pin = document.querySelector('#srPinRow [data-ctn="900103"]');
    if (pin) pin.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(150);
  await fev('Cooking', () => {
    const b = document.querySelector('#srSeg [data-mode="list"]');
    if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(120);
  const rows = await fev('Cooking', () => Array.from(document.querySelectorAll('#srList .sr-row')).map(function (r) {
    return (r.querySelector('.nm') || {}).textContent + '|' + ((r.querySelector('.cnt') || {}).textContent || '');
  }));
  check('B3:merge-uniform', rows.filter(function (r) { return r.indexOf('铁钉') === 0; }).length === 1 && rows.join().indexOf('铁钉|×250') >= 0, '同质并一行 ' + JSON.stringify(rows.filter(function (r) { return r.indexOf('铁钉') === 0; })));
  check('B3:split-shelf', rows.filter(function (r) { return r.indexOf('烤肉') === 0; }).length === 2, '保质不同逐叠 rows=' + JSON.stringify(rows.filter(function (r) { return r.indexOf('烤肉') === 0; })));
  check('B3:split-flags', rows.filter(function (r) { return r.indexOf('钨锭') === 0; }).length === 2, 'flags 不同逐叠');
  // 右键烤肉首叠行（排序后首行=保质 21600 的 961）
  await fev('Cooking', () => {
    const rs = Array.from(document.querySelectorAll('#srList .sr-row'));
    const tgt = rs.find(function (r) { return (r.querySelector('.nm') || {}).textContent === '烤肉'; });
    if (tgt) tgt.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(80);
  const d1 = JSON.parse(await drain());
  check('B3:row-rclick-native', d1.length === 1 && d1[0].op === 'take' && JSON.stringify(d1[0].ids) === '[961]' && d1[0].all === false && d1[0].from === 900103,
    '行右键=行首实叠取1 ' + JSON.stringify(d1[0] || {}));
  // Shift+右键=整堆
  await fev('Cooking', () => {
    const rs = Array.from(document.querySelectorAll('#srList .sr-row'));
    const tgt = rs.find(function (r) { return (r.querySelector('.nm') || {}).textContent === '钨锭'; });
    if (tgt) tgt.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, shiftKey: true }));
  });
  await page.waitForTimeout(80);
  const d2 = JSON.parse(await drain());
  check('B3:row-shift-stack', d2.length === 1 && d2[0].op === 'take' && JSON.stringify(d2[0].ids) === '[964]' && d2[0].all === true,
    'Shift=整堆（单叠 all:true）' + JSON.stringify(d2[0] || {}));
  // 切回网格恢复
  await fev('Cooking', () => {
    const b = document.querySelector('#srSeg [data-mode="grid"]');
    if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  const b3g = await fev('Cooking', () => ({ g: !document.getElementById('srGrid').hidden, l: document.getElementById('srList').hidden }));
  check('B3:grid-restore', b3g.g && b3g.l, '切回网格恢复');

  /* ================= B4 duo / bagonly 定版回归 ================= */
  await showScene('MaterialRack');
  const b4r = await fev('MaterialRack', () => ({
    duo: !!document.querySelector('.sr-duo'),
    fiveBtns: ['srTakeAll', 'srPutAll', 'srTagPutIn'].map(function (id) { return !!document.getElementById(id); }),
    slotVar: (document.querySelector('.sr-rail:not(.bagpanel)') || {}).style ? '' : '',
    bagPanel: !!document.getElementById('srBagP')
  }));
  check('B4:duo-intact', b4r.duo && b4r.bagPanel && b4r.fiveBtns.every(Boolean), '整理柜双面板+五按钮原样');
  await showScene('BackpackUI');
  const b4b = await fev('BackpackUI', () => ({
    rail: !!document.getElementById('srRail'),
    bagonly: (document.getElementById('srRail') || { className: '' }).className.indexOf('bagonly') >= 0,
    slotVar: document.getElementById('srRail').style.getPropertyValue('--sr-slot'),
    ctnbarHidden: !!(document.querySelector('.sr-ctnbar') && getComputedStyle(document.querySelector('.sr-ctnbar')).display === 'none'),
    bg: getComputedStyle(document.getElementById('srRail')).backgroundColor
  }));
  check('B4:bagonly-56', b4b.rail && b4b.bagonly && b4b.slotVar === '56px', 'bagonly 纯背包页 cell=56 ' + b4b.slotVar);
  check('B4:bagonly-opaque', /rgba?\([^)]*,\s*1\)/.test(b4b.bg), 'bagonly 壳底不透明 bg=' + b4b.bg);

  /* ================= B5 汇总 ================= */
  check('B5:zero-console-errors', consoleErrors.length === 0, JSON.stringify(consoleErrors).slice(0, 300));
  check('B5:zero-page-errors', pageErrors.length === 0, JSON.stringify(pageErrors).slice(0, 300));

  const pass = results.filter(function (r) { return r.ok; }).length;
  console.log('----');
  console.log('TOTAL ' + pass + ' PASS ' + (results.length - pass) + ' FAIL ' + results.length);
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('DRIVER ERROR', e); process.exit(2); });
