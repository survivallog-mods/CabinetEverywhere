/* 染料桶色素排序 harness（dye-pigment-sort plan Task 3 §1/§3；serve.cjs 须已在 8180）。
   §1 契约读取：icfg pig 尾列（DyePanel 16 列/其他页 14 列）+ normIcfg 类型判形（pig=string 与
   brew canBrew=number 同宽互斥）+ pigPointsOf（含畸形串容错）。
   §3 专属排序 dispApplyDyePig：点数降序/并列稳定/沉底原相对序/多格装填/official 复位。
   §2 菜单/§4 角标（Task 4）、§5 回归（Task 5）随任务追加。尾部：零 console error / pageerror。 */
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

  const pushCtx = (key) => page.evaluate((k) => window.__HZ_PUSH__(k), key);
  await page.evaluate(() => {
    window.__HZ_LASTJ__ = null;
    const orig = window.__CERAIL__.setData;
    window.__CERAIL__.setData = function (j) { window.__HZ_LASTJ__ = j; return orig.apply(this, arguments); };
  });
  const lastIcfgLens = () => page.evaluate(() => (window.__HZ_LASTJ__ || { icfg: [] }).icfg.map((r) => r.length));

  /* §1 数据基座：PG 默认表（夹具）——cfg1=[[3,2],[5,1]] cfg3=[[3,2]] cfg8=[[3,5]] cfg2="[]"；
     自检口 __CERAIL__.dyePig = { points(row,colorId), norm(cfgId), apply(key) }（brewTier 先例） */
  const pigCall = async (expr) => {
    try { return await page.evaluate((e) => eval(e), 'window.__CERAIL__.dyePig.' + expr); }
    catch (e) { return 'ERR:' + String(e).slice(0, 60); }
  };

  await pushCtx('DyePanel');
  check('S1-icfg-dye-tail16', JSON.stringify(await lastIcfgLens()) === JSON.stringify(new Array(12).fill(16)), 'lens=' + JSON.stringify(await lastIcfgLens()));
  check('S1-icfg-dye-r15-string', await page.evaluate(() => (window.__HZ_LASTJ__.icfg[0][15])) === '[[3,2],[5,1]]', 'r15=' + await page.evaluate(() => String(window.__HZ_LASTJ__.icfg[0][15])));
  await pushCtx('Cooking');
  check('S1-icfg-other-noTail', JSON.stringify(await lastIcfgLens()) === JSON.stringify(new Array(12).fill(14)), 'lens=' + JSON.stringify(await lastIcfgLens()));

  await pushCtx('DyePanel');
  check('S1-points-cfg1-red', await pigCall('points({cfgId:1},3)') === 2, 'got ' + await pigCall('points({cfgId:1},3)'));
  check('S1-points-cfg1-blue', await pigCall('points({cfgId:1},5)') === 1, 'got ' + await pigCall('points({cfgId:1},5)'));
  check('S1-points-empty-pig', await pigCall('points({cfgId:2},3)') === 0, 'got ' + await pigCall('points({cfgId:2},3)'));
  check('S1-points-no-tail-cfg', await pigCall('points({cfgId:5},3)') === 0, 'got ' + await pigCall('points({cfgId:5},3)'));
  check('S1-points-missing-icfg', await pigCall('points({cfgId:999},3)') === 0, 'got ' + await pigCall('points({cfgId:999},3)'));
  /* 畸形串：整表替换后 points 容错返 0 不抛 */
  await page.evaluate(() => { window.__HZ_DYEPIG__ = { 1: 'x{bad' }; });
  await pushCtx('DyePanel');
  check('S1-pig-malformed', await pigCall('points({cfgId:1},3)') === 0, 'got ' + await pigCall('points({cfgId:1},3)'));
  await page.evaluate(() => { delete window.__HZ_DYEPIG__; });
  await pushCtx('DyePanel');
  /* 类型判形（同宽互斥）：DyePanel 行 pig=string/bw=0；BrewPanel 行 bw=number/pig='' */
  const shape = async (expr) => pigCall(expr);
  check('S1-shape-dye-str-bw0', (await shape('norm(1).pig')) === '[[3,2],[5,1]]' && (await shape('norm(1).bw')) === 0,
    'pig=' + await shape('norm(1).pig') + ' bw=' + await shape('norm(1).bw'));
  await pushCtx('BrewPanel');
  check('S1-shape-brew-num-pigempty', (await shape('norm(1).bw')) === 1 && (await shape('norm(1).pig')) === '',
    'bw=' + await shape('norm(1).bw') + ' pig=' + JSON.stringify(await shape('norm(1).pig')));
  await pushCtx('DyePanel');

  /* ---- §3 专属排序 dispApplyDyePig（经自检口 apply(key)=menuFoot onPick 同路）----
     自定契约+页模型（多格 2x1）：901 cfg1(红2) 902 cfg3(红2 并列) 903 cfg5(无) 904 cfg4(无)
     905 cfg8(红5, 2x1) 906 cfg7(无)。期望：905→901→902（并列稳定按原序）→沉底组原相对序
     903→904→906；装填行优先 905 占 (0,0) 2 格，901 从 x=2 起（无重叠）。 */
  const showScene = async (key) => {
    await page.getByRole('button', { name: key, exact: true }).click();
    await page.waitForFunction((k) => {
      for (let i = 0; i < window.frames.length; i++) {
        try {
          const d = window.frames[i].document;
          if (!window.frames[i].location.href.includes('/' + k + '.html')) continue;
          const r = d.getElementById('srRail');
          if (r && r.isConnected) return true;
        } catch (e) { }
      } return false;
    }, key, { timeout: 9000 });
  };
  const frameEl = (key) => page.frames().find((f) => f.url().includes('/fixtures/' + key + '.html'));

  const mock = await page.evaluate(() => window.__HZ_MOCKSET__());
  mock.items.bag = [
    [901, 1, 3, 7200, 0, 1, 1, 1, 0, null, null, null, null, null, null],
    [902, 3, 2, 10800, 1, 1, 1, 1, 0, null, null, null, null, null, null],
    [903, 5, 40, 0, 2, 1, 1, 1, 0, null, null, null, null, null, null],
    [904, 4, 12, 0, 3, 1, 1, 1, 0, null, null, null, null, null, null],
    [905, 8, 3, 0, 4, 1, 2, 1, 0, null, null, null, null, null, null],
    [906, 7, 2, 0, 5, 1, 1, 1, 0, null, null, null, null, null, null]
  ];
  await page.evaluate((j) => window.__HZ_MOCKSET__(j), mock);
  await pushCtx('DyePanel');
  await showScene('DyePanel');
  /* 页模型同 id 同 cfg（多格 905 w=2）——官方 BagMsg 直投（nudge 同路） */
  await frameEl('DyePanel').evaluate(() => {
    const mk = (id, x, y, w, cfg) => ({ itemId: id, x: x, y: y, w: w, h: 1, emoji: '🌿', name: '植物' + id, count: 1, quality: 3 });
    window.postMessage({ type: 'WebUI_Dye_BagMsg', data: { bagOwnerId: 900001, bagCols: 10, bagRows: 6,
      bagItems: [mk(901, 0, 2, 1, 1), mk(902, 1, 2, 1, 3), mk(903, 2, 2, 1, 5), mk(904, 3, 2, 1, 4), mk(905, 4, 2, 2, 8), mk(906, 5, 2, 1, 7)] } }, '*');
  });
  await page.waitForTimeout(300);

  const gridPos = () => frameEl('DyePanel').evaluate(() => {
    const its = [...document.querySelectorAll('#bagGrid .item')];
    return its.map((el) => ({ id: parseInt(el.id, 10), x: parseFloat(el.style.left), y: parseFloat(el.style.top), w: el.offsetWidth }))
      .sort((a, b) => (a.y - b.y) || (a.x - b.x));
  });
  let pos = await gridPos();
  check('S3-pre-nudge-model', pos.length === 6 && pos[0].id === 901, JSON.stringify(pos.map((p) => p.id)));

  await pigCall('apply("pig:3")');
  await page.waitForTimeout(200);
  pos = await gridPos();
  check('S3-order-desc-tie-sink', JSON.stringify(pos.map((p) => p.id)) === JSON.stringify([905, 901, 902, 903, 904, 906]), JSON.stringify(pos.map((p) => p.id)));
  check('S3-pack-multicell-nooverlap', pos[0].id === 905 && pos[0].x === 9 && pos[1].id === 901 && pos[1].x >= pos[0].x + 80,
    JSON.stringify(pos.slice(0, 2).map((p) => ({ id: p.id, x: p.x }))));

  await pigCall('apply("official")');
  await page.waitForTimeout(200);
  pos = await gridPos();
  const back = pos.map((p) => p.id).sort((a, b) => a - b);
  check('S3-official-restore', back.length === 6 && JSON.stringify(pos.map((p) => p.id).sort()) === JSON.stringify([901, 902, 903, 904, 905, 906]) &&
    pos.find((p) => p.id === 901).y > 0, JSON.stringify(pos.map((p) => ({ id: p.id, x: p.x, y: p.y }))));

  /* 尾部：零 error */
  check('Z-console-clean', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 200));
  check('Z-pageerror-clean', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 200));

  await browser.close();
  const fails = results.filter((r) => !r.ok).length;
  console.log(fails === 0 ? 'ALL PASS (' + results.length + ')' : fails + ' FAIL / ' + results.length);
  process.exit(fails === 0 ? 0 : 1);
})();
