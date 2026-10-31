const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 200)); });
  page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 200)));
  await page.goto('http://127.0.0.1:8180/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  const info = await page.evaluate(() => {
    const keys = ['Cooking', 'Shredder', 'MaterialRack', 'Trade'];
    const out = {};
    for (const k of keys) {
      const f = document.getElementById(k);
      let doc = null; try { doc = f.contentDocument; } catch (e) { }
      out[k] = {
        display: getComputedStyle(f).display,
        docReady: doc ? doc.readyState : null,
        bodyChildren: doc && doc.body ? doc.body.children.length : -1,
        bagTabs: doc ? doc.querySelectorAll('#bagTabs').length : -1,
        cart: doc ? doc.querySelectorAll('.cart').length : -1,
        rackSystem: doc ? doc.querySelectorAll('#rackSystem').length : -1,
        colsCol: doc ? doc.querySelectorAll('.cols>.col').length : -1,
        srRail: doc ? !!doc.getElementById('srRail') : null,
        chk: window.__HZ_HOSTCHK__ ? window.__HZ_HOSTCHK__(k) : null,
        title: doc ? (doc.title || '').slice(0, 30) : null,
        bodyHead: doc && doc.body ? doc.body.innerHTML.slice(0, 120) : null
      };
    }
    return out;
  });
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
