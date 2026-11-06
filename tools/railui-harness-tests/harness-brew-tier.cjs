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

  /* 尾部：零 error */
  check('Z-console-clean', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 200));
  check('Z-pageerror-clean', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 200));

  await browser.close();
  const fails = results.filter((r) => !r.ok).length;
  console.log(fails === 0 ? 'ALL PASS (' + results.length + ')' : fails + ' FAIL / ' + results.length);
  process.exit(fails === 0 ? 0 : 1);
})();
