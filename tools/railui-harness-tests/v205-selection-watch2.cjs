/* v205 硬化选中观察者：200ms 采样 + 每行立即落盘（进程死也保数据）+ 弹窗期加密采样。
   记录：排序态/角标层(条数+首80字符)/格数/选中/tooltip/弹窗/契约到达。 */
const fs = require('fs');
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = 'C:/temp/v205.txt';
const lines = [];
const push = (s) => { lines.push(s); console.log(s); fs.appendFileSync(OUT, s + '\n'); };
try { fs.unlinkSync(OUT); } catch (e) { }
const WD = setTimeout(() => { push('[wd] 8min 收卷'); process.exit(0); }, 480000);

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 20000 });
  const page = browser.contexts()[0].pages().find((p) => decodeURIComponent(p.url()).indexOf('Root') >= 0);
  page.on('console', (m) => { const t = m.text(); if (t.indexOf('CERail') >= 0 || t.indexOf('SRW') >= 0) push('CONSOLE ' + t.slice(0, 160)); });
  await page.evaluate(() => {
    try {
      if (window.__CERAIL__ && window.__CERAIL__.setData && !window.__SRW__) {
        window.__SRW__ = { last: '' };
        const orig = window.__CERAIL__.setData;
        window.__CERAIL__.setData = function (j) {
          try {
            const o = typeof j === 'string' ? JSON.parse(j) : j;
            const itemN = o && o.items ? Object.keys(o.items).reduce((a, k) => a + (o.items[k] || []).length, 0) : -1;
            const sig = 'rev=' + (o ? o.rev : '?') + ' page=' + (o && o.ctx ? o.ctx.page : '?') + ' rows=' + itemN + ' ctn=' + (o && o.ctn ? o.ctn.length : '?') + ' bag=' + (o ? o.bag : '?');
            if (sig !== window.__SRW__.last) { window.__SRW__.last = sig; console.log('[SRW-CONTRACT] ' + sig); }
          } catch (e) { }
          return orig.apply(this, arguments);
        };
      }
    } catch (e) { }
  });
  let last = '';
  let fast = 0; /* 弹窗开=快采样余次 */
  for (let i = 0; i < 3000; i++) {
    try {
      const s = await page.evaluate(() => {
        const bp = [...document.querySelectorAll('iframe')].find((f) => f.src.indexOf('/BackpackUI.') >= 0);
        const pop = [...document.querySelectorAll('iframe')].some((f) => f.src.indexOf('/ItemDetailPopup') >= 0);
        const w = window.__SRW__ || { last: '' };
        if (!bp || !bp.contentDocument || !bp.contentDocument.body) return JSON.stringify({ bp: false, pop, ctr: w.last });
        const doc = bp.contentDocument;
        const g = doc.querySelector('.bag-panel:not(.is-storage) .grid-container');
        const layer = doc.getElementById('srnBadges');
        const cells = g ? [...g.querySelectorAll('.item')] : [];
        const sel = cells.find((c) => /selected/.test(c.className));
        const tp = doc.querySelector('[class*="tooltip"]');
        const su = doc.getElementById('app') && doc.getElementById('app')._vnode ? doc.getElementById('app')._vnode.component.setupState : null;
        return JSON.stringify({
          bp: 1, pop: pop ? 1 : 0,
          cells: cells.length, modelN: su && su.bagA ? su.bagA.items.length : -1,
          sel: sel ? 1 : 0,
          tp: tp ? (tp.offsetParent !== null ? 1 : 0) : 0,
          L: layer ? layer.querySelectorAll('i').length : -1,
          head: layer ? layer.innerHTML.slice(0, 60) : '',
          valN: layer ? [...layer.querySelectorAll('i')].filter((x) => x.textContent && x.textContent !== '-').length : -1,
          lbl: (doc.getElementById('srnSortLbl') || {}).textContent || '',
          on: !!(doc.getElementById('srnSortBtn') || { className: '' }).className.match(/srn-on/) ? 1 : 0,
          vis: layer ? (layer.offsetParent !== null ? 1 : 0) : -1,
          ctr: w.last
        });
      });
      const o = JSON.parse(s);
      fast = o.pop ? 12 : Math.max(0, fast - 1); /* 弹窗关后 12 拍快采样追恢复 */
      if (s !== last) { last = s; push(new Date().toISOString().slice(11, 23) + ' ' + s); }
    } catch (e) { push('POLL-ERR ' + String(e).slice(0, 60)); }
    await sleep(fast > 0 ? 120 : 250);
  }
  push('[wd] 轮数尽收卷');
  clearTimeout(WD);
  await browser.close();
  process.exit(0);
})().catch((e) => { push('ERR ' + String(e).slice(0, 200)); process.exit(1); });
