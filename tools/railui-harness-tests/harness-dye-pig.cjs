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
    const mk = (id, x, y, w, cfg, canDye) => ({ itemId: id, x: x, y: y, w: w, h: 1, emoji: '🌿', name: '植物' + id, count: 1, quality: 3, canDye: canDye !== false });
    window.postMessage({ type: 'WebUI_Dye_BagMsg', data: { bagOwnerId: 900001, bagCols: 10, bagRows: 6,
      bagItems: [mk(901, 0, 2, 1, 1), mk(902, 1, 2, 1, 3, false), mk(903, 2, 2, 1, 5), mk(904, 3, 2, 1, 4), mk(905, 4, 2, 2, 8), mk(906, 5, 2, 1, 7)] } }, '*'); /* 902=cfg3 红2点但 canDye=false（官方拒收）——报障修：不出数+沉底+置灰 */
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
  check('S3-order-desc-tie-sink', JSON.stringify(pos.map((p) => p.id)) === JSON.stringify([905, 901, 902, 903, 904, 906]), JSON.stringify(pos.map((p) => p.id))); /* 902 canDye=false 沉底（保持原相对序=903/904 前） */
  check('S3-pack-multicell-nooverlap', pos[0].id === 905 && pos[0].x === 9 && pos[1].id === 901 && pos[1].x >= pos[0].x + 80,
    JSON.stringify(pos.slice(0, 2).map((p) => ({ id: p.id, x: p.x }))));

  await pigCall('apply("official")');
  await page.waitForTimeout(200);
  pos = await gridPos();
  const back = pos.map((p) => p.id).sort((a, b) => a - b);
  check('S3-official-restore', back.length === 6 && JSON.stringify(pos.map((p) => p.id).sort()) === JSON.stringify([901, 902, 903, 904, 905, 906]) &&
    pos.find((p) => p.id === 901).y > 0, JSON.stringify(pos.map((p) => ({ id: p.id, x: p.x, y: p.y }))));

  /* ---- §2 菜单（Task 4）：DyePanel=默认+全部颜色（swatch 色块）；dyePal 缺席=仅默认；长板滚动；钮标签动态 ---- */
  const menuItemsD = async () => frameEl('DyePanel').evaluate(() => {
    document.getElementById('srFoodSort').click();
    return [...document.querySelectorAll('#srFootSortBody button')].map((b) => b.textContent.trim());
  });
  const swatches = () => frameEl('DyePanel').evaluate(() =>
    [...document.querySelectorAll('#srFootSortBody .sr-fswatch')].map((s) => getComputedStyle(s).backgroundColor));
  let mm = await menuItemsD();
  check('S2-menu-default-3colors', mm.length === 4 && mm[0] === '⊞默认' && mm[1] === '红' && mm[2] === '蓝' && mm[3] === '黄', JSON.stringify(mm));
  let sw = await swatches();
  check('S2-swatch-3-hex', sw.length === 3 && sw[0] === 'rgb(224, 85, 85)' && sw[1] === 'rgb(111, 199, 201)', JSON.stringify(sw));
  /* 作者统一风格对版令：染料菜单舒展行（36px/12.5px/文行比≈0.35）；Cooking 照旧 26px/12px 零污染 */
  const menuStyle = async (key) => frameEl(key).evaluate(() => {
    document.getElementById('srFootSortPop').hidden = false;
    const opt = document.querySelector('#srFootSortBody .sr-fsopt');
    const cs = getComputedStyle(opt);
    return { h: opt.offsetHeight, fs: cs.fontSize, fw: cs.fontWeight, nw: cs.whiteSpace, cls: document.getElementById('srRail').className.indexOf('sr-dyepig') >= 0 };
  });
  let ms = await menuStyle('DyePanel');
  check('S2-style-dye-airier', ms.cls && ms.h === 30 && ms.fs === '11px' && ms.nw === 'nowrap' && ms.fw === '400', JSON.stringify(ms)); /* 作者调字令：11px/30行高+nowrap */
  const btnLblD = () => frameEl('DyePanel').evaluate(() => document.getElementById('srFoodSortLbl').textContent);
  await frameEl('DyePanel').evaluate(() => { document.getElementById("srFoodSort").click(); const b3 = document.querySelector('[data-fsort="pig:3"]'); if (b3) b3.click(); });
  check('S2-label-pig', (await btnLblD()) === '红', await btnLblD());
  await frameEl('DyePanel').evaluate(() => { document.getElementById("srFoodSort").click(); const bo = document.querySelector('[data-fsort="official"]'); if (bo) bo.click(); });
  check('S2-label-back', (await btnLblD()) === '排序', await btnLblD());
  /* dyePal 缺席（C# 配置未就绪窗口）：菜单仅「默认」，钮在、零报错 */
  await page.evaluate(() => { window.__HZ_DYEPAL__ = null; });
  await pushCtx('DyePanel');
  mm = await menuItemsD();
  check('S2-menu-empty-pal', mm.length === 1 && mm[0] === '⊞默认', JSON.stringify(mm));
  const btnVisible = await frameEl('DyePanel').evaluate(() => { const b = document.getElementById('srFoodSort'); return !!b && !b.hidden; });
  check('S2-menu-empty-btn-alive', btnVisible === true, 'btn=' + btnVisible);
  /* 长板（20 色）：弹窗限高 + body overflow-y:auto → 可滚（实测 max-height 320px 生效） */
  await page.evaluate(() => {
    const pal = []; for (let i = 1; i <= 20; i++) pal.push([100 + i, '色' + i, '#e05555', 1, i]);
    window.__HZ_DYEPAL__ = pal;
  });
  await pushCtx('DyePanel');
  await page.waitForTimeout(400); /* pushCtx 后 rail 重建瞬间弹层短暂隐藏态——等装配稳定再开弹窗量滚动 */
  const scroll = await frameEl('DyePanel').evaluate(() => {
    const pop = document.getElementById('srFootSortPop');
    pop.hidden = false; /* 显式置开（前置用例的 toggle 已把弹窗留在关态——click 会再关回去量到 0） */
    const body = document.getElementById('srFootSortBody');
    return { sh: body.scrollHeight, ch: body.clientHeight, n: body.querySelectorAll('button').length };
  });
  check('S2-menu-scroll', scroll.n === 21 && scroll.sh > scroll.ch, JSON.stringify(scroll));
  await page.evaluate(() => { delete window.__HZ_DYEPAL__; });
  await pushCtx('DyePanel');

  /* ---- §4 角标（作者验收令「复用官方色素显示方案」改版）：官方同款右下水滴徽章（.dye-pts 类
     + 官方 dropSvg 原样）；无该色素=不画（suppress）；官方已画让位；右上角 <i> 数值角标不用于色素 ---- */
  const badgesD = async () => frameEl('DyePanel').evaluate(() => {
    const layer = document.getElementById('srBadgeLayer');
    const out = { drops: 0, iTotal: 0, byItem: {}, dims: 0 };
    if (!layer) return out;
    const its = [...document.querySelectorAll('.sr-gridhost .item')];
    [...layer.querySelectorAll('.dye-pts')].forEach((dp) => {
      out.drops++;
      const dl = parseFloat(dp.style.left), dt = parseFloat(dp.style.top);
      const m = its.find((it) => Math.abs((it.offsetLeft + it.offsetWidth) - dl) < 3 && Math.abs((it.offsetTop + it.offsetHeight) - dt) < 3);
      const path = dp.querySelector('.drop svg path');
      if (m) out.byItem[m.id] = { text: dp.textContent, fill: path ? path.getAttribute('fill') : null, tr: dp.style.transform };
    });
    out.iTotal = layer.querySelectorAll('i').length;
    out.dims = layer.querySelectorAll('.sr-dyedim').length;
    out.dimIds = {};
    [...layer.querySelectorAll('.sr-dyedim')].forEach((d) => {
      const dl = parseFloat(d.style.left), dt = parseFloat(d.style.top);
      const m = its.find((it) => Math.abs(it.offsetLeft - dl) < 3 && Math.abs(it.offsetTop - dt) < 3);
      if (m) out.dimIds[m.id] = 1;
    });
    return out;
  });
  await frameEl('DyePanel').evaluate(() => { document.getElementById("srFoodSort").click(); const b3 = document.querySelector('[data-fsort="pig:3"]'); if (b3) b3.click(); });
  await page.waitForTimeout(400);
  let bd = await badgesD();
  check('S4-badge-count2-candye-gate', bd.drops === 2 && bd.byItem['902'] === undefined, JSON.stringify(bd)); /* 902=canDye false 不出数（报障修） */
  check('S4-badge-905-pts5-hex', bd.byItem['905'] && bd.byItem['905'].text === '5' && bd.byItem['905'].fill === '#e05555' && bd.byItem['905'].tr.replace(/\s/g, '').indexOf('translate(-100%,-100%)') >= 0, JSON.stringify(bd.byItem['905']));
  check('S4-badge-901-pts2', bd.byItem['901'] && bd.byItem['901'].text === '2', JSON.stringify(bd.byItem['901']));
  check('S4-badge-dim-nonparticipants', bd.dimIds['903'] === 1 && bd.dimIds['902'] === 1 && bd.dimIds['904'] === 1 && bd.dimIds['906'] === 1 && bd.byItem['903'] === undefined, JSON.stringify(bd.dimIds)); /* 非参与者置灰（含 canDye=false 的 902） */
  check('S4-badge-no-topright-i', bd.iTotal === 0, 'iTotal=' + bd.iTotal);
  /* 官方让位守卫：官方自己画过 .dye-pts 的物品（提取当前色场景）——mod 不再画（零重叠） */
  await frameEl('DyePanel').evaluate(() => {
    const it = document.getElementById('905');
    if (it && !it.querySelector('.dye-pts')) { const d = document.createElement('div'); d.className = 'dye-pts'; d.textContent = '5'; it.appendChild(d); }
  });
  await page.waitForTimeout(500); /* 重绘周期后复核（观察器/重推路都会走到） */
  bd = await badgesD();
  check('S4-badge-official-yield', bd.drops === 1 && bd.byItem['905'] === undefined && bd.dimIds['905'] === undefined, 'drops=' + bd.drops + ' 905=' + JSON.stringify(bd.byItem['905'])); /* 官方已画让位且参与者不置灰 */
  await frameEl('DyePanel').evaluate(() => { const d = document.getElementById('905'); const own = d && d.querySelector('.dye-pts'); if (own) own.remove(); });
  await frameEl('DyePanel').evaluate(() => { document.getElementById("srFoodSort").click(); const bo = document.querySelector('[data-fsort="official"]'); if (bo) bo.click(); });
  await page.waitForTimeout(300);
  bd = await badgesD();
  check('S4-badge-official-clear', bd.drops === 0 && bd.iTotal === 0 && bd.dims === 0, JSON.stringify({ drops: bd.drops, i: bd.iTotal, dims: bd.dims })); /* official 复位=层整体清（置灰同拆） */

  /* ---- §5 回归（Task 5）：推包重应用 / 重开复位 official / 他页菜单零污染 / 柜行 cfg 级取值 ---- */
  /* ① 推包重应用：pig:3 排序态下改契约原始位（模拟官方推包）→ 模型仍按点数序 */
  await frameEl('DyePanel').evaluate(() => { document.getElementById('srFoodSort').click(); const b3 = document.querySelector('[data-fsort="pig:3"]'); if (b3) b3.click(); });
  await page.waitForTimeout(200);
  const mock2 = await page.evaluate(() => window.__HZ_MOCKSET__());
  mock2.items.bag = mock2.items.bag.map(function (r) { r[4] = 7 - r[4]; return r; }); /* 原始 x 全部翻转=推包后位移 */
  await page.evaluate((j) => window.__HZ_MOCKSET__(j), mock2);
  await pushCtx('DyePanel');
  await page.waitForTimeout(400);
  pos = await gridPos();
  check('S5-repush-reapply', JSON.stringify(pos.map((p) => p.id)) === JSON.stringify([905, 901, 902, 903, 904, 906]), JSON.stringify(pos.map((p) => p.id)));

  /* ② 重开复位：重载 iframe=真实「关掉重开」（游戏关面板销毁帧；harness showScene 切换
     帧存活≠游戏路径，见台账）→ fsort 复位 official（v1.8.5 退役口径不复活） */
  await page.evaluate(() => { const f = document.getElementById('DyePanel'); f.src = f.src; });
  await page.waitForTimeout(1200);
  await pushCtx('DyePanel');
  await showScene('DyePanel');
  await page.waitForTimeout(600);
  check('S5-reopen-reset', (await btnLblD()) === '排序', 'lbl=' + await btnLblD());

  /* ③ 他页菜单零污染：BrewPanel 2 项 / Cooking 7 项（v14.1 与 FSORTS 原样） */
  await showScene('BrewPanel');
  await pushCtx('BrewPanel');
  const brewMenu = await frameEl('BrewPanel').evaluate(() => {
    document.getElementById('srFoodSort').click();
    return [...document.querySelectorAll('#srFootSortBody button')].map((b) => b.textContent.trim());
  });
  check('S5-menu-isolation-brew', brewMenu.length === 2 && brewMenu[1] === '🍗饱腹度', JSON.stringify(brewMenu));
  await showScene('Cooking');
  await pushCtx('Cooking');
  const cookMenu = await frameEl('Cooking').evaluate(() => {
    document.getElementById('srFoodSort').click();
    return [...document.querySelectorAll('#srFootSortBody button')].map((b) => b.textContent.trim());
  });
  check('S5-menu-isolation-cook', cookMenu.length === 7 && cookMenu[6] === '🕐保质期', JSON.stringify(cookMenu));
  const msCook = await frameEl('Cooking').evaluate(() => {
    document.getElementById('srFootSortPop').hidden = false;
    const opt = document.querySelector('#srFootSortBody .sr-fsopt');
    return { h: opt.offsetHeight, fs: getComputedStyle(opt).fontSize, cls: document.getElementById('srRail').className.indexOf('sr-dyepig') >= 0 };
  });
  check('S5-style-cook-untouched', !msCook.cls && msCook.h === 26 && msCook.fs === '12px', JSON.stringify(msCook));

  /* ④ 柜行 cfg 级取值：items['900101']（食材柜）cfg1 行红 2 点——柜子 owner 排序的取值底座
     （端到端切柜排序=实机冒烟覆盖，见台账 Task 5 Ruling） */
  await pushCtx('DyePanel');
  check('S5-ctn-row-points', await pigCall('points({cfgId:1},3)') === 2, 'got ' + await pigCall('points({cfgId:1},3)'));

  /* 尾部：零 error */
  check('Z-console-clean', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 200));
  check('Z-pageerror-clean', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 200));

  await browser.close();
  const fails = results.filter((r) => !r.ok).length;
  console.log(fails === 0 ? 'ALL PASS (' + results.length + ')' : fails + ' FAIL / ' + results.length);
  process.exit(fails === 0 ? 0 : 1);
})();
