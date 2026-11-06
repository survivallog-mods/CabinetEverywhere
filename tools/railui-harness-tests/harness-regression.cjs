/* T11 root harness（railui-root-harness.html）断言（Playwright，serve.cjs 须已在 8180）。
   真装配路径（Root+#iframe-container+12 iframe+ensureMounted 循环）上的全流程：
   ① 机器场景主侧栏入口（Cooking）：显隐/确认文案对账/豁免不秒关/Esc/取消/确认→drain
      JSON 带 order→mock 执行→差量 toast 数字对账/背包网格态；
   ② rack 左面板入口（MaterialRack duo）：主侧栏隐/左面板显、确认→order、零命中分支
      （bag=医疗 7 件→全留背包 toast）、空背包 sbToast；
   ③ 回归：T8 桩 16、宿主消亡、T9 切柜（rack 本地渲染路）、A→B→A 重访后入库弹窗仍活。 */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/temp/baidu_up/node_modules/playwright-core')); } /* 环境漂移兜底（tagfilter-gate 同款）：全局 playwright 包不在时走 playwright-core */

const BASE = 'http://127.0.0.1:8180';
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

  function frameOf(key) { return page.frames().find((f) => f.url().includes('/fixtures/' + key + '.html')); }
  async function waitRail(key, timeout = 9000) {
    await frameOf(key).waitForFunction(() => { const r = document.getElementById('srRail'); return r && r.isConnected; }, null, { timeout });
  }
  const ftxt = (key, sel) => frameOf(key).evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel);
  const fhtml = (key, sel) => frameOf(key).evaluate((s) => (document.querySelector(s) || {}).innerHTML || '', sel);
  const fhidden = (key, sel) => frameOf(key).evaluate((s) => { const e = document.querySelector(s); return !e || e.hidden; }, sel);
  const fesc = (key) => frameOf(key).evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  const drain = () => page.evaluate(() => window.__CERAIL__.drain());
  const showScene = async (key) => { await page.getByRole('button', { name: key, exact: true }).click(); await waitRail(key); };

  /* ---- ① Cooking：机器场景主侧栏入口 ---- */
  /* （①b v1.8.6 NB 双侧断言插在本段尾部、② 之前——见下） */
  await waitRail('Cooking');
  await frameOf('Cooking').waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '背包', null, { timeout: 9000 });
  check('root:cook-sr-visible', !(await fhidden('Cooking', '#srStoreAll')), 'Cooking bag 页 srStoreAll 可见');
  await frameOf('Cooking').locator('#srStoreAll').click();
  await page.waitForTimeout(150);
  check('root:no-insta-close', !(await fhidden('Cooking', '#srStoreConfirm')), '真装配路径点开不秒关（豁免清单）');
  const ctext = await fhtml('Cooking', '#srStoreText');
  check('root:confirm-text', /背包现有 <b>128<\/b> 件（10 叠）/.test(ctext) && ctext.indexOf('柜满顺延下一个同标签柜') >= 0, '文案=128 件（10 叠）+柜满顺延…');
  await fesc('Cooking');
  check('root:esc-close', await fhidden('Cooking', '#srStoreConfirm'), 'Esc 关闭');
  await frameOf('Cooking').locator('#srStoreAll').click();
  const reopenOk = !(await fhidden('Cooking', '#srStoreConfirm'));
  await frameOf('Cooking').locator('#srStoreCancel').click();
  check('root:reopen-cancel', reopenOk && await fhidden('Cooking', '#srStoreConfirm'), '重开+取消');
  await frameOf('Cooking').locator('#srStoreAll').click();
  await frameOf('Cooking').locator('#srStoreGo').click();
  await page.waitForTimeout(100);
  const d1 = JSON.parse(await drain());
  check('root:cmd-json', d1.length === 1 && d1[0].op === 'storeAll' && JSON.stringify(d1[0].order) === '[900101,900102,900103,900104]',
    'drain=' + JSON.stringify(d1[0]));
  const toast1 = await ftxt('Cooking', '#srToast');
  check('root:delta-toast', toast1 === '已入库 121 件 → 食材柜×41 · 材料架×80；7 件无匹配柜或柜已满，留在背包', 'toast=' + toast1);
  const bagGrid = await frameOf('Cooking').evaluate(() => ({
    items: document.querySelectorAll('#srGrid .sr-slot[data-it]').length,
    emptyMsg: !!document.querySelector('#srGrid .sr-empty'),
    cells: document.querySelectorAll('#srGrid .sr-slot').length
  }));
  check('root:bag-grid-leftover', bagGrid.items === 2 && !bagGrid.emptyMsg && bagGrid.cells === 50, '背包剩 2 叠 + 空格补位（非「没有匹配的物品」） ' + JSON.stringify(bagGrid));

  /* ---- ①b v1.8.6 NB 双侧（BackpackUI 原生页三形态 + 闪钮竞态回归钉） ----
     solo=袋侧排序+入库；取用=柜侧仅排序（袋侧钮即摘——陈旧 ctx.bpBag=true 不再误装；
     旧码在该形态会把袋侧按钮对装上柜面板=「左下角排序钮闪一下」根因）；整理物资=
     A 袋侧双钮 + B 柜侧仅排序，两侧独立排序（DISP/DISP_CT）互不顶替。
     驱动：__HZ_SHOW__ 真装配路（nbMount/nbPanels）+ __HZ_POST__ 直投官方 Info/Items
     消息换形态（fixture=真 Vue 页，setupState.ownerId 判据真源生效）。 */
  await page.evaluate(() => window.__HZ_SHOW__('BackpackUI'));
  const bp = frameOf('BackpackUI');
  await bp.waitForFunction(() => !!document.getElementById('srnSortBtn') && !!document.getElementById('srnStoreBtn'), null, { timeout: 9000 });
  check('nb:solo-pair', await bp.evaluate(() => !document.getElementById('srnSortBtn2')), 'B键背包：袋侧排序+入库钮在位、无柜侧钮');
  /* 自备契约：900101 柜行带 s1/days 数值（MOCK 的 900101 行无数值列）；ctx.bpBag=true
     故意滞留（模拟上一包=背包态——旧判据的竞态原料） */
  await page.evaluate(() => {
    const j = JSON.parse(JSON.stringify(window.__HZ_MOCKSET__()));
    j.ctx.bpBag = true; j.rev = 9001;
    j.items['900101'] = [
      [911, 1, 60, 86400, 0, 0, 1, 1, 0, 15, null, null, null, 360, null],
      [912, 3, 5, 3600, 1, 0, 1, 1, 0, 2, 5, null, null, 25, 2.5],
      [913, 2, 8, 7200, 2, 0, 1, 1, 0, 48, null, null, 6, 304, 0.5]
    ];
    window.__HZ_MOCKSET__(j);
    window.__HZ_PUSH__('BackpackUI');
    window.__CERAIL__.scan();
  });
  /* 取用形态：InfoAMsg 绑柜 ownerId（官方 ready 门已开，Vue 真源判据即时生效） */
  const ctnItemsJson = await page.evaluate(() => JSON.stringify([
    { id: 911, x: 0, y: 0, w: 1, h: 1, icon: window.__HZ_ICOV__(1), name: '生态香米', count: 60, quality: 3, cfgId: 1, vd: [], shelfLifeDays: null },
    { id: 912, x: 1, y: 0, w: 1, h: 1, icon: window.__HZ_ICOV__(3), name: '咖啡', count: 5, quality: 3, cfgId: 3, vd: [], shelfLifeDays: 2.5 },
    { id: 913, x: 2, y: 0, w: 1, h: 1, icon: window.__HZ_ICOV__(2), name: '烤肉', count: 8, quality: 3, cfgId: 2, vd: [], shelfLifeDays: 0.5 }
  ]));
  await page.evaluate((itemsJson) => {
    window.__HZ_POST__('BackpackUI', { type: 'WebUI_Backpack_InfoAMsg', data: { ownerId: 900101, backpackName: '食材柜', gridCols: 10, gridRows: 6, currentWeight: 0, maxWeight: 200 } });
    window.__HZ_POST__('BackpackUI', { type: 'WebUI_Backpack_ItemsAMsg', data: { itemsJson: itemsJson } });
    window.__CERAIL__.scan();
  }, ctnItemsJson);
  await bp.waitForFunction(() => !!document.getElementById('srnSortBtn2'), null, { timeout: 9000 });
  const accessBtns = await bp.evaluate(() => ({
    sort2: !!document.getElementById('srnSortBtn2'),
    sortBag: !!document.getElementById('srnSortBtn'),
    store: !!document.getElementById('srnStoreBtn'),
    badges2: !!document.getElementById('srnBadges2')
  }));
  check('nb:access-ctn-sort', accessBtns.sort2, '取用：柜侧排序钮在位（srnSortBtn2）');
  check('nb:access-no-store', !accessBtns.store && !accessBtns.sortBag, '取用：袋侧按钮对即摘（陈旧 bpBag=true 不误装——闪钮竞态根治）');
  /* 取用排序：选饱腹 → DISP_CT 生效 + 柜格角标（s1 降序 48>15>2） */
  await bp.locator('#srnSortBtn2').click();
  await page.waitForTimeout(80);
  await bp.locator('#srnSortPop2 [data-k="sat"]').click();
  await page.waitForTimeout(400);
  const ct1 = await page.evaluate(() => window.__CERAIL__.dispInfo());
  const ct1Badges = await bp.evaluate(() => [...document.querySelectorAll('#srnBadges2 i')].map((i) => i.textContent));
  /* 角标=DOM 序（Vue v-for 不重排 DOM，视觉位由 x/y 决定——下标直配不变量）；
     排序本身由模型位断言证明（s1 降序 48>15>2 → 913@0,911@1,912@2） */
  const ct1Model = await bp.evaluate(() => {
    const app = document.getElementById('app');
    const su = app && app._vnode && app._vnode.component && app._vnode.component.setupState;
    return su && su.bagA ? su.bagA.items.map((it) => it.id + '@' + it.x) : [];
  });
  check('nb:access-sort-applied', !!(ct1.ct && ct1.ct.choice === 'sat' && String(ct1.ct.owner) === '900101' && ct1.nb && ct1.nb.ctn === 'sat' && ct1.nb.bag === 'official'),
    'dispInfo ct=' + JSON.stringify(ct1.ct) + ' nb=' + JSON.stringify(ct1.nb));
  check('nb:access-sort-model', ct1Model.join(',') === '911@1,912@2,913@0', '取用模型位（饱腹降序 48>15>2 → 位序 913@0,911@1,912@2；数组序不重排）=' + ct1Model.join(','));
  check('nb:access-badges', ct1Badges.join(',') === '+15,+2,+48', '取用角标值（DOM 序，逐格对位）=' + ct1Badges.join(','));
  /* 整理物资（dual）：A=背包双钮 + B=柜仅排序；两侧独立排序互不顶替 */
  await page.evaluate((itemsJson) => {
    window.__HZ_POST__('BackpackUI', { type: 'WebUI_Backpack_InfoAMsg', data: { ownerId: 900001, backpackName: '背包', isDualBag: true, gridCols: 10, gridRows: 6, currentWeight: 0, maxWeight: 100 } });
    window.__HZ_POST__('BackpackUI', { type: 'WebUI_Backpack_ItemsAMsg', data: { itemsJson: JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7].map((x) => ({ id: 900 + x + 1, x: x, y: x % 2, w: 1, h: 1, icon: window.__HZ_ICOV__((x % 9) + 1), name: '物品' + (900 + x + 1), count: 3, quality: 3, cfgId: (x % 9) + 1, vd: [], shelfLifeDays: null }))) } });
    window.__HZ_POST__('BackpackUI', { type: 'WebUI_Backpack_InfoBMsg', data: { ownerId: 900101, backpackName: '食材柜', canTag: true, gridCols: 10, gridRows: 6, currentWeight: 0, maxWeight: 200 } });
    window.__HZ_POST__('BackpackUI', { type: 'WebUI_Backpack_ItemsBMsg', data: { itemsJson: itemsJson } });
    window.__CERAIL__.scan();
  }, ctnItemsJson);
  await page.waitForTimeout(400);
  const dual1 = await bp.evaluate(() => {
    const a = document.querySelector('.bag-panel:not(.is-storage)');
    const b = document.querySelector('.bag-panel.is-storage');
    return {
      aSort: !!(a && a.querySelector('#srnSortBtn')), aStore: !!(a && a.querySelector('#srnStoreBtn')),
      bSort: !!(b && b.querySelector('#srnSortBtn2')), bStore: !!(b && b.querySelector('#srnStoreBtn')),
      storeN: document.querySelectorAll('#srnStoreBtn').length
    };
  });
  check('nb:dual-bag-pair', dual1.aSort && dual1.aStore, '整理物资 A 侧=排序+入库双钮 ' + JSON.stringify(dual1));
  check('nb:dual-ctn-only-sort', dual1.bSort && dual1.storeN === 1 && !dual1.bStore, '整理物资 B 侧=仅排序（入库全页唯一挂 A 侧）');
  /* 两侧独立：A=饱腹、B=保质期（B 侧取用态选的 sat 续排被覆写为 shelf——同页柜侧单态） */
  await bp.locator('#srnSortBtn').click();
  await page.waitForTimeout(80);
  await bp.locator('#srnSortPop [data-k="sat"]').click();
  await page.waitForTimeout(200);
  await bp.locator('#srnSortBtn2').click();
  await page.waitForTimeout(80);
  await bp.locator('#srnSortPop2 [data-k="shelf"]').click();
  await page.waitForTimeout(450);
  const ct2 = await page.evaluate(() => window.__CERAIL__.dispInfo());
  const dualBadges = await bp.evaluate(() => ({
    bag: document.querySelectorAll('#srnBadges i').length,
    ctn: document.querySelectorAll('#srnBadges2 i').length
  }));
  check('nb:dual-independent', !!(ct2.choice === 'sat' && String(ct2.owner) === '900001' && ct2.ct && ct2.ct.choice === 'shelf' && String(ct2.ct.owner) === '900101'),
    'DISP=bag:' + ct2.choice + '@' + ct2.owner + ' / ct:' + ct2.ct.choice + '@' + ct2.ct.owner);
  check('nb:dual-badges-both', dualBadges.bag >= 8 && dualBadges.ctn >= 3, '双侧角标层 bag=' + dualBadges.bag + ' ctn=' + dualBadges.ctn);
  check('nb:console-clean-sofar', consoleErrors.length === 0 && pageErrors.length === 0,
    'console errors=' + consoleErrors.length + ' pageErrors=' + pageErrors.length + (consoleErrors[0] ? ' | ' + consoleErrors[0] : '') + (pageErrors[0] ? ' | ' + pageErrors[0] : ''));

  /* ---- ② MaterialRack：左面板入口（bag 现存医疗 7 件 → 零命中分支） ---- */
  await showScene('MaterialRack');
  await frameOf('MaterialRack').waitForFunction(() => !!document.getElementById('sbGrid'), null, { timeout: 9000 });
  const rackVis = await frameOf('MaterialRack').evaluate(() => ({ sr: document.getElementById('srStoreAll').hidden, sb: document.getElementById('sbStoreAll').hidden }));
  check('root:rack-visibility', rackVis.sr === true && rackVis.sb === false, '主侧栏隐/左面板显 ' + JSON.stringify(rackVis));
  const stubs = await frameOf('MaterialRack').evaluate(() => {
    const els = [...document.querySelectorAll('[data-cer-stub]')];
    return { n: els.length, allHidden: els.every((e) => e.hidden && e.style.display === 'none'), hostGone: !document.getElementById('rackSystem') };
  });
  check('root:stubs-host', stubs.n === 16 && stubs.allHidden && stubs.hostGone, 'T8 桩 16 全隐藏 + #rackSystem 消亡（回归） ' + JSON.stringify(stubs));
  await frameOf('MaterialRack').locator('#sbStoreAll').click();
  await page.waitForTimeout(150);
  check('root:sb-no-insta-close', !(await fhidden('MaterialRack', '#sbConfirm')), 'sbStoreAll 豁免不秒关');
  const sbText = await fhtml('MaterialRack', '#sbText');
  check('root:sb-confirm-text', /背包现有 <b>7<\/b> 件（2 叠）/.test(sbText), '医疗剩量文案=7 件（2 叠）');
  await fesc('MaterialRack');
  check('root:sb-esc', await fhidden('MaterialRack', '#sbConfirm'), 'Esc 关 sbConfirm');
  await frameOf('MaterialRack').locator('#sbStoreAll').click();
  await frameOf('MaterialRack').locator('#sbGo').click();
  await page.waitForTimeout(100);
  const d2 = JSON.parse(await drain());
  check('root:sb-cmd-json', d2.length === 1 && d2[0].op === 'storeAll' && JSON.stringify(d2[0].order) === '[900101,900102,900103,900104]',
    'rack order=' + JSON.stringify(d2[0].order));
  const toast2 = await ftxt('MaterialRack', '#srToast');
  check('root:all-stay-toast', toast2 === '7 件无匹配柜或柜已满，留在背包', '零命中分支 toast=' + toast2);
  const bagIntact = await frameOf('MaterialRack').evaluate(() => document.querySelectorAll('#sbGrid .sr-slot[data-it]').length);
  check('root:bag-intact', bagIntact === 2, '背包原样 2 叠');

  /* 空背包（__HZ_MOCKSET__ 注入 + __HZ_PUSH__ 重推）→ sbToast 不弹窗 + sbGrid 空格网格 */
  await page.evaluate(() => {
    const j = JSON.parse(JSON.stringify(window.__HZ_MOCKSET__()));
    j.items.bag = [];
    window.__HZ_MOCKSET__(j);
    window.__HZ_PUSH__('MaterialRack');
  });
  await frameOf('MaterialRack').waitForFunction(() => document.querySelectorAll('#sbGrid .sr-slot[data-it]').length === 0, null, { timeout: 5000 });
  const sbEmpty = await frameOf('MaterialRack').evaluate(() => document.querySelectorAll('#sbGrid .sr-slot.empty').length);
  check('root:sb-empty-grid', sbEmpty === 50, 'sbGrid 容器空=50 空格');
  await frameOf('MaterialRack').locator('#sbStoreAll').click();
  await page.waitForTimeout(100);
  const sbEmptyToast = await ftxt('MaterialRack', '#sbToast');
  check('root:sb-empty-toast', sbEmptyToast === '背包是空的' && await fhidden('MaterialRack', '#sbConfirm'), 'sb 空背包 sbToast 不弹窗零命令');

  /* ---- ③ 回归：rack 切柜（本地渲染路）+ A→B→A 重访后入库弹窗仍活 ---- */
  await frameOf('MaterialRack').evaluate(() => document.querySelector('#srPinRow [data-ctn="900101"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await frameOf('MaterialRack').waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '食材柜', null, { timeout: 5000 });
  const swTitle = await ftxt('MaterialRack', '#srTitle');
  check('root:switch-local', swTitle === '食材柜', 'rack 切柜本地渲染 title=' + swTitle + '（无页签族 bail 路）');
  await showScene('BackpackUI');
  await frameOf('BackpackUI').waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 9000 });
  check('root:bagonly-visible', !(await fhidden('BackpackUI', '#srStoreAll')), 'BackpackUI bagonly 入库可见');
  await showScene('MaterialRack'); /* A→B→A 重访（rebindFrame 路） */
  await frameOf('MaterialRack').waitForFunction(() => !!document.getElementById('sbGrid'), null, { timeout: 9000 });
  /* 恢复非空背包（上一步空背包注入仍在基座）：重绑后的确认前置才有弹窗可开 */
  await page.evaluate(() => {
    const j = JSON.parse(JSON.stringify(window.__HZ_MOCKSET__()));
    j.items.bag = [[930, 4, 6, 3600, 0, 0, 1, 1, 0]];
    window.__HZ_MOCKSET__(j);
    window.__HZ_PUSH__('MaterialRack');
  });
  await frameOf('MaterialRack').waitForFunction(() => document.querySelectorAll('#sbGrid .sr-slot[data-it]').length === 1, null, { timeout: 5000 });
  await frameOf('MaterialRack').locator('#sbStoreAll').click();
  await page.waitForTimeout(120);
  const rebindPopup = !(await fhidden('MaterialRack', '#sbConfirm'));
  await fesc('MaterialRack');
  check('root:rebind-storeall-alive', rebindPopup, '重访重绑后 sbStoreAll→sbConfirm 仍活（T11×T9）');

  check('root:console-clean', consoleErrors.length === 0 && pageErrors.length === 0,
    'console errors=' + consoleErrors.length + ' pageErrors=' + pageErrors.length + (consoleErrors[0] ? ' | ' + consoleErrors[0] : '') + (pageErrors[0] ? ' | ' + pageErrors[0] : ''));

  await browser.close();
  const fails = results.filter((r) => !r.ok).length;
  console.log('---- root harness: ' + (results.length - fails) + '/' + results.length + ' PASS ----');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('DRIVER ERROR', e); process.exit(2); });
