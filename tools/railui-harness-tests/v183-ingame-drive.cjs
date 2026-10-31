/* v1.8.3 实机独驱动验证（CDP 9222；一次性跑完可独驱面 + 探明 HUD 可开界面清单） */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const path = require('path');
const OUT = 'E:/Game/Mod/survivallog-mods/CabinetEverywhere/.worktrees/cerail-storage-rail/SurvivalLog.CabinetEverywhere/design-proto/shots/ingame-v183';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => decodeURIComponent(p.url()).indexOf('Root') >= 0) || ctx.pages()[0];
  console.log('[drv] root page:', page.url().slice(0, 80));
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR|Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 140)));

  await page.evaluate(() => {
    window.__IG_SPY__ = [];
    window.addEventListener('message', (ev) => {
      const d = ev && ev.data;
      if (d && d.sourcePageId && typeof d.type === 'string') window.__IG_SPY__.push({ page: d.sourcePageId, type: d.type, at: Date.now() });
    });
  });

  /* ① 当前 UI 全景：iframe 清单 + 可见性 */
  const framesInfo = await page.evaluate(() => [...document.querySelectorAll('iframe')].map((f) => ({
    id: f.id, vis: getComputedStyle(f).display !== 'none'
  })));
  console.log('[drv] iframes:', JSON.stringify(framesInfo));
  const visibleNow = framesInfo.filter((f) => f.vis).map((f) => f.id);
  check('ui:frames-known', framesInfo.length > 0, `${framesInfo.length} iframes，可见: ${visibleNow.join(',') || '(无)'}`);

  /* ② 压屏弹层驱逐（照 v182 监视器） */
  for (const blocker of ['TowerWaveReport', 'TipsPopup', 'ConfirmDialog', 'ItemDetailPopup']) {
    try {
      const vis = await page.evaluate((k) => { const f = document.querySelector('iframe#' + k); return f ? getComputedStyle(f).display !== 'none' : false; }, blocker).catch(() => false);
      if (!vis) continue;
      if (blocker === 'ItemDetailPopup' || blocker === 'ConfirmDialog' || blocker === 'TipsPopup') {
        await page.evaluate((k) => window.postMessage({ type: 'CLOSE', data: {}, sourcePageId: k }, '*'), blocker);
      } else {
        const bf = page.frames().find((f) => f.url().indexOf('/' + blocker + '.') >= 0);
        if (bf) await bf.locator('.confirm-btn, button:has-text("确认")').first().click({ timeout: 3000 }).catch(() => { });
      }
      await page.waitForTimeout(500);
      console.log('[drv] dismissed blocker:', blocker);
    } catch (e) { }
  }

  /* ③ HUD 按钮清单（CoreUI1）——探明还能独开哪些界面 */
  const core = page.frames().find((f) => f.url().indexOf('/CoreUI1.') >= 0);
  if (core) {
    const btns = await core.evaluate(() => [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim().slice(0, 10)).filter(Boolean));
    console.log('[drv] HUD buttons:', JSON.stringify([...new Set(btns)]));
  } else console.log('[drv] CoreUI1 frame 不在（主菜单？）');

  /* ④ 开背包（HUD 点击）→ BackpackUI 原生模式验证 */
  if (core) {
    try {
      await core.locator('button:has-text("背包"), .ui-btn:has-text("背包")').first().click({ timeout: 8000 });
      await page.waitForTimeout(1500);
      const bp = page.frames().find((f) => f.url().indexOf('/BackpackUI.') >= 0 || f.url().indexOf('/Backpack.') >= 0);
      if (bp) {
        const st = await bp.evaluate(() => {
          const gc = document.querySelector('.grid-container');
          const cols = gc ? getComputedStyle(gc).gridTemplateColumns.split(' ').length : 0;
          const wid = gc ? gc.getAttribute('style') : '';
          return {
            native: !!document.getElementById('srNativeBp'),
            rail: !!document.getElementById('srRail'),
            cols, wid: wid.slice(0, 60),
            items: document.querySelectorAll('.grid-container .item').length,
            weightBag: (() => { const w = document.querySelector('.bag-panel:not(.is-storage) .weight-section'); return w ? getComputedStyle(w).display !== 'none' : null; })(),
            scroll: gc ? getComputedStyle(gc).overflowY : ''
          };
        });
        check('bp:native-css', st.native, 'style#srNativeBp 在场');
        check('bp:no-rail', !st.rail, 'BackpackUI 原生（无 rail 装配）');
        check('bp:cols', st.cols >= 10, `背包列数=${st.cols}（官方数据原生）`);
        check('bp:scroll', st.scroll === 'auto', `格区纵向滚动=${st.scroll}`);
        await page.screenshot({ path: path.join(OUT, 'ingame-backpack-native.png') });
      } else check('bp:frame', false, 'BackpackUI 帧未找到');
    } catch (e) { check('bp:open', false, String(e).slice(0, 100)); }
  }

  /* ⑤ 结论输出 + 截图 */
  await page.screenshot({ path: path.join(OUT, 'ingame-state.png') }).catch(() => { });
  check('zero-console-errors', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== 独驱动面 TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  console.log('[drv] 可见界面:', visibleNow.join(','));
  await browser.close();
})().catch((e) => { console.error('DRIVE ERROR', e); process.exit(2); });
