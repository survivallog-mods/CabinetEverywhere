/* fuelgen bagtabs（spec 2026-11-06-fuelgen-cabinet-tabs）root harness 断言
   （Playwright，serve.cjs 须已在 8180）。真装配路径（Root+13 iframe+ensureMounted 循环）上
   的燃油发电机页签化全流程（计划 Task 3 Step 2 十路）：
   ① tabs-render：#srfgTabs=背包+2 燃料柜（杂物柜 900104 无 1013 标签不进）；官方 title/
      info-bar/hint 隐藏
   ② bag-tab-official：背包页签官方 #backpackGrid 原生在位；柜页签=官方格 display:none、
      #srfgGrid 渲染该柜物品（燃料带 .is-fuel）；切回背包恢复
   ③ tidy-btn：#srfgFoot 仅一键整理；柜页签 owner=柜 / 背包页签 owner=背包
   ④ ad-keys：iframe 内 d/a 键切签 + Root 派发同效；切走场景后 Root 派发无效（不泄漏）
   ⑤ feed-cmd：点柜中燃料→drain {op:'feed',owner,item}+mock 执行后格少一件；点非燃料→
      #srfgWarn「只能添加燃料」且无 drain
   ⑥ full-precheck：队列 8 满员→「燃油槽已满」无 drain
   ⑦ feedfail-ctx：ctx.feedFail=bagfull→「背包已满，无法转送」；=full→「燃油槽已满」；
      清零重推→警示淡出（一次性）
   ⑧ width-lock+实机四缺陷回归（2026-11-07 修复批）：宽恒定；⑧b 整理钮右贴（缺陷③
      .srfg-foot 类漏挂）；⑧c ‹› 常驻+端点禁用（缺陷① is-visible 溢出门永不显形）；
      ⑧d 20 行高柜内部滚动零溢出（缺陷② 锁漏=#srfgBody 无定高）；⑧e 背包 18 行（真实
      玩家袋）锁定面板内滚动；⑧f 装配竞态（默认 6×5 期装配——旧一次性 px 宽锁锁进 324px
      =缺陷④根因，BagMsg 晚到宽不漂）；⑧g 调高背包 24 行→重开→页签可见格区滚动（缺陷④
      全链复现）
   ⑨ no-fuel-cabinets：MOCK 摘掉燃料柜→#srfgTabs/#srfgFoot 消失、官方四件全显（Review Focus 1）
   ⑩ console-clean：全程零 error/pageerror
   夹具=官方页原样（webui_src 逐字节同源+vendor 脚本）：渐进渲染（默认 6×5 先建、BagMsg
   resize 12×N）与 createViewportFit 均为真实时序——旧静态夹具一帧全量渲染，四缺陷全数漏检。 */
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
  const F = () => frameOf('FuelGenerator');
  async function waitFg(timeout = 12000) {
    await F().waitForFunction(() => document.getElementById('srfgTabs'), null, { timeout });
  }
  const ftxt = (sel) => F().evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel);
  const fhas = (sel) => F().evaluate((s) => !!document.querySelector(s), sel);
  const fdisp = (sel) => F().evaluate((s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).display : 'missing'; }, sel);
  const drain = () => page.evaluate(() => window.__CERAIL__.drain());
  const push = () => page.evaluate(() => window.__HZ_PUSH__('FuelGenerator'));
  const activeTab = () => F().evaluate(() => { const a = document.querySelector('#srfgTabs .srfg-tab.active'); return a ? a.getAttribute('data-id') : null; });
  const tabIds = () => F().evaluate(() => Array.prototype.map.call(document.querySelectorAll('#srfgTabs .srfg-tab'), (t) => t.getAttribute('data-id')).join(','));
  const panelW = () => F().evaluate(() => { const p = document.querySelector('.generator-system > .panel:not(.gen-panel)'); return p ? p.offsetWidth : -1; });

  /* ---- 场景切换：FuelGenerator ---- */
  await page.getByRole('button', { name: 'FuelGenerator', exact: true }).click();
  await waitFg();

  /* ---- ① tabs-render ---- */
  check('fg:tabs-render-list', (await tabIds()) === 'bag,900105,900106', 'tabs=' + (await tabIds()) + '（900104 杂物柜无 1013 不进）');
  check('fg:tabs-render-title-hidden', (await fdisp('#bagPanelTitle')) === 'none', '官方标题隐藏 display=' + (await fdisp('#bagPanelTitle')));
  check('fg:tabs-render-infobar-hidden', (await fdisp('#bagInfoBar')) === 'none', '官方空间条隐藏');
  check('fg:tabs-render-hint-hidden', (await fdisp('#shiftHint')) === 'none', '官方提示行隐藏');

  /* ---- ② bag-tab-official ---- */
  const gridAncestor = await F().evaluate(() => {
    const g = document.getElementById('backpackGrid');
    return g ? (g.closest('#srfg') ? 'mod' : (g.closest('.panel') && g.closest('.panel').classList.contains('srfg-on') ? 'official' : 'other')) : 'missing';
  });
  check('fg:bag-grid-in-place', gridAncestor === 'official', '背包格在官方面板内（未 reparent）：' + gridAncestor);
  check('fg:bag-grid-visible', (await fdisp('#backpackGrid')) === 'grid', '背包页签官方格可见 display=' + (await fdisp('#backpackGrid')));
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="900105"]'); t && t.click(); });
  await F().waitForFunction(() => { const g = document.getElementById('srfgGrid'); return g && g.querySelectorAll('.item').length === 3; }, null, { timeout: 8000 });
  check('fg:ctn-tab-grid', (await fdisp('#backpackGrid')) === 'none' && (await fhas('#srfgGrid')), '柜页签：官方格 display:none、mod 格渲染');
  const fuelCnt = await F().evaluate(() => document.querySelectorAll('#srfgGrid .item.is-fuel').length);
  check('fg:ctn-tab-fuel-badge', fuelCnt === 2, '燃料火苗角标 2/3（木柴+柴油，零件无）=' + fuelCnt);
  const imgCnt = await F().evaluate(() => document.querySelectorAll('#srfgGrid .item img').length);
  check('fg:ctn-tab-icons', imgCnt === 3, '柜格物品图标 icfg.icon 渲染 3/3（终审 Minor5：X 占位残留）=' + imgCnt);
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="bag"]'); t && t.click(); });
  await F().waitForFunction(() => getComputedStyle(document.getElementById('backpackGrid')).display === 'grid', null, { timeout: 8000 });
  check('fg:bag-tab-restore', true, '切回背包页签：官方格恢复可见');

  /* ---- ③ tidy-btn ---- */
  check('fg:foot-only-tidy', await F().evaluate(() => { const f = document.getElementById('srfgFoot'); return !!f && f.querySelectorAll('button').length === 1 && f.textContent.indexOf('一键整理') >= 0; }), '底行仅一键整理一钮');
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="900106"]'); t && t.click(); });
  await page.waitForTimeout(120);
  await drain();
  await F().evaluate(() => document.querySelector('#srfgFoot button').click());
  await page.waitForTimeout(120);
  let d = JSON.parse(await drain());
  check('fg:tidy-ctn-owner', d.length === 1 && d[0].op === 'tidy' && Number(d[0].owner) === 900106, '柜页签整理 owner=900106：' + JSON.stringify(d));
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="bag"]'); t && t.click(); });
  await page.waitForTimeout(80);
  await F().evaluate(() => document.querySelector('#srfgFoot button').click());
  await page.waitForTimeout(120);
  d = JSON.parse(await drain());
  check('fg:tidy-bag-owner', d.length === 1 && d[0].op === 'tidy' && Number(d[0].owner) === 900001, '背包页签整理 owner=900001：' + JSON.stringify(d));

  /* ---- ④ ad-keys ---- */
  await F().evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true })));
  await page.waitForTimeout(80);
  check('fg:ad-iframe-d', (await activeTab()) === '900105', 'iframe 内 D 键→下一签（bag→900105）：' + (await activeTab()));
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true })));
  await page.waitForTimeout(80);
  check('fg:ad-root-d', (await activeTab()) === '900106', 'Root 派发 D 键→下一签（900105→900106）：' + (await activeTab()));
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })));
  await page.waitForTimeout(80);
  check('fg:ad-root-a', (await activeTab()) === '900105', 'Root 派发 A 键→上一签：' + (await activeTab()));
  await page.getByRole('button', { name: 'Cooking', exact: true }).click();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true })));
  await page.waitForTimeout(150);
  check('fg:ad-no-leak', (await activeTab()) === '900105', '切走场景后 Root D 键无效（不泄漏）：' + (await activeTab()));
  await page.getByRole('button', { name: 'FuelGenerator', exact: true }).click();
  await waitFg();

  /* ---- ⑤ feed-cmd ---- */
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="900105"]'); t && t.click(); });
  await F().waitForFunction(() => { const g = document.getElementById('srfgGrid'); return g && g.querySelectorAll('.item').length === 3; }, null, { timeout: 8000 });
  await drain();
  await F().evaluate(() => document.querySelector('#srfgGrid .item.is-fuel').click());
  await page.waitForTimeout(150);
  d = JSON.parse(await drain());
  check('fg:feed-cmd-json', d.length === 1 && d[0].op === 'feed' && Number(d[0].owner) === 900105 && Number(d[0].item) === 921, '点木柴→drain feed 921：' + JSON.stringify(d));
  await F().waitForFunction(() => { const g = document.getElementById('srfgGrid'); return g && g.querySelectorAll('.item').length === 2; }, null, { timeout: 8000 });
  const qCnt = await page.evaluate(() => window.__HZ_FGQ__().length);
  check('fg:feed-mock-applied', qCnt === 1, 'mock 队列+1（回推后格 3→2）=' + qCnt);
  await drain();
  await F().evaluate(() => { const els = document.querySelectorAll('#srfgGrid .item'); for (let i = 0; i < els.length; i++) if (!els[i].classList.contains('is-fuel')) { els[i].click(); break; } });
  await page.waitForTimeout(150);
  const warnNonFuel = await ftxt('#srfgWarn');
  d = JSON.parse(await drain());
  check('fg:feed-nonfuel-warn', warnNonFuel === '只能添加燃料' && d.length === 0, '点零件→「只能添加燃料」且零命令：' + warnNonFuel + ' drain=' + d.length);

  /* ---- ⑥ full-precheck ---- */
  await page.evaluate(() => {
    const q = []; for (let i = 0; i < 8; i++) q.push({ emoji: '🪵', name: '木柴', pct: '95%' });
    window.__HZ_POST__('FuelGenerator', { type: 'WebUI_FuelGenerator_BagMsg', data: { fuelItems: q } });
  });
  await page.waitForTimeout(200);
  await drain();
  await F().evaluate(() => document.querySelector('#srfgGrid .item.is-fuel') && document.querySelector('#srfgGrid .item.is-fuel').click());
  await page.waitForTimeout(150);
  const warnFull = await ftxt('#srfgWarn');
  d = JSON.parse(await drain());
  check('fg:full-precheck', warnFull === '燃油槽已满' && d.length === 0, '满员→「燃油槽已满」零命令：' + warnFull + ' drain=' + d.length);

  /* ---- ⑦ feedfail-ctx（C# 权威拒绝回执消费） ---- */
  await page.evaluate(() => { window.__HZ_FEEDFAIL__ = 'bagfull'; window.__HZ_PUSH__('FuelGenerator'); });
  await page.waitForTimeout(250);
  check('fg:feedfail-bagfull', (await ftxt('#srfgWarn')) === '背包已满，无法转送', 'ctx.feedFail=bagfull→文案：' + (await ftxt('#srfgWarn')));
  await page.evaluate(() => { window.__HZ_FEEDFAIL__ = 'full'; window.__HZ_PUSH__('FuelGenerator'); });
  await page.waitForTimeout(250);
  check('fg:feedfail-full', (await ftxt('#srfgWarn')) === '燃油槽已满', 'ctx.feedFail=full→文案：' + (await ftxt('#srfgWarn')));
  await page.evaluate(() => { window.__HZ_FEEDFAIL__ = ''; window.__HZ_PUSH__('FuelGenerator'); });
  await page.waitForTimeout(2300);
  const warnGone = await F().evaluate((sel) => { const e = document.querySelector(sel); return !e || e.hidden ? '' : (e.textContent || ''); }, '#srfgWarn');
  check('fg:feedfail-oneshot', warnGone === '', '清零重推→警示淡出（一次性，断言可见文本）："' + warnGone + '"');

  /* ---- ⑧ width-lock + 实机四缺陷（2026-11-07 修复批回归） ---- */
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="bag"]'); t && t.click(); });
  await page.waitForTimeout(120);
  const wBag = await panelW();
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="900105"]'); t && t.click(); });
  await page.waitForTimeout(120);
  const wCtn = await panelW();
  check('fg:width-lock-tabs', wBag === wCtn && wBag > 500, '背包/柜页签面板宽恒定：' + wBag + '==' + wCtn);
  /* ⑧b foot-right（实机缺陷③：整理按钮跑左——.srfg-foot 类漏挂致无 justify-content:flex-end） */
  const footStyle = await F().evaluate(() => {
    const f = document.getElementById('srfgFoot'), panel = document.querySelector('.generator-system > .panel:not(.gen-panel)');
    if (!f || !panel) return null;
    const cs = getComputedStyle(f), btn = f.querySelector('button');
    return { disp: cs.display, jc: cs.justifyContent, gap: btn ? panel.getBoundingClientRect().right - btn.getBoundingClientRect().right : -1 };
  });
  check('fg:foot-right', !!footStyle && footStyle.disp === 'flex' && footStyle.jc === 'flex-end' && footStyle.gap >= 0 && footStyle.gap < 45,
    '底行右贴：flex/' + (footStyle && footStyle.jc) + '（按钮-面板右缘 gap=' + (footStyle && footStyle.gap.toFixed(1)) + 'px）');
  /* ⑧c arrows-always（实机缺陷①：‹› 溢出门在燃料柜少时永不显形=「按钮没有」——改常驻+端点禁用） */
  const arr2 = await F().evaluate(() => {
    const l = document.querySelector('#srfgTabs .srfg-tabbtn-l'), r = document.querySelector('#srfgTabs .srfg-tabbtn-r');
    return { l: l ? getComputedStyle(l).display : 'missing', r: r ? getComputedStyle(r).display : 'missing',
      dl: l ? l.disabled : null, dr: r ? r.disabled : null };
  });
  check('fg:arrows-always', arr2.l === 'flex' && arr2.r === 'flex' && arr2.dl === true && arr2.dr === true,
    '2 燃料柜无溢出：‹› 仍常驻可见(flex)、两端点均禁用(' + arr2.dl + '/' + arr2.dr + ')');
  await page.evaluate(() => {
    const m = JSON.parse(JSON.stringify(window.__HZ_MOCKSET__()));
    for (let i = 0; i < 4; i++) m.ctn.push([900200 + i, '备用燃料柜' + i, 'c', 24, 1013]);
    window.__HZ_MOCKSET__(m); window.__HZ_PUSH__('FuelGenerator');
  });
  await page.waitForTimeout(500);
  const wMany = await panelW();
  const arrows = await F().evaluate(() => {
    const l = document.querySelector('#srfgTabs .srfg-tabbtn-l'), r = document.querySelector('#srfgTabs .srfg-tabbtn-r');
    return { l: l ? getComputedStyle(l).display : 'missing', r: r ? getComputedStyle(r).display : 'missing',
      dl: l ? l.disabled : null, dr: r ? r.disabled : null, n: document.querySelectorAll('#srfgTabs .srfg-tab').length };
  });
  check('fg:width-lock-overflow', wMany === wBag && arrows.n === 7 && arrows.l !== 'none' && arrows.r !== 'none' && arrows.dl === true && arrows.dr === false,
    '6 燃料柜页签：‹›常驻(' + arrows.l + '/' + arrows.r + ') 左禁右活(' + arrows.dl + '/' + arrows.dr + ')、宽不变 ' + wMany + '==' + wBag + ' tabs=' + arrows.n);
  /* ⑧d tall-ctn-scroll（实机缺陷②：高柜无滚动=溢出界面外——#srfgBody 需定高+overflow，锁漏=溢出） */
  await page.evaluate(() => {
    const m = JSON.parse(JSON.stringify(window.__HZ_MOCKSET__()));
    m.ctn.push([900300, '高燃料柜', 'c', 240, 1013]); /* 12 列 ×20 行，远超锁定面板高 */
    window.__HZ_MOCKSET__(m); window.__HZ_PUSH__('FuelGenerator');
  });
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="900300"]'); t && t.click(); });
  await F().waitForFunction(() => { const g = document.getElementById('srfgGrid'); return g && g.querySelectorAll('.slot').length === 240; }, null, { timeout: 8000 });
  await page.waitForTimeout(150);
  const tallState = await F().evaluate(() => {
    const g = document.getElementById('srfgGrid'), panel = document.querySelector('.generator-system > .panel:not(.gen-panel)');
    const foot = document.getElementById('srfgFoot'), tabs = document.getElementById('srfgTabs');
    return { sh: g.scrollHeight, ch: g.clientHeight, ovY: getComputedStyle(g).overflowY,
      spill: g.getBoundingClientRect().bottom - panel.getBoundingClientRect().bottom,
      footIn: foot.getBoundingClientRect().bottom - panel.getBoundingClientRect().bottom,
      tabsIn: tabs.getBoundingClientRect().top - panel.getBoundingClientRect().top };
  });
  check('fg:tall-ctn-scroll', tallState.sh > tallState.ch + 20 && tallState.ovY === 'auto' && tallState.spill <= 1 && tallState.footIn <= 1 && tallState.tabsIn >= -1,
    '20 行高柜：格区内部滚动(' + tallState.sh + '>' + tallState.ch + ', ' + tallState.ovY + ')、格/底行/页签零溢出(spill=' + tallState.spill.toFixed(1) + ' foot=' + tallState.footIn.toFixed(1) + ' tabs=' + tallState.tabsIn.toFixed(1) + ')');
  /* ⑧e bag-grid-scroll（背包 18 行=真实玩家袋，锁定面板内滚动——缺陷②背包侧+缺陷④前提） */
  await F().evaluate(() => { const t = document.querySelector('#srfgTabs .srfg-tab[data-id="bag"]'); t && t.click(); });
  await page.waitForTimeout(150);
  const bagState = await F().evaluate(() => {
    const g = document.getElementById('backpackGrid'), panel = document.querySelector('.generator-system > .panel:not(.gen-panel)');
    return { sh: g.scrollHeight, ch: g.clientHeight, ovY: getComputedStyle(g).overflowY, lock: panel.style.height,
      spill: g.getBoundingClientRect().bottom - panel.getBoundingClientRect().bottom };
  });
  check('fg:bag-grid-scroll', bagState.sh > bagState.ch + 20 && bagState.ovY === 'auto' && bagState.spill <= 1 && !!bagState.lock && parseInt(bagState.lock) < 800,
    '背包 18 行：锁定面板(' + bagState.lock + '，<800=非拉伸值)内滚动(' + bagState.sh + '>' + bagState.ch + ')、零溢出(' + bagState.spill.toFixed(1) + 'px)');
  /* ⑧f race-late-data（真实页时序取证：官方格仅在 BagMsg 到达时首渲（refresh→initGrid），此前恒空——
     装配必须等数据、且晚到后宽/高锁取值正确。旧一次性 px 锁类缺陷的回归床） */
  await page.evaluate(() => { window.__HZ_FGNUDGE__ = false; });
  await F().evaluate(() => location.reload()).catch(() => { }); /* reload 自毁执行上下文=预期 */
  await page.waitForTimeout(900); /* 等旧文档销毁、F() 重解析到新帧（否则 waitForFunction 会命中最旧文档残影） */
  const emptyState = await F().evaluate(() => ({ slots: document.getElementById('backpackGrid').children.length, tabs: !!document.getElementById('srfgTabs') }));
  check('fg:race-empty-wait', emptyState.slots === 0 && !emptyState.tabs,
    'BagMsg 前格恒空：装配正确等待不早产=' + JSON.stringify(emptyState));
  await page.waitForTimeout(600); /* 制造数据晚到窗口 */
  await page.evaluate(() => {
    document.getElementById('FuelGenerator').contentWindow.postMessage({ type: 'WebUI_FuelGenerator_BagMsg', data: { bagOwnerId: 900001, bagCols: 12, bagRows: 18, bagItems: [], fuelSlotCount: 8, fuelItems: [], generatorName: '中型' } }, '*');
  });
  await F().waitForFunction(() => document.getElementById('srfgTabs') && document.getElementById('backpackGrid').querySelectorAll('.slot').length === 216, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const raceState = await F().evaluate(() => {
    const panel = document.querySelector('.generator-system > .panel:not(.gen-panel)');
    const tabs = document.getElementById('srfgTabs');
    return { w: panel.offsetWidth, wLock: panel.style.width, lock: panel.style.height, zoom: document.body.style.zoom || '',
      tabsVis: tabs.getBoundingClientRect().height > 0, sysCls: document.querySelector('.generator-system').className };
  });
  check('fg:race-late-mount-sane', raceState.w >= 598 && !raceState.wLock && !!raceState.lock && parseInt(raceState.lock) < 800 && raceState.tabsVis && /srfg-sys/.test(raceState.sysCls) && raceState.zoom === '',
    '数据晚到装配：宽 ' + raceState.w + '（无 inline 宽锁=' + !raceState.wLock + '）、高锁 ' + raceState.lock + '（<800=非拉伸值）、页签可见、zoom 复位="' + raceState.zoom + '"、system 断 stretch(' + raceState.sysCls + ')');
  await page.evaluate(() => { window.__HZ_FGNUDGE__ = true; });
  /* ⑧g reopen-bagheight（实机缺陷④全链复现：调高背包行数→重开→页签栏可见、格区滚动不溢出） */
  await page.evaluate(() => { window.__HZ_FGROWS__ = 24; });
  await F().evaluate(() => location.reload()).catch(() => { }); /* reload 自毁执行上下文=预期 */
  await page.waitForTimeout(900); /* 等旧文档销毁、F() 重解析到新帧 */
  await F().waitForFunction(() => document.getElementById('srfgTabs') && document.getElementById('backpackGrid').querySelectorAll('.slot').length === 288, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  const reopenState = await F().evaluate(() => {
    const panel = document.querySelector('.generator-system > .panel:not(.gen-panel)');
    const tabs = document.getElementById('srfgTabs'), foot = document.getElementById('srfgFoot');
    const g = document.getElementById('backpackGrid');
    const pr = panel.getBoundingClientRect(), tr = tabs.getBoundingClientRect();
    return { w: panel.offsetWidth, h: panel.offsetHeight, lock: panel.style.height, zoom: document.body.style.zoom || '', tabsIn: tr.top >= pr.top - 1,
      tabsVis: tr.top >= 0 && tr.bottom <= window.innerHeight, footVis: foot.getBoundingClientRect().bottom <= window.innerHeight,
      sh: g.scrollHeight, ch: g.clientHeight };
  });
  check('fg:reopen-bagheight-tabs', reopenState.tabsIn && reopenState.tabsVis && reopenState.w >= 598 && !!reopenState.lock && reopenState.zoom === '',
    '24 行背包重开：页签在面板内且视口内可见(面板 ' + reopenState.w + '×' + reopenState.h + ' 高锁=' + reopenState.lock + ' zoom="' + reopenState.zoom + '")');
  check('fg:reopen-bagheight-contain', reopenState.sh > reopenState.ch && reopenState.footVis,
    '24 行背包重开：格区内部滚动(' + reopenState.sh + '>' + reopenState.ch + ')、底行在视口内');
  await page.evaluate(() => { window.__HZ_FGROWS__ = 18; });

  /* ---- ⑨ no-fuel-cabinets（Review Focus 1：无燃料柜=原版） ---- */
  await page.evaluate(() => {
    const m = JSON.parse(JSON.stringify(window.__HZ_MOCKSET__()));
    m.ctn = m.ctn.filter((c) => c[4] !== 1013);
    window.__HZ_MOCKSET__(m); window.__HZ_PUSH__('FuelGenerator');
  });
  await page.waitForTimeout(900);
  check('fg:no-fuel-teardown', !(await fhas('#srfgTabs')) && !(await fhas('#srfgFoot')) && !(await fhas('#srfgGrid')), '页签栏/底行/mod 格全部拆除');
  check('fg:no-fuel-official-back', (await fdisp('#bagPanelTitle')) !== 'none' && (await fdisp('#bagInfoBar')) !== 'none' && (await fdisp('#shiftHint')) !== 'none' && (await fdisp('#backpackGrid')) === 'grid',
    '官方 title/info-bar/hint/grid 四件全显');

  /* ---- ⑩b cfg 开关（终审 Important1：EnableFuelGen 经 ctx.fgOn 全链生效） ---- */
  await page.evaluate(() => {
    const m = JSON.parse(JSON.stringify(window.__HZ_MOCKSET__()));
    /* ⑨ 已剥 1013 柜——补回两条燃料柜（在残余集上 concat，勿再 filter 1013=空集陷阱） */
    m.ctn = m.ctn.concat([[900105, '燃料柜·大号', 'c', 48, 1013], [900106, '柴油储存', 'c', 24, 1013]]);
    window.__HZ_MOCKSET__(m); window.__HZ_FGON__ = false; window.__HZ_PUSH__('FuelGenerator');
  });
  await page.waitForTimeout(900);
  check('fg:cfg-off-teardown', !(await fhas('#srfgTabs')) && !(await fhas('#srfgFoot')) && (await fdisp('#bagPanelTitle')) !== 'none',
    'ctx.fgOn=false→mod DOM 全拆+官方元素还原（EnableFuelGen 消费链）');
  await page.evaluate(() => { window.__HZ_FGON__ = true; window.__HZ_PUSH__('FuelGenerator'); });
  await waitFg();
  check('fg:cfg-on-restore', await fhas('#srfgTabs'), 'ctx.fgOn=true→页签回装（开关往返）');

  /* ---- ⑩ console-clean ---- */
  check('fg:console-clean', consoleErrors.length === 0 && pageErrors.length === 0,
    'console errors=' + consoleErrors.length + ' pageerrors=' + pageErrors.length + (consoleErrors[0] ? ' 首条:' + consoleErrors[0] : '') + (pageErrors[0] ? ' 首条:' + pageErrors[0] : ''));

  const fails = results.filter((r) => !r.ok).length;
  console.log((fails === 0 ? 'ALL PASS' : fails + ' FAIL') + ' | ' + results.length + ' 断言');
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
