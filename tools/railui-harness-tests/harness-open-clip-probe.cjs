/* 首开裁格探针（作者实报：工作台/无人机交易开页背包左右两列各显示一半，切页签恢复）。
   serve.cjs 8180 + 真 railui.page.js：开页首帧量格几何，再模拟切页签（官方 BagMsg 重渲染）
   复测对比——定位是壳宽冻窄、格偏移还是宿主裁切。只取证不断言修复。 */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/Users/wangk/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright')); }

const BASE = 'http://127.0.0.1:8180';
const SCENE = process.argv[2] || 'ToolTable';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/wangk/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe' });
  const page = await (await browser.newContext({ viewport: { width: 1536, height: 864 } })).newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HZ_CURRENT__ !== undefined && window.__HZ_CURRENT__() !== null, null, { timeout: 20000 });
  await page.evaluate((k) => window.__HZ_SHOW__(k), SCENE);

  const frame = () => page.frames().find((f) => f.url().includes('/fixtures/' + SCENE));
  await frame().waitForFunction(() => {
    const rail = document.getElementById('srRail');
    const g = document.getElementById('backpack-grid') || document.getElementById('tradeBagGrid') || document.querySelector('.grid-container');
    return rail && g && g.offsetWidth > 0;
  }, null, { timeout: 15000 });

  async function measure(tag) {
    return await frame().evaluate((t) => {
      const rail = document.getElementById('srRail');
      const host = rail && rail.querySelector('.sr-gridhost');
      const body = rail && rail.querySelector('.sr-body');
      const g = document.getElementById('backpack-grid') || document.getElementById('tradeBagGrid') || (host && host.querySelector('.grid-container'));
      if (!rail || !g) return { tag: t, err: 'no rail/grid' };
      const gr = g.getBoundingClientRect();
      const hr = host.getBoundingClientRect();
      const cs = getComputedStyle(g);
      /* 末列右缘 vs 格元素右缘 vs 宿主右缘；首列左缘同理 */
      const slots = g.querySelectorAll('.slot');
      let firstSlotL = null, lastSlotR = null;
      if (slots.length) {
        firstSlotL = slots[0].getBoundingClientRect().left;
        lastSlotR = slots[slots.length - 1].getBoundingClientRect().right;
      }
      let hostClipR = null, hostClipL = null;
      if (body) { const br = body.getBoundingClientRect(); hostClipR = br.right; hostClipL = br.left; }
      return {
        tag: t,
        railW: rail.offsetWidth,
        hostW: host.offsetWidth, hostL: +hr.left.toFixed(1), hostR: +hr.right.toFixed(1),
        gridW: g.offsetWidth, gridL: +gr.left.toFixed(1), gridR: +gr.right.toFixed(1),
        ml: cs.marginLeft, mr: cs.marginRight, pos: cs.position,
        gtc: (cs.gridTemplateColumns || '').split(' ').length + '轨',
        nSlots: slots.length,
        firstSlotL: firstSlotL != null ? +firstSlotL.toFixed(1) : null,
        lastSlotR: lastSlotR != null ? +lastSlotR.toFixed(1) : null,
        bodyClipL: hostClipL, bodyClipR: hostClipR,
        overL: firstSlotL != null && hostClipL != null ? +(hostClipL - firstSlotL).toFixed(1) : null, /* >0=首列被左裁 */
        overR: lastSlotR != null && hostClipR != null ? +(lastSlotR - hostClipR).toFixed(1) : null,   /* >0=末列被右裁 */
      };
    }, tag);
  }

  const m1 = await measure('首开');
  console.log(JSON.stringify(m1, null, 1));
  /* 模拟切页签（官方重渲染路）：点第一个柜子页签再点回背包 */
  try {
    const switched = await frame().evaluate(() => {
      const tabs = document.querySelectorAll('#leftTabsScroll .cabinet-tab, .bag-tabs-scroll .bag-tab');
      if (!tabs.length) return 'no-tabs';
      tabs[0].click();
      return 'clicked:' + tabs.length;
    });
    console.log('switch:', switched);
    await page.waitForTimeout(700);
    const back = await frame().evaluate(() => {
      const bag = document.getElementById('tab-bag') || document.querySelector('.bag-tab-pinned .bag-tab, .bag-tab-pinned-slot .bag-tab');
      if (bag) { bag.click(); return 'back'; }
      return 'no-bag-tab';
    });
    console.log('switch-back:', back);
    await page.waitForTimeout(700);
  } catch (e) { console.log('switch err', String(e)); }
  const m2 = await measure('切页签后');
  console.log(JSON.stringify(m2, null, 1));
  await browser.close();
})();
