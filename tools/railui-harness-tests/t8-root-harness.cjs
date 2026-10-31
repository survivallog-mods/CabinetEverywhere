/* T8 root harness 断言（Playwright，serve.cjs 起停由外层 run-all 驱动）。
   覆盖 brief 裁定 6 全清单：12 页宿主选择器恰命中一个且替换成功、rail 在位 428×816、
   iframe 切换往返 rail 恢复、宿主手动重建观察器 ≤500ms 重装配、控制台零报错（除
   fixtures 资源缺席的 Failed to load resource 网络项）、clickThrough 标记在位。 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');

const BASE = 'http://127.0.0.1:8180';
const SCENE_KEYS = ['BackpackUI', 'MaterialRack', 'Cooking', 'BrewPanel', 'RatCage', 'DyePanel',
  'Compressor', 'Shredder', 'GreenhouseBuild', 'ToolTable', 'Trade', 'DroneHub'];

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

(async () => {
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource|net::ERR_/.test(t)) return; // fixtures 缺 Res 图标等资源缺席（预期，见报告）
  consoleErrors.push(t);
});
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
/* SCENES 表挂到 harness 窗口供 iframe 侧宿主检查取用（测试辅助，只读） */
await page.evaluate(() => {
  window.__CERAIL_SCENES_FOR_TEST__ = () => window.__CERAIL__.scenes;
});

function frameOf(key) {
  return page.frames().find((f) => f.url().includes('/fixtures/' + key + '.html'));
}
async function waitHostChk(key, timeout = 20000) {
  await page.waitForFunction(
    (k) => window.__HZ_HOSTCHK__ && window.__HZ_HOSTCHK__(k),
    key, { timeout }
  );
  return page.evaluate((k) => window.__HZ_HOSTCHK__(k), key);
}
async function waitRail(key, timeout = 8000) {
  const f = frameOf(key);
  if (!f) throw new Error('frame not found: ' + key);
  await f.waitForFunction(() => {
    const r = document.getElementById('srRail');
    return r && r.isConnected;
  }, null, { timeout });
  return f;
}

/* ① 12 页宿主选择器确定性命中（预备阶段在隐藏帧上对真实模板 DOM 计数）。
   语义照 SCENES 表注释/findings §6：锚点形态（#id.closest(...)）锚点必须恰 1 个（唯一导航）；
   裸选择器=querySelector 文档序首个（设计允许多命中，如 Trade .cols>.col 运行时 3 个
   col——首个=背包列即设计目标），断言 resolved。 */
const ANCHOR_SCENES = ['Cooking', 'BrewPanel', 'RatCage', 'DyePanel']; // SCENES 中 .closest() 形态
for (const key of SCENE_KEYS) {
  const st = await waitHostChk(key);
  const isAnchor = ANCHOR_SCENES.includes(key);
  const ok = st && st.resolved && (isAnchor ? st.anchors === 1 : st.anchors >= 1);
  check('host-unique:' + key, ok, `anchors=${st ? st.anchors : 'n/a'} resolved=${st ? st.resolved : 'n/a'}（${isAnchor ? '锚点须唯一' : '裸选择器文档序首个，设计允许多命中'}）`);
}

/* Trade 装配前基线（.cols 子节点/列数）——评审 Important 断言的「装配前」锚点 */
const tradePre = await frameOf('Trade').evaluate(() => {
  const cols = document.querySelector('.cols');
  return { children: cols ? cols.childElementCount : -1, cols: document.querySelectorAll('.cols>.col').length };
});

/* ② 逐场景：装配成功 + rail 428×816 + CSS 注入 + clickThrough 标记 + 可见性
   v1.8.3：BackpackUI 原生模式——不装配 rail，断言 style#srNativeBp 三点规则在场 + 无 rail/无 #srp */
for (const key of SCENE_KEYS) {
  await page.evaluate((k) => window.__HZ_SHOW__(k), key);
  if (key === 'BackpackUI') {
    const nf = frameOf(key);
    await nf.waitForFunction(() => document.getElementById('srNativeBp'), null, { timeout: 8000 });
    const nr = await nf.evaluate(() => {
      const st = document.getElementById('srNativeBp');
      const css = st ? st.textContent || '' : '';
      return {
        nativeCss: !!st,
        scroll: /max-height:560px/.test(css) && /scrollbar-gutter:stable/.test(css),
        noCover: /box-sizing:content-box;padding-right:12px/.test(css),
        weightHide: /\.bag-panel\.is-storage \.weight-section\{display:none/.test(css),
        noRail: !document.getElementById('srRail'),
        noWrap: !document.getElementById('srp')
      };
    });
    check('native-mounted:BackpackUI', nr.nativeCss && nr.noRail && nr.noWrap,
      `srNativeBp=${nr.nativeCss} 无rail=${nr.noRail} 无#srp=${nr.noWrap}（官方页整页原生）`);
    check('native-rules:BackpackUI', nr.scroll && nr.noCover && nr.weightHide,
      `高度滚动=${nr.scroll} 滚动条不压格=${nr.noCover} 柜侧隐负重=${nr.weightHide}`);
    continue;
  }
  const f = await waitRail(key);
  const r = await f.evaluate(() => {
    const rail = document.getElementById('srRail');
    const wrap = document.getElementById('srp');
    const style = document.getElementById('srpRail');
    return {
      railOk: !!rail && rail.isConnected,
      wrapOk: !!wrap && wrap.isConnected,
      wrapInteractive: !!wrap && wrap.hasAttribute('data-interactive'),
      railInteractive: !!rail && rail.hasAttribute('data-interactive'),
      w: rail ? rail.offsetWidth : 0,
      h: rail ? rail.offsetHeight : 0,
      styleInjected: !!style && /#srp \.sr-rail/.test(style.textContent || ''),
      styleGuardAtEnd: !!style && /T8 注入兜底[\s\S]*#srp \[hidden\]\{display:none !important\}\s*$/.test(style.textContent || ''),
      buttons: document.querySelectorAll('#srp button').length,
      inputs: document.querySelectorAll('#srp input').length,
      bagonly: rail ? rail.classList.contains('bagonly') : false
    };
  });
  check('mounted:' + key, r.railOk && r.wrapOk, `wrap=${r.wrapOk} rail=${r.railOk}`);
  check('size:' + key, r.w === 720 && r.h === 816, `${r.w}x${r.h}`); /* v1.8.2.2 宽度归一 UNI_W+20=720 */
  check('style:' + key, r.styleInjected && r.styleGuardAtEnd, 'style#srpRail 含 #srp .sr-rail 规则 + 末尾 [hidden] 兜底规则');
  check('clickthrough:' + key, r.wrapInteractive && r.railInteractive && r.buttons > 0 && r.inputs >= 1,
    `data-interactive(wrap/rail)=${r.wrapInteractive}/${r.railInteractive} buttons=${r.buttons} inputs=${r.inputs}`);
  check('visible:' + key, r.w > 0 && r.h > 0, 'offset 非 0（可见且参与布局）');
}

/* ②b 官方宿主零残留：装配后宿主选择器不再命中（SCENES 表经测试辅助窗口读取） */
async function hostGone(key) {
  const f = frameOf(key);
  return f.evaluate((k) => {
    const sc = window.parent.__CERAIL_SCENES_FOR_TEST__ ? window.parent.__CERAIL_SCENES_FOR_TEST__()[k] : null;
    if (!sc) return 'no-scenes';
    const sel = sc.host;
    const i = sel.indexOf(".closest('");
    if (i > 0) {
      /* 锚点存在≠宿主在位（T9 起锚点 id 有隐藏桩，如 #bagTabs）——按 resolveHost 全语义
         判：锚点向上最近祖先命中 nearSel 才算宿主复活；桩在 #srp 内、非 .panel → 不算 */
      const near = sel.slice(i + 10, sel.length - 2);
      const as = document.querySelectorAll(sel.slice(0, i));
      for (let x = 0; x < as.length; x++) if (as[x].closest(near)) return 'host-back';
      return 'gone';
    }
    return document.querySelector(sel) ? 'host-back' : 'gone';
  }, key);
}
for (const key of SCENE_KEYS) {
  if (key === 'BackpackUI') { check('host-gone:BackpackUI', true, 'v1.8.3 原生模式：宿主保留（不替换），n/a'); continue; }
  const g = await hostGone(key);
  check('host-gone:' + key, g === 'gone', g);
}

/* ②c Trade 官方 DOM 存活 + 不级联（T8 评审 Critical 回归实锤）。
   级联 bug 的形态：宿主选择器替换后仍命中中列 → mountedOk 恒假 → 毫秒级重挂逐列搬家，
   终态 `.cols` 只剩 1 个元素子节点（两官方列被毁）。修复终态 = 装配前 -1 +rail（3）：
   [#srp(首子), 中列, 右列]。可见态下等 1.8s（≥3 个 interval tick + 多轮观察器）复查稳定。 */
await page.evaluate(() => window.__HZ_SHOW__('Trade'));
await waitRail('Trade');
{
  const f = frameOf('Trade');
  const alive = await f.evaluate(() => {
    const cols = document.querySelector('.cols');
    const first = cols ? cols.firstElementChild : null;
    const mid = document.querySelector('.col.mid');
    return {
      colsChildren: cols ? cols.childElementCount : -1,
      colsLeft: document.querySelectorAll('.cols>.col').length,
      srpCount: document.querySelectorAll('#srp').length,
      railFirst: !!(first && first.id === 'srp'),
      midAlive: !!mid && mid.isConnected && !!mid.querySelector('.grid-container'),
      tradeBagGone: !!document.querySelector('#srp #tradeBagGrid') || !document.getElementById('tradeBagGrid')
    };
  });
  check('trade-alive:cols-children', alive.colsChildren === tradePre.children, `装配前=${tradePre.children} → 装配后=${alive.colsChildren}（=装配前-1+rail；级联终态=1）`);
  check('trade-alive:two-cols', alive.colsLeft === tradePre.cols - 1, `.col 剩 ${alive.colsLeft}（=装配前 ${tradePre.cols}-1，中列+右列存活）`);
  check('trade-alive:srp-first-unique', alive.railFirst && alive.srpCount === 1, `#srp 是 .cols 首子=${alive.railFirst} 全文档唯一=${alive.srpCount === 1}`);
  check('trade-alive:mid-col', alive.midAlive, '.col.mid 连通 + 列内 .grid-container（无人机格）存活');
  check('trade-alive:bag-grid-zero', alive.tradeBagGone, '#tradeBagGrid 在壳内（v1.8.2 reparent：官方格进 #srp 存活）或已移除');
  await page.waitForTimeout(1800);
  const re = await f.evaluate(() => ({
    colsChildren: (document.querySelector('.cols') || { childElementCount: -1 }).childElementCount,
    colsLeft: document.querySelectorAll('.cols>.col').length,
    srpCount: document.querySelectorAll('#srp').length,
    railOk: !!(document.getElementById('srRail') && document.getElementById('srRail').isConnected)
  }));
  check('trade-stable:1.8s-recheck', re.colsChildren === tradePre.children && re.colsLeft === tradePre.cols - 1 && re.srpCount === 1 && re.railOk,
    `1.8s 复查 children=${re.colsChildren} cols=${re.colsLeft} srp=${re.srpCount} rail=${re.railOk}（不级联）`);
}

/* ②d 其余多内容页官方锚点存活（评审 Important：至少一条/页） */
{
  const cook = await frameOf('Cooking').evaluate(() => {
    const cs = document.getElementById('cookingSystem');
    return {
      system: !!cs && cs.isConnected,
      panels: document.querySelectorAll('.panel').length,
      pot: !!document.getElementById('mainPotGrid')
    };
  });
  check('alive:Cooking', cook.system && cook.panels >= 2 && cook.pot, `#cookingSystem 存活 panels=${cook.panels}（≥2：机器/右栏未被波及） #mainPotGrid=${cook.pot}`);
  const hub = await frameOf('DroneHub').evaluate(() => ({
    mineReplaced: !document.getElementById('paneMine'),
    hubPane: !!document.getElementById('paneHub') && document.getElementById('paneHub').isConnected
  }));
  check('alive:DroneHub', hub.mineReplaced && hub.hubPane, `#paneMine 已替换（设计，=${hub.mineReplaced}） #paneHub 存活=${hub.hubPane}`);
}

/* ③ iframe 切换往返：Cooking → Trade → Cooking，rail 恢复（el 引用表随重装配回来） */
await page.evaluate(() => window.__HZ_SHOW__('Trade'));
await waitRail('Trade');
await page.evaluate(() => window.__HZ_SHOW__('Cooking'));
await waitRail('Cooking');
const stCook = await frameOf('Cooking').evaluate(() => {
  const rail = document.getElementById('srRail');
  return { ok: !!rail && rail.isConnected, w: rail ? rail.offsetWidth : 0, title: (document.getElementById('srTitle') || {}).textContent || '' };
});
check('roundtrip:Cooking->Trade->Cooking', stCook.ok && stCook.w === 720, `rail=${stCook.ok} ${stCook.w}px title=${stCook.title}`);
check('scene-state:Cooking', stCook.title === '背包', 'title=' + stCook.title + '（入口默认=背包）');

/* bagonly 场景态 → v1.8.3 原生模式复检：BackpackUI 重显后仍无 rail、srNativeBp 仍在（幂等不重复） */
await page.evaluate(() => window.__HZ_SHOW__('BackpackUI'));
{
  const nf = frameOf('BackpackUI');
  await nf.waitForFunction(() => document.getElementById('srNativeBp'), null, { timeout: 8000 });
  const bo = await nf.evaluate(() => ({
    cssCount: document.querySelectorAll('#srNativeBp').length,
    noRail: !document.getElementById('srRail'),
    officialPanels: document.querySelectorAll('.bag-panel').length
  }));
  check('native-reshow:BackpackUI', bo.cssCount === 1 && bo.noRail && bo.officialPanels > 0,
    `srNativeBp×${bo.cssCount} 无rail=${bo.noRail} 官方面板=${bo.officialPanels}（bagonly 语义随 rail 退役）`);
}

/* rack 场景（MaterialRack）：单侧栏在位（duo 三段 = T10，不在本任务断言内） */
await page.evaluate(() => window.__HZ_SHOW__('MaterialRack'));
await waitRail('MaterialRack');
const rk = await frameOf('MaterialRack').evaluate(() => {
  const rail = document.getElementById('srRail');
  return { ok: !!rail && rail.isConnected, w: rail ? rail.offsetWidth : 0 };
});
check('rack-single:MaterialRack', rk.ok && rk.w === 720, `${rk.w}px（单侧栏，duo=T10）`);

/* ④ 宿主手动重建 → 重装配 ≤500ms（brief：观察器 500ms 内；代表 3 页——bag/tt/rack 家族） */
for (const key of ['Cooking', 'ToolTable', 'MaterialRack']) {
  await page.evaluate((k) => window.__HZ_SHOW__(k), key);
  await waitRail(key);
  const f = frameOf(key);
  const ms = await f.evaluate(async (k) => {
    const host = window.parent.__HZ_HOSTCHK__ ? window.parent.__HZ_HOSTCHK__(k) : null;
    const wrap = document.getElementById('srp');
    if (!host || !host.html || !wrap) return -1;
    const t0 = performance.now();
    wrap.outerHTML = host.html; /* 摘 rail + 复活官方宿主（一次原子替换，childList 观察） */
    for (let i = 0; i < 75; i++) { /* 轮询粒度 20ms，观察器毫秒级触发应远小于 500ms */
      const r = document.getElementById('srRail');
      if (r && r.isConnected) return performance.now() - t0;
      await new Promise((res) => setTimeout(res, 20));
    }
    return -3;
  }, key);
  check('revive:' + key, ms >= 0 && ms < 500, `${typeof ms === 'number' ? ms.toFixed(0) : ms}ms（阈值 500ms）`);
}

/* ⑤ 双保险冷恢复：另外 2 页同法摘除后只等自然路径（观察器/interval 双保险），阈值 800ms */
for (const key of ['DroneHub', 'GreenhouseBuild']) {
  await page.evaluate((k) => window.__HZ_SHOW__(k), key);
  await waitRail(key);
  const f = frameOf(key);
  const ms = await f.evaluate(async (k) => {
    const host = window.parent.__HZ_HOSTCHK__(k);
    const wrap = document.getElementById('srp');
    if (!host || !host.html || !wrap) return -1;
    const t0 = performance.now();
    wrap.outerHTML = host.html;
    for (let i = 0; i < 90; i++) {
      const r = document.getElementById('srRail');
      if (r && r.isConnected) return performance.now() - t0;
      await new Promise((res) => setTimeout(res, 20));
    }
    return -3;
  }, key);
  check('recover:' + key, ms >= 0 && ms < 800, `${typeof ms === 'number' ? ms.toFixed(0) : ms}ms（观察器/interval 双保险）`);
}

/* ⑤b T9 评审 Critical 回归：五页官方渲染段零未捕获异常（无守卫逐字 fixture 上模拟官方
   BagMsg 推送——rail 替换宿主后官方 $()/getElementById live 查询命中 SCENES.stubs 隐藏桩，
   handler 后续逻辑不中断）+ 桩存在/hidden/#srp 内/无 id 重复 + 宿主复活桩移除随重挂重建。 */
function fakeTabs(kind) {
  const ids = [900001, 900101, 900102, 900103, 900104];
  const names = { 900001: '背包', 900101: '食材柜', 900102: '冷藏柜', 900103: '材料架', 900104: '杂物柜' };
  return ids.map((o) => (kind === 'trade' ? { owner: String(o), name: names[o] } : { ownerId: o, name: names[o] }));
}
const STUB_PAGES = ['Shredder', 'Compressor', 'GreenhouseBuild', 'MaterialRack', 'ToolTable'];
const MSG_SHAPES = {
  Compressor: { type: 'WebUI_Compressor_BagMsg', data: { cartOwnerId: 900101, cartCols: 10, cartRows: 4, cartTabs: fakeTabs(), activeTab: 0, weightCurrent: 0, weightMax: 100, cartItems: [], binItems: [], trayItems: [] } },
  Shredder: { type: 'WebUI_Shredder_BagMsg', data: { cartOwnerId: 900101, cartCols: 10, cartRows: 4, cartTabs: fakeTabs(), activeTab: 0, cartItems: [], hopperItems: [], trayItems: [], cartRackRowsJson: '[]' } },
  GreenhouseBuild: { type: 'WebUI_GreenhouseBuild_BagMsg', data: { cartOwnerId: 900101, cartCols: 10, cartRows: 4, cartTabs: fakeTabs(), activeTab: 0, cartItems: [], cartRackRowsJson: '[]' } },
  MaterialRack: { type: 'WebUI_MaterialRack_BagMsg', data: { bagOwnerId: 900001, bagCols: 10, bagRows: 4, bagWeight: 0, bagMaxWeight: 100, bagOverweightLine: '', furnitureName: '材料架', total: 0, robotSwitchShow: false, robotPut: false, bagItems: [], rows: [] } },
  ToolTable: { type: 'WebUI_ToolTable_BagMsg', data: { cabinetTabs: fakeTabs('tt'), activeLeftTab: 0, workbenchItems: [], drawerOwnerId: 0, workbenchOwnerId: 0 } }
};
/* ToolTable 双通道（fix round 3）：BagMsg 之外补 StatusMsg——字段面照官方 handler
   （weightCurrent/weightMax 成对出现触发 .weight-text/.weight-fill 无守卫解引用；
   energyCost→renderCostLabel、maxCraftCount/maxByStamina→renderQtyRow、craftSpeed、
   craftBtnLocked/craftBtnLockText→btn-craft/craft-lock-tip、previewShow→product-preview、
   isCrafting→crafting-overlay——后续段全部 id 桩或宿主外真节点，用于断言「截断修复后
   后续逻辑照常跑」）。 */
const MSG_LISTS = {};
for (const k of STUB_PAGES) MSG_LISTS[k] = [MSG_SHAPES[k]];
MSG_LISTS.ToolTable.push({
  type: 'WebUI_ToolTable_StatusMsg', data: {
    weightCurrent: 1.5, weightMax: 100, energyCost: 2, maxCraftCount: 3, maxByStamina: false,
    craftSpeed: 1, craftBtnLocked: false, craftBtnLockText: '', previewShow: false,
    dyeOptionsJson: '[]', batchTotal: 0, batchIndex: 0, batchFeetText: '', isCrafting: false
  }
});
for (const key of STUB_PAGES) {
  await page.evaluate((k) => window.__HZ_SHOW__(k), key);
  await waitRail(key);
  const f = frameOf(key);
  const expected = await page.evaluate((k) => window.__CERAIL__.scenes[k].stubs.length, key);
  await f.evaluate(() => {
    if (!window.__errsInstalled) {
      window.__errsInstalled = 1;
      window.__errs = [];
      window.addEventListener('error', function (e) { window.__errs.push(String((e && e.message) || e)); });
    }
    window.__errs.length = 0;
  });
  const msgs = MSG_LISTS[key];
  for (const msg of msgs) {
    await page.evaluate(([k, m]) => window.__HZ_POST__(k, m), [key, msg]);
  }
  await page.waitForTimeout(400);
  const errs = await f.evaluate(() => (window.__errs || []).slice());
  check('stub:zero-throw:' + key, errs.length === 0,
    errs.length ? '首抛: ' + errs[0] : `官方推送（${msgs.map((m) => m.type.replace('WebUI_ToolTable_', 'TT/').replace('WebUI_', ''))}）零未捕获异常`);
  const stubState = await f.evaluate(() => {
    const stubs = [...document.querySelectorAll('[data-cer-stub]')];
    const ids = stubs.map((s) => s.id || ('.' + s.className));
    return {
      count: stubs.length,
      allHidden: stubs.every((s) => s.hidden && getComputedStyle(s).display === 'none'),
      inSrp: stubs.every((s) => !!s.closest('#srp')),
      dup: ids.filter((id) => (id.charAt(0) === '.' ? document.querySelectorAll(id) : document.querySelectorAll('[id="' + id + '"]')).length > 1),
      railOk: !!document.getElementById('srRail') && document.getElementById('srRail').isConnected,
      statusApplied: (() => { const el = document.querySelector('.weight-text'); return el && el.textContent.indexOf('Kg') >= 0; })()
    };
  });
  check('stub:present:' + key, stubState.count === expected && stubState.allHidden && stubState.inSrp,
    `桩 ${stubState.count}/${expected} 全 hidden + 全在 #srp 内`);
  check('stub:no-dup:' + key, stubState.dup.length === 0, stubState.dup.length ? '重复 id/class: ' + stubState.dup.join(',') : '无 id/class 重复');
  if (key === 'ToolTable') check('stub:class-stub-fed:' + key, stubState.statusApplied, 'StatusMsg 写进 .weight-text 类桩（textContent 含 Kg）→ 无守卫解引用已落桩');
  /* 宿主复活：桩随 #srp 被移除（同步检查）→ 重挂后重建 */
  const swap = await f.evaluate((k) => {
    const host = window.parent.__HZ_HOSTCHK__(k);
    const wrap = document.getElementById('srp');
    if (!host || !host.html || !wrap) return { gone: false };
    wrap.outerHTML = host.html;
    return { gone: document.querySelectorAll('[data-cer-stub]').length === 0 };
  }, key);
  check('stub:gone-on-revive:' + key, swap.gone !== false && swap.gone, '宿主复活瞬间桩已随 #srp 移除');
  await waitRail(key);
  const rebuilt = await f.evaluate(() => document.querySelectorAll('[data-cer-stub]').length);
  check('stub:rebuilt:' + key, rebuilt === expected, `重挂后桩重建 ${rebuilt}/${expected}`);
}

/* ④b Trade 宿主复活实锤（复活背包列 → 重替换 → 结构复原且不级联） */
{
  await page.evaluate(() => window.__HZ_SHOW__('Trade'));
  await waitRail('Trade');
  const f = frameOf('Trade');
  const res = await f.evaluate(async () => {
    const host = window.parent.__HZ_HOSTCHK__ ? window.parent.__HZ_HOSTCHK__('Trade') : null;
    const wrap = document.getElementById('srp');
    if (!host || !host.html || !wrap) return { ms: -1, bagGridBack: false };
    const t0 = performance.now();
    wrap.outerHTML = host.html; /* 官方背包列复活（rail 一并摘除） */
    const bagGridBack = !!document.getElementById('tradeBagGrid'); /* 复活瞬间快照（重替换后再查就没了） */
    for (let i = 0; i < 75; i++) {
      const r = document.getElementById('srRail');
      if (r && r.isConnected) return { ms: performance.now() - t0, bagGridBack };
      await new Promise((res2) => setTimeout(res2, 20));
    }
    return { ms: -3, bagGridBack };
  });
  const ms = res.ms;
  const post = await f.evaluate(() => ({
    colsChildren: (document.querySelector('.cols') || { childElementCount: -1 }).childElementCount,
    colsLeft: document.querySelectorAll('.cols>.col').length,
    srpCount: document.querySelectorAll('#srp').length
  }));
  check('revive:Trade', ms >= 0 && ms < 500 && post.colsChildren === tradePre.children && post.colsLeft === tradePre.cols - 1 && post.srpCount === 1 && res.bagGridBack,
    `${typeof ms === 'number' ? ms.toFixed(0) : ms}ms children=${post.colsChildren} cols=${post.colsLeft} srp=${post.srpCount} 复活瞬列原样=${res.bagGridBack}（重替换后仍不级联）`);
}

/* ⑥ 控制台零报错（除资源缺席）+ 页面异常零 */
await page.waitForTimeout(600);
check('console:zero-errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' || ') || '0 错误');
check('pageerror:zero', pageErrors.length === 0, pageErrors.slice(0, 5).join(' || ') || '0 异常');

await browser.close();
const fails = results.filter((r) => !r.ok);
console.log('\n==== SUMMARY: ' + (results.length - fails.length) + '/' + results.length + ' PASS ====');
if (fails.length) { fails.forEach((f) => console.log('FAIL: ' + f.name + ' | ' + f.detail)); process.exit(1); }

})().catch((e) => { console.error("FATAL", e); process.exit(2); });
