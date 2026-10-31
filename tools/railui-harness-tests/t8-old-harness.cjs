/* T8 旧 harness（railui-harness.html）回归：T4 定稿断言的 compact 子集——
   mount 升级（CSS 注入/旧包裹摘除/data-interactive）与装配区空转不破坏既有路径。 */
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource|net::ERR_/.test(t)) return;
    consoleErrors.push(t);
  });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(BASE + '/railui-harness.html', { waitUntil: 'load' });
  await page.waitForSelector('#srRail', { timeout: 8000 });

  /* 装配区空转（无 #iframe-container → 扫描早退）不产生副作用：无观察器异常、无重复挂载 */
  const initial = await page.evaluate(() => {
    const R = window.__CERAIL__;
    const rail = document.getElementById('srRail');
    return {
      ver: R && R.ver,
      scanFn: typeof R.scan,
      scenesKeys: Object.keys(R.scenes).length,
      railsInDoc: document.querySelectorAll('#srRail').length,
      srpCount: document.querySelectorAll('#srp').length,
      interactive: rail ? rail.hasAttribute('data-interactive') : false,
      wrapInteractive: document.getElementById('srp') ? document.getElementById('srp').hasAttribute('data-interactive') : false,
      w: rail ? rail.offsetWidth : 0,
      title: (document.getElementById('srTitle') || {}).textContent || '',
      cols: (document.getElementById('srCols') || {}).textContent || '',
      cap: (document.getElementById('srCap') || {}).textContent || '',
      gridCells: document.querySelectorAll('#srGrid .sr-slot').length,
      chips: document.querySelectorAll('#srTagRow .sr-tag').length,
      keysWritten: ['srp_pin_order_Cooking', 'srp_common_tags_Cooking', 'srp_custom_tags', 'srp_ctn_names', 'srp_ctn_tags'].filter((k) => localStorage.getItem(k) != null)
    };
  });
  check('old:contract', initial.ver === 1 && initial.scanFn === 'function' && initial.scenesKeys === 12, `ver=${initial.ver} scan=${initial.scanFn} scenes=${initial.scenesKeys}`);
  check('old:single-mount', initial.srpCount === 1, `#srp × ${initial.srpCount}（装配区空转未造成重复挂载）`);
  check('old:initial-state', initial.title === '背包' && initial.cols === '10 列' && initial.cap === ' · 42 格' && initial.gridCells === 50 && initial.chips === 6,
    `title=${initial.title} ${initial.cols}${initial.cap} cells=${initial.gridCells} chips=${initial.chips}`);
  check('old:no-persist-on-default', initial.keysWritten.length === 0, '默认值只读不写 ✓ ' + (initial.keysWritten.join(',') || '(空)'));
  check('old:clickthrough-attr', initial.interactive && initial.wrapInteractive, 'rail/srp data-interactive 在位（T8 升级保留）');
  check('old:size', initial.w === 428, initial.w + 'px');

  /* 搜索（真实输入） */
  await page.fill('#srSearch', '铁钉');
  await page.waitForTimeout(80);
  const search = await page.evaluate(() => ({
    rows: document.querySelectorAll('#srGrid .sr-slot:not(.empty)').length,
    fill: (document.getElementById('srFill') || {}).textContent || ''
  }));
  check('old:search', search.rows === 2 && /2 \/ 42 格/.test(search.fill), `rows=${search.rows} fill=${search.fill}`);
  await page.fill('#srSearch', '');

  /* 全库切换：强制列表 + 锁分段；退出恢复 */
  await page.click('#srScope');
  await page.waitForTimeout(60);
  const globalOn = await page.evaluate(() => ({
    title: document.getElementById('srTitle').textContent,
    lock: document.getElementById('srSeg').classList.contains('lock'),
    fill: document.getElementById('srFill').textContent
  }));
  check('old:global', globalOn.title === '全库搜索' && globalOn.lock && /匹配 19 件/.test(globalOn.fill),
    `title=${globalOn.title} lock=${globalOn.lock} ${globalOn.fill}`);
  await page.click('#srScope');
  await page.waitForTimeout(60);

  /* 场景切换 MaterialRack：无背包页签 + 入口=rackOwner；切回 Cooking 全量复原（旧包裹摘除路径） */
  await page.click('#hzBtnRack');
  await page.waitForSelector('#srRail', { timeout: 8000 });
  await page.waitForTimeout(120);
  const rack = await page.evaluate(() => ({
    scene: window.__CERAIL__.state.scene,
    mains: document.querySelectorAll('#srPinRow .sr-pin.main').length,
    cur: window.__CERAIL__.state.currentId,
    bagonly: document.getElementById('srRail').classList.contains('bagonly')
  }));
  check('old:rack-scene', rack.scene === 'MaterialRack' && rack.mains === 0 && rack.cur === 900103, `scene=${rack.scene} mains=${rack.mains} cur=${rack.cur}`);

  await page.click('#hzBtnCook');
  await page.waitForSelector('#srRail', { timeout: 8000 });
  await page.waitForTimeout(120);
  const back = await page.evaluate(() => ({
    rails: document.querySelectorAll('#srRail').length,
    cur: window.__CERAIL__.state.currentId,
    chips: document.querySelectorAll('#srTagRow .sr-tag').length
  }));
  check('old:back-to-cooking', back.rails === 1 && back.cur === 900001 && back.chips === 6,
    `rails=${back.rails} cur=${back.cur} chips=${back.chips}（旧包裹摘除幂等）`);

  /* bagonly（BackpackUI 假宿主） */
  await page.click('#hzBtnBag');
  await page.waitForSelector('#srRail', { timeout: 8000 });
  await page.waitForTimeout(120);
  const bag = await page.evaluate(() => {
    const rail = document.getElementById('srRail');
    return {
      bagonly: rail.classList.contains('bagonly'),
      barHidden: getComputedStyle(document.querySelector('.sr-ctnbar')).display === 'none',
      scene: window.__CERAIL__.state.scene
    };
  });
  check('old:bagonly', bag.bagonly && bag.barHidden && bag.scene === 'BackpackUI', JSON.stringify(bag));

  /* mount 返回值（T8 签名升级）：先复位 Cooking 假宿主（上一场景切换已把该 pane 的宿主
     替换成 rail——无宿主时 mount 返回 false 属正确守卫），再直调断言 true/false 两态 */
  const mountRet = await page.evaluate(() => {
    const noHost = window.__CERAIL__.mount(document, 'Cooking'); /* 无宿主：守卫 false */
    const pane = document.getElementById('hzSceneCook');
    pane.innerHTML = '<div class="panel"><i id="bagTabs" hidden></i></div>';
    const ok = window.__CERAIL__.mount(document, 'Cooking');     /* 宿主在位：装配 true */
    return { noHost, ok };
  });
  check('old:mount-returns', mountRet.noHost === false && mountRet.ok === true,
    `无宿主=${mountRet.noHost}（守卫） 有宿主=${mountRet.ok}（T8 签名）`);
  await page.click('#hzBtnCook');
  await page.waitForTimeout(120);
  await page.click('#srPinRow [data-ctn="900103"]');
  await page.waitForTimeout(60);
  const switchCtn = await page.evaluate(() => ({
    cur: window.__CERAIL__.state.currentId,
    title: document.getElementById('srTitle').textContent
  }));
  check('old:tab-switch', switchCtn.cur === 900103 && switchCtn.title === '材料架', `cur=${switchCtn.cur} title=${switchCtn.title}`);

  check('old:console-zero', consoleErrors.length === 0, consoleErrors.slice(0, 3).join('||') || '0 错误');
  check('old:pageerror-zero', pageErrors.length === 0, pageErrors.slice(0, 3).join('||') || '0 异常');

  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log('\n==== OLD-HARNESS SUMMARY: ' + (results.length - fails.length) + '/' + results.length + ' PASS ====');
  if (fails.length) { fails.forEach((f) => console.log('FAIL: ' + f.name + ' | ' + f.detail)); process.exit(1); }
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
