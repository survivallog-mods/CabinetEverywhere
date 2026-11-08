/* native BackpackUI 多袋页签（aTabs）左右面板垂直错位复现 harness（v1.9.1 候选；serve.cjs 须已在 8180）。
   作者实报（2026-11-08）：
   ① 野外探险→选柜→取出物资（BackpackUI 双背包，A=仓管背包+SUV后备箱页签），切 SUV后备箱 后
      「左侧界面上移了，右侧下移了」；
   ② 屋内整理物资（BackpackUI 双背包）A 侧从背包切购物袋，同样现象。
   机制（对官方 BackpackUI.html Vue 源码取证）：
   - 官方 syncSlotHeight：A 侧多页签（is-anchored）时按 maxRows（各页签 rows 最大值）预留
     slot 高度并把当前面板垂直居中（panel.style.top=extra/2），随后把 A/B 两侧 grid 的
     **内容中点**（gridRefs=grid-container，inline height=rows*56 全高）互相居中（marginTop 顶推）。
     官方无高度上限 ⇒ 内容中点=可见中点，两面板跨页签恒对齐。
   - mod v1.8.3 NATIVE_BP_CSS 给 .grid-wrapper 上 560px max-height（格区高度滚动）⇒ 行数>10 的袋
     可见窗口(≤560)与内容矩形(=rows*56)分离：官方对齐基准=内容中点，可见窗口中点恒高于它
     (rows-10)/2*56 px；且 slot 预留高度按 rows 全额计算与被钳面板实际高度脱钩 ⇒ 切页签时
     容器高/viewport zoom/面板 top 三者同时跳变 ⇒ 左右面板反向错位（左上移/右下移）。
   实测矩阵（与无 mod 基线对照）：背包18(原生)/SUV10(原生)/B柜20；SUV20(改高)；购物袋8/B柜7。
   断言：有 mod 时切页签后 A/B 可见格区中点垂直错位 ≤ 阈值（修复前预期大幅超标=RED 实证）；
   无 mod 基线两侧恒对齐（官方设计自洽性对照）。 */
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
  const page = await (await browser.newContext({ viewport: { width: 1536, height: 906 } })).newPage(); /* 根顶栏42 → iframe 视口=864=游戏画布 */
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

  const ICO = 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
  function it(id, x, y) {
    return { id, x, y, w: 1, h: 1, icon: ICO, name: '物品' + id, count: 2, quality: 3,
             cfgId: 0, vd: [], shelfLifeDays: null, isExpired: false, isRotten: false };
  }

  /* 场景矩阵：name / 背包行 / 第二页签(名,行,isTrunkTab) / B 柜行数 */
  const SCENARIOS = [
    { name: 'P1-原生(背包18/SUV10/B柜20)', bpRows: 18, tab2: { name: 'SUV后备箱', rows: 10, trunk: true }, bRows: 20 },
    { name: 'P2-改高(背包18/SUV20/B柜20)', bpRows: 18, tab2: { name: 'SUV后备箱', rows: 20, trunk: true }, bRows: 20 },
    { name: 'P3-购物袋(背包18/购物袋8/B柜7)', bpRows: 18, tab2: { name: '购物袋', rows: 8, trunk: false }, bRows: 7 }
  ];

  async function feed(curTab) {
    const sc = SCENARIOS[feed.si];
    const rows = curTab === 0 ? sc.bpRows : sc.tab2.rows;
    const bagName = curTab === 0 ? '仓管背包' : sc.tab2.name;
    await page.evaluate(({ curTab, rows, bagName, sc }) => {
      const f = document.getElementById('BackpackUI');
      const aTabs = [{ name: '仓管背包', cols: 12, rows: sc.bpRows },
                     { name: sc.tab2.name, cols: 12, rows: sc.tab2.rows, isTrunkTab: sc.tab2.trunk }];
      f.contentWindow.postMessage({ type: 'WebUI_Backpack_InfoAMsg', data: {
        ownerId: 900001, isDualBag: true, aTabsJson: JSON.stringify(aTabs), curATab: curTab,
        backpackName: bagName, gridCols: 12, gridRows: rows, currentWeight: 5, maxWeight: 100 } }, '*');
      f.contentWindow.postMessage({ type: 'WebUI_Backpack_ItemsAMsg', data: {
        itemsJson: JSON.stringify([it2(901, 0, 0), it2(941, 4, Math.min(2, rows - 1))]) } }, '*');
      f.contentWindow.postMessage({ type: 'WebUI_Backpack_InfoBMsg', data: {
        ownerId: 5001, backpackName: '收银台', gridCols: 12, gridRows: sc.bRows,
        currentWeight: 0, maxWeight: 0, canTag: false } }, '*');
      f.contentWindow.postMessage({ type: 'WebUI_Backpack_ItemsBMsg', data: { itemsJson: '[]' } }, '*');
      function it2(id, x, y) {
        return { id, x, y, w: 1, h: 1, icon: 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
                 name: '物品' + id, count: 2, quality: 3, cfgId: 0, vd: [], shelfLifeDays: null, isExpired: false, isRotten: false };
      }
    }, { curTab, rows, bagName, sc });
  }

  async function measure() {
    await page.waitForTimeout(260); /* 官方 watch→nextTick→applyViewportFit + mod 装配收尾 */
    return await frame().evaluate(() => {
      const R = (el) => { const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(1), mid: +((r.top + r.bottom) / 2).toFixed(1), h: +r.height.toFixed(1) }; };
      const ct = document.querySelector('.backpack-container');
      const slots = [...document.querySelectorAll('.bag-slot')];
      const aSlot = slots.find((s) => s.classList.contains('is-anchored'));
      const bSlot = slots.find((s) => !s.classList.contains('is-anchored'));
      const pan = (slot) => slot && slot.querySelector('.bag-panel');
      const vis = (slot) => { const p = pan(slot); return p && p.querySelector('.grid-wrapper'); };
      const grid = (slot) => { const p = pan(slot); return p && p.querySelector('.grid-container'); };
      const out = {
        zoom: document.getElementById('app').style.zoom || '1',
        ct: R(ct),
        modCss: !!document.getElementById('srNativeBp')
      };
      if (aSlot) {
        out.a = { slot: R(aSlot), slotH: aSlot.style.height, mt: aSlot.style.marginTop,
                  panelTop: (pan(aSlot) || {}).style ? pan(aSlot).style.top : '',
                  vis: R(vis(aSlot)), grid: R(grid(aSlot)) };
      }
      if (bSlot) {
        out.b = { slot: R(bSlot), mt: bSlot.style.marginTop, vis: R(vis(bSlot)), grid: R(grid(bSlot)) };
      }
      /* 可见格区中点差（B 相对 A）：正=B 偏低 */
      if (out.a && out.b) out.visMidDelta = +(out.b.vis.mid - out.a.vis.mid).toFixed(1);
      return out;
    });
  }

  async function runPass(label, withMod) {
    for (let si = 0; si < SCENARIOS.length; si++) {
      feed.si = si;
      if (!withMod) {
        /* 官方基线：元素保留+data-uw 不动、textContent 清空——ensureNativeBpw 数据幂等早退
           （scan 500ms 重注不会复活 cap），再派 resize 促官方 applyViewportFit 用全高面板重算 */
        await frame().evaluate(() => {
          const st = document.getElementById('srNativeBp');
          if (st) st.textContent = '';
          window.dispatchEvent(new Event('resize'));
        });
      } else {
        /* 重装 mod CSS（幂等注入器不在页面态里，直接重建同款 style） */
        await frame().evaluate((css) => {
          const st = document.getElementById('srNativeBp');
          if (!st) {
            const s = document.createElement('style');
            s.id = 'srNativeBp'; s.setAttribute('data-uw', '2'); s.textContent = css;
            document.head.appendChild(s);
          } else if (!st.textContent) { st.textContent = css; }
          window.dispatchEvent(new Event('resize'));
        }, '.grid-wrapper{max-height:560px;overflow-y:scroll;scrollbar-gutter:stable;box-sizing:content-box;padding-right:12px;overscroll-behavior:contain;width:max-content;margin-left:auto;margin-right:auto}'
         + '.grid-wrapper::-webkit-scrollbar{width:8px}.grid-wrapper::-webkit-scrollbar-track{background:transparent}.grid-wrapper::-webkit-scrollbar-thumb{background:transparent}'
         + '.bag-panel.is-storage .weight-section{display:none !important}');
      }
      await feed(0);
      await frame().waitForFunction(() => document.querySelectorAll('.grid-container').length === 2, null, { timeout: 10000 });
      const s0 = await measure();
      /* 点第二页签（官方原生链）→ 模拟游戏回推 InfoA/ItemsA */
      await frame().evaluate(() => {
        const tabs = document.querySelectorAll('.bag-tab');
        tabs[1] && tabs[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await page.waitForTimeout(60);
      await feed(1);
      const s1 = await measure();

      const dApanelTop = +(s1.a.slot.top - s0.a.slot.top).toFixed(1);
      const dBpanelTop = +(s1.b.slot.top - s0.b.slot.top).toFixed(1);
      console.log(`\n===== ${label} ${SCENARIOS[si].name} =====`);
      console.log(`  S0(背包页签): zoom=${s0.zoom} A.slot{top:${s0.a.slot.top} h:${s0.a.slot.h} style.h:${s0.a.slotH || ''} mt:${s0.a.mt || ''} panelTop:${s0.a.panelTop}} A.visMid:${s0.a.vis.mid} A.gridMid:${s0.a.grid.mid} | B{top:${s0.b.slot.top} mt:${s0.b.mt || ''}} B.visMid:${s0.b.vis.mid} B.gridMid:${s0.b.grid.mid} | ΔvisMid(B-A)=${s0.visMidDelta}`);
      console.log(`  S1(第二页签): zoom=${s1.zoom} A.slot{top:${s1.a.slot.top} h:${s1.a.slot.h} style.h:${s1.a.slotH || ''} mt:${s1.a.mt || ''} panelTop:${s1.a.panelTop}} A.visMid:${s1.a.vis.mid} A.gridMid:${s1.a.grid.mid} | B{top:${s1.b.slot.top} mt:${s1.b.mt || ''}} B.visMid:${s1.b.vis.mid} B.gridMid:${s1.b.grid.mid} | ΔvisMid(B-A)=${s1.visMidDelta}`);
      console.log(`  切页签位移: A面板top ${dApanelTop > 0 ? '+' : ''}${dApanelTop}px  B面板top ${dBpanelTop > 0 ? '+' : ''}${dBpanelTop}px  zoom ${s0.zoom}→${s1.zoom}`);
      results.push({ scenario: SCENARIOS[si].name, pass: label, s0, s1, dApanelTop, dBpanelTop });
    }
  }

  await runPass('MOD', true);
  await runPass('OFFICIAL', false);

  /* 防自激：终态静止后 1s 写计数不增（观察器+周期兜底双触发下的幂等收敛实证） */
  await feed(0);
  await page.waitForTimeout(400);
  const w1 = await page.evaluate(() => window.__CERAIL__ && window.__CERAIL__.nbTab && window.__CERAIL__.nbTab.writes());
  await page.waitForTimeout(1100);
  const w2 = await page.evaluate(() => window.__CERAIL__ && window.__CERAIL__.nbTab && window.__CERAIL__.nbTab.writes());
  check('mod:防自激（终态写计数静止）', w1 !== null && w1 === w2, `静止后 writes=${w1} →1.1s→ ${w2}`);

  /* 断言：OFFICIAL 基线两态可见中点恒对齐（官方设计自洽——无 cap 时可见中点=内容中点；
     官方本身切页签面板 top 有预留居中位移，属官方设计，不设面板位移断言）；
     MOD = 修复契约：两态对齐 + 跨页签面板/zoom 稳定（当前代码预期 RED=病在，修复后 GREEN） */
  const official = results.filter((r) => r.pass === 'OFFICIAL');
  const mod = results.filter((r) => r.pass === 'MOD');
  for (const r of official) {
    check(`official:${r.scenario}: 两态可见中点恒对齐`, Math.abs(r.s0.visMidDelta) <= 4 && Math.abs(r.s1.visMidDelta) <= 4,
      `S0 Δ=${r.s0.visMidDelta} S1 Δ=${r.s1.visMidDelta}（≤4px）`);
  }
  for (const r of mod) {
    check(`mod:${r.scenario}: 两态可见中点对齐（修复契约）`, Math.abs(r.s0.visMidDelta) <= 4 && Math.abs(r.s1.visMidDelta) <= 4,
      `S0 Δ=${r.s0.visMidDelta} S1 Δ=${r.s1.visMidDelta}（≤4px）`);
    check(`mod:${r.scenario}: 跨页签面板零跳位（修复契约）`, Math.abs(r.dApanelTop) <= 4 && Math.abs(r.dBpanelTop) <= 4,
      `A ${r.dApanelTop}px B ${r.dBpanelTop}px`);
    check(`mod:${r.scenario}: 跨页签 zoom 稳定（修复契约）`, r.s0.zoom === r.s1.zoom,
      `${r.s0.zoom}→${r.s1.zoom}`);
  }
  check('console 零错', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  await browser.close();
  const fail = results.filter((r) => r.ok === false).length;
  console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAIL'} (${results.filter((r) => r.ok !== undefined).length} checks)`);
  process.exit(0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(1); });
