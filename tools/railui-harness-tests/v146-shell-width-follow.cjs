/* v1.8.4 缺陷#5 回归（两轮）：混宽下壳宽跟随。
   第一轮（cdb620c）：旧壳宽锁（st.railMinW 会话级只增不减）退役 → syncRailWidth 纯跟随 +
   滚动条计入壳宽——治「窄格右侧空白」「WebView2 经典滚动条啃末列」。
   第二轮（作者实测工作台页滚动条遮格≈一格半）：官方 8 机器页全用 createGridSizeLock
   （webui-bag.js@1211）把格容器钉在**见过的最大列数**，切窄柜时给格容器加左右 margin 补差，
   左 margin 把格区推右；壳若量 offsetWidth（不含 margin）→ 壳比「格+左补边」窄 → 右侧整段
   滑进 overflow-x:hidden 被滚动条盖住。修=量**外沿宽**（offsetWidth+左右 margin）——官方锁
   保证外沿恒定（格区居中），壳跟外沿=跨页签稳定零裁切。
   断言：①初挂 10 列壳=外沿+20+sb、宿主贴外沿 ②缩 6 列：官方锁补 margin（margin>0 证锁路
   走到）、外沿恒定壳稳定、**末列不被滚动条啃（lastCellR≤bodyRight-sb-1，工作台缺陷回归）**
   ③长 12 列：壳随长、末列仍安全 ④同列二次回推零抖 ⑤零控制台错。 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const results = [];
function check(name, ok, detail) { results.push({ name, ok }); console.log((ok ? 'PASS' + ' | ' + name : 'FAIL' + ' | ' + name) + (detail ? ' | ' + detail : '')); }
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
    const cs = getComputedStyle(g);
    const mL = parseFloat(cs.marginLeft) || 0, mR = parseFloat(cs.marginRight) || 0;
    let lastCellR = 0;
    g.querySelectorAll('.slot,.item').forEach((c) => { lastCellR = Math.max(lastCellR, c.getBoundingClientRect().right); });
    return {
      railW: rail.offsetWidth, hostW: host.offsetWidth, gridW: g.offsetWidth,
      mL: Math.round(mL), mR: Math.round(mR), outer: Math.round(g.offsetWidth + mL + mR),
      sbW: body.offsetWidth - body.clientWidth, vScroll: body.scrollHeight > body.clientHeight,
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
  const cellsSafe = (p) => p.lastCellR <= p.bodyRight - p.sbW - 1;

  const p0 = await probe();
  check('brew:init-10col-shell-follows-outer', !!p0 && near(p0.railW, p0.outer + 20 + p0.sbW, 2) && near(p0.hostW, p0.outer, 1),
    `rail=${p0.railW} outer=${p0.outer} grid=${p0.gridW} host=${p0.hostW} sb=${p0.sbW}`);
  check('brew:init-10col-cells-safe', !!p0 && cellsSafe(p0), `lastCell=${p0.lastCellR} bodyRight-sb=${p0.bodyRight - p0.sbW}`);

  await pushCols(6);
  await page.waitForTimeout(450); /* 官方格重建 + sizeLock 补 margin + badge MO 50ms 去抖 + 宽同步 */
  const p1 = await probe();
  check('brew:shrink-6col-lock-pads-margin', !!p1 && p1.mL + p1.mR > 0 && near(p1.outer, p0.outer, 3),
    `margin L${p1.mL}+R${p1.mR} 外沿 ${p0.outer}→${p1.outer}（官方锁钉最大列数、格区居中）`);
  check('brew:shrink-6col-shell-stable', !!p1 && near(p1.railW, p1.outer + 20 + p1.sbW, 2) && near(p1.railW, p0.railW, 4),
    `rail ${p0.railW}→${p1.railW}（跟外沿=跨宽度稳定，不再锁死也不乱跳）`);
  check('brew:shrink-6col-cells-safe-tt-regression', !!p1 && cellsSafe(p1),
    `lastCell=${p1.lastCellR} ≤ bodyRight-sb-1=${p1.bodyRight - p1.sbW - 1}（工作台遮格≈1.5 格的回归断言：格+补边全在壳内）`);

  await pushCols(12);
  await page.waitForTimeout(450);
  const p2 = await probe();
  check('brew:grow-12col-shell-grows', !!p2 && near(p2.railW, p2.outer + 20 + p2.sbW, 2) && p2.railW > p1.railW,
    `rail ${p1.railW}→${p2.railW} outer=${p2.outer}`);
  check('brew:grow-12col-cells-safe', !!p2 && cellsSafe(p2), `lastCell=${p2.lastCellR} ≤ ${p2.bodyRight - p2.sbW - 1}`);

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
