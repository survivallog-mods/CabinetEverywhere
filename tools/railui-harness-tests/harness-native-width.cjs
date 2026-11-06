/* native 页宽度回归 harness（十九批：背包/柜子界面右侧黑块修复；serve.cjs 须已在 8180）。
   根因复盘：v1.8.11 曾给 style#srNativeBp 追加 .grid-container{min-width:UNI_W*56+18}——「+18」
   是 rail 机器页（webui-bag cfg.padding 9×2）几何误植，native BackpackUI 官方 inline 宽=cols*56
   整、容器零内边距（fixture gridContainerStyle 实证）→ 12 列恒超宽 18px、窄袋更多，格床右侧露
   --grid-frame-bg 暗底=作者实报「背包/柜子右侧黑色空白，交易/烹饪页没有」。
   断言（BackpackUI 夹具预置 gridCols=10 = 窄袋最大化暴露路径）：
   ① style#srNativeBp 在场且 data-uw='0'；
   ② 注入 CSS 无任何 min-width 行；
   ③ 官方格 computed min-width=auto/0px（零强制宽）；
   ④ 官方格 offsetWidth 未被垫到 12 列基准（<690px；纯跟随 10×56+滚动槽≈580）；
   ⑤ 活迁移：手工种回旧版 '690' 注入体 → 扫描周期一次重写清除（幂等零写路径不退役）；
   尾部：零 console error / pageerror。 */
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
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/wangk/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe' });
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HZ_CURRENT__ !== undefined && window.__HZ_CURRENT__() !== null, null, { timeout: 20000 });
  await page.evaluate(() => window.__HZ_SHOW__('BackpackUI'));

  function frame() { return page.frames().find((f) => f.url().includes('/fixtures/BackpackUI.html')); }
  await frame().waitForFunction(() => {
    const g = document.querySelector('.grid-container');
    return g && g.offsetWidth > 0 && document.getElementById('srNativeBp');
  }, null, { timeout: 15000 });

  const snap = await frame().evaluate(() => {
    const st = document.getElementById('srNativeBp');
    const g = document.querySelector('.grid-container');
    return {
      uw: st ? (st.getAttribute('data-uw') || '') : '(missing)',
      css: st ? st.textContent : '',
      minW: g ? getComputedStyle(g).minWidth : '(no grid)',
      w: g ? g.offsetWidth : 0,
    };
  });
  check('nw:style-injected', snap.uw !== '(missing)' && snap.css.indexOf('max-height') >= 0, 'srNativeBp 在场');
  check('nw:data-uw-0', snap.uw === '0', 'data-uw=' + snap.uw);
  check('nw:no-min-width-rule', snap.css.indexOf('min-width') < 0, (snap.css.match(/min-width[^;}]*/) || ['（无）'])[0]);
  check('nw:grid-min-auto', snap.minW === 'auto' || snap.minW === '0px', 'computed min-width=' + snap.minW);
  check('nw:grid-not-floored', snap.w > 500 && snap.w < 690, 'offsetWidth=' + snap.w + '（690=旧地板基准，应低于）');

  /* 活迁移：种回旧版注入体（'690'+min-width 行）→ ensureNativeBp 周期重写清除 */
  await frame().evaluate(() => {
    const st = document.getElementById('srNativeBp');
    st.setAttribute('data-uw', '690');
    st.textContent += '.grid-container{min-width:690px}';
  });
  await frame().waitForFunction(() => {
    const st = document.getElementById('srNativeBp');
    return st && st.getAttribute('data-uw') === '0' && st.textContent.indexOf('min-width') < 0;
  }, null, { timeout: 8000 }).then(
    () => check('nw:legacy-migration', true, '旧 690 注入体已重写清除'),
    () => check('nw:legacy-migration', false, '8s 内未清除（对账路退役？）'));

  check('nw:console-zero-errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join('；'));
  check('nw:pageerror-zero', pageErrors.length === 0, pageErrors.slice(0, 3).join('；'));

  await browser.close();
  const pass = results.filter((r) => r.ok).length;
  console.log('\n==== NATIVE-WIDTH SUMMARY: ' + pass + '/' + results.length + (pass === results.length ? ' PASS ====' : ' FAIL ===='));
  process.exit(pass === results.length ? 0 : 1);
})();
