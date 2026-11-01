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
  /* ---- 1i 仅 rail 侧容器（作者 2026-11-02 案例：大容量冰柜——我们目录是冰箱 kind f，
     但游戏 CollectFridges 没收、注入器只注入 c 类 → **不在官方数组** → pi=-1。
     官方锚缺失仍须按步进对齐显示序（方向用显示位差推断）。
     布景：回包数组（harness FAKE）不含 900106；pin 序 [蔬果,食材,冷藏] → 显示行
     [背包,蔬果,食材,冷藏]；当前=蔬果(行位1)，D 落冷藏(行位3,可见,跳过行位2)。
     期望=伪造到显示序右邻 食材柜(900101)；旧逻辑 pi=-1 判非步进 → 直放冷藏=跨格跳。
     锚定走真实路径=点页签（switchTo 先记 currentId，回包 v==currentId 走 echo 早退，
     外部消息锚定会被新规则拦截——现实里上到这种柜子正是靠点页签）。 */
  await cf.evaluate(() => { const b = document.querySelector('#srPinRow [data-ctn="900106"]'); if (b) b.click(); });
  await page.waitForTimeout(400); /* forge→harness 120ms 回包→followActive 渲染 */
  check('1i-anchor:on-rail-only', (await activeTab(cf)) === 900106, `active=${await activeTab(cf)}（点页签上到仅 rail 侧容器）`);
  await page.evaluate(() => { window.__CAP.forge.length = 0; });
  await stepActive('Cooking', 900102); /* D 落冷藏柜（行位3，跳过行位2） */
  await page.waitForTimeout(300);
  forged = await page.evaluate(() => window.__CAP.forge);
  check('1i:rail-only-ctn-aligns-display', forged.length >= 1 && forged[0].data && forged[0].data.ownerId === 900101,
    `forge=${JSON.stringify(forged.map((f) => f.data.ownerId))}（官方锚缺失按显示序右邻=食材柜；旧逻辑直放冷藏=跳格）`);
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

  /* ---- #3 高度（三轮：自适应封顶）----
     3a 短容器：壳随格收（无「格区下面一大截空白」）；3c 长容器：封顶 740+系统提升。 */
  const h3 = await cf.evaluate(() => {
    const r = document.getElementById('srRail') || document.querySelector('.sr-rail');
    const host = document.getElementById('srGridHost');
    const body = document.getElementById('srBody');
    return {
      h: r ? Math.round(r.offsetHeight) : 0,
      blank: host && body ? Math.round(body.getBoundingClientRect().bottom - host.getBoundingClientRect().bottom) : 999
    };
  });
  check('3a:auto-fit-no-blank', h3.h < 740 && h3.h > 300 && h3.blank <= 8, `h=${h3.h} blank=${h3.blank}（壳随格收，格底贴壳底）`);
  await cf.evaluate(() => {
    const g = document.getElementById('srGridHost').querySelector('#backpackGrid') || document.getElementById('srGridHost').firstElementChild;
    if (g) g.style.height = '2000px';
  });
  await page.evaluate((x) => window.__CERAIL__.setData(x), CONTRACT(305));
  await page.waitForTimeout(1200);
  const h3c = await cf.evaluate(() => {
    const r = document.getElementById('srRail');
    let sys = document.getElementById('srp');
    while (sys && sys.parentElement && sys.parentElement !== document.body) sys = sys.parentElement;
    return { h: Math.round(r.offsetHeight), lift: sys.style.transform };
  });
  check('3c:capped-740-plus-lift', h3c.h === 740 && h3c.lift === 'translateY(-38px)', `h=${h3c.h} lift=${h3c.lift}（长容器封顶滚动+系统提 38 复位顶边）`);
  await page.evaluate(() => window.__HZ_SHOW__('MaterialRack'));
  const rf = page.frames().find((f) => f.url().includes('/fixtures/MaterialRack.html'));
  await rf.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const rh = await rf.evaluate(() => {
    const r = document.getElementById('srRail') || document.querySelector('.sr-rail');
    return r ? Math.round(r.offsetHeight) : 0;
  });
  check('3b:rack-height-816-kept', rh === 816, `h=${rh}（plainbag 不受影响）`);

  /* ---- #4 二轮+三轮：封顶提升分治----
     4a：RatCage 藏兄弟+格撑高（壳封顶 740 且最高）→ 系统提 translateY(-38px)；
     4b：BrewPanel 兄弟垫高 800（系统由兄弟驱动，顶没动）→ 不提。 */
  await page.evaluate(() => {
    const el = document.getElementById('RatCage');
    const doc = el && el.contentDocument;
    if (doc) {
      [...doc.querySelectorAll('.cooking-system > *, body > *')].forEach((n) => {
        if (n.id === 'RatCage' || n.tagName === 'SCRIPT' || n.tagName === 'STYLE') return;
        if (n.querySelector && (n.querySelector('#bagTabs') || n.id === 'cookingSystem' || n.querySelector('#cookingSystem'))) return;
        if (n.closest && n.closest('#cookingSystem')) return;
        n.style.display = 'none';
      });
      const g = doc.querySelector('#backpackGrid');
      if (g) g.style.height = '2000px'; /* 壳封顶（mount reparent 同一元素，样式带过去） */
    }
  });
  await page.evaluate(() => window.__HZ_SHOW__('RatCage'));
  const rcF = page.frames().find((f) => f.url().includes('/fixtures/RatCage.html'));
  await rcF.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 15000 });
  await page.waitForTimeout(1300); /* 提升走 render 尾+500ms 巡检双路 */
  const liftA = await rcF.evaluate(() => {
    let sys = document.getElementById('srp');
    while (sys && sys.parentElement && sys.parentElement !== document.body) sys = sys.parentElement;
    return sys ? sys.style.transform : 'NO-SYS';
  });
  check('4a:lift-when-tallest', liftA === 'translateY(-38px)', `sys.transform=${liftA}（壳封顶且最高=居中被压短 → 提 38 复位顶边）`);

  /* 4b 对照：强制兄弟面板更高（min-height 800）→ 壳非最高=系统高度由兄弟驱动（顶没动过）
     → 不提。fixture 静态内容里 Brew 兄弟列本就矮于 740，须人为垫高才构成对照。 */
  await page.evaluate(() => {
    const el = document.getElementById('BrewPanel');
    const doc = el && el.contentDocument;
    if (doc) {
      const host = doc.querySelector('#bagTabs');
      const col = host ? host.closest('.col') : null;
      const sys = col ? col.parentElement : doc.body.firstElementChild;
      if (sys) [...sys.children].forEach((ch) => { if (!(ch.querySelector && ch.querySelector('#bagTabs'))) ch.style.minHeight = '800px'; });
    }
  });
  await page.evaluate(() => window.__HZ_SHOW__('BrewPanel'));
  const bwF = page.frames().find((f) => f.url().includes('/fixtures/BrewPanel.html'));
  await bwF.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const liftB = await bwF.evaluate(() => {
    let sys = document.getElementById('srp');
    while (sys && sys.parentElement && sys.parentElement !== document.body) sys = sys.parentElement;
    return sys ? sys.style.transform : 'NO-SYS';
  });
  check('4b:no-lift-when-sibling-taller', liftB === '', `sys.transform=${JSON.stringify(liftB)}（壳非最高=系统没动 → 不提）`);

  check('zero-console-errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
