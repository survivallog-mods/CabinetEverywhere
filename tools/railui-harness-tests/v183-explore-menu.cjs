const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const page = browser.contexts()[0].pages()[0];
  const main = page.frames().find((f) => f.url().indexOf('/MainUI.') >= 0);
  const els = await main.evaluate(() => {
    const out = [];
    document.querySelectorAll('body *').forEach((e) => {
      const t = (e.childNodes.length === 1 && e.textContent || '').trim();
      const cs = getComputedStyle(e);
      if (t && t.length <= 12 && cs.display !== 'none' && cs.visibility !== 'hidden') {
        const r = e.getBoundingClientRect();
        if (r.width > 10 && r.height > 8) out.push({ tag: e.tagName, cls: String(e.className).slice(0, 30), t, w: Math.round(r.width), x: Math.round(r.x), y: Math.round(r.y), cur: cs.cursor });
      }
    });
    return out.slice(0, 40);
  });
  console.log(JSON.stringify(els, null, 0));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(2); });
