/* v207 装配即渲染（2026-11-01 作者缺陷#1/#3 终修回归）。
   根因：v1.8.3 起 mount() 尾部被误插 `if (mountedOk) return`——装配替换宿主后
   mountedOk 恒真 → applyScene/render 每次都被跳过，侧栏停在骨架态（标题空/页签栏
   全空/plain 未应用=作者截到的「开发期页面」），只能等下一包 setData 自愈；
   Trade 浏览期物品零变化无推送 → 骨架卡死（无人机交易页签栏全空）。
   断言：
     ① Trade 装配后**无第二包**即完整渲染：plain 类在位、页签行 >1（背包+柜子）、标题非空；
     ② 官方宿主复活（模拟 Vue 重建首列）重装配后，**仍无新包**即恢复完整渲染（旧码红=空页签）；
     ③ __CERAIL__.mount() 直调返回 true（旧码红=undefined）；
     ④ A→B→A 重访（rebindFrame 快照路）页签非空。 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}
const ICO = 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4AAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
const CONTRACT = (rev) => ({
  rev: rev, ctx: { page: 'Trade', family: 'trade', bagOnly: false, bpBag: true, bagCap: 42, view: 'browser' },
  bag: 900001,
  ctn: [[900101, '储物柜', 'c', 40, 101], [900102, '橱柜', 'c', 36, 101], [900103, '工具柜', 'c', 60, 0]],
  lib: [[101, '食材', 4, 1, '', '#8fc06e']],
  icfg: [[1, '生态香米', ICO + '#v1', 12, 99, 1, 1, '食材', 0, 15, 0, 0, 0, 0]],
  items: { bag: [[901, 1, 30, 7200, 0, 0, 1, 1, 0, 15, null, null, null, 360, 3.5]], 900101: [[902, 1, 3, 0, 0, 0, 1, 1, 0, null, null, null, null, null, null]] }
});

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await (await browser.newContext({ viewport: { width: 1536, height: 864 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  /* 唯一一包数据（此后不再 setData——旧码的骨架只能靠新包自愈，本测试正是要证不再依赖） */
  await page.evaluate((j) => window.__CERAIL__.setData(j), CONTRACT(700));
  await page.evaluate(() => window.__HZ_SHOW__('Trade'));
  const fr = page.frames().find((f) => f.url().includes('/fixtures/Trade.html'));
  await fr.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 15000 });
  await page.waitForTimeout(600);

  const railState = () => fr.evaluate(() => {
    var r = document.getElementById('srRail');
    return {
      plain: !!(r && r.classList.contains('plain')),
      pins: r ? r.querySelectorAll('#srPinRow [data-ctn]').length : -1,
      pinTexts: r ? Array.from(r.querySelectorAll('#srPinRow .p-lb')).map(function (b) { return b.textContent; }) : [],
      title: r ? (r.querySelector('#srTitle') || {}).textContent || '' : '',
      searchVisible: r ? (function (s) { return s && getComputedStyle(s).display !== 'none'; })(r.querySelector('.sr-searchrow')) : false
    };
  });

  /* ① 装配后无第二包即完整渲染 */
  var s1 = await railState();
  check('v207:trade-plain-applied', s1.plain, JSON.stringify(s1));
  check('v207:trade-pins-nonempty', s1.pins >= 3, 'pins=' + s1.pins + ' ' + JSON.stringify(s1.pinTexts) + '（旧行为红=0：页签栏全空）');
  check('v207:trade-title-filled', !!s1.title, 'title="' + s1.title + '"');
  check('v207:trade-search-hidden-by-plain', !s1.searchVisible, 'plain 应隐藏搜索行（旧行为红=骨架态搜索行可见）');

  /* ② 模拟官方 Vue 重建首列（宿主复活）：摘 #srp、还原一个裸 .col 首子 → 观察器重装配 */
  await fr.evaluate(() => {
    var cols = document.querySelector('.cols');
    var old = document.getElementById('srp');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (cols) { var c = document.createElement('div'); c.className = 'col'; cols.insertBefore(c, cols.firstChild); }
  });
  await page.waitForTimeout(1500); /* 观察器+装配 ≤~1s；期间无任何新数据包 */
  var s2 = await railState();
  check('v207:remount-rail-back', s2.pins >= 0, JSON.stringify(s2));
  check('v207:remount-pins-nonempty-no-newdata', s2.pins >= 3, 'pins=' + s2.pins + '（旧行为红=0：重装配后卡死骨架直到下一包——作者 Trade 复现径）');
  check('v207:remount-plain-applied', s2.plain, '（旧行为红=plain 丢失→非 plain 骨架）');
  check('v207:remount-title-filled', !!s2.title, 'title="' + s2.title + '"');

  /* ③ mount 直调返回 true（旧码=undefined：早退吞掉 return true）——先复活宿主再直调，
        直调装配后**无观察器等待、无新包**，断言即刻完整渲染 */
  var rt = await page.evaluate(() => {
    var f = window.__HZ_FRAME__ && window.__HZ_FRAME__('Trade');
    if (!f) return 'noframe';
    var doc = f.contentDocument;
    var old = doc.getElementById('srp');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var cols = doc.querySelector('.cols');
    if (cols) { var c = doc.createElement('div'); c.className = 'col'; cols.insertBefore(c, cols.firstChild); }
    return window.__CERAIL__.mount(doc, 'Trade');
  });
  check('v207:mount-returns-true', rt === true, 'mount()=' + rt + '（旧码红=undefined）');
  var s3d = await railState();
  check('v207:mount-direct-instant-render', s3d.pins >= 3 && s3d.plain && !!s3d.title, 'pins=' + s3d.pins + ' plain=' + s3d.plain + ' title="' + s3d.title + '"');

  /* ④ A→B→A 重访（rebindFrame 快照）：Trade→Cooking→Trade 页签仍非空 */
  await page.evaluate(() => window.__HZ_SHOW__('Cooking'));
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__HZ_SHOW__('Trade'));
  await page.waitForTimeout(900);
  var s3 = await railState();
  check('v207:revisit-pins-nonempty', s3.pins >= 3, 'pins=' + s3.pins + '（重访重绑快照路）');
  check('v207:console-clean', errs.length === 0, errs.slice(0, 3).join(' | '));

  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== v207 TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FATAL', String(e)); process.exit(1); });
