/* ID_ALIAS 校准路验证（findings §6：Backpack 页 iframe id 静态默认 'Backpack'）：
   把 BackpackUI 帧改 id='Backpack' → 复活宿主摘 rail → scan → 应经别名归一重装配，
   且首装日志打出「别名归一」校准行（T8 校准点）。 */
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'log') logs.push(m.text()); });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('http://127.0.0.1:8180/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  /* 等 boot 首场景展示完成（waitBoot 会在 Cooking 预备完成后 show）再驱动测试，
     防测试先行 show 与 boot show 互相覆盖 */
  await page.waitForFunction(() => window.__HZ_CURRENT__() !== null, null, { timeout: 20000 });
  await page.waitForFunction(() => window.__HZ_HOSTCHK__ && window.__HZ_HOSTCHK__('BackpackUI'), null, { timeout: 20000 });
  await page.evaluate(() => window.__HZ_SHOW__('BackpackUI'));
  await page.waitForFunction(() => {
    const f = document.getElementById('BackpackUI');
    return f && f.contentDocument && f.contentDocument.getElementById('srRail');
  }, null, { timeout: 8000 });

  // 摘 rail 复活宿主 + 改 id 为 findings 默认值（检查须在 scan 之前——scan 内同步重装配）
  const r = await page.evaluate(() => {
    const f = document.getElementById('BackpackUI');
    f.id = 'Backpack'; // findings §6 静态默认 id
    const host = window.__HZ_HOSTCHK__('BackpackUI');
    const wrap = f.contentDocument.getElementById('srp');
    wrap.outerHTML = host.html; // 复活宿主（rail 一并摘除）
    return { revived: !!f.contentDocument.querySelector('.backpack-container'), railGone: !f.contentDocument.getElementById('srRail') };
  });
  // 真实 scanFrames 路径重装配（别名归一 → key=BackpackUI）
  const t0 = Date.now();
  await page.evaluate(() => window.__CERAIL__.scan());
  let remountMs = -1;
  for (let i = 0; i < 50; i++) {
    const ok = await page.evaluate(() => {
      const f = document.getElementById('Backpack');
      return f && f.contentDocument && !!f.contentDocument.getElementById('srRail');
    });
    if (ok) { remountMs = Date.now() - t0; break; }
    await page.waitForTimeout(20);
  }
  const scene = await page.evaluate(() => window.__CERAIL__.state.scene);
  const aliasLog = logs.find((l) => l.indexOf('scene mounted: BackpackUI (iframe#Backpack') >= 0);
  console.log((r.revived && r.railGone ? 'PASS' : 'FAIL') + ' | alias:host-revived ' + JSON.stringify(r));
  console.log((remountMs >= 0 && remountMs < 500 ? 'PASS' : 'FAIL') + ' | alias:remount ' + remountMs + 'ms');
  console.log((scene === 'BackpackUI' ? 'PASS' : 'FAIL') + ' | alias:scene-canonical ' + scene + '（st.scene=SCENES 键，非 iframe id）');
  console.log((aliasLog ? 'PASS' : 'FAIL') + ' | alias:calibration-log ' + (aliasLog || '（未找到校准日志）'));
  console.log((errs.length === 0 ? 'PASS' : 'FAIL') + ' | alias:pageerror-zero ' + (errs.join('|') || '0 异常'));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
