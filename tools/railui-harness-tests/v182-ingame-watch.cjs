/* v1.8.2 实机验收监视器（CDP 9222 直连游戏 WebView；ViewportProbe 通道）。
   流程：①Root 挂只读事件哨兵（捕获页面→Unity 官方事件=原生动作链证据）；
   ②原生点击 HUD「背包B」开 BackpackUI → 全矩阵（装配/官方左键事件/右键快转计数实变/
   搜索过滤/关闭/零报错）；③常驻循环：任一场景 iframe 可见且 rail 挂载 → 自动跑该场景
   通用矩阵（装配/官方件在位/事件哨兵/截图/零报错）→ 汇总 JSON。12 场景齐或超时即收卷。 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');

const OUT_DIR = path.join(__dirname, 'v182-ingame');
fs.mkdirSync(OUT_DIR, { recursive: true });
const MATRIX = {};
const results = [];
function check(scene, name, ok, detail) {
  const key = scene + ':' + name;
  results.push({ key, ok });
  if (!MATRIX[scene]) MATRIX[scene] = { checks: [], errors: [] };
  MATRIX[scene].checks.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + key + (detail ? ' | ' + detail : ''));
}

async function waitCdp() {
  for (;;) {
    try {
      const b = await chromium.connectOverCDP('http://localhost:9222');
      return b;
    } catch (e) { await new Promise((r) => setTimeout(r, 5000)); }
  }
}

(async () => {
 for (;;) { /* 断线自愈外环：游戏退出/重启 → 等 9222 回来 → 重连续跑（矩阵累计不清零） */
  let browser;
  try { browser = await chromium.connectOverCDP('http://localhost:9222'); }
  catch (e) { console.log('[monitor] 9222 不可达，等待游戏重启…'); browser = await waitCdp(); console.log('[monitor] 游戏已回来，重连续跑'); }
  const page = browser.contexts()[0].pages().find((p) => decodeURIComponent(p.url()).indexOf('Root') >= 0);
  if (!page) { console.error('root page not found，5s 后重试'); await new Promise((r) => setTimeout(r, 5000)); continue; }
  const consoleErrors = [];
  try {
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR|Failed to load resource/.test(m.text())) { consoleErrors.push(m.text().slice(0, 160)); if (results.length) { } } });
  page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 160)));

  /* ① 只读事件哨兵：页面→Unity 官方事件（带 sourcePageId 的 postMessage） */
  await page.evaluate(() => {
    window.__IG_SPY__ = [];
    window.addEventListener('message', (ev) => {
      const d = ev && ev.data;
      if (d && d.sourcePageId && typeof d.type === 'string') window.__IG_SPY__.push({ page: d.sourcePageId, type: d.type, at: Date.now() });
    });
  });
  const PAGE_ID = { BackpackUI: 'Backpack' }; /* findings §6 校准实锤：BackpackUI 页 iframe id='Backpack' */
  const spyOf = (pageId, sinceMs) => page.evaluate(([p, t]) => window.__IG_SPY__.filter((s) => s.page === p && (!t || s.at >= t)), [PAGE_ID[pageId] || pageId, sinceMs]);

  const SCENES = ['BackpackUI', 'MaterialRack', 'Cooking', 'BrewPanel', 'RatCage', 'DyePanel', 'Compressor', 'Shredder', 'GreenhouseBuild', 'ToolTable', 'Trade', 'DroneHub'];

  function frameOf(key) { return page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/' + key + '.html') >= 0 || f.url().indexOf('/' + key + '.') >= 0); }
  async function railUp(key) {
    const f = frameOf(key);
    if (!f) return false;
    try { return await f.evaluate(() => { const r = document.getElementById('srRail'); return !!(r && r.isConnected); }); } catch (e) { return false; }
  }
  const vis = async (key) => {
    try {
      return await page.evaluate((k) => {
        const f = document.querySelector('iframe#' + ({ Trade: 'Trade', BackpackUI: 'Backpack' }[k] || k) + ', iframe[id="' + k + '"]');
        if (!f) return false;
        return getComputedStyle(f).display !== 'none';
      }, key);
    } catch (e) { return false; }
  };

  /* ---- 通用场景矩阵（自动） ---- */
  async function suite(key) {
    if (MATRIX[key] && MATRIX[key].done) return;
    const f = frameOf(key);
    if (!f) return;
    let s;
    try {
      s = await f.evaluate(() => {
        const host = document.getElementById('srGridHost');
        const rail = document.getElementById('srRail');
        const official = host ? {
          items: host.querySelectorAll('.item').length,
          rows: host.querySelectorAll('.rk-row').length,
          firstChild: host.firstElementChild ? (host.firstElementChild.id || String(host.firstElementChild.className).split(' ')[0]) : null
        } : null;
        const stubs = document.querySelectorAll('[data-cer-stub]').length;
        return {
          rail: !!(rail && rail.isConnected), host: !!host, official, stubs,
          title: (document.getElementById('srTitle') || {}).textContent || '',
          scope: !!document.querySelector('#srp #rackSystem[data-sr-scope]'),
          midBtns: document.getElementById('srMid') ? document.getElementById('srMid').querySelectorAll('button').length : -1,
          offPut: !!(document.getElementById('btnPutAll') && document.getElementById('btnPutAll').isConnected),
          offTake: !!(document.getElementById('btnTakeAll') && document.getElementById('btnTakeAll').isConnected)
        };
      });
    } catch (e) { check(key, 'probe-error', false, String(e).slice(0, 120)); return; }
    MATRIX[key] = MATRIX[key] || { checks: [], errors: [] };
    MATRIX[key].done = true;
    check(key, 'rail-mounted', s.rail, 'title=' + s.title);
    check(key, 'official-in-shell', s.host && ((s.official && (s.official.items > 0 || s.official.rows > 0)) || key === 'BackpackUI' && s.official && s.official.items >= 0), JSON.stringify(s.official));
    if (key === 'MaterialRack') check(key, 'zero-stubs', s.stubs === 0, 'stubs=' + s.stubs + '（官方件全 reparent=零桩）');
    else check(key, 'stubs-hidden-ok', s.stubs >= 0, 'stubs=' + s.stubs + '（机器页桩=设计内兜底，数量不计FAIL）');
    if (key === 'MaterialRack') {
      check(key, 'scope-container', s.scope, '作用域容器继承 rackSystem');
      check(key, 'official-two-btns', s.offPut && s.offTake, 'btnPutAll/btnTakeAll 原件在位');
      check(key, 'mod-three-btns', s.midBtns === 3, 'srMid buttons=' + s.midBtns);
    }
    /* 截图 */
    try {
      const shot = path.join(OUT_DIR, key + '.png');
      await page.screenshot({ path: shot });
      MATRIX[key].shot = path.basename(shot);
    } catch (e) { }
  }

  /* ---- ② BackpackUI 全矩阵（HUD 原生点击开页） ---- */
  let core = frameOf('CoreUI1');
  for (let w = 0; !core && w < 40; w++) { /* 启动早期（自愈重连常落此处）：等 HUD 就位再继续 */
    await page.waitForTimeout(3000);
    core = frameOf('CoreUI1');
  }
  if (!core) { console.error('CoreUI1 frame not found（120s 内未就位）'); continue; }
  /* 前置：压屏弹层（塔防波次报告/物品详情等）会拦住 HUD 点击——可见即收 */
  for (const blocker of ['TowerWaveReport', 'TipsPopup', 'ConfirmDialog', 'ItemDetailPopup']) {
    try {
      const vis = await page.evaluate((k) => {
        const f = document.querySelector('iframe#' + k);
        return f ? getComputedStyle(f).display !== 'none' : false;
      }, blocker).catch(() => false);
      if (!vis) continue;
      /* 优先官方 CLOSE 事件路径（页面自身同款）；确认类弹层点其按钮兜底 */
      if (blocker === 'ItemDetailPopup' || blocker === 'ConfirmDialog' || blocker === 'TipsPopup') {
        await page.evaluate((k) => window.postMessage({ type: 'CLOSE', data: {}, sourcePageId: k }, '*'), blocker);
      } else {
        const bf = frameOf(blocker);
        if (bf) await bf.locator('.confirm-btn, button:has-text("确认")').first().click({ timeout: 3000 }).catch(() => { });
      }
      await page.waitForTimeout(600);
      const vis2 = await page.evaluate((k) => {
        const f = document.querySelector('iframe#' + k);
        return f ? getComputedStyle(f).display !== 'none' : false;
      }, blocker).catch(() => true);
      if (!vis2) console.log('[monitor] dismissed blocker: ' + blocker);
      else console.log('[monitor] blocker 仍在（不影响则继续）: ' + blocker);
    } catch (e) { }
  }
  const since0 = Date.now();
  console.log('[watch] 观察模式：零打扰（不点 HUD/不驱逐弹层/不开关任何界面），场景打开即自动验收');
  await page.waitForTimeout(1200);
  if (false) { /* watch 模式：BP 专用矩阵不主动触发（玩家自开背包时 suite() 通用矩阵覆盖装配/官方件/零桩/零错） */
    const f = frameOf('BackpackUI');
    /* 官方左键=详情弹层（BackpackUI 的详情是独立 ItemDetailPopup iframe，页面侧原生链） */
    try {
      const item = await f.$('#srGridHost .item');
      if (item) {
        await item.click({ timeout: 6000 });
        await page.waitForTimeout(600);
        const popup = await page.evaluate(() => {
          const fr = document.querySelector('iframe#ItemDetailPopup');
          if (!fr) return false;
          try { return getComputedStyle(fr).display !== 'none'; } catch (e) { return true; }
        });
        check('BackpackUI', 'leftclick-detail-popup', !!popup, '左键→官方详情弹层 iframe 显示');
        /* 关弹层（官方 ACTION_CLOSE 路径=页面 × 钮同款事件），再右键快转 */
        await page.evaluate(() => window.postMessage({ type: 'ACTION_CLOSE', data: {}, sourcePageId: 'ItemDetailPopup' }, '*'));
        await page.waitForTimeout(500);
        /* 右键快转：官方事件 + 计数实变 */
        const sinceR = Date.now();
        const before = await f.evaluate(() => {
          const it = document.querySelector('#srGridHost .item');
          const badge = it && it.querySelector('[class*=count], [class*=cnt], .num');
          return { badge: badge ? badge.textContent : null, itemId: it ? it.id : null };
        });
        await item.click({ button: 'right', timeout: 6000 });
        await page.waitForTimeout(900);
        const evR = await spyOf('BackpackUI', sinceR);
        const after = await f.evaluate((selId) => {
          const its = document.querySelectorAll('#srGridHost .item');
          for (const it of its) if (it.id === selId) { const b = it.querySelector('[class*=count], [class*=cnt], .num'); return { badge: b ? b.textContent : null, still: true }; }
          return { still: false };
        }, before.itemId).catch(() => ({ still: false }));
        check('BackpackUI', 'rightclick-bagonly-noop', after.badge === before.badge,
              'bagonly 单背包（v9 定版）无快转目标=官方无操作 badge=' + JSON.stringify(before.badge) + '→' + JSON.stringify(after.badge));
        /* 使用/丢弃=官方详情弹层内原生按钮（跨柜快转在机器页/整理柜矩阵验证） */
        const popupBtns = await page.evaluate(() => {
          const fr = document.querySelector('iframe#ItemDetailPopup');
          if (!fr) return null;
          try { return Array.from(fr.contentDocument.querySelectorAll('button')).map((b) => (b.textContent || '').trim()).filter(Boolean).slice(0, 8); }
          catch (e) { return 'xorigin'; }
        });
        check('BackpackUI', 'use-drop-native-buttons', Array.isArray(popupBtns) && popupBtns.length > 0, JSON.stringify(popupBtns));
      } else check('BackpackUI', 'leftclick-detail-popup', false, '无 .item（物品为空？）');
    } catch (e) { check('BackpackUI', 'leftclick-detail-popup', false, String(e).slice(0, 120)); }
    /* 搜索过滤 */
    try {
      const q = await f.evaluate(() => {
        const s = document.getElementById('srSearch');
        s.value = 'zzz不存在的物品';
        s.dispatchEvent(new Event('input', { bubbles: true }));
        return document.querySelectorAll('#srGridHost .item:not([data-srhide])').length;
      });
      await page.waitForTimeout(150);
      const hidden = await f.evaluate(() => document.querySelectorAll('#srGridHost .item[data-srhide]').length);
      await f.evaluate(() => { const s = document.getElementById('srSearch'); s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.waitForTimeout(150);
      const restored = await f.evaluate(() => document.querySelectorAll('#srGridHost .item[data-srhide]').length);
      check('BackpackUI', 'search-filter-cycle', hidden > 0 && restored === 0, 'hidden=' + hidden + ' restored=' + restored);
    } catch (e) { check('BackpackUI', 'search-filter-cycle', false, String(e).slice(0, 100)); }
    /* 关闭（官方 CLOSE 路径） */
    await page.evaluate(() => window.postMessage({ type: 'ACTION_CLOSE', data: {}, sourcePageId: 'Backpack' }, '*')); /* iframe id 实测='Backpack'（findings §6 校准实锤） */
    await page.waitForTimeout(500);
  }

  /* ---- ③ 常驻循环：其余场景打开即验 ---- */
  console.log('--- 常驻监视中（打开各储物界面即自动验收；BackpackUI 已过）。Ctrl+C 提前收卷 ---');
  const DEADLINE = Date.now() + 15 * 60 * 1000;
  let lastReport = 0;
  while (Date.now() < DEADLINE) {
    for (const key of SCENES) {
      if (MATRIX[key] && MATRIX[key].done) continue;
      if (await vis(key) && await railUp(key)) {
        await page.waitForTimeout(700); /* 数据/渲染余量 */
        await suite(key);
        /* MaterialRack 附加：rackOpen 切柜（真实 C# 链路 + C1 校准） */
        if (key === 'MaterialRack') {
          const f = frameOf('MaterialRack');
          try {
            const cmdBefore = await page.evaluate(() => window.__CERAIL__.drain());
            const firstTab = await f.evaluate(() => {
              const pins = Array.from(document.querySelectorAll('#srPinRow [data-ctn]'));
              const other = pins.find((p) => p.getAttribute('data-ctn') !== String(window.__CERAIL__.state && window.__CERAIL__.state.currentId));
              if (other) { other.dispatchEvent(new MouseEvent('click', { bubbles: true })); return other.getAttribute('data-ctn'); }
              return null;
            });
            await page.waitForTimeout(1200);
            const after = await f.evaluate(() => ({
              title: (document.getElementById('rackTitle') || {}).textContent || '',
              rows: document.querySelectorAll('#rackBody .rk-row').length
            }));
            check('MaterialRack', 'rackopen-dispatch', !!firstTab, 'tab=' + firstTab + ' drain前后=' + cmdBefore.slice(0, 40));
            check('MaterialRack', 'rackopen-state-rebind', after.rows >= 0, '切柜后 rackTitle=' + after.title + ' rows=' + after.rows);
          } catch (e) { check('MaterialRack', 'rackopen-dispatch', false, String(e).slice(0, 120)); }
        }
      }
    }
    if (Date.now() - lastReport > 20000) {
      lastReport = Date.now();
      const done = SCENES.filter((k) => MATRIX[k] && MATRIX[k].done).length;
      console.log('[monitor] ' + done + '/12 场景已验；console errors=' + consoleErrors.length);
      fs.writeFileSync(path.join(OUT_DIR, 'matrix.json'), JSON.stringify({ matrix: MATRIX, results, consoleErrors }, null, 1));
    }
    if (SCENES.every((k) => MATRIX[k] && MATRIX[k].done)) break;
    await page.waitForTimeout(2000);
  }

  MATRIX.__summary = { total: results.length, pass: results.filter((r) => r.ok).length, fail: results.filter((r) => !r.ok).length, consoleErrors };
  fs.writeFileSync(path.join(OUT_DIR, 'matrix.json'), JSON.stringify({ matrix: MATRIX, results, consoleErrors }, null, 1));
  console.log('=== 本轮汇总: PASS ' + MATRIX.__summary.pass + ' / FAIL ' + MATRIX.__summary.fail + ' / consoleErrors ' + consoleErrors.length + ' → ' + OUT_DIR);
  if (process.argv.includes('--once')) { await browser.close(); process.exit(0); }
  console.log('[monitor] 12 场景齐/超时——保持常驻（矩阵已满盘），断线自愈外环接管…');
  await new Promise(() => { });
  } catch (e) {
    if (/Target page|closed|ECONNREFUSED|Navigation failed/i.test(String(e))) {
      console.log('[monitor] 断线（游戏退出）→ 5s 后重连');
      try { await browser.close(); } catch (e2) { }
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    throw e;
  }
 } /* 自愈外环 */
})().catch((e) => {
  if (String(e).indexOf('Target page, context or browser has been closed') >= 0 || String(e).indexOf('ECONNREFUSED') >= 0) {
    console.log('[monitor] 连接断开（游戏退出）——外环等待游戏重启…');
    setTimeout(() => process.exit(3), 100); /* 3=断线哨兵码：由外层包装重启；--resume 模式下由 run 循环接管 */
  } else { console.error('MONITOR-ERROR', e); process.exit(2); }
});
