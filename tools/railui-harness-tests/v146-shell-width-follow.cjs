/* v1.8.4 缺陷#5 回归：混宽下壳宽**纯跟随**（作者 2026-11-01 实测：SizeEngine 三道门后
   6/8/10/12/15 列并存，有的界面柜子右侧一片空白/有的滚动条压格子）。
   旧壳宽锁（st.railMinW 会话级只增不减、切容器不重置）两头作恶：看过宽格后切窄格→壳锁
   最大宽→右侧空白；契约包先到 render 量旧宽、官方 BagMsg（新列数）后到格变宽→壳比格窄
   →sr-body 滚动条+overflow-x:hidden 压末列。
   修复=syncRailWidth（render 主路+badge MO 官方重渲染路）：量官方格自身 offsetWidth
   （inline px 定宽，无反馈）→ 壳宽=格宽+20 纯跟随；幂等零写防观察器回环。
   断言：①初挂 10 列壳=格+20、宿主贴合 ②官方格缩 6 列→壳随缩（空白消、锁已退役）
   ③再推 12 列→壳随长且 body 不溢出（scrollWidth≤clientWidth=末列不被压）④同列二次
   回推宽度稳定零抖 ⑤零控制台错。 */
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
  if (!bf) { console.log('FAIL | brew-frame'); await browser.close(); process.exit(3); }
  const probe = () => bf.evaluate(() => {
    const host = document.getElementById('srGridHost');
    const rail = document.getElementById('srRail');
    const g = document.getElementById('bagGrid');
    const body = rail ? rail.querySelector('.sr-body') : null;
    if (!host || !rail || !g || !body) return null;
    let lastCellR = 0;
    g.querySelectorAll('.slot,.item').forEach((c) => { lastCellR = Math.max(lastCellR, c.getBoundingClientRect().right); });
    return {
      railW: rail.offsetWidth, hostW: host.offsetWidth, gridW: g.offsetWidth,
      hostInline: host.style.width, railInline: rail.style.width,
      bodyClientW: body.clientWidth, bodyScrollW: body.scrollWidth,
      sbW: body.offsetWidth - body.clientWidth,
      lastCellR: Math.round(lastCellR), bodyRight: Math.round(body.getBoundingClientRect().right)
    };
  });
  const pushCols = (cols) => bf.evaluate((c) => {
    const ico = 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
    const items = [];
    for (let i = 0; i < Math.min(c, 8); i++) items.push({ itemId: 901 + i, x: i, y: i % 2, w: 1, h: 1, icon: ico, name: '物品' + (901 + i), count: 1, quality: 3 });
    /* 官方 BagMsg 形状直投自身（Root case 8 同路）：模拟 C# 切柜后按新容器列数回推 */
    window.postMessage({ type: 'WebUI_Brew_BagMsg', data: { bagOwnerId: 900001, bagCols: c, bagRows: 6, bagItems: items } }, '*');
  }, cols);
  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  const p0 = await probe();
  check('brew:init-10col-shell-follows', !!p0 && near(p0.railW, p0.gridW + 20 + p0.sbW, 2) && near(p0.hostW, p0.gridW, 1),
    `rail=${p0.railW} grid=${p0.gridW} host=${p0.hostW}（壳=格+20、宿主贴合）`);

  await pushCols(6);
  await page.waitForTimeout(450); /* 官方格重建 + badge MO 50ms 去抖 + 宽同步 */
  const p1 = await probe();
  check('brew:shrink-6col-shell-shrinks', !!p1 && p1.gridW < p0.gridW && near(p1.railW, p1.gridW + 20 + p1.sbW, 2) && p1.railW < p0.railW,
    `rail ${p0.railW}→${p1.railW} grid ${p0.gridW}→${p1.gridW}（壳随缩=右侧空白消，锁已退役）`);
  check('brew:shrink-6col-host-fits', !!p1 && near(p1.hostW, p1.gridW, 1), `host=${p1.hostW} grid=${p1.gridW}`);

  await pushCols(12);
  await page.waitForTimeout(450);
  const p2 = await probe();
  check('brew:grow-12col-shell-grows', !!p2 && near(p2.railW, p2.gridW + 20 + p2.sbW, 2) && p2.railW > p1.railW,
    `rail ${p1.railW}→${p2.railW} grid=${p2.gridW}（壳随长）`);
  check('brew:grow-12col-no-clip', !!p2 && (p2.gridW - p2.bodyClientW) <= 5,
    'grid=' + p2.gridW + ' client=' + p2.bodyClientW + ' 溢出=' + (p2.gridW - p2.bodyClientW) + 'px（≤5=只吃格区自带内边距、末列安全，与滚动条粗细无关）');

  await pushCols(12);
  await page.waitForTimeout(450);
  const p3 = await probe();
  check('brew:stable-on-repush', !!p3 && p3.railW === p2.railW && p3.hostW === p2.hostW,
    `rail=${p3.railW} host=${p3.hostW}（二次回推零抖、幂等零写）`);
  check('zero-console-errors', errs.length === 0, JSON.stringify(errs.slice(0, 2)));

  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
