/* v201 真人交互复现：hover(出 tooltip)→按下→微移 2px→150ms→抬起（真人点击特征），
   逐 200ms 采样角标层/格/拖拽态/控制台 [CERAIL] 警告。对比 Playwright 瞬时点击。 */
const fs = require('fs');
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
const log = (s) => { lines.push(s); console.log(s); return s; };

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 20000 });
  const page = browser.contexts()[0].pages().find((p) => decodeURIComponent(p.url()).indexOf('Root') >= 0);
  const cons = [];
  page.on('console', (m) => { const t = m.text(); if (t.indexOf('CERail') >= 0 || m.type() === 'error') cons.push(t.slice(0, 150)); });

  let bp = page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/BackpackUI.') >= 0);
  if (!bp) {
    const core = page.frames().find((f) => f.url().indexOf('/CoreUI1.') >= 0);
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
    const tp = document.querySelector('.tooltip, [class*="tooltip"]');
    return JSON.stringify({
      t, cells: cells.length,
      L: layer ? layer.querySelectorAll('i').length : -1,
      valN: layer ? [...layer.querySelectorAll('i')].filter((x) => x.textContent && x.textContent !== '-').length : -1,
      layerParent: layer ? (layer.parentElement ? 'grid' : 'DETACHED') : 'NONE',
      drag: !!(window.__srProbeDrag) || [...cells].some((c) => c.className.indexOf('dragging') >= 0),
      tooltip: tp ? (tp.offsetParent !== null ? 'visible' : 'hidden') : null
    });
  }, tag).then(log);

  await probe('PRE');
  // 排序（若无角标）
  if (JSON.parse(lines[lines.length - 1]).L <= 0) {
    await bp.evaluate(() => document.getElementById('srnSortBtn').click());
    await sleep(250);
    await bp.evaluate(() => { const o = document.querySelector('#srnSortPop [data-k="sat"]'); if (o) o.click(); });
    await sleep(900);
    await probe('SORTED');
  }
  // 第一件有值格：真人交互（hover→按住→微移→抬）
  const box = await bp.evaluate(() => {
    const g = document.querySelector('.bag-panel:not(.is-storage) .grid-container');
    const su = document.getElementById('app')._vnode.component.setupState;
    const raw = [...document.querySelectorAll('#srnBadges i')];
    let k = -1;
    su.bagA.items.forEach((m, i) => { if (k < 0 && raw[i] && raw[i].textContent && raw[i].textContent !== '-') k = i; });
    if (k < 0) k = 0;
    const c = g.querySelectorAll('.item')[k];
    const r = c.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  log('target center = ' + JSON.stringify(box));
  await page.mouse.move(box.x, box.y);           // hover → tooltip
  await sleep(500); await probe('HOVER');
  await page.mouse.down();                        // 按住
  await sleep(120);
  await page.mouse.move(box.x + 2, box.y + 1, { steps: 2 }); // 真人微移
  await sleep(120); await probe('DOWN+MOVE');
  await page.mouse.up();                          // 抬起
  for (let i = 1; i <= 12; i++) {
    await sleep(250);
    const s = JSON.parse(await probe('UP+' + (i * 0.25).toFixed(2) + 's'));
    if (i >= 8) break;
  }
  log('popup = ' + !!(page.frames().find((x) => x.url().indexOf('/ItemDetailPopup') >= 0)));
  log('console: ' + (cons.length ? cons.join(' || ').slice(0, 300) : '(无 CERAIL/error)'));
  fs.writeFileSync('C:/temp/v201.txt', lines.join('\n'));
  await browser.close();
  process.exit(0);
})().catch((e) => { console.log('ERR', String(e).slice(0, 250)); fs.writeFileSync('C:/temp/v201.txt', lines.join('\n') + '\nERR ' + e); process.exit(1); });
