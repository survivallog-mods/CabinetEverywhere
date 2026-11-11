/* 复现 harness v3：滚动变量。假设链——
   ① 用户 BackpackHeight=50 → A 网格 50 行，mod NATIVE_BP_CSS cap 560px（10 行可视）→ 可滚动；
   ② 右键快转后官方重推 → watch（canTag/bagTips/gridRows…）触发 applyViewportFit→syncSlotHeight；
   ③ syncSlotHeight 的 gridMid 读 .grid-container 的 getBoundingClientRect（随 scrollTop 上移）→
      delta = mB.mid − mA.mid 被注入 S_A（滚动量）→ mA.slot.marginTop = max(0, delta) 把 A 顶推下移 ≈ S_A；
   ④ mod nbTabAlignTick 只校正 bSlot.marginTop（可见中点对齐），不重置 A 的 marginTop →
      B 对齐到被推下的 A → 双双沉底、上半屏空白、「背包和柜子都变得很小」稳定态。
   验证：A 滚到底 → canTag 翻转触发 refit → 测 A.mt 是否 ≈ scrollTop、面板是否沉底。 */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/temp/baidu_up/node_modules/playwright-core')); }

const BASE = 'http://127.0.0.1:8180';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/wangk/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe' });
  const page = await (await browser.newContext({ viewport: { width: 1540, height: 1126 } })).newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HZ_CURRENT__ !== undefined && window.__HZ_CURRENT__() !== null, null, { timeout: 20000 });
  await page.evaluate(() => window.__HZ_SHOW__('BackpackUI'));
  function frame() { return page.frames().find((f) => f.url().includes('/fixtures/BackpackUI.html')); }
  await frame().waitForFunction(() => {
    const g = document.querySelector('.grid-container');
    return g && g.offsetWidth > 0 && document.getElementById('srNativeBp');
  }, null, { timeout: 15000 });

  async function feed(aRows, canTag) {
    await page.evaluate(({ aRows, canTag }) => {
      const f = document.getElementById('BackpackUI');
      const mk = (id, x, y) => ({ id, x, y, w: 1, h: 1, icon: 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', name: '物品' + id, count: 2, quality: 3, cfgId: 0, vd: [], shelfLifeDays: null, isExpired: false, isRotten: false });
      const aTabs = [{ name: '仓管背包', cols: 12, rows: 50 }, { name: '购物锦囊1', cols: 12, rows: 10 }, { name: '购物锦囊2', cols: 12, rows: 10 }];
      f.contentWindow.postMessage({ type: 'WebUI_Backpack_InfoAMsg', data: {
        ownerId: 900001, isDualBag: true, aTabsJson: JSON.stringify(aTabs), curATab: 0,
        backpackName: '仓管背包', gridCols: 12, gridRows: aRows, currentWeight: 138, maxWeight: 252700 } }, '*');
      const itemsA = []; for (let i = 0; i < 120; i++) itemsA.push(mk(900 + i, i % 12, Math.floor(i / 12)));
      f.contentWindow.postMessage({ type: 'WebUI_Backpack_ItemsAMsg', data: { itemsJson: JSON.stringify(itemsA) } }, '*');
      f.contentWindow.postMessage({ type: 'WebUI_Backpack_InfoBMsg', data: {
        ownerId: 7001, backpackName: '冰箱', gridCols: 12, gridRows: 15, currentWeight: 40, maxWeight: 200, canTag: canTag } }, '*');
      const itemsB = []; for (let i = 0; i < 30; i++) itemsB.push(mk(5010 + i, i % 12, Math.floor(i / 12)));
      f.contentWindow.postMessage({ type: 'WebUI_Backpack_ItemsBMsg', data: { itemsJson: JSON.stringify(itemsB) } }, '*');
    }, { aRows, canTag });
  }

  async function measure(label) {
    await page.waitForTimeout(350);
    return await frame().evaluate((label) => {
      const R = (el) => { const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(0), h: +r.height.toFixed(0) }; };
      const ct = document.querySelector('.backpack-container');
      const slots = [...document.querySelectorAll('.bag-slot')];
      const aSlot = slots.find((s) => s.classList.contains('is-anchored'));
      const bSlot = slots.find((s) => !s.classList.contains('is-anchored'));
      const wrap = (s) => { const p = s && s.querySelector('.bag-panel'); return p ? p.querySelector('.grid-wrapper') : null; };
      const aw = wrap(aSlot), bw = wrap(bSlot);
      const mid = (el) => { const r = el.getBoundingClientRect(); return +((r.top + r.bottom) / 2).toFixed(0); };
      const out = { label, zoom: document.getElementById('app').style.zoom || '1',
        ct: { ...R(ct), offH: ct.offsetHeight, offW: ct.offsetWidth },
        aMt: aSlot.style.marginTop || '', bMt: bSlot.style.marginTop || '',
        aVisMid: aw ? mid(aw) : null, bVisMid: bw ? mid(bw) : null,
        aScroll: aw ? aw.scrollTop : null, bScroll: bw ? bw.scrollTop : null,
        innerH: innerHeight };
      return out;
    }, label);
    console.log(`[${m.label}] zoom=${m.zoom} ct.off=${m.ct.offW}x${m.ct.offH} top=${m.ct.top}/${m.innerH}`);
    console.log(`   A.mt=${m.aMt} B.mt=${m.bMt} A.visMid=${m.aVisMid} B.visMid=${m.bVisMid} A.scroll=${m.aScroll} B.scroll=${m.bScroll}`);
    return m;
  }

  await feed(50, true);
  await frame().waitForFunction(() => document.querySelectorAll('.grid-container').length === 2, null, { timeout: 10000 });
  const m0 = await measure('0 基线（顶滚）');

  /* 滚 A 到底（50 行内容、560 可视 → scroll≈(50-10)*56=2240）再触发官方 refit */
  await frame().evaluate(() => {
    const slots = [...document.querySelectorAll('.bag-slot')];
    const aSlot = slots.find((s) => s.classList.contains('is-anchored'));
    const aw = aSlot.querySelector('.bag-panel').querySelector('.grid-wrapper');
    aw.scrollTop = aw.scrollHeight; /* 滚到底 */
  });
  await feed(50, false); /* canTag 翻转 → 官方 watch → applyViewportFit → syncSlotHeight */
  const m1 = await measure('1 A滚底+canTag翻转(refit)');

  /* 再滚回顶 + refit（对照：恢复路径是否存在） */
  await frame().evaluate(() => {
    const slots = [...document.querySelectorAll('.bag-slot')];
    const aSlot = slots.find((s) => s.classList.contains('is-anchored'));
    aSlot.querySelector('.bag-panel').querySelector('.grid-wrapper').scrollTop = 0;
  });
  await feed(50, true);
  const m2 = await measure('2 A滚回顶+refit');

  const bad = parseFloat(String(m1.aMt).replace('px', '')) > 200 || (m1.ct.offH > m1.innerH * 1.2);
  console.log('DUMP m0=' + JSON.stringify(m0));
  console.log('DUMP m1=' + JSON.stringify(m1));
  console.log('DUMP m2=' + JSON.stringify(m2));
  console.log('\n结果:', bad ? 'REPRO ✓（A.mt=' + m1.aMt + ' ct.offH=' + m1.ct.offH + '）' : '未复现');
  console.log('console errors:', consoleErrors.length ? consoleErrors.slice(0, 3) : '无');
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(1); });
