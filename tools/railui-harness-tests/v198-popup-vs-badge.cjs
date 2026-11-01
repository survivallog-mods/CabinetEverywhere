/* v198 终验：角标 == 详情弹窗整数 × 剩余次数（作者算式逐字）。实机、真档、name-matched
   弹窗刮读（防串读）。覆盖：包装食品（无滋养）、熟食多份（滋养×1.15）、多次使用。 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const LOG = 'E:/SteamLibrary/steamapps/common/Survival Log/BepInEx/LogOutput.log';
const OUT = path.join(__dirname, '..', '..', 'SurvivalLog.CabinetEverywhere', 'design-proto', 'shots', 'ingame-v196');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  console.log(`\n==== v198 TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  try { fs.writeFileSync(path.join(OUT, 'popup-vs-badge.json'), JSON.stringify(results, null, 1)); } catch (e) { }
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
    for (let i = 0; i < 15; i++) { await sleep(1000); bp = page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/BackpackUI.') >= 0); if (bp) break; }
  }
  if (!bp) { check('boot:bp', false, 'BackpackUI 未开'); finish(); }
  await bp.waitForFunction(() => !!document.getElementById('srnSortBtn'), null, { timeout: 12000 }).catch(() => { });

  /* 排序饱腹 → 角标在场 */
  await evT(bp.evaluate(() => document.getElementById('srnSortBtn').click()));
  await bp.waitForFunction(() => !document.getElementById('srnSortPop').hidden, null, { timeout: 5000 }).catch(() => { });
  await evT(bp.evaluate(() => { const o = document.querySelector('#srnSortPop [data-k="sat"]'); if (o) o.click(); }));
  await sleep(900);

  const items = await evT(bp.evaluate(() => {
    const su = document.getElementById('app')._vnode.component.setupState;
    const raw = [...document.querySelectorAll('#srnBadges i')];
    return su.bagA.items.map((m, i) => ({
      idx: i, id: m.id, name: m.name, vd: m.vd, use: m.useTimes, useMax: m.useTimesMax,
      badge: raw[i] ? raw[i].textContent : null
    }));
  }), 15000);
  const valued = items.filter((v) => v.badge && v.badge !== '-');
  check('bag:valued', valued.length > 0, `n=${valued.length} ${valued.slice(0, 6).map((v) => v.name + '=' + v.badge).join(' ')}`);

  const closePopup = async () => {
    const f = page.frames().find((x) => x.url().indexOf('/ItemDetailPopup') >= 0);
    if (f) await evT(f.evaluate(() => { const b = [...document.querySelectorAll('button,[class*=close]')].find((e) => /✕|×|关闭/i.test((e.textContent || '') + (e.getAttribute('aria-label') || ''))); if (b) b.click(); }));
    await sleep(450);
  };

  let pass = 0, tot = 0;
  for (const t of valued.slice(0, 5)) {
    await bp.locator('.bag-panel:not(.is-storage) .grid-container .item').nth(t.idx).click({ timeout: 5000 }).catch(() => { });
    let d = null;
    for (let i = 0; i < 20; i++) {
      await sleep(350);
      const f = page.frames().find((x) => x.url().indexOf('/ItemDetailPopup') >= 0);
      if (!f) continue;
      d = await evT(f.evaluate(() => {
        const cards = [...document.querySelectorAll('.value-card')].map((c) => ({ num: ((c.querySelector('.value-card-num') || {}).textContent || '').trim(), label: ((c.querySelector('.value-card-label') || {}).textContent || '').trim() }));
        const rawTxt = (document.body.innerText || '').replace(/\n+/g, ' | ');
        const um = rawTxt.match(/使用次数\s*\|\s*(\d+)\s*\|\s*\/?\s*(\d+)/) || rawTxt.match(/(\d+)\s*\/\s*(\d+)/);
        return { cards, rawTxt: rawTxt.slice(0, 200), useA: um ? +um[1] : null, useB: um ? +um[2] : null };
      }), 6000);
      if (d && d.rawTxt.indexOf(t.name) >= 0) break;
      d = null;
    }
    tot++;
    if (!d) { check('popup:' + t.name, false, '弹窗未开/未匹配'); await closePopup(); continue; }
    await page.screenshot({ path: path.join(OUT, 'v198-' + t.id + '.png') }).catch(() => { });
    const sat = d.cards.find((c) => /饱腹/.test(c.label));
    const per = sat ? parseInt(sat.num.replace('+', ''), 10) : null;
    const uses = d.useA != null ? d.useA : t.use;
    const expect = per != null ? per * Math.max(1, uses) : null;
    const ok = per != null && String(expect) === t.badge;
    if (ok) pass++;
    check('popup:' + t.name, ok,
      `弹窗+${per}×${uses}次=${expect} vs 角标${t.badge}（vd=${JSON.stringify(t.vd)} 模型${t.use}/${t.useMax}）`);
    await closePopup();
  }
  check('popup:all', tot > 0 && pass === tot, `${pass}/${tot} 件全中`);
  check('zero-page-errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  finish();
})().catch((e) => { console.error('HARNESS ERROR', String(e).slice(0, 300)); process.exit(2); });
