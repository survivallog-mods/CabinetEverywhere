/* v1.8.3 实机验收（BackpackUI 原生模式）：等游戏重启加载新 DLL → HUD 开背包 →
   断言官方页整页原生（无 rail/#srp）+ srNativeBp 三点规则计算样式 + 滚动条不压格几何
   + 负重条显示（单背包形态）+ 官方左键详情弹层 + 截图。开柜双背包（整理物资）形态由
   作者自然触发时人工对照（柜侧无负重条+双格区滚动），本脚本不代步。 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');

const OUT_DIR = path.join(__dirname, 'v13-ingame');
fs.mkdirSync(OUT_DIR, { recursive: true });
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function connect() {
    for (;;) {
      try { return await chromium.connectOverCDP('http://localhost:9222'); }
      catch (e) { await sleep(3000); }
    }
  }
  const rootOf = (b) => {
    try {
      for (const c of b.contexts()) {
        const p = c.pages().find((x) => decodeURIComponent(x.url()).indexOf('Root') >= 0);
        if (p) return p;
      }
    } catch (e) { }
    return null;
  };

  (async () => {
    /* 阶段一：等重启。判定=当前可连上 → 等断线（游戏关闭）再等回线（最多 45 分钟）。 */
    console.log('[watch] 连接 9222 …');
    let browser = await connect();
    let page = rootOf(browser);
  if (page && !process.env.SKIP_WAIT) {
    console.log('[watch] 游戏在线——等断线判定重启…');
    let sawDown = false;
    for (let i = 0; i < 900 && !sawDown; i++) {   /* 45 分钟 */
      await sleep(3000);
      try { await page.evaluate('1'); } catch (e) { sawDown = true; }
    }
    if (!sawDown) { console.error('[watch] 45 分钟未见重启，退出（重跑即可）'); process.exit(3); }
    console.log('[watch] 游戏已关闭，等重启…');
    try { await browser.close(); } catch (e) { }
  }
  /* 阶段二：重连（游戏重启）——contexts 可能迟于连接就绪，重试直到 Root 出现 */
  browser = await connect();
  page = null;
  for (let i = 0; i < 100 && !page; i++) {
    page = rootOf(browser);
    if (!page) {
      try { const ctxs = browser.contexts(); if (!ctxs.length) { await browser.close(); } } catch (e) { }
      if (!page) { await sleep(3000); browser = await connect(); }
    }
  }
  if (!page) { console.error('[watch] 重启后找不到 Root 页'); process.exit(2); }
  console.log('[watch] 游戏已回来，等存档进入（#iframe-container 出现）…');
  await page.waitForSelector('#iframe-container', { timeout: 300000 }).catch(() => { });
  await sleep(8000); /* 进存档后系统稳定余量 */

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR|Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 160)));

  /* 弹层驱逐（monitor 同款） */
  for (const blocker of ['TowerWaveReport', 'TipsPopup', 'ConfirmDialog', 'ItemDetailPopup']) {
    try {
      const vis = await page.evaluate((k) => { const f = document.querySelector('iframe#' + k); return f ? getComputedStyle(f).display !== 'none' : false; }, blocker).catch(() => false);
      if (!vis) continue;
      await page.evaluate((k) => window.postMessage({ type: 'CLOSE', data: {}, sourcePageId: k }, '*'), blocker);
      await sleep(500);
    } catch (e) { }
  }

  /* HUD 背包（B 键单背包形态） */
  const core = page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/CoreUI1.') >= 0);
  if (!core) { console.error('CoreUI1 not found（未进存档？）'); process.exit(2); }
  await core.locator('button:has-text("背包"), .ui-btn:has-text("背包")').first().click({ timeout: 15000 });
  await sleep(1500);

  const bp = await page.evaluate(() => {
    const fr = document.querySelector('iframe#Backpack');
    if (!fr) return { err: 'no iframe#Backpack' };
    let d; try { d = fr.contentDocument; } catch (e) { return { err: 'xorigin' }; }
    const gc = d.querySelector('.grid-container');
    const cs = gc ? d.defaultView.getComputedStyle(gc) : null;
    const r = gc ? gc.getBoundingClientRect() : null;
    let maxRight = 0;
    if (gc) for (const it of gc.querySelectorAll('.item')) { const b = it.getBoundingClientRect(); if (b.right > maxRight) maxRight = b.right; }
    const weight = d.querySelector('.weight-section');
    const isStorage = d.querySelector('.bag-panel.is-storage');
    return {
      visible: getComputedStyle(fr).display !== 'none',
      srNativeBp: !!d.getElementById('srNativeBp'),
      noRail: !d.getElementById('srRail'),
      noWrap: !d.getElementById('srp'),
      hostIntact: !!d.querySelector('.backpack-container'),
      gridNativeInHost: !!(gc && gc.closest('.backpack-container')),
      ovY: cs ? cs.overflowY : null, maxH: cs ? cs.maxHeight : null, box: cs ? cs.boxSizing : null, padR: cs ? cs.paddingRight : null,
      gutter: cs ? cs.scrollbarGutter : null,
      gridW: r ? Math.round(r.width) : 0, clientW: gc ? gc.clientWidth : 0,
      maxItemRight: Math.round(maxRight), sbStart: r ? Math.round(r.x + gc.clientWidth) : 0,
      weightShown: !!weight && d.defaultView.getComputedStyle(weight).display !== 'none',
      isStoragePanel: !!isStorage,
      items: gc ? gc.querySelectorAll('.item').length : 0,
      gridCols: (function () { const bg = gc && gc.querySelector('.grid-bg'); return bg ? (d.defaultView.getComputedStyle(bg).gridTemplateColumns || '').split(' ').filter((s) => s).length : 0; })()
    };
  });
  console.log(JSON.stringify(bp, null, 1));
  check('native:no-rail', !bp.err && bp.noRail && bp.noWrap, '无 srRail/#srp（官方页整页原生）');
  check('native:css', !bp.err && bp.srNativeBp && bp.ovY === 'auto' && bp.maxH === '560px' && bp.box === 'content-box' && bp.padR === '12px',
    `srNativeBp=${bp.srNativeBp} overflow-y=${bp.ovY} max-height=${bp.maxH} box-sizing=${bp.box} padding-right=${bp.padR}`);
  check('native:host-intact', !bp.err && bp.hostIntact && bp.gridNativeInHost, '官方 .backpack-container 原位、官方格未搬动');
  check('native:weight-bag-shown', !bp.err && bp.weightShown && !bp.isStoragePanel, '单背包形态：负重条显示（柜侧隐藏规则不误伤）');
  check('native:scroll-no-cover', !bp.err && bp.gridW > 0 && bp.maxItemRight <= bp.sbStart,
    `物品最右 ${bp.maxItemRight} ≤ 滚动槽起点 ${bp.sbStart}（clientW=${bp.clientW} cols=${bp.gridCols} items=${bp.items}）`);

  /* 官方左键详情弹层（官方链存活证据） */
  try {
    const fr = page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/BackpackUI/') >= 0);
    const item = fr ? await fr.$('.grid-container .item') : null;
    if (item) {
      await item.click({ timeout: 6000 });
      await sleep(700);
      const popup = await page.evaluate(() => {
        const f2 = document.querySelector('iframe#ItemDetailPopup');
        if (!f2) return false;
        try { return getComputedStyle(f2).display !== 'none'; } catch (e) { return true; }
      });
      check('official:leftclick-detail', !!popup, '左键物品 → 官方详情弹层显示');
      await page.evaluate(() => window.postMessage({ type: 'ACTION_CLOSE', data: {}, sourcePageId: 'ItemDetailPopup' }, '*'));
      await sleep(400);
    } else check('official:leftclick-detail', false, '背包无物品可点（空包？）');
  } catch (e) { check('official:leftclick-detail', false, String(e).slice(0, 100)); }

  /* 截图 + 关页（页内官方关闭钮） */
  try {
    await page.screenshot({ path: path.join(OUT_DIR, 'backpack-native.png') });
    console.log('[shot] ' + OUT_DIR + '/backpack-native.png');
  } catch (e) { }
  try {
    const fr = page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/BackpackUI/') >= 0);
    if (fr) await fr.locator('.close-btn, [class*="close"], button:has-text("×")').first().click({ timeout: 3000 });
  } catch (e) { }

  check('Z:zero-console-errors', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 5)));
  const fails = results.filter((r) => !r.ok).length;
  console.log('---'); console.log('TOTAL ' + results.length + ' PASS ' + (results.length - fails) + ' FAIL ' + fails);
  fs.writeFileSync(path.join(OUT_DIR, 'v13-native-matrix.json'), JSON.stringify({ results, bp }, null, 1));
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
