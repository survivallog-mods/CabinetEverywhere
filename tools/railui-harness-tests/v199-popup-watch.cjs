/* v199 零打扰观察者：轮询 BackpackUI 角标层/格/弹窗状态，只在状态变化时打一行。
   作者正常操作（开背包→点物品→关弹窗），抓「数值消失」瞬间的实况。
   单连接干净退出。 */
const fs = require('fs');
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const OUT = 'C:/temp/v199-watch.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WD = setTimeout(() => { console.log('[wd] 5min 收卷'); process.exit(0); }, 300000);

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 20000 });
  const page = browser.contexts()[0].pages().find((p) => decodeURIComponent(p.url()).indexOf('Root') >= 0);
  const events = [];
  let last = null;
  for (let i = 0; i < 700; i++) {
    try {
      const s = await page.evaluate(() => {
        const bp = [...document.querySelectorAll('iframe')].find((f) => f.src.indexOf('/BackpackUI.') >= 0);
        const pop = [...document.querySelectorAll('iframe')].find((f) => f.src.indexOf('/ItemDetailPopup') >= 0);
        const doc = bp && bp.contentDocument;
        if (!doc || !doc.body) return { bp: false, pop: !!pop };
        const g = doc.querySelector('.bag-panel:not(.is-storage) .grid-container');
        const layer = doc.getElementById('srnBadges');
        const cells = g ? [...g.querySelectorAll('.item')] : [];
        const su = doc.getElementById('app') && doc.getElementById('app')._vnode ? doc.getElementById('app')._vnode.component.setupState : null;
        return {
          bp: true, pop: !!pop,
          ifHidden: bp.style.display === 'none' || getComputedStyle(bp).display === 'none',
          gridVisible: !!g && g.offsetParent !== null,
          cells: cells.length,
          cell0: cells[0] ? [cells[0].offsetWidth, cells[0].offsetHeight] : null,
          modelN: su && su.bagA ? su.bagA.items.length : -1,
          layerExists: !!layer,
          layerN: layer ? layer.querySelectorAll('i').length : -1,
          htmlLen: layer ? layer.innerHTML.length : -1,
          valN: layer ? [...layer.querySelectorAll('i')].filter((x) => x.textContent && x.textContent !== '-' && x.textContent !== '').length : -1
        };
      });
      const sig = JSON.stringify(s);
      if (sig !== last) {
        last = sig;
        events.push({ t: Date.now(), s });
        console.log(new Date().toISOString().slice(11, 19), sig);
      }
      if (s.pop === false && s.layerExists === true && s.layerN === 0 && events.length > 3) break; /* 抓到弹窗关后空层 */
    } catch (e) { /* 帧切换瞬态 */ }
    await sleep(400);
  }
  fs.writeFileSync(OUT, JSON.stringify(events, null, 1));
  clearTimeout(WD);
  await browser.close();
  process.exit(0);
})().catch((e) => { console.log('ERR', String(e).slice(0, 150)); process.exit(1); });
