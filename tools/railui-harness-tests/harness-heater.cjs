/* heater bagtabs（暖炉移植批 2026-11-07=bagtabs 族第二页）root harness 断言
   （Playwright，serve.cjs 须已在 8180）。燃油发电机 harness-fuelgen.cjs 的暖炉孪生：
   同一 ensureBagtabs 装配路径、页差异全走 JS BAGTABS 描述符（宿主选择器 .heater-system/
   .heater-panel、cfg 门 heaterOn、满员文案「炉膛已满」）——本孪生即「描述符驱动」的回归床：
   断言集与 fuelgen 逐路对齐（①页签 ②官方数据切换 ③整理 ④A/D ⑤官方交互+feed ⑥满员
   ⑦feedFail ⑧宽高锁+滚动视窗(v1.8.14 包装层口径)+滚动态拖拽落点 ⑨无燃料柜拆除 ⑩cfg 开关
   ⑪console-clean），另加⑫暖炉特有：炉体右面板零改动+fuelCap 官方读数随 feed 更新。
   mock 侧：switchBag/feed/官方节律按 current 页分流（HTVIEW 独立官方状态）。 */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/temp/baidu_up/node_modules/playwright-core')); } /* 环境漂移兜底（harness-tidy 同款） */

const BASE = 'http://127.0.0.1:8180';
const EXEC = 'C:/Users/wangk/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' : '') + (detail || ''));
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXEC });
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HZ_CURRENT__ !== undefined && window.__HZ_CURRENT__() !== null, null, { timeout: 20000 });

  function frameOf(key) { return page.frames().find((f) => f.url().includes('/fixtures/' + key + '.html')); }
  const F = () => frameOf('Heater');
  async function waitHt(timeout = 12000) {
    await F().waitForFunction(() => document.getElementById('srfgTabs'), null, { timeout });
  }
  const ftxt = (sel) => F().evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel);
  const fhas = (sel) => F().evaluate((s) => !!document.querySelector(s), sel);
  const fdisp = (sel) => F().evaluate((s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).display : 'missing'; }, sel);
  const drain = () => page.evaluate(() => window.__CERAIL__.drain());
  const push = () => page.evaluate(() => window.__HZ_PUSH__('Heater'));
  const activeTab = () => F().evaluate(() => { const a = document.querySelector('#srfgTabs .srfg-tab.active'); return a ? a.getAttribute('data-id') : null; });
  const tabIds = () => F().evaluate(() => Array.prototype.map.call(document.querySelectorAll('#srfgTabs .srfg-tab'), (t) => t.getAttribute('data-id')).join(','));
  const panelW = () => F().evaluate(() => { const p = document.querySelector('.heater-system > .panel:not(.heater-panel)'); return p ? p.offsetWidth : -1; });

  /* ---- 场景切换：Heater ---- */
  await page.getByRole('button', { name: 'Heater', exact: true }).click();
  await waitHt();

  /* ---- ① tabs-render ---- */
  check('ht:tabs-render-list', (await tabIds()) === 'bag,900105,900106', 'tabs=' + (await tabIds()) + '（900104 杂物柜无 1013 不进）');
  check('ht:tabs-render-title-hidden', (await fdisp('#bagPanelTitle')) === 'none', '官方标题隐藏 display=' + (await fdisp('#bagPanelTitle')));
  check('ht:tabs-render-infobar-hidden', (await fdisp('#bagInfoBar')) === 'none', '官方空间条隐藏');
  check('ht:tabs-render-hint-hidden', (await fdisp('#shiftHint')) === 'none', '官方提示行隐藏');

  let d = []; /* drain 解析复用（②起多处） */
  /* ---- ② bag-tab-official ---- */
  const gridAncestor = await F().evaluate(() => {
    const g = document.getElementById('backpackGrid');
    return g ? (g.closest('#srfg') ? 'mod' : (g.closest('.panel') && g.closest('.panel').classList.contains('srfg-on') ? 'official' : 'other')) : 'missing';
  });
  check('ht:bag-grid-in-place', gridAncestor === 'official', '背包格在官方面板内（未 reparent）：' + gridAncestor);
  check('ht:bag-grid-visible', (await fdisp('#backpackGrid')) === 'grid', '背包页签官方格可见 display=' + (await fdisp('#backpackGrid')));
  /* ② 九验收：柜签=官方格数据切换（switchBag 命令→mock 注入官方 BagMsg→官方渲染） */
  await drain();
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="900105"]'); t && t.click(); });
  await F().waitForFunction(() => document.querySelectorAll('#backpackGrid .item').length === 3, null, { timeout: 8000 });
  d = JSON.parse(await drain());
  check('ht:ctn-tab-grid', d.some((x) => x.op === 'switchBag' && Number(x.owner) === 900105) && (await fdisp('#backpackGrid')) === 'grid' && !(await fhas('#srfgGrid')) && !(await fhas('#srfgBody')),
    '柜签=官方数据切换：switchBag 命令+官方格直渲 3 件（无自绘格）：' + JSON.stringify(d));
  const imgCnt = await F().evaluate(() => document.querySelectorAll('#backpackGrid .item img').length);
  check('ht:ctn-tab-icons', imgCnt === 3, '官方渲染物品图标 3/3（mapItem 官方路径）=' + imgCnt);
  /* ②b 火苗角标（fuelgen 批作者验收件回归床：九验收自绘格退役时断供——官方 mapItem 不加 is-fuel，
     修复=fgBadgeFuel 按 ICFG 燃烧位补类+railui.css 官方规则注入）：木柴/柴油带类且 ::before 真绘制、零件无类 */
  const badgeSt = await F().evaluate(() => {
    const cs = (id) => { const el = document.querySelector('#backpackGrid .item[id="' + id + '"]'); if (!el) return null;
      const c = getComputedStyle(el, '::before'); return { cls: el.classList.contains('is-fuel'), bg: (c.backgroundImage || 'none') !== 'none', w: Math.round(parseFloat(c.width)) }; };
    return { f1: cs(921), f2: cs(922), bad: cs(923) };
  });
  check('ht:fuel-badge', badgeSt.f1 && badgeSt.f1.cls && badgeSt.f1.bg && badgeSt.f1.w === 15 && badgeSt.f2 && badgeSt.f2.cls && badgeSt.f2.bg && badgeSt.bad && !badgeSt.bad.cls,
    '火苗角标：木柴/柴油 .is-fuel+::before 15px 绘制、零件无类=' + JSON.stringify(badgeSt));
  await drain();
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="bag"]'); t && t.click(); });
  await F().waitForFunction(() => { const ids = [...document.querySelectorAll('#backpackGrid .item')].map((e) => +e.id); return ids.indexOf(901) >= 0; }, null, { timeout: 8000 });
  d = JSON.parse(await drain());
  check('ht:bag-tab-restore', d.some((x) => x.op === 'switchBag' && Number(x.owner) === 0), '切回背包页签：switchBag owner=0+官方背包数据回显（item 901 在格）');

  /* ---- ③ tidy-btn ---- */
  check('ht:foot-only-tidy', await F().evaluate(() => { const f = document.getElementById('srfgFoot'); return !!f && f.querySelectorAll('button').length === 1 && f.textContent.indexOf('一键整理') >= 0; }), '底行仅一键整理一钮');
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="900106"]'); t && t.click(); });
  await F().waitForFunction(() => document.querySelectorAll('#backpackGrid .item').length === 2, null, { timeout: 8000 });
  await drain(); /* 切签的 switchBag 已走：整理断言要纯净队列 */
  await F().evaluate(() => document.querySelector('#srfgFoot button').click());
  await page.waitForTimeout(120);
  d = JSON.parse(await drain());
  check('ht:tidy-ctn-owner', d.length === 1 && d[0].op === 'tidy' && Number(d[0].owner) === 900106, '柜页签整理 owner=900106：' + JSON.stringify(d));
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="bag"]'); t && t.click(); });
  await F().waitForFunction(() => { const ids = [...document.querySelectorAll('#backpackGrid .item')].map((e) => +e.id); return ids.indexOf(901) >= 0; }, null, { timeout: 8000 });
  await drain(); /* 回背包的 switchBag 已走 */
  await F().evaluate(() => document.querySelector('#srfgFoot button').click());
  await page.waitForTimeout(120);
  d = JSON.parse(await drain());
  check('ht:tidy-bag-owner', d.length === 1 && d[0].op === 'tidy' && Number(d[0].owner) === 900001, '背包页签整理 owner=900001：' + JSON.stringify(d));

  /* ---- ④ ad-keys ---- */
  await F().evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true })));
  await page.waitForTimeout(80);
  check('ht:ad-iframe-d', (await activeTab()) === '900105', 'iframe 内 D 键→下一签（bag→900105）：' + (await activeTab()));
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true })));
  await page.waitForTimeout(80);
  check('ht:ad-root-d', (await activeTab()) === '900106', 'Root 派发 D 键→下一签（900105→900106）：' + (await activeTab()));
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })));
  await page.waitForTimeout(80);
  check('ht:ad-root-a', (await activeTab()) === '900105', 'Root 派发 A 键→上一签：' + (await activeTab()));
  await page.getByRole('button', { name: 'Cooking', exact: true }).click();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true })));
  await page.waitForTimeout(150);
  check('ht:ad-no-leak', (await activeTab()) === '900105', '切走场景后 Root D 键无效（不泄漏）：' + (await activeTab()));
  await page.getByRole('button', { name: 'Heater', exact: true }).click();
  await waitHt();

  /* ---- ⑤ 官方交互路径（九验收：柜签数据进官方格后，交互全官方） ---- */
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="900105"]'); t && t.click(); });
  await F().waitForFunction(() => document.querySelectorAll('#backpackGrid .item').length === 3, null, { timeout: 8000 });
  /* ⑤a 左键官方物品 → 官方 ITEM_CLICK（Unity 原生详情面板通道；mod 零命令） */
  await drain();
  await page.evaluate(() => { window.__HZ_FGCLICKS__().length = 0; });
  await F().evaluate(() => document.querySelector('#backpackGrid .item[id="921"]').click());
  await page.waitForTimeout(150);
  const clicks = await page.evaluate(() => window.__HZ_FGCLICKS__());
  d = JSON.parse(await drain());
  check('ht:leftclick-itemclick', clicks.length === 1 && Number(clicks[0].itemId) === 921 && clicks[0].rightClick === false && d.length === 0,
    '左键=官方 ITEM_CLICK 921（原生详情面板通道，mod 零命令）：' + JSON.stringify(clicks) + ' drain=' + d.length);
  /* ⑤a-b 悬浮=官方 onItemHover→showFuelTip（仅燃料：木柴有热值、零件无）。暖炉页官方 tooltip
     元素=#fuelTooltip（发电机页=#recipeTooltip——两页 onItemHover 同构、元素 id 页异） */
  const tipSt = await F().evaluate(() => new Promise((res) => {
    const fuel = document.querySelector('#backpackGrid .item[id="921"]');
    fuel.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: 300, clientY: 300 }));
    setTimeout(() => {
      const t = document.getElementById('fuelTooltip');
      const fuelTip = t && t.style.display === 'block' ? t.textContent : '';
      if (t) t.style.display = 'none';
      const bad = document.querySelector('#backpackGrid .item[id="923"]');
      bad.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
      setTimeout(() => {
        const badTip = t && t.style.display === 'block' ? t.textContent : '';
        fuel.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
        bad.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
        if (t) t.style.display = 'none';
        res({ fuelTip: fuelTip, badShown: !!badTip });
      }, 700);
    }, 700);
  }));
  check('ht:hover-official-tip', /木柴/.test(tipSt.fuelTip) && /热值\s*600/.test(tipSt.fuelTip) && !tipSt.badShown,
    '悬浮=官方 showFuelTip（木柴「' + tipSt.fuelTip.split('\n').join(' / ') + '」、非燃料无提示=' + !tipSt.badShown + '）');
  /* ⑤b 右键=整叠直送（作者定规；预检同口径） */
  await drain();
  await F().evaluate(() => document.querySelector('#backpackGrid .item[id="921"]').dispatchEvent(new Event('contextmenu', { bubbles: true })));
  await page.waitForTimeout(150);
  d = JSON.parse(await drain());
  check('ht:feed-cmd-json', d.length === 1 && d[0].op === 'feed' && Number(d[0].owner) === 900105 && Number(d[0].item) === 921, '右键木柴→drain feed 921：' + JSON.stringify(d));
  await F().waitForFunction(() => document.querySelectorAll('#backpackGrid .item').length === 2, null, { timeout: 8000 });
  const qCnt = await page.evaluate(() => window.__HZ_FGQ__().length);
  check('ht:feed-mock-applied', qCnt >= 1, 'mock 队列+1（回推后格 3→2）=' + qCnt);
  /* ⑤c 右键零件（不可燃）→「只能添加燃料」零命令 */
  await drain();
  await F().evaluate(() => document.querySelector('#backpackGrid .item[id="923"]').dispatchEvent(new Event('contextmenu', { bubbles: true })));
  await page.waitForTimeout(150);
  const warnNonFuel = await ftxt('#srfgWarn');
  d = JSON.parse(await drain());
  check('ht:feed-nonfuel-warn', warnNonFuel === '只能添加燃料' && d.length === 0, '右键零件→「只能添加燃料」且零命令：' + warnNonFuel + ' drain=' + d.length);
  /* ⑤d 官方拖拽→燃料槽（页面自己的协调器+dropInterceptor→FUEL_ADD 官方事件+官方满员/可燃门） */
  await drain();
  await page.evaluate(() => { window.__HZ_FGADDS__().length = 0; });
  const dragFeed = await F().evaluate(() => {
    const el = document.querySelector('#backpackGrid .item[id="922"]');
    const r = el.getBoundingClientRect(), q = document.getElementById('fuelQueueZone').getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.x + 8, clientY: r.y + 8, button: 0 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.x + 60, clientY: r.y + 60 }));
    return new Promise((res) => setTimeout(() => { /* 官方幽灵提升走 rAF：等两帧再验 */
      const ghost = !!document.querySelector('body > .item[data-no-sync]');
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: q.x + 30, clientY: q.y + 30 }));
      setTimeout(() => {
        const over = document.getElementById('fuelQueueZone').classList.contains('drag-over');
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: q.x + 30, clientY: q.y + 30, button: 0 }));
        res({ ghost: ghost, over: over });
      }, 80);
    }, 80));
  });
  await page.waitForTimeout(400);
  const adds = await page.evaluate(() => window.__HZ_FGADDS__());
  check('ht:drag-official-feed', adds.length === 1 && Number(adds[0].itemId) === 922 && dragFeed.ghost && dragFeed.over,
    '官方拖拽柴油→料槽=官方 FUEL_ADD（幽灵+料槽 drag-over 全官方）：' + JSON.stringify(adds) + ' ghost=' + dragFeed.ghost + ' over=' + dragFeed.over);
  await F().waitForFunction(() => document.querySelectorAll('#backpackGrid .item').length === 1, null, { timeout: 8000 }).catch(() => { });
  /* ⑤e 拖空处=官方回弹（零命令） */
  await drain();
  const dragBounce = await F().evaluate(() => {
    const el = document.querySelector('#backpackGrid .item');
    if (!el) return { ok: false };
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.x + 8, clientY: r.y + 8, button: 0 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.x + 80, clientY: r.y + 120 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 40, clientY: 40, button: 0 }));
    return { ok: !document.querySelector('body > .item[data-no-sync]') };
  });
  await page.waitForTimeout(200);
  d = JSON.parse(await drain());
  check('ht:drag-bounce', dragBounce.ok && d.length === 0, '拖空白处=官方回弹（幽灵清、零命令）：drain=' + d.length);

  /* ⑤f 游戏推送节律回归（十验收实机「柜签不停闪烁」复现床：官方周期推送 vs 视图 owner——
     v1=失配重拉自激环；v2=官方状态直写，推送本身即当前视图数据=零命令零闪） */
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="900105"]'); t && t.click(); });
  await F().waitForFunction(() => document.querySelectorAll('#backpackGrid .item').length >= 1, null, { timeout: 8000 });
  await drain();
  for (let tick = 0; tick < 4; tick++) { /* 官方节律推送 3 拍（当前 owner）+1 拍野推送（玩家背包——v1 失配监听的闪环驱动源） */
    await page.evaluate((fk) => window.__HZ_FAKEOFFICIALTICK__(null, fk, 'Heater'), tick === 3 ? 900001 : 0);
    await page.waitForTimeout(260);
  }
  d = JSON.parse(await drain());
  check('ht:no-flicker-loop', d.length === 0, '官方节律推送 4 拍（当前 owner 数据）→零 switchBag 重拉（v1 自激环实证位）：drain=' + d.length);

  /* ---- ⑥ full-precheck（队列 8 满员→「炉膛已满」零命令；900105 燃料已喂尽→900106） ---- */
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="900106"]'); t && t.click(); });
  await F().waitForFunction(() => document.querySelectorAll('#backpackGrid .item').length === 2, null, { timeout: 8000 });
  await page.evaluate(() => {
    const q = []; for (let i = 0; i < 8; i++) q.push({ emoji: '🪵', name: '木柴', pct: '95%' });
    window.__HZ_FAKEOFFICIALTICK__({ fuelItems: q }, 0, 'Heater'); /* 整包（官方口径：bagItems+fuelItems 同包；缺 bagItems=清格） */
  });
  await page.waitForTimeout(200);
  await drain();
  await F().evaluate(() => { const el = document.querySelector('#backpackGrid .item'); el && el.dispatchEvent(new Event('contextmenu', { bubbles: true })); });
  await page.waitForTimeout(150);
  const warnFull = await ftxt('#srfgWarn');
  d = JSON.parse(await drain());
  check('ht:full-precheck', warnFull === '炉膛已满' && d.length === 0, '满员右键→「炉膛已满」零命令：' + warnFull + ' drain=' + d.length);

  /* ---- ⑦ feedfail-ctx（C# 权威拒绝回执消费） ---- */
  await page.evaluate(() => { window.__HZ_FEEDFAIL__ = 'bagfull'; window.__HZ_PUSH__('Heater'); });
  await page.waitForTimeout(250);
  check('ht:feedfail-bagfull', (await ftxt('#srfgWarn')) === '背包已满，无法转送', 'ctx.feedFail=bagfull→文案：' + (await ftxt('#srfgWarn')));
  await page.evaluate(() => { window.__HZ_FEEDFAIL__ = 'full'; window.__HZ_PUSH__('Heater'); });
  await page.waitForTimeout(250);
  check('ht:feedfail-full', (await ftxt('#srfgWarn')) === '炉膛已满', 'ctx.feedFail=full→文案：' + (await ftxt('#srfgWarn')));
  await page.evaluate(() => { window.__HZ_FEEDFAIL__ = ''; window.__HZ_PUSH__('Heater'); });
  await page.waitForTimeout(2300);
  const warnGone = await F().evaluate((sel) => { const e = document.querySelector(sel); return !e || e.hidden ? '' : (e.textContent || ''); }, '#srfgWarn');
  check('ht:feedfail-oneshot', warnGone === '', '清零重推→警示淡出（一次性，断言可见文本）："' + warnGone + '"');

  /* ---- ⑧ width-lock + 实机四缺陷（2026-11-07 修复批回归） ---- */
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="bag"]'); t && t.click(); });
  await page.waitForTimeout(120);
  const wBag = await panelW();
  const hBag = await F().evaluate(() => document.querySelector('.heater-system > .panel:not(.heater-panel)').offsetHeight);
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="900105"]'); t && t.click(); });
  await page.waitForTimeout(120);
  const wCtn = await panelW();
  const hCtn = await F().evaluate(() => document.querySelector('.heater-system > .panel:not(.heater-panel)').offsetHeight);
  check('ht:width-lock-tabs', wBag === wCtn && wBag > 500 && hBag === hCtn && hBag === 778,
    '背包/柜页签面板宽高恒定：' + wBag + '==' + wCtn + ' 高 ' + hBag + '==778（等高契约地板=侧栏同款 14 格半基准）');
  /* ⑧b foot-right（实机缺陷③：整理按钮跑左——.srfg-foot 类漏挂致无 justify-content:flex-end） */
  const footStyle = await F().evaluate(() => {
    const f = document.getElementById('srfgFoot'), panel = document.querySelector('.heater-system > .panel:not(.heater-panel)');
    if (!f || !panel) return null;
    const cs = getComputedStyle(f), btn = f.querySelector('button');
    return { disp: cs.display, jc: cs.justifyContent, gap: btn ? panel.getBoundingClientRect().right - btn.getBoundingClientRect().right : -1 };
  });
  check('ht:foot-right', !!footStyle && footStyle.disp === 'flex' && footStyle.jc === 'flex-end' && footStyle.gap >= 0 && footStyle.gap < 45,
    '底行右贴：flex/' + (footStyle && footStyle.jc) + '（按钮-面板右缘 gap=' + (footStyle && footStyle.gap.toFixed(1)) + 'px）');
  /* ⑧c arrows-always（实机缺陷①：‹› 溢出门在燃料柜少时永不显形=「按钮没有」——改常驻+端点禁用） */
  const arr2 = await F().evaluate(() => {
    const l = document.querySelector('#srfgTabs .srfg-tabbtn-l'), r = document.querySelector('#srfgTabs .srfg-tabbtn-r');
    return { l: l ? getComputedStyle(l).display : 'missing', r: r ? getComputedStyle(r).display : 'missing',
      dl: l ? l.disabled : null, dr: r ? r.disabled : null };
  });
  check('ht:arrows-always', arr2.l === 'flex' && arr2.r === 'flex' && arr2.dl === true && arr2.dr === true,
    '2 燃料柜无溢出：‹› 仍常驻可见(flex)、两端点均禁用(' + arr2.dl + '/' + arr2.dr + ')');
  await page.evaluate(() => {
    const m = JSON.parse(JSON.stringify(window.__HZ_MOCKSET__()));
    for (let i = 0; i < 4; i++) m.ctn.push([900200 + i, '备用燃料柜' + i, 'c', 24, 1013]);
    window.__HZ_MOCKSET__(m); window.__HZ_PUSH__('Heater');
  });
  await page.waitForTimeout(500);
  const wMany = await panelW();
  const arrows = await F().evaluate(() => {
    const l = document.querySelector('#srfgTabs .srfg-tabbtn-l'), r = document.querySelector('#srfgTabs .srfg-tabbtn-r');
    return { l: l ? getComputedStyle(l).display : 'missing', r: r ? getComputedStyle(r).display : 'missing',
      dl: l ? l.disabled : null, dr: r ? r.disabled : null, n: document.querySelectorAll('#srfgTabs .srfg-tab').length };
  });
  check('ht:width-lock-overflow', wMany === wBag && arrows.n === 7 && arrows.l !== 'none' && arrows.r !== 'none' && arrows.dl === true && arrows.dr === false,
    '6 燃料柜页签：‹›常驻(' + arrows.l + '/' + arrows.r + ') 左禁右活(' + arrows.dl + '/' + arrows.dr + ')、宽不变 ' + wMany + '==' + wBag + ' tabs=' + arrows.n);
  /* ⑧d tall-ctn-scroll（实机缺陷②：高柜无滚动=溢出界面外——#srfgBody 需定高+overflow，锁漏=溢出）。
     v1.8.14 口径：滚动器=mod 包装层 #srfgGridScroll（.srfg-gridscroll），官方 #backpackGrid 全高在内滚
     ——格本体 rect 恒=全高内容矩形（webui-bag 拖拽坐标基准，格自滚=落点偏上病根）。 */
  await page.evaluate(() => {
    const m = JSON.parse(JSON.stringify(window.__HZ_MOCKSET__()));
    m.ctn.push([900300, '高燃料柜', 'c', 240, 1013]); /* 12 列 ×20 行，远超锁定面板高 */
    window.__HZ_MOCKSET__(m); window.__HZ_PUSH__('Heater');
  });
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="900300"]'); t && t.click(); });
  await F().waitForFunction(() => { const g = document.getElementById('backpackGrid'); return g && g.querySelectorAll('.slot').length === 240; }, null, { timeout: 8000 });
  await page.waitForTimeout(150);
  const tallState = await F().evaluate(() => {
    const g = document.getElementById('backpackGrid'), w = document.getElementById('srfgGridScroll'), panel = document.querySelector('.heater-system > .panel:not(.heater-panel)');
    const foot = document.getElementById('srfgFoot'), tabs = document.getElementById('srfgTabs');
    return { wSh: w ? w.scrollHeight : 0, wCh: w ? w.clientHeight : 0, wOvY: w ? getComputedStyle(w).overflowY : '(missing)',
      gH: g.getBoundingClientRect().height, gOvY: getComputedStyle(g).overflowY,
      spill: (w || g).getBoundingClientRect().bottom - panel.getBoundingClientRect().bottom,
      footIn: foot.getBoundingClientRect().bottom - panel.getBoundingClientRect().bottom,
      tabsIn: tabs.getBoundingClientRect().top - panel.getBoundingClientRect().top };
  });
  check('ht:tall-ctn-scroll', tallState.wSh > tallState.wCh + 20 && tallState.wOvY === 'auto' && tallState.spill <= 1 && tallState.footIn <= 1 && tallState.tabsIn >= -1,
    '20 行高柜：包装层内部滚动(' + tallState.wSh + '>' + tallState.wCh + ', ' + tallState.wOvY + ')、视窗/底行/页签零溢出(spill=' + tallState.spill.toFixed(1) + ' foot=' + tallState.footIn.toFixed(1) + ' tabs=' + tallState.tabsIn.toFixed(1) + ')');
  check('ht:grid-not-scroller', tallState.gOvY === 'visible' && tallState.gH > 20 * 40 /* 20 行×slot40 全高 rect */,
    '官方格非滚动器(overflow-y=' + tallState.gOvY + ') rect 全高=' + tallState.gH.toFixed(0) + 'px（v1.8.14：拖拽坐标基准=格 rect 行 0 对齐）');
  /* ⑧d-b scroll-drag-landing（v1.8.14 作者实报「燃料页侧栏背包/柜子滚动后无法移动物品、落地位置不对」）：
     直投官方形状 BagMsg（900300 高柜，物品 931@y14/932@y11——mock items 空柜，直投不扰 mock 态），
     包装层滚到底后合成事件真拖两例（webui-bag 协调器=官方代码路径）：松手格 rect 现取（stopDrag
     rect=null 现量）——旧实现（格自滚）rect=裁剪窗，落点 y 恒少 scrollTop/step 行=偏上/被拒。 */
  await drain();
  await page.evaluate(() => {
    window.__SD_IM__ = [];
    window.addEventListener('message', (ev) => { if (ev.data && ev.data.type === 'ITEM_MOVE') window.__SD_IM__.push(ev.data.data); });
    document.getElementById('Heater').contentWindow.postMessage({ type: 'WebUI_Heater_BagMsg', data: {
      bagOwnerId: 900300, bagCols: 12, bagRows: 20,
      bagItems: [
        { itemId: 931, x: 4, y: 14, w: 1, h: 1, emoji: '📦', name: '物品931', count: 2, burnable: true },
        { itemId: 932, x: 2, y: 11, w: 1, h: 1, emoji: '📦', name: '物品932', count: 2, burnable: true }
      ],
      fuelSlotCount: 8, fuelRate: 50, fuelItems: [] } }, '*');
  });
  await F().waitForFunction(() => document.querySelectorAll('#backpackGrid .item').length === 2, null, { timeout: 8000 });
  const scA = await F().evaluate(() => {
    const w = document.getElementById('srfgGridScroll');
    if (!w) return { ok: false };
    w.scrollTop = w.scrollHeight - w.clientHeight;
    return { ok: true, top: w.scrollTop, max: w.scrollHeight - w.clientHeight };
  });
  check('ht:scroll-drag-scrolled', scA.ok && scA.top === scA.max && scA.max > 200,
    scA.ok ? '包装层滚到底 scrollTop=' + scA.top + '/' + scA.max + '（20 行>视窗≈640，测试有效性）' : '#srfgGridScroll 缺失');
  async function fgDrag(itemId, col, row) {
    const r = await F().evaluate((id) => {
      const el = document.querySelector('#backpackGrid .item[id="' + id + '"]');
      if (!el) return null;
      const ir = el.getBoundingClientRect();
      return { x: ir.left + ir.width / 2, y: ir.top + ir.height / 2 };
    }, itemId);
    if (!r) return;
    const t = await F().evaluate((c) => {
      const g = document.getElementById('backpackGrid');
      const s = g.querySelectorAll('.slot')[c.row * 12 + c.col];
      const sr = s.getBoundingClientRect();
      return { x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 };
    }, { col, row });
    const fired = await F().evaluate((a) => new Promise((res) => {
      const el = document.querySelector('#backpackGrid .item[id="' + a.id + '"]');
      if (!el) { res(false); return; }
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: a.p.x, clientY: a.p.y, button: 0 }));
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: a.p.x + 30, clientY: a.p.y + 30 }));
      setTimeout(() => { /* 官方幽灵提升走 rAF：等两帧（同 ⑤d dragFeed 节奏） */
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: a.q.x, clientY: a.q.y }));
        setTimeout(() => {
          document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: a.q.x, clientY: a.q.y, button: 0 }));
          setTimeout(() => res(true), 60);
        }, 160); /* 快速移动只标脏：等 100ms idle 补算 hover 再松手 */
      }, 90);
    }), { id: itemId, p: r, q: t });
    return fired;
  }
  const okA = await fgDrag(931, 7, 13);
  const imA = await page.evaluate(() => window.__SD_IM__.splice(0));
  check('ht:scroll-drag-landing', okA && imA.length === 1 && imA[0].x === 7 && imA[0].y === 13 && Number(imA[0].itemId) === 931,
    (okA ? '' : '拖拽未达；') + (imA.length ? 'ITEM_MOVE={itemId:' + imA[0].itemId + ',x:' + imA[0].x + ',y:' + imA[0].y + '}（期望 931/7/13——滚动态落点=光标格）' : '零 ITEM_MOVE（旧病：滚动态落点被判占用/出界=「无法移动物品」）'));
  const okB = await fgDrag(932, 9, 10);
  const imB = await page.evaluate(() => window.__SD_IM__.splice(0));
  check('ht:scroll-drag-landing2', okB && imB.length === 1 && imB[0].x === 9 && imB[0].y === 10 && Number(imB[0].itemId) === 932,
    (okB ? '' : '拖拽未达；') + (imB.length ? 'ITEM_MOVE={itemId:' + imB[0].itemId + ',x:' + imB[0].x + ',y:' + imB[0].y + '}（期望 932/9/10）' : '零 ITEM_MOVE'));
  /* ⑧e bag-viewport-scroll（六验收：面板=816 恒定（mod 侧栏同版式），格区视窗内滚动——
     背包 18 行>视窗(≈678px≈14 格半)=滚动态；「扩容不越界」储物体验红线） */
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="bag"]'); t && t.click(); });
  await page.waitForTimeout(150);
  const bagState = await F().evaluate(() => {
    const w = document.getElementById('srfgGridScroll'), panel = document.querySelector('.heater-system > .panel:not(.heater-panel)');
    return { sh: w ? w.scrollHeight : 0, ch: w ? w.clientHeight : 0, lock: panel.style.height, panelH: panel.offsetHeight,
      spill: (w || document.getElementById('backpackGrid')).getBoundingClientRect().bottom - panel.getBoundingClientRect().bottom };
  });
  check('ht:bag-viewport-scroll', bagState.sh > bagState.ch + 20 && bagState.panelH === 778 && bagState.lock === '778px' && bagState.spill <= 1,
    '背包 18 行视窗内滚动(包装层 ' + bagState.sh + '>' + bagState.ch + ')、面板 778 等高契约(lock=' + bagState.lock + ')、零溢出(' + bagState.spill.toFixed(1) + 'px)');
  /* ⑧e-b 版式绑定不变量：发电机面板高度 ≡ 其他界面侧栏高度（同 816）——防再次走样。
     侧栏在隐藏帧量值为 0：切 Cooking 现场量（zoom 归一），量完切回 */
  await page.getByRole('button', { name: 'Cooking', exact: true }).click();
  await page.waitForTimeout(700);
  const railH = await page.evaluate(() => {
    const d = document.getElementById('Cooking').contentDocument;
    const rail = d && d.querySelector('#srp .sr-rail');
    if (!rail) return -1;
    const z = parseFloat(d.body.style.zoom) || 1;
    return Math.round(rail.offsetHeight / z);
  });
  await page.getByRole('button', { name: 'Heater', exact: true }).click();
  await page.waitForTimeout(700);
  check('ht:panel-matches-rail', railH === 778 && bagState.panelH === 778,
    '版式绑定：发电机面板 ' + bagState.panelH + ' ≡ 侧栏 sr-rail ' + railH + '（同 778 地板——其他界面滚动优化同源同值）');
  /* ⑧f race-late-data（真实页时序取证：官方格仅在 BagMsg 到达时首渲（refresh→initGrid），此前恒空——
     装配必须等数据、且晚到后宽/高锁取值正确。旧一次性 px 锁类缺陷的回归床） */
  await page.evaluate(() => { window.__HZ_HTNUDGE__ = false; });
  await F().evaluate(() => location.reload()).catch(() => { }); /* reload 自毁执行上下文=预期 */
  await page.waitForTimeout(900); /* 等旧文档销毁、F() 重解析到新帧（否则 waitForFunction 会命中最旧文档残影） */
  const emptyState = await F().evaluate(() => ({ slots: document.getElementById('backpackGrid').children.length, tabs: !!document.getElementById('srfgTabs') }));
  check('ht:race-empty-wait', emptyState.slots === 0 && !emptyState.tabs,
    'BagMsg 前格恒空：装配正确等待不早产=' + JSON.stringify(emptyState));
  await page.waitForTimeout(600); /* 制造数据晚到窗口 */
  await page.evaluate(() => {
    document.getElementById('Heater').contentWindow.postMessage({ type: 'WebUI_Heater_BagMsg', data: { bagOwnerId: 900001, bagCols: 12, bagRows: 18, bagItems: [], fuelSlotCount: 8, fuelRate: 50, fuelItems: [] } }, '*');
  });
  await F().waitForFunction(() => document.getElementById('srfgTabs') && document.getElementById('backpackGrid').querySelectorAll('.slot').length === 216, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const raceState = await F().evaluate(() => {
    const panel = document.querySelector('.heater-system > .panel:not(.heater-panel)');
    const tabs = document.getElementById('srfgTabs');
    return { w: panel.offsetWidth, wLock: panel.style.width, h: panel.offsetHeight, zoom: document.body.style.zoom || '',
      tabsVis: tabs.getBoundingClientRect().height > 0 };
  });
  check('ht:race-late-mount-sane', raceState.w >= 598 && !raceState.wLock && Math.round(raceState.h / (parseFloat(raceState.zoom) || 1)) === 778 && raceState.tabsVis && (raceState.zoom === '' || parseFloat(raceState.zoom) > 0.6),
    '数据晚到装配：宽 ' + raceState.w + '（无 inline 宽锁=' + !raceState.wLock + '）、面板 778 等高契约、页签可见、zoom="' + raceState.zoom + '"');
  await page.evaluate(() => { window.__HZ_HTNUDGE__ = true; });
  /* ⑧g reopen-bagheight（实机缺陷④全链复现：调高背包行数→重开→页签栏可见、格区滚动不溢出） */
  await page.evaluate(() => { window.__HZ_HTROWS__ = 24; });
  await F().evaluate(() => location.reload()).catch(() => { }); /* reload 自毁执行上下文=预期 */
  await page.waitForTimeout(900); /* 等旧文档销毁、F() 重解析到新帧 */
  await F().waitForFunction(() => document.getElementById('srfgTabs') && document.getElementById('backpackGrid').querySelectorAll('.slot').length === 216, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  /* 三验收根因回归：重开(新文档)后柜子页签必须在（旧缺陷=tabSig 跨文档残留→滚动区永不首填） */
  const reopenTabs = await tabIds();
  check('ht:reopen-tablist', reopenTabs === 'bag,900105,900106,900200,900201,900202,900203,900300', '重开后页签清单完整（柜签 7 个全在）：' + reopenTabs);
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="900105"]'); t && t.click(); });
  await F().waitForFunction(() => document.querySelectorAll('#backpackGrid .item').length === 1, null, { timeout: 8000 }).catch(() => { });
  const reopenGrid = await F().evaluate(() => document.querySelectorAll('#backpackGrid .item').length);
  check('ht:reopen-ctn-grid', reopenGrid === 1, '重开后点柜签官方格渲染柜数据（旧缺陷=FG.sig 跨文档残留→永不渲染）：items=' + reopenGrid + '（⑤ 已喂走 2=剩 1）');
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="bag"]'); t && t.click(); });
  await page.waitForTimeout(120);
  const reopenState = await F().evaluate(() => {
    const panel = document.querySelector('.heater-system > .panel:not(.heater-panel)');
    const tabs = document.getElementById('srfgTabs'), foot = document.getElementById('srfgFoot');
    const w = document.getElementById('srfgGridScroll');
    const pr = panel.getBoundingClientRect(), tr = tabs.getBoundingClientRect();
    return { w: panel.offsetWidth, h: panel.offsetHeight, zoom: document.body.style.zoom || '', tabsIn: tr.top >= pr.top - 1,
      tabsVis: tr.top >= 0 && tr.bottom <= window.innerHeight, footVis: foot.getBoundingClientRect().bottom <= window.innerHeight,
      sh: w ? w.scrollHeight : 0, ch: w ? w.clientHeight : 0, spill: (w || document.getElementById('backpackGrid')).getBoundingClientRect().bottom - pr.bottom };
  });
  check('ht:reopen-bagheight-tabs', reopenState.tabsIn && reopenState.tabsVis && reopenState.w >= 598 && Math.round(reopenState.h / (parseFloat(reopenState.zoom) || 1)) === 778,
    '24 行背包重开：页签在面板内且视口内可见(面板 ' + reopenState.w + '×' + reopenState.h + '=778 恒定不随行数变、zoom="' + reopenState.zoom + '")');
  check('ht:reopen-bagheight-contain', reopenState.sh > reopenState.ch + 20 && reopenState.spill <= 1 && reopenState.footVis,
    '24 行背包重开：视窗内滚动(包装层 ' + reopenState.sh + '>' + reopenState.ch + ')、零溢出(' + reopenState.spill.toFixed(1) + 'px)、底行在视口内');
  await page.evaluate(() => { window.__HZ_HTROWS__ = 18; });
  /* ⑧h root-lifecycle（实机二验收「二次打开页签栏不显示」复现床）：真实 Root.html 语义=同文档
     display:none 收起（非场景切换——ctx 不变）+ 隐藏期心跳重推 + 重开 re-nudge（BagMsg 再投）。
     旧 ④ 场景切换路与本路差异=ctx 是否保持 FuelGenerator。 */
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="bag"]'); t && t.click(); });
  await page.waitForTimeout(150);
  await page.evaluate(() => { document.getElementById('Heater').style.display = 'none'; window.__CERAIL__.scan(); });
  await page.waitForTimeout(1200); /* 隐藏期：interval 扫描跑 2+ 轮（FG.active=false 路） */
  await page.evaluate(() => { window.__HZ_PUSH__('Heater'); }); /* 心跳重推（C# ping→ForceRepublish 同效） */
  await page.waitForTimeout(600);
  await page.evaluate(() => { document.getElementById('Heater').style.display = 'block'; window.__CERAIL__.scan(); });
  await page.evaluate(() => window.__HZ_NUDGE__ && window.__HZ_NUDGE__('Heater')); /* 重开 re-nudge（官方 BagMsg 再投） */
  await page.waitForTimeout(900);
  const reop2 = await F().evaluate(() => {
    const panel = document.querySelector('.heater-system > .panel:not(.heater-panel)');
    const tabs = document.getElementById('srfgTabs'), foot = document.getElementById('srfgFoot');
    const tr = tabs && tabs.getBoundingClientRect(), pr = panel.getBoundingClientRect();
    return { tabs: !!tabs, foot: !!foot, vis: !!tr && tr.height > 0 && tr.top >= pr.top - 1,
      cls: panel.className, zoom: document.body.style.zoom || '', lock: panel.style.height,
      n: document.querySelectorAll('#srfgTabs .srfg-tab').length,
      tabsLeft: tabs ? tabs.getBoundingClientRect().left - pr.left : -1 };
  });
  check('ht:reopen-samedoc-tabs', reop2.tabs && reop2.foot && reop2.vis && reop2.n === 8 && reop2.tabsLeft <= 17,
    '同文档关/开（Root 真实时序）：柜签(8) tabs=' + reop2.tabs + ' foot=' + reop2.foot + ' vis=' + reop2.vis + ' 左起满宽(Δ=' + reop2.tabsLeft.toFixed(1) + '≤17=面板内边距) zoom="' + reop2.zoom + '" 锁=' + reop2.lock + ' cls=' + reop2.cls);
  /* ⑧h-b 重载变体（若游戏走 iframe 重载路）：hide→reload→ready→nudge */
  await page.evaluate(() => { document.getElementById('Heater').style.display = 'none'; });
  await page.waitForTimeout(200);
  await F().evaluate(() => location.reload()).catch(() => { });
  await page.waitForTimeout(900);
  await page.evaluate(() => { document.getElementById('Heater').style.display = 'block'; window.__CERAIL__.scan(); });
  await page.evaluate(() => window.__HZ_NUDGE__ && window.__HZ_NUDGE__('Heater'));
  await F().waitForFunction(() => document.getElementById('srfgTabs'), null, { timeout: 15000 }).catch(() => { });
  await page.waitForTimeout(400);
  const reop3 = await F().evaluate(() => {
    const panel = document.querySelector('.heater-system > .panel:not(.heater-panel)');
    const tabs = document.getElementById('srfgTabs');
    const tr = tabs && tabs.getBoundingClientRect(), pr = panel.getBoundingClientRect();
    return { tabs: !!tabs, vis: !!tr && tr.height > 0 && tr.top >= pr.top - 1, zoom: document.body.style.zoom || '',
      n: document.querySelectorAll('#srfgTabs .srfg-tab').length };
  });
  check('ht:reopen-reload-tabs', reop3.tabs && reop3.vis && reop3.n === 8 && (reop3.zoom === '' || parseFloat(reop3.zoom) > 0.6),
    '关→重载→开（重载变体）：页签栏回显可见、柜签全在(' + reop3.n + '/8)、zoom="' + reop3.zoom + '"（空或正常适配值）');

  /* ---- ⑨ no-fuel-cabinets（Review Focus 1：无燃料柜=原版） ---- */
  await page.evaluate(() => {
    const m = JSON.parse(JSON.stringify(window.__HZ_MOCKSET__()));
    m.ctn = m.ctn.filter((c) => c[4] !== 1013);
    window.__HZ_MOCKSET__(m); window.__HZ_PUSH__('Heater');
  });
  await page.waitForTimeout(900);
  check('ht:no-fuel-teardown', !(await fhas('#srfgTabs')) && !(await fhas('#srfgFoot')) && !(await fhas('#srfgGrid')) && !(await fhas('#srfgGridScroll')), '页签栏/底行/mod 格/滚动包装层全部拆除');
  check('ht:no-fuel-official-back', (await fdisp('#bagPanelTitle')) !== 'none' && (await fdisp('#bagInfoBar')) !== 'none' && (await fdisp('#shiftHint')) !== 'none' && (await fdisp('#backpackGrid')) === 'grid'
    && (await F().evaluate(() => { const g = document.getElementById('backpackGrid'); return !!g && !!g.closest('.panel') && g.parentElement.classList.contains('panel'); })),
    '官方 title/info-bar/hint/grid 四件全显+格拆包回面板直子（v1.8.14 拆包还原=DOM 序原版）');

  /* ---- ⑩b cfg 开关（终审 Important1：EnableHeater 经 ctx.heaterOn 全链生效） ---- */
  await page.evaluate(() => {
    const m = JSON.parse(JSON.stringify(window.__HZ_MOCKSET__()));
    /* ⑨ 已剥 1013 柜——补回两条燃料柜（在残余集上 concat，勿再 filter 1013=空集陷阱） */
    m.ctn = m.ctn.concat([[900105, '燃料柜·大号', 'c', 48, 1013], [900106, '柴油储存', 'c', 24, 1013]]);
    window.__HZ_MOCKSET__(m); window.__HZ_HTON__ = false; window.__HZ_PUSH__('Heater');
  });
  await page.waitForTimeout(900);
  check('ht:cfg-off-teardown', !(await fhas('#srfgTabs')) && !(await fhas('#srfgFoot')) && (await fdisp('#bagPanelTitle')) !== 'none',
    'ctx.heaterOn=false→mod DOM 全拆+官方元素还原（EnableFuelGen 消费链）');
  await page.evaluate(() => { window.__HZ_HTON__ = true; window.__HZ_PUSH__('Heater'); });
  await waitHt();
  check('ht:cfg-on-restore', await fhas('#srfgTabs'), 'ctx.heaterOn=true→页签回装（开关往返）');

  /* ---- ③② 暖炉特有（右炉体面板零改动 + 官方 fuelCap 读数面） ---- */
  const htPanel = await F().evaluate(() => {
    const right = document.querySelector('.heater-system > .panel.heater-panel');
    const modInRight = right ? right.querySelectorAll('#srfgTabs,#srfgFoot,#srfgWarn,#srfgGridScroll').length : -1;
    const left = document.querySelector('.heater-system > .panel:not(.heater-panel)');
    return { right: !!right, modInRight: modInRight, leftCls: left ? left.className : '',
      stove: !!document.getElementById('stoveStage'), toggle: !!document.getElementById('toggleBtn'),
      cap: (document.getElementById('fuelCap') || {}).textContent || '' };
  });
  check('ht:right-panel-untouched', htPanel.right && htPanel.modInRight === 0 && htPanel.stove && htPanel.toggle,
    '右炉体面板零改动（mod DOM 0 件入侵、炉体/点火钮官方原位）：right=' + htPanel.right + ' modInRight=' + htPanel.modInRight + ' stove=' + htPanel.stove + ' toggle=' + htPanel.toggle);
  /* 官方读数面在左装配后仍随官方数据更新：柜签 900106 视图 → mock 节律推 fuelItems 2 件 →
     #fuelCap 官方读数「n / 8」随包刷新（StateMsg/BagMsg handler 官方路径零拦截） */
  await drain();
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="900106"]'); t && t.click(); });
  await F().waitForFunction(() => document.querySelectorAll('#backpackGrid .item').length === 2, null, { timeout: 8000 }).catch(() => { });
  await page.evaluate(() => {
    const q = [{ name: '木柴', pct: '40%' }, { name: '柴油', pct: '10%' }];
    window.__HZ_FAKEOFFICIALTICK__({ fuelItems: q }, 0, 'Heater');
  });
  await page.waitForTimeout(300);
  const capTxt = await ftxt('#fuelCap');
  const slotCnt = await F().evaluate(() => document.querySelectorAll('#fuelQueueZone .fuel-slot').length);
  const usedCnt = await F().evaluate(() => document.querySelectorAll('#fuelQueueZone .fuel-slot.queued-item, #fuelQueueZone .fuel-slot.active-burn').length);
  check('ht:fuelcap-official-updates', /^2\s*\/\s*8$/.test(capTxt) && slotCnt === 8 && usedCnt === 2,
    '官方 fuelCap 读数随 BagMsg 刷新="' + capTxt + '"（料槽 8 格官打/占用 2=fgQueueFull 官方谓词面）');

  /* ---- ⑩ console-clean ---- */
  check('ht:console-clean', consoleErrors.length === 0 && pageErrors.length === 0,
    'console errors=' + consoleErrors.length + ' pageerrors=' + pageErrors.length + (consoleErrors[0] ? ' 首条:' + consoleErrors[0] : '') + (pageErrors[0] ? ' 首条:' + pageErrors[0] : ''));

  const fails = results.filter((r) => !r.ok).length;
  console.log((fails === 0 ? 'ALL PASS' : fails + ' FAIL') + ' | ' + results.length + ' 断言');
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
