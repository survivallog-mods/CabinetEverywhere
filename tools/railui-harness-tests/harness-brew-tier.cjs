/* 酿酒桶品质角标 harness（brew spec §5，serve.cjs 须已在 8180）。
   §1 契约读取（Task 2）：icfg 尾列 canBrew（BrewPanel 页 16 列/其他页 15 列）+ ctx.brewP1/P2
   阈值（P2≤P1 兜底 0/0.5）+ brewTierOf 三档派生（bw=0 或 s1≤0 → -1 不可酿）。
   §2 菜单收敛（Task 3）/ §3 排序（Task 4）/ §4 角标（Task 5）随任务追加。
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

  const pushCtx = (key) => page.evaluate((k) => window.__HZ_PUSH__(k), key);
  /* 捕获最近一次 setData 的契约（icfg 形状断言用——测试侧包装，不动 SUT/夹具） */
  await page.evaluate(() => {
    window.__HZ_LASTJ__ = null;
    const orig = window.__CERAIL__.setData;
    window.__CERAIL__.setData = function (j) { window.__HZ_LASTJ__ = j; return orig.apply(this, arguments); };
  });
  const lastIcfgLens = () => page.evaluate(() => (window.__HZ_LASTJ__ || { icfg: [] }).icfg.map((r) => r.length));

  /* §1 数据基座：bag 四路覆盖——烈(901 cfg1 25/10=2.5)/普(902 cfg2 4/20=0.2)/
     劣(903 cfg3 -25/10=-2.5)/不可酿(904 cfg5 铁钉 bw=0;906 cfg7 s1=null→-1;
     905 cfg7 2/5=0.4→普，§3 同品质次键用) */
  const mock = await page.evaluate(() => window.__HZ_MOCKSET__());
  mock.items.bag = [
    [901, 1, 3, 7200, 0, 0, 1, 1, 0, 10, 25, null, null, null, null],
    [902, 2, 5, 10800, 1, 1, 1, 1, 0, 20, 4, null, null, null, null],
    [903, 3, 2, 3600, 2, 0, 1, 1, 0, 10, -25, null, null, null, null],
    [904, 5, 40, 0, 3, 0, 1, 1, 0, null, null, null, null, null, null],
    [905, 7, 3, 0, 4, 0, 1, 1, 0, 5, 2, null, null, null, null],
    [906, 7, 1, 0, 5, 1, 1, 1, 0, null, 9, null, null, null, null]
  ];
  await page.evaluate((j) => window.__HZ_MOCKSET__(j), mock);

  const tier = async (cfgId, s1, s2) => {
    try { return await page.evaluate(([c, a, b]) => window.__CERAIL__.brewTier({ cfgId: c, s1: a, s2: b }), [cfgId, s1, s2]); }
    catch (e) { return 'ERR:' + String(e).slice(0, 60); }
  };

  /* ① 契约形状：BrewPanel icfg 16 列（14 基座+uses 占位+canBrew=C# 真形状）/ 其他页 14 列
     （夹具基座冻结形状；夹具页门控=C# brewCols 同口径——Ruling 见 ledger） */
  await pushCtx('BrewPanel');
  check('S1-icfg-brew-tail', JSON.stringify(await lastIcfgLens()) === JSON.stringify(new Array(12).fill(16)), 'lens=' + JSON.stringify(await lastIcfgLens()));
  await pushCtx('Cooking');
  check('S1-icfg-other-noTail', JSON.stringify(await lastIcfgLens()) === JSON.stringify(new Array(12).fill(14)), 'lens=' + JSON.stringify(await lastIcfgLens()));
  await pushCtx('BrewPanel');

  /* ② 三档派生 + 不可酿（经 __CERAIL__.brewTier 自检口——dispInfo 先例） */
  check('S1-tier-strong', await tier(1, 10, 25) === 2, 'got ' + await tier(1, 10, 25));
  check('S1-tier-normal', await tier(2, 20, 4) === 1, 'got ' + await tier(2, 20, 4));
  check('S1-tier-low', await tier(3, 10, -25) === 0, 'got ' + await tier(3, 10, -25));
  check('S1-tier-nonbrew', await tier(5, 10, 25) === -1, 'got ' + await tier(5, 10, 25));
  check('S1-tier-nosat', await tier(7, null, 9) === -1, 'got ' + await tier(7, null, 9));

  /* ③ 阈值兜底：P2≤P1（0.9/0.5）→ 回 0/0.5，0.2 仍普通（不随 0.9 掉劣质） */
  await page.evaluate(() => { window.__HZ_BREWP1__ = 0.9; });
  await pushCtx('BrewPanel');
  check('S1-threshold-fallback', await tier(2, 20, 4) === 1, 'P1=0.9 got ' + await tier(2, 20, 4));
  await page.evaluate(() => { window.__HZ_BREWP1__ = 0; });
  await pushCtx('BrewPanel');

  /* ---- §2 菜单收敛（Task 3）：BrewPanel 两项/其他页 7 项/NB 数组路径零改动 ---- */
  const showScene = async (key) => {
    await page.getByRole('button', { name: key, exact: true }).click();
    await page.waitForFunction((k) => {
      for (let i = 0; i < window.frames.length; i++) {
        try {
          const d = window.frames[i].document;
          if (!window.frames[i].location.href.includes('/' + k + '.html')) continue;
          /* rail 页=srRail 在位；BackpackUI live 原生页=NB 按钮条（srnSortBtn）在位 */
          const r = d.getElementById('srRail'), nb = d.getElementById('srnSortBtn');
          if ((r && r.isConnected) || (nb && nb.isConnected)) return true;
        } catch (e) { }
      } return false;
    }, key, { timeout: 9000 });
  };
  const frameEl = (key) => page.frames().find((f) => f.url().includes('/fixtures/' + key + '.html'));
  const menuItems = async (key) => frameEl(key).evaluate(() => {
    document.getElementById('srFoodSort').click();
    return [...document.querySelectorAll('#srFootSortBody button')].map((b) => b.textContent.trim());
  });
  await showScene('BrewPanel');
  let m = await menuItems('BrewPanel');
  check('S2-brew-menu-2items', m.length === 2 && m[0] === '⊞默认' && m[1] === '🍗饱腹度', JSON.stringify(m));
  const toastText = async () => frameEl('BrewPanel').evaluate(() => { const t = document.getElementById('srToast'); return t && !t.hidden ? t.textContent : ''; });
  await frameEl('BrewPanel').evaluate(() => document.querySelector('[data-fsort="sat"]').click());
  check('S2-brew-sat-toast', (await toastText()).indexOf('烈→普→劣') >= 0, await toastText());
  const btnLbl = async () => frameEl('BrewPanel').evaluate(() => document.getElementById('srFoodSortLbl').textContent);
  check('S2-brew-sat-label', (await btnLbl()) === '饱腹度', await btnLbl());
  await frameEl('BrewPanel').evaluate(() => { document.getElementById('srFoodSort').click(); document.querySelector('[data-fsort="official"]').click(); });
  check('S2-brew-back-official', (await btnLbl()) === '排序', await btnLbl());
  await showScene('Cooking');
  m = await menuItems('Cooking');
  check('S2-cook-menu-7items', m.length === 7 && m[1] === '🍗饱腹', JSON.stringify(m));
  await frameEl('Cooking').evaluate(() => { document.getElementById('srFoodSort').click(); document.querySelector('[data-fsort="official"]').click(); });
  await showScene('BackpackUI');
  const nbItems = await frameEl('BackpackUI').evaluate(() => {
    const b = document.getElementById('srnSortBtn'); if (!b) return null;
    b.click();
    return [...document.querySelectorAll('#srnSortPop button')].map((x) => x.getAttribute('data-k'));
  });
  check('S2-nb-menu-7items', nbItems && nbItems.length === 7 && nbItems[1] === 'sat', JSON.stringify(nbItems));

  /* ---- §3 排序比较器（Task 4）：品质主键 烈→普→劣→不可酿垫底，同品质饱腹降序 ---- */
  const gridOrder = async (key, containerSel) => frameEl(key).evaluate((sel) => {
    const its = [...document.querySelectorAll(sel + ' .item')];
    return its.map((el) => ({
      id: parseInt(el.id, 10),
      x: parseFloat(el.style.left), y: parseFloat(el.style.top)
    })).sort((a, b) => (a.y - b.y) || (a.x - b.x)).map((o) => o.id);
  }, containerSel);
  const pickSort = async (key, k) => frameEl(key).evaluate((kk) => {
    document.getElementById('srFoodSort').click();
    const b = document.querySelector('[data-fsort="' + kk + '"]'); if (b) b.click();
  }, k);
  await showScene('BrewPanel');
  await pickSort('BrewPanel', 'sat');
  /* 烈(901 2.5) → 普 s1 降序(902 s1=20 → 905 s1=5) → 劣(903) → 不可酿(904 s1=null、906 s1=null，稳定序) */
  let ord = await gridOrder('BrewPanel', '#bagGrid');
  check('S3-brew-tier-primary', JSON.stringify(ord) === JSON.stringify([901, 902, 905, 903, 904, 906, 907, 908]), JSON.stringify(ord));
  await pickSort('BrewPanel', 'official');
  await showScene('Cooking');
  await pickSort('Cooking', 'sat');
  /* 回归：Cooking 纯 s1 降序，tier 不参与——902(20)→901(10)→903(10，稳定)→905(5)→null 垫底
     （907/908=nudge 喂官方模型的通用物品，无契约行 join→null，按稳定序垫底） */
  ord = await gridOrder('Cooking', '#backpackGrid');
  check('S3-cook-pure-sat', JSON.stringify(ord) === JSON.stringify([902, 901, 903, 905, 904, 906, 907, 908]), JSON.stringify(ord));
  await pickSort('Cooking', 'official');

  /* ---- §4 双层角标（Task 5）：数值+品质色角标；仅可酿物品；重推重建；默认序清层；Cooking 无品质 ---- */
  const badges = async (key) => frameEl(key).evaluate(() => {
    const layer = document.getElementById('srBadgeLayer');
    const out = { total: 0, tiers: {}, byItem: {} };
    if (!layer) return out;
    const its = [...document.querySelectorAll('.sr-gridhost .item')];
    const bis = [...layer.querySelectorAll('i')];
    bis.forEach((bi) => {
      const bl = parseFloat(bi.style.left), bt = parseFloat(bi.style.top);
      const m = its.find((it) => Math.abs((it.offsetLeft + it.offsetWidth) - bl) < 3 && Math.abs(it.offsetTop - bt) < 3);
      const sp = bi.querySelector('.sr-tier');
      const entry = { text: bi.textContent, tier: sp ? sp.textContent : null, color: sp ? getComputedStyle(sp).color : null };
      if (m) out.byItem[m.id] = entry;
      if (sp) out.tiers[sp.textContent] = (out.tiers[sp.textContent] || 0) + 1;
    });
    out.total = bis.length;
    return out;
  });
  await showScene('BrewPanel');
  await pickSort('BrewPanel', 'sat');
  let bd = await badges('BrewPanel');
  const TIER_RGB = { '烈': 'rgb(224, 137, 155)', '普': 'rgb(232, 176, 75)', '劣': 'rgb(157, 196, 127)' };
  check('S4-brew-tier-counts', bd.tiers['烈'] === 1 && bd.tiers['普'] === 2 && bd.tiers['劣'] === 1, JSON.stringify(bd.tiers));
  check('S4-brew-901-strong', bd.byItem['901'] && bd.byItem['901'].tier === '烈' && bd.byItem['901'].color === TIER_RGB['烈'] && bd.byItem['901'].text.indexOf('+10') === 0, JSON.stringify(bd.byItem['901']));
  check('S4-brew-902-normal', bd.byItem['902'] && bd.byItem['902'].tier === '普' && bd.byItem['902'].color === TIER_RGB['普'], JSON.stringify(bd.byItem['902']));
  check('S4-brew-903-low', bd.byItem['903'] && bd.byItem['903'].tier === '劣' && bd.byItem['903'].color === TIER_RGB['劣'], JSON.stringify(bd.byItem['903']));
  check('S4-brew-904-notier', bd.byItem['904'] === undefined, JSON.stringify(bd.byItem['904'])); /* v14.1 修订：不可酿→整枚 <i> 不画（置灰且无数值角标） */
  check('S4-brew-907-notier', bd.byItem['907'] === undefined, JSON.stringify(bd.byItem['907']));
  const bd0 = JSON.stringify(bd);
  await pushCtx('BrewPanel'); /* 官方重渲染+MO 重画（50ms 防抖） */
  await page.waitForTimeout(400);
  bd = await badges('BrewPanel');
  check('S4-brew-repush-rebuild', JSON.stringify(bd) === bd0, 'before=' + bd0.slice(0, 80) + ' after=' + JSON.stringify(bd).slice(0, 80));
  await pickSort('BrewPanel', 'official');
  bd = await badges('BrewPanel');
  check('S4-brew-official-clear', bd.total === 0, 'total=' + bd.total);
  await showScene('Cooking');
  await pickSort('Cooking', 'sat');
  bd = await badges('Cooking');
  check('S4-cook-no-tier', bd.total > 0 && !Object.keys(bd.tiers).length, 'total=' + bd.total + ' tiers=' + JSON.stringify(bd.tiers));
  await pickSort('Cooking', 'official');

  /* ---- §5 v14.1 独立排序径 + 置灰 + 闪烁根修（作者 2026-11-07 令）----
     ① 不可酿物品（含非食物/无饱腹/无契约行）= 置灰遮罩 .sr-brewdim 且无 <i> 数值角标
     ② 排序径与公共比较器分离（brew 专属 apply），可酿序照旧 烈→普→劣→同品质饱腹降序
     ③ 静止性：排序落定后官方格 800ms 零 childList 变更（自激环=悬停/点击失效+闪烁根） */
  const brewView = async () => frameEl('BrewPanel').evaluate(() => {
    const layer = document.getElementById('srBadgeLayer');
    const its = [...document.querySelectorAll('.sr-gridhost .item')];
    const bis = layer ? [...layer.querySelectorAll('i')] : [];
    const dims = layer ? [...layer.querySelectorAll('.sr-brewdim')] : [];
    const dimIds = dims.map((d) => {
      const dl = parseFloat(d.style.left), dt = parseFloat(d.style.top);
      const m = its.find((it) => Math.abs(it.offsetLeft - dl) < 3 && Math.abs(it.offsetTop - dt) < 3);
      return m ? parseInt(m.id, 10) : null;
    }).filter((x) => x != null).sort((a, b) => a - b);
    const badgeIds = bis.map((bi) => {
      const bl = parseFloat(bi.style.left), bt = parseFloat(bi.style.top);
      const m = its.find((it) => Math.abs((it.offsetLeft + it.offsetWidth) - bl) < 3 && Math.abs(it.offsetTop - bt) < 3);
      return m ? parseInt(m.id, 10) : null;
    }).filter((x) => x != null).sort((a, b) => a - b);
    return { dimIds, badgeIds, dimCount: dims.length };
  });
  const calmMs = async (key, containerSel, ms) => frameEl(key).evaluate(([sel, t]) => new Promise((res) => {
    const g = document.querySelector(sel);
    if (!g) { res(-1); return; }
    let n = 0;
    const mo = new MutationObserver((l) => { n += l.length; });
    mo.observe(g, { childList: true, subtree: true });
    setTimeout(() => { mo.disconnect(); res(n); }, t);
  }), [containerSel, ms]);
  await showScene('BrewPanel');
  await pickSort('BrewPanel', 'sat');
  let v = await brewView();
  check('S5-brew-dim-ids', JSON.stringify(v.dimIds) === JSON.stringify([904, 906, 907, 908]), JSON.stringify(v.dimIds));
  check('S5-brew-badge-ids', JSON.stringify(v.badgeIds) === JSON.stringify([901, 902, 903, 905]), JSON.stringify(v.badgeIds));
  ord = await gridOrder('BrewPanel', '#bagGrid');
  check('S5-brew-order-keep', JSON.stringify(ord) === JSON.stringify([901, 902, 905, 903, 904, 906, 907, 908]), JSON.stringify(ord));
  await page.waitForTimeout(600); /* 落定窗口（MO 50ms 防抖尾拍） */
  const muts = await calmMs('BrewPanel', '#bagGrid', 800);
  check('S5-brew-calm', muts === 0, 'childList mutations/800ms=' + muts);
  await pickSort('BrewPanel', 'official');
  v = await brewView();
  check('S5-brew-official-nodim', v.dimCount === 0 && v.badgeIds.length === 0, 'dim=' + v.dimCount + ' badges=' + v.badgeIds.length);
  await showScene('Cooking');
  await pickSort('Cooking', 'sat');
  const ck = await frameEl('Cooking').evaluate(() => {
    const layer = document.getElementById('srBadgeLayer');
    return { badges: layer ? layer.querySelectorAll('i').length : 0, dims: layer ? layer.querySelectorAll('.sr-brewdim').length : 0 };
  });
  check('S5-cook-no-dim-all-badge', ck.badges > 0 && ck.dims === 0, JSON.stringify(ck));
  await page.waitForTimeout(600);
  const cmut = await calmMs('Cooking', '#backpackGrid', 800);
  check('S5-cook-calm', cmut === 0, 'childList mutations/800ms=' + cmut);
  await pickSort('Cooking', 'official');

  /* ---- §6 v14.2 排序弹窗层叠修复（作者实机截图：弹窗被柜格图层压住）----
     弹窗必须严格高于格区一切层：角标/置灰层 50、官方格 .item 10（实机构建更高）。
     断言=同层叠上下文内计算 z 序：pop > badgeLayer > item（纯层叠行为，hit-test 测不出
     pointer-events:none 层的视觉遮盖，取 z 数值序） */
  await showScene('BrewPanel');
  const zinfo = await frameEl('BrewPanel').evaluate(() => {
    const pop = document.getElementById('srFootSortPop');
    const layer = document.getElementById('srBadgeLayer');
    const item = document.querySelector('.sr-gridhost .item');
    const z = (el) => el ? parseInt(getComputedStyle(el).zIndex, 10) : null;
    return { pop: z(pop), layer: z(layer), item: z(item) };
  });
  check('S6-pop-z-topmost', zinfo.pop > zinfo.layer && zinfo.pop > zinfo.item && zinfo.pop >= 60,
    JSON.stringify(zinfo));

  /* 尾部：零 error */
  check('Z-console-clean', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 200));
  check('Z-pageerror-clean', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 200));

  await browser.close();
  const fails = results.filter((r) => !r.ok).length;
  console.log(fails === 0 ? 'ALL PASS (' + results.length + ')' : fails + ' FAIL / ' + results.length);
  process.exit(fails === 0 ? 0 : 1);
})();
