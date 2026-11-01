/* 2026-11-01 作者实机「烹饪页签迟到」专项回归：刚开烹饪只显背包+冰箱，点冰箱后才冒出
   2 个食物标签柜。根因双断（67ef77e 后引入的 ∩门 + 渲染触发缺位）：
     ① TabInjector 四注入页（Cooking/RatCage/Brew/Dye）官方数组=c 终态（C# 补全柜子），
       但首包渲染早于注入回包 → ∩门拿原生数组（背包+冰箱）把食物柜裁掉 → 开页缺柜。
       修：SCENES.injTabs 页对 kind 'c' 放行（bag 族 SWITCH_BAG 直给，无下标依赖）。
     ② TABS 缓存变化从不触发 render（railCtns 只在 render 现算）→ 注入回包更新 TABS 后
       页签行停在旧集合，要等下一次 render 触发（作者点冰箱 followActive）才自愈。
       修：relayObserve 里 TABS 内容变化且帧=活跃场景 → render。
   断言矩阵：
     A. Cooking(food)：契约先到（TABS 未到）→ 食物柜+冰箱直出（原有行为保持）；
     B. Cooking(food)：**原生数组（只有冰箱）先到**再推契约 → 首渲染即含 2 食物柜
        （本缺陷的实机时序复刻——修复前此处=背包+冰箱）；
     C. 注入回包（数组补全）到达 → TABS 变化自动 render（不再需要「补推一包逼 render」）；
     D. 同数组重推（内容不变）→ 不多余 render（render 计数不变）；
     E. 非 c 容器门照旧：官方数组无冰箱 → 冰箱仍被裁（v1.7.0 口径不变）；
     F. ToolTable(tt) 不在 injTabs 集：柜子仍受 ∩门约束（非注入页零变化）。 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');

const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

/* 实机形状手推契约（对齐 v185：ctn=食物柜×2/冰箱/材料柜(无食物域标签)）。
   食物域标签 dim1-4：101 食材(dim4)/104 蔬果(dim1)；冰箱 kind f。 */
const CONTRACT = (rev) => ({
  rev, ctx: { page: 'Cooking', family: 'bag', bagOnly: false, bagCap: 42, view: 'food' },
  bag: 900001,
  ctn: [
    [900101, '食材柜', 'c', 40, 101],
    [900102, '冷藏柜', 'f', 24, 102],
    [900106, '蔬果柜', 'c', 36, 104],
    [900104, '杂物柜', 'c', 18]
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

  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const pinsOf = (frame) => frame.evaluate(() => {
    const rail = document.getElementById('srRail') || document.querySelector('.sr-rail');
    const row = rail && rail.querySelector('#srPinRow');
    if (!row) return null;
    return [...row.querySelectorAll('[data-ctn]')].map((b) => (b.querySelector('.p-lb') ? b.querySelector('.p-lb').textContent : b.textContent.trim()));
  });
  const injectTabs = (key, owners) => page.evaluate(([k, os]) => {
    const el = document.getElementById(k);
    if (el && el.contentWindow) el.contentWindow.postMessage({
      type: 'WebUI_' + k + '_BagMsg',
      data: { bagTabsJson: JSON.stringify(os.map((o) => ({ ownerId: o }))) }
    }, '*');
  }, [key, owners]);

  /* ---- ① Cooking：契约先到（TABS 未到）——食物柜+冰箱直出（原有行为保持） ---- */
  await page.evaluate(() => window.__HZ_SHOW__('Cooking'));
  const cookFrame = page.frames().find((f) => f.url().includes('/fixtures/Cooking.html'));
  await cookFrame.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 15000 });
  await page.evaluate((x) => window.__CERAIL__.setData(x), CONTRACT(201));
  await page.waitForTimeout(900);
  let pins = await pinsOf(cookFrame);
  check('A:contract-first-full', JSON.stringify(pins) === JSON.stringify(['背包', '食材柜', '冷藏柜', '蔬果柜']),
    `[${pins}]（TABS 未到=按视图集直出）`);

  /* ---- ② 实机时序复刻：原生数组（只有冰箱）先到 → 契约 → 首渲染必须含 2 食物柜 ---- */
  await page.evaluate(() => window.__HZ_SHOW__('ToolTable')); /* 离开再回来=重开（会话态/快照复位路径） */
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__HZ_SHOW__('Cooking'));
  const cookFrame2 = page.frames().find((f) => f.url().includes('/fixtures/Cooking.html'));
  await cookFrame2.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 15000 });
  await injectTabs('Cooking', [900102]); /* 原生页签：背包+冰箱（无柜子） */
  await page.waitForTimeout(200);
  await page.evaluate((x) => window.__CERAIL__.setData(x), CONTRACT(202));
  await page.waitForTimeout(900);
  pins = await pinsOf(cookFrame2);
  check('B:preinject-native-tabs-c-not-cut', JSON.stringify(pins) === JSON.stringify(['背包', '食材柜', '冷藏柜', '蔬果柜']),
    `[${pins}]（原生数组裁不掉食物柜=修复；修复前=背包,冷藏柜）`);

  /* ---- ③④ TABS 变化自动 render（行为断言：**不推任何契约**，行必须随数组变化收敛）----
     render 无对外计数（PIN_KEY 内容短路也不写 DOM），改从行为观测：
     ③ 收窄——官方数组撤掉冰箱 → 行立即丢冰箱（v1.7.0 门即时生效；修复前 TABS 更新
        无人渲染，行停在旧集合不动）；
     ④ 补全——TabInjector 注入回包形状（含冰箱+全部柜子）→ 行自动补回冰箱
        （作者实机场景：注入回包到达后自愈，无需点切柜/等下一包）。 */
  await injectTabs('Cooking', [900101, 900106, 900104]); /* 收窄：无冰箱 */
  await page.waitForTimeout(500);
  pins = await pinsOf(cookFrame2);
  check('C:tabs-narrow-autorender', JSON.stringify(pins) === JSON.stringify(['背包', '食材柜', '蔬果柜']),
    `[${pins}]（数组撤冰箱→行即时丢冰箱；修复前=行不动）`);
  await injectTabs('Cooking', [900102, 900101, 900106, 900104]); /* 补全=注入回包形状 */
  await page.waitForTimeout(500);
  pins = await pinsOf(cookFrame2);
  check('D:tabs-heal-autorender', JSON.stringify(pins) === JSON.stringify(['背包', '食材柜', '冷藏柜', '蔬果柜']),
    `[${pins}]（注入回包到达→行自动补全，无需契约推送）`);

  /* ---- ⑤ 非 c 容器门照旧：官方数组无冰箱 → 冰箱仍被裁（v1.7.0 口径不变） ---- */
  await page.evaluate((x) => window.__CERAIL__.setData(x), CONTRACT(203));
  await page.waitForTimeout(900);
  await injectTabs('Cooking', [900101, 900106, 900104]);
  await page.waitForTimeout(500);
  pins = await pinsOf(cookFrame2);
  check('E:f-still-gated', JSON.stringify(pins) === JSON.stringify(['背包', '食材柜', '蔬果柜']),
    `[${pins}]（f 不在注入集，门照旧）`);

  /* ---- ⑥ ToolTable（非注入页）：柜子仍受 ∩门约束（零变化对照） ---- */
  await page.evaluate(() => window.__HZ_SHOW__('ToolTable'));
  const ttFrame = page.frames().find((f) => f.url().includes('/fixtures/ToolTable.html'));
  await ttFrame.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 15000 });
  await injectTabs('ToolTable', [900101]); /* 官方数组只有食材柜 */
  await page.waitForTimeout(500);
  await page.evaluate((x) => window.__CERAIL__.setData(x), {
    ...CONTRACT(204), ctx: { page: 'ToolTable', family: 'tt', bagOnly: false, bagCap: 42, view: 'browser' }
  });
  await page.waitForTimeout(900);
  pins = await pinsOf(ttFrame);
  check('F:tt-gate-intact', JSON.stringify(pins) === JSON.stringify(['背包', '食材柜']),
    `[${pins}]（非注入页 ∩门照裁 900106/900102/900104）`);

  check('zero-console-errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
