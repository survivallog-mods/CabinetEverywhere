/* native 页滚动后拖拽落点回归 harness（v1.8.13 滚动器迁移；serve.cjs 须已在 8180）。
   作者实报（2026-11-07）：「背包界面通过滚动条滚动到下方后，无法移动物品，拖拽移动物品的
   落地位置不对」——截图绿框落点比目标高约 7 行。
   根因：v1.8.3~v1.8.12 NATIVE_BP_CSS 把官方拖拽坐标基准元素 .grid-container 自己变成滚动器
   （max-height:560+overflow-y:scroll）。官方页（BackpackUI.html Vue）onMouseDown 缓存
   gridRefs[side].getBoundingClientRect()，滚动后该 rect=裁剪窗顶（行 0 实际在 rect.top−
   scrollTop），updateHover 落点 ny=round((cursorY−offsetY−rect.top−PAD)/CELL) 恒少
   scrollTop/CELL 行 ⇒ DRAG_ITEM y 偏上、目标行被误判占用=放不下回弹（无法移动）。
   修复：滚动四规则迁到官方父层 .grid-wrapper——格 rect 恢复全高内容矩形（行 0 恒在
   rect.top），官方坐标数学零改动自洽（与壳侧机器页 sr-body 祖先滚动同案）。
   场景：BackpackUI 喂 10×16 高袋（896px > 560 视窗，滚 6 行）+ 物品于 y=14/y=11，滚到底
   （scrollTop=336）后两次**真鼠标**拖拽（mouse.down→分步 move→up）：
   ① 滚动器=.grid-wrapper（overflow-y:scroll 且 scrollHeight>clientHeight）；
   ② 格本体非滚动器（硬写 scrollTop 恒 0）且 rect 全高≈16×56=896（不受 560 窗钳制）；
   ③ 拖 A (4,14)→(7,13)：DRAG_ITEM={x:7,y:13}（旧 CSS 下 y=13−6=7——16 行 896px、窗 560px、
      最大滚 336=6 行，官方算式漏 scrollTop/CELL=6 行，落点整段偏上=实报病；断言只认 13）；
   ④ 拖 B (2,11)→(9,10)：DRAG_ITEM={x:9,y:10}；
   ⑤ 拖 A 悬停期 .drag-highlight 客户区=目标格可视位置（截图「绿框在上方」的反证）；
   ⑥ 指示轨 srnSbTrack 绑新滚动器：滚底后 thumb translateY>0（绑格本体恒 0=钉死满长）；
   ⑦ 拖拽全程零 CLICK_ITEM（真拖起手，非点击）；
   ⑧ 零 console error / pageerror。
   注：RED 复跑（还原 NATIVE_BP_CSS 旧行）预期 ①②③④⑤⑥ FAIL——② 是根因几何实证。 */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/temp/baidu_up/node_modules/playwright-core')); }

const BASE = 'http://127.0.0.1:8180';
const CELL = 56, PAD = 3, GRAB_HALF = 25; /* 1×1 格物品 50px（56−PAD×2）居中抓取半宽 */
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
  await page.evaluate(() => window.__HZ_SHOW__('BackpackUI'));

  function frame() { return page.frames().find((f) => f.url().includes('/fixtures/BackpackUI.html')); }
  await frame().waitForFunction(() => {
    const g = document.querySelector('.grid-container');
    return g && g.offsetWidth > 0 && document.getElementById('srNativeBp');
  }, null, { timeout: 15000 });

  /* 官方事件捕获层（root 页收 fixture postMessage）：DRAG_ITEM 落点 + 全类型流水 */
  await page.evaluate(() => {
    window.__SD__ = { drops: [], kinds: [] };
    window.addEventListener('message', (ev) => {
      const d = ev.data;
      if (!d || !d.type) return;
      window.__SD__.kinds.push(d.type);
      if (d.type === 'DRAG_ITEM') window.__SD__.drops.push(d.data);
    });
  });

  /* 喂 10×16 高袋（覆盖 nudge 默认 6 行）+ 物品 A(4,14)/B(2,11)/顶行占位(0,0) */
  await page.evaluate(() => {
    const ICO = 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
    function it(id, x, y) {
      return { id, x, y, w: 1, h: 1, icon: ICO, name: '物品' + id, count: 2, quality: 3,
               cfgId: 0, vd: [], shelfLifeDays: null, isExpired: false, isRotten: false };
    }
    const f = document.getElementById('BackpackUI');
    f.contentWindow.postMessage({ type: 'WebUI_Backpack_InfoAMsg', data: {
      ownerId: 900001, backpackName: '背包', gridCols: 10, gridRows: 16, currentWeight: 0, maxWeight: 100 } }, '*');
    f.contentWindow.postMessage({ type: 'WebUI_Backpack_ItemsAMsg', data: {
      itemsJson: JSON.stringify([it(901, 0, 0), it(941, 4, 14), it(942, 2, 11)]) } }, '*');
  });

  await frame().waitForFunction(() => {
    const g = document.querySelector('.grid-container');
    const its = g && g.querySelectorAll('.item');
    return its && its.length === 3;
  }, null, { timeout: 10000 });

  /* ①② 滚动器与格几何 */
  const geo = await frame().evaluate(() => {
    const grid = document.querySelector('.grid-container');
    const wrap = grid.closest('.grid-wrapper');
    const appEl = document.querySelector('.backpack-container');
    return {
      gridCount: document.querySelectorAll('.grid-container').length,
      wrapOverflowY: wrap ? getComputedStyle(wrap).overflowY : '(no wrapper)',
      wrapScrollable: !!wrap && wrap.scrollHeight > wrap.clientHeight + 2,
      gridFullH: grid.getBoundingClientRect().height,
      gridSelfScroll: (() => { grid.scrollTop = 999; const z = grid.scrollTop === 0; grid.scrollTop = 0; return z; })(),
      zoom: appEl && appEl.style.zoom ? appEl.style.zoom : '1'
    };
  });
  check('sd:scroller-is-wrapper', geo.wrapOverflowY === 'scroll' && geo.wrapScrollable,
    `overflow-y=${geo.wrapOverflowY} scrollHeight>clientHeight=${geo.wrapScrollable}`);
  check('sd:grid-not-scroller', geo.gridSelfScroll,
    '格本体硬写 scrollTop 恒 0（滚动在 .grid-wrapper 上，官方拖拽坐标基准=全高 rect）');
  check('sd:grid-full-rect', Math.abs(geo.gridFullH - 16 * CELL) <= 2,
    `格 rect 高=${geo.gridFullH}px（期望≈${16 * CELL}=16 行全高，非 560 裁剪窗）`);
  check('sd:zoom-1', geo.zoom === '1' && geo.gridCount === 1, `zoom=${geo.zoom} 格数=${geo.gridCount}（前置条件）`);

  /* 滚到底（336px=6 行） */
  const scrolled = await frame().evaluate(() => {
    const wrap = document.querySelector('.grid-container').closest('.grid-wrapper');
    wrap.scrollTop = wrap.scrollHeight - wrap.clientHeight;
    return { top: wrap.scrollTop, max: wrap.scrollHeight - wrap.clientHeight };
  });
  await page.waitForTimeout(120);

  /* ⑥ 指示轨跟随（绑新滚动器：滚底 thumb 下移>0；绑格本体则恒 translateY(0)） */
  const ind = await frame().evaluate(() => {
    const t = document.getElementById('srnSbTrack');
    const th = t && t.firstChild;
    if (!t || !th) return { missing: true };
    const m = /translateY\(([-\d.]+)px\)/.exec(th.style.transform || '');
    return { display: getComputedStyle(t).display, ty: m ? parseFloat(m[1]) : null };
  });
  check('sd:indicator-on-wrapper', !ind.missing && ind.display !== 'none' && ind.ty > 0,
    ind.missing ? 'srnSbTrack 缺失' : `display=${ind.display} thumb translateY=${ind.ty}px（滚底>0）`);
  check('sd:scroll-bottom-set', scrolled.top === scrolled.max && scrolled.max >= 6 * CELL - 2,
    `scrollTop=${scrolled.top}/${scrolled.max}（≥6 行≈336px，测试有效性）`);

  /* 真鼠标拖拽：物品按 .item 文档序取（901=0/941=1/942=2），目标=格 rect 行列定位。
     坐标系：frame 内量的是 iframe 视口坐标，page.mouse 是 root 页坐标——root 顶栏 42px
     （#hzc=calc(100vh−42px)）须补 iframe 原点偏移（实测漏补=mousedown 落点偏上 42px 打进
     .slot，拖拽根本起不来） */
  async function drag(itemIdx, col, row) {
    const pos = await frame().evaluate((idx) => {
      const grid = document.querySelector('.grid-container');
      const gr = grid.getBoundingClientRect();
      const el = grid.querySelectorAll('.item')[idx];
      if (!el) return null;
      const ir = el.getBoundingClientRect();
      return { fx: ir.left + ir.width / 2, fy: ir.top + ir.height / 2, gl: gr.left, gt: gr.top };
    }, itemIdx);
    if (!pos) return null;
    const off = await page.evaluate(() => {
      const r = document.getElementById('BackpackUI').getBoundingClientRect();
      return { x: r.left, y: r.top };
    });
    pos.fx += off.x; pos.fy += off.y;
    /* 抓取=物品中心（offset=25,25）；松手点=目标格左上角(+PAD)+抓取偏移 ⇒ 官方 round 后
       恰落 (col,row)：local=col*CELL+PAD，nx=round((local−PAD)/CELL)=col（期望值断言仍按
       frame 坐标算，与 DRAG_ITEM 无关） */
    const tx = off.x + pos.gl + col * CELL + PAD + GRAB_HALF;
    const ty = off.y + pos.gt + row * CELL + PAD + GRAB_HALF;
    await page.mouse.move(pos.fx, pos.fy);
    await page.mouse.down();
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(pos.fx + (tx - pos.fx) * i / steps, pos.fy + (ty - pos.fy) * i / steps);
      await page.waitForTimeout(35);
    }
    await page.waitForTimeout(220); /* 慢速悬停帧 + 100ms idle 补算（高亮就位） */
    return { pos, tx, ty };
  }

  /* ③ 拖 A (4,14)→(7,13) */
  const dA = await drag(1, 7, 13);
  check('sd:dragA-armed', !!dA, dA ? '' : '.item[1]（941）不可得');

  /* ⑤ 悬停期高亮=目标格可视位置（截图绿框反证） */
  if (dA) {
    const hl = await frame().evaluate(() => {
      const g = document.querySelector('.grid-container');
      const h = g.querySelector('.drag-highlight');
      if (!h) return null;
      const hr = h.getBoundingClientRect();
      return { x: hr.left, y: hr.top, w: hr.width, shown: hr.width > 0 };
    });
    const expX = dA.pos.gl + 7 * CELL + PAD, expY = dA.pos.gt + 13 * CELL + PAD;
    check('sd:highlight-on-target', !!hl && hl.shown && Math.abs(hl.x - expX) <= 1.5 && Math.abs(hl.y - expY) <= 1.5,
      hl ? `highlight=(${hl.x.toFixed(1)},${hl.y.toFixed(1)}) 期望=(${expX.toFixed(1)},${expY.toFixed(1)})` : '.drag-highlight 缺失');
    await page.mouse.up();
    await page.waitForTimeout(120);
    const drops = await page.evaluate(() => window.__SD__.drops.splice(0));
    check('sd:dropA-on-cursor-cell', drops.length === 1 && drops[0].x === 7 && drops[0].y === 13 && drops[0].itemId === 941,
      drops.length === 1 ? `DRAG_ITEM={itemId:${drops[0].itemId},x:${drops[0].x},y:${drops[0].y}}（期望 941/7/13）`
                         : '零 DRAG_ITEM（拖拽未达或落空）');
  }

  /* ④ 拖 B (2,11)→(9,10) */
  const dB = await drag(2, 9, 10);
  check('sd:dragB-armed', !!dB, dB ? '' : '.item[2]（942）不可得');
  if (dB) {
    await page.mouse.up();
    await page.waitForTimeout(120);
    const drops = await page.evaluate(() => window.__SD__.drops.splice(0));
    check('sd:dropB-on-cursor-cell', drops.length === 1 && drops[0].x === 9 && drops[0].y === 10 && drops[0].itemId === 942,
      drops.length === 1 ? `DRAG_ITEM={itemId:${drops[0].itemId},x:${drops[0].x},y:${drops[0].y}}（期望 942/9/10）`
                         : '零 DRAG_ITEM（拖拽未达或落空）');
  }

  /* ⑦ 全程零 CLICK_ITEM（真拖拽起手） */
  const kinds = await page.evaluate(() => window.__SD__.kinds);
  check('sd:no-click-noise', kinds.indexOf('CLICK_ITEM') < 0, '事件流水=' + kinds.slice(-8).join(','));

  check('sd:console-zero-errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join('；'));
  check('sd:pageerror-zero', pageErrors.length === 0, pageErrors.slice(0, 3).join('；'));

  await browser.close();
  const pass = results.filter((r) => r.ok).length;
  console.log('\n==== NATIVE-SCROLL-DRAG SUMMARY: ' + pass + '/' + results.length + (pass === results.length ? ' PASS ====' : ' FAIL ===='));
  process.exit(pass === results.length ? 0 : 1);
})();
