/* v188 单连接定点探针（2026-11-01 缺陷单#1/#2 实机排障）：Cooking 页 items=0 与排序弹层打不开两案。
   单连接一次性跑完 → browser.close() 干净退出（外部 kill 会楔死 Vuplex devtools——教训）；
   全部 evaluate 竞速 12s + 180s 硬看门狗（clean exit）。 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');

const hardExit = setTimeout(() => { console.log('[wd] 180s 强制收卷'); process.exit(3); }, 180000);
const evT = (pms, ms) => Promise.race([pms, new Promise((r) => setTimeout(() => r('__TO__'), ms || 12000))]);

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 30000 });
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => decodeURIComponent(p.url()).indexOf('Root') >= 0);
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 120)); });
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));

  /* 存档就绪：主菜单 → 继续生存 → HUD（iframe#CoreUI1） */
  for (let i = 0; i < 50; i++) {
    await page.waitForTimeout(3000);
    if (await evT(page.evaluate(() => !!document.querySelector('iframe#CoreUI1')), 8000)) break;
    const m = page.frames().find((f) => f.url().indexOf('/MainUI.') >= 0);
    if (m && i === 0) await m.locator('.menu-text:has-text("继续生存")').first().click({ timeout: 5000 }).catch(() => { });
  }
  console.log('[boot] HUD 在场？', await evT(page.evaluate(() => !!document.querySelector('iframe#CoreUI1')), 8000));

  /* HUD 开背包（激活 drain）——CoreUI1 帧可能未即时 attach：轮询 */
  let core = null;
  for (let i = 0; i < 10 && !core; i++) { core = page.frames().find((f) => f.url().indexOf('/CoreUI1.') >= 0); if (!core) await page.waitForTimeout(1000); }
  if (core) console.log('[hud]', await evT(core.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').trim().indexOf('背包B') === 0);
    if (el) { el.click(); return 'clicked'; } return 'no-btn';
  })));
  else console.log('[hud] CoreUI1 frame 未 attach');
  for (let i = 0; i < 10; i++) { await page.waitForTimeout(1000); if (page.frames().some((f) => decodeURIComponent(f.url()).indexOf('/BackpackUI.') >= 0)) { console.log('[bp] BackpackUI 已开'); break; } }

  /* uiShow Cooking */
  console.log('[uiShow]', await evT(page.evaluate(() => window.__CERAIL__.cmd('uiShow', { key: 'Cooking' })), 8000) === undefined ? 'sent' : '?');
  await page.waitForTimeout(3500);
  const fr = page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/Cooking.') >= 0);
  if (!fr) { console.log('[fail] no Cooking frame'); await browser.close(); process.exit(4); }

  const dump = await evT(fr.evaluate(() => {
    const rail = document.getElementById('srRail');
    const host = document.getElementById('srGridHost');
    const g = document.getElementById('backpackGrid');
    const allItems = document.querySelectorAll('.item').length;
    const hostItems = host ? host.querySelectorAll('.item').length : -1;
    let gPath = null;
    if (g) { let n = g, p = []; for (let i = 0; i < 6 && n; i++) { p.push(n.tagName + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.split(' ').slice(0, 2).join('.') : '')); n = n.parentElement; } gPath = p.join(' << '); }
    const btn = document.getElementById('srFoodSort');
    return {
      rail: !!rail, railCls: rail ? rail.className : '', host: !!host,
      hostChildren: host ? [...host.children].map((c) => c.tagName + (c.id ? '#' + c.id : '') + '.' + String(c.className).split(' ')[0]).slice(0, 5) : [],
      hostItems, allItems, gPath,
      btnHidden: btn ? btn.hidden : 'no-btn',
      popExists: !!document.getElementById('srFootSortPop'),
      st: window.parent.__CERAIL__.state ? { scene: window.parent.__CERAIL__.state.scene, cur: window.parent.__CERAIL__.state.currentId, fsort: window.parent.__CERAIL__.state.fsort } : null
    };
  }));
  console.log('[dump1]', JSON.stringify(dump, null, 1));

  /* 点排序钮 → 弹层态 */
  const popTry = await evT(fr.evaluate(() => {
    const b = document.getElementById('srFoodSort');
    if (!b) return 'no-btn';
    if (b.hidden) return 'btn-hidden';
    b.click();
    const p = document.getElementById('srFootSortPop');
    return { clicked: true, popAfter: p ? p.hidden : 'no-pop', popCls: p ? p.className : '' };
  }));
  console.log('[pop]', JSON.stringify(popTry));
  await page.waitForTimeout(700);
  const popState = await evT(fr.evaluate(() => {
    const p = document.getElementById('srFootSortPop');
    return p ? { hidden: p.hidden, opts: p.querySelectorAll('.sr-fsopt').length } : 'no-pop';
  }));
  console.log('[pop-after-700ms]', JSON.stringify(popState));

  /* 直发 sortBy（背包 owner 从 Root state 取不到则从契约推） */
  const bagOwner = await evT(page.evaluate(() => {
    const s = window.__CERAIL__.state;
    return s && s.currentId ? s.currentId : null;
  }));
  console.log('[sortBy] owner=', bagOwner, await evT(page.evaluate((o) => { window.__CERAIL__.cmd('sortBy', { owner: o, key: 'sat' }); return 'sent'; }, 900001)));
  await page.waitForTimeout(3500);
  const after = await evT(fr.evaluate(() => {
    const host = document.getElementById('srGridHost');
    const toast = document.querySelector('.sr-toast');
    return { hostItems: host ? host.querySelectorAll('.item').length : -1, toast: toast ? toast.textContent : 'none', toastHidden: toast ? toast.hidden : null };
  }));
  console.log('[after-sortBy]', JSON.stringify(after));
  console.log('[console-errs]', JSON.stringify([...new Set(errs)].slice(0, 6)));

  await page.screenshot({ path: 'E:/Game/Mod/survivallog-mods/CabinetEverywhere/SurvivalLog.CabinetEverywhere/design-proto/shots/ingame-v187/probe-cooking.png' }).catch((e) => console.log('[shot]', String(e).slice(0, 60)));
  clearTimeout(hardExit);
  await browser.close(); /* 干净退出（防 devtools 楔死） */
  process.exit(0);
})().catch((e) => { console.error('PROBE ERR', String(e).slice(0, 200)); process.exit(2); });
