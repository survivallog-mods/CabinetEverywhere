/* 2026-11-02 四轮（作者三原则：回滚通用自适应/单页隔离/拖拽同步官方序）专项回归：
   ① 单页隔离：老鼠笼（sc-ratcage）壳随格收（无空白），其余机器页定高 740 恒定（切页签不变高）；
   ② pinOrder 通道：场景开启自愈上报（applyScene，localStorage 已有序）+ 拖拽落序上报
     （dragstart/drop 模拟）——cmd 载荷 {key:场景键, order:[ownerId...]}；非注入页不上报。
   红灯对照：上一版（35ebf64 通用自适应）Cooking 也会缩（B 断言败）；拖拽同步通道不存在
   （D/E 断言败）。C# 侧（TabInjector 重排/cerail_pinorder.json）不在本夹具域——构建+实机日志验证。 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');

const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

const CONTRACT = (page, view, rev) => ({
  rev, ctx: { page, family: 'bag', bagOnly: false, bagCap: 42, view },
  bag: 900001,
  ctn: [
    [900101, '食材柜', 'c', 40, 101],
    [900102, '冷藏柜', 'f', 24, 102],
    [900106, '蔬果柜', 'c', 36, 104]
  ],
  lib: [
    [101, '食材', 4, 1, '', '#8fc06e'],
    [102, '需冷藏', 3, 2, '', '#6fc7c9'],
    [104, '蔬果', 1, 4, '', '#8fc06e']
  ],
  icfg: [[1, '生态香米', 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==#v1', 12, 99, 1, 1, '食材', 0, 15, 0, 0, 0, 0]],
  items: { bag: [[901, 1, 30, 7200, 0, 0, 1, 1, 0, 15, 0, 0, 0, 360, 3.5]] }
});

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await (await browser.newContext({ viewport: { width: 1536, height: 864 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) errs.push(m.text().slice(0, 160)); });

  /* pin 序预置走 addInitScript（harness iframe 初始即可见——装载期已 mount+applyScene，
     页面就绪后再设 LS 赶不上首次应用；真实游戏 mount 发生在玩家开界面时无此时序） */
  await page.addInitScript(() => {
    localStorage.setItem('srp_pin_order_Cooking', JSON.stringify([900102, 900101, 900106]));
  });
  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  /* cmd 截获（v185 同款）——装载期 mount 的 applyScene 先于包裹器，用场景切换逼一次补应用：
     离开再回来（重访路 loadSnap 恢复场景态）不够——直接推一包不同 page 再推回（sceneApplied 门） */
  await page.evaluate(() => {
    window.__CAP = { cmd: [] };
    const oc = window.__CERAIL__.cmd;
    window.__CERAIL__.cmd = function (op, p) { window.__CAP.cmd.push([op, p]); return oc.call(this, op, p); };
  });
  await page.evaluate(() => window.__HZ_SHOW__('Cooking'));
  const cf = page.frames().find((f) => f.url().includes('/fixtures/Cooking.html'));
  await cf.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 15000 });
  await page.evaluate((x) => window.__CERAIL__.setData(x), CONTRACT('ToolTable', 'material', 401));
  await page.evaluate((x) => window.__CERAIL__.setData(x), CONTRACT('Cooking', 'food', 402));
  await page.waitForTimeout(900);
  let cmds = await page.evaluate(() => window.__CAP.cmd.filter((c) => c[0] === 'pinOrder'));
  check('A:applyScene-selfheal', cmds.length >= 1 && cmds[0][1] && cmds[0][1].key === 'Cooking'
    && JSON.stringify(cmds[0][1].order) === JSON.stringify([900102, 900101, 900106]),
    `cmd=${JSON.stringify(cmds.map((c) => c[1]))}（场景应用即上报显示序）`);

  /* ---- ② 拖拽落序上报：蔬果柜(900106) 拖到 食材柜(900101) 左半 → 序=[900106,900102,900101]? 
     当前行（LS 序 [900102,900101,900106]）=[背包,冷藏,食材,蔬果]；拖 900106 到 900101 前
     → from=2(900106 在 LS 序的位)... drop 算序：pins=[900102,900101,900106]，from=2,to=1,
     drop-before → order=[900102,900106,900101] ---- */
  await page.evaluate(() => { window.__CAP.cmd.length = 0; });
  await cf.evaluate(() => {
    const row = document.getElementById('srPinRow');
    const src = row.querySelector('[data-ctn="900106"]');
    const dst = row.querySelector('[data-ctn="900101"]');
    if (!src || !dst) return;
    try {
      src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
      const r = dst.getBoundingClientRect();
      dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: r.left + 4, clientY: r.top + 4, dataTransfer: new DataTransfer() }));
      src.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true }));
    } catch (e) {
      /* DataTransfer 不可构造的旧核：退回 MouseEvent（dragstart 的 dataTransfer 访问会抛
         但 st.dragId 已先行设置，drop 路径不依赖 dataTransfer） */
      src.dispatchEvent(new MouseEvent('dragstart', { bubbles: true, cancelable: true }));
      const r = dst.getBoundingClientRect();
      dst.dispatchEvent(new MouseEvent('drop', { bubbles: true, cancelable: true, clientX: r.left + 4, clientY: r.top + 4 }));
      src.dispatchEvent(new MouseEvent('dragend', { bubbles: true, cancelable: true }));
    }
  });
  await page.waitForTimeout(400);
  cmds = await page.evaluate(() => window.__CAP.cmd.filter((c) => c[0] === 'pinOrder'));
  check('B:drag-emits-pinOrder', cmds.length === 1 && JSON.stringify(cmds[0][1].order) === JSON.stringify([900102, 900106, 900101]),
    `cmd=${JSON.stringify(cmds.map((c) => c[1]))}（拖拽落序=显示序上报）`);

  /* ---- ③ 单页隔离：Cooking 定高 740（其他界面不受老鼠笼修法影响）；场景类名在位 ---- */
  const cookGeo = await cf.evaluate(() => {
    const rail = document.getElementById('srRail');
    const host = document.getElementById('srGridHost'), body = document.getElementById('srBody');
    return {
      cls: rail.className, h: Math.round(rail.offsetHeight),
      blank: host && body ? Math.round(body.getBoundingClientRect().bottom - host.getBoundingClientRect().bottom) : 999
    };
  });
  check('C:cooking-fixed-778', cookGeo.h === 778 && cookGeo.cls.indexOf('sc-cooking') >= 0 && cookGeo.cls.indexOf('sc-ratcage') < 0,
    `h=${cookGeo.h}（其他机器页=定高 778，外框 margin 钉顶、整界面底边上收一格）`);

  await page.evaluate(() => window.__HZ_SHOW__('RatCage'));
  const rf = page.frames().find((f) => f.url().includes('/fixtures/RatCage.html'));
  await rf.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const ratGeo = await rf.evaluate(() => {
    const rail = document.getElementById('srRail');
    const wrap = document.getElementById('srp');
    return {
      cls: rail.className, h: Math.round(rail.offsetHeight), wrapH: Math.round(wrap.offsetHeight),
      pad: getComputedStyle(wrap).paddingBottom
    };
  });
  check('D:ratcage-fills-slot', ratGeo.cls.indexOf('sc-ratcage') >= 0 && ratGeo.h === ratGeo.wrapH && ratGeo.pad === '0px',
    `rail=${ratGeo.h} wrap=${ratGeo.wrapH}（老鼠笼独享填满槽位=跟兄弟面板同高，行内 px 填充稳定）`);

  /* 非注入页不上报（ToolTable 开启零 pinOrder） */
  await page.evaluate(() => { window.__CAP.cmd.length = 0; });
  await page.evaluate(() => window.__HZ_SHOW__('ToolTable'));
  const tf = page.frames().find((f) => f.url().includes('/fixtures/ToolTable.html'));
  await tf.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 15000 });
  await page.waitForTimeout(600);
  cmds = await page.evaluate(() => window.__CAP.cmd.filter((c) => c[0] === 'pinOrder'));
  check('E:non-injected-no-report', cmds.length === 0, `pinOrder×${cmds.length}（ToolTable 非注入域不上报）`);

  check('zero-console-errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
