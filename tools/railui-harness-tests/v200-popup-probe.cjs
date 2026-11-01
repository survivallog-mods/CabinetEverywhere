/* v200 弹窗期角标探针：排序→点物品（白色选中框出现）→弹窗期/关闭后各时点读：
   层存在/父节点/条数/innerHTML 长度/格数/选中格 class/网格 MO 状态。落 C:/temp/v200.txt */
const fs = require('fs');
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
const log = (s) => { lines.push(s); console.log(s); return s; };

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 20000 });
  const page = browser.contexts()[0].pages().find((p) => decodeURIComponent(p.url()).indexOf('Root') >= 0);
  let bp = page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/BackpackUI.') >= 0);
  if (!bp) {
    const core = page.frames().find((f) => f.url().indexOf('/CoreUI1.') >= 0);
    if (!core) { log('NO HUD'); process.exit(1); }
    await core.evaluate(() => { const el = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').trim().indexOf('背包B') === 0); if (el) el.click(); });
    for (let i = 0; i < 12; i++) { await sleep(800); bp = page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/BackpackUI.') >= 0); if (bp) break; }
  }
  if (!bp) { log('no bp'); process.exit(1); }
  await bp.waitForFunction(() => !!document.getElementById('srnSortBtn'), null, { timeout: 12000 }).catch(() => { });
  await sleep(1000);

  const probe = (tag) => bp.evaluate((t) => {
    const g = document.querySelector('.bag-panel:not(.is-storage) .grid-container');
    const layer = document.getElementById('srnBadges');
    const cells = g ? [...g.querySelectorAll('.item')] : [];
    const sel = cells.find((c) => /selected|active|chosen|picked/i.test(c.className));
    return JSON.stringify({
      t, cells: cells.length,
      selClass: sel ? sel.className.slice(0, 60) : null,
      L: layer ? layer.querySelectorAll('i').length : -1,
      Lhtml: layer ? layer.innerHTML.length : -1,
      valN: layer ? [...layer.querySelectorAll('i')].filter((x) => x.textContent && x.textContent !== '-').length : -1,
      layerParent: layer ? (layer.parentElement ? layer.parentElement.className.slice(0, 20) : 'DETACHED') : 'NONE',
      gridSameNode: !!g && !!g.__srnMO
    });
  }, tag).then(log);

  let pre = JSON.parse(await probe('PRE'));
  if (pre.L <= 0) {
    await bp.evaluate(() => document.getElementById('srnSortBtn').click());
    await sleep(250);
    await bp.evaluate(() => { const o = document.querySelector('#srnSortPop [data-k="sat"]'); if (o) o.click(); });
    await sleep(900);
    pre = JSON.parse(await probe('SORTED'));
  }
  const idx = await bp.evaluate(() => {
    const su = document.getElementById('app')._vnode.component.setupState;
    const raw = [...document.querySelectorAll('#srnBadges i')];
    let k = -1;
    su.bagA.items.forEach((m, i) => { if (k < 0 && raw[i] && raw[i].textContent && raw[i].textContent !== '-') k = i; });
    return k < 0 ? 0 : k;
  });
  log('valued idx = ' + idx);
  await bp.locator('.bag-panel:not(.is-storage) .grid-container .item').nth(idx).click({ timeout: 5000 }).catch(() => { });
  await sleep(400); await probe('CLICK+0.4');
  await sleep(600); await probe('POPUP+1.0');
  await sleep(1300); await probe('POPUP+2.3');
  const f2 = page.frames().find((x) => x.url().indexOf('/ItemDetailPopup') >= 0);
  log('popup frame = ' + !!f2);
  if (f2) await f2.evaluate(() => { const b2 = [...document.querySelectorAll('button,[class*=close]')].find((e) => /✕|×|关闭/i.test((e.textContent || '') + (e.getAttribute('aria-label') || ''))); if (b2) b2.click(); }).catch(() => { });
  await sleep(600); await probe('CLOSED+0.6');
  await sleep(1600); await probe('CLOSED+2.2');
  fs.writeFileSync('C:/temp/v200.txt', lines.join('\n'));
  await browser.close();
  process.exit(0);
})().catch((e) => { console.log('ERR', String(e).slice(0, 200)); fs.writeFileSync('C:/temp/v200.txt', lines.join('\n') + '\nERR ' + String(e)); process.exit(1); });
