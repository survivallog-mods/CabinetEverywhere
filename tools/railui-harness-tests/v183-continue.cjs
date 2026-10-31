const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const page = browser.contexts()[0].pages()[0];
  const main = page.frames().find((f) => f.url().indexOf('/MainUI.') >= 0);
  await main.locator('.menu-text:has-text("继续生存")').first().click({ timeout: 6000 });
  console.log('[menu] 已点 继续生存');
  for (let i = 0; i < 50; i++) {
    await page.waitForTimeout(3000);
    const has = await page.evaluate(() => !!document.querySelector('iframe#CoreUI1'));
    if (has) { console.log('[menu] 存档已载入（HUD 在场，~' + (i * 3 + 3) + 's）'); break; }
    if (i === 49) console.log('[menu] 150s 未见 HUD——可能弹窗，截屏待查');
  }
  await browser.close();
})().catch((e) => { console.error('ERR', e); process.exit(2); });
