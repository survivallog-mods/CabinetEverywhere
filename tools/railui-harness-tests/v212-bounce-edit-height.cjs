/* 2026-11-01 作者三连缺陷专项回归（v212）：
   #1 A/D 步进落到本页不可见柜（view/TABS 收窄裁掉）——v1.7.0 tagfilter 弹回的 rail 版：
      扣发原消息（页面零闪现）+ 按步进方向在官方数组序找最近可见柜伪造切换；回包到达即收敛。
      断言：D 步进跳过被藏柜 forge 到下个可见柜 / A 步进反向同理 / rail active 不落被藏柜 /
      伪造回包后 rail 跟随到弹回目标。
   #2 页签编辑误触移除：✎ 不再渲染、双击页签不开设置弹窗；▾ 菜单行双击=存活入口（设置仍可达）。
   #3 机器页显示高度 816→740（缩 2 格避让脚底拾取条）：Cooking 740 / MaterialRack(plainbag) 816 不变。 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');

const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

/* ctn：900101 食材柜(食物域标签101)/900106 蔬果柜(104)=food 视图可见；900102 冰箱 f 可见；
   900104 杂物柜无标签=food 视图**不可见**（步进落点）。官方数组序（注入后形状）：
   [冰箱, 食材柜, 杂物柜, 蔬果柜] → 从食材柜 D 步进落杂物柜(藏) 应弹到蔬果柜；
   从蔬果柜 A 步进落杂物柜(藏) 应弹回食材柜。 */
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

  /* forge 截获（v185 同款） */
  await page.evaluate(() => {
    window.__CAP = { forge: [] };
    const op = window.postMessage.bind(window);
    window.postMessage = function (m) { try { if (m && m.type === 'SWITCH_BAG') window.__CAP.forge.push(m); } catch (e) { } return op(m); };
  });
  const injectTabs = (key, owners) => page.evaluate(([k, os]) => {
    const el = document.getElementById(k);
    if (el && el.contentWindow) el.contentWindow.postMessage({
      type: 'WebUI_' + k + '_BagMsg',
      data: { bagTabsJson: JSON.stringify(os.map((o) => ({ ownerId: o }))) }
    }, '*');
  }, [key, owners]);
  /* 模拟官方 A/D 步进的轻量消息（只带 active，官方数组用缓存） */
  const stepActive = (key, owner) => page.evaluate(([k, o]) => {
    const el = document.getElementById(k);
    if (el && el.contentWindow) el.contentWindow.postMessage({
      type: 'WebUI_' + k + '_BagMsg',
      data: { bagOwnerId: o }
    }, '*');
  }, [key, owner]);
  const activeTab = (frame) => frame.evaluate(() => {
    const b = document.querySelector('#srPinRow [data-ctn].active');
    return b ? parseInt(b.getAttribute('data-ctn'), 10) : null;
  });

  /* ---- #1 弹回 ---- */
  await page.evaluate(() => window.__HZ_SHOW__('Cooking'));
  const cf = page.frames().find((f) => f.url().includes('/fixtures/Cooking.html'));
  await cf.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 15000 });
  await page.evaluate((x) => window.__CERAIL__.setData(x), CONTRACT(301));
  await page.waitForTimeout(900);
  await injectTabs('Cooking', [900102, 900101, 900104, 900106]); /* 注入后官方数组（含被藏杂物柜） */
  await page.waitForTimeout(300);
  await stepActive('Cooking', 900101); /* 先跟随到食材柜（可见，lastStepIdx=1） */
  await page.waitForTimeout(300);
  check('1a:follow-visible', (await activeTab(cf)) === 900101, `active=${await activeTab(cf)}（先正常跟随食材柜）`);

  await page.evaluate(() => { window.__CAP.forge.length = 0; });
  await stepActive('Cooking', 900104); /* D 步进 → 落被藏杂物柜 */
  await page.waitForTimeout(300);
  let forged = await page.evaluate(() => window.__CAP.forge);
  check('1b:bounce-D-skips-hidden', forged.length === 1 && forged[0].data && forged[0].data.ownerId === 900106,
    `forge=${JSON.stringify(forged.map((f) => f.data.ownerId))}（跳过杂物柜→蔬果柜）`);
  /* harness 模拟 Root case-8：forge 后 120ms 回包（带官方数组 FAKE_IDS——真实游戏同形：
     切换回包可携带页签数组并替换 TABS 缓存）。断言收敛终态=弹回目标，且**从未落被藏柜** */
  check('1c:never-on-hidden', (await activeTab(cf)) === 900106, `active=${await activeTab(cf)}（扣发+回包收敛到弹回目标，全程不落杂物柜）`);

  /* A 步进：从蔬果柜向左落杂物柜(藏) → 方向-1 → 弹回食材柜。
     前置：1b 的回包把 TABS 换成了 harness FAKE_IDS（无 900106，lastStepIdx 失锚）——
     先重注官方数组（=真实游戏 TabInjector Repush 同形）再重新锚定 900106（下标3） */
  await injectTabs('Cooking', [900102, 900101, 900104, 900106]);
  await page.waitForTimeout(300);
  await stepActive('Cooking', 900106); /* 重新锚定：lastStepIdx=3 */
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__CAP.forge.length = 0; });
  await stepActive('Cooking', 900104);
  await page.waitForTimeout(300);
  forged = await page.evaluate(() => window.__CAP.forge);
  check('1d:bounce-A-reverse', forged.length >= 1 && forged[0].data && forged[0].data.ownerId === 900101,
    `forge=${JSON.stringify(forged.map((f) => f.data.ownerId))}（反向弹回食材柜）`);

  /* 可见柜步进不被拦（正常跟随，无伪造） */
  await page.evaluate(() => { window.__CAP.forge.length = 0; });
  await stepActive('Cooking', 900102);
  await page.waitForTimeout(300);
  forged = await page.evaluate(() => window.__CAP.forge);
  check('1f:visible-no-bounce', forged.length === 0 && (await activeTab(cf)) === 900102,
    `forge=${forged.length} active=${await activeTab(cf)}（可见柜照常跟随零拦截）`);

  /* ---- #2 编辑误触移除 ---- */
  const editState = await cf.evaluate(() => ({
    pedit: !!document.querySelector('#srPinRow .p-edit'),
    editHidden: document.getElementById('srCtnEdit').hidden
  }));
  check('2a:no-pedit-icon', editState.pedit === false, `p-edit 存在=${editState.pedit}`);
  await cf.evaluate(() => {
    const b = document.querySelector('#srPinRow [data-ctn="900101"]');
    if (b) b.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  await page.waitForTimeout(250);
  const afterDbl = await cf.evaluate(() => document.getElementById('srCtnEdit').hidden);
  check('2b:tab-dblclick-no-edit', afterDbl === true, 'edit 弹窗 hidden=' + afterDbl + '（双击页签不再开设置）');
  /* ▾ 菜单行双击=存活入口 */
  await cf.evaluate(() => {
    document.getElementById('srAllCtn').click();
    const row = document.querySelector('#srCtnPopBody [data-ctn="900101"]');
    if (row) row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  await page.waitForTimeout(250);
  const menuDbl = await cf.evaluate(() => ({ open: !document.getElementById('srCtnEdit').hidden, name: document.getElementById('srEditName') ? document.getElementById('srEditName').value : '' }));
  check('2c:menu-dblclick-edits', menuDbl.open === true && menuDbl.name === '食材柜', `open=${menuDbl.open} name=${menuDbl.name}（▾ 行双击仍可达设置）`);
  await cf.evaluate(() => { document.getElementById('srEditCancel').click(); });

  /* ---- #3 高度 ---- */
  const h = await cf.evaluate(() => {
    const r = document.getElementById('srRail') || document.querySelector('.sr-rail');
    return r ? Math.round(r.offsetHeight) : 0;
  });
  check('3a:cooking-height-740', h === 740, `h=${h}（缩 2 格 38px）`);
  await page.evaluate(() => window.__HZ_SHOW__('MaterialRack'));
  const rf = page.frames().find((f) => f.url().includes('/fixtures/MaterialRack.html'));
  await rf.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const rh = await rf.evaluate(() => {
    const r = document.getElementById('srRail') || document.querySelector('.sr-rail');
    return r ? Math.round(r.offsetHeight) : 0;
  });
  check('3b:rack-height-816-kept', rh === 816, `h=${rh}（plainbag 不受影响）`);

  check('zero-console-errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
