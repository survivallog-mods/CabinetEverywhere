/* T13 railOn 让位门断言（Playwright @ serve.cjs 8180，真 tagfilter.page.js）。
   床=railui-root-harness.html：Cooking 已被 rail 装配（真实 rail 环境）；取**隐藏帧 DroneHub**
   （rail 只装配可见帧——其官方 DOM 完整，tagfilter detectC 'bag' 族可用）做旧行为基线与让位断言：
   ① 基线（数据无 railOn）：browser 页注入下拉 + 按 sel 藏不匹配页签（旧行为）；
   ② railOn=true：下拉被摘除 + 已藏页签还原 + BagMsg 不再触发隐藏/伪造（FORGES 无新增）；
   ③ railOn=false 回退：下拉复注 + 隐藏行为恢复（回退态=旧行为完全不变）；
   ④ 全程 __SLTF__.state().railOn 跟随 + 控制台零报错。 */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/Users/wangk/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright')); }

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
  check('gate:rail-env', await page.evaluate(() => {
    const d = document.getElementById('Cooking').contentDocument;
    return !!window.__CERAIL__ && !!(d && d.getElementById('srRail'));
  }), 'Cooking 已被 rail 装配（#srRail 在）——真实 rail 环境先证');

  /* sel 预置（DroneHub=tag 103）后注入真 tagfilter（游戏内 TagFilter.Tick 同位） */
  await page.evaluate(() => localStorage.setItem('sltf_sel_v3', JSON.stringify({ DroneHub: 103 })));
  await page.evaluate(() => new Promise((res) => {
    const s = document.createElement('script');
    s.src = '../tagfilter.page.js';
    s.onload = res;
    document.body.appendChild(s);
  }));
  const ftxt = page.evaluate; // noop placeholder (unused)

  /* 基线数据（无 railOn 键）+ DroneHub 帧收到 BagMsg 渲染 4+1 页签 */
  const setData = (railOn) => page.evaluate((flag) => {
    const j = {
      owners: {
        900001: { t: [], kind: 'c' },
        900101: { t: [103], kind: 'c' },
        900102: { t: [], kind: 'f' },
        900103: { t: [103], kind: 'c' },
        900104: { t: [], kind: 'c' }
      },
      lib: [
        { id: 101, dim: 0, order: 1, name: '食材', icon: '', color: '' },
        { id: 103, dim: 0, order: 2, name: '材料', icon: '', color: '' }
      ],
      scenario: { DroneHub: 'browser' }
    };
    if (flag !== undefined) j.railOn = flag;
    window.__SLTF__.setData(j);
    return window.__SLTF__.state();
  }, railOn);

  const postBag = (activeOwner) => page.evaluate((owner) => {
    window.__HZ_POST__('DroneHub', {
      type: 'WebUI_DroneHub_BagMsg',
      data: {
        bagTabs: [900001, 900101, 900102, 900103, 900104].map((o) => ({ ownerId: o, name: '#' + o })),
        bagOwnerId: owner, bagItems: [], workbenchItems: []
      }
    });
  }, activeOwner);
  const tabState = () => page.frames().find((f) => f.url().includes('/fixtures/DroneHub.html')).evaluate(() => {
    const cands = [...document.querySelectorAll('#bagTabsScroll .bag-tab')];
    return {
      n: cands.length,
      hidden: cands.filter((e) => e.style.display === 'none').length,
      dd: !!document.querySelector('.sltf-dd-btn'),
      ddw: !!document.querySelector('.sltf-dd-wrap')
    };
  });

  /* ---- ① 基线（railOn 缺省）：下拉注入 + 按 sel 藏 2 页签（旧行为） ---- */
  const st0 = await setData(undefined);
  check('gate:flag-default-false', st0.railOn === false, 'railOn 缺省=false（state=' + JSON.stringify(st0) + '）');
  await postBag(900101);
  await page.waitForFunction(() => {
    const d = document.getElementById('DroneHub').contentDocument;
    return d && d.querySelectorAll('#bagTabsScroll .bag-tab').length >= 4;
  }, null, { timeout: 8000 });
  await page.waitForTimeout(80); // observer 微任务已在等待窗口内，兜底一拍
  const t0 = await tabState();
  check('gate:baseline-dd', t0.dd === true && t0.ddw === true, '基线（无 railOn）：browser 页下拉注入 ' + JSON.stringify(t0));
  check('gate:baseline-hide', t0.n >= 4 && t0.hidden === 2, '基线：sel=103 → 不匹配 2 页签 display:none ' + JSON.stringify(t0));
  const forges0 = (await page.evaluate(() => window.__HZ_FORGES__())).length;

  /* ---- ② railOn=true：下拉摘除 + 页签还原 + BagMsg 不再隐藏/伪造 ---- */
  const st1 = await setData(true);
  check('gate:flag-true', st1.railOn === true, 'setData railOn=true → state.railOn=true');
  await page.waitForTimeout(60);
  const t1 = await tabState();
  check('gate:railon-dd-removed', t1.dd === false && t1.ddw === false, 'railOn=true：下拉/包裹器被摘除 ' + JSON.stringify(t1));
  check('gate:railon-hide-restored', t1.hidden === 0, 'railOn=true：已藏页签还原（无 display:none 残留）' + JSON.stringify(t1));
  await postBag(900102); // 旧行为下会被藏的 active
  await page.waitForTimeout(120);
  const t2 = await tabState();
  const forges1 = (await page.evaluate(() => window.__HZ_FORGES__())).length;
  check('gate:railon-no-hide', t2.hidden === 0, 'railOn=true：BagMsg(active=900102) 不触发隐藏 ' + JSON.stringify(t2));
  check('gate:railon-no-forge', forges1 === forges0, 'railOn=true：消息层零伪造/零扣发（FORGES ' + forges0 + '→' + forges1 + '）');

  /* ---- ③ railOn=false 回退：下拉复注 + 隐藏行为恢复 ---- */
  const st2 = await setData(false);
  check('gate:flag-false', st2.railOn === false, 'setData railOn=false → state.railOn=false');
  await page.waitForTimeout(150);
  /* 注：railOn 相期间最后 active 停在被藏柜（900102）——旧行为恢复后 applyFrame 会对其
     DOM 弹回一次（fixture 自发 SWITCH_BAG 计入 FORGES=让位门外的正常兜底路径），先等
     弹回收敛再取 forges 基线，随后断言「active 在可见柜的 BagMsg 不再新增伪造」。 */
  const forgesA = (await page.evaluate(() => window.__HZ_FORGES__())).length;
  const t3 = await tabState();
  check('gate:fallback-dd-back', t3.dd === true && t3.ddw === true, '回退态：下拉复注 ' + JSON.stringify(t3));
  check('gate:fallback-hide-back', t3.hidden === 2, '回退态：隐藏行为恢复（不匹配 2 页签在藏）' + JSON.stringify(t3));
  await postBag(900101);
  await page.waitForTimeout(120);
  const t4 = await tabState();
  const forges2 = (await page.evaluate(() => window.__HZ_FORGES__())).length;
  check('gate:fallback-hide-back-2', t4.hidden === 2, '回退态：重渲染后仍 2 页签在藏 ' + JSON.stringify(t4));
  check('gate:fallback-no-forge', forges2 === forgesA, '回退态 active 可见柜：不伪造（FORGES ' + forgesA + '→' + forges2 + '）');

  check('gate:console-clean', consoleErrors.length === 0 && pageErrors.length === 0,
    'console errors=' + consoleErrors.length + ' pageErrors=' + pageErrors.length + (consoleErrors[0] ? ' | ' + consoleErrors[0] : '') + (pageErrors[0] ? ' | ' + pageErrors[0] : ''));

  await browser.close();
  const fails = results.filter((r) => !r.ok).length;
  console.log('---- railOn gate: ' + (results.length - fails) + '/' + results.length + ' PASS ----');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('DRIVER ERROR', e); process.exit(2); });
