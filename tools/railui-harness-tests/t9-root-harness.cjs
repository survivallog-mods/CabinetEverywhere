/* T9 root harness 断言（Playwright，serve.cjs 起停由外层驱动）。
   覆盖 task-9 四项断言：
   ① rail 点柜 → 帧内发出的 forge 事件负载逐族对附录 A（bag=数字/trade=字符串/
      tt=下标+2/cart=下标含 pin/cart0=下标无 pin）；
   ② 模拟回包 active=Y → rail title/物品区切到 Y（含官方主动推送=A/D 跟随、
      tt 族 bagOwnerId 非 active 红线、rack 特例与背包守卫、位置族缓存未到 bail 兜底）；
   ③ A→B→A 重访修复（T8 遗留：重绑后本帧 rail 响应 setData 正确重渲染、他帧不被
      污染、筛选态随帧走）；
   ④ 包装链：预包装（__SLTF__ 同位模拟）与 rail wrapRelay 串联双方都收到消息。 */
const { chromium } = require("playwright");

const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource|net::ERR_/.test(t)) return;
    consoleErrors.push(t);
  });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HZ_CURRENT__ !== undefined && window.__HZ_CURRENT__() !== null, null, { timeout: 20000 });

  function frameOf(key) {
    return page.frames().find((f) => f.url().includes('/fixtures/' + key + '.html'));
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
  async function title(key) {
    return (await frameOf(key).evaluate(() => (document.getElementById('srTitle') || {}).textContent || '')) || '';
  }
  async function waitTitle(key, want, timeout = 8000) {
    const f = frameOf(key);
    await f.waitForFunction((w) => (document.getElementById('srTitle') || {}).textContent === w, want, { timeout });
  }
  async function railState() {
    return page.evaluate(() => {
      const s = window.__CERAIL__.state;
      return { scene: s.scene, currentId: s.currentId, query: s.query, global: s.global };
    });
  }
  /* forge 捕获：记录基线 → 执行动作 → 等新 forge → 返回新增事件 */
  async function forgeAfter(thunk, want = 1) {
    const n0 = await page.evaluate(() => window.__HZ_FORGES__().length);
    await thunk();
    await page.waitForFunction((n) => window.__HZ_FORGES__().length >= n + 1, n0, { timeout: 5000 }).catch(() => { });
    return page.evaluate((n) => window.__HZ_FORGES__().slice(n), n0);
  }
  const clickPin = (key, id) => page.evaluate(([k, i]) => {
    const d = document.getElementById(k).contentDocument;
    d.querySelector('#srPinRow [data-ctn="' + i + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, [key, id]);

  /* 各族假页签（与 harness 消息模拟层同一套；回包经 __HZ_POST__/sim 自动） */
  const fakeTabs = {
    bag: [{ ownerId: 900001, name: '背包' }, { ownerId: 900101, name: '食材柜' }, { ownerId: 900102, name: '冷藏柜' }, { ownerId: 900103, name: '材料架' }, { ownerId: 900104, name: '杂物柜' }],
    tt: [{ ownerId: 900101, name: '食材柜' }, { ownerId: 900102, name: '冷藏柜' }, { ownerId: 900103, name: '材料架' }, { ownerId: 900104, name: '杂物柜' }],
    trade: [{ owner: '900001', name: '背包' }, { owner: '900101', name: '食材柜' }, { owner: '900102', name: '冷藏柜' }, { owner: '900103', name: '材料架' }, { owner: '900104', name: '杂物柜' }],
    cart: [{ ownerId: 900001, name: '背包' }, { ownerId: 900101, name: '食材柜' }, { ownerId: 900102, name: '冷藏柜' }, { ownerId: 900103, name: '材料架' }, { ownerId: 900104, name: '杂物柜' }],
    cart0: [{ ownerId: 900101, name: '食材柜' }, { ownerId: 900102, name: '冷藏柜' }, { ownerId: 900103, name: '材料架' }, { ownerId: 900104, name: '杂物柜' }]
  };
  const post = (key, msg) => page.evaluate(([k, m]) => window.__HZ_POST__(k, m), [key, msg]);

  /* ---- 准备：Cooking 已由 boot show；投首包 BagMsg（rail 页签缓存 + 官方 handler 消费） ---- */
  await waitRail('Cooking');
  await post('Cooking', { type: 'WebUI_Cooking_BagMsg', data: { bagTabs: fakeTabs.bag, bagOwnerId: 900001, bagItems: [], workbenchItems: [] } });
  await page.waitForTimeout(80);

  /* ④a 包装链（预包装先在）：回包经 rail wrapRelay → 预包装 → 原生，双方都见到 */
  await post('Cooking', { type: 'WebUI_Cooking_BagMsg', data: { bagTabs: fakeTabs.bag, bagOwnerId: 900001, bagItems: [], workbenchItems: [], workbenchName: 'PROBE-CHAIN' } });
  await page.waitForTimeout(120);
  {
    const pre = await page.evaluate(() => window.__HZ_PRESEEN__);
    check('chain:prewrap-saw-reply', pre.indexOf('WebUI_Cooking_BagMsg') >= 0, 'PRESEEN=' + JSON.stringify(pre.slice(-3)) + '（预包装=__SLTF__ 同位先在，回包穿过）');
    const probe = await frameOf('Cooking').evaluate(() => {
      try { return window.eval('State.workbenchName'); } catch (e) { return 'eval-fail:' + e.message; }
    });
    check('chain:official-consumed', probe === 'PROBE-CHAIN', '官方 fixture State.workbenchName=' + probe + '（链尾原生送达=官方页面照常消费）');
  }

  /* ①+② bag 族：点柜 → SWITCH_BAG{ownerId:数字}；回包 → rail 切到该柜（等回包确认才渲染） */
  {
    const before = await title('Cooking');
    const forges = await forgeAfter(() => clickPin('Cooking', 900102));
    const f = forges.find((x) => x.sourcePageId === 'Cooking');
    check('forge:bag-payload', !!f && f.type === 'SWITCH_BAG' && typeof f.data.ownerId === 'number' && f.data.ownerId === 900102,
      JSON.stringify(forges) + '（附录 A bag 签名：SWITCH_BAG{ownerId:数字}）');
    check('render:no-optimistic', (await title('Cooking')) === before && before === '背包',
      'forge 已发、回包未到：title 仍=' + (await title('Cooking')) + '（不乐观渲染）');
    await waitTitle('Cooking', '冷藏柜');
    check('follow:bag-echo', (await title('Cooking')) === '冷藏柜' && (await railState()).currentId === 900102,
      '回包 active=900102 → title=冷藏柜 currentId=' + (await railState()).currentId);
    /* 官方主动推送（=A/D 步进的 BagMsg）：rail 跟随 */
    await post('Cooking', { type: 'WebUI_Cooking_BagMsg', data: { bagTabs: fakeTabs.bag, bagOwnerId: 900104, bagItems: [], workbenchItems: [] } });
    await waitTitle('Cooking', '杂物柜');
    check('follow:official-ad', (await title('Cooking')) === '杂物柜' && (await railState()).currentId === 900104,
      '官方推 active=900104 → title=杂物柜 currentId=' + (await railState()).currentId);
  }

  /* A2 筛选态（供 ③ 重访断言）：搜索 '烤肉' → 900104（空柜）网格 30 格全空 */
  await frameOf('Cooking').evaluate(() => {
    const inp = document.getElementById('srSearch');
    inp.value = '烤肉';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(80);
  {
    const cells = await frameOf('Cooking').evaluate(() => document.querySelectorAll('#srGrid .sr-slot').length);
    check('filter:query-set', (await railState()).query === '烤肉' && cells === 30, 'query=烤肉 cells=' + cells + '（cap18→3 行；筛选态入活跃集）');
  }

  /* ①+② tt 族：cabinetTabs+activeLeftTab；红字规则——BagMsg 另带 bagOwnerId=背包非 active */
  await page.evaluate(() => window.__HZ_SHOW__('ToolTable'));
  await waitRail('ToolTable');
  await post('ToolTable', { type: 'WebUI_ToolTable_BagMsg', data: { cabinetTabs: fakeTabs.tt, activeLeftTab: 2, bagOwnerId: 900001, workbenchItems: [], drawerOwnerId: 0, workbenchOwnerId: 0 } });
  await waitTitle('ToolTable', '食材柜');
  check('follow:tt-active-not-bagowner', (await title('ToolTable')) === '食材柜' && (await railState()).currentId === 900101,
    'activeLeftTab=2（附 bagOwnerId=900001 干扰项）→ 跟到 cabinetTabs[0]=900101，title=食材柜（bagOwnerId 非 active 红线）');
  {
    const forges = await forgeAfter(() => clickPin('ToolTable', 900103));
    const f = forges.find((x) => x.sourcePageId === 'ToolTable');
    check('forge:tt-payload', !!f && f.type === 'TAB_SWITCH' && f.data.tab === 4 && Number.isInteger(f.data.tab),
      JSON.stringify(forges) + '（附录 A tt 签名：TAB_SWITCH{tab:j+2}，j=cabinetTabs 下标 2）');
    await waitTitle('ToolTable', '材料架');
    check('follow:tt-echo', (await title('ToolTable')) === '材料架', '回包 activeLeftTab=4 → title=材料架');
  }

  /* ①b tt 族 edge 落点（T9 评审 Important 修复）：背包首位不在 cabinetTabs 数组内
     （0=背包/1=抽屉在栏外，offset 0）——显式 TAB_SWITCH{tab:0}（tagfilter isEdge
     pin→tab:0 分支照抄），不依赖数组 indexOf；回包 activeLeftTab:0 → rail 跟随背包 */
  {
    const forges = await forgeAfter(() => clickPin('ToolTable', 900001));
    const f = forges.find((x) => x.sourcePageId === 'ToolTable');
    check('forge:tt-edge-bag', !!f && f.type === 'TAB_SWITCH' && f.data.tab === 0,
      JSON.stringify(forges) + '（edge 显式分支 pin→tab:0，修复前=indexOf 失败 bail 被下一包拽回）');
    await waitTitle('ToolTable', '背包');
    check('follow:tt-edge-bag-echo', (await title('ToolTable')) === '背包' && (await railState()).currentId === 900001,
      '回包 activeLeftTab:0 → title=背包 currentId=' + (await railState()).currentId);
  }

  /* ①+② trade 族：SWITCH_BAG{ownerId:字符串} */
  await page.evaluate(() => window.__HZ_SHOW__('Trade'));
  await waitRail('Trade');
  await post('Trade', { type: 'WebUI_Trade_BagMsg', data: { bagTabsJson: JSON.stringify(fakeTabs.trade), bagOwnerKey: '900001', bagCols: 10, bagRows: 6 } });
  await page.waitForTimeout(80);
  {
    const forges = await forgeAfter(() => clickPin('Trade', 900102));
    const f = forges.find((x) => x.sourcePageId === 'Trade');
    check('forge:trade-payload', !!f && f.type === 'SWITCH_BAG' && typeof f.data.ownerId === 'string' && f.data.ownerId === '900102',
      JSON.stringify(forges) + '（附录 A trade 签名：SWITCH_BAG{ownerId:String}）');
    await waitTitle('Trade', '冷藏柜');
    check('follow:trade-echo', (await title('Trade')) === '冷藏柜' && (await railState()).currentId === 900102,
      '回包 bagOwnerKey=900102 → title=冷藏柜');
  }

  /* ①+② cart 族（pin 占 0）：TAB_SWITCH{tab:含 pin 下标} */
  await page.evaluate(() => window.__HZ_SHOW__('Shredder'));
  await waitRail('Shredder');
  await post('Shredder', { type: 'WebUI_Shredder_BagMsg', data: { cartTabs: fakeTabs.cart, activeTab: 0, cartItems: [], hopperItems: [], trayItems: [] } });
  await page.waitForTimeout(80);
  {
    check('follow:cart-pin0-is-bag', (await title('Shredder')) === '背包', 'activeTab=0（pin 背包）→ title=背包');
    const forges = await forgeAfter(() => clickPin('Shredder', 900103));
    const f = forges.find((x) => x.sourcePageId === 'Shredder');
    check('forge:cart-payload', !!f && f.type === 'TAB_SWITCH' && f.data.tab === 3,
      JSON.stringify(forges) + '（附录 A cart 签名：TAB_SWITCH{tab:j}，j 含 pin 占位=3）');
    await waitTitle('Shredder', '材料架');
    check('follow:cart-echo', (await title('Shredder')) === '材料架', '回包 activeTab=3 → title=材料架');
  }

  /* ①+② cart0 族（无 pin）：TAB_SWITCH{tab:下标} */
  await page.evaluate(() => window.__HZ_SHOW__('Compressor'));
  await waitRail('Compressor');
  await post('Compressor', { type: 'WebUI_Compressor_BagMsg', data: { cartTabs: fakeTabs.cart0, activeTab: 0, cartItems: [] } });
  await page.waitForTimeout(80);
  {
    check('follow:cart0-first', (await title('Compressor')) === '食材柜', 'activeTab=0（无 pin，首柜）→ title=食材柜');
    const forges = await forgeAfter(() => clickPin('Compressor', 900102));
    const f = forges.find((x) => x.sourcePageId === 'Compressor');
    check('forge:cart0-payload', !!f && f.type === 'TAB_SWITCH' && f.data.tab === 1,
      JSON.stringify(forges) + '（附录 A cart0 签名：TAB_SWITCH{tab:j}，j=1）');
    await waitTitle('Compressor', '冷藏柜');
    check('follow:cart0-echo', (await title('Compressor')) === '冷藏柜', '回包 activeTab=1 → title=冷藏柜');
  }

  /* ② rack 特例：bagOwnerId 跟随 + 玩家背包守卫（rack 场景无背包页签） */
  await page.evaluate(() => window.__HZ_SHOW__('MaterialRack'));
  await waitRail('MaterialRack');
  await post('MaterialRack', { type: 'WebUI_MaterialRack_BagMsg', data: { bagOwnerId: 900103, rackOwnerId: 900103, bagItems: [] } });
  await waitTitle('MaterialRack', '材料架');
  check('follow:rack-shelf', (await title('MaterialRack')) === '材料架', '架子切换推 bagOwnerId=900103 → title=材料架');
  await post('MaterialRack', { type: 'WebUI_MaterialRack_BagMsg', data: { bagOwnerId: 900001, bagItems: [] } });
  await page.waitForTimeout(200);
  check('follow:rack-bag-guard', (await title('MaterialRack')) === '材料架',
    'bagOwnerId=900001（玩家背包）不跟：title 仍=材料架（rack 场景 railCtns 无背包页签）');

  /* ② 位置族缓存未到 → bail 不伪造 + 本地兜底渲染（宁可不切也不错切） */
  {
    const n0 = await page.evaluate(() => window.__HZ_FORGES__().length);
    await page.evaluate(() => window.__HZ_SHOW__('GreenhouseBuild'));
    await waitRail('GreenhouseBuild');
    await clickPin('GreenhouseBuild', 900102);
    await page.waitForTimeout(150);
    const n1 = await page.evaluate(() => window.__HZ_FORGES__().length);
    check('forge:bail-no-cache', n1 === n0 && (await title('GreenhouseBuild')) === '冷藏柜',
      'TABS 空缓存：forge 0 条（基线 ' + n0 + ' → 现 ' + n1 + '），title=冷藏柜（本地数据仍为真，直接渲染）');
    /* 缓存随后到：回包后 forge 恢复官方链 */
    await post('GreenhouseBuild', { type: 'WebUI_GreenhouseBuild_BagMsg', data: { cartTabs: fakeTabs.cart, activeTab: 0, cartItems: [] } });
    await page.waitForTimeout(80);
    const forges = await forgeAfter(() => clickPin('GreenhouseBuild', 900102));
    const f = forges.find((x) => x.sourcePageId === 'GreenhouseBuild');
    check('forge:cart-after-cache', !!f && f.type === 'TAB_SWITCH' && f.data.tab === 2,
      JSON.stringify(forges) + '（缓存到齐后 cart 族 forge 恢复）');
  }

  /* ③ A→B→A 重访修复（T8 遗留缺陷实锤区）：快照恢复 + 他帧不被污染 + setData 落本帧 */
  {
    await page.evaluate(() => window.__HZ_SHOW__('Trade'));
    await waitRail('Trade');
    await waitTitle('Trade', '冷藏柜'); /* rebind：Trade 快照 currentId=900102 回来 */
    const tradeBack = await frameOf('Trade').evaluate(() => ({
      t: (document.getElementById('srTitle') || {}).textContent,
      q: (document.getElementById('srSearch') || {}).value,
      rail: !!(document.getElementById('srRail') && document.getElementById('srRail').isConnected)
    }));
    const cookingUntouched = await title('Cooking');
    check('rebind:trade-restored', tradeBack.rail && tradeBack.t === '冷藏柜' && tradeBack.q === '' && cookingUntouched === '杂物柜',
      `Trade 重访 title=${tradeBack.t} search='${tradeBack.q}'（快照恢复）；Cooking 隐藏帧未被波及 title=${cookingUntouched}`);

    await page.evaluate(() => window.__HZ_SHOW__('Cooking'));
    await waitRail('Cooking');
    await waitTitle('Cooking', '杂物柜'); /* rebind：Cooking 快照 currentId=900104 回来 */
    const cookBack = await frameOf('Cooking').evaluate(() => ({
      t: (document.getElementById('srTitle') || {}).textContent,
      q: (document.getElementById('srSearch') || {}).value,
      cells: document.querySelectorAll('#srGrid .sr-slot').length,
      rev: 0
    }));
    const tradeNow = await title('Trade');
    check('rebind:cooking-restored', cookBack.t === '杂物柜' && cookBack.q === '烤肉' && cookBack.cells === 30 && tradeNow === '冷藏柜',
      `Cooking 重访 title=${cookBack.t} search='${cookBack.q}' cells=${cookBack.cells}（cap18→30 格=按恢复的 currentId 重渲染）；Trade 未被 Cooking 的 setData 污染 title=${tradeNow}`);

    /* setData(A) 显式再推一包：本帧 rail 必须响应（T8 缺陷=渲染进错误 rail/冻结） */
    const rev0 = await page.evaluate(() => window.__HZ_REVCOUNT__());
    await page.evaluate(() => window.__HZ_PUSH__('Cooking'));
    await page.waitForFunction((r) => window.__HZ_REVCOUNT__() > r, rev0, { timeout: 3000 });
    await page.waitForTimeout(60);
    const afterPush = await frameOf('Cooking').evaluate(() => ({
      t: (document.getElementById('srTitle') || {}).textContent,
      cells: document.querySelectorAll('#srGrid .sr-slot').length
    }));
    check('rebind:setdata-lands-here', afterPush.t === '杂物柜' && afterPush.cells === 30,
      `pushCtx(Cooking) rev ${rev0}→${await page.evaluate(() => window.__HZ_REVCOUNT__())} 后 title=${afterPush.t} cells=${afterPush.cells}（A 帧 rail 响应 setData）`);

    /* B→A→B 对称 */
    await page.evaluate(() => window.__HZ_SHOW__('Trade'));
    await waitRail('Trade');
    await waitTitle('Trade', '冷藏柜');
    const tradeAgain = await title('Trade');
    await page.evaluate(() => window.__HZ_SHOW__('Cooking'));
    await waitTitle('Cooking', '杂物柜');
    const cookAgain = await title('Cooking');
    check('rebind:roundtrip-stable', tradeAgain === '冷藏柜' && cookAgain === '杂物柜',
      `Trade→Cooking→Trade→Cooking 终态：Trade=${tradeAgain} Cooking=${cookAgain}（重访态稳定不漂移）`);
  }

  /* ⑥ 控制台零报错 + 页面异常零 */
  await page.waitForTimeout(500);
  check('console:zero-errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' || ') || '0 错误');
  check('pageerror:zero', pageErrors.length === 0, pageErrors.slice(0, 5).join(' || ') || '0 异常');

  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log('\n==== T9 SUMMARY: ' + (results.length - fails.length) + '/' + results.length + ' PASS ====');
  if (fails.length) { fails.forEach((f) => console.log('FAIL: ' + f.name + ' | ' + f.detail)); process.exit(1); }
})().catch((e) => { console.error("FATAL", e); process.exit(2); });
