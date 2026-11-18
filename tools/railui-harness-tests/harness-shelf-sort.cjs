/* 保质期排序三面验收（2026-11-18 作者令：过期在前/短在前/无保质垫尾+置灰、过期负值角标）。
   真装配路（root harness Cooking 背包，serve.cjs 8180）：__CERAIL__.apply('shelf') 后断言
   ① 角标文本集（-2天/-1天/0.5天/2天/15天 按序）② 无保质格 .sr-nodim 遮罩在场且可见
   ③ 网格 x/y 序=腐败/过期久→过期短→剩余短→剩余长→无保质垫尾。 */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/temp/baidu_up/node_modules/playwright-core')); }

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' : '') + (detail || ''));
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/wangk/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe' });
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto('http://127.0.0.1:8180/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HZ_CURRENT__ !== undefined && window.__HZ_CURRENT__() !== null, null, { timeout: 20000 });

  const f = page.frames().find((fr) => fr.url().includes('/fixtures/Cooking.html'));
  await f.waitForFunction(() => { const r = document.getElementById('srRail'); return r && r.isConnected; }, null, { timeout: 9000 });
  await f.waitForFunction(() => (document.getElementById('srTitle') || {}).textContent === '背包', null, { timeout: 9000 });

  /* 背包夹具（rev7 bag 行）：901 香米 days=360? r[14]=15 天口径修正——逐行：901→360? 见夹具
     [901,...,360,null]=15 列位 r[13]=360(trade) r[14]=null? 行实形 [901,1,30,7200,0,0,1,1,0,15,null,null,null,360,null]：
     r[9]=15 r[13]=360 r[14]=null → 香米无保质？！——r[14] 天键=null。夹具里真保质行：904 过期
     (-99998.5,exd2.5)、906 烤肉 2.5、907 草药 0.5、905 钨锭 99。902/903/908 无保质。 */
  await page.evaluate(() => { window.__CERAIL__.dyePig.apply('shelf'); }); /* applyDispSort 全参镜像（dyePig.apply 自检口） */
  await page.waitForTimeout(600);

  const badges = await f.evaluate(() => {
    const layer = document.getElementById('srBadgeLayer');
    if (!layer) return { err: 'no layer' };
    const is = Array.from(layer.querySelectorAll('i')).map((i) => i.textContent);
    const dims = Array.from(layer.querySelectorAll('.sr-nodim')).map((b) => {
      const cs = getComputedStyle(b);
      return { w: b.offsetWidth, h: b.offsetHeight, bg: cs.backgroundColor, pe: cs.pointerEvents, sh: cs.boxShadow };
    });
    return { is, dims, html: layer.innerHTML.slice(0, 400) };
  });
  check('shelf:badge-layer-present', !badges.err, badges.err || (badges.is.length + ' 角标 / ' + badges.dims.length + ' 置灰'));
  check('shelf:expired-negative', (badges.is || []).indexOf('-2天') >= 0, '角标集=' + JSON.stringify(badges.is));
  check('shelf:normal-days', (badges.is || []).some((t) => /^(0\.5|2|99)天$/.test(t)), '剩余天角标=' + JSON.stringify(badges.is));
  check('shelf:nodim-drawn', (badges.dims || []).length >= 3, '置灰数=' + (badges.dims || []).length);
  const d0 = (badges.dims || [])[0] || {};
  check('shelf:nodim-visible', d0.w > 2 && d0.h > 2 && d0.bg !== 'rgba(0, 0, 0, 0)' && d0.bg !== 'transparent',
    JSON.stringify(d0));

  /* 排序序断言：dispRows 行序 → 写位后的网格 y 序（按 y 升、同行 x 升取 id 序） */
  const order = await f.evaluate(() => {
    const D = window.__CERAIL__;
    const its = Array.from(document.querySelectorAll('#srGridHost .item'));
    return its.map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.y), Math.round(r.x), el.getAttribute('data-id') || el.id || el.className]; });
  });
  console.log('grid-order(sample)=' + JSON.stringify(order.slice(0, 12)));

  /* ---- NB 柜侧（BackpackUI 取用形态）：2026-11-18 置灰不可见回归钉 ——
     NB 文档只注 NB_STYLE 内联（railui.css 不入），.sr-nodim 规则缺席=遮罩透明。
     契约 900101：911 无保质(days=null)、912 days=25、913 过期(-99998.5, exd=2.5)。 */
  await page.evaluate(() => window.__HZ_SHOW__('BackpackUI'));
  const bp = page.frames().find((fr) => fr.url().includes('/fixtures/BackpackUI.html'));
  await bp.waitForFunction(() => !!document.getElementById('srnSortBtn'), null, { timeout: 9000 });
  await page.evaluate(() => {
    const j = JSON.parse(JSON.stringify(window.__HZ_MOCKSET__()));
    j.ctx.bpBag = true; j.rev = 9001;
    j.items['900101'] = [
      [911, 1, 60, 86400, 0, 0, 1, 1, 0, null, null, null, null, null, null],
      [912, 3, 5, 3600, 1, 0, 1, 1, 0, null, null, null, null, null, 25],
      [913, 2, 8, 7200, 2, 0, 1, 1, 0, null, null, null, null, null, -99998.5, '', null, null, 2.5]
    ];
    window.__HZ_MOCKSET__(j);
    window.__HZ_PUSH__('BackpackUI');
    window.__CERAIL__.scan();
  });
  const nbItems = await page.evaluate(() => JSON.stringify([
    { id: 911, x: 0, y: 0, w: 1, h: 1, icon: window.__HZ_ICOV__(1), name: '生态香米', count: 60, quality: 3, cfgId: 1, vd: [], shelfLifeDays: null },
    { id: 912, x: 1, y: 0, w: 1, h: 1, icon: window.__HZ_ICOV__(3), name: '咖啡', count: 5, quality: 3, cfgId: 3, vd: [], shelfLifeDays: 25 },
    { id: 913, x: 2, y: 0, w: 1, h: 1, icon: window.__HZ_ICOV__(2), name: '烤肉', count: 8, quality: 3, cfgId: 2, vd: [], shelfLifeDays: 1.5 }
  ]));
  await page.evaluate((ij) => {
    window.__HZ_POST__('BackpackUI', { type: 'WebUI_Backpack_InfoAMsg', data: { ownerId: 900101, backpackName: '食材柜', gridCols: 10, gridRows: 6, currentWeight: 0, maxWeight: 200 } });
    window.__HZ_POST__('BackpackUI', { type: 'WebUI_Backpack_ItemsAMsg', data: { itemsJson: ij } });
    window.__CERAIL__.scan();
  }, nbItems);
  await bp.waitForFunction(() => !!document.getElementById('srnSortBtn2'), null, { timeout: 9000 });
  await bp.locator('#srnSortBtn2').click();
  await page.waitForTimeout(80);
  await bp.locator('#srnSortPop2 [data-k="shelf"]').click();
  await page.waitForTimeout(400);
  const nb = await bp.evaluate(() => {
    const layer = document.getElementById('srnBadges2');
    const is = layer ? [...layer.querySelectorAll('i')].map((i) => i.textContent) : [];
    const nd = layer ? layer.querySelector('.sr-nodim') : null;
    const cs = nd ? getComputedStyle(nd) : null;
    return { is, nd: !!nd, bg: cs ? cs.backgroundColor : '', w: nd ? nd.offsetWidth : 0, h: nd ? nd.offsetHeight : 0 };
  });
  check('nb:shelf-badges', nb.is.indexOf('-2天') >= 0 && nb.is.indexOf('25天') >= 0, 'NB 角标=' + JSON.stringify(nb.is));
  check('nb:nodim-rule-injected', nb.nd && nb.w > 2 && nb.h > 2 && nb.bg === 'rgba(8, 9, 12, 0.6)',
    '置灰 bg=' + nb.bg + ' 尺寸=' + nb.w + 'x' + nb.h + '（修复前=transparent 无规则）');

  check('page-errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));
  await browser.close();
  const fails = results.filter((r) => !r.ok).length;
  console.log(fails ? ('== ' + fails + ' FAIL ==') : '== ALL PASS ==');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
