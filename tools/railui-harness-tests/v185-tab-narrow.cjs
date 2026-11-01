/* 2026-11-01 作者缺陷单#2 专项回归：9 机器页页签栏柜子显示（错显/缺显）。
   根因（67ef77e 三断裂）修复后口径——railCtns 机器页按 v1.7.0 逐页语义收窄：
     ① ctx.view 视图谓词（tagfilter viewAllows 移植）：food=冰箱全显+柜子食物域标签(dim1-4)、
        材料架必藏；material=材料/工具标签柜+材料架显、冰箱藏、无标签柜不进；browser=全显；
     ② TABS[scene] 官方页签数组成员过滤（缓存已到才启用）：不在官方数组=点了也不切 → 不显示
        （Compressor 原生=冰箱族 → 食物柜被此条收敛 = v1.7.0 原状）；
     ③ 页签行平铺本页语义全集（默认前 4 退役 → 「未显示」消除）。
   断言矩阵：Cooking(food)/ToolTable(material)/Trade(browser)/Compressor(food+TABS 冰箱族)
   ×（页签集合 | TABS 门 | 全平铺 | 点击 forge SWITCH_BAG | 切柜续排 sortBy）。 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');

const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

/* 手推契约（缺陷单后字段：ctx.view + lib icon（material/tool 代表标签））。
   ctn 全集=v1.7.0 各页语义并集：900101 食材柜(食物域 101/104)、900102 冰箱、900103 材料架、
   900104 杂物柜(无标签→material 页不进)、900105 工具柜(打 tool 标签 108)。 */
const CONTRACT = (page, family, view, rev) => ({
  rev: rev || 100, ctx: { page, family, bagOnly: false, bagCap: 42, view },
  bag: 900001,
  ctn: [
    [900101, '食材柜', 'c', 40, 101, 104],
    [900102, '冷藏柜', 'f', 24, 102],
    [900103, '材料架', 'r', 60, 103, 106],
    [900104, '杂物柜', 'c', 18],
    [900105, '工具柜', 'c', 30, 108]
  ],
  lib: [
    [101, '食材', 4, 1, '', '#8fc06e'],
    [102, '需冷藏', 3, 2, '', '#6fc7c9'],
    [103, '材料', 0, 3, 'material', '#7aa2d6'],
    [104, '蔬果', 1, 4, '', '#8fc06e'],
    [106, '种植', 5, 6, '', '#6fc7c9'],
    [108, '工具', 0, 8, 'tool', '#c9b458']
  ],
  icfg: [[1, '生态香米', 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==#v1', 12, 99, 1, 1, '食材', 0, 15, 0, 0, 0, 0]],
  items: { bag: [[901, 1, 30, 7200, 0, 0, 1, 1, 0, 15, 0, 0, 0, 360, 3.5]], 900101: [[911, 1, 9, 500, 0, 0, 1, 1, 0, 15, 0, 0, 0, 108, 4.5]] }
});

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await (await browser.newContext({ viewport: { width: 1536, height: 864 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) errs.push(m.text().slice(0, 160)); });

  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  /* 命令+forge 截获 */
  await page.evaluate(() => {
    window.__CAP = { cmd: [], forge: [] };
    const oc = window.__CERAIL__.cmd;
    window.__CERAIL__.cmd = function (op, p) { window.__CAP.cmd.push([op, p]); return oc.call(this, op, p); };
    const op = window.postMessage.bind(window);
    window.postMessage = function (m) { try { if (m && m.type === 'SWITCH_BAG') window.__CAP.forge.push(m); } catch (e) { } return op(m); };
  });

  const pinsOf = (frame) => frame.evaluate(() => {
    const rail = document.getElementById('srRail') || document.querySelector('.sr-rail');
    if (!rail) return null;
    const row = rail.querySelector('#srPinRow');
    if (!row) return null;
    return [...row.querySelectorAll('[data-ctn]')].map((b) => b.querySelector('.p-lb') ? b.querySelector('.p-lb').textContent : b.textContent.trim());
  });

  /* 模拟官方页签数组（Root→iframe BagMsg，wrapRelay 截读入 TABS） */
  const injectTabs = (key, owners) => page.evaluate(([k, os]) => {
    const el = document.getElementById(k);
    if (el && el.contentWindow) el.contentWindow.postMessage({
      type: 'WebUI_' + k + '_BagMsg',
      data: { bagTabsJson: JSON.stringify(os.map((o) => ({ ownerId: o }))) }
    }, '*');
  }, [key, owners]);

  const push = async (j) => { await page.evaluate((x) => window.__CERAIL__.setData(x), j); await page.waitForTimeout(900); };
  /* TABS 注入本身不触发 render（railCtns 只在 render 现算）——补推一包逼 render */

  /* ---- ① Cooking · food 视图 ---- */
  await page.evaluate(() => window.__HZ_SHOW__('Cooking'));
  const cookFrame = page.frames().find((f) => f.url().includes('/fixtures/Cooking.html'));
  await cookFrame.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 15000 });
  await push(CONTRACT('Cooking', 'bag', 'food', 101));
  let pins = await pinsOf(cookFrame);
  check('cook:food-set', JSON.stringify(pins) === JSON.stringify(['背包', '食材柜', '冷藏柜']), `[${pins}]（食物柜+冰箱；材料架/无标签柜不进）`);
  check('cook:full-flat', pins && pins.length === 3, '页签行平铺本页全集（默认前 4 退役）');

  /* TABS 门：官方数组只有食材柜 → 冰箱被门滤掉（宁可不显示不错显） */
  await injectTabs('Cooking', [900101]);
  await push(CONTRACT('Cooking', 'bag', 'food', 111));
  pins = await pinsOf(cookFrame);
  check('cook:tabs-gate', JSON.stringify(pins) === JSON.stringify(['背包', '食材柜']), `[${pins}]（TABS 门生效=只显官方可切集）`);

  /* 点击页签 → forge SWITCH_BAG（bag 族 ownerId 数字） */
  await page.evaluate(() => { window.__CAP.forge.length = 0; });
  await cookFrame.evaluate(() => { const b = document.querySelector('#srPinRow [data-ctn="900101"]'); if (b) b.click(); });
  await page.waitForTimeout(250);
  const forged = await page.evaluate(() => window.__CAP.forge);
  check('cook:click-forge-switch', forged.length === 1 && forged[0].data && forged[0].data.ownerId === 900101 && typeof forged[0].data.ownerId === 'number', JSON.stringify(forged.map((f) => f.data)));

  /* 切柜续排（缺陷单#1：fsort 非 official 时切柜下发 sortBy）——先在页脚选饱腹 */
  await cookFrame.evaluate(() => { const b = document.getElementById('srFoodSort'); if (b && b.hidden) return; b.click(); });
  await cookFrame.waitForFunction(() => !document.getElementById('srFootSortPop').hidden, null, { timeout: 4000 }).catch(() => { });
  await cookFrame.evaluate(() => { const o = document.querySelector('#srFootSortPop [data-fsort="sat"]'); if (o) o.click(); });
  await page.waitForTimeout(200);
  /* v1.8.5：切柜续排=显示层（render 尾部 dispApply 重抹）——数据层 sortBy 续排退役，
     断言=切柜后零数据层命令（真实布局零触碰） */
  await page.evaluate(() => { window.__CAP.cmd.length = 0; });
  await cookFrame.evaluate(() => { const b = document.querySelector('#srPinRow [data-ctn="900001"]'); if (b) b.click(); });
  await page.waitForTimeout(250);
  const sortBy = await page.evaluate(() => window.__CAP.cmd.filter((c) => c[0] === 'sortBy').pop());
  check('cook:no-resort-cmd-on-switch', !sortBy, '切柜零数据层命令（显示层 render 重抹）');

  /* ---- ② ToolTable · material 视图 ---- */
  await page.evaluate(() => window.__HZ_SHOW__('ToolTable'));
  const ttFrame = page.frames().find((f) => f.url().includes('/fixtures/ToolTable.html'));
  await ttFrame.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 15000 });
  await push(CONTRACT('ToolTable', 'tt', 'material', 102));
  pins = await pinsOf(ttFrame);
  check('tt:material-set', JSON.stringify(pins) === JSON.stringify(['背包', '材料架', '工具柜']), `[${pins}]（材料/工具柜+架子；冰箱/食物柜/无标签柜不进）`);
  /* tt 族 forge= TAB_SWITCH（下标族）——900105 在官方数组（无 pin 偏移场景按 extractTabs 原数组） */
  await injectTabs('ToolTable', [900105, 900103]);
  await push(CONTRACT('ToolTable', 'tt', 'material', 112));
  pins = await pinsOf(ttFrame);
  check('tt:tabs-gate', JSON.stringify(pins) === JSON.stringify(['背包', '材料架', '工具柜']), `[${pins}]`);

  /* ---- ③ Trade · browser 视图（全量含冰箱/架子/无标签柜；a8d0a1d 载具口径=Browser 全显） ---- */
  await page.evaluate(() => window.__HZ_SHOW__('Trade'));
  const trFrame = page.frames().find((f) => f.url().includes('/fixtures/Trade.html'));
  await trFrame.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 15000 });
  await push(CONTRACT('Trade', 'trade', 'browser', 103));
  pins = await pinsOf(trFrame);
  check('trade:browser-all', pins && pins.length === 6, `[${pins}]（背包+5 柜全显）`);

  /* ---- ④ Compressor · food + TABS=冰箱族（v1.7.0 原状：原生页签=冷链冰箱） ---- */
  await page.evaluate(() => window.__HZ_SHOW__('Compressor'));
  const cpFrame = page.frames().find((f) => f.url().includes('/fixtures/Compressor.html'));
  await cpFrame.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 15000 });
  await push(CONTRACT('Compressor', 'cart0', 'food', 104));
  pins = await pinsOf(cpFrame);
  check('comp:food-without-tabs', JSON.stringify(pins) === JSON.stringify(['背包', '食材柜', '冷藏柜']), `[${pins}]（TABS 未到=先按视图集）`);
  await injectTabs('Compressor', [900102]);
  await push(CONTRACT('Compressor', 'cart0', 'food', 113));
  pins = await pinsOf(cpFrame);
  check('comp:tabs-fridge-only', JSON.stringify(pins) === JSON.stringify(['背包', '冷藏柜']), `[${pins}]（官方数组=冰箱族 → 食物柜收敛=v1.7.0 原状）`);

  check('zero-console-errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
