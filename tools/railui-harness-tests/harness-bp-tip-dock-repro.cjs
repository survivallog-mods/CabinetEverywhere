/* 缺陷复现 harness（2026-11-15 作者两单；serve.cjs 须已在 8180）：
   ① 探险页（BackpackUI 多袋页签）鼠标悬浮物品 → div.tooltip 距物品过远
      假设：mod nbTabAlignTick ③ 自写 app.style.zoom（钳后布局口径）≠ 官方 viewportZoom ref
      （官方全高口径）→ 官方 updateTooltipPos 以 ref 除 mouse → tooltip 渲染在 ref/actual 比例
      放大处（越靠屏幕右下漂得越远）。
   ② 脚边「×N 全拿」横排跑到屏幕中间
      假设：BackpackUI 锚=A 侧 .panel（grid.closest('.panel')）；mod NATIVE_BP_CSS 560 钳使
      .panel 可见高≈560 → 居中布局下面板 bottom 抬到屏幕中部 → dock place() 起点即屏中
      （官方全高面板 bottom≈屏底=dock 贴底「脚边」）。
   对照：OFFICIAL 基线（清 srNativeBp 文本=钳退役）同场景测两项=官方自洽。 */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/temp/baidu_up/node_modules/playwright-core')); }

const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' : '') + (detail || ''));
}
const MOD_CSS = '.grid-wrapper{max-height:560px;overflow-y:scroll;scrollbar-gutter:stable;box-sizing:content-box;padding-right:12px;overscroll-behavior:contain;width:max-content;margin-left:auto;margin-right:auto}'
  + '.grid-wrapper::-webkit-scrollbar{width:8px}.grid-wrapper::-webkit-scrollbar-track{background:transparent}.grid-wrapper::-webkit-scrollbar-thumb{background:transparent}'
  + '.bag-panel.is-storage .weight-section{display:none !important}';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/wangk/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe' });
  const page = await (await browser.newContext({ viewport: { width: 1536, height: 906 } })).newPage();
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

  /* 场景=探险形态：A=仓管背包18行+SUV10页签、B=收银台20行（同 harness-native-tab-align P1）。
     curTab=1（SUV 页签当前）=作者实报形态：取出物资时 A 侧停在 SUV，maxRows(18)>gridRows(10)
     ⇒ 官方 slot 预留 extra=(18-10)*56 与钳后实高脱钩 ⇒ 官方 refit 量出矮容器≠mod ③ 复测量 */
  async function feed(curTab, dual) {
    await page.evaluate(({ items, curTab, dual }) => {
      const f = document.getElementById('BackpackUI');
      const aTabs = [{ name: '仓管背包', cols: 12, rows: 18 },
                     { name: 'SUV后备箱', cols: 12, rows: 10, isTrunkTab: true }];
      const rows = curTab === 0 ? 18 : 10;
      const bagName = curTab === 0 ? '仓管背包' : 'SUV后备箱';
      f.contentWindow.postMessage({ type: 'WebUI_Backpack_InfoAMsg', data: {
        ownerId: 900001, isDualBag: !!dual, aTabsJson: JSON.stringify(aTabs), curATab: curTab,
        backpackName: bagName, gridCols: 12, gridRows: rows, currentWeight: 5, maxWeight: 100 } }, '*');
      f.contentWindow.postMessage({ type: 'WebUI_Backpack_ItemsAMsg', data: {
        itemsJson: JSON.stringify(items) } }, '*');
      if (dual) {
        f.contentWindow.postMessage({ type: 'WebUI_Backpack_InfoBMsg', data: {
          ownerId: 5001, backpackName: '收银台', gridCols: 12, gridRows: 20,
          currentWeight: 0, maxWeight: 0, canTag: false } }, '*');
        f.contentWindow.postMessage({ type: 'WebUI_Backpack_ItemsBMsg', data: { itemsJson: '[]' } }, '*');
      }
    }, { items: [it(901, 0, 0), it(941, 4, 2)], curTab, dual });
  }

  async function setMod(on) {
    await frame().evaluate(({ on, css }) => {
      const st = document.getElementById('srNativeBp');
      const pin = document.getElementById('srDockPin'); /* ② 钉底 CSS（official 基线须一并摘） */
      if (pin) pin.remove();
      if (!on) {
        if (st) st.textContent = '';
      } else {
        if (!st) {
          const s = document.createElement('style');
          s.id = 'srNativeBp'; s.setAttribute('data-uw', '2'); s.textContent = css;
          document.head.appendChild(s);
        } else if (!st.textContent) { st.textContent = css; }
      }
      window.dispatchEvent(new Event('resize'));
    }, { on, css: MOD_CSS });
  }

  /* ① tooltip 漂移：在右下角物品上派 mouseenter（clientX/Y 取物品中心）→ 两帧后量
     tooltip 视觉位置 vs 鼠标：期望 tooltip 视觉左上 ≈ 鼠标 +15px 内（漂移=ref/actual 比例） */
  async function tipDrift() {
    return await frame().evaluate(async () => {
      const items = [...document.querySelectorAll('.grid-container .item')];
      /* 取 A 侧视觉最靠右下的物品（漂移随 |mouse| 放大，右下件最显著） */
      let target = null, best = -1;
      for (const el of items) {
        const r = el.getBoundingClientRect();
        const score = r.left + r.top;
        if (r.width && score > best) { best = score; target = el; }
      }
      if (!target) return { err: 'no item' };
      const r = target.getBoundingClientRect();
      const mx = Math.round(r.left + r.width / 2), my = Math.round(r.top + r.height / 2);
      target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: mx, clientY: my }));
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const tip = document.querySelector('#app .tooltip');
      if (!tip) return { err: 'no tooltip' };
      const cs = getComputedStyle(tip);
      if (cs.display === 'none') return { err: 'tooltip hidden' };
      const t = tip.getBoundingClientRect();
      const z = parseFloat(document.getElementById('app').style.zoom) || 1;
      /* 官方语义：tooltip 左上应 ≈ 鼠标+15（视觉像素，无翻转时） */
      const dx = Math.round(t.left - (mx + 15)), dy = Math.round(t.top - (my + 15));
      return { mx, my, zoom: z, tipLeft: Math.round(t.left), tipTop: Math.round(t.top), dx, dy };
    });
  }

  /* ② 脚边横排位置：推 GroundDockMsg → 量 dock 视觉位置/屏高占比 + A 面板 bottom 占比 */
  async function dockPos() {
    await page.evaluate(({ ICO }) => {
      const f = document.getElementById('BackpackUI');
      const json = JSON.stringify({
        label: '脚边', allText: '×2 全拿',
        groups: [{ cfg: 1, name: '木料', icon: ICO, w: 1, h: 1, count: 2, heavy: false, ids: [1, 2] }]
      });
      f.contentWindow.postMessage({ type: 'WebUI_Backpack_GroundDockMsg', data: { groundDockJson: json } }, '*');
    }, { ICO });
    await page.waitForTimeout(120);
    return await frame().evaluate(() => {
      const dock = document.querySelector('body > .gd-row');
      if (!dock) return { err: 'no dock' };
      const dr = dock.getBoundingClientRect();
      const ap = document.querySelector('.bag-slot.is-anchored .panel') || document.querySelector('.bag-panel .panel');
      const vh = window.innerHeight;
      const out = {
        dockTopPct: +(dr.top / vh * 100).toFixed(1), dockTop: Math.round(dr.top),
        vh, zoom: document.getElementById('app').style.zoom || '1'
      };
      if (ap) { const ar = ap.getBoundingClientRect(); out.panelBottomPct = +(ar.bottom / vh * 100).toFixed(1); out.panelH = Math.round(ar.height); }
      return out;
    });
  }

  /* ③ 野外态（袋未开）+拖拽幽灵：mod 在场专属面（官方无 mod 无此二病——钉底/归位都是 mod 侧修） */
  async function wildernessAndGhost() {
    /* 野外态：不 feed 袋数据直接推脚边 → nbDockPin 应钉屏底（修复前=官方零 rect 锚落屏左上/中） */
    const wl = await frame().evaluate(async ({ ICO }) => {
      const json = JSON.stringify({ label: '脚边', allText: '×2 全拿',
        groups: [{ cfg: 1, name: '木料', icon: ICO, w: 1, h: 1, count: 2, heavy: false, ids: [1, 2] }] });
      window.postMessage({ type: 'WebUI_Backpack_GroundDockMsg', data: { groundDockJson: json } }, '*');
      await new Promise((r) => setTimeout(r, 300));
      const d = document.querySelector('body > .gd-row');
      return d ? { topPct: +(d.getBoundingClientRect().top / innerHeight * 100).toFixed(1) } : { err: 'no dock' };
    }, { ICO });
    /* 开袋（SUV 页签单袋）→ mousedown+mousemove → 幽灵应贴鼠标−抓取偏移 */
    await feed(1, false);
    await page.waitForTimeout(400);
    const gh = await frame().evaluate(async () => {
      const item = document.querySelector('.grid-container .item');
      if (!item) return { err: 'no item' };
      const r0 = item.getBoundingClientRect();
      const sx = Math.round(r0.left + 8), sy = Math.round(r0.top + 8);
      item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: sx, clientY: sy, button: 0 }));
      const mx = sx + 100, my = sy + 60;
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: mx, clientY: my }));
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const g = document.querySelector('.drag-ghost');
      const gr = g ? g.getBoundingClientRect() : null;
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: mx, clientY: my }));
      /* 幽灵左上应=鼠标−抓取偏移(8,8)：期望 left≈mx−8±16 */
      return g && gr ? { mx, my, left: Math.round(gr.left), top: Math.round(gr.top) } : { err: 'no ghost' };
    });
    return { wl, gh };
  }

  for (const pass of ['MOD', 'OFFICIAL']) {
    await setMod(pass === 'MOD');
    await feed(1, false);
    await page.waitForTimeout(400);
    console.log(`\n===== ${pass} =====`);
    const t = await tipDrift();
    console.log('  ①tooltip:', JSON.stringify(t));
    const d = await dockPos();
    console.log('  ②dock:', JSON.stringify(d));
    if (pass === 'MOD') {
      check('mod: tooltip 贴鼠标（|dx|,|dy| ≤ 24px）', t.dx !== undefined && Math.abs(t.dx) <= 24 && Math.abs(t.dy) <= 24,
        `dx=${t.dx} dy=${t.dy} zoom=${t.zoom} mouse=(${t.mx},${t.my}) tip=(${t.tipLeft},${t.tipTop})`);
      check('mod: 脚边横排位于屏幕下部（top ≥ 70%屏高）', d.dockTopPct !== undefined && d.dockTopPct >= 70,
        `dockTop=${d.dockTopPct}%屏高 panelBottom=${d.panelBottomPct}% zoom=${d.zoom}`);
      const { wl, gh } = await wildernessAndGhost();
      console.log('  ③wilderness:', JSON.stringify(wl), 'ghost:', JSON.stringify(gh));
      check('mod: 野外态（袋未开）横排钉屏底（top ≥ 70%屏高）', wl.topPct !== undefined && wl.topPct >= 70,
        `dockTop=${wl.topPct}%屏高（修复前=屏左上/屏中）`);
      check('mod: 拖拽幽灵跟手（left≈mx−8±16）', gh.mx !== undefined && Math.abs(gh.left - (gh.mx - 8)) <= 16 && Math.abs(gh.top - (gh.my - 8)) <= 16,
        `mouse=(${gh.mx},${gh.my}) ghost=(${gh.left},${gh.top})（修复前漂 ~193px）`);
    } else {
      check('official: tooltip 贴鼠标', t.dx !== undefined && Math.abs(t.dx) <= 24 && Math.abs(t.dy) <= 24,
        `dx=${t.dx} dy=${t.dy} zoom=${t.zoom}`);
      check('official: 脚边横排位于屏幕下部', d.dockTopPct !== undefined && d.dockTopPct >= 70,
        `dockTop=${d.dockTopPct}%屏高 panelBottom=${d.panelBottomPct}% zoom=${d.zoom}`);
    }
  }
  check('console 零错', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  await browser.close();
  const fail = results.filter((r) => r.ok === false).length;
  console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAIL'} (${results.filter((r) => r.ok !== undefined).length} checks)`);
  process.exit(0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(1); });
