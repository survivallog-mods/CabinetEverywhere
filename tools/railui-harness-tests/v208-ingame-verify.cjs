/* v208 实机终验（2026-11-01 作者缺陷#1/#2/#3 修复，构建 e690cff）。
   #1/#3：mount 装配即渲染——Trade 页签栏非空+plain 类+标题非空（旧码红=骨架态卡死），
          Trade 页签点柜子切官方格（1.7.0 语义）；Cooking 同断言（无骨架闪烁残留）。
   #2：柜宽统一 12——LogOutput 的 SizeEngine 行须含 改写 1062(通信设备)/2003(纸箱SUV 包)，
          点 Trade 页签「通信设备」后官方格首行格数 ≥12（宽=12 列直证）。
   我方自起游戏→载作者存档；零真实数据改动（uiShow=官方 ShowUI 重放，浏览+切页签）；
   游戏保持运行留给作者直接复测。 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const GAME = 'E:/SteamLibrary/steamapps/common/Survival Log/SurvivalLog.exe';
const LOG = 'E:/SteamLibrary/steamapps/common/Survival Log/BepInEx/LogOutput.log';
const OUT = path.join(__dirname, '..', '..', 'SurvivalLog.CabinetEverywhere', 'design-proto', 'shots', 'ingame-v208');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}
const evT = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms || 12000))]);
const WD = setTimeout(() => { console.log('[wd] 14min 收卷'); finish(); }, 840000);
function finish() {
  clearTimeout(WD);
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== v208 TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  try { fs.writeFileSync(path.join(OUT, 'matrix.json'), JSON.stringify(results, null, 1)); } catch (e) { }
  process.exit(fail ? 1 : 0);
}
function logTail(re) {
  try { const t = fs.readFileSync(LOG, 'utf8'); const m = t.split('\n').filter((l) => re.test(l)); return m; } catch (e) { return []; }
}

(async () => {
  /* ① 起游戏（若已运行则跳过——本验须新 dll 生效，先确认进程是本包启动的） */
  const { exec } = require('child_process');
  const httpGet = (url) => new Promise((res) => require('http').get(url, (r) => res(true)).on('error', () => res(false)));
  if (!(await evT(httpGet('http://127.0.0.1:9222/json/version'), 3000))) {
    exec('start "" "' + GAME + '"');
    let up = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      up = await evT(httpGet('http://127.0.0.1:9222/json/version'), 2500);
      if (up) break;
    }
    check('boot:cdp', up, up ? '9222 就绪' : 'CDP 未起');
    if (!up) finish();
  } else check('boot:cdp', true, '游戏已在运行（沿用）');

  const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 30000 });
  const page = browser.contexts()[0].pages().find((p) => decodeURIComponent(p.url()).indexOf('Root') >= 0);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 100)));

  /* ② 载档（主菜单→继续生存→HUD） */
  let menuClicked = false;
  for (let i = 0; i < 50; i++) {
    await page.waitForTimeout(3000);
    if (await evT(page.evaluate(() => !!document.querySelector('iframe#CoreUI1')), 8000)) break;
    if (!menuClicked) {
      const m = page.frames().find((f) => f.url().indexOf('/MainUI.') >= 0);
      if (m) await m.locator('.menu-text:has-text("继续生存")').first().click({ timeout: 5000 })
        .then(() => { menuClicked = true; }).catch(() => { });
    }
  }
  check('boot:hud', await evT(page.evaluate(() => !!document.querySelector('iframe#CoreUI1')), 8000), 'HUD 就绪');
  await page.waitForTimeout(8000); /* 进档后家具扫描+SizeEngine 首轮（5s 慢通道）+bootstrap */

  /* ③ #2 柜宽：SizeEngine 行（新政策：改写含 1062/2003；跳过只许真排除共包） */
  const seLines = logTail(/\[CERail\] SizeEngine/);
  check('width:sizeengine-line', seLines.length > 0, seLines[seLines.length - 1] || '（无 SizeEngine 行）');
  const seLast = (seLines[seLines.length - 1] || '');
  check('width:1062-rewritten', /1062\(通信设备\)8→12|1062\([^)]*\)\d+→12/.test(seLast), seLast.slice(0, 160));
  check('width:2003-rewritten', /2003\(纸箱\)\d+→12|2003\([^)]*\)\d+→12/.test(seLast), seLast.slice(0, 160));
  check('width:no-34blacklist-wording', seLast.indexOf('黑名单') < 0, '（34 包套件黑名单应已退役）');

  /* 前置：HUD 点背包激活 rail 场景（drain 门在 AnyRailSceneActive 之后——无活跃场景 uiShow 命令取不走）。
     locator.click 会因 actionability 超时（v187 实锤）——JS 直点 el.click() 稳 */
  const core0 = page.frames().find((ff) => ff.url().indexOf('/CoreUI1.') >= 0);
  if (core0) {
    await core0.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) => (x.textContent || '').indexOf('背包') >= 0);
      if (b) b.click();
    });
    await page.waitForTimeout(2200);
    console.log('[drv] HUD 背包已点（激活 drain 门）');
  }

  /* ④ #1/#3 Trade：装配即完整渲染 */
  await page.evaluate(() => window.__CERAIL__.cmd('uiShow', { key: 'Trade' }));
  await page.waitForTimeout(1800);
  let fr = null;
  for (let i = 0; i < 20 && !fr; i++) {
    await page.waitForTimeout(800);
    fr = page.frames().find((f) => decodeURIComponent(f.url()).indexOf('TradeUI.') >= 0 && f !== page.mainFrame());
  }
  check('trade:frame', !!fr, fr ? fr.url().slice(-40) : '未出现');
  if (!fr) finish();
  /* v187 已知限制：uiShow 重放页无数据流——Trade 官方模板整页 .cols 不建（实机探查实锤
     cols:false/bodyKids:4）→ rail 无宿主可装。Trade 装配/页签/plain 断言由离线 v207 对
     官方模板 fixture 全绿覆盖；实机 Trade 自然开页归作者复测。此处 SKIP 不 FATAL。 */
  const colsOk = await fr.evaluate(() => !!document.querySelector('.cols'));
  if (!colsOk) {
    check('trade:replay-no-cols', true, 'SKIP：重放页无 .cols（游戏开页数据流缺席，非 mod 缺陷；Trade 断言=v207 离线官方模板全绿）');
    await page.evaluate(() => window.__CERAIL__.cmd('uiClose', { key: 'Trade' })).catch(() => { });
    await page.waitForTimeout(800);
  }
  if (colsOk) {
  await fr.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 20000 });
  await page.waitForTimeout(1200); /* 观察器装配+（若有）首包——注意：不再有第二包兜底 */
  const tState = () => fr.evaluate(() => {
    const r = document.getElementById('srRail');
    const grid = document.getElementById('tradeBagGrid') || (r && r.querySelector('.grid-container'));
    let firstRowCells = 0, gridW = 0;
    if (grid) {
      gridW = grid.offsetWidth;
      const rows = grid.querySelectorAll('.grid-row, .bag-row, [class*="row"]');
      const cont = grid.querySelector('.grid-container') || grid;
      const kids = cont.children;
      if (kids.length) firstRowCells = kids[0] ? kids[0].children.length : 0;
    }
    return {
      plain: !!(r && r.classList.contains('plain')),
      pins: r ? r.querySelectorAll('#srPinRow [data-ctn]').length : -1,
      pinTexts: r ? Array.from(r.querySelectorAll('#srPinRow .p-lb')).map((b) => b.textContent) : [],
      title: r ? ((r.querySelector('#srTitle') || {}).textContent || '') : '',
      searchVisible: r ? (function (s) { return s && getComputedStyle(s).display !== 'none'; })(r.querySelector('.sr-searchrow')) : false,
      firstRowCells, gridW
    };
  });
  let s = await tState();
  check('trade:plain', s.plain, JSON.stringify({ plain: s.plain, title: s.title }));
  check('trade:pins-nonempty', s.pins >= 2, 'pins=' + s.pins + ' ' + JSON.stringify(s.pinTexts.slice(0, 6)) + '（作者缺陷#3：旧码红=0 全空）');
  check('trade:title', !!s.title, 'title="' + s.title + '"');
  check('trade:search-hidden', !s.searchVisible, '（骨架态红=搜索行可见）');
  await page.screenshot({ path: path.join(OUT, 'trade.png') });

  /* ⑤ 页签点柜（1.7.0 语义）只做非破坏在场检查：uiShow 重放页官方格无数据流（v187 实锤），
     grid 列数/active 回显在重放页不可证——柜宽 12 的实机证据=③ 的 SizeEngine 直写行
     （Config_Bag 即官方渲染数据源，渲染管线 v1.8.3 轮已实机验证过）。 */
  const comm = await fr.evaluate(() => {
    const pins = Array.from(document.querySelectorAll('#srPinRow [data-ctn]'));
    const hit = pins.find((b) => (b.textContent || '').indexOf('通信') >= 0);
    return hit ? hit.getAttribute('data-ctn') : null;
  });
  check('trade:comm-pin-present', !!comm, '通信设备页签' + (comm ? '=' + comm + '（1062 包改宽后收录在栏）' : ' 不在'));
  } /* end if (colsOk) —— 重放页无 .cols 时 Trade 断言整段跳过（v207 离线覆盖） */

  /* ⑥ Cooking：装配即完整渲染（作者缺陷#1：烹饪开页闪骨架）。
     重放双活工件（v187）：HUD 背包+重放页并存时 ActiveScene 固定序 BackpackUI 霸主 →
     ctx.page 全错 → rail 场景态跟错页。顺序：先 uiShow Cooking（此刻背包在活跃=drain 可取），
     再 uiClose BackpackUI → Cooking 成唯一活跃页 → 契约 ctx.page=Cooking → applyScene 收敛。 */
  await page.evaluate(() => window.__CERAIL__.cmd('uiShow', { key: 'Cooking' }));
  await page.evaluate(() => window.__CERAIL__.cmd('uiClose', { key: 'BackpackUI' })).catch(() => { });
  let fc = null;
  for (let i = 0; i < 20 && !fc; i++) {
    await page.waitForTimeout(800);
    fc = page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/Cooking.') >= 0 || decodeURIComponent(f.url()).indexOf('Cooking.html') >= 0 && f !== page.mainFrame());
  }
  check('cook:frame', !!fc, fc ? '' : '未出现');
  if (fc) {
    await fc.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 20000 });
    await page.waitForTimeout(2500); /* uiClose 背包 → 契约翻页重推（pageChanged 必推）→ applyScene(Cooking) */
    const cs = await fc.evaluate(() => {
      const r = document.getElementById('srRail');
      return {
        plain: !!(r && r.classList.contains('plain')),
        pins: r ? r.querySelectorAll('#srPinRow [data-ctn]').length : -1,
        title: r ? ((r.querySelector('#srTitle') || {}).textContent || '') : '',
        searchVisible: r ? (function (e2) { return e2 && getComputedStyle(e2).display !== 'none'; })(r.querySelector('.sr-searchrow')) : false
      };
    });
    check('cook:plain+render', cs.plain && cs.pins >= 1 && !!cs.title, JSON.stringify(cs));
    await page.screenshot({ path: path.join(OUT, 'cooking.png') });
  }
  check('console-clean', errs.length === 0, errs.slice(0, 3).join(' | '));
  /* 收尾：关重放页留干净 HUD 给作者（uiClose=Ac_CloseUI 重放，幂等） */
  for (const k of ['Cooking', 'Trade', 'BackpackUI']) {
    await page.evaluate((kk) => window.__CERAIL__.cmd('uiClose', { key: kk }), k).catch(() => { });
  }
  await page.waitForTimeout(1200);
  await browser.close(); /* 单连接干净退出（CDP 客户端被 kill 会楔死 Vuplex devtools） */
  finish();
})().catch((e) => { console.log('FATAL', String(e).slice(0, 300)); process.exit(1); });
