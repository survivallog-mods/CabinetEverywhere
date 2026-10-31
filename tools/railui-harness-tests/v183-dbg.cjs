const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const page = browser.contexts()[0].pages().find((p) => decodeURIComponent(p.url()).indexOf('Root') >= 0);
  const frames = await page.evaluate(() => [...document.querySelectorAll('iframe')].map((f) => f.id + (getComputedStyle(f).display !== 'none' ? '*' : '')));
  console.log('[dbg] iframes:', frames.join(','));
  await page.evaluate(() => window.__CERAIL__.cmd('uiShow', { key: 'Cooking' }));
  await page.waitForTimeout(300);
  console.log('[dbg] drain(300ms):', await page.evaluate(() => window.__CERAIL__.drain()));
  await page.waitForTimeout(2500);
  const frames2 = await page.evaluate(() => [...document.querySelectorAll('iframe')].map((f) => f.id + (getComputedStyle(f).display !== 'none' ? '*' : '')));
  console.log('[dbg] after uiShow:', frames2.join(','));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(2); });
