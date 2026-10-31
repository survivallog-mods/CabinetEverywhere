/* T12 旧 harness（railui-harness.html）断言（Playwright，serve.cjs 须已在 8180）。
   覆盖 task-12 验证清单：
   ① 机器场景主侧栏整理全流程（Cooking bag 页）：快照（叠数 N）→命令 JSON {op:'tidy',owner}
      →mock 合并回推→差量 toast「已整理：N 叠合并为 M 叠」数字对账（叠数/件数守恒）；
   ② 柜页整理（任意容器可用）：食材柜 4 叠→3 叠（烤肉两叠并一）；
   ③ StackLimit 拆留：香米 3 叠 125 件→99+26 两叠（icfg.stack 上限）；
   ④ lastTidyFail 失败路：toast「本界面暂不支持整理」降级文案、不差量不误报成功、
      基座未合并、标志一次性消费（消费后 ctx.lastTidyFail=false、后续 tidy 正常差量）；
   ⑤ 空背包/空柜零命令（背包是空的/这里没有物品，drain==='[]'）；
   ⑥ 全库视图 srTidy 隐藏回归（render 现状规则）；
   ⑦ rack 左面板 sbTidy=背包整理（owner=bag、toast 走主侧栏）+ sbTidy 空背包；
   ⑧ T11 随行顺手项回归：下拉开着点 sbStoreAll → 确认弹窗开且分类下拉被收。 */
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8180';
const EXEC = 'C:/Users/wangk/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' : '') + (detail || ''));
}

/* 契约 v4 基座（照 harness MOCK 原样；bag/ctn 由场景构造） */
const ICO = 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
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
const BAG10 = [
  [901, 1, 30, 7200, 0, 0, 1, 1, 0], [902, 3, 5, 10800, 1, 0, 1, 1, 0],
  [903, 5, 40, 0, 2, 0, 1, 1, 0], [904, 5, 12, 0, 3, 0, 1, 1, 0],
  [905, 9, 3, 0, 4, 0, 1, 1, 0], [906, 2, 2, 9000, 5, 0, 1, 1, 4],
  [907, 8, 6, 3600, 6, 0, 1, 1, 2], [908, 4, 1, 0, 7, 0, 2, 2, 1],
  [909, 6, 25, 0, 0, 1, 1, 1, 0], [910, 7, 4, 43200, 1, 1, 1, 1, 0]
];
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
    const cur = window.__HZ_MOCK__();
    j.lib = cur.lib; j.icfg = cur.icfg;
    window.__HZ_MOCK__(j);
    return window.__HZ_REPUSH__();
  }, [family, bag, ctn, ctnItems]);
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXEC });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(BASE + '/railui-harness.html', { waitUntil: 'load' });
  await page.waitForSelector('#srRail', { timeout: 8000 });
  await page.waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '背包', null, { timeout: 8000 });

  const txt = (sel) => page.evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel);
  const hidden = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !e || e.hidden; }, sel);
  const clickBtn = (sel) => page.evaluate((s) => document.querySelector(s).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })), sel);
  const drain = () => page.evaluate(() => window.__CERAIL__.drain());
  const mockState = () => page.evaluate(() => window.__HZ_MOCK__());

  /* ---- ① 机器场景主侧栏整理全流程（背包对象）：快照→命令→mock 合并→差量 toast 对账 ---- */
  await mock(page, 'cook', BAG10, CTN5, CTN_ITEMS);
  await page.waitForFunction(() => document.querySelectorAll('#srGrid .sr-slot[data-it]').length === 10, null, { timeout: 4000 });
  check('old:tidy-visible-on-bag', !(await hidden('#srTidy')), 'bag 页 srTidy 可见（任意容器可用）');
  await drain(); /* 基线清队列 */
  await clickBtn('#srTidy');
  await page.waitForTimeout(80);
  const d1 = JSON.parse(await drain());
  check('old:cmd-json-bag', d1.length === 1 && d1[0].op === 'tidy' && d1[0].owner === 900001,
    'drain=[{op:"tidy",owner:900001}] 实际=' + JSON.stringify(d1));
  const toast1 = await txt('#srToast');
  check('old:delta-toast-bag', toast1 === '已整理：10 叠合并为 9 叠', 'toast=' + toast1);
  const s1 = await mockState();
  const nail = s1.items.bag.filter((r) => r[1] === 5);
  check('old:bag-merged-9', s1.items.bag.length === 9 && nail.length === 1 && nail[0][2] === 52,
    '背包 9 叠 & 铁钉并 52 件（40+12 件数守恒） bag=' + s1.items.bag.length + ' nail=' + JSON.stringify(nail));
  const grid1 = await page.evaluate(() => document.querySelectorAll('#srGrid .sr-slot[data-it]').length);
  check('old:grid-after-tidy', grid1 === 9, '网格同步 9 叠=' + grid1);

  /* ---- ② 柜页整理（柜对象）---- */
  await clickBtn('#srPinRow [data-ctn="900101"]');
  await page.waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '食材柜', null, { timeout: 4000 });
  check('old:tidy-visible-on-cabinet', !(await hidden('#srTidy')), '食材柜页 srTidy 可见');
  await clickBtn('#srTidy');
  await page.waitForTimeout(80);
  const d2 = JSON.parse(await drain());
  check('old:cmd-json-ctn', d2.length === 1 && d2[0].op === 'tidy' && d2[0].owner === 900101,
    'drain=' + JSON.stringify(d2));
  const toast2 = await txt('#srToast');
  check('old:delta-toast-ctn', toast2 === '已整理：4 叠合并为 3 叠', 'toast=' + toast2 + '（烤肉 8+1 并 9）');
  const s2 = await mockState();
  const meat = s2.items['900101'].filter((r) => r[1] === 2);
  check('old:ctn-merged-3', s2.items['900101'].length === 3 && meat.length === 1 && meat[0][2] === 9,
    '食材柜 3 叠 & 烤肉并 9 件 ' + JSON.stringify(s2.items['900101'].map((r) => [r[1], r[2]])));

  /* ---- ③ StackLimit 拆留：香米 stack 99，3 叠 30+90+5=125 → 99+26 两叠 ---- */
  await clickBtn('#srPinRow [data-ctn="900001"]');
  await page.waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '背包', null, { timeout: 4000 });
  const riceBag = [[940, 1, 30, 7200, 0, 0, 1, 1, 0], [941, 1, 90, 7200, 1, 0, 1, 1, 0], [942, 1, 5, 7200, 2, 0, 1, 1, 0]];
  await mock(page, 'cook', riceBag, CTN5, CTN_ITEMS);
  await page.waitForFunction(() => document.querySelectorAll('#srGrid .sr-slot[data-it]').length === 3, null, { timeout: 4000 });
  await clickBtn('#srTidy');
  await page.waitForTimeout(80);
  await drain();
  const toast3 = await txt('#srToast');
  check('old:stacklimit-toast', toast3 === '已整理：3 叠合并为 2 叠', 'toast=' + toast3 + '（125 件超 99 上限拆留）');
  const s3 = await mockState();
  const rice = s3.items.bag.map((r) => r[2]).sort((a, b) => b - a);
  check('old:stacklimit-split', s3.items.bag.length === 2 && rice[0] === 99 && rice[1] === 26,
    '拆留=99+26 ' + JSON.stringify(rice));

  /* ---- ④ lastTidyFail 失败路：降级文案/不差量/基座不动/一次性消费 ---- */
  await mock(page, 'cook', BAG10, CTN5, CTN_ITEMS);
  await page.waitForFunction(() => document.querySelectorAll('#srGrid .sr-slot[data-it]').length === 10, null, { timeout: 4000 });
  await drain();
  await page.evaluate(() => { window.__HZ_TIDYFAIL__ = true; });
  await clickBtn('#srTidy');
  await page.waitForTimeout(80);
  const toast4 = await txt('#srToast');
  check('old:fail-toast', toast4 === '本界面暂不支持整理', '降级 toast=' + toast4);
  check('old:fail-not-success', toast4.indexOf('已整理') < 0, '不误报成功（无「已整理」字样）');
  const s4 = await mockState();
  check('old:fail-no-merge', s4.items.bag.length === 10 && !(s4.ctx && s4.ctx.lastTidyFail),
    '基座未合并（10 叠）& 标志一次性消费 ctx.lastTidyFail=' + JSON.stringify(s4.ctx && s4.ctx.lastTidyFail));
  await page.evaluate(() => { window.__HZ_TIDYFAIL__ = false; });
  await page.evaluate(() => window.__HZ_REPUSH__()); /* 残留标志包重推：settleXfer 已消费、无 tidy 在途 → 不再 toast */
  await page.waitForTimeout(100);
  const toast4b = await txt('#srToast');
  check('old:fail-no-repeat', toast4b === '本界面暂不支持整理', '重推不重复 toast（toast 元素仍为上一条文本、未再触发）=' + toast4b);
  /* 标志未闩死：下一次 tidy 正常差量 */
  await clickBtn('#srTidy');
  await page.waitForTimeout(80);
  await drain();
  const toast4c = await txt('#srToast');
  check('old:fail-not-latched', toast4c === '已整理：10 叠合并为 9 叠', '标志未闩死：后续 tidy 正常差量 toast=' + toast4c);

  /* ---- ⑤ 空背包/空柜零命令 ---- */
  await mock(page, 'cook', [], CTN5, CTN_ITEMS);
  await page.waitForFunction(() => document.querySelectorAll('#srGrid .sr-slot').length === 50, null, { timeout: 4000 });
  await drain();
  await clickBtn('#srTidy');
  await page.waitForTimeout(80);
  const toast5 = await txt('#srToast');
  check('old:empty-bag-toast', toast5 === '背包是空的', '空背包 toast=' + toast5);
  check('old:empty-bag-nocmd', (await drain()) === '[]', '空背包零命令');
  await mock(page, 'cook', BAG10, CTN5, CTN_ITEMS);
  await page.waitForFunction(() => document.querySelectorAll('#srGrid .sr-slot[data-it]').length === 10, null, { timeout: 4000 });
  await clickBtn('#srPinRow [data-ctn="900104"]');
  await page.waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '杂物柜', null, { timeout: 4000 });
  await drain();
  await clickBtn('#srTidy');
  await page.waitForTimeout(80);
  const toast5b = await txt('#srToast');
  check('old:empty-ctn-toast', toast5b === '这里没有物品', '空柜 toast=' + toast5b);
  check('old:empty-ctn-nocmd', (await drain()) === '[]', '空柜零命令');

  /* ---- ⑥ 全库视图 srTidy 隐藏回归 ---- */
  await clickBtn('#srPinRow [data-ctn="900001"]');
  await page.waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '背包', null, { timeout: 4000 });
  await clickBtn('#srScope');
  await page.waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '全库搜索', null, { timeout: 4000 });
  const globalHidden = await hidden('#srTidy');
  check('old:global-tidy-hidden', globalHidden === true, '全库视图 srTidy hidden=' + globalHidden);
  await clickBtn('#srScope');
  await page.waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '背包', null, { timeout: 4000 });
  check('old:local-tidy-visible', !(await hidden('#srTidy')), '回本柜视图 srTidy 复显');

  /* ---- ⑦ rack sbTidy=背包整理 + 空背包 + ⑧ closeMidMenus 顺手项 ---- */
  await page.click('#hzBtnRack');
  await page.waitForSelector('#srBagP', { timeout: 4000 });
  await page.waitForFunction(() => !!document.getElementById('sbGrid'), null, { timeout: 4000 });
  await mock(page, 'rack', BAG10, CTN5, CTN_ITEMS);
  await page.waitForFunction(() => document.querySelectorAll('#sbGrid .sr-slot[data-it]').length === 10, null, { timeout: 4000 });
  await drain();
  await clickBtn('#sbTidy');
  await page.waitForTimeout(80);
  const d7 = JSON.parse(await drain());
  check('old:sb-cmd-json', d7.length === 1 && d7[0].op === 'tidy' && d7[0].owner === 900001,
    'sbTidy drain=' + JSON.stringify(d7));
  const toast7 = await txt('#srToast');
  check('old:sb-delta-toast', toast7 === '已整理：10 叠合并为 9 叠', 'sbTidy toast 走主侧栏 #srToast=' + toast7);
  const sbAfter = await page.evaluate(() => document.querySelectorAll('#sbGrid .sr-slot[data-it]').length);
  check('old:sb-grid-9', sbAfter === 9, 'sbGrid 同步 9 叠=' + sbAfter);
  /* ⑧ closeMidMenus 顺手项：开分类放入下拉 → 点 sbStoreAll → 弹窗开 & 下拉收 */
  await clickBtn('#srPutCat');
  await page.waitForTimeout(60);
  const dropdownOpen = await page.evaluate(() => { const m = document.querySelector('#srPutCatMenu'); return m && !m.hidden; });
  await clickBtn('#sbStoreAll');
  await page.waitForTimeout(120);
  const dropdownAfter = await page.evaluate(() => { const m = document.querySelector('#srPutCatMenu'); return m && !m.hidden; });
  const confirmOpen = !(await hidden('#sbConfirm'));
  check('old:dropdown-was-open', dropdownOpen === true, '前置：分类下拉开着=' + dropdownOpen);
  check('old:closemidmenus-fixture', confirmOpen && dropdownAfter === false,
    'sbStoreAll→确认弹窗开 & 分类下拉被收（T12 随行顺手项） dropdownAfter=' + dropdownAfter + ' confirm=' + confirmOpen);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  /* sbTidy 空背包：零命令 + 主侧栏 toast（proto tidyById 内部恒 toast()） */
  await mock(page, 'rack', [], CTN5, CTN_ITEMS);
  await page.waitForFunction(() => document.querySelectorAll('#sbGrid .sr-slot[data-it]').length === 0, null, { timeout: 4000 });
  await drain();
  await clickBtn('#sbTidy');
  await page.waitForTimeout(80);
  const toast7b = await txt('#srToast');
  check('old:sb-empty-toast', toast7b === '背包是空的', 'sbTidy 空背包 toast=' + toast7b);
  check('old:sb-empty-nocmd', (await drain()) === '[]', 'sbTidy 空背包零命令');

  /* rack 主侧栏 tidy = 当前架子（任意容器）冒烟：owner=rackOwner 900103 */
  await page.waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '材料架', null, { timeout: 4000 });
  await drain();
  await clickBtn('#srTidy');
  await page.waitForTimeout(80);
  const d8 = JSON.parse(await drain());
  check('old:rack-sr-tidy-owner', d8.length === 1 && d8[0].op === 'tidy' && d8[0].owner === 900103,
    'rack 主侧栏 tidy owner=rackOwner=' + JSON.stringify(d8));
  const toast8 = await txt('#srToast');
  check('old:rack-sr-tidy-toast', toast8 === '已整理：3 叠合并为 3 叠', '无可并叠 N=M 照打 proto 同款=' + toast8);

  check('old:console-clean', consoleErrors.length === 0 && pageErrors.length === 0,
    'console errors=' + consoleErrors.length + ' pageErrors=' + pageErrors.length + (consoleErrors[0] ? ' | ' + consoleErrors[0] : '') + (pageErrors[0] ? ' | ' + pageErrors[0] : ''));

  await browser.close();
  const fails = results.filter((r) => !r.ok).length;
  console.log('---- old harness: ' + (results.length - fails) + '/' + results.length + ' PASS ----');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('DRIVER ERROR', e); process.exit(2); });
