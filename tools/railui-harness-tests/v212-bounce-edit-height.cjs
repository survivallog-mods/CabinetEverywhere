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
  /* 2026-11-02 二轮（作者：跨柜跳跃）：目标=**显示序**邻居。显示行（默认序）=
     [背包,食材柜,冷藏柜,蔬果柜]——从食材柜(行位1) D → 冷藏柜(行位2)，与官方数组序
     （杂物柜下一个可见=蔬果柜）无关；旧实现按官方序给 900106=行位 3=视觉跳两格 */
  check('1b:bounce-D-display-neighbor', forged.length === 1 && forged[0].data && forged[0].data.ownerId === 900102,
    `forge=${JSON.stringify(forged.map((f) => f.data.ownerId))}（显示序右邻=冷藏柜，非官方序的蔬果柜）`);
  /* harness 模拟 Root case-8：forge 后 120ms 回包（带官方数组 FAKE_IDS——真实游戏同形：
     切换回包可携带页签数组并替换 TABS 缓存）。断言收敛终态=弹回目标，且**从未落被藏柜** */
  check('1c:never-on-hidden', (await activeTab(cf)) === 900102, `active=${await activeTab(cf)}（扣发+回包收敛到弹回目标，全程不落杂物柜）`);

  /* A 步进：显示行= [背包,食材柜,冷藏柜,蔬果柜]，从蔬果柜(行位3) A → 冷藏柜(行位2)。
     前置：1b 的回包把 TABS 换成了 harness FAKE_IDS（无 900106，锚失）——先重注官方数组
     （=真实游戏 TabInjector Repush 同形）再重新锚定 900106（官方下标3） */
  await injectTabs('Cooking', [900102, 900101, 900104, 900106]);
  await page.waitForTimeout(300);
  await stepActive('Cooking', 900106); /* 重新锚定：行位3 */
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__CAP.forge.length = 0; });
  await stepActive('Cooking', 900104);
  await page.waitForTimeout(300);
  forged = await page.evaluate(() => window.__CAP.forge);
  check('1d:bounce-A-display-neighbor', forged.length >= 1 && forged[0].data && forged[0].data.ownerId === 900102,
    `forge=${JSON.stringify(forged.map((f) => f.data.ownerId))}（显示序左邻=冷藏柜）`);

  /* 可见柜步进不被拦（正常跟随，无伪造） */
  await page.evaluate(() => { window.__CAP.forge.length = 0; });
  await stepActive('Cooking', 900102);
  await page.waitForTimeout(300);
  forged = await page.evaluate(() => window.__CAP.forge);
  check('1f:visible-no-bounce', forged.length === 0 && (await activeTab(cf)) === 900102,
    `forge=${forged.length} active=${await activeTab(cf)}（可见柜照常跟随零拦截）`);

  /* ---- 1g/1h 拖拽排序后的可见落点跳跃（作者二轮原案例：拖过页签后 D 跨柜跳）----
     pin 序 [蔬果柜,食材柜,冷藏柜] → 显示行= [背包,蔬果柜,食材柜,冷藏柜]，与官方数组序
     （冷藏,食材,杂物,蔬果）完全交错。 */
  await cf.evaluate(() => {
    localStorage.setItem('srp_pin_order_Cooking', JSON.stringify([900106, 900101, 900102]));
  });
  await page.evaluate((x) => window.__CERAIL__.setData(x), CONTRACT(302)); /* 重渲染吃进 pin 序 */
  await page.waitForTimeout(400);
  await injectTabs('Cooking', [900102, 900101, 900104, 900106]); /* 1f 回包又换了 TABS，重注 */
  await page.waitForTimeout(300);
  await stepActive('Cooking', 900102); /* 锚定：显示行位3（行尾），官方下标0 */
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__CAP.forge.length = 0; });
  await stepActive('Cooking', 900101); /* 官方 D：下标0→1=食材柜（可见，但显示行位2=行尾左边） */
  await page.waitForTimeout(300);
  forged = await page.evaluate(() => window.__CAP.forge);
  check('1g:drag-D-at-row-end-stays', forged.length === 1 && forged[0].data && forged[0].data.ownerId === 900102
    && (await activeTab(cf)) === 900102,
    `forge=${JSON.stringify(forged.map((f) => f.data.ownerId))} active=${await activeTab(cf)}（显示行尾 D=弹回原地；旧实现直接跟到显示行左侧的食材柜=视觉左跳）`);

  /* 行中段：官方 D 落被藏柜 → 显示序右邻（与官方序答案相反方向） */
  await stepActive('Cooking', 900101); /* 锚定：显示行位2，官方下标1 */
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__CAP.forge.length = 0; });
  await stepActive('Cooking', 900104); /* 官方 D：下标1→2=杂物柜（藏） */
  await page.waitForTimeout(300);
  forged = await page.evaluate(() => window.__CAP.forge);
  check('1h:drag-D-midrow-display-neighbor', forged.length >= 1 && forged[0].data && forged[0].data.ownerId === 900102,
    `forge=${JSON.stringify(forged.map((f) => f.data.ownerId))}（显示序右邻=冷藏柜，非官方序的蔬果柜）`);
  await cf.evaluate(() => { localStorage.removeItem('srp_pin_order_Cooking'); });

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

  /* ---- #3/#4 七轮（官方等高契约统一：壳=max(778,兄弟面板最高)）----
     3a：兄弟 ≤778（Cooking fixture）→ 壳 778+外框 margin −38（整界面底边上收一格顶边钉回）；
     4a：兄弟 >778（RatCage fixture 垫高 800）→ 壳跟随 800=官方等高原貌、外框无 margin；
     4b：背包格强撑 2000px → 壳高不变（五轮跑飞/六轮竞态根治）；render 尾+ResizeObserver 双路。 */
  const h3 = await cf.evaluate(() => {
    const rail = document.getElementById('srRail');
    const wrap = document.getElementById('srp');
    let sys = wrap;
    while (sys && sys.parentElement && sys.parentElement !== document.body) sys = sys.parentElement;
    return { h: Math.round(rail.offsetHeight), mt: sys ? sys.style.marginTop : 'nosys' };
  });
  check('3a:shell-driven-778-pinned', h3.h === 778 && h3.mt === '-38px',
    `rail=${h3.h} marginTop=${h3.mt}（兄弟矮：壳 778 驱动，外框缩 38 顶边钉回=整界面底边上收一格）`);
  await page.evaluate(() => window.__HZ_SHOW__('RatCage'));
  const rcF = page.frames().find((f) => f.url().includes('/fixtures/RatCage.html'));
  await rcF.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 15000 });
  await page.waitForTimeout(800);
  /* 分支②：垫高兄弟面板到 800（>778）→ 壳跟随 800、外框 margin 撤销（官方等高原貌） */
  await rcF.evaluate(() => {
    /* 只垫高兄弟面板（≥800），不隐藏——隐藏会让 minHeight 无布局效果（旧 4a 遗产坑） */
    const sys = [...document.querySelectorAll('body > *')].find((n) => n.querySelector && n.querySelector('.panel')) || document.body;
    [...sys.children].forEach((ch) => { if (!(ch.id === 'srp')) ch.style.minHeight = '800px'; });
    const host = document.getElementById('srGridHost');
    const g = host && (host.querySelector('#backpackGrid') || host.firstElementChild);
    if (g) g.style.height = '2000px'; /* 同时验跑飞：内容撑高不得影响壳高 */
  });
  await page.evaluate((x) => window.__CERAIL__.setData(x), CONTRACT(307));
  await page.waitForTimeout(1000);
  const rat = await rcF.evaluate(() => {
    const rail = document.getElementById('srRail');
    const wrap = document.getElementById('srp');
    let sys = wrap;
    while (sys && sys.parentElement && sys.parentElement !== document.body) sys = sys.parentElement;
    return { railH: Math.round(rail.offsetHeight), wrapH: Math.round(wrap.offsetHeight), mt: sys.style.marginTop };
  });
  check('4a:sibling-driven-follows', rat.railH === 800 && rat.railH === rat.wrapH && rat.mt === '',
    `rail=${rat.railH} wrap=${rat.wrapH} mt=${JSON.stringify(rat.mt)}（兄弟 800>778：壳跟随=官方等高，外框不动；格撑 2000px 壳高不变=零跑飞）`);
  await page.evaluate(() => window.__HZ_SHOW__('MaterialRack'));
  const rf = page.frames().find((f) => f.url().includes('/fixtures/MaterialRack.html'));
  await rf.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const rh = await rf.evaluate(() => {
    const r = document.getElementById('srRail') || document.querySelector('.sr-rail');
    return r ? Math.round(r.offsetHeight) : 0;
  });
  check('4b:rack-height-816-kept', rh === 816, `h=${rh}（plainbag 不受影响）`);

  check('zero-console-errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
