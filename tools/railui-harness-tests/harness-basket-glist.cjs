/* 篮子救援 glist harness（basket spec 2026-11-09；serve.cjs 须已在 8180）。
   骨架（Task 4）：①篮子夹具结构（A/B 两 .bag-panel，B=is-basket-panel）②wish ctx 注入 →
   glist 面板进场于 A 侧（Task 5 接线后绿）③无 basket 键 → 面板不存在（零扰动骨架半）。
   后续节（chips 三态/徽章联动/右键/排序钮/满禁回执/切换钮）随 Task 5/6 追加。
   驱动：__HZ_BASKETMODE__ 置位后 __HZ_SHOW__('BackpackUI')（root harness 换篮子夹具，
   帧身份不变）；ctx.basket 经 __HZ_BASKET__ 旋钮。尾部：零 console error / pageerror。 */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/temp/baidu_up/node_modules/playwright-core')); }

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

  const frameDoc = () => page.evaluate(() => {
    var f = window.__HZ_FRAME__('BackpackUI');
    return f && f.contentDocument ? f.contentDocument : null;
  });
  const q = (sel) => page.evaluate((s) => {
    var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
    return d ? d.querySelectorAll(s).length : -1;
  }, sel);

  /* ---- §骨架 S1：篮子夹具结构 ---- */
  await page.evaluate(() => { window.__HZ_BASKETMODE__ = true; window.__HZ_BASKET__ = undefined; window.__HZ_GLISTON__ = undefined; });
  await page.evaluate(() => window.__HZ_SHOW__('BackpackUI'));
  await page.waitForFunction(() => {
    var f = window.__HZ_FRAME__('BackpackUI');
    var d = f && f.contentDocument;
    return !!(d && d.querySelector('.backpack-container .bag-panel.is-basket-panel'));
  }, null, { timeout: 20000 });
  check('S1-fixture-two-panels', await q('.backpack-container > .bag-panel') === 2, 'panels=' + await q('.backpack-container > .bag-panel'));
  check('S1-fixture-B-basket', await q('.bag-panel.is-basket-panel') === 1 && await q('.bag-panel.is-basket-panel .basket-send-btn') === 1, 'B 侧篮子面板在位');
  check('S1-fixture-A-grid', await q('.bag-panel:not(.is-basket-panel) .grid-container') === 1, 'A 侧官方格在位');

  /* ---- §骨架 S2：wish ctx 注入 → glist 面板进场 A 侧（Task 5 接线后绿；当前 RED）---- */
  await page.evaluate(() => window.__HZ_PUSH__('BackpackUI'));
  await page.waitForTimeout(900); /* 装配循环 500ms 兜底 + 渲染 */
  const s2 = await page.evaluate(() => {
    var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
    var p = d && d.getElementById('srgPanel');
    return {
      panel: !!p,
      inA: !!(p && p.closest('.bag-panel') && !p.closest('.bag-panel').classList.contains('is-basket-panel'))
    };
  });
  check('S2-glist-panel-in-A', s2.panel && s2.inA, JSON.stringify(s2));

  /* ---- §S4：B 侧篮子面板零改动（官方面板不动区）---- */
  {
    const b = await page.evaluate(() => {
      var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
      var bp = d.querySelector('.bag-panel.is-basket-panel');
      return {
        srgInB: !!bp.querySelector('#srgPanel, .srg-panel, [id^="srg"]'),
        sendBtn: !!bp.querySelector('.basket-send-btn'),
        gridIntact: !!bp.querySelector('.grid-container')
      };
    });
    check('S4-B侧零改动', !b.srgInB && b.sendBtn && b.gridIntact, JSON.stringify(b));
  }

  /* ---- §S5：列表↔格子切换（默认列表态；切格子=A 侧官方件复显、srg 折叠）---- */
  {
    const st0 = await page.evaluate(() => {
      var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
      var p = d.getElementById('srgPanel');
      var grid = d.querySelector('.bag-panel:not(.is-basket-panel) .grid-container');
      return { gridmode: p && p.classList.contains('srg-gridmode'), wrapHidden: grid && getComputedStyle(grid.parentElement).display === 'none' };
    });
    check('S5-默认列表态', st0.gridmode === false && st0.wrapHidden === true, JSON.stringify(st0));
    await page.evaluate(() => {
      var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
      d.getElementById('srgToggle').click();
    });
    await page.waitForTimeout(300);
    const st1 = await page.evaluate(() => {
      var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
      var p = d.getElementById('srgPanel');
      var grid = d.querySelector('.bag-panel:not(.is-basket-panel) .grid-container');
      return { gridmode: p && p.classList.contains('srg-gridmode'), wrapHidden: grid && getComputedStyle(grid.parentElement).display === 'none' };
    });
    check('S5-格子态官方复显', st1.gridmode === true && st1.wrapHidden === false, JSON.stringify(st1));
    await page.evaluate(() => { /* 切回列表态（后续节复用） */
      var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
      d.getElementById('srgToggle').click();
    });
    await page.waitForTimeout(300);
  }

  /* ---- §S6：搜索即时过滤（行集随输入收窄）---- */
  {
    const rowsAll = await page.evaluate(() => window.__HZ_FRAME__('BackpackUI').contentDocument.querySelectorAll('#srgList .srg-row').length);
    await page.evaluate(() => {
      var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
      var q = d.getElementById('srgQ');
      q.value = '铁';
      q.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(250);
    const rowsFiltered = await page.evaluate(() => window.__HZ_FRAME__('BackpackUI').contentDocument.querySelectorAll('#srgList .srg-row').length);
    const rowText = await page.evaluate(() => {
      var r = window.__HZ_FRAME__('BackpackUI').contentDocument.querySelector('#srgList .srg-row');
      return r ? r.textContent : '';
    });
    check('S6-搜索过滤', rowsAll > 0 && rowsFiltered >= 1 && rowsFiltered < rowsAll && rowText.indexOf('铁') >= 0,
      'all=' + rowsAll + ' filtered=' + rowsFiltered + ' hit=' + rowText.slice(0, 20));
    await page.evaluate(() => {
      var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
      var q = d.getElementById('srgQ');
      q.value = '';
      q.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(250);
  }

  /* ================= Task 6 组：chips 三态 / aid 徽章 / 禁入 / nowish 排序 / feedFail ================= */

  const pushBasket = async (b) => {
    await page.evaluate((bb) => { window.__HZ_BASKET__ = bb; }, b);
    await page.evaluate(() => window.__HZ_PUSH__('BackpackUI'));
    await page.waitForTimeout(350);
  };
  const rowInfo = () => page.evaluate(() => {
    var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
    return Array.prototype.map.call(d.querySelectorAll('#srgList .srg-row'), function (r) {
      return {
        name: (r.querySelector('.srg-name') || {}).textContent || '',
        cat: r.getAttribute('data-cat'),
        dim: r.classList.contains('srg-dim'),
        badge: (r.querySelector('.srg-badge') || {}).textContent || '',
        badgeTitle: (function (b) { return b ? (b.getAttribute('title') || '') : ''; })(r.querySelector('.srg-badge'))
      };
    });
  });
  const chipTexts = () => page.evaluate(() => {
    var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
    var els = d.querySelectorAll('#srgChips .srg-chip, #srgChips .srg-plaque, #srgChips .srg-sortbtn');
    return Array.prototype.map.call(els, function (c) { return (c.className.indexOf('srg-chip') >= 0 ? 'C:' : 'P:') + c.textContent.trim() + '[' + (c.getAttribute('data-c') || c.getAttribute('data-k') || '') + ']'; });
  });

  /* ---- §C1 wish 态：chips=今日许愿（含 ⚠ 危机枚）+常驻贡献排序牌 ---- */
  await pushBasket(undefined); /* 默认 wish mock */
  {
    const ct = await chipTexts();
    check('C1-wish-chips', ct.some((t) => t.indexOf('C:材料[9]') === 0) && ct.some((t) => t.indexOf('C:⚠ 药品[2]') === 0) && ct.some((t) => t.indexOf('按救助贡献') >= 0 && t.indexOf('P:') === 0),
      JSON.stringify(ct));
  }
  /* ---- §C2 wish 单选筛选：点材料 → 全行 catId=9；再点同枚=取消回全部 ---- */
  {
    await page.evaluate(() => {
      var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
      var chip = d.querySelector('#srgChips .srg-chip[data-c="9"]');
      chip.click();
    });
    await page.waitForTimeout(250);
    const rowsMat = await rowInfo();
    const allMat = rowsMat.length > 0 && rowsMat.every((r) => r.cat === '9');
    check('C2-点材料只看材料', allMat, JSON.stringify(rowsMat.map((r) => [r.name, r.cat])));
    await page.evaluate(() => window.__HZ_FRAME__('BackpackUI').contentDocument.querySelector('#srgChips .srg-chip[data-c="9"]').click());
    await page.waitForTimeout(250);
    const rowsAll = await rowInfo();
    check('C2b-再点同枚回全部', rowsAll.length > rowsMat.length, 'mat=' + rowsMat.length + ' all=' + rowsAll.length);
  }

  /* ---- §B 徽章：21→6 联动（篮子内容变化→scores 变→徽章刷新）+悬停链路 ---- */
  {
    await pushBasket(undefined);
    let rows = await rowInfo();
    const nail = rows.find((r) => r.name === '铁钉');
    check('B1-徽章+21', !!nail && nail.badge.indexOf('+21') >= 0 && nail.badgeTitle.length > 0, JSON.stringify(nail));
    await pushBasket({ mode: 'wish', chips: [{ id: 9, name: '材料', warn: false }], scores: { 5: 6, 6: 6, 12: 15 }, forbid: [8] });
    rows = await rowInfo();
    const nail2 = rows.find((r) => r.name === '铁钉');
    check('B2-联动降档+6', !!nail2 && nail2.badge.indexOf('+6') >= 0, JSON.stringify(nail2));
    const noScore = rows.find((r) => r.name === '生态香米');
    check('B3-无分值行无徽章', !!noScore && noScore.badge === '', JSON.stringify(noScore));
  }

  /* ---- §B4 scores 空（SelfCheck 失败形态）：chips 留、排序牌隐、默认序 ---- */
  {
    await pushBasket({ mode: 'wish', chips: [{ id: 9, name: '材料', warn: false }], scores: {}, forbid: [] });
    const ct = await chipTexts();
    check('B4-降级无排序牌', ct.some((t) => t.indexOf('C:材料[9]') === 0) && !ct.some((t) => t.indexOf('按救助贡献') >= 0), JSON.stringify(ct));
  }

  /* ---- §R 禁入置灰 + 右键：禁入行 toast 拒绝零 op；正常行 basketPut op 报文 ---- */
  {
    await pushBasket({ mode: 'wish', chips: [{ id: 9, name: '材料', warn: false }], scores: { 5: 21 }, forbid: [8] });
    const rows = await rowInfo();
    const herb = rows.find((r) => r.name === '草药');
    check('R1-禁入行置灰', !!herb && herb.dim === true, JSON.stringify(herb));
    await page.evaluate(() => { window.__HZ_CMDS__ = []; var prev = window.__CERAIL__.cmd; window.__CERAIL__.cmd = function (op, p) { window.__HZ_CMDS__.push([op, p]); return prev(op, p); }; });
    await page.evaluate(() => { /* 右键禁入行 */
      var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
      var row = Array.prototype.find.call(d.querySelectorAll('#srgList .srg-row'), function (r) { return r.textContent.indexOf('草药') >= 0; });
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(200);
    let cmds = await page.evaluate(() => window.__HZ_CMDS__.slice());
    let toast = await page.evaluate(() => { var t = window.__HZ_FRAME__('BackpackUI').contentDocument.getElementById('srgToast'); return t ? t.textContent : ''; });
    check('R2-禁入右键零op+toast', cmds.length === 0 && toast.indexOf('不收') >= 0, 'cmds=' + JSON.stringify(cmds) + ' toast=' + toast);
    await page.evaluate(() => { /* 右键正常行（铁钉=柜或包） */
      var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
      var row = Array.prototype.find.call(d.querySelectorAll('#srgList .srg-row'), function (r) { return r.textContent.indexOf('铁钉') >= 0; });
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(200);
    cmds = await page.evaluate(() => window.__HZ_CMDS__.slice());
    const put = cmds.find((c) => c[0] === 'basketPut');
    check('R3-正常右键basketPut报文', !!put && put[1] && typeof put[1].item === 'number' && (put[1].owner === 900001 || typeof put[1].owner === 'number'),
      JSON.stringify(cmds));
  }

  /* ---- §N nowish 态：9 固定分类 chips + 手动排序六键 ---- */
  {
    await pushBasket({ mode: 'nowish', chips: [], scores: null, forbid: [] });
    const ct = await chipTexts();
    const wantCats = ['全部', '食物', '材料', '日用品', '燃料', '药品', '书刊', '工具', '种子'];
    const catOk = wantCats.every((w) => ct.some((t) => t.indexOf('C:' + w) === 0));
    const hasSort = ct.some((t) => t.indexOf('P:') === 0 && t.indexOf('排序') >= 0);
    check('N1-nowish-9分类+排序钮', catOk && hasSort && !ct.some((t) => t.indexOf('按救助贡献') >= 0), JSON.stringify(ct));
    /* 排序菜单：精力 → 首行=咖啡（v3=15 最高）；饱腹 → 首行=烤肉（v1=48 最高） */
    await page.evaluate(() => {
      var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
      d.querySelector('#srgChips .srg-sortbtn').click();
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
      d.querySelector('#srgChips .srg-sortopt[data-k="en"]').click();
    });
    await page.waitForTimeout(250);
    let rows = await rowInfo();
    check('N2-排序精力首行咖啡', rows.length > 0 && rows[0].name === '咖啡', JSON.stringify(rows.slice(0, 2).map((r) => r.name)));
    await page.evaluate(() => {
      var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
      d.querySelector('#srgChips .srg-sortbtn').click();
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
      d.querySelector('#srgChips .srg-sortopt[data-k="sat"]').click();
    });
    await page.waitForTimeout(250);
    rows = await rowInfo();
    check('N3-排序饱腹首行烤肉', rows.length > 0 && rows[0].name === '烤肉', JSON.stringify(rows.slice(0, 2).map((r) => r.name)));
    /* nowish 分类筛选：点食物 → 全行 catId=1 */
    await page.evaluate(() => window.__HZ_FRAME__('BackpackUI').contentDocument.querySelector('#srgChips .srg-chip[data-c="1"]').click());
    await page.waitForTimeout(250);
    rows = await rowInfo();
    check('N4-nowish分类筛选', rows.length > 0 && rows.every((r) => r.cat === '1'), JSON.stringify(rows.map((r) => r.name)));
  }

  /* ---- §D dying 态：食物 chip + 饱腹排序牌 ---- */
  {
    await pushBasket({ mode: 'dying', chips: [{ id: 1, name: '食物', warn: false }], scores: null, forbid: [] });
    const ct = await chipTexts();
    check('D1-dying-食物+饱腹牌', ct.some((t) => t.indexOf('C:食物[1]') === 0) && ct.some((t) => t.indexOf('饱腹') >= 0 && t.indexOf('P:') === 0), JSON.stringify(ct));
    const rows = await rowInfo();
    check('D2-dying-饱腹降序首行烤肉', rows.length > 0 && rows[0].name === '烤肉', JSON.stringify(rows.slice(0, 2).map((r) => r.name)));
  }

  /* ---- §F feedFail 回执 toast（full/forbid 码 → 篮子口径文案）---- */
  {
    await pushBasket(undefined);
    await page.evaluate(() => { window.__HZ_FEEDFAIL__ = 'full'; });
    await page.evaluate(() => window.__HZ_PUSH__('BackpackUI'));
    await page.waitForTimeout(350);
    let toast = await page.evaluate(() => { var t = window.__HZ_FRAME__('BackpackUI').contentDocument.getElementById('srgToast'); return t ? t.textContent : ''; });
    check('F1-full回执篮子满了', toast.indexOf('篮子') >= 0 && toast.indexOf('满') >= 0, toast);
    await page.evaluate(() => { window.__HZ_FEEDFAIL__ = 'forbid'; });
    await page.evaluate(() => window.__HZ_PUSH__('BackpackUI'));
    await page.waitForTimeout(350);
    toast = await page.evaluate(() => { var t = window.__HZ_FRAME__('BackpackUI').contentDocument.getElementById('srgToast'); return t ? t.textContent : ''; });
    check('F2-forbid回执不收', toast.indexOf('不收') >= 0, toast);
    await page.evaluate(() => { window.__HZ_FEEDFAIL__ = 'bagfull'; });
    await page.evaluate(() => window.__HZ_PUSH__('BackpackUI'));
    await page.waitForTimeout(350);
    toast = await page.evaluate(() => { var t = window.__HZ_FRAME__('BackpackUI').contentDocument.getElementById('srgToast'); return t ? t.textContent : ''; });
    check('F3-bagfull回执背包满', toast.indexOf('背包') >= 0 && toast.indexOf('满') >= 0, toast);
    await page.evaluate(() => { window.__HZ_FEEDFAIL__ = ''; window.__HZ_BASKET__ = undefined; });
  }

  /* ---- §I3 nowish 点「全部」=回全部（不滤空）；跨态残留选择视为全部 ---- */
  {
    await pushBasket({ mode: 'nowish', chips: [], scores: null, forbid: [] });
    await page.evaluate(() => window.__HZ_FRAME__('BackpackUI').contentDocument.querySelector('#srgChips .srg-chip[data-c="1"]').click());
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
      var c = d.querySelector('#srgChips .srg-chip');
      c.click(); /* 全部=首枚 */
    });
    await page.waitForTimeout(250);
    const rows = await rowInfo();
    const allChip = await page.evaluate(() => {
      var c = window.__HZ_FRAME__('BackpackUI').contentDocument.querySelector('#srgChips .srg-chip');
      return { on: c.classList.contains('on'), dc: c.getAttribute('data-c') };
    });
    check('I3-点全部回全部', rows.length > 1 && allChip.on, 'rows=' + rows.length + ' all=' + JSON.stringify(allChip));
    /* 跨态残留守卫：nowish 选了「食物」后切 wish 态（类别池变化）→ 残留选择视为全部 */
    await page.evaluate(() => window.__HZ_FRAME__('BackpackUI').contentDocument.querySelector('#srgChips .srg-chip[data-c="1"]').click());
    await page.waitForTimeout(200);
    await pushBasket({ mode: 'wish', chips: [{ id: 9, name: '材料', warn: false }], scores: { 5: 21 }, forbid: [] });
    const rowsW = await rowInfo();
    check('I3b-跨态残留视为全部', rowsW.length >= 8, 'rowsW=' + rowsW.length + '（残留食物过滤=4 行=bug 形态）');
  }

  /* ---- §I6 排序菜单锚定在排序钮下方（面板内可见，不飘到整面板底缘外）---- */
  {
    await pushBasket({ mode: 'nowish', chips: [], scores: null, forbid: [] });
    const r = await page.evaluate(() => {
      var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
      var btn = d.querySelector('#srgChips .srg-sortbtn');
      var panel = d.getElementById('srgPanel');
      btn.click();
      var menu = d.getElementById('srgSortMenu');
      var mb = menu.getBoundingClientRect(), bb = btn.getBoundingClientRect(), pb = panel.getBoundingClientRect();
      return { open: menu.classList.contains('open'), menuTop: mb.top, btnBottom: bb.bottom, panelBottom: pb.bottom };
    });
    check('I6-菜单锚定钮下', r.open && r.menuTop >= r.btnBottom - 2 && r.menuTop < r.panelBottom - 20,
      JSON.stringify(r));
  }

  /* ---- §S7 显式 glistOn=false（cfg 关真实路径=键在场值为假）：面板拆除零进场 ---- */
  {
    await pushBasket(undefined);
    await page.evaluate(() => { window.__HZ_GLISTON__ = false; });
    await page.evaluate(() => window.__HZ_PUSH__('BackpackUI'));
    await page.waitForTimeout(900);
    const s7 = await page.evaluate(() => {
      var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
      return { panel: !!d.getElementById('srgPanel'), grid: d.querySelector('.bag-panel:not(.is-basket-panel) .grid-container') };
    });
    const gridShown = s7.grid && s7.grid.offsetParent !== null;
    check('S7-glistOn=false拆除', !s7.panel && !!gridShown, JSON.stringify({ panel: s7.panel, gridShown: !!gridShown }));
    await page.evaluate(() => { window.__HZ_GLISTON__ = undefined; });
    await page.evaluate(() => window.__HZ_PUSH__('BackpackUI'));
    await page.waitForTimeout(600);
  }

  /* ---- §U 多次使用物品拆行分值（实机批改#1：维修零件场景——剩余次数异=分值异=拆行）---- */
  {
    const snap = await page.evaluate(() => JSON.stringify(window.__HZ_MOCKSET__()));
    await page.evaluate((snapStr) => {
      var m = JSON.parse(snapStr);
      m.items = { bag: [
        [920, 12, 2, 0, 0, 0, 1, 1, 0, null, null, null, null, null, null, '', 3, 5],
        [921, 12, 1, 0, 1, 0, 1, 1, 0, null, null, null, null, null, null, '', 5, 5]
      ] };
      window.__HZ_MOCKSET__(m);
    }, snap);
    await pushBasket({ mode: 'wish', chips: [{ id: 9, name: '材料', warn: false }], scores: { '12|u3/5': 6, '12|u5/5': 21 }, forbid: [] });
    const rows = await rowInfo();
    const parts = rows.filter((r) => r.name === '零件');
    check('U1-同cfg拆两行', parts.length === 2, JSON.stringify(rows.map((r) => [r.name, r.badge])));
    check('U2-uses行分值各按其键', parts.some((r) => r.badge.indexOf('+6') >= 0) && parts.some((r) => r.badge.indexOf('+21') >= 0),
      JSON.stringify(parts.map((r) => r.badge)));
    check('U3-贡献降序21在前', rows.length >= 2 && rows[0].name === '零件' && rows[0].badge.indexOf('+21') >= 0,
      JSON.stringify(rows.slice(0, 2).map((r) => [r.name, r.badge])));
    await page.evaluate((snapStr) => { window.__HZ_MOCKSET__(JSON.parse(snapStr)); }, snap);
    await page.evaluate(() => window.__HZ_PUSH__('BackpackUI'));
    await page.waitForTimeout(400);
  }

  /* ---- §骨架 S3：无 basket 键 → 面板不存在（零扰动骨架半）---- */
  await page.evaluate(() => { window.__HZ_BASKETMODE__ = false; });
  await page.evaluate(() => window.__HZ_SHOW__('BackpackUI'));
  await page.waitForFunction(() => {
    var f = window.__HZ_FRAME__('BackpackUI');
    var d = f && f.contentDocument;
    return !!(d && d.querySelector('.backpack-container'));
  }, null, { timeout: 20000 });
  await page.waitForTimeout(900);
  const s3 = await page.evaluate(() => {
    var d = window.__HZ_FRAME__('BackpackUI').contentDocument;
    return { panel: !!d.getElementById('srgPanel'), bHtmlLen: d.querySelectorAll('.bag-panel').length };
  });
  check('S3-无basket零进场', !s3.panel && s3.bHtmlLen >= 1, JSON.stringify(s3));

  check('Z-console-clean', consoleErrors.length === 0, 'errors=' + JSON.stringify(consoleErrors.slice(0, 3)));
  check('Z-pageerror-clean', pageErrors.length === 0, pageErrors.slice(0, 2).join(';'));

  await browser.close();
  const fails = results.filter((r) => !r.ok).length;
  console.log(`---- basket-glist: ${results.length - fails}/${results.length} PASS ----`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('DRIVER ERROR', e); process.exit(2); });
