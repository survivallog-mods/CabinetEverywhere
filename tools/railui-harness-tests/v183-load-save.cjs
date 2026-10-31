/* 主菜单 → 继续游戏（CDP 独驱动进存档） */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];
  const main = page.frames().find((f) => f.url().indexOf('/MainUI.') >= 0);
  if (!main) { console.log('no MainUI'); process.exit(1); }
  const btns = await main.evaluate(() => [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim()).filter(Boolean));
  console.log('[menu] buttons:', JSON.stringify([...new Set(btns)].slice(0, 20)));
  const target = main.locator('button:has-text("继续"), button:has-text("继续游戏")').first();
  if (await target.count()) {
    await target.click({ timeout: 5000 });
    console.log('[menu] 已点 继续游戏');
  } else {
    const start = main.locator('button:has-text("开始"), button:has-text("载入"), button:has-text("读取")').first();
    if (await start.count()) { await start.click(); console.log('[menu] 已点', await start.textContent()); }
    else { console.log('[menu] 未找到入口，需人工点'); process.exit(3); }
  }
  /* 等存档加载完成：CoreUI1 出现（HUD） */
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(3000);
    const has = await page.evaluate(() => !!document.querySelector('iframe#CoreUI1'));
    if (has) { console.log('[menu] 存档已载入（HUD 在场，~' + (i * 3 + 3) + 's）'); break; }
    if (i === 39) console.log('[menu] 120s 未见 HUD——可能停在选档/弹窗，需人工');
  }
  await browser.close();
})().catch((e) => { console.error('LOAD ERROR', e); process.exit(2); });
