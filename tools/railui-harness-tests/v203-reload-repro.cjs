/* v203 两条缺陷复现机（作者第十二轮报告）：
   #1 选中物品后数值消失（三零防护后仍在）
   #2 退出到主菜单重新读档后排序彻底失效
   全程序化：载档→排序→选中→探针；退主菜单→重读档→排序→探针。落 C:/temp/v203.txt。 */
const fs = require('fs');
const { exec } = require('child_process');
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const GAME = 'E:/SteamLibrary/steamapps/common/Survival Log/SurvivalLog.exe';
const LOG = 'E:/SteamLibrary/steamapps/common/Survival Log/BepInEx/LogOutput.log';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
const log = (s) => { lines.push(s); console.log(s); return s; };
const evT = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms || 10000))]);
const httpGet = (u) => new Promise((res) => require('http').get(u, (r) => res(true)).on('error', () => res(false)));
const WD = setTimeout(() => { log('[wd] 15min 收卷'); finish(); }, 900000);
function finish() {
  clearTimeout(WD);
  fs.writeFileSync('C:/temp/v203.txt', lines.join('\n'));
  process.exit(0);
}

(async () => {
  if (!(await httpGet('http://127.0.0.1:9222/json/version'))) {
    exec('start "" "' + GAME + '"');
    for (let i = 0; i < 45; i++) { await sleep(3000); if (await httpGet('http://127.0.0.1:9222/json/version')) break; }
  }
  const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 30000 });
  const page = browser.contexts()[0].pages().find((p) => decodeURIComponent(p.url()).indexOf('Root') >= 0);
  page.on('pageerror', (e) => log('PAGEERR ' + String(e).slice(0, 120)));

  const loadSave = async (tag) => {
    let clicked = false;
    for (let i = 0; i < 50; i++) {
      await sleep(2500);
      if (await evT(page.evaluate(() => !!document.querySelector('iframe#CoreUI1')), 6000)) { log(tag + ': HUD 就绪'); return true; }
      if (!clicked) {
        const m = page.frames().find((f) => f.url().indexOf('/MainUI.') >= 0);
        if (m) await m.locator('.menu-text:has-text("继续生存")').first().click({ timeout: 4000 }).then(() => { clicked = true; log(tag + ': 点击继续生存'); }).catch(() => { });
      }
    }
    return false;
  };
  const openBag = async () => {
    let bp = page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/BackpackUI.') >= 0);
    if (!bp) {
      const core = page.frames().find((f) => f.url().indexOf('/CoreUI1.') >= 0);
      if (!core) return null;
      await evT(core.evaluate(() => { const el = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').trim().indexOf('背包B') === 0); if (el) el.click(); }));
      for (let i = 0; i < 15; i++) { await sleep(800); bp = page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/BackpackUI.') >= 0); if (bp) break; }
    }
    if (bp) await bp.waitForFunction(() => !!document.getElementById('srnSortBtn'), null, { timeout: 12000 }).catch(() => { });
    await sleep(1200);
    return bp;
  };
  const probe = async (bp, tag) => bp.evaluate((t) => {
    const g = document.querySelector('.bag-panel:not(.is-storage) .grid-container');
    const layer = document.getElementById('srnBadges');
    const cells = g ? [...g.querySelectorAll('.item')] : [];
    const su = document.getElementById('app') && document.getElementById('app')._vnode ? document.getElementById('app')._vnode.component.setupState : null;
    return JSON.stringify({
      t, cells: cells.length, modelN: su && su.bagA ? su.bagA.items.length : -1,
      L: layer ? layer.querySelectorAll('i').length : -1,
      valN: layer ? [...layer.querySelectorAll('i')].filter((x) => x.textContent && x.textContent !== '-').length : -1,
      lbl: (document.getElementById('srnSortLbl') || {}).textContent || null,
      btnOn: !!(document.getElementById('srnSortBtn') || { className: '' }).className.match(/srn-on/)
    });
  }, tag).then(log);
  const sortSat = async (bp) => {
    await evT(bp.evaluate(() => document.getElementById('srnSortBtn').click()));
    await sleep(300);
    await evT(bp.evaluate(() => { const p = document.getElementById('srnSortPop'); if (p && p.hidden) return; const o = p ? p.querySelector('[data-k="sat"]') : null; if (o) o.click(); }));
    await sleep(900);
  };

  /* ===== 第一段：载档 → 排序 → 选中 ===== */
  if (!(await loadSave('L1'))) { log('L1 失败'); finish(); }
  let bp = await openBag();
  if (!bp) { log('背包未开'); finish(); }
  await sortSat(bp);
  await probe(bp, 'A1:SORTED');
  await bp.locator('.bag-panel:not(.is-storage) .grid-container .item').first().click({ timeout: 5000 }).catch(() => { });
  await sleep(800);
  await probe(bp, 'A2:SELECTED');
  await sleep(1500);
  await probe(bp, 'A3:SELECTED+2s');
  const pop = page.frames().find((x) => x.url().indexOf('/ItemDetailPopup') >= 0);
  log('A: popup=' + !!pop);
  if (pop) { await evT(pop.evaluate(() => { const b = [...document.querySelectorAll('button,[class*=close]')].find((e) => /✕|×|关闭/i.test((e.textContent || '') + (e.getAttribute('aria-label') || ''))); if (b) b.click(); })); await sleep(600); }
  await probe(bp, 'A4:CLOSED');
  await page.screenshot({ path: 'C:/temp/v203-a.png' }).catch(() => { });

  /* ===== 第二段：退主菜单 → 重读档 → 排序 ===== */
  // 关背包（B 键钮再点一次关）
  const core1 = page.frames().find((f) => f.url().indexOf('/CoreUI1.') >= 0);
  await evT(core1.evaluate(() => { const el = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').trim().indexOf('背包B') === 0); if (el) el.click(); }));
  await sleep(1200);
  // Esc → 菜单
  await page.keyboard.press('Escape');
  await sleep(1500);
  const frames1 = page.frames().map((f) => decodeURIComponent(f.url()).split('/').pop().split('?')[0]);
  log('B: esc frames=' + frames1.join(','));
  for (const f of page.frames()) {
    const btns = await evT(f.evaluate(() => [...document.querySelectorAll('button, .menu-text, [class*=menu] *')].map((e) => (e.textContent || '').trim().replace(/\s+/g, '')).filter((t) => t && t.length < 14).slice(0, 30)).catch(() => null));
    if (btns && btns.length) log('B: ' + decodeURIComponent(f.url()).split('/').pop() + ' btns=' + JSON.stringify(btns));
  }
  finish();
})().catch((e) => { log('ERR ' + String(e).slice(0, 250)); finish(); });
