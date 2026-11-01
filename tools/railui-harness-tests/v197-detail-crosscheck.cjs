/* v197 详情弹窗对数（终裁=游戏自己的 ItemDetailPopup）：背包里有值角标的物品
   → 左键点开详情 → 读单次值与使用次数 → 断言 角标 == round(单次×剩余次数)。
   同时把两份料理（冰箱副本）的详情也开（经整理物资/仓库流若可达）。
   点击=纯弹窗展示，零数据改动。单连接干净退出，游戏保持运行。 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const LOG = 'E:/SteamLibrary/steamapps/common/Survival Log/BepInEx/LogOutput.log';
const OUT = path.join(__dirname, '..', '..', 'SurvivalLog.CabinetEverywhere', 'design-proto', 'shots', 'ingame-v196');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}
const evT = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms || 12000))]);
const WD = setTimeout(() => { console.log('[wd] 8min 收卷'); finish(); }, 480000);
function finish() {
  clearTimeout(WD);
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== v197 TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  try { fs.writeFileSync(path.join(OUT, 'detail-crosscheck.json'), JSON.stringify(results, null, 1)); } catch (e) { }
  process.exit(fail ? 1 : 0);
}

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 30000 });
  const page = browser.contexts()[0].pages().find((p) => decodeURIComponent(p.url()).indexOf('Root') >= 0);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 100)));

  let bp = page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/BackpackUI.') >= 0);
  if (!bp) {
    const core = page.frames().find((f) => f.url().indexOf('/CoreUI1.') >= 0);
    await evT(core.evaluate(() => { const el = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').trim().indexOf('背包B') === 0); if (el) el.click(); }));
    for (let i = 0; i < 15; i++) { await page.waitForTimeout(1000); bp = page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/BackpackUI.') >= 0); if (bp) break; }
  }
  if (!bp) { check('boot:bp', false, 'BackpackUI 未开'); finish(); }
  check('boot:bp', true);

  /* 确保角标在场（有值才可比） */
  await evT(bp.evaluate(() => document.getElementById('srnSortBtn').click()));
  await bp.waitForFunction(() => !document.getElementById('srnSortPop').hidden, null, { timeout: 5000 }).catch(() => { });
  await evT(bp.evaluate(() => { const o = document.querySelector('#srnSortPop [data-k="sat"]'); if (o) o.click(); }));
  await page.waitForTimeout(900);

  const items = await evT(bp.evaluate(() => {
    const su = document.getElementById('app')._vnode.component.setupState;
    const raw = [...document.querySelectorAll('#srnBadges i')];
    return su.bagA.items.map((m, i) => ({
      id: m.id, x: m.x, y: m.y, useTimes: m.useTimes, useTimesMax: m.useTimesMax, count: m.count,
      badge: raw[i] ? raw[i].textContent : null
    }));
  }), 15000);
  const valued = items.filter((v) => v.badge && v.badge !== '-');
  check('bag:valued-items', valued.length > 0, `n=${valued.length} [${valued.slice(0, 5).map((v) => v.id + ':' + v.badge).join(' ')}]`);

  /* 对每件有值物品（至多 3 件）：点开详情 → 单次值×剩余次数 == 角标 */
  const readPopup = async () => {
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      const f = page.frames().find((x) => x.url().indexOf('/ItemDetailPopup') >= 0);
      if (!f) continue;
      const d = await evT(f.evaluate(() => {
        const cards = [...document.querySelectorAll('.value-card')].map((c) => ({
          num: (c.querySelector('.value-card-num') || {}).textContent || '',
          label: (c.querySelector('.value-card-label') || {}).textContent || ''
        }));
        const use = (document.querySelector('.use-count, [class*="useCount"]') || {}).textContent
          || [...document.querySelectorAll('*')].map((e) => e.childNodes.length === 1 && e.textContent.match(/^\s*\d+\s*\/\s*\d+\s*$/) ? e.textContent.trim() : '').filter(Boolean)[0] || '';
        const name = (document.querySelector('.item-name, .name, h2, h3') || {}).textContent || '';
        return { cards, use, name };
      }), 8000);
      if (d && (d.cards.length || d.use)) return d;
    }
    return null;
  };
  const closePopup = async () => {
    const f = page.frames().find((x) => x.url().indexOf('/ItemDetailPopup') >= 0);
    if (f) await evT(f.evaluate(() => { const b = [...document.querySelectorAll('button, [class*="close"]')].find((e) => /关闭|close/i.test(e.textContent || e.className || '')); if (b) b.click(); }));
    await page.waitForTimeout(400);
  };

  for (const v of valued.slice(0, 3)) {
    const cellIdx = items.indexOf(v);
    const cell = bp.locator('.bag-panel:not(.is-storage) .grid-container .item').nth(cellIdx);
    await cell.click({ timeout: 5000 }).catch(() => { });
    const d = await readPopup();
    if (!d) { check('detail:' + v.id, false, '弹窗未开'); continue; }
    await page.screenshot({ path: path.join(OUT, 'detail-' + v.id + '.png') }).catch(() => { });
    const sat = d.cards.find((c) => /饱腹/.test(c.label));
    const per = sat ? parseFloat(sat.num.replace('+', '')) : null;
    const m = (d.use || '').match(/(\d+)\s*\/\s*(\d+)/);
    const uses = m ? +m[1] : (v.useTimes || 1);
    const expect = per != null ? Math.round(per * uses) : null;
    check('detail:' + v.id, per != null && String(expect) === v.badge,
      `详情单次=${per} ×${uses}次=${expect} vs 角标=${v.badge}（弹窗use="${d.use}" 模型${v.useTimes}/${v.useTimesMax}）`);
    await closePopup();
  }

  check('zero-page-errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  finish();
})().catch((e) => { console.error('HARNESS ERROR', String(e).slice(0, 300)); process.exit(2); });
