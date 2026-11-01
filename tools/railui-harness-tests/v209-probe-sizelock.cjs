/* v209 探针（不入 git 清单亦可）：活体验证 size-lock margin 机制 + 冰箱实际列数 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 15000 });
  try {
    const page = browser.contexts()[0].pages().find((p) => decodeURIComponent(p.url()).indexOf('Root') >= 0);
    const findF = (n) => page.frames().find((f) => decodeURIComponent(f.url()).indexOf(n) >= 0 && f !== page.mainFrame());
    console.log('frames:', page.frames().map((f) => decodeURIComponent(f.url()).split('/').pop().split('?')[0]).join(','));
    const core = findF('CoreUI1');
    await core.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => (x.textContent || '').indexOf('背包') >= 0); if (b) b.click(); });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__CERAIL__.cmd('uiShow', { key: 'Cooking' }));
    await page.evaluate(() => window.__CERAIL__.cmd('uiClose', { key: 'BackpackUI' }));
    await page.waitForTimeout(3000);
    const fr = findF('Cooking');
    if (!fr) { console.log('no cooking'); return; }
    const probe = () => fr.evaluate(() => {
      const rail = document.getElementById('srRail');
      const act = rail ? (rail.querySelector('#srPinRow [data-ctn].active .p-lb') || {}).textContent : null;
      const host = document.getElementById('srGridHost');
      const g = host && host.firstElementChild;
      if (!g) return { act, nogrid: true };
      const cs = getComputedStyle(g);
      let sh = null, e = g.parentElement;
      while (e && e !== document.body) {
        const s = getComputedStyle(e);
        if (s.overflowY === 'auto' || s.overflowY === 'scroll') { sh = { id: e.id || ('.' + String(e.className).split(' ')[0]), clientH: e.clientHeight, scrollH: e.scrollHeight }; break; }
        e = e.parentElement;
      }
      // 列数：grid-template-columns 解析或首行 slot x 聚类
      let cols = 0;
      try { const t = cs.gridTemplateColumns.split(' ').length; if (t > 1) cols = t; } catch (x) { }
      return { act, gridId: g.id, gridW: g.offsetWidth, gridH: g.offsetHeight, colsT: cols, mL: cs.marginLeft, mT: cs.marginTop, mB: cs.marginBottom, styleH: (g.getAttribute('style') || '').slice(0, 90), scrollHost: sh };
    });
    const clickPin = (kw) => fr.evaluate((k) => {
      const pins = Array.from(document.querySelectorAll('#srPinRow [data-ctn]'));
      const hit = pins.find((p) => (p.textContent || '').indexOf(k) >= 0);
      if (hit && !hit.classList.contains('active')) { hit.click(); return true; }
      return false;
    }, kw);
    console.log('T0 背包:', JSON.stringify(await probe()));
    for (const k of ['冰柜', '豪华版双门冰箱', '大容量冰柜', '储物柜', '背包']) {
      const did = await clickPin(k);
      await page.waitForTimeout(1800);
      console.log('T-' + k + (did ? '(切换)' : '(已在/未找到)'), ':', JSON.stringify(await probe()));
    }
  } finally { await browser.close(); }
})().catch((e) => { console.log('ERR', String(e).slice(0, 300)); process.exit(1); });
