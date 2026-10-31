/* T11 旧 harness（railui-harness.html）断言（Playwright，serve.cjs 须已在 8180）。
   覆盖 task-11 验证清单：
   ① 主侧栏入口（Cooking bag 页）：显隐规则（bag 页显/柜页隐/BackpackUI 显/rack 主侧栏隐）、
      确认弹窗文案数字与 mock 对账（件/叠）、豁免清单（点开不秒关）、Esc/取消、
      确认→drain JSON 带 order、mock 执行→差量 toast 数字对账；
   ② 柜满顺延（__HZ_MOCK__ 注入满食材柜+食材柜B）与全留背包（纯医疗背包）两分支文案；
   ③ 空背包 toast 不弹窗（零命令）；容器空 vs 筛空两态回归（空格网格 vs 没有匹配的物品）；
   ④ 页签顺序 order：srp_pin_order_Cooking 存档 → order=存档序+契约序补尾；
   ⑤ rack 左面板入口（MaterialRack duo）：sbStoreAll 全流程同款 + sbToast 空背包。 */
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' : '') + (detail || ''));
}

/* 契约 v4 基座（照 harness MOCK 原样；bag/ctn 由场景构造） */
const ICO = 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
const LIB = [[101, '食材', 4, 1, '', '#8fc06e'], [102, '需冷藏', 3, 2, '', '#6fc7c9'], [103, '材料', 0, 3, '', '#7aa2d6'], [104, '蔬果', 1, 4, '', '#8fc06e'], [105, '贵重品', 0, 5, '', '#c9b458'], [106, '种植', 5, 6, '', '#6fc7c9']];
const ICFG = [
  [1, '生态香米', ICO, 12, 99, 1, 1, '食材', 0, 15, 0, 0, 0, 0],
  [2, '烤肉', ICO, 38, 20, 1, 2, '食材', 0, 48, 2, 6, 0, 6],
  [3, '咖啡', ICO, 25, 50, 1, 9, '食材', 0, 2, 5, 15, 0, 0],
  [4, '急救绷带', ICO, 20, 99, 2, 0, '医疗', 0, 0, 0, 0, 0, 20],
  [5, '铁钉', ICO, 4, 999, 9, 0, '材料', 0, 0, 0, 0, 0, 0],
  [6, '木板', ICO, 5, 999, 9, 0, '材料', 0, 0, 0, 0, 0, 0],
  [7, '净水', ICO, 10, 30, 1, 9, '食材', 0, 5, 0, 2, 0, 0],
  [8, '草药', ICO, 15, 99, 2, 0, '医疗', 0, 0, 0, 0, 0, 12],
  [9, '钨锭', ICO, 88, 99, 9, 0, '材料', 0, 0, 0, 0, 0, 0]
];
const BAG10 = [
  [901, 1, 30, 7200, 0, 0, 1, 1, 0], [902, 3, 5, 10800, 1, 0, 1, 1, 0],
  [903, 5, 40, 0, 2, 0, 1, 1, 0], [904, 5, 12, 0, 3, 0, 1, 1, 0],
  [905, 9, 3, 0, 4, 0, 1, 1, 0], [906, 2, 2, 9000, 5, 0, 1, 1, 4],
  [907, 8, 6, 3600, 6, 0, 1, 1, 2], [908, 4, 1, 0, 7, 0, 2, 2, 1],
  [909, 6, 25, 0, 0, 1, 1, 1, 0], [910, 7, 4, 43200, 1, 1, 1, 1, 0]
];
const CTN5 = [
  [900101, '食材柜', 'c', 40, 101, 104],
  [900102, '冷藏柜', 'f', 24, 102],
  [900103, '材料架', 'r', 60, 103, 106],
  [900104, '杂物柜', 'c', 18],
  [900105, '小木箱', 'c', 6]
];
const CTN_ITEMS = {
  '900101': [[911, 1, 60, 86400, 0, 0, 1, 1, 0], [912, 2, 8, 21600, 1, 0, 1, 1, 0], [913, 7, 10, 259200, 2, 0, 1, 1, 0], [914, 2, 1, 3600, 3, 0, 1, 1, 4]],
  '900102': [[915, 2, 6, 7200, 0, 0, 1, 1, 0], [916, 3, 2, 0, 1, 0, 1, 1, 0]],
  '900103': [[917, 5, 200, 0, 0, 0, 1, 1, 0], [918, 6, 120, 0, 1, 0, 1, 1, 0], [919, 9, 10, 0, 2, 0, 1, 1, 0]],
  '900104': [], '900105': []
};
function mock(page, family, bag, ctn, ctnItems) {
  return page.evaluate(([f, bag, ctn, ctnItems]) => {
    const j = {
      rev: 7, bag: 900001,
      ctx: f === 'rack' ? { page: 'MaterialRack', family: 'rack', bagOnly: false, rackOwner: 900103, bagCap: 42 }
        : f === 'bag' ? { page: 'BackpackUI', family: 'backpack', bagOnly: true, rackOwner: 0, bagCap: 42 }
          : { page: 'Cooking', family: 'bag', bagOnly: false, rackOwner: 0, bagCap: 42 },
      ctn: ctn, lib: null, icfg: null,
      items: Object.assign({ bag: bag }, ctnItems)
    };
    /* lib/icfg 取页面基座原值（避免驱动侧再抄一份） */
    const cur = window.__HZ_MOCK__();
    j.lib = cur.lib; j.icfg = cur.icfg;
    window.__HZ_MOCK__(j);
    return window.__HZ_REPUSH__();
  }, [family, bag, ctn, ctnItems]);
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/wangk/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe' });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(BASE + '/railui-harness.html', { waitUntil: 'load' });
  await page.waitForSelector('#srRail', { timeout: 8000 });
  await page.waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '背包', null, { timeout: 8000 });

  const txt = (sel) => page.evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel);
  const html = (sel) => page.evaluate((s) => (document.querySelector(s) || {}).innerHTML || '', sel);
  const hidden = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !e || e.hidden; }, sel);
  const clickBtn = (sel) => page.evaluate((s) => document.querySelector(s).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })), sel);
  const esc = () => page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  const drain = () => page.evaluate(() => window.__CERAIL__.drain());
  const setStoreAllOrder = (ids) => page.evaluate((v) => localStorage.setItem('srp_pin_order_Cooking', v), ids);

  /* ---- ① 主侧栏入口：显隐规则 + 确认弹窗 + 豁免 ---- */
  check('old:sr-visible-on-bag', !(await hidden('#srStoreAll')), 'bag 页 srStoreAll 可见');
  await page.fill('#srSearch', '不存在的物品名'); await page.waitForTimeout(60);
  const filteredEmptyMsg = await txt('#srGrid .sr-empty');
  await page.fill('#srSearch', ''); await page.waitForTimeout(60);
  check('old:twostate-filter-empty', filteredEmptyMsg === '没有匹配的物品', '筛空=没有匹配的物品（bag 有货但筛完为 0）');

  await clickBtn('#srStoreAll');
  await page.waitForTimeout(150); /* v9 踩坑窗口：同次点击冒泡若未豁免会秒关 */
  const confirmOpen1 = await hidden('#srStoreConfirm');
  const confirmText1 = await html('#srStoreText');
  check('old:no-insta-close', confirmOpen1 === false, '点开 150ms 后弹窗仍在（豁免清单含 srStoreAll）');
  check('old:confirm-text', /背包现有 <b>128<\/b> 件（10 叠）/.test(confirmText1) && confirmText1.indexOf('柜满顺延下一个同标签柜') >= 0,
    '文案=背包现有 128 件（10 叠）+ 柜满顺延…');
  await esc();
  check('old:esc-close', await hidden('#srStoreConfirm'), 'Esc 关闭');
  await clickBtn('#srStoreAll');
  const reopenOk = !(await hidden('#srStoreConfirm'));
  await clickBtn('#srStoreCancel');
  check('old:reopen-cancel', reopenOk && await hidden('#srStoreConfirm'), '重开+取消关闭');
  /* 柜页隐藏规则 */
  await clickBtn('#srPinRow [data-ctn="900101"]');
  await page.waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '食材柜', null, { timeout: 4000 });
  check('old:sr-hidden-on-cabinet', await hidden('#srStoreAll'), '食材柜页 srStoreAll 隐藏');
  await clickBtn('#srPinRow [data-ctn="900001"]');
  await page.waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '背包', null, { timeout: 4000 });

  /* ---- 确认→命令 JSON（order=契约序）+ 差量 toast 对账 ---- */
  await clickBtn('#srStoreAll');
  await clickBtn('#srStoreGo');
  await page.waitForTimeout(80);
  const d1 = JSON.parse(await drain());
  check('old:cmd-json', d1.length === 1 && d1[0].op === 'storeAll' && JSON.stringify(d1[0].order) === '[900101,900102,900103,900104,900105]',
    'drain=' + JSON.stringify(d1[0]));
  const toast1 = await txt('#srToast');
  check('old:delta-toast', toast1 === '已入库 121 件 → 食材柜×41 · 材料架×80；7 件无匹配柜或柜已满，留在背包',
    'toast=' + toast1);
  const bagAfter = await page.evaluate(() => ({ stacks: document.querySelectorAll('#srGrid .sr-slot[data-it]').length, emptyMsg: !!document.querySelector('#srGrid .sr-empty') }));
  check('old:bag-2-stacks-left', bagAfter.stacks === 2 && !bagAfter.emptyMsg, '背包剩 2 叠（草药/绷带），无「没有匹配的物品」');

  /* ---- ② 柜满顺延：注入满食材柜（40 叠 raw，cfg 只用 4/5/6/8/9——与背包食材 cfg 异名，
     防 moveStack 同 cfgId 合并优先路吃掉叠数）+ 食材柜B（食材标签 cap10），bag=4 食材叠 ---- */
  const foodBag = [[901, 1, 30, 7200, 0, 0, 1, 1, 0], [902, 3, 5, 10800, 1, 0, 1, 1, 0], [906, 2, 2, 9000, 5, 0, 1, 1, 4], [910, 7, 4, 43200, 1, 1, 1, 1, 0]];
  const fullA = [];
  const FILL_CFG = [4, 5, 6, 8, 9];
  for (let i = 0; i < 40; i++) fullA.push([8000 + i, FILL_CFG[i % 5], 1, 0, i % 10, Math.floor(i / 10), 1, 1, 0]);
  await mock(page, 'cook', foodBag,
    CTN5.concat([[900106, '食材柜B', 'c', 10, 101]]),
    Object.assign({}, CTN_ITEMS, { '900101': fullA, '900106': [] }));
  await page.waitForFunction(() => document.querySelectorAll('#srGrid .sr-slot[data-it]').length === 4, null, { timeout: 4000 });
  await clickBtn('#srStoreAll');
  await clickBtn('#srStoreGo');
  await page.waitForTimeout(80);
  const d2 = JSON.parse(await drain());
  check('old:defer-order-json', d2.length === 1 && d2[0].op === 'storeAll' && d2[0].order[d2[0].order.length - 1] === 900106 && d2[0].order[0] === 900101,
    '队列=' + d2.length + ' order 含食材柜B 于尾=' + JSON.stringify(d2[0]));
  const toast2 = await txt('#srToast');
  check('old:defer-toast', toast2 === '已入库 41 件 → 食材柜B×41', '顺延 toast=' + toast2);
  const deferState = await page.evaluate(() => {
    const m = window.__HZ_MOCK__();
    return { bRows: m.items['900106'].length, aRows: m.items['900101'].length, bagRows: m.items.bag.length };
  });
  check('old:defer-placement', deferState.bRows === 4 && deferState.aRows === 40 && deferState.bagRows === 0,
    '食材柜B 收 4 叠/食材柜A 满 40 不动/背包清空 ' + JSON.stringify(deferState));

  /* ---- ③ 全留背包（纯医疗） + 空背包 toast + 容器空两态 ---- */
  const medBag = [[930, 4, 6, 3600, 0, 0, 1, 1, 0], [931, 8, 1, 3600, 1, 0, 1, 1, 2]];
  await mock(page, 'cook', medBag, CTN5, CTN_ITEMS);
  await page.waitForFunction(() => document.querySelectorAll('#srGrid .sr-slot[data-it]').length === 2, null, { timeout: 4000 });
  await clickBtn('#srStoreAll');
  await clickBtn('#srStoreGo');
  await page.waitForTimeout(80);
  const d3 = JSON.parse(await drain());
  const toast3 = await txt('#srToast');
  check('old:all-stay-toast', d3.length === 1 && toast3 === '7 件无匹配柜或柜已满，留在背包', '队列=' + d3.length + ' 全留 toast=' + toast3);
  const medLeft = await page.evaluate(() => window.__HZ_MOCK__().items.bag.length);
  check('old:all-stay-bag-intact', medLeft === 2, '医疗 2 叠原样在背包');
  await page.fill('#srSearch', '铁钉'); await page.waitForTimeout(60);
  const filterMsg2 = await txt('#srGrid .sr-empty');
  await page.fill('#srSearch', ''); await page.waitForTimeout(60);
  check('old:twostate-pair', filterMsg2 === '没有匹配的物品', '有货筛空=没有匹配（与容器空两态成对）');

  await mock(page, 'cook', [], CTN5, CTN_ITEMS);
  await page.waitForFunction(() => { const g = document.getElementById('srGrid'); return g && g.querySelectorAll('.sr-slot').length === 50 && g.querySelectorAll('.sr-slot[data-it]').length === 0; }, null, { timeout: 4000 });
  const emptyState = await page.evaluate(() => ({ emptyCells: document.querySelectorAll('#srGrid .sr-slot.empty').length, emptyMsg: !!document.querySelector('#srGrid .sr-empty') }));
  check('old:empty-grid-state', emptyState.emptyCells === 50 && !emptyState.emptyMsg, '容器空=50 空格网格（非没有匹配）');
  await drain(); /* 基线清队列：此后到断言点之间不得再产生命令 */
  await clickBtn('#srStoreAll');
  await page.waitForTimeout(100);
  const emptyToast = await txt('#srToast');
  const emptyDrain = await drain();
  check('old:empty-bag-toast', emptyToast === '背包是空的' && await hidden('#srStoreConfirm'), '空背包 toast 不弹窗');
  check('old:empty-bag-nocmd', emptyDrain === '[]', '空背包零命令 drain=' + emptyDrain);

  /* ---- ④ 页签顺序 order：常用柜优先路由（食材柜B 存档序首位 → 食材先进 B）+ 存档序+契约序补尾 ---- */
  await setStoreAllOrder('[900106,900101,900102,900104]');
  await page.click('#hzBtnCook'); /* 重挂 → loadScenePrefs 读存档 */
  await page.waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '背包', null, { timeout: 4000 });
  await mock(page, 'cook', foodBag, CTN5.concat([[900106, '食材柜B', 'c', 10, 101]]),
    Object.assign({}, CTN_ITEMS, { '900106': [] }));
  await page.waitForFunction(() => document.querySelectorAll('#srGrid .sr-slot[data-it]').length === 4, null, { timeout: 4000 });
  await clickBtn('#srStoreAll');
  await clickBtn('#srStoreGo');
  await page.waitForTimeout(80);
  const d4 = JSON.parse(await drain());
  check('old:pin-order-first', d4.length === 1 && d4[0].op === 'storeAll' && JSON.stringify(d4[0].order) === '[900106,900101,900102,900104,900103,900105]',
    '队列=' + d4.length + ' order=存档序+补尾（未入存档的材料架落尾段） ' + JSON.stringify(d4[0]));
  const toast4 = await txt('#srToast');
  const bRows4 = await page.evaluate(() => window.__HZ_MOCK__().items['900106'].length);
  check('old:pin-order-routing', toast4 === '已入库 41 件 → 食材柜B×41' && bRows4 === 4,
    '常用柜优先路由：B 先收 4 叠 toast=' + toast4);

  /* ---- ⑤ rack 左面板入口（duo）：显隐 + 确认 + 差量 toast + sbToast 空背包 ---- */
  await page.evaluate(() => localStorage.removeItem('srp_pin_order_MaterialRack'));
  await page.click('#hzBtnRack');
  await page.waitForSelector('#srBagP', { timeout: 4000 });
  await page.waitForFunction(() => !!document.getElementById('sbGrid'), null, { timeout: 4000 });
  await mock(page, 'rack', BAG10, CTN5, CTN_ITEMS);
  await page.waitForFunction(() => document.querySelectorAll('#sbGrid .sr-slot[data-it]').length === 10, null, { timeout: 4000 });
  const rackVis = await page.evaluate(() => ({ sr: document.getElementById('srStoreAll').hidden, sb: document.getElementById('sbStoreAll').hidden }));
  check('old:rack-visibility', rackVis.sr === true && rackVis.sb === false, 'rack：主侧栏入库隐藏/左面板入库可见 ' + JSON.stringify(rackVis));
  await clickBtn('#sbStoreAll');
  await page.waitForTimeout(150);
  const sbText = await html('#sbText');
  check('old:sb-no-insta-close', !(await hidden('#sbConfirm')), 'sbStoreAll 豁免：弹窗不秒关');
  check('old:sb-confirm-text', /背包现有 <b>128<\/b> 件（10 叠）/.test(sbText), '左面板文案同款 128 件（10 叠）');
  await esc();
  check('old:sb-esc', await hidden('#sbConfirm'), 'Esc 关 sbConfirm');
  await clickBtn('#sbStoreAll');
  await clickBtn('#sbGo');
  await page.waitForTimeout(80);
  const d5 = JSON.parse(await drain());
  check('old:sb-cmd-json', d5.length === 1 && d5[0].op === 'storeAll' && JSON.stringify(d5[0].order) === '[900101,900102,900103,900104,900105]',
    '队列=' + d5.length + ' rack 场景 order=契约序 ' + JSON.stringify(d5[0].order));
  const toast5 = await txt('#srToast');
  check('old:sb-delta-toast', toast5 === '已入库 121 件 → 食材柜×41 · 材料架×80；7 件无匹配柜或柜已满，留在背包', '左面板入口同款汇总 toast=' + toast5);
  const sbAfter = await page.evaluate(() => document.querySelectorAll('#sbGrid .sr-slot[data-it]').length);
  check('old:sb-grid-2-left', sbAfter === 2, 'sbGrid 剩 2 叠');
  await mock(page, 'rack', [], CTN5, CTN_ITEMS);
  await page.waitForFunction(() => document.querySelectorAll('#sbGrid .sr-slot[data-it]').length === 0, null, { timeout: 4000 });
  const sbEmptyCells = await page.evaluate(() => document.querySelectorAll('#sbGrid .sr-slot.empty').length);
  check('old:sb-empty-grid', sbEmptyCells === 50, 'sbGrid 容器空=50 空格');
  await clickBtn('#sbStoreAll');
  await page.waitForTimeout(100);
  const sbEmptyToast = await txt('#sbToast');
  check('old:sb-empty-toast', sbEmptyToast === '背包是空的' && await hidden('#sbConfirm'), 'sb 空背包 sbToast 不弹窗');

  /* BackpackUI bagonly：入库按钮可见 */
  await page.click('#hzBtnBag');
  await page.waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '背包' && !!document.getElementById('srRail'), null, { timeout: 4000 });
  check('old:bagonly-visible', !(await hidden('#srStoreAll')), 'BackpackUI bagonly 主侧栏入库可见');

  check('old:console-clean', consoleErrors.length === 0 && pageErrors.length === 0,
    'console errors=' + consoleErrors.length + ' pageErrors=' + pageErrors.length + (consoleErrors[0] ? ' | ' + consoleErrors[0] : '') + (pageErrors[0] ? ' | ' + pageErrors[0] : ''));

  await browser.close();
  const fails = results.filter((r) => !r.ok).length;
  console.log('---- old harness: ' + (results.length - fails) + '/' + results.length + ' PASS ----');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('DRIVER ERROR', e); process.exit(2); });
