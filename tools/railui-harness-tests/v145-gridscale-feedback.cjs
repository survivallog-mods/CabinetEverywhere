/* v1.8.4 缺陷修复回归：酿酒桶一键整理后格子变小/右侧空白（作者 2026-11-01 实测）。
   根因=格区归一量宽用 srGridHost.scrollWidth：v13.8 柜宽 12 列后网格(445)<UNI_W(700)，
   scrollWidth 读到上帧写死的宿主 width:700 → kk=1 → transform 每次回推被重置。
   修复=量子格 offsetWidth（布局宽，transform 无关）。
   断言：①挂载后 scale>1（445→700 归一）②tidy 回推（setData 二次 render）后 scale
   保持不变（帧间稳定=无反馈塌缩）③格子显示宽不缩（slot rect 前后一致）。 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const results = [];
function check(name, ok, detail) { results.push({ name, ok }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); }
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await (await browser.newContext({ viewport: { width: 1536, height: 864 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  await page.goto('http://127.0.0.1:8180/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__HZ_SHOW__('BrewPanel'));
  await page.waitForTimeout(2500);
  const bf = page.frames().find((f) => f.url().includes('/fixtures/BrewPanel.html'));
  const probe = () => bf.evaluate(() => {
    const host = document.getElementById('srGridHost');
    const g = document.getElementById('bagGrid');
    const slot = g ? g.querySelector('.slot') : null;
    const cs = host ? getComputedStyle(host).transform : 'none';
    let scale = 1;
    if (cs && cs !== 'none') { const mm = /matrix\(([\d.]+)/.exec(cs); if (mm) scale = parseFloat(mm[1]); }
    return {
      scale: scale,
      hostW: host ? host.style.width : '',
      slotRectW: slot ? Math.round(slot.getBoundingClientRect().width * 10) / 10 : null,
      gridNatW: g ? g.offsetWidth : null
    };
  });
  const pre = await probe();
  check('brew:scale-normalized', pre.scale > 1.01 && pre.hostW === '700px', `scale=${pre.scale} hostW=${pre.hostW}（445→700 归一）`);
  check('brew:slot-enlarged', pre.slotRectW > 40, `slot 显示宽=${pre.slotRectW}（原 38 归一放大）`);

  await bf.evaluate(() => document.getElementById('srTidy').click()); /* tidy→mock 回推→二次 render */
  await page.waitForTimeout(3500);
  const post = await probe();
  check('brew:scale-stable-after-tidy', Math.abs(post.scale - pre.scale) < 0.005 && post.scale > 1.01, `pre=${pre.scale} post=${post.scale}（修复前=1）`);
  check('brew:slot-not-shrunk', Math.abs(post.slotRectW - pre.slotRectW) < 2, `pre=${pre.slotRectW} post=${post.slotRectW}（修复前缩到 38）`);
  /* 第二笔回推仍稳（循环塌缩防回归） */
  await page.evaluate(() => window.__CERAIL__.cmd('tidy', { owner: 900001 }));
  await page.waitForTimeout(2500);
  const post2 = await probe();
  check('brew:scale-stable-2nd-push', Math.abs(post2.scale - pre.scale) < 0.005, `post2=${post2.scale}`);
  check('zero-console-errors', errs.length === 0, JSON.stringify(errs.slice(0, 2)));
  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
