/* 共存检查：游戏内 TagFilter(__SLTF__) 与 CERail(__CERAIL__) 同注入 Root——
   railui-root-harness 页面上先补注 tagfilter.page.js 再验证两套契约共存、
   rail 场景装配照常、控制台零报错（tagfilter 因页签锚点被 rail 替换而自动空转=预期）。 */
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('http://127.0.0.1:8180/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HZ_CURRENT__() !== null, null, { timeout: 20000 });
  /* 注入 tagfilter（游戏内 TagFilter.Tick 同位注入 Root） */
  await page.evaluate(() => new Promise((res) => {
    const s = document.createElement('script');
    s.src = '../tagfilter.page.js';
    s.onload = res;
    document.body.appendChild(s);
  }));
  const both = await page.evaluate(() => ({
    sltf: !!(window.__SLTF__ && window.__SLTF__.ver === 3),
    cerail: !!(window.__CERAIL__ && window.__CERAIL__.ver === 1),
    sltfState: window.__SLTF__.state()
  }));
  console.log((both.sltf && both.cerail ? 'PASS' : 'FAIL') + ' | coexist:two-contracts ' + JSON.stringify(both));
  // rail 场景照常装配 + 命令通道照常（tagfilter 的 wrapRelay 已包装 postMessage，rail 命令不受影响）。
  // 先切到柜子页签（背包条目右键被 rail 拒绝=正确守卫，不入队），再右键柜内物品入队 take。
  await page.evaluate(() => window.__HZ_SHOW__('Cooking'));
  await page.waitForFunction(() => {
    const f = document.getElementById('Cooking');
    return f && f.contentDocument && f.contentDocument.querySelector('#srGrid .sr-slot[data-it]');
  }, null, { timeout: 8000 }); /* 等数据落地网格有物品（rail 可见≠数据已到） */
  await page.evaluate(() => {
    const d = document.getElementById('Cooking').contentDocument;
    const tab = d.querySelector('#srPinRow [data-ctn="900103"]');
    tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => {
    const f = document.getElementById('Cooking');
    const d = f && f.contentDocument;
    return d && d.getElementById('srTitle').textContent === '材料架' && d.querySelector('#srGrid .sr-slot[data-it]');
  }, null, { timeout: 8000 });
  await page.evaluate(() => {
    const d = document.getElementById('Cooking').contentDocument;
    d.querySelector('#srGrid .sr-slot[data-it]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(150);
  const cmd = await page.evaluate(() => window.__HZ_LASTCMD__());
  console.log((cmd.indexOf('take') >= 0 ? 'PASS' : 'FAIL') + ' | coexist:cmd-channel ' + (cmd || '（无命令）'));
  // tagfilter 在 rail 场景自动空转：frames 状态健康（无异常计数）即视为无冲突
  console.log((errs.length === 0 ? 'PASS' : 'FAIL') + ' | coexist:zero-errors ' + (errs.slice(0, 3).join('||') || '0 错误'));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
