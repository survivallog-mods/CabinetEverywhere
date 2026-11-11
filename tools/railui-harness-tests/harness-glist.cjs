/* 竖版全局物品栏 harness（global-storage-list v1.9.0 plan；serve.cjs 须已在 8180）。
   §聚合（Task 1）：glistAggregate 纯函数——同名合并（timeLeft/flags 任异不合并）/srcs 背包恒首/
   Heater 热值降序+非燃料隐藏/Dye 主色=最高点数（官方 mainPoints 口径）+无色素隐藏/300 截断。
   自检口 window.__CERAIL__.glist = { GLIST, aggregate(sceneKey) }（dyePig/brewTier 先例）。
   后续节（装配/渲染/交互/染料预设/暖炉预设/门）随任务追加。尾部：零 console error / pageerror。 */
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
  const BASE_MOCK = await page.evaluate(() => JSON.parse(JSON.stringify(window.__HZ_MOCKSET__()))); /* 基线快照，各块自复位 */
  const agg = async (key) => {
    const r = await page.evaluate((k) => {
      var g = window.__CERAIL__.glist;
      if (!g) return null;
      return JSON.parse(JSON.stringify(g.aggregate(k)));
    }, key);
    return r || { rows: [], hiddenCount: -1, truncated: false }; /* 缺口=全 FAIL 的安全形状 */
  };
  const setMockItems = async (items, ctnFilter) => page.evaluate(({ items, ctnFilter, base }) => {
    const m = JSON.parse(JSON.stringify(base));
    m.items = items;
    if (ctnFilter) m.ctn = m.ctn.filter((c) => ctnFilter.includes(c[0]));
    window.__HZ_MOCKSET__(m);
  }, { items, ctnFilter, base: BASE_MOCK });

  /* ---- §聚合 A1-A3：同名合并判据（DyePanel；cfg1 生态香米 pig=[[3,2],[5,1]] 有色素可见）---- */
  await setMockItems({
    bag: [[901, 1, 5, 7200, 0, 0, 1, 1, 0]],
    '900101': [[911, 1, 3, 7200, 0, 0, 1, 1, 0]],
    '900102': [[915, 1, 2, 7200, 0, 0, 1, 1, 0]]
  }, [900101, 900102]);
  await pushCtx('DyePanel');
  let a = await agg('DyePanel');
  check('A1-merge-one-row', a !== 'NOGLIST' && a.rows.length === 1 && a.rows[0].cfg === 1 && a.rows[0].total === 10,
    'rows=' + JSON.stringify(a.rows && a.rows.map((r) => [r.cfg, r.total])));
  check('A1-srcs-bag-first', !!a.rows && a.rows.length === 1 && a.rows[0].srcs.length === 3 &&
    a.rows[0].srcs[0][0] === 'bag' && a.rows[0].srcs[0][1] === '背包' && a.rows[0].srcs[0][2] === 5 &&
    a.rows[0].srcs[1][0] === '900101' && a.rows[0].srcs[2][2] === 2,
    'srcs=' + JSON.stringify(a.rows[0] && a.rows[0].srcs));
  check('A1-name-ico-from-icfg', !!a.rows[0] && a.rows[0].name === '生态香米' && typeof a.rows[0].ico === 'string' && a.rows[0].ico.length > 0,
    'name=' + (a.rows[0] && a.rows[0].name));

  await setMockItems({
    bag: [[901, 1, 5, 7200, 0, 0, 1, 1, 0]],
    '900101': [[911, 1, 3, 10800, 0, 0, 1, 1, 0]]
  }, [900101]);
  await pushCtx('DyePanel');
  a = await agg('DyePanel');
  check('A2-timeleft-merge', a.rows.length === 1, 'rows=' + a.rows.length); /* 实机批改：保鲜余量非属性差，不拆行 */

  await setMockItems({
    bag: [[901, 1, 5, 7200, 0, 0, 1, 1, 0]],
    '900101': [[911, 1, 3, 7200, 0, 0, 1, 1, 4]]
  }, [900101]);
  await pushCtx('DyePanel');
  a = await agg('DyePanel');
  check('A3-flags-merge', a.rows.length === 1, 'rows=' + a.rows.length); /* 实机批改：flags(新获得位等)非属性差，不拆行 */

  await setMockItems({
    bag: [[901, 1, 5, 0, 0, 0, 1, 1, 0, null, null, null, null, null, null, '']],
    '900101': [[911, 1, 3, 0, 0, 0, 1, 1, 0, null, null, null, null, null, null, '7|0|0|0|0']]
  }, [900101]);
  await pushCtx('DyePanel');
  a = await agg('DyePanel');
  check('A2b-attrsig-split', a.rows.length === 2, 'rows=' + a.rows.length); /* attrSig（原始随机词条 InstanceVD）异=真属性差→拆行 */

  /* A2d（三追彻底性）：s 值异（s 值乘了使用次数=瞬态）同 attrSig → 必须一行——吃几口不裂行 */
  await setMockItems({
    bag: [[901, 1, 5, 0, 0, 0, 1, 1, 0, 84, null, null, null, null, null, ''],
          [902, 1, 3, 0, 1, 0, 1, 1, 0, 28, null, null, null, null, null, '']]
  }, null);
  await pushCtx('DyePanel');
  a = await agg('DyePanel');
  check('A2d-s-transient-merge', a.rows.length === 1 && a.rows[0].total === 8, 'rows=' + JSON.stringify(a.rows.map((r) => r.total)));

  /* V2（作者 v2 终案）：uses 维度——同名同次数并/异次数拆（非料理食物/药物/书籍同口径） */
  await setMockItems({
    bag: [[901, 1, 1, 0, 0, 0, 1, 1, 0, null, null, null, null, null, null, '', 3],
          [902, 1, 2, 0, 1, 0, 1, 1, 0, null, null, null, null, null, null, '', 3],
          [903, 1, 1, 0, 2, 0, 1, 1, 0, null, null, null, null, null, null, '', 1]]
  }, null);
  await pushCtx('DyePanel');
  a = await agg('DyePanel');
  check('V2-uses-merge-split', a.rows.length === 2 && a.rows[0].total === 3 && a.rows[1].total === 1,
    'rows=' + JSON.stringify(a.rows.map((r) => [r.name, r.total]))); /* 同名同 u3 并 x3；u1 拆 */

  /* V3：料理=uses+attrSig 双维（同双并/任一异拆） */
  await setMockItems({
    bag: [[901, 8, 1, 0, 0, 0, 1, 1, 0, null, null, null, null, null, null, '10|2|0|0|0', 3],
          [902, 8, 1, 0, 1, 0, 1, 1, 0, null, null, null, null, null, null, '10|2|0|0|0', 3],
          [903, 8, 1, 0, 2, 0, 1, 1, 0, null, null, null, null, null, null, '10|2|0|0|0', 1],
          [904, 8, 1, 0, 3, 0, 1, 1, 0, null, null, null, null, null, null, '7|0|0|0|0', 3]]
  }, null);
  await pushCtx('DyePanel');
  a = await agg('DyePanel');
  check('V3-dish-dual-key', a.rows.length === 3, 'rows=' + a.rows.length); /* 同双并；u 异拆；attr 异拆 */

  /* A2c（实机批改#1 续）：同名异 cfg（自制/拾取变体类）→ 必须一行（真凶=旧键以 cfg 为主键） */
  await page.evaluate((base) => {
    const m = JSON.parse(JSON.stringify(base));
    m.icfg = m.icfg.concat([[21, '生态香米', '#ico#v21', 12, 99, 1, 1, '食材', 0, 15, 0, 0, 0, 0]]);
    m.items = { bag: [[901, 1, 4, 0, 0, 0, 1, 1, 0], [921, 21, 6, 0, 1, 0, 1, 1, 0]] };
    m.ctn = [];
    window.__HZ_DYEPIG__ = { 1: '[[3,2],[5,1]]', 21: '[[3,2]]' }; /* 变体同给色素，别被场景预置隐藏吃掉 */
    window.__HZ_MOCKSET__(m);
  }, BASE_MOCK);
  await pushCtx('DyePanel');
  a = await agg('DyePanel');
  check('A2c-samename-diffcfg-merge', a.rows.length === 1 && a.rows[0].total === 10, 'rows=' + JSON.stringify(a.rows.map((r) => [r.name, r.total])));
  await page.evaluate(() => { delete window.__HZ_DYEPIG__; });

  /* ---- §聚合 A4：Heater 热值降序 + 非燃料隐藏（FB 尾列 cfg10 木柴 1/600、cfg11 柴油 1/900）---- */
  await setMockItems({
    bag: [[901, 10, 12, 0, 0, 0, 1, 1, 0], [902, 12, 5, 0, 1, 0, 1, 1, 0]],
    '900105': [[921, 11, 20, 0, 0, 0, 1, 1, 0], [922, 10, 36, 0, 1, 0, 1, 1, 0], [923, 12, 7, 0, 2, 0, 1, 1, 0]],
    '900106': [[924, 10, 12, 0, 0, 0, 1, 1, 0]]
  }, [900105, 900106]);
  await pushCtx('Heater');
  a = await agg('Heater');
  check('A4-heat-desc', a.rows.length === 2 && a.rows[0].cfg === 11 && a.rows[0].badge.v === 900 &&
    a.rows[1].cfg === 10 && a.rows[1].badge.v === 600,
    'rows=' + JSON.stringify(a.rows.map((r) => [r.cfg, r.badge.v])));
  check('A4-merge-total-srcs', a.rows.length === 2 && a.rows[1].total === 60 && a.rows[1].srcs.length === 3 && a.rows[1].srcs[0][2] === 12,
    'total=' + (a.rows[1] && a.rows[1].total) + ' srcs=' + JSON.stringify(a.rows[1] && a.rows[1].srcs));
  check('A4-nonfuel-hidden', a.hiddenCount === 1 && a.rows.every((r) => r.fuel === true),
    'hidden=' + a.hiddenCount + ' fuels=' + JSON.stringify(a.rows.map((r) => r.fuel)));

  /* ---- §聚合 A5：Dye 主色=最高点数（cfg1 [[3,2],[5,1]]→红3/2点；cfg8 [[3,5]]→红3/5点；
     cfg2 '[]' 无色素隐藏；dyePal 默认板 hex 对位）---- */
  await setMockItems({
    bag: [[901, 1, 4, 0, 0, 0, 1, 1, 0], [902, 8, 2, 0, 1, 0, 1, 1, 0], [903, 2, 6, 0, 2, 0, 1, 1, 0]]
  }, null);
  await pushCtx('DyePanel');
  a = await agg('DyePanel');
  check('A5-main-color-max', a.rows.length === 2 && a.rows[0].cfg === 8 && a.rows[0].colorId === 3 &&
    a.rows[0].mainPts === 5 && a.rows[1].cfg === 1 && a.rows[1].mainPts === 2 && a.rows[1].colorId === 3,
    'rows=' + JSON.stringify(a.rows.map((r) => [r.cfg, r.colorId, r.mainPts])));
  check('A5-badge-hex-from-dyepal', a.rows.length === 2 && a.rows[0].badge.hex === '#e05555' && a.rows[0].badge.v === 5,
    'badge=' + JSON.stringify(a.rows[0] && a.rows[0].badge));
  check('A5-nopig-hidden', a.hiddenCount === 1, 'hidden=' + a.hiddenCount);

  /* ---- §聚合 A6：>300 种截断（320 cfg 全带色素 [[3,1]]，背包单叠各 1）---- */
  await page.evaluate(() => {
    const N = 320, icfg = [], bag = [], PG = {};
    for (let i = 1; i <= N; i++) {
      icfg.push([i, 'G' + i, '#ico#v' + i, 1, 99, 1, 1, '食材', 0, 0, 0, 0, 0, 0]);
      bag.push([900000 + i, i, 1, 0, i % 12, Math.floor(i / 12), 1, 1, 0]);
      PG[i] = '[[3,1]]';
    }
    window.__HZ_DYEPIG__ = PG;
    window.__HZ_MOCKSET__({ rev: 1, ctx: {}, bag: 1, ctn: [], lib: [], icfg, items: { bag } });
  });
  await pushCtx('DyePanel');
  a = await agg('DyePanel');
  check('A6-truncate-300', a.rows.length === 300 && a.truncated === true && a.hiddenCount === 0,
    'rows=' + a.rows.length + ' truncated=' + a.truncated);
  await page.evaluate(() => { delete window.__HZ_DYEPIG__; });

  /* ---- §聚合 RB-A（rat-brew glist Task1）：RatCage sat——s1>0 筛选/s1 降序/同值并/同名异值拆行 ---- */
  await page.evaluate(() => { window.__HZ_GLISTON__ = true; window.__HZ_RBICFG__ = true; }); /* 夹具显式开（旧套件零污染） */
  await setMockItems({
    bag: [
      [901, 2, 2, 7200, 0, 0, 1, 1, 0, 38, 2],
      [902, 1, 5, 7200, 1, 0, 1, 1, 0, 15, null],
      [903, 3, 1, 0, 2, 0, 1, 1, 0, null, 5],
      [904, 4, 1, 0, 3, 0, 1, 1, 0, null, null],
      [905, 7, 1, 0, 4, 0, 1, 1, 0, 0, null]
    ],
    '900101': [[911, 1, 3, 86400, 0, 0, 1, 1, 0, 15, null]]
  }, [900101]);
  await pushCtx('RatCage');
  a = await agg('RatCage');
  check('RB-A1-sat-filter-sort', a.rows.length === 2 && a.rows[0].cfg === 2 && a.rows[0].badge.v === 38 &&
    a.rows[1].cfg === 1 && a.rows[1].badge.v === 15 && a.hiddenCount === 3,
    'rows=' + JSON.stringify(a.rows.map((r) => [r.cfg, r.badge && r.badge.v])) + ' hidden=' + a.hiddenCount + '（null/0 两态都藏）');
  check('RB-A2-sat-merge-sameval', a.rows.length === 2 && a.rows[1].total === 8 && a.rows[1].srcs.length === 2 &&
    a.rows[1].srcs[0][0] === 'bag' && a.rows[1].srcs[0][2] === 5 && a.rows[1].srcs[1][2] === 3,
    'row1=' + JSON.stringify(a.rows[1] && [a.rows[1].total, a.rows[1].srcs]));
  await setMockItems({
    bag: [
      [921, 21, 2, 0, 0, 0, 1, 1, 0, 40, 9],
      [922, 22, 3, 0, 1, 0, 1, 1, 0, 20, 2]
    ]
  }, []);
  await pushCtx('RatCage');
  a = await agg('RatCage');
  check('RB-A3-sat-split-key', a.rows.length === 2 && a.rows.every((r) => r.name === '蒜蓉西兰花') &&
    a.rows[0].badge.v === 40 && a.rows[0].total === 2 && a.rows[1].badge.v === 20 && a.rows[1].total === 3,
    'rows=' + JSON.stringify(a.rows.map((r) => [r.cfg, r.badge && r.badge.v, r.total])));

  /* ---- §聚合 RB-B（rat-brew glist Task1）：BrewPanel brew——bw 门/纯 s1 序（品质不进排序键）/
     tier 三档（P1=0/P2=0.5：负密度=劣、0~0.5=普、≥0.5=烈）/s2 null→密度 0/同 s1 异 s2 拆行 ---- */
  await setMockItems({
    bag: [
      [901, 2, 2, 0, 0, 0, 1, 1, 0, 38, 2],
      [902, 1, 1, 0, 1, 0, 1, 1, 0, 15, 30],
      [903, 3, 1, 0, 2, 0, 1, 1, 0, 25, -4],
      [904, 4, 1, 0, 3, 0, 1, 1, 0, 20, 1],
      [921, 21, 1, 0, 4, 0, 1, 1, 0, 40, 9]
    ]
  }, []);
  await pushCtx('BrewPanel');
  a = await agg('BrewPanel');
  check('RB-B1-brew-filter-sort', a.rows.length === 3 && a.hiddenCount === 2 &&
    a.rows[0].cfg === 2 && a.rows[1].cfg === 3 && a.rows[2].cfg === 1,
    'rows=' + JSON.stringify(a.rows.map((r) => [r.cfg, r.badge && r.badge.v])) + ' hidden=' + a.hiddenCount);
  check('RB-B2-brew-tier', a.rows.length === 3 && a.rows[0].badge.tier === 1 /* 2/38 普 */ &&
    a.rows[1].badge.tier === 0 /* -4/25 劣 */ && a.rows[2].badge.tier === 2 /* 30/15 烈 */,
    'tiers=' + JSON.stringify(a.rows.map((r) => r.badge && r.badge.tier)));
  await setMockItems({ bag: [[905, 7, 1, 0, 0, 0, 1, 1, 0, 10, null]] }, []);
  await pushCtx('BrewPanel');
  a = await agg('BrewPanel');
  check('RB-B3-brew-s2null-density0', a.rows.length === 1 && a.rows[0].badge.tier === 1 /* 0/10：P1=0 → 非<0 → 普 */,
    'tier=' + JSON.stringify(a.rows[0] && a.rows[0].badge && a.rows[0].badge.tier));
  await setMockItems({
    bag: [
      [901, 2, 1, 0, 0, 0, 1, 1, 0, 38, 2],
      [906, 2, 1, 0, 1, 0, 1, 1, 0, 38, 30]
    ]
  }, []);
  await pushCtx('BrewPanel');
  a = await agg('BrewPanel');
  check('RB-B4-brew-split-s2', a.rows.length === 2 && a.rows[0].badge.tier === 1 && a.rows[1].badge.tier === 2 &&
    a.rows.every((r) => r.name === '烤肉'),
    'rows=' + JSON.stringify(a.rows.map((r) => [r.badge && r.badge.v, r.badge && r.badge.tier])) + '（s1 并列=先见序稳定，spec 并列稳定条款）');
  await page.evaluate(() => { delete window.__HZ_RBICFG__; delete window.__HZ_GLISTON__; }); /* 两钮皆还（B5/B6 拆净断言依赖缺省态） */

  /* ---- §装配 B1-B6（Task 2）：两页挂载/互切/幂等/防自激/拆净/循环 ---- */
  const showScene = async (key) => {
    await page.getByRole('button', { name: key, exact: true }).click();
    await page.waitForFunction((k) => {
      for (let i = 0; i < window.frames.length; i++) {
        try {
          const d = window.frames[i].document;
          if (!window.frames[i].location.href.includes('/' + k + '.html')) continue;
          if (d.readyState !== 'complete') continue;
          return true;
        } catch (e) { }
      } return false;
    }, key, { timeout: 9000 });
  };
  const frameDoc = (key) => page.frames().find((f) => f.url().includes('/fixtures/' + key + '.html'));
  const glistOn = (key, on) => page.evaluate(({ key, on }) => {
    window.__HZ_GLIST__ = window.__HZ_GLIST__ || {};
    if (on) window.__HZ_GLIST__[key] = true; else delete window.__HZ_GLIST__[key];
  }, { key, on });
  const scan = () => page.evaluate(() => window.__CERAIL__.scan());
  const gwait = (key) => page.waitForFunction((k) => {
    for (let i = 0; i < window.frames.length; i++) {
      try {
        const d = window.frames[i].document;
        if (!window.frames[i].location.href.includes('/' + k + '.html')) continue;
        if (d.getElementById('srgPanel') && d.getElementById('srgPanel').isConnected) return true;
      } catch (e) { }
    } return false;
  }, key, { timeout: 9000 }).catch(() => false); /* 未装配=超时不抛，让断言自然 FAIL（RED 友好） */
  const hostHtml = async (key) => {
    const d = frameDoc(key);
    return d.evaluate((k) => {
      const doc = document;
      let host = null;
      if (k === 'Heater') host = doc.querySelector('.heater-system > .panel:not(.heater-panel)');
      else { const r = doc.getElementById('srRail'); host = r ? r.parentNode : null; }
      return host ? host.innerHTML : 'NOHOST';
    }, key);
  };

  /* 命令出口间谍（B/C/D 各节共用——v2.2.1 前移定义：RB-C idetail 断言先于 D 节使用） */
  const cmdSpy = (fn) => page.evaluate(() => {
    window.__HZ_CMD__ = [];
    const orig = window.__CERAIL__.cmd;
    window.__HZ_CMD_RESTORE__ = () => { window.__CERAIL__.cmd = orig; };
    window.__CERAIL__.cmd = (op, payload) => { window.__HZ_CMD__.push([op, payload]); return orig.call(window.__CERAIL__, op, payload); };
  }).then(() => fn()).then((r) => page.evaluate(() => window.__HZ_CMD_RESTORE__()).then(() =>
    page.evaluate(() => window.__HZ_CMD__).then((calls) => ({ r, calls }))));

  /* 恢复基线 MOCK（A 系列改过）并给两页一个正常数据底座 */
  await page.evaluate((base) => window.__HZ_MOCKSET__(base), BASE_MOCK);

  for (const KEY of ['DyePanel', 'Heater']) {
    await showScene(KEY);
    const snapBefore = await hostHtml(KEY);            /* 装配前宿主快照（拆净对账基线） */
    await glistOn(KEY, true); await scan(); await gwait(KEY);
    const d = frameDoc(KEY);
    const segs = await d.evaluate(() => ['srgHead', 'srgToggle', 'srgSearch', 'srgChips', 'srgHint', 'srgList', 'srgFootL', 'srgFootR']
      .map((id) => !!document.getElementById(id)));
    check('B1-' + KEY + '-six-segments', segs.every(Boolean), 'segs=' + JSON.stringify(segs));
    check('B1-' + KEY + '-title', await d.evaluate(() => {
      const t = document.querySelector('#srgHead .srg-title');
      return !!(t && t.textContent.indexOf('全局物品栏') >= 0 && t.textContent.indexOf('背包 + 整屋柜子') >= 0);
    }), '');

    /* B2 互切：列表态=田字格 svg；切格子=srgPanel 隐、现行视图可见；图标☰；切回 */
    const clickIf = async (sel) => { try { await d.click(sel, { timeout: 800 }); return true; } catch (e) { return false; } };
    check('B2-' + KEY + '-icon-grid-svg', await d.evaluate(() => !!document.querySelector('#srgToggle svg rect')), '');
    const c1 = await clickIf('#srgToggle');
    await page.waitForTimeout(60);
    const gridVis = await d.evaluate((k) => {
      const p = document.getElementById('srgPanel');
      /* 2026-11-12 rail 化：Heater 格子态=官方格在 rail 壳内（官方 .panel 已被 #srp 替换） */
      const cur = document.getElementById('backpackGrid') || document.getElementById('srRail');
      return { gridmode: !!p && p.classList.contains('srg-gridmode'), curShown: !!cur && cur.offsetParent !== null, iconList: (document.getElementById('srgToggle').textContent || '').trim() === '☰' };
    }, KEY).catch(() => ({ gridmode: false, curShown: false, iconList: false }));
    check('B2-' + KEY + '-grid-mode', c1 && gridVis.gridmode && gridVis.curShown && gridVis.iconList,
      'clicked=' + c1 + ' ' + JSON.stringify(gridVis));
    check('B2-' + KEY + '-view-memory', c1 && await page.evaluate((k) => {
      try { return localStorage.getItem('srp_glist_view_' + k) === 'grid'; } catch (e) { return false; }
    }, KEY), '');
    const c2 = c1 ? await clickIf('#srgToggle') : false;
    await page.waitForTimeout(60);
    check('B2-' + KEY + '-back-to-list', c2 && await d.evaluate(() => {
      const p = document.getElementById('srgPanel');
      return !!p && !p.classList.contains('srg-gridmode') && !!document.querySelector('#srgToggle svg rect');
    }).catch(() => false), '');

    /* B3 幂等：连扫 3 次签名不变 */
    const sig1 = await d.evaluate(() => { const p = document.getElementById('srgPanel'); return p ? p.outerHTML : 'NOPANEL'; }).catch(() => 'NOPANEL');
    await scan(); await scan(); await scan();
    const sig2 = await d.evaluate(() => { const p = document.getElementById('srgPanel'); return p ? p.outerHTML : 'NOPANEL'; }).catch(() => 'NOPANEL');
    check('B3-' + KEY + '-idempotent', sig1 !== 'NOPANEL' && sig1 === sig2, sig1 === sig2 ? '' : 'sig ' + sig1.slice(0, 12) + '→' + sig2.slice(0, 12));

    /* B4 防自激：落定后 5 轮 scan 零 srg 写 */
    await page.evaluate(() => { try { window.__CERAIL__.glist.writes(0); return true; } catch (e) { return false; } });
    for (let i = 0; i < 5; i++) await scan();
    const w = await page.evaluate(() => { try { return window.__CERAIL__.glist.writes(); } catch (e) { return -1; } });
    check('B4-' + KEY + '-no-write-loop', w === 0, 'writes=' + w);

    /* B5 拆净（责任面断言：无 srg 节点 + 被 glist 隐过的元素全还原 + 格网视图恢复；
       innerHTML 全等被 bagtabs 高度守护/rail stubs 周期写污染，不属 glist 责任面——ruling） */
    await glistOn(KEY, false); await scan(); await page.waitForTimeout(60);
    const torn = await d.evaluate((k) => {
      let host = null;
      if (k === 'Heater') host = document.querySelector('.heater-system > .panel:not(.heater-panel)');
      else { const r = document.getElementById('srRail'); host = r ? r.parentNode : null; }
      const noPanel = !document.getElementById('srgPanel');
      const noMark = !host || Array.from(host.children).every((el) => el.__srgPrevD === undefined);
      const cur = k === 'Heater' ? document.getElementById('backpackGrid') : document.getElementById('srRail');
      return { noPanel, noMark, curShown: !!cur && cur.offsetParent !== null };
    }, KEY).catch(() => ({ noPanel: false, noMark: false, curShown: false }));
    check('B5-' + KEY + '-teardown-clean', torn.noPanel && torn.noMark, JSON.stringify(torn));
    check('B5-' + KEY + '-grid-restored', torn.curShown, '');

    /* B6 三开三关循环无残留（同 B5 责任面断言） */
    for (let i = 0; i < 3; i++) { await glistOn(KEY, true); await scan(); await gwait(KEY); await glistOn(KEY, false); await scan(); await page.waitForTimeout(40); }
    const cycled = await d.evaluate((k) => {
      let host = null;
      if (k === 'Heater') host = document.querySelector('.heater-system > .panel:not(.heater-panel)');
      else { const r = document.getElementById('srRail'); host = r ? r.parentNode : null; }
      return !document.getElementById('srgPanel') && (!host || Array.from(host.children).every((el) => el.__srgPrevD === undefined));
    }, KEY).catch(() => false);
    check('B6-' + KEY + '-cycle-clean', cycled, '');
    await page.evaluate((k) => { try { localStorage.removeItem('srp_glist_view_' + k); } catch (e) { } }, KEY); /* 清视图记忆防串后续块 */
  }

  /* ---- §渲染 C1-C7（Task 3）：行结构/来源折叠/搜索/空态/截断页脚/色点/火苗 ---- */
  const glistReady = async (KEY) => { await glistOn(KEY, true); await scan(); await gwait(KEY); await page.waitForTimeout(60); };

  /* C1 染料行结构（cfg8 草药 pts5 首行；cfg1 背包+食材柜合并 x7）+ C7 色点 */
  await setMockItems({
    bag: [[901, 1, 4, 0, 0, 0, 1, 1, 0], [902, 8, 2, 0, 1, 0, 1, 1, 0], [903, 2, 6, 0, 2, 0, 1, 1, 0]],
    '900101': [[911, 1, 3, 0, 0, 0, 1, 1, 0]]
  }, [900101]);
  await pushCtx('DyePanel');
  await showScene('DyePanel'); await glistReady('DyePanel');
  {
    const d = frameDoc('DyePanel');
    const rows = await d.evaluate(() => Array.from(document.querySelectorAll('.srg-row')).map((r) => ({
      name: (r.querySelector('.srg-name') || {}).textContent,
      src: (r.querySelector('.srg-src') || {}).textContent,
      cnt: (r.querySelector('.srg-count') || {}).textContent,
      badgeSvg: !!r.querySelector('.srg-badge svg path'),
      cdot: r.querySelector('.srg-cdot') ? r.querySelector('.srg-cdot').style.background : ''
    })));
    check('C1-dye-row-count', rows.length === 2, 'rows=' + rows.length);
    check('C1-dye-first-row', rows[0] && rows[0].name === '草药' && rows[0].cnt === 'x2' && rows[0].badgeSvg,
      JSON.stringify(rows[0]));
    check('C1-dye-merge-row', rows[1] && rows[1].name === '生态香米' && rows[1].cnt === 'x7' &&
      rows[1].src.indexOf('背包×4') >= 0 && rows[1].src.indexOf('食材柜×3') >= 0,
      JSON.stringify(rows[1]));
    check('C1-dye-bag-gold', await d.evaluate(() => {
      const s = document.querySelectorAll('.srg-row')[1] && document.querySelectorAll('.srg-row')[1].querySelector('.srg-src .bag');
      return !!s && s.textContent === '背包';
    }).catch(() => false), '');
    const foot = await d.evaluate(() => ({ l: document.getElementById('srgFootL') ? document.getElementById('srgFootL').textContent : '', r: document.getElementById('srgFootR') ? document.getElementById('srgFootR').textContent : '' })).catch(() => ({ l: '', r: '' }));
    check('C1-dye-footer', foot.l.indexOf('2') >= 0 && foot.l.indexOf('9') >= 0 && foot.l.indexOf('（含背包）') >= 0 && foot.r.indexOf('已按预设隐藏 1 种无色素物品') >= 0,
      JSON.stringify(foot));
    check('C7-dye-cdot-hex', rows[0] && rows[0].cdot.indexOf('rgb(224, 85, 85)') >= 0, 'cdot=' + (rows[0] && rows[0].cdot));
  }

  /* C2/C3/C4/C5/C7 暖炉：来源折叠>3、搜索、清空、空态、火苗 */
  await setMockItems({
    bag: [[901, 10, 12, 0, 0, 0, 1, 1, 0], [902, 11, 5, 0, 1, 0, 1, 1, 0]],
    '900101': [[911, 10, 8, 0, 0, 0, 1, 1, 0]],
    '900105': [[921, 10, 36, 0, 0, 0, 1, 1, 0]],
    '900106': [[924, 10, 12, 0, 0, 0, 1, 1, 0]]
  }, [900101, 900105, 900106]);
  await pushCtx('Heater');
  await showScene('Heater'); await glistReady('Heater');
  {
    const d = frameDoc('Heater');
    const fold = await d.evaluate(() => {
      const r0 = document.querySelectorAll('.srg-row')[0]; /* 柴油 900 在前 */
      const r1 = document.querySelectorAll('.srg-row')[1]; /* 木柴 600 四来源 */
      if (!r0 || !r1) return null;
      return { r0src: (r0.querySelector('.srg-src') || {}).textContent, r1src: (r1.querySelector('.srg-src') || {}).textContent, r1fuel: !!r1.querySelector('.srg-ico.is-fuel') };
    }).catch(() => null);
    if (!fold) { check('C2-heat-src-fold', false, 'no rows'); check('C7-heat-flame', false, ''); }
    else {
    check('C2-heat-src-fold', fold.r1src.indexOf('等 4 处') >= 0 && fold.r1src.indexOf('柴油储存') < 0 && fold.r1src.indexOf('背包×12') >= 0, fold.r1src);
    check('C7-heat-flame', fold.r1fuel === true, '');
    }
    check('C3-search-filter', await (async () => {
      await d.fill('#srgQ', '木');
      await page.waitForTimeout(80);
      const names = await d.evaluate(() => Array.from(document.querySelectorAll('.srg-row .srg-name')).map((n) => n.textContent)).catch(() => null);
      const foot = await d.evaluate(() => document.getElementById('srgFootL') ? document.getElementById('srgFootL').textContent : '').catch(() => '');
      if (names === null) return false;
      return names.length === 1 && names[0] === '木柴' && foot.indexOf('1') >= 0 && foot.indexOf('68') >= 0;
    })(), '');
    check('C4-search-clear', await (async () => {
      await d.fill('#srgQ', '');
      await page.waitForTimeout(80);
      return await d.evaluate(() => document.querySelectorAll('.srg-row').length === 2).catch(() => false);
    })(), '');
    check('C5-empty-state', await (async () => {
      await d.fill('#srgQ', 'zzz');
      await page.waitForTimeout(80);
      const t = await d.evaluate(() => { const e = document.querySelector('.srg-empty'); return e ? e.textContent : ''; }).catch(() => '');
      await d.fill('#srgQ', '');
      return t === '无匹配物品';
    })(), '');
    const footR = await d.evaluate(() => document.getElementById('srgFootR') ? document.getElementById('srgFootR').textContent : '').catch(() => '');
    check('C2-heat-hidden-hint', footR.indexOf('非燃料 0') < 0 && footR === '', 'footR=' + footR); /* 本 mock 无非燃料 */
  }

  /* C6 截断页脚（320 cfg 色素全 1） */
  await page.evaluate(() => {
    const N = 320, icfg = [], bag = [], PG = {};
    for (let i = 1; i <= N; i++) {
      icfg.push([i, 'G' + i, '#ico#v' + i, 1, 99, 1, 1, '食材', 0, 0, 0, 0, 0, 0]);
      bag.push([900000 + i, i, 1, 0, i % 12, Math.floor(i / 12), 1, 1, 0]);
      PG[i] = '[[3,1]]';
    }
    window.__HZ_DYEPIG__ = PG;
    window.__HZ_MOCKSET__({ rev: 1, ctx: {}, bag: 1, ctn: [], lib: [], icfg, items: { bag } });
  });
  await pushCtx('DyePanel');
  await page.waitForTimeout(120);
  {
    const d = frameDoc('DyePanel');
    check('C6-trunc-footer', await d.evaluate(() => document.querySelectorAll('.srg-row').length === 300 &&
      (document.getElementById('srgFootR') ? document.getElementById('srgFootR').textContent : '').indexOf('已截断显示前 300 种') >= 0).catch(() => false), '');
  }
  await page.evaluate(() => { delete window.__HZ_DYEPIG__; window.__HZ_GLIST__ = {}; });

  /* ---- §渲染 RB-C（rat-brew glist Task2）：排序牌/角标（rat 绿🍗·brew 瓶图+档色）/页脚隐藏计数/详情属性行 ---- */
  await setMockItems({
    bag: [
      [901, 2, 2, 7200, 0, 0, 1, 1, 0, 38, 2],
      [904, 4, 1, 0, 3, 0, 1, 1, 0, null, null]
    ]
  }, []);
  await showScene('RatCage');
  await glistOn('RatCage', true); await scan(); await gwait('RatCage');
  await pushCtx('RatCage');
  {
    const d = frameDoc('RatCage');
    const plaque = await d.evaluate(() => { const p = document.querySelector('#srgChips .srg-plaque'); return p ? p.textContent : ''; });
    check('RB-C1-sat-plaque', plaque === '🍗 按饱腹度 ↓', 'plaque=' + plaque);
    const badge = await d.evaluate(() => { const b = document.querySelector('#srgList .srg-row .srg-badge'); return b ? { txt: b.textContent, color: getComputedStyle(b).color, cls: b.className } : null; });
    check('RB-C2-sat-badge', !!badge && badge.txt.indexOf('🍗') >= 0 && badge.txt.indexOf('38') >= 0 && /143,\s*192,\s*110/.test(badge.color) && /srg-sat/.test(badge.cls),
      'badge=' + JSON.stringify(badge));
    const footR = await d.evaluate(() => document.getElementById('srgFootR').textContent);
    check('RB-C3-sat-foot-hidden', footR === '已按预设隐藏 1 种非喂鼠食物', 'footR=' + footR + '（v2.2.7：食物 tab 排猎物，藏=无饱腹+猎物）');
    await d.evaluate(() => { try { localStorage.removeItem('srp_glist_view_RatCage'); } catch (e) { } });
    /* 左键=官方原生详情弹窗（v2.2.1 作者令「列表所有物品都用官方弹窗」）：idetail 实例级命令
       （ItemId+OwnerId 直调官方动作），mod 自建 srgDetail 退役不再建节点 */
    const dr = await cmdSpy(() => d.evaluate(() => { document.querySelector('#srgList .srg-row').click(); return true; }));
    const dc = (dr.calls || []).filter((c) => c[0] === 'idetail').pop();
    const noModPop = await d.evaluate(() => !document.getElementById('srgDetail'));
    await d.evaluate(() => { const e = document.getElementById('srgDetail'); if (e) e.style.display = 'none'; }); /* RED 期兜底：旧遮罩挡后续点击；GREEN 后无节点零动作 */
    check('RB-C4-sat-official-detail-cmd', dr.r === true && !!dc && dc[1].item === 901 && dc[1].owner === 900001 && dc[1].cat === 2 && noModPop,
      'call=' + JSON.stringify(dc) + ' noModPop=' + noModPop + '（bag 源 owner=背包主；FEFO 首行=烤肉 901）');
  }
  await glistOn('RatCage', false);

  await setMockItems({
    bag: [
      [901, 2, 2, 0, 0, 0, 1, 1, 0, 38, 2],
      [902, 1, 1, 0, 1, 0, 1, 1, 0, 15, 30],
      [904, 4, 1, 0, 3, 0, 1, 1, 0, 20, 1]
    ]
  }, []);
  await showScene('BrewPanel');
  await glistOn('BrewPanel', true); await scan(); await gwait('BrewPanel');
  await pushCtx('BrewPanel');
  {
    const d = frameDoc('BrewPanel');
    const plaque = await d.evaluate(() => { const p = document.querySelector('#srgChips .srg-plaque'); return p ? p.textContent : ''; });
    check('RB-C5-brew-plaque', plaque === '🍗 按饱腹度 ↓', 'plaque=' + plaque);
    const badges = await d.evaluate(() => Array.from(document.querySelectorAll('#srgList .srg-row .srg-badge')).map((b) => ({
      txt: b.textContent, color: getComputedStyle(b).color, ico: b.querySelector('img.srg-bico') ? b.querySelector('img.srg-bico').getAttribute('src') : ''
    })));
    check('RB-C6-brew-badge-tier-ico', badges.length === 2 &&
      badges[0].txt.indexOf('38') >= 0 && /255,\s*201,\s*60/.test(badges[0].color) && badges[0].ico === 'hz-ico-putong' &&
      badges[1].txt.indexOf('15') >= 0 && /255,\s*112,\s*134/.test(badges[1].color) && badges[1].ico === 'hz-ico-liexing',
      'badges=' + JSON.stringify(badges));
    const footR = await d.evaluate(() => document.getElementById('srgFootR').textContent);
    check('RB-C7-brew-foot-hidden', footR === '已按预设隐藏 1 种不可酿物品', 'footR=' + footR);
    const dr2 = await cmdSpy(() => d.evaluate(() => { document.querySelectorAll('#srgList .srg-row')[0].click(); return true; }));
    const dc2 = (dr2.calls || []).filter((c) => c[0] === 'idetail').pop();
    await d.evaluate(() => { const e = document.getElementById('srgDetail'); if (e) e.style.display = 'none'; }); /* RED 期兜底同上 */
    check('RB-C8-brew-official-detail-cmd', dr2.r === true && !!dc2 && dc2[1].item === 901 && dc2[1].owner === 900001 && dc2[1].cat === 2,
      'call=' + JSON.stringify(dc2) + '（首行=烤肉普档 bag 叠）');
    /* brewIco 缺席（C# 窗口期）：角标退纯色无图不崩 */
    await page.evaluate(() => { window.__HZ_BREWICO__ = null; });
    await pushCtx('BrewPanel');
    const noIco = await d.evaluate(() => {
      const b = document.querySelector('#srgList .srg-row .srg-badge');
      return b ? { hasImg: !!b.querySelector('img.srg-bico'), txt: b.textContent } : null;
    });
    check('RB-C9-brew-ico-absent-graceful', !!noIco && !noIco.hasImg && noIco.txt.indexOf('38') >= 0, 'noIco=' + JSON.stringify(noIco));
    await page.evaluate(() => { delete window.__HZ_BREWICO__; });
    await d.evaluate(() => { try { localStorage.removeItem('srp_glist_view_BrewPanel'); } catch (e) { } });
  }
  await glistOn('BrewPanel', false);
  await page.evaluate((base) => window.__HZ_MOCKSET__(base), BASE_MOCK); /* 还基线（C 系底座复原） */

  /* ---- §交互 D1-D7（Task 4）：悬停 tip/左键详情/右键官方口径（heater=feed 直达、dye=bag 直回放/柜源双跳）/toast/默认菜单 ---- */

  /* Heater：木柴仅柜源（900105）、柴油仅背包 */
  await setMockItems({
    bag: [[902, 11, 5, 0, 0, 0, 1, 1, 0]],
    '900105': [[921, 10, 36, 0, 0, 0, 1, 1, 0]]
  }, [900105]);
  await pushCtx('Heater');
  await showScene('Heater'); await glistReady('Heater');
  {
    const d = frameDoc('Heater');
    const tipShown = await d.evaluate(() => {
      const r = document.querySelectorAll('.srg-row')[0];
      r.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      r.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 300, clientY: 300 }));
      const e = document.getElementById('srgTip');
      return e ? { shown: e.style.display !== 'none', txt: e.textContent } : null;
    }).catch(() => null);
    check('D1-hover-tip', !!tipShown && tipShown.shown && tipShown.txt.indexOf('柴油') >= 0 && tipShown.txt.indexOf('热值') >= 0 && tipShown.txt.indexOf('背包') >= 0 && tipShown.txt.indexOf('右键') >= 0,
      JSON.stringify(tipShown && tipShown.txt.slice(0, 40)));
    const tipFollows = await d.evaluate(() => {
      const e = document.getElementById('srgTip'); const x1 = e.offsetLeft, y1 = e.offsetTop;
      document.querySelectorAll('.srg-row')[0].dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 600, clientY: 500 }));
      const x2 = e.offsetLeft, y2 = e.offsetTop; window.__HZ_TIPPOS__ = [x1, y1, x2, y2, e.offsetWidth, document.documentElement.clientWidth]; return x2 !== x1 || y2 !== y1;
    }).catch(() => false);
    check('D1-tip-follows', tipFollows === true, 'pos=' + JSON.stringify(await d.evaluate(() => window.__HZ_TIPPOS__ || null).catch(() => null)));
    check('D1-tip-hides', await d.evaluate(() => {
      document.querySelectorAll('.srg-row')[0].dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      const e = document.getElementById('srgTip');
      return !e || e.style.display === 'none';
    }).catch(() => false) === true, '');

    /* D2（v2.2.1 改道）：左键=官方原生详情弹窗——idetail 实例级命令（ItemId+OwnerId+cfg）；
       mod 自建 srgDetail 退役（不建节点零残留） */
    const d2r = await cmdSpy(() => d.evaluate(() => { document.querySelector('#srgList .srg-row').click(); return true; }));
    const d2c = (d2r.calls || []).filter((c) => c[0] === 'idetail').pop();
    const d2no = await d.evaluate(() => !document.getElementById('srgDetail'));
    await d.evaluate(() => { const e = document.getElementById('srgDetail'); if (e) e.style.display = 'none'; }); /* RED 期兜底同上 */
    check('D2-heat-official-detail-cmd', d2r.r === true && !!d2c && d2c[1].item > 0 && d2c[1].owner > 0 && d2c[1].cat > 0 && d2no,
      'call=' + JSON.stringify(d2c) + ' noModPop=' + d2no);

    await d.evaluate(() => { document.addEventListener('contextmenu', (e) => { window.__HZ_CTXDEF__ = e.defaultPrevented; }, { once: true }); });
    const feedRes = await cmdSpy(async () => {
      const idx = await d.evaluate(() => Array.from(document.querySelectorAll('.srg-row')).findIndex((r) => r.textContent.indexOf('木柴') >= 0)).catch(() => -1);
      if (idx < 0) return 'NOROW';
      await d.click('.srg-row:nth-child(' + (idx + 1) + ')', { button: 'right' });
      await page.waitForTimeout(60);
      return true;
    });
    const feedCall = (feedRes.calls || []).filter((c) => c[0] === 'feed').pop();
    check('D3-heat-feed-cmd', feedRes.r === true && !!feedCall && feedCall[1].owner === 900105 && feedCall[1].item === 921,
      JSON.stringify(feedCall));
    const toastTxt = await d.evaluate(() => { const e = document.getElementById('srgToast'); return e ? e.textContent : ''; }).catch(() => '');
    check('D6-toast', toastTxt.indexOf('已送出 1 件') >= 0 && toastTxt.indexOf('炉膛') >= 0 && toastTxt.indexOf('燃料柜') >= 0, toastTxt);
    check('D7-ctxmenu-prevented', await d.evaluate(() => window.__HZ_CTXDEF__ === true).catch(() => false) === true, '');
  }

  /* Dye：D4 bag 源直回放；D5 柜源双跳（take→推送落→回放新实例） */
  await setMockItems({
    bag: [[901, 1, 4, 0, 0, 0, 1, 1, 0], [902, 8, 2, 0, 1, 0, 1, 1, 0]],
    '900102': [[915, 3, 3, 36000, 0, 0, 1, 1, 0]]
  }, [900102]);
  await pushCtx('DyePanel');
  await showScene('DyePanel'); await glistReady('DyePanel');
  {
    const d = frameDoc('DyePanel');
    const rowSelOf = (nm) => d.evaluate((n) => {
      const rows = Array.from(document.querySelectorAll('.srg-row'));
      const i = rows.findIndex((r) => r.textContent.indexOf(n) >= 0);
      return i < 0 ? null : '.srg-row:nth-child(' + (i + 1) + ')';
    }, nm).catch(() => null);
    const wrapSent = (fn) => d.evaluate(() => {
      window.__HZ_SENT__ = [];
      const orig = core.UnitySendEvent;
      core.UnitySendEvent = (n, p) => { window.__HZ_SENT__.push([n, p]); };
      window.__HZ_SENT_RESTORE__ = () => { core.UnitySendEvent = orig; };
    }).then(fn).finally(() => d.evaluate(() => window.__HZ_SENT_RESTORE__()));
    const sentNow = () => d.evaluate(() => window.__HZ_SENT__ || []).catch(() => []);

    const r4 = await cmdSpy(() => wrapSent(async () => {
      const sel = await rowSelOf('生态香米'); if (!sel) return 'NOROW';
      await d.click(sel, { button: 'right' }); await page.waitForTimeout(60);
      return true;
    }));
    const sent4 = r4.r === true ? (await sentNow()).filter((c) => c[0] === 'ITEM_CLICK') : [];
    const take4 = (r4.calls || []).filter((c) => c[0] === 'take');
    check('D4-dye-bag-replay', r4.r === true && sent4.length === 1 && sent4[0][1].itemId === 901 && sent4[0][1].rightClick === true && take4.length === 0,
      'r=' + r4.r + ' sent=' + JSON.stringify(sent4) + ' take=' + take4.length);

    /* root harness 自带 take 命令模拟器（drain→搬运新叠 950xxx→回推）——右键后等模拟器走完
       双跳全程：take 先行、原柜叠 id(915) 不直回放、回放的是推送落包后的背包新实例(≥950000) */
    const r5 = await cmdSpy(() => wrapSent(async () => {
      const sel = await rowSelOf('咖啡'); if (!sel) return 'NOROW';
      await d.click(sel, { button: 'right' }); await page.waitForTimeout(900);
      const sentAfter = (await sentNow()).filter((c) => c[0] === 'ITEM_CLICK');
      return { sentAfter };
    }));
    const take5 = (r5.calls || []).filter((c) => c[0] === 'take').pop();
    const v5 = r5.r;
    const sent5 = v5 && v5.sentAfter ? v5.sentAfter : [];
    check('D5-dye-take-first', v5 && !!take5 && take5[1].from === 900102 && take5[1].all === false && JSON.stringify(take5[1].ids) === '[915]' && sent5.every((c) => c[1].itemId !== 915),
      'take=' + JSON.stringify(take5) + ' sentIds=' + JSON.stringify(sent5.map((c) => c[1].itemId)));
    check('D5-dye-replay-after-push', sent5.length === 1 && sent5[0][1].itemId >= 950000 && sent5[0][1].rightClick === true,
      'after=' + JSON.stringify(sent5));
  }

  /* ---- §交互 RB-D（rat-brew glist Task4）：feed='click'=dye 同款回放径——bag 源直回放（RatCage）/
     柜源 take+GLPEND 双跳落包后回放新实例（BrewPanel，Review Focus 4） ---- */
  await setMockItems({ bag: [[901, 2, 2, 0, 0, 0, 1, 1, 0, 38, 2]] }, []);
  await pushCtx('RatCage');
  await showScene('RatCage'); await glistReady('RatCage');
  {
    const d = frameDoc('RatCage');
    const wrapSent = (fn) => d.evaluate(() => {
      window.__HZ_SENT__ = [];
      const orig = core.UnitySendEvent;
      core.UnitySendEvent = (n, p) => { window.__HZ_SENT__.push([n, p]); };
      window.__HZ_SENT_RESTORE__ = () => { core.UnitySendEvent = orig; };
    }).then(fn).finally(() => d.evaluate(() => window.__HZ_SENT_RESTORE__()));
    const sentNow = () => d.evaluate(() => window.__HZ_SENT__ || []).catch(() => []);
    const rd = await cmdSpy(() => wrapSent(async () => {
      await d.click('.srg-row', { button: 'right' }); await page.waitForTimeout(60);
      return true;
    }));
    const sentD = rd.r === true ? (await sentNow()).filter((c) => c[0] === 'ITEM_CLICK') : [];
    const takeD = (rd.calls || []).filter((c) => c[0] === 'take');
    check('RB-D1-rat-bag-replay', rd.r === true && sentD.length === 1 && sentD[0][1].itemId === 901 && sentD[0][1].rightClick === true && takeD.length === 0,
      'sent=' + JSON.stringify(sentD) + ' take=' + takeD.length);
    await glistOn('RatCage', false);
  }
  await setMockItems({
    bag: [],
    '900102': [[915, 2, 3, 36000, 0, 0, 1, 1, 0, 38, 2]]
  }, [900102]);
  await pushCtx('BrewPanel');
  await showScene('BrewPanel'); await glistReady('BrewPanel');
  {
    const d = frameDoc('BrewPanel');
    const wrapSent = (fn) => d.evaluate(() => {
      window.__HZ_SENT__ = [];
      const orig = core.UnitySendEvent;
      core.UnitySendEvent = (n, p) => { window.__HZ_SENT__.push([n, p]); };
      window.__HZ_SENT_RESTORE__ = () => { core.UnitySendEvent = orig; };
    }).then(fn).finally(() => d.evaluate(() => window.__HZ_SENT_RESTORE__()));
    const sentNow = () => d.evaluate(() => window.__HZ_SENT__ || []).catch(() => []);
    const rd = await cmdSpy(() => wrapSent(async () => {
      await d.click('.srg-row', { button: 'right' }); await page.waitForTimeout(900);
      return { sentAfter: (await sentNow()).filter((c) => c[0] === 'ITEM_CLICK') };
    }));
    const v = rd.r && rd.r.sentAfter ? rd.r.sentAfter : [];
    const takeD = (rd.calls || []).filter((c) => c[0] === 'take').pop();
    check('RB-D2-brew-take-first', !!takeD && takeD[1].from === 900102 && takeD[1].all === false && JSON.stringify(takeD[1].ids) === '[915]' && v.every((c) => c[1].itemId !== 915),
      'take=' + JSON.stringify(takeD) + ' sentIds=' + JSON.stringify(v.map((c) => c[1].itemId)));
    check('RB-D3-brew-replay-after-push', v.length === 1 && v[0][1].itemId >= 950000 && v[0][1].rightClick === true,
      'after=' + JSON.stringify(v));

    /* RB-D4（终审 Important#1）：双跳**扩展键精确匹配**甄别同名异值变体——bag 已有同名另一档
       （cfg2 s2=2=普），柜中右键 s2=30（烈）那行：take 落包新叠须保留 s1/s2（键 |38/30 命中）
       回放新实例；若模拟器剥列→键 |null/null 失配→同名兜底命中 bag 首个 901（错误变体）。
       修前 RED=回放 901，修后 GREEN=回放 ≥950000。 */
    await setMockItems({
      bag: [[901, 2, 1, 0, 0, 0, 1, 1, 0, 38, 2]],
      '900102': [[915, 2, 3, 36000, 0, 0, 1, 1, 0, 38, 30]]
    }, [900102]);
    await pushCtx('BrewPanel');
    const rowIdx = await d.evaluate(() => Array.from(document.querySelectorAll('.srg-row'))
      .findIndex((r) => r.textContent.indexOf('烈') >= 0 || (r.querySelector('.srg-badge') && /255,\s*112,\s*134/.test(getComputedStyle(r.querySelector('.srg-badge')).color))));
    const rd4 = rowIdx >= 0 ? await cmdSpy(() => wrapSent(async () => {
      await d.click('.srg-row:nth-child(' + (rowIdx + 1) + ')', { button: 'right' });
      await page.waitForTimeout(900);
      return { sentAfter: (await sentNow()).filter((c) => c[0] === 'ITEM_CLICK') };
    })) : null;
    const v4 = rd4 && rd4.r && rd4.r.sentAfter ? rd4.r.sentAfter : [];
    check('RB-D4-brew-key-variant-replay', rowIdx >= 0 && v4.length === 1 && v4[0][1].itemId >= 950000 && v4[0][1].rightClick === true,
      'rowIdx=' + rowIdx + ' after=' + JSON.stringify(v4) + '（甄别：键失配兜底会回放 bag 同名 901）');
  }

  /* ---- §装配 RB-E（rat-brew glist Task4）：rail 页宿主接管/格子态 srg-plain（页脚三件保留+
     排序钮退役=裁定#4/#6）/拆净还原（排序钮复原——harness 钮反向门） ---- */
  {
    const d = frameDoc('BrewPanel');
    await glistReady('BrewPanel');
    const listState = await d.evaluate(() => {
      const rail = document.getElementById('srRail');
      return { panel: !!document.getElementById('srgPanel'), railHidden: !!rail && rail.offsetParent === null };
    });
    check('RB-E1-list-takeover', listState.panel && listState.railHidden, JSON.stringify(listState));
    await d.click('#srgToggle'); await page.waitForTimeout(80);
    const gridState = await d.evaluate(() => {
      const p = document.getElementById('srgPanel');
      const host = document.getElementById('srp') || (document.getElementById('srRail') || {}).parentNode;
      const sortBtn = document.getElementById('srFoodSort');
      const store = document.getElementById('srStoreAll');
      return {
        gridmode: !!p && p.classList.contains('srg-gridmode'),
        plain: !!host && host.classList.contains('srg-plain'),
        sortHidden: !!sortBtn && sortBtn.hidden,
        storeShown: !!store && store.offsetParent !== null,
        railShown: !!(document.getElementById('srRail') || {}).offsetParent
      };
    });
    check('RB-E2-grid-plain-foot', gridState.gridmode && gridState.plain && gridState.sortHidden && gridState.storeShown && gridState.railShown,
      JSON.stringify(gridState));
    await d.click('#srgToggle'); await page.waitForTimeout(80);
    /* 拆净（harness 钮反向门=产线无此态，退役门回退面）：panel 摘除+排序钮复原+rail 复显 */
    await glistOn('BrewPanel', false); await scan(); await pushCtx('BrewPanel'); await page.waitForTimeout(80);
    const tornState = await d.evaluate(() => {
      const sortBtn = document.getElementById('srFoodSort');
      return {
        noPanel: !document.getElementById('srgPanel'),
        sortBack: !!sortBtn && !sortBtn.hidden,
        railBack: !!(document.getElementById('srRail') || {}).offsetParent
      };
    });
    check('RB-E3-teardown-restore', tornState.noPanel && tornState.sortBack && tornState.railBack, JSON.stringify(tornState));
    await d.evaluate(() => { try { localStorage.removeItem('srp_glist_view_BrewPanel'); } catch (e) { } });
  }
  /* ---- §rat 双 tab RB-F（v2.2.7 作者令：食物 tab=排除猎物(含死体)；猎物 tab=只猎物活死都收
     且活/死拆行；右键官方路由只认活体=笼位优先/死体落食物仓） ---- */
  await page.evaluate(() => { window.__HZ_RBICFG__ = true; window.__HZ_GLISTON__ = true; });
  await setMockItems({
    bag: [
      [901, 2, 2, 0, 0, 0, 1, 1, 0, 38, 2],
      [923, 23, 3, 0, 1, 0, 1, 1, 0, 7, -4],
      [925, 24, 2, 0, 2, 0, 1, 1, 0, 7, -4],
      [904, 4, 1, 0, 3, 0, 1, 1, 0, null, null]
    ],
    '900102': [[924, 23, 1, 36000, 0, 0, 1, 1, 0, 7, -4]]
  }, [900102]);
  await showScene('RatCage');
  await glistOn('RatCage', true); await scan(); await gwait('RatCage');
  await pushCtx('RatCage');
  {
    const d = frameDoc('RatCage');
    await d.evaluate(() => { try { window.State.mouseSlotCount = 4; window.State.mice = []; } catch (e) { } }); /* 官方页全局态：笼位 4 空 */
    const f1 = await d.evaluate(() => ({
      chips: Array.from(document.querySelectorAll('#srgChips .srg-chip')).map((c) => [c.textContent, c.className.indexOf('on') >= 0]),
      rows: Array.from(document.querySelectorAll('#srgList .srg-name')).map((n) => n.textContent),
      plaque: !!document.querySelector('#srgChips .srg-plaque')
    }));
    check('RB-F1-food-excludes-prey', f1.chips.length === 2 && f1.chips[0][0] === '食物' && f1.chips[0][1] === true &&
      f1.chips[1][0] === '猎物' && f1.chips[1][1] === false &&
      f1.rows.length === 1 && f1.rows[0] === '烤肉' && f1.plaque === true,
      JSON.stringify(f1) + '（食物 tab 排除活/死猎物）');
    await d.evaluate(() => { Array.from(document.querySelectorAll('#srgChips .srg-chip')).find((c) => c.textContent === '猎物').click(); });
    await page.waitForTimeout(60);
    const f2 = await d.evaluate(() => ({
      rows: Array.from(document.querySelectorAll('#srgList .srg-name')).map((n) => n.textContent),
      badge: !!document.querySelector('#srgList .srg-badge'),
      plaque: !!document.querySelector('#srgChips .srg-plaque'),
      hint: (document.getElementById('srgHint') || {}).textContent || '',
      mouseOn: ((Array.from(document.querySelectorAll('#srgChips .srg-chip')).find((c) => c.textContent === '猎物') || {}).className || '').indexOf('on') >= 0
    }));
    check('RB-F2-prey-tab-split-rows', f2.mouseOn && f2.rows.length === 2 &&
      f2.rows.indexOf('小家鼠') >= 0 && f2.rows.indexOf('小家鼠（死）') >= 0 && !f2.badge && !f2.plaque && f2.hint.indexOf('笼位') >= 0,
      JSON.stringify(f2) + '（活/死异名=天然拆行；无角标无牌）');
    /* F3 官方路由（RatCage.html onItemClick 逐字）：活猎物+笼位空=MOUSE_ADD；笼位满=ITEM_CLICK；
       死猎物恒 ITEM_CLICK（slotFree 也不进笼位——官方 isMouse 只认活体） */
    const wrapSent = (fn) => d.evaluate(() => {
      window.__HZ_SENT__ = [];
      const orig = core.UnitySendEvent;
      core.UnitySendEvent = (n, p) => { window.__HZ_SENT__.push([n, p]); };
      window.__HZ_SENT_RESTORE__ = () => { core.UnitySendEvent = orig; };
    }).then(fn).finally(() => d.evaluate(() => window.__HZ_SENT_RESTORE__()));
    const sentNow = () => d.evaluate(() => window.__HZ_SENT__ || []).catch(() => []);
    const rowIdxOf = (nm) => d.evaluate((n) => Array.from(document.querySelectorAll('.srg-row')).findIndex((r) => r.textContent.indexOf(n) >= 0), nm).catch(() => -1);
    const f3 = await cmdSpy(() => wrapSent(async () => {
      const i = await rowIdxOf('小家鼠（死）'); /* 死体行：笼位空也走 ITEM_CLICK */
      if (i < 0) return 'NOROW';
      await d.click('.srg-row:nth-child(' + (i + 1) + ')', { button: 'right' }); await page.waitForTimeout(60); return true;
    }));
    const sent3 = f3.r === true ? (await sentNow()).filter((c) => c[0] === 'ITEM_CLICK') : [];
    check('RB-F3-dead-prey-food-path', sent3.length === 1 && sent3[0][1].rightClick === true && sent3[0][1].itemId === 925,
      'sent=' + JSON.stringify(sent3) + '（死体→食物仓，官方 isMouse 只认活体）');
    const f4 = await cmdSpy(() => wrapSent(async () => {
      const i = await rowIdxOf('小家鼠'); /* 活体行（不含「（死）」命中排除：findIndex 首个=小家鼠） */
      if (i < 0) return 'NOROW';
      await d.click('.srg-row:nth-child(' + (i + 1) + ')', { button: 'right' }); await page.waitForTimeout(60); return true;
    }));
    const sent4 = f4.r === true ? (await sentNow()).filter((c) => c[0] === 'MOUSE_ADD') : [];
    check('RB-F4-live-slotfree-add', sent4.length === 1 && sent4[0][1].itemId === 923,
      'sent=' + JSON.stringify(sent4) + '（笼位 4 空=MOUSE_ADD）');
    await d.evaluate(() => { try { window.State.mice = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]; } catch (e) { } });
    const f5 = await cmdSpy(() => wrapSent(async () => {
      const i = await rowIdxOf('小家鼠'); if (i < 0) return 'NOROW';
      await d.click('.srg-row:nth-child(' + (i + 1) + ')', { button: 'right' }); await page.waitForTimeout(60); return true;
    }));
    const sent5 = f5.r === true ? (await sentNow()).filter((c) => c[0] === 'ITEM_CLICK') : [];
    check('RB-F5-live-slotfull-food', sent5.length === 1 && sent5[0][1].rightClick === true,
      'sent=' + JSON.stringify(sent5) + '（笼位满=ITEM_CLICK 落食物仓）');
    await d.evaluate(() => { try { window.State.mice = []; } catch (e) { } });
    /* F6 柜源双跳：活猎物 take+GLPEND ev=mouse 落包后 MOUSE_ADD 回放新实例 */
    await setMockItems({ bag: [[901, 2, 1, 0, 0, 0, 1, 1, 0, 38, 2]], '900102': [[924, 23, 1, 36000, 0, 0, 1, 1, 0, 7, -4]] }, [900102]);
    await pushCtx('RatCage');
    await page.waitForTimeout(60);
    const f6 = await cmdSpy(() => wrapSent(async () => {
      const i = await rowIdxOf('小家鼠'); if (i < 0) return 'NOROW';
      await d.click('.srg-row:nth-child(' + (i + 1) + ')', { button: 'right' });
      await page.waitForTimeout(900);
      return { sentAfter: (await sentNow()).filter((c) => c[0] === 'MOUSE_ADD') };
    }));
    const v6 = f6.r && f6.r.sentAfter ? f6.r.sentAfter : [];
    const take6 = (f6.calls || []).filter((c) => c[0] === 'take').pop();
    check('RB-F6-prey-take-doublehop', !!take6 && take6[1].from === 900102 && JSON.stringify(take6[1].ids) === '[924]' &&
      v6.length === 1 && v6[0][1].itemId >= 950000,
      'take=' + JSON.stringify(take6) + ' mouseAdd=' + JSON.stringify(v6));
    /* F7 切回食物 tab 右键回归 ITEM_CLICK */
    await d.evaluate(() => { Array.from(document.querySelectorAll('#srgChips .srg-chip')).find((c) => c.textContent === '食物').click(); });
    await page.waitForTimeout(60);
    const f7 = await cmdSpy(() => wrapSent(async () => {
      await d.click('.srg-row', { button: 'right' }); await page.waitForTimeout(60); return true;
    }));
    const sent7 = f7.r === true ? (await sentNow()).filter((c) => c[0] === 'ITEM_CLICK') : [];
    check('RB-F7-food-tab-regression', sent7.length === 1 && sent7[0][1].rightClick === true,
      'sent=' + JSON.stringify(sent7));
  }
  await glistOn('RatCage', false);
  await page.evaluate(() => { delete window.__HZ_RBICFG__; delete window.__HZ_GLISTON__; });

  await page.evaluate((base) => window.__HZ_MOCKSET__(base), BASE_MOCK); /* 还基线 */

  /* ---- §染料预设 E1-E6（Task 5）：8色动态 chips/单选任一色命中/主色点数降序/水滴 fill=主色/隐藏提示/空板容错 ---- */
  await page.evaluate(() => {
    window.__HZ_DYEPAL__ = [[3, '红', '#e05555', 1, 1], [5, '蓝', '#6fc7c9', 1, 2], [9, '黄', '#f0b03c', 1, 3], [11, '绿', '#5a9e6f', 1, 4], [13, '紫', '#9b7fd4', 1, 5], [15, '橙', '#e67e22', 1, 6], [17, '棕', '#8a6d4a', 1, 7], [19, '黑', '#3a3a3a', 1, 8]];
    window.__HZ_DYEPIG__ = { 1: '[[3,2],[5,1]]', 3: '[[3,2]]', 8: '[[3,5]]', 4: '[[5,3]]', 2: '[]' };
  });
  await setMockItems({
    bag: [[904, 4, 2, 0, 0, 0, 1, 1, 0], [901, 1, 4, 0, 1, 0, 1, 1, 0], [902, 8, 2, 0, 2, 0, 1, 1, 0], [903, 3, 1, 0, 3, 0, 1, 1, 0], [905, 2, 6, 0, 4, 0, 1, 1, 0]]
  }, null);
  await pushCtx('DyePanel');
  await showScene('DyePanel'); await glistReady('DyePanel');
  {
    const d = frameDoc('DyePanel');
    const chipCount = await d.evaluate(() => document.querySelectorAll('.srg-chip').length).catch(() => -1);
    check('E1-chips-8pal', chipCount === 9, 'chips=' + chipCount); /* 全部+8 色 */
    check('E1-swatch-hex', await d.evaluate(() => {
      const c = document.querySelector('.srg-chip[data-c="3"] .srg-swatch');
      return !!c && c.style.background.indexOf('rgb(224, 85, 85)') >= 0;
    }).catch(() => false) === true, '');
    check('E1-plaque', (await d.evaluate(() => document.getElementById('srgChips').textContent).catch(() => '')).indexOf('按色素值 ↓') >= 0, '');

    /* E3 主色点数降序+并列稳定：插入序 cfg4(3蓝)/cfg1(2红)/cfg8(5红)/cfg3(2红)
       → 期望 草药(8,5)→急救绷带(4,3)→生态香米(1,2)→咖啡(3,2)（1 与 3 并列按原序） */
    const order = await d.evaluate(() => Array.from(document.querySelectorAll('.srg-row .srg-name')).map((n) => n.textContent)).catch(() => []);
    check('E3-order-exact', order.length === 4 && order[0] === '草药' && order[1] === '急救绷带' && order[2] === '生态香米' && order[3] === '咖啡',
      JSON.stringify(order));
    /* E4 水滴 fill=主色 hex（草药主色红） */
    check('E4-drop-fill', await d.evaluate(() => {
      const b = document.querySelectorAll('.srg-row')[0].querySelector('.srg-badge svg path');
      return !!b && b.getAttribute('fill') === '#e05555';
    }).catch(() => false) === true, '');
    /* E5 无色素隐藏+页脚 */
    const footE5 = await d.evaluate(() => document.getElementById('srgFootR') ? document.getElementById('srgFootR').textContent : '').catch(() => '');
    check('E5-hidden-hint', footE5.indexOf('已按预设隐藏 1 种无色素物品') >= 0, footE5);

    /* E2 单选：蓝 → 仅 cfg4（任一色含蓝）；全部 → 恢复 4 */
    await d.click('.srg-chip[data-c="5"]').catch(() => {});
    await page.waitForTimeout(60);
    const blueRows = await d.evaluate(() => Array.from(document.querySelectorAll('.srg-row .srg-name')).map((n) => n.textContent)).catch(() => []);
    check('E2-blue-only', blueRows.length === 2 && blueRows[0] === '急救绷带' && blueRows[1] === '生态香米' && blueRows.indexOf('草药') < 0 && blueRows.indexOf('咖啡') < 0,
      JSON.stringify(blueRows)); /* 蓝=任一色命中：cfg4(蓝3)+cfg1(红2/蓝1)——主色序 3>2；纯红两行缺席 */
    check('E2-chip-on', await d.evaluate(() => { const c = document.querySelector('.srg-chip[data-c="5"]'); return !!c && c.classList.contains('on'); }).catch(() => false) === true, '');
    await d.click('.srg-chip[data-c=""]').catch(() => {});
    await page.waitForTimeout(60);
    const allRows = await d.evaluate(() => document.querySelectorAll('.srg-row').length).catch(() => -1);
    check('E2-all-restore', allRows === 4, 'rows=' + allRows);
  }

  /* E6 空板容错：dyePal=[] → 仅「全部」chip，行照常渲染零报错 */
  await page.evaluate(() => { window.__HZ_DYEPAL__ = []; });
  await pushCtx('DyePanel');
  await page.waitForTimeout(120);
  {
    const d = frameDoc('DyePanel');
    const chips = await d.evaluate(() => document.querySelectorAll('.srg-chip').length).catch(() => -1);
    const rows = await d.evaluate(() => document.querySelectorAll('.srg-row').length).catch(() => -1);
    check('E6-empty-pal', chips === 1 && rows >= 1, 'chips=' + chips + ' rows=' + rows);
  }
  await page.evaluate(() => { delete window.__HZ_DYEPAL__; delete window.__HZ_DYEPIG__; window.__HZ_GLIST__ = {}; });

  /* ---- §暖炉预设 F1-F5（Task 6）：固定仅可燃物 lock/非燃料隐藏/热值降序/火苗/搜索不破坏预设 ---- */
  await setMockItems({
    bag: [[901, 10, 12, 0, 0, 0, 1, 1, 0], [902, 12, 5, 0, 1, 0, 1, 1, 0]],
    '900105': [[921, 11, 20, 0, 0, 0, 1, 1, 0], [922, 10, 36, 0, 1, 0, 1, 1, 0]]
  }, [900105]);
  await pushCtx('Heater');
  await showScene('Heater'); await glistReady('Heater');
  {
    const d = frameDoc('Heater');
    check('F1-lock-chip', await d.evaluate(() => {
      const c = document.querySelector('.srg-chip');
      return !!c && c.classList.contains('on') && c.classList.contains('lock') && c.textContent.indexOf('仅可燃物') >= 0;
    }).catch(() => false) === true, '');
    check('F1-plaque-heat', (await d.evaluate(() => document.getElementById('srgChips') ? document.getElementById('srgChips').textContent : '').catch(() => '')).indexOf('按热值 ↓') >= 0, '');
    /* 点击 lock chip：状态不变、行数不变 */
    const rowsBefore = await d.evaluate(() => document.querySelectorAll('.srg-row').length).catch(() => -1);
    await d.click('.srg-chip.lock').catch(() => {});
    await page.waitForTimeout(60);
    check('F1-lock-click-noop', await d.evaluate((n) => {
      const c = document.querySelector('.srg-chip');
      return c && c.classList.contains('on') && document.querySelectorAll('.srg-row').length === n;
    }, rowsBefore).catch(() => false) === true, '');
    const fState = await d.evaluate(() => ({
      names: Array.from(document.querySelectorAll('.srg-row .srg-name')).map((n) => n.textContent),
      flames: Array.from(document.querySelectorAll('.srg-row .srg-ico')).every((e) => e.classList.contains('is-fuel')),
      footR: document.getElementById('srgFootR') ? document.getElementById('srgFootR').textContent : ''
    })).catch(() => null);
    check('F2-nonfuel-hidden', !!fState && fState.names.length === 2 && fState.names.indexOf('零件') < 0 && fState.footR.indexOf('非燃料 1 种已按场景预设隐藏') >= 0,
      JSON.stringify(fState && { n: fState.names, footR: fState.footR }));
    check('F3-heat-desc', !!fState && fState.names[0] === '柴油' && fState.names[1] === '木柴', JSON.stringify(fState && fState.names));
    check('F4-flame-all', !!fState && fState.flames === true, '');
    check('F5-search-keeps-preset', await (async () => {
      await d.fill('#srgQ', '零件'); await page.waitForTimeout(80);
      const empty = await d.evaluate(() => { const e = document.querySelector('.srg-empty'); return e ? e.textContent : ''; }).catch(() => '');
      await d.fill('#srgQ', ''); await page.waitForTimeout(60);
      return empty === '无匹配物品';
    })(), '');
  }

  /* ---- §门 G1-G4（Task 7）：ctx.glistOn 真门 + __HZ_GLIST__ 钮覆盖语义 ---- */
  await setMockItems({ bag: [[901, 1, 4, 0, 0, 0, 1, 1, 0]] }, null);
  await pushCtx('DyePanel');
  await showScene('DyePanel');
  const hasPanel = async () => !!(await frameDoc('DyePanel').evaluate(() => document.getElementById('srgPanel')).catch(() => null));
  /* G1 ctx 显式关 + 钮关 → 不装配 */
  await page.evaluate(() => { window.__HZ_GLISTON__ = false; });
  await pushCtx('DyePanel'); await scan(); await page.waitForTimeout(60);
  check('G1-ctx-off-no-panel', (await hasPanel()) === false, '');
  /* G2 ctx 关 + 钮开 → 装配（覆盖门） */
  await glistOn('DyePanel', true); await scan(); await gwait('DyePanel');
  check('G2-knob-override', (await hasPanel()) === true, '');
  await glistOn('DyePanel', false); await scan(); await page.waitForTimeout(60);
  /* G3 ctx 开 + 钮关 → 装配（真门路径） */
  await page.evaluate(() => { window.__HZ_GLISTON__ = true; });
  await pushCtx('DyePanel'); await scan(); await gwait('DyePanel');
  check('G3-ctx-on-mounts', (await hasPanel()) === true, '');
  /* G4 ctx 翻关 → 拆净（ctx 驱动 teardown） */
  await page.evaluate(() => { window.__HZ_GLISTON__ = false; });
  await pushCtx('DyePanel'); await scan(); await page.waitForTimeout(60);
  check('G4-ctx-off-teardown', (await hasPanel()) === false, '');
  await page.evaluate(() => { delete window.__HZ_GLISTON__; });

  /* ---- §终审修复 FD1-FD7（I1/I2/M1/M2/M3/M7 对应）---- */
  await setMockItems({
    bag: [[902, 11, 5, 0, 0, 0, 1, 1, 0]],
    '900105': [[921, 10, 36, 0, 0, 0, 1, 1, 0]]
  }, [900105]);
  await pushCtx('Heater');
  await showScene('Heater'); await glistReady('Heater');
  {
    const d = frameDoc('Heater');
    /* FD1 bag 源 feed=owner 背包（契约钉死；C# OpFeed bag 放行+跳一跳由 build 门） */
    const fr = await cmdSpy(async () => {
      const idx = await d.evaluate(() => Array.from(document.querySelectorAll('.srg-row')).findIndex((r) => r.textContent.indexOf('柴油') >= 0)).catch(() => -1);
      if (idx < 0) return 'NOROW';
      await d.click('.srg-row:nth-child(' + (idx + 1) + ')', { button: 'right' }); await page.waitForTimeout(60);
      return true;
    });
    const fc = (fr.calls || []).filter((c) => c[0] === 'feed').pop();
    check('FD1-bag-feed-owner', fr.r === true && !!fc && fc[1].owner === 900001 && fc[1].item === 902, JSON.stringify(fc));
    /* FD2 feedFail 面：glist 列表态优先消费→toast 官方同款失败文案 */
    await page.evaluate(() => { window.__HZ_FEEDFAIL__ = 'bagfull'; });
    await pushCtx('Heater'); await page.waitForTimeout(120);
    const ft = await d.evaluate(() => { const e = document.getElementById('srgToast'); return e ? e.textContent : ''; }).catch(() => '');
    check('FD2-feedfail-toast', ft.indexOf('背包已满') >= 0, ft);
    await page.evaluate(() => { window.__HZ_FEEDFAIL__ = ''; });
    /* FD4 拆净零残留：先制造 tip/toast 再关 → 节点全无（v2.2.1 起 srgDetail 退役不建） */
    await d.evaluate(() => { const r = document.querySelectorAll('.srg-row')[0]; if (r) { r.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); r.click(); } });
    await page.waitForTimeout(50);
    const hadNodes = await d.evaluate(() => !!document.getElementById('srgTip') && !!document.getElementById('srgToast')).catch(() => false);
    await glistOn('Heater', false); await scan(); await page.waitForTimeout(60);
    const residue = await d.evaluate(() => ['srgTip', 'srgDetail', 'srgToast', 'srgPanel'].filter((id) => !!document.getElementById(id))).catch(() => ['ERR']);
    check('FD4-teardown-nodes', hadNodes === true && residue.length === 0, 'had=' + hadNodes + ' residue=' + JSON.stringify(residue));
    /* FD5 GLQ 复挂回填：搜索→拆→装 → 输入框与列表过滤一致 */
    await glistOn('Heater', true); await scan(); await gwait('Heater'); await page.waitForTimeout(50);
    await d.fill('#srgQ', '木柴'); await page.waitForTimeout(60);
    await glistOn('Heater', false); await scan(); await page.waitForTimeout(40);
    await glistOn('Heater', true); await scan(); await gwait('Heater'); await page.waitForTimeout(60);
    const rehyd = await d.evaluate(() => {
      const q = document.getElementById('srgQ');
      const rows = Array.from(document.querySelectorAll('.srg-row .srg-name')).map((n) => n.textContent);
      return { v: q ? q.value : 'NOQ', rows };
    }).catch(() => null);
    check('FD5-glg-rehydrate', !!rehyd && rehyd.v === '木柴' && rehyd.rows.length === 1 && rehyd.rows[0] === '木柴', JSON.stringify(rehyd));
    await d.fill('#srgQ', '');
    /* GE：切格子态→refreshBag 官方刷新杠杆（批改#9：#2 旧杠杆 switchBag 同值守卫早退在「官方
       状态已在背包」时哑火且不覆盖染料——正身=裸命令→C# RefreshActivePage 按页派 Ac_*_RefreshBag）
       + 格子态=rail 壳 srg-plain（染料桶格子界面复用批 2026-11-12：#srp 替换官方 .panel，
       官方金标题+信息条+官方格+页脚一键入库/一键整理，样式底色统一——染料桶同款） */
    const ge = await cmdSpy(async () => { await d.click('#srgToggle'); await page.waitForTimeout(60); return true; });
    const rb = (ge.calls || []).filter((c) => c[0] === 'refreshBag').pop();
    check('GE-grid-refresh-refreshbag', !!rb, JSON.stringify(ge.calls));
    const gv = await d.evaluate(() => {
      const srp = document.getElementById('srp');
      const grid = document.getElementById('backpackGrid');
      return { srp: !!srp, plain: srp ? srp.classList.contains('srg-plain') : false,
        srfg: !!document.getElementById('srfgTabs'), oldWrap: !!document.getElementById('srfgGridScroll'),
        gridInRail: !!(grid && grid.closest('.sr-gridhost')),
        gridShown: !!grid && grid.offsetParent !== null };
    }).catch(() => null);
    /* 批改#11 → 2026-11-12 契约演进：格子态=rail 壳 srg-plain（滚窗/778 锁退役——rail 壳
       自带 778 plain 高与格区滚动，染料桶同机制） */
    check('GE-grid-rail-plain', !!gv && gv.srp && gv.plain && !gv.srfg && !gv.oldWrap &&
      gv.gridInRail && gv.gridShown, JSON.stringify(gv));
    /* 12j：srg-plain 态标题=静态「角色背包」+信息条在场（rail 同 CSS=两页同款；旧官方
       panel-title/info-bar 异款问题随 rail 化根除） */
    const gja = await d.evaluate(() => {
      const rail = document.getElementById('srRail');
      const t = rail ? rail.querySelector('.sr-title') : null;
      const sub = rail ? rail.querySelector('.sr-headtxt > .sr-sub') : null;
      const store = rail ? rail.querySelector('.srStoreAll, #srStoreAll') : null;
      const tidy = rail ? rail.querySelector('#srTidy') : null;
      if (!t || !sub) return null;
      return { title: t.textContent || '-', sub: sub.textContent || '-',
        subD: getComputedStyle(sub).display, subH: Math.round(sub.getBoundingClientRect().height),
        storeBtn: !!store, tidyBtn: !!tidy };
    }).catch(() => null);
    check('GE-12j-btn-align-info', !!gja && gja.title === '角色背包' && /^空间： \d+ \/ \d+$/.test(gja.sub) &&
      gja.subD !== 'none' && gja.subH >= 28 && gja.storeBtn && gja.tidyBtn, JSON.stringify(gja));
    await d.click('#srgToggle'); await page.waitForTimeout(60);
  }

  /* FD3 pend 队列：超时面 + 合并键取件（bag 同 cfg 异 tl → 回放匹配 tl 实例） */
  await setMockItems({
    bag: [[999, 3, 1, 36000, 2, 0, 1, 1, 0, null, null, null, null, null, null, ''], [998, 3, 1, 0, 3, 0, 1, 1, 0, 5, null, null, null, null, null, '30.5|10|0|0|4']]
  }, []);
  await pushCtx('DyePanel');
  await showScene('DyePanel'); await glistReady('DyePanel');
  {
    const d = frameDoc('DyePanel');
    const wrapS2 = (fn) => d.evaluate(() => {
      window.__HZ_SENT__ = [];
      const orig = core.UnitySendEvent;
      core.UnitySendEvent = (n, p2) => { window.__HZ_SENT__.push([n, p2]); };
      window.__HZ_SENT_RESTORE__ = () => { core.UnitySendEvent = orig; };
    }).then(fn).finally(() => d.evaluate(() => window.__HZ_SENT_RESTORE__()));
    const exp = await wrapS2(async () => {
      await page.evaluate(() => { try { window.__CERAIL__.glist._pend('DyePanel', { key: '咖啡||', cfg: 3, name: '咖啡', at: Date.now() - 6000 }); } catch (e) {} });
      await scan(); await page.waitForTimeout(80);
      return {
        t: await d.evaluate(() => (document.getElementById('srgToast') || {}).textContent || '').catch(() => ''),
        q: await page.evaluate(() => (() => { try { return (window.__CERAIL__.glist._pend('DyePanel') || []).length; } catch (e) { return -1; } })()).catch(() => -1)
      };
    });
    check('FD3-pend-expiry', exp.t.indexOf('取件超时') >= 0 && exp.q === 0, JSON.stringify(exp));
    const rep = await wrapS2(async () => {
      await page.evaluate(() => { try { window.__CERAIL__.glist._pend('DyePanel', { key: '咖啡||', cfg: 3, name: '咖啡', at: Date.now() }); } catch (e) {} });
      await scan(); await page.waitForTimeout(80);
      return (await d.evaluate(() => window.__HZ_SENT__ || []).catch(() => [])).filter((c) => c[0] === 'ITEM_CLICK');
    });
    check('FD3-pend-mergekey-pick', rep.length === 1 && rep[0][1].itemId === 999, JSON.stringify(rep.map((c) => c[1].itemId)));
  }

  /* FD7 自定义柜名：srp_ctn_names 经 nm() 生效（重载页面让 NAMES 冷读） */
  await page.evaluate(() => { try { localStorage.setItem('srp_ctn_names', JSON.stringify({ '900101': '我的柜' })); } catch (e) { } });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HZ_CURRENT__ !== undefined && window.__HZ_CURRENT__() !== null, null, { timeout: 20000 });
  await setMockItems({ bag: [[901, 1, 2, 0, 0, 0, 1, 1, 0]], '900101': [[911, 1, 3, 0, 0, 0, 1, 1, 0]] }, [900101]);
  await pushCtx('DyePanel');
  await showScene('DyePanel'); await glistReady('DyePanel');
  {
    const d = frameDoc('DyePanel');
    const srcTxt = await d.evaluate(() => { const e = document.querySelector('.srg-src'); return e ? e.textContent : ''; }).catch(() => '');
    check('FD7-custom-ctn-name', srcTxt.indexOf('我的柜') >= 0, srcTxt);
    await page.evaluate(() => { try { localStorage.removeItem('srp_ctn_names'); } catch (e) { } });
  }

  /* ---- §FEFO V4/V5（作者 v2 终案）：右键取物=行内候选叠 timeLeft 升序（最快过期先出） ---- */
  /* V4：袋内两叠同名（无 uses/attr）tl 7200/48 → 右键回放 tl=48 那叠 */
  await setMockItems({
    bag: [[901, 1, 3, 7200, 0, 0, 1, 1, 0], [909, 1, 2, 48, 1, 0, 1, 1, 0]]
  }, null);
  await pushCtx('DyePanel');
  await showScene('DyePanel'); await glistReady('DyePanel');
  {
    const d = frameDoc('DyePanel');
    const r4f = await cmdSpy(() => (async () => {
      const wrap = await d.evaluate(() => {
        window.__HZ_SENT__ = [];
        const orig = core.UnitySendEvent;
        core.UnitySendEvent = (n, p2) => { window.__HZ_SENT__.push([n, p2]); };
        window.__HZ_SENT_RESTORE__ = () => { core.UnitySendEvent = orig; };
        return true;
      });
      const idx = await d.evaluate(() => Array.from(document.querySelectorAll('.srg-row')).findIndex((r) => r.textContent.indexOf('生态香米') >= 0)).catch(() => -1);
      if (idx < 0) return 'NOROW';
      await d.click('.srg-row:nth-child(' + (idx + 1) + ')', { button: 'right' });
      await page.waitForTimeout(60);
      const sent = await d.evaluate(() => window.__HZ_SENT__ || []);
      await d.evaluate(() => window.__HZ_SENT_RESTORE__());
      return sent.filter((c) => c[0] === 'ITEM_CLICK');
    })());
    check('V4-bag-fefo', r4f.r !== 'NOROW' && r4f.r.length === 1 && r4f.r[0][1].itemId === 909,
      'sent=' + JSON.stringify(r4f.r));
    /* V5：跨柜 FEFO——袋叠 tl=100 / 柜叠 tl=5 同键 → 右键走柜源 take{ids:[tl5]}，不回放 */
    await setMockItems({
      bag: [[901, 1, 3, 100, 0, 0, 1, 1, 0]],
      '900101': [[915, 1, 2, 5, 0, 0, 1, 1, 0]]
    }, [900101]);
    await pushCtx('DyePanel');
    await page.waitForTimeout(100);
    const r5f = await cmdSpy(() => (async () => {
      await d.evaluate(() => {
        window.__HZ_SENT__ = [];
        const orig = core.UnitySendEvent;
        core.UnitySendEvent = (n, p2) => { window.__HZ_SENT__.push([n, p2]); };
        window.__HZ_SENT_RESTORE__ = () => { core.UnitySendEvent = orig; };
      });
      const idx = await d.evaluate(() => Array.from(document.querySelectorAll('.srg-row')).findIndex((r) => r.textContent.indexOf('生态香米') >= 0)).catch(() => -1);
      if (idx < 0) return 'NOROW';
      await d.click('.srg-row:nth-child(' + (idx + 1) + ')', { button: 'right' });
      await page.waitForTimeout(60);
      const sent = await d.evaluate(() => (window.__HZ_SENT__ || []).filter((c) => c[0] === 'ITEM_CLICK'));
      await d.evaluate(() => window.__HZ_SENT_RESTORE__());
      return { sent };
    })());
    const take5 = (r5f.calls || []).filter((c) => c[0] === 'take').pop();
    check('V5-crossctn-fefo-take', r5f.r !== 'NOROW' && !!take5 && take5[1].from === 900101 && JSON.stringify(take5[1].ids) === '[915]' && (r5f.r.sent.length === 0 || r5f.r.sent[0][1].itemId >= 950000),
      'take=' + JSON.stringify(take5) + ' sent=' + r5f.r.sent.length);
  }
  await page.evaluate(() => { window.__HZ_GLIST__ = {}; });

  /* ---- §搜索输入 S1-S4（实机批改#3）：官方 SEARCH_FOCUS 键盘转发协议/真实键入/IME 提交/A·D 守卫 ---- */
  /* 协议取证：官方 ToolTable 输入框 focus→core.UnitySendEvent('SEARCH_FOCUS',{focused,ime})——
     WebUI KeyboardEnabled=0 全局关键盘转发，不发此事件=实机一个键都进不了 iframe（BackpackUI 注释实锤） */
  await setMockItems({
    bag: [[901, 1, 4, 0, 0, 0, 1, 1, 0], [902, 8, 2, 0, 1, 0, 1, 1, 0]],
    '900105': [[921, 10, 36, 0, 0, 0, 1, 1, 0]]
  }, [900105]);
  await pushCtx('Heater');
  await showScene('Heater'); await glistReady('Heater');
  {
    const d = frameDoc('Heater');
    const wrapS3 = (fn) => d.evaluate(() => {
      window.__HZ_SENT__ = [];
      const orig = core.UnitySendEvent;
      core.UnitySendEvent = (n, p2) => { window.__HZ_SENT__.push([n, p2]); };
      window.__HZ_SENT_RESTORE__ = () => { core.UnitySendEvent = orig; };
    }).then(fn).finally(() => d.evaluate(() => window.__HZ_SENT_RESTORE__()));
    /* S1：focus→SEARCH_FOCUS{focused:true,ime:true}；blur→{focused:false} */
    const s1 = await wrapS3(async () => {
      await d.click('#srgQ'); await page.waitForTimeout(40);
      const onFocus = await d.evaluate(() => (window.__HZ_SENT__ || []).slice());
      await d.click('#srgHead'); await page.waitForTimeout(40); /* 点头部=失焦 */
      const onBlur = await d.evaluate(() => (window.__HZ_SENT__ || []).slice());
      return { onFocus, onBlur };
    });
    const fEv = s1.onFocus.filter((c) => c[0] === 'SEARCH_FOCUS').pop();
    const bEv = s1.onBlur.filter((c) => c[0] === 'SEARCH_FOCUS').pop();
    check('S1-focus-protocol', !!fEv && fEv[1].focused === true && fEv[1].ime === true && !!bEv && bEv[1].focused === false,
      'focus=' + JSON.stringify(fEv) + ' blur=' + JSON.stringify(bEv));
    /* S2：真实键入过滤（keyboard.type 走真键盘事件） */
    const s2 = await (async () => {
      await d.click('#srgQ');
      await page.keyboard.type('木');
      await page.waitForTimeout(80);
      const rows = await d.evaluate(() => Array.from(document.querySelectorAll('.srg-row .srg-name')).map((n) => n.textContent));
      const q = await d.evaluate(() => document.getElementById('srgQ').value);
      await d.evaluate(() => { const e = document.getElementById('srgQ'); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
      return { rows, q };
    })();
    check('S2-real-typing', s2.q === '木' && s2.rows.length === 1 && s2.rows[0] === '木柴', JSON.stringify(s2));
    /* S3：IME 提交（insertText=输入法上屏路径，无 keydown） */
    const s3 = await (async () => {
      await d.click('#srgQ');
      await page.keyboard.insertText('木柴');
      await page.waitForTimeout(80);
      const rows = await d.evaluate(() => Array.from(document.querySelectorAll('.srg-row .srg-name')).map((n) => n.textContent));
      await d.evaluate(() => { const e = document.getElementById('srgQ'); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
      return rows;
    })();
    check('S3-ime-commit', s3.length === 1 && s3[0] === '木柴', JSON.stringify(s3));
    /* S4：a/d 热键双语境（批改#9 后契约更新）——①glist 在场=页签退役，a/d 全语境 0 切页
       （FG.active 收口）；②glist 关=旧方案复活（cfg 回退面），输入聚焦守卫原样有效：
       聚焦打字 0 切页、失焦恰 1 次 */
    const p1 = await cmdSpy(async () => {
      await d.click('#srgQ'); await page.waitForTimeout(30);
      await page.keyboard.press('d'); await page.waitForTimeout(60); /* 聚焦中按 d */
      await d.click('#srgHead'); await page.waitForTimeout(30);     /* 失焦再按 d */
      await page.keyboard.press('d'); await page.waitForTimeout(60);
      return true;
    });
    const swOwned = (p1.calls || []).filter((c) => c[0] === 'switchBag').length;
    check('S4-ad-dead-when-owned', swOwned === 0, 'ownedSw=' + swOwned);
    await glistOn('Heater', false); await scan(); await page.waitForTimeout(120); /* 旧方案复活（srfg 回装+FG.active=true） */
    const oldBack = await d.evaluate(() => !!document.getElementById('srfgTabs')).catch(() => false);
    const p2 = await cmdSpy(async () => {
      await d.evaluate(() => { const q = document.getElementById('srgQ'); if (q) q.blur(); }); /* glist 面板已拆，保险失焦 */
      await page.keyboard.press('d'); await page.waitForTimeout(60);
      return true;
    });
    const swOld = (p2.calls || []).filter((c) => c[0] === 'switchBag').length;
    check('S4-ad-guard-old-scheme', oldBack && swOld === 1, 'srfgBack=' + oldBack + ' oldSw=' + swOld);
    await glistOn('Heater', true); await scan(); await gwait('Heater'); await page.waitForTimeout(80); /* 复位=glist 在场 */
  }
  await page.evaluate(() => { window.__HZ_GLIST__ = {}; });

  /* ---- §使用次数显示 U1-U5（实机批改#4）：官方 item-use 方案镜像（剩余/最大+比例条）——
     次数不一致拆行是 v2 正确行为，显示出来消除「未合并」误判 ---- */
  await setMockItems({
    bag: [[901, 1, 2, 0, 0, 0, 1, 1, 0, null, null, null, null, null, null, '', 3, 5],
          [902, 1, 1, 0, 1, 0, 1, 1, 0, null, null, null, null, null, null, '', 1, 5],
          [903, 8, 2, 0, 2, 0, 1, 1, 0]],
    '900101': [[911, 1, 2, 0, 0, 0, 1, 1, 0, null, null, null, null, null, null, '', 3, 3]]
  }, [900101]);
  await pushCtx('DyePanel');
  await showScene('DyePanel'); await glistReady('DyePanel');
  {
    const d = frameDoc('DyePanel');
    const rowsInfo = await d.evaluate(() => Array.from(document.querySelectorAll('.srg-row')).map((r) => ({
      name: (r.querySelector('.srg-name') || {}).textContent,
      use: r.querySelector('.srg-use') ? r.querySelector('.srg-use').textContent : null,
      bar: r.querySelector('.srg-use-bar-fill') ? r.querySelector('.srg-use-bar-fill').style.background : null,
      cnt: (r.querySelector('.srg-count') || {}).textContent
    }))).catch(() => []);
    const r35 = rowsInfo.find((r) => r.use === '3/5');
    const r15 = rowsInfo.find((r) => r.use === '1/5');
    const r33 = rowsInfo.find((r) => r.use === '3/3');
    check('U1-badge-3of5', !!r35 && !!r15 && !!r33, JSON.stringify(rowsInfo.map((r) => [r.name, r.use])));
    check('U1-bar-colors', !!r35 && /255, 193, 7|FFC107/i.test(r35.bar) && !!r15 && /244, 67, 54|F44336/i.test(r15.bar) && !!r33 && /76, 175, 80|4CAF50/i.test(r33.bar),
      '35=' + (r35 && r35.bar) + ' 15=' + (r15 && r15.bar) + ' 33=' + (r33 && r33.bar));
    check('U3-nouses-nobadge', rowsInfo.every((r) => r.use !== null || r.name === '草药'), JSON.stringify(rowsInfo.filter((r) => r.use === null)));
    /* U4 悬停含使用次数行（v2.2.1：详情弹窗改道官方 ItemDetailPopup——左键半截改断言 idetail
       实例级命令；官方弹窗内容官方渲染非 harness 面） */
    const u4r = await cmdSpy(() => d.evaluate(() => { const r = Array.from(document.querySelectorAll('.srg-row')).find((x) => x.querySelector('.srg-use')); if (r) { r.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); r.click(); } return true; }));
    await page.waitForTimeout(50);
    const tipTxt = await d.evaluate(() => { const e = document.getElementById('srgTip'); return e ? e.textContent : ''; }).catch(() => '');
    const u4c = (u4r.calls || []).filter((c) => c[0] === 'idetail').pop();
    check('U4-tip-detail-uses', tipTxt.indexOf('使用次数：3/5') >= 0 && !!u4c && u4c[1].item > 0 && u4c[1].owner > 0,
      JSON.stringify({ tip: tipTxt.slice(0, 60), idetail: u4c }));
  }
  /* U5：max 入键——同名同次数异 max（变体边缘）拆行 */
  await setMockItems({
    bag: [[901, 1, 1, 0, 0, 0, 1, 1, 0, null, null, null, null, null, null, '', 3, 5],
          [902, 1, 1, 0, 1, 0, 1, 1, 0, null, null, null, null, null, null, '', 3, 3]]
  }, null);
  await pushCtx('DyePanel');
  a = await agg('DyePanel');
  check('U5-max-in-key', a.rows.length === 2, 'rows=' + a.rows.length);
  await page.evaluate(() => { window.__HZ_GLIST__ = {}; });

  /* ---- §版式 L1-L5（实机批改#6：染料桶列表随内容涨缩+超宽+无滚动条）----
     因：基类 flex:1 1 auto/width:100% 只在「有界纵向 flex 宿主」成立——DyePanel 宿主 #srp=裸块
     （.dye-system 行内 shrink-to-fit），宽随行内容环形解析、高 auto 随行数涨、.srg-list overflow-y
     永不触发。正解=列表态版式铁约束（:not(.srg-gridmode)）：宽 616（spec §5 定稿）×高 816
     （spec 留实现期裁定=侧栏恒定高，与格子态 rail 等高）。oracle=offsetWidth/Height 逐像素 +
     小/大两套数据同盒（随内容不变）+ 大数据真滚（scrollHeight>clientHeight）+ 格子态塌缩不回归。 */
  const boxOf = (KEY) => frameDoc(KEY).evaluate(() => {
    const p = document.getElementById('srgPanel'), l = document.getElementById('srgList');
    if (!p || !l) return null;
    return {
      w: p.offsetWidth, h: p.offsetHeight,
      listOvY: getComputedStyle(l).overflowY,
      listScroll: l.scrollHeight - l.clientHeight,
      rows: document.querySelectorAll('.srg-row').length,
      gridmode: p.classList.contains('srg-gridmode')
    };
  }).catch(() => null);
  await page.evaluate((base) => window.__HZ_MOCKSET__(base), BASE_MOCK); /* U 系列残底复位 */
  await showScene('DyePanel'); await glistReady('DyePanel');
  const small = await boxOf('DyePanel');
  check('L1-dye-fixed-box-small', !!small && !small.gridmode && small.w === 616 && small.h === 816,
    JSON.stringify(small));
  /* A6 同源 320 色素 cfg → 300 行渲染，同盒对照 */
  await page.evaluate(() => {
    const N = 320, icfg = [], bag = [], PG = {};
    for (let i = 1; i <= N; i++) {
      icfg.push([i, 'G' + i, '#ico#v' + i, 1, 99, 1, 1, '食材', 0, 0, 0, 0, 0, 0]);
      bag.push([900000 + i, i, 1, 0, i % 12, Math.floor(i / 12), 1, 1, 0]);
      PG[i] = '[[3,1]]';
    }
    window.__HZ_DYEPIG__ = PG;
    window.__HZ_MOCKSET__({ rev: 1, ctx: {}, bag: 1, ctn: [], lib: [], icfg, items: { bag } });
  });
  await pushCtx('DyePanel'); await scan(); await page.waitForTimeout(80);
  const many = await boxOf('DyePanel');
  check('L2-dye-fixed-box-many', !!many && many.rows === 300 && many.w === 616 && many.h === 816,
    JSON.stringify(many));
  check('L3-box-content-invariant', !!small && !!many && small.w === many.w && small.h === many.h,
    'small=' + small.w + 'x' + small.h + ' many=' + many.w + 'x' + many.h);
  check('L4-list-scrolls', !!many && many.listOvY === 'auto' && many.listScroll > 0,
    'ovY=' + (many && many.listOvY) + ' scrollDelta=' + (many && many.listScroll));
  /* 格子态塌缩不回归：固定高仅 :not(.srg-gridmode)——300 行在场切格子，面板不得占 816 高 */
  await frameDoc('DyePanel').click('#srgToggle').catch(() => { });
  await page.waitForTimeout(60);
  const grid = await boxOf('DyePanel');
  check('L5-gridmode-collapse', !!grid && grid.gridmode && grid.h < 816,
    JSON.stringify(grid));
  /* 批改#9：染料桶格子态=rail 简洁态（#srp.srg-plain——作者裁定「只保留官方默认背包」：
     柜子页签/搜索/标签/工具行全隐，plainbag 同形并枝）；切回列表=类还原 */
  const plain = await frameDoc('DyePanel').evaluate(() => {
    const srp = document.getElementById('srp');
    const rail = document.getElementById('srRail');
    const tabs = rail ? rail.querySelector('.sr-tabsrow') : null;
    const search = rail ? rail.querySelector('.sr-searchrow') : null;
    const head = rail ? rail.querySelector('.sr-head') : null;
    const sub = rail ? rail.querySelector('.sr-headtxt > .sr-sub') : null;
    return { plain: srp ? srp.classList.contains('srg-plain') : null,
      tabsD: tabs ? getComputedStyle(tabs).display : 'NOTABS', searchD: search ? getComputedStyle(search).display : 'NOSEARCH',
      headD: head ? getComputedStyle(head).display : 'NOHEAD',
      title: (document.getElementById('srTitle') || {}).textContent || '-',
      sub: sub ? sub.textContent : '-' };
  }).catch(() => null);
  check('L5-grid-plain-on', !!plain && plain.plain === true && plain.tabsD === 'none' && plain.searchD === 'none' && plain.headD === 'flex' &&
    plain.title === '角色背包' && /^空间： \d+ \/ \d+$/.test(plain.sub), JSON.stringify(plain)); /* 12b+12g：标题行反藏还头+静态背包专属标题（跟容器切换无关=作者实报「变来变去」防回退） */
  await frameDoc('DyePanel').click('#srgToggle').catch(() => { }); /* 切回列表（后续 Z 检查留净态） */
  await page.waitForTimeout(40);
  const plainOff = await frameDoc('DyePanel').evaluate(() => {
    const srp = document.getElementById('srp');
    const rail = document.getElementById('srRail');
    const tabs = rail ? rail.querySelector('.sr-tabsrow') : null;
    return { plain: srp ? srp.classList.contains('srg-plain') : null, tabsD: tabs ? getComputedStyle(tabs).display : 'NOTABS' };
  }).catch(() => null);
  check('L5-grid-plain-off', !!plainOff && plainOff.plain === false && plainOff.tabsD !== 'none', JSON.stringify(plainOff));
  /* Heater 同规格：官方 .panel 宿主（flex 列）下同盒 */
  await page.evaluate(() => { delete window.__HZ_DYEPIG__; });
  /* 实机批改#7 正解后：暖炉断言从「816 定盒」改「填满锁定宿主」——宿主=mod 高度锁面板
     （fgSyncHeight 内联 778!important）有界 flex 列，srg-fill 填满+内滚；816 铁约束只属
     染料桶（无界 #srp 裸块）。数据法=保基座（ctn/lib 清空会拆 bagtabs 族→锁随拆失，探针
     C 实锤）：cfg10/11（pushCtx 给这两 cfg 补燃料尾列）× uses 1..30 变体=60 行真滚测「不出卡」。 */
  await setMockItems({
    bag: Array.from({ length: 60 }, function (x, i) {
      i++;
      return [950000 + i, i % 2 ? 10 : 11, 1, 0, i % 12, Math.floor(i / 12), 1, 1, 0,
        null, null, null, null, null, null, '', Math.ceil(i / 2), 5];
    })
  }, null);
  await showScene('Heater'); await glistReady('Heater');
  await frameDoc('Heater').fill('#srgQ', '').catch(() => { }); await page.waitForTimeout(60); /* S4 键盘测试残留查询 'd' 清场（GLQ 过滤=0 行假错） */
  await pushCtx('Heater'); await scan(); await page.waitForTimeout(100); /* 喂合成燃料数据+促装配落定后再探 */
  const hbox = await frameDoc('Heater').evaluate(() => {
    /* 2026-11-12 rail 化：宿主=#srp（官方 .panel 已被替换——染料桶同路，816 铁约束接管 778 锁） */
    const host = document.getElementById('srp');
    const p = document.getElementById('srgPanel'), l = document.getElementById('srgList');
    if (!host || !p || !l) return null;
    const hr = host.getBoundingClientRect(), pr = p.getBoundingClientRect();
    return {
      hostH: host.clientHeight, hostB: Math.round(hr.bottom),
      pw: p.offsetWidth, ph: p.offsetHeight, pb: Math.round(pr.bottom),
      rows: document.querySelectorAll('.srg-row').length,
      scroll: l.scrollHeight - l.clientHeight,
      gridmode: p.classList.contains('srg-gridmode'),
      srfgTabs: !!document.getElementById('srfgTabs')
    };
  }).catch(() => null);
  check('L5-heater-fill-host', !!hbox && !hbox.gridmode &&
    hbox.pw === 616 && Math.abs(hbox.ph - 816) <= 1, /* 染料桶 L2 同口径：816 铁约束盒 */
    JSON.stringify(hbox));
  check('L5-heater-old-scheme-retired', !!hbox && hbox.srfgTabs === false, /* 批改#9：glist 在场=srfg 退役（2026-11-12 起 rail 壳在场） */
    JSON.stringify(hbox));
  check('L7-heater-no-escape', !!hbox && hbox.pb <= hbox.hostB + 1 && hbox.rows > 0 && hbox.scroll > 0,
    JSON.stringify(hbox));
  /* L6（实机批改#7 暖炉溢出屏幕）：官方 createViewportFit 只在 BagMsg 量 .heater-system——
     glist 挂载/互切在其后，须补发 resize 促 _fit 复测（3645/3791 高锁同源）。oracle=窗口
     resize 计数：互切/拆净必发（≥1），稳态重推零发（无风暴、幂等）。 */
  {
    const d = frameDoc('Heater');
    await d.evaluate(() => { window.__HZ_RSZ__ = 0; window.addEventListener('resize', () => { window.__HZ_RSZ__++; }); });
    await pushCtx('Heater'); await scan(); await page.waitForTimeout(60);
    const steady = await d.evaluate(() => window.__HZ_RSZ__);
    await d.click('#srgToggle').catch(() => { }); await page.waitForTimeout(60);
    const afterGrid = await d.evaluate(() => window.__HZ_RSZ__);
    await d.click('#srgToggle').catch(() => { }); await page.waitForTimeout(60);
    const afterList = await d.evaluate(() => window.__HZ_RSZ__);
    check('L6-steady-no-resize-storm', steady === 0, 'steady=' + steady);
    check('L6-toggle-fires-resize', afterGrid - steady >= 1 && afterList - afterGrid >= 1,
      'grid=+' + (afterGrid - steady) + ' list=+' + (afterList - afterGrid));
    await glistOn('Heater', false); await scan(); await page.waitForTimeout(60);
    const afterTeardown = await d.evaluate(() => window.__HZ_RSZ__);
    check('L6-teardown-fires-resize', afterTeardown - afterList >= 1, 'teardown=+' + (afterTeardown - afterList));
  }
  await page.evaluate(() => { window.__HZ_GLIST__ = {}; });

  /* ---- §GF 燃油发电机（批改#8：复用暖炉——作者令「两页基本一致，都是可燃物加入燃料槽」）----
     同构面全查：装配六段/旧方案退役（无 srfg 三件）/2026-11-12 rail 化后宿主=#srp（816 铁约束）
     /60 燃料行内滚/格子态=rail 壳 srg-plain+refreshBag 杠杆/拆净还原（rail 卸载+srfg 复活）。
     数据法同 L5（cfg10/11×uses 变体，pushCtx 给发电机页补燃料尾列）。 */
  await setMockItems({
    bag: Array.from({ length: 60 }, function (x, i) {
      i++;
      return [960000 + i, i % 2 ? 10 : 11, 1, 0, i % 12, Math.floor(i / 12), 1, 1, 0,
        null, null, null, null, null, null, '', Math.ceil(i / 2), 5];
    })
  }, null);
  await showScene('FuelGenerator'); await glistReady('FuelGenerator');
  await frameDoc('FuelGenerator').fill('#srgQ', '').catch(() => { }); await page.waitForTimeout(60);
  await pushCtx('FuelGenerator'); await scan(); await page.waitForTimeout(100);
  {
    const d = frameDoc('FuelGenerator');
    const fx = await d.evaluate(() => {
      const host = document.getElementById('srp'); /* 2026-11-12 rail 化：宿主=#srp（官方 .panel 已被替换） */
      const p = document.getElementById('srgPanel'), l = document.getElementById('srgList');
      if (!host || !p || !l) return null;
      const hr = host.getBoundingClientRect(), pr = p.getBoundingClientRect();
      return {
        segs: ['srgHead', 'srgSearch', 'srgChips', 'srgHint', 'srgList', 'srgFootL'].every((id) => !!document.getElementById(id)),
        cssInj: !!document.getElementById('srpRail'), /* 批改#10：glistBuild 自保注入（rail mount 注入亦同锚） */
        title: (document.querySelector('#srgHead .srg-title') || {}).textContent || '',
        railIn: !!document.getElementById('srRail'),
        pw: p.offsetWidth, ph: p.offsetHeight,
        pb: Math.round(pr.bottom), hostB: Math.round(hr.bottom),
        rows: document.querySelectorAll('.srg-row').length, scroll: l.scrollHeight - l.clientHeight,
        srfgTabs: !!document.getElementById('srfgTabs'),
        hint: (document.getElementById('srgHint') || {}).textContent || '',
        chip: (document.querySelector('#srgChips .srg-chip') || {}).textContent || ''
      };
    }).catch(() => null);
    check('GF1-mount-six-segments', !!fx && fx.segs && fx.title.indexOf('全局物品栏') >= 0, JSON.stringify(fx && [fx.segs, fx.title]));
    check('GF1-css-injected', !!fx && fx.cssInj === true, 'cssInj=' + (fx && fx.cssInj)); /* 批改#10 回归锚：无样式文本流缺陷 */
    check('GF2-old-scheme-retired', !!fx && fx.srfgTabs === false && fx.railIn === true, JSON.stringify(fx && [fx.srfgTabs, fx.railIn]));
    check('GF3-fill-locked-host', !!fx && fx.pw === 616 && Math.abs(fx.ph - 816) <= 1,
      JSON.stringify(fx && [fx.pw, fx.ph]));
    check('GF4-rows-scroll-noescape', !!fx && fx.rows === 60 && fx.scroll > 0 && fx.pb <= fx.hostB + 1,
      JSON.stringify(fx && [fx.rows, fx.scroll, fx.pb, fx.hostB]));
    check('GF5-scene-preset', !!fx && fx.hint.indexOf('燃料槽') >= 0 && fx.chip.indexOf('仅可燃物') >= 0,
      JSON.stringify(fx && [fx.hint, fx.chip]));
    /* GF6 格子态：refreshBag 杠杆 + rail 壳 srg-plain（格进 .sr-gridhost、srfg 无） */
    const gsp = await cmdSpy(async () => { await d.click('#srgToggle'); await page.waitForTimeout(80); return true; });
    const rbk = (gsp.calls || []).filter((c) => c[0] === 'refreshBag').pop();
    const gv = await d.evaluate(() => {
      const srp = document.getElementById('srp');
      const grid = document.getElementById('backpackGrid');
      return { srp: !!srp, plain: srp ? srp.classList.contains('srg-plain') : false,
        srfg: !!document.getElementById('srfgTabs'), oldWrap: !!document.getElementById('srfgGridScroll'),
        gridInRail: !!(grid && grid.closest('.sr-gridhost')), gridShown: !!grid && grid.offsetParent !== null,
        gridmode: (document.getElementById('srgPanel') || {}).className || 'NOPANEL' };
    }).catch(() => null);
    check('GF6-grid-rail-plain-refreshbag', !!gv && !!rbk && gv.srp && gv.plain && !gv.srfg && !gv.oldWrap &&
      gv.gridInRail && gv.gridShown && /srg-gridmode/.test(gv.gridmode),
      JSON.stringify({ rb: !!rbk, gv }));
    await d.click('#srgToggle'); await page.waitForTimeout(60);
    /* GF7 拆净：glist 面板移除+rail 卸载（官方 .panel 还原、格搬回原位）+旧方案按设计复活
       （fgSettle 自愈回装 srfg 并自上 778 锁——门关=柜子页签方案原路回归，作者批改#9 的 cfg 回退面） */
    await glistOn('FuelGenerator', false); await scan(); await page.waitForTimeout(80);
    const td = await d.evaluate(() => {
      const host = document.querySelector('.generator-system > .panel:not(.gen-panel)');
      const grid = document.getElementById('backpackGrid');
      return { panel: !!document.getElementById('srgPanel'), railGone: !document.getElementById('srp'),
        hostBack: !!host, gridHome: !!(host && grid && host.contains(grid)), /* srfg 复活按 v1.8.14 设计把格包进自持滚窗——宿主子树内即归位 */
        srfgBack: !!document.getElementById('srfgTabs'),
        lock: host ? (host.style.height || '(none)') : 'NOHOST' };
    }).catch(() => null);
    check('GF7-teardown-restores', !!td && td.panel === false && td.railGone && td.hostBack && td.gridHome &&
      (td.lock === '(none)' || (td.srfgBack && /778/.test(td.lock))),
      JSON.stringify(td));
  }
  await page.evaluate(() => { window.__HZ_GLIST__ = {}; });

  /* ---- 尾：零 console error / pageerror ---- */
  check('Z-console-clean', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' ; '));
  check('Z-pageerror-clean', pageErrors.length === 0, pageErrors.slice(0, 3).join(' ; '));

  await browser.close();
  const pass = results.filter((r) => r.ok).length;
  console.log('---- glist: ' + pass + '/' + results.length + ' PASS ----');
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('HARNESS CRASH', e); process.exit(2); });
