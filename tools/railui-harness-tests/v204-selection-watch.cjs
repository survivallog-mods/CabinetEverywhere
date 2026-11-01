/* v204 选中瞬间观察者（零点击零写入，只读轮询+只读包装）：
   每 250ms 采样 BackpackUI：排序态/角标层/格数/选中/弹窗/tooltip + 契约到达（setData 包装计数）。
   状态变化才打行。作者操作=开背包→排序→点选有数值物品。落 C:/temp/v204.txt */
const fs = require('fs');
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
const WD = setTimeout(() => { fs.writeFileSync('C:/temp/v204.txt', lines.join('\n')); process.exit(0); }, 600000);

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 20000 });
  const page = browser.contexts()[0].pages().find((p) => decodeURIComponent(p.url()).indexOf('Root') >= 0);
  page.on('console', (m) => { const t = m.text(); if (t.indexOf('CERail') >= 0) log('CONSOLE ' + t.slice(0, 160)); });

  /* 只读包装：契约到达计数（不改变行为） */
  await page.evaluate(() => {
    try {
      if (window.__CERAIL__ && window.__CERAIL__.setData && !window.__SRW__) {
        window.__SRW__ = { n: 0, last: '' };
        const orig = window.__CERAIL__.setData;
        window.__CERAIL__.setData = function (j) {
          try {
            const o = typeof j === 'string' ? JSON.parse(j) : j;
            const itemN = o && o.items ? Object.keys(o.items).reduce((a, k) => a + (o.items[k] || []).length, 0) : -1;
            const sig = 'rev=' + (o ? o.rev : '?') + ' page=' + (o && o.ctx ? o.ctx.page : '?') + ' rows=' + itemN + ' ctn=' + (o && o.ctn ? o.ctn.length : '?');
            if (sig !== window.__SRW__.last) { window.__SRW__.last = sig; window.__SRW__.n++; console.log('[SRW-CONTRACT] ' + sig); }
          } catch (e) { }
          return orig.apply(this, arguments);
        };
      }
    } catch (e) { }
  });

  let last = '';
  for (let i = 0; i < 2400; i++) {
    try {
      const s = await page.evaluate(() => {
        const bp = [...document.querySelectorAll('iframe')].find((f) => f.src.indexOf('/BackpackUI.') >= 0);
        const pop = [...document.querySelectorAll('iframe')].some((f) => f.src.indexOf('/ItemDetailPopup') >= 0);
        const w = window.__SRW__ || { n: 0, last: '' };
        if (!bp || !bp.contentDocument || !bp.contentDocument.body) return JSON.stringify({ bp: false, pop, ctr: w.last });
        const doc = bp.contentDocument;
        const g = doc.querySelector('.bag-panel:not(.is-storage) .grid-container');
        const layer = doc.getElementById('srnBadges');
        const cells = g ? [...g.querySelectorAll('.item')] : [];
        const sel = cells.find((c) => /selected/.test(c.className));
        const tp = doc.querySelector('[class*="tooltip"]');
        const su = doc.getElementById('app') && doc.getElementById('app')._vnode ? doc.getElementById('app')._vnode.component.setupState : null;
        return JSON.stringify({
          bp: true, pop,
          cells: cells.length, modelN: su && su.bagA ? su.bagA.items.length : -1,
          sel: sel ? 1 : 0,
          tp: tp ? (tp.offsetParent !== null ? 1 : 0) : 0,
          L: layer ? layer.querySelectorAll('i').length : -1,
          valN: layer ? [...layer.querySelectorAll('i')].filter((x) => x.textContent && x.textContent !== '-').length : -1,
          lbl: (doc.getElementById('srnSortLbl') || {}).textContent || '',
          on: !!(doc.getElementById('srnSortBtn') || { className: '' }).className.match(/srn-on/) ? 1 : 0,
          ctr: w.last
        });
      });
      if (s !== last) { last = s; log(new Date().toISOString().slice(11, 23) + ' ' + s); }
    } catch (e) { /* 帧切换瞬态 */ }
    await sleep(250);
  }
  fs.writeFileSync('C:/temp/v204.txt', lines.join('\n'));
  clearTimeout(WD);
  await browser.close();
  process.exit(0);
})().catch((e) => { log('ERR ' + String(e).slice(0, 200)); fs.writeFileSync('C:/temp/v204.txt', lines.join('\n')); process.exit(1); });
