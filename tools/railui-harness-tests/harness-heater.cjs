/* heater root harness（2026-11-16 开关退役批重写）：暖炉 glist 恒开断言——
   srfg 旧方案（页签/警示/底行自装配）已整链删除，本套只验新设计不变量：
   ①旧方案绝不复现 ②列表态面板 ③格子态 rail 壳 srg-plain ④首开（含记忆格子态）页脚
   一键入库/一键整理即显——实机缺陷「开界面按钮不显示，切页才出现」回归锚 ⑤标题静态
   角色背包 ⑥A/D 零切柜（无页签页不得有隐形步进）⑦炉体右面板零改动 ⑧场景往返干净
   重装 ⑨feedFail toast ⑩console-clean。Playwright，serve.cjs 须已在 8180。 */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/temp/baidu_up/node_modules/playwright-core')); } /* 环境漂移兜底（harness-tidy 同款） */

const BASE = 'http://127.0.0.1:8180';
const EXEC = 'C:/Users/wangk/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' : '') + (detail || ''));
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXEC });
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HZ_CURRENT__ !== undefined && window.__HZ_CURRENT__() !== null, null, { timeout: 20000 });

  const frameDoc = (key) => page.frames().find((f) => f.url().includes('/fixtures/' + key + '.html'));
  const gwait = (key) => page.waitForFunction((k) => {
    for (let i = 0; i < window.frames.length; i++) {
      try { if (window.frames[i].document.getElementById('srgPanel')) return true; } catch (e) { }
    }
    return false;
  }, key, { timeout: 12000 });
  const cmdSpy = (fn) => page.evaluate(() => {
    window.__HZ_CMD__ = [];
    const orig = window.__CERAIL__.cmd;
    window.__HZ_CMD_RESTORE__ = () => { window.__CERAIL__.cmd = orig; };
    window.__CERAIL__.cmd = (op, payload) => { window.__HZ_CMD__.push([op, payload]); return orig.call(window.__CERAIL__, op, payload); };
  }).then(() => fn()).then((r) => page.evaluate(() => window.__HZ_CMD_RESTORE__()).then(() =>
    page.evaluate(() => window.__HZ_CMD__).then((calls) => ({ r, calls }))));

  /* ---- 场景切换：Heater（首开=列表态默认） ---- */
  await page.getByRole('button', { name: 'Heater', exact: true }).click();
  await gwait('Heater');
  const d = frameDoc('Heater');

  /* ① 旧方案绝不复现（srfg 全家 + 600ms 兜底轮询后仍无） */
  await page.waitForTimeout(600);
  check('ht:old-scheme-gone', await d.evaluate(() =>
    !document.getElementById('srfgTabs') && !document.getElementById('srfgFoot') && !document.getElementById('srfgGridScroll')), '');

  /* ② 列表态：面板在位+场景预置（仅可燃物） */
  check('ht:list-panel-preset', await d.evaluate(() => {
    const p = document.getElementById('srgPanel');
    const chip = (document.querySelector('#srgChips') || {}).textContent || '';
    return !!p && chip.indexOf('仅可燃物') >= 0;
  }), '');

  /* ③ 格子态：rail 壳 srg-plain + 官方格进 .sr-gridhost + refreshBag 杠杆 */
  const gsp = await cmdSpy(async () => { await d.click('#srgToggle'); await page.waitForTimeout(120); return true; });
  const rbk = (gsp.calls || []).filter((c) => c[0] === 'refreshBag').pop();
  const gv = await d.evaluate(() => {
    const srp = document.getElementById('srp');
    const grid = document.getElementById('backpackGrid');
    return { srp: !!srp, plain: srp ? srp.classList.contains('srg-plain') : false,
      gridInRail: !!(grid && grid.closest('.sr-gridhost')), gridShown: !!grid && grid.offsetParent !== null,
      gridmode: (document.getElementById('srgPanel') || {}).className || 'NOPANEL' };
  }).catch(() => null);
  check('ht:grid-rail-plain-refreshbag', !!gv && !!rbk && gv.srp && gv.plain && gv.gridInRail && gv.gridShown && /srg-gridmode/.test(gv.gridmode),
    JSON.stringify({ rb: !!rbk, gv }));

  /* ④ 首开页脚即显（实机缺陷回归锚）：一键入库/一键整理 hidden=false（数据同帧已到） */
  check('ht:first-open-footer', await d.evaluate(() => {
    const s = document.getElementById('srStoreAll'), t = document.getElementById('srTidy');
    return !!s && !s.hidden && !!t && !t.hidden;
  }), '');

  /* ⑤ 标题静态「角色背包」+ 信息条=空间（与容器切换无关） */
  check('ht:title-static-backpack', await d.evaluate(() =>
    (document.getElementById('srTitle') || {}).textContent === '角色背包' &&
    ((document.getElementById('srCols') || {}).textContent || '').indexOf('空间') === 0), '');

  /* ⑥ A/D 零切柜：失焦连按 a/d——无页签页不得有隐形步进（TabInjector 停注+srfg 删除后不变量） */
  const ad = await cmdSpy(async () => {
    await page.keyboard.press('a'); await page.waitForTimeout(60);
    await page.keyboard.press('d'); await page.waitForTimeout(60);
    return true;
  });
  const sw = (ad.calls || []).filter((c) => c[0] === 'switchBag').length;
  check('ht:ad-no-switch', sw === 0, 'sw=' + sw);

  /* ⑦ 炉体右面板零改动（作者底线） */
  check('ht:right-panel-untouched', await d.evaluate(() =>
    !!document.querySelector('.heater-system > .heater-panel')), '');

  /* ⑧ 场景往返：切走再回=干净重装（记忆格子态首开页脚同样即显） */
  await page.evaluate(() => { try { localStorage.setItem('srp_glist_view_Heater', 'grid'); } catch (e) { } });
  await page.getByRole('button', { name: 'Cooking', exact: true }).click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Heater', exact: true }).click();
  await gwait('Heater');
  await page.waitForTimeout(250);
  const d2 = frameDoc('Heater');
  check('ht:roundtrip-grid-remembered', await d2.evaluate(() => {
    const srp = document.getElementById('srp');
    const s = document.getElementById('srStoreAll'), t = document.getElementById('srTidy');
    return !!srp && srp.classList.contains('srg-plain') && !!s && !s.hidden && !!t && !t.hidden &&
      !document.getElementById('srfgTabs');
  }), '');

  /* ⑨ feedFail 一次性 toast（列表态优先消费；glistSettle 即唯一消费方） */
  await d2.click('#srgToggle'); await page.waitForTimeout(100); /* 回列表态 */
  await page.evaluate(() => { window.__HZ_FEEDFAIL__ = 'notfuel'; });
  await page.evaluate(() => window.__HZ_PUSH__('Heater'));
  await page.waitForTimeout(300);
  check('ht:feedfail-toast', await d2.evaluate(() => (document.body.textContent || '').indexOf('只能添加燃料') >= 0), '');
  await page.evaluate(() => { window.__HZ_FEEDFAIL__ = ''; });

  /* ⑩ 尾：零 console error / pageerror */
  check('ht:console-clean', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' ; '));
  check('ht:pageerror-clean', pageErrors.length === 0, pageErrors.slice(0, 3).join(' ; '));

  await browser.close();
  const pass = results.filter((r) => r.ok).length;
  console.log('\n==== HEATER SUMMARY: ' + pass + '/' + results.length + (pass === results.length ? ' PASS' : ' FAIL') + ' ====');
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
