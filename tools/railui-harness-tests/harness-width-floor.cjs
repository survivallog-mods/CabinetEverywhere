/* 壳宽 W12 地板 harness（Task4，spec §5.2；serve.cjs 须已在 8180）。
   五场景（Review Focus 1-4 逐条钉死）：
   ① 标定：ToolTable 推 12 列 BagMsg → st.w12Floor 落地 >0，记 W=壳宽
   ② 窄柜不缩：切 6 列 → 壳宽恒=W、格区居中（左右留白对称 ±2px）、末列右缘 ≤ 格床右缘-1
   ③ 改值重标定：__HZ_UNIW__=14 重推契约 + 14 列 → W14>W；再切 6 列 → 壳恒=W14
   ④ off 回纯跟随：__HZ_UNIW__=0 重推 + 6 列 → 壳 < W14（跟随窄格）；12 列 → 回 ≈W
   ⑤ 跨页不串味：__HZ_UNIW__=12 + 切 Cooking → st.w12Floor 清 0（applyScene 失效），
      Cooking 自身 12 列自标定 → 切 6 列壳不缩（①②逻辑在本页复跑成立）
   尾部：零 console error / pageerror。 */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/temp/baidu_up/node_modules/playwright-core')); }

const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' : '') + (detail || ''));
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/wangk/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe' });
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HZ_CURRENT__ !== undefined && window.__HZ_CURRENT__() !== null, null, { timeout: 20000 });

  function frameOf(key) { return page.frames().find((f) => f.url().includes('/fixtures/' + key + '.html')); }
  async function waitRail(key, timeout = 9000) {
    await frameOf(key).waitForFunction(() => { const r = document.getElementById('srRail'); return r && r.isConnected; }, null, { timeout });
  }
  const post = (key, data) => page.evaluate(([k, d]) => window.__HZ_POST__(k, d), [key, data]);
  const pushCtx = (key) => page.evaluate((k) => window.__HZ_PUSH__(k), key);
  const setUniw = (v) => page.evaluate((x) => { window.__HZ_UNIW__ = x; }, v);
  const railW = (key) => frameOf(key).evaluate(() => (document.getElementById('srRail') || {}).offsetWidth || 0);
  const floorSt = () => page.evaluate(() => ({ floor: (window.__CERAIL__.state || {}).w12Floor, src: (window.__CERAIL__.state || {}).w12Src }));
  /* 壳内几何：格床(.sr-gridhost)与官方格(其 firstElementChild)的 rect + 末格右缘 + 居中留白 */
  const geo = (key) => frameOf(key).evaluate(() => {
    const host = document.querySelector('.sr-gridhost');
    const g = host && host.firstElementChild;
    if (!host || !g) return null;
    const hr = host.getBoundingClientRect(), gr = g.getBoundingClientRect();
    const cells = g.querySelectorAll('.slot');
    let lastR = -1;
    if (cells.length) { const r = cells[cells.length - 1].getBoundingClientRect(); lastR = r.right; }
    return {
      hostL: hr.left, hostR: hr.right, gridL: gr.left, gridR: gr.right, lastCellR: lastR,
      padL: gr.left - hr.left, padR: hr.right - gr.right, gridW: gr.width
    };
  });
  const bagMsg = (cols) => ({ type: 'WebUI_ToolTable_BagMsg', data: { bagOwnerId: 900001, bagCols: cols, bagRows: 4, bagItems: [], workbenchItems: [], drawerOwnerId: 0, workbenchOwnerId: 0 } });
  const cookMsg = (cols) => ({ type: 'WebUI_Cooking_BagMsg', data: { bagOwnerId: 900001, bagCols: cols, bagRows: 4, bagItems: [], workbenchItems: [] } });
  const sleep = (ms) => page.waitForTimeout(ms);

  /* ---- ① 标定 ---- */
  await page.evaluate(() => window.__HZ_SHOW__('ToolTable'));
  await waitRail('ToolTable');
  /* mount 尾序稳定等待：帖在 reparent→观察器安装窗口内会被漏同步（mount 尾量的还是旧 6 列；
     稳态由后续消息/MO 重同步——实测 500ms 后完全稳定） */
  await sleep(400);
  await post('ToolTable', bagMsg(12));
  await sleep(500);
  const W = await railW('ToolTable');
  const fs1 = await floorSt();
  check('wf:calibrate-12', W > 0 && fs1.floor > 0 && fs1.src === 12, `W=${W} floor=${JSON.stringify(fs1)}`);

  /* ---- ② 窄柜不缩（居中留白/末列不裁） ---- */
  await post('ToolTable', bagMsg(6));
  await sleep(500);
  const W2 = await railW('ToolTable');
  const g2 = await geo('ToolTable');
  check('wf:narrow-no-shrink', W2 === W, `6列壳宽 ${W2} vs 12列 ${W}`);
  check('wf:narrow-centered', !!g2 && Math.abs(g2.padL - g2.padR) <= 2 && g2.padL >= 0, JSON.stringify(g2 && { padL: g2.padL.toFixed(1), padR: g2.padR.toFixed(1) }));
  check('wf:narrow-lastcell-safe', !!g2 && g2.lastCellR > 0 && g2.lastCellR <= g2.hostR - 1, g2 ? `lastCellR=${g2.lastCellR.toFixed(1)} hostR=${g2.hostR.toFixed(1)}` : 'no geo');

  /* ---- ③ 改值重标定（12→14→6） ---- */
  await setUniw(14);
  await pushCtx('ToolTable');
  await post('ToolTable', bagMsg(14));
  await sleep(500);
  const W14 = await railW('ToolTable');
  const fs3 = await floorSt();
  check('wf:retarget-14', W14 > W && fs3.src === 14, `W14=${W14} > W=${W} src=${fs3.src}`);
  await post('ToolTable', bagMsg(6));
  await sleep(500);
  const W3b = await railW('ToolTable');
  check('wf:retarget-hold', W3b === W14, `6列后壳宽 ${W3b} 恒=W14 ${W14}`);

  /* ---- ④ off 回纯跟随 ---- */
  await setUniw(0);
  await pushCtx('ToolTable');
  await post('ToolTable', bagMsg(6));
  await sleep(500);
  const W4 = await railW('ToolTable');
  const fs4 = await floorSt();
  check('wf:off-follow-narrow', W4 < W14 && fs4.floor === 0, `off+6列壳宽 ${W4} < ${W14}，floor=${fs4.floor}`);
  await post('ToolTable', bagMsg(12));
  await sleep(500);
  const W4b = await railW('ToolTable');
  check('wf:off-follow-12', Math.abs(W4b - W) <= 2, `off+12列壳宽 ${W4b} ≈ 标定宽 ${W}（纯跟随）`);

  /* ---- ⑤ 跨页不串味 ---- */
  await setUniw(12);
  await pushCtx('ToolTable');
  await page.evaluate(() => window.__HZ_SHOW__('Cooking'));
  await waitRail('Cooking');
  await sleep(400);
  const fs5a = await floorSt();
  check('wf:scene-reset-floor', fs5a.floor === 0, `切页后 floor=${fs5a.floor}（applyScene 清标定）`);
  await post('Cooking', cookMsg(12));
  await sleep(500);
  const Wc = await railW('Cooking');
  const fs5b = await floorSt();
  check('wf:cooking-self-calibrate', Wc > 0 && fs5b.floor > 0 && fs5b.src === 12, `Cooking 12列自标定 Wc=${Wc} ${JSON.stringify(fs5b)}`);
  await post('Cooking', cookMsg(6));
  await sleep(500);
  const Wc6 = await railW('Cooking');
  check('wf:cooking-narrow-hold', Wc6 === Wc, `Cooking 6列壳宽 ${Wc6} 恒=自标定 ${Wc}`);

  /* ---- 零控制台错 ---- */
  check('wf:console-zero-errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' ; '));
  check('wf:pageerror-zero', pageErrors.length === 0, pageErrors.slice(0, 3).join(' ; '));

  const fails = results.filter((r) => !r.ok).length;
  console.log(`\n==== WIDTH-FLOOR SUMMARY: ${results.length - fails}/${results.length} PASS ====`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
