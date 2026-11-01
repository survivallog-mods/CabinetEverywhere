/* v202 三零空契约防护（实机 rev4 实锤机制：点详情/切页瞬间 OwnerCache 空窗推
   「容器0/物品行0/icfg0」→ 旧代码落地即摘角标层+进页沿把排序打回 official →
   数据回来角标也不复活=作者「点详情后数值消失」）。
   断言 v1.8.5⑫ 空契约不落地：排序态/按钮标签/角标层全保；真数据随后照常收。 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}
const FULL = {
  rev: 500, ctx: { page: 'BackpackUI', family: 'backpack', bagOnly: true, bpBag: true, bagCap: 42 },
  bag: 900001,
  ctn: [[900101, '食材柜', 'c', 40, 101]],
  lib: [[101, '食材', 4, 1, '', '#8fc06e']],
  icfg: [
    [1, '生态香米', 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==#v1', 12, 99, 1, 1, '食材', 0, 15, 0, 0, 0, 0],
    [5, '铁钉', 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==#v5', 4, 999, 9, 0, '材料', 0, 0, 0, 0, 0, 0]
  ],
  items: { bag: [[901, 1, 30, 7200, 0, 0, 1, 1, 0, 15, null, null, null, 360, 3.5], [902, 3, 5, 10800, 1, 1, 1, 1, 0, 8, null, null, null, null, null], [903, 5, 40, 0, 2, 0, 1, 1, 0, null, null, null, null, null, null]] }
};
const EMPTY = { rev: 501, ctx: { page: 'BackpackUI', family: 'backpack', bagOnly: true, bpBag: true, bagCap: 42 }, bag: 0, ctn: [], lib: [], icfg: [], items: {} };

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await (await browser.newContext({ viewport: { width: 1536, height: 864 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__HZ_SHOW__('BackpackUI'));
  const fr = page.frames().find((f) => f.url().includes('/fixtures/BackpackUI.html'));
  await fr.waitForFunction(() => !!document.getElementById('srnSortBtn'), null, { timeout: 15000 });
  await page.waitForTimeout(400);

  await page.evaluate((j) => window.__CERAIL__.setData(j), FULL);
  await page.waitForTimeout(700);
  await fr.evaluate(() => document.getElementById('srnSortBtn').click());
  await fr.waitForFunction(() => !document.getElementById('srnSortPop').hidden, null, { timeout: 4000 });
  await fr.evaluate(() => document.querySelector('#srnSortPop [data-k="sat"]').click());
  await page.waitForTimeout(400);

  const before = await fr.evaluate(() => ({
    L: document.getElementById('srnBadges') ? document.getElementById('srnBadges').querySelectorAll('i').length : -1,
    lbl: (document.getElementById('srnSortLbl') || {}).textContent,
    on: !!(document.getElementById('srnSortBtn') || {}).className.match(/srn-on/)
  }));
  check('pre:badges-on', before.L >= 3 && before.lbl === '饱腹' && before.on, JSON.stringify(before));

  /* 三零空契约砸进来（= 实机点详情瞬间的 OwnerCache 空窗包） */
  await page.evaluate((j) => window.__CERAIL__.setData(j), EMPTY);
  await page.waitForTimeout(900);
  const mid = await fr.evaluate(() => ({
    L: document.getElementById('srnBadges') ? document.getElementById('srnBadges').querySelectorAll('i').length : -1,
    lbl: (document.getElementById('srnSortLbl') || {}).textContent,
    on: !!(document.getElementById('srnSortBtn') || {}).className.match(/srn-on/)
  }));
  check('empty:badges-kept', mid.L === before.L, JSON.stringify(mid) + '（旧代码红：层被摘 L=-1）');
  check('empty:sort-kept', mid.lbl === '饱腹' && mid.on, JSON.stringify(mid) + '（旧代码红：打回 official/排序）');

  /* 真数据回来 → 一切照常 */
  await page.evaluate((j) => window.__CERAIL__.setData(j), Object.assign({}, FULL, { rev: 502 }));
  await page.waitForTimeout(800);
  const after = await fr.evaluate(() => ({
    L: document.getElementById('srnBadges') ? document.getElementById('srnBadges').querySelectorAll('i').length : -1,
    lbl: (document.getElementById('srnSortLbl') || {}).textContent
  }));
  check('recovery:full-contract', after.L >= 3 && after.lbl === '饱腹', JSON.stringify(after));
  check('console-clean', errs.length === 0, errs.slice(0, 3).join(' | '));

  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== v202 TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FATAL', String(e)); process.exit(1); });
