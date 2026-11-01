/* v210 柜子滚动条（2026-11-01 作者缺陷：滚动越界全空白/容纳也显滚动条/极限=页签最高柜）。
   机制：官方 createGridSizeLock（webui-bag.js@1211）seenRows/seenCols 只增不减（hint=bagMaxRows
   =页签柜最高行——作者括号直觉逐字命中）→ 切短柜后格容器被 margin 撑到见过的最高柜。
   修=壳内 unlockGridSize（观察器跟清+mount 首清；落点换算=容器实时 rect，清零无害）。
   断言（Cooking fixture=真官方页跑真 bagLock）：
     ① 官方路实锤：post BagMsg(rows=4, maxRows=16) → 官方锁给格容器加 margin（>0）
     ② 修后：观察器 50ms 内清零（四向 margin=0px）
     ③ 滚动极限=当前柜：srBody.scrollHeight ≈ 当前格高（不含 12 行差值的填充）；
        短柜（4 行）时 srBody 无纵向溢出（scrollHeight ≤ clientHeight+2 → 不出滚动条）
     ④ 换高柜（rows=14 < maxRows=16）仍有正常滚动且极限=自身行数。 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}
const ICO = 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4AAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
const CONTRACT = (rev) => ({
  rev: rev, ctx: { page: 'Cooking', family: 'bag', bagOnly: false, bpBag: true, bagCap: 42, view: 'food' },
  bag: 900001,
  ctn: [[900101, '食材柜', 'c', 40, 101], [900102, '冷藏柜', 'f', 24, 102]],
  lib: [[101, '食材', 4, 1, '', '#8fc06e']],
  icfg: [[1, '生态香米', ICO + '#v1', 12, 99, 1, 1, '食材', 0, 15, 0, 0, 0, 0]],
  items: { bag: [[901, 1, 30, 7200, 0, 0, 1, 1, 0, 15, null, null, null, 360, 3.5]] }
});

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await (await browser.newContext({ viewport: { width: 1536, height: 864 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.evaluate((j) => window.__CERAIL__.setData(j), CONTRACT(100));
  await page.evaluate(() => window.__HZ_SHOW__('Cooking'));
  const fr = page.frames().find((f) => f.url().includes('/fixtures/Cooking.html'));
  await fr.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 15000 });
  await page.waitForTimeout(500);

  const postBag = (rows, maxRows) => page.evaluate(([r, mr]) => {
    var el = document.getElementById('Cooking');
    el.contentWindow.postMessage({ type: 'WebUI_Cooking_BagMsg', data: { bagOwnerId: 900001, bagItems: [], bagCols: 12, bagRows: r, bagMaxCols: 12, bagMaxRows: mr } }, '*');
  }, [rows, maxRows]);
  const gState = () => fr.evaluate(() => {
    var host = document.getElementById('srGridHost');
    var g = host && host.firstElementChild;
    var body = document.getElementById('srBody');
    if (!g) return { nogrid: true };
    var cs = getComputedStyle(g);
    var m = { t: parseFloat(cs.marginTop) || 0, b: parseFloat(cs.marginBottom) || 0, l: parseFloat(cs.marginLeft) || 0, r: parseFloat(cs.marginRight) || 0 };
    return { gH: g.offsetHeight, gW: g.offsetWidth, m: m, bodyClient: body.clientHeight, bodyScroll: body.scrollHeight, hostScroll: host.scrollHeight };
  });

  /* ① 官方锁实锤：BagMsg(rows=4, maxRows=16) → 官方给 margin（等 20ms，观察器 50ms 未到） */
  await postBag(4, 16);
  await page.waitForTimeout(20);
  var s1 = await gState();
  var padOfficial = s1.m.b + s1.m.t + s1.m.l + s1.m.r;
  check('v210:official-lock-pads', padOfficial > 0, 'margins=' + JSON.stringify(s1.m) + '（官方 seenRows 填充复现）');

  /* ② 修后：观察器 ≤~100ms 清零 */
  await page.waitForTimeout(300);
  var s2 = await gState();
  var pad2 = s2.m.b + s2.m.t + s2.m.l + s2.m.r;
  check('v210:unlock-zero-margins', pad2 === 0, 'margins=' + JSON.stringify(s2.m) + '（unlockGridSize 清零）');

  /* ③ 滚动极限=当前柜：4 行格不溢出（无滚动条） */
  check('v210:short-no-overflow', s2.bodyScroll <= s2.bodyClient + 2, 'bodyScroll=' + s2.bodyScroll + ' ≤ client=' + s2.bodyClient + '（容纳=无滚动条）');
  check('v210:host-hugs-grid', Math.abs(s2.hostScroll - (s2.gH + 2)) <= 6, 'hostScroll=' + s2.hostScroll + ' vs gridH=' + s2.gH + '（宿主贴合当前格高）');

  /* ④ 高柜（20 行，超壳可视高）：正常滚动且极限=自身行数（hostScroll 贴合格高） */
  await postBag(20, 16);
  await page.waitForTimeout(300);
  var s3 = await gState();
  check('v210:tall-scrolls-to-own-bottom', s3.bodyScroll > s3.bodyClient && Math.abs(s3.hostScroll - (s3.gH + 2)) <= 6,
    'gH=' + s3.gH + ' hostScroll=' + s3.hostScroll + ' bodyScroll=' + s3.bodyScroll + '（旧码红=hostScroll 再叠 seenRows 填充）');
  check('v210:console-clean', errs.length === 0, errs.slice(0, 3).join(' | '));

  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== v210 TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FATAL', String(e).slice(0, 300)); process.exit(1); });
