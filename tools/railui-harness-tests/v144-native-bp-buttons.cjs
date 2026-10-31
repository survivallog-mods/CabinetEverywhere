/* v1.8.4 原生背包页 mod 按钮对 harness（UI-SPEC §0a-4 v13.9；作者缺陷单#1「背包界面缺失
   排序、一键入库 按钮」，原型 v13.9 三轮定稿：官方 .toolbar 行左缘两钮）。
   覆盖：①按钮进官方 .toolbar 且 mod 对钉左缘/官方保持右缘/同排；②7 项排序弹层
   （FSORTS 参考图顺序）+ 选择→sortBy{owner:bag} 入队+弹层即关+持久化；③属性排序
   角标 overlay（#srnBadges 值随 icfg 维度）+ 默认复位摘除；④入库确认窗（§4.6 文案）
   →storeAll{order} 入队→mock 回推→settleXfer 差量 toast 经 toast() 兜底落 #srnToast；
   ⑤ctx.bpBag 权威判据：false=按钮摘除（取用单柜）、true=恢复；⑥控制台零报错。 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');

const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) errs.push(m.text()); });

  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { localStorage.removeItem('srp_fsort_BackpackUI'); } catch (e) { } });
  await page.waitForTimeout(1200);

  /* cmd 截获（sortBy/storeAll 可见） */
  await page.evaluate(() => {
    window.__SORTCAP = [];
    const orig = window.__CERAIL__.cmd;
    window.__CERAIL__.cmd = function (op, p) { window.__SORTCAP.push([op, p]); return orig.call(this, op, p); };
  });

  await page.evaluate(() => window.__HZ_SHOW__('BackpackUI'));
  const fr = page.frames().find((f) => f.url().includes('/fixtures/BackpackUI.html'));
  await fr.waitForFunction(() => !!document.getElementById('srnSortBtn'), null, { timeout: 15000 });
  await page.waitForTimeout(400); /* 官方格渲染+观察器首算 */

  /* ① 按钮在官方 .toolbar 行内，mod 对左缘、官方保持右缘、同排 */
  const row = await fr.evaluate(() => {
    const panel = document.querySelector('.bag-panel:not(.is-storage)');
    const tb = panel.querySelector('.toolbar');
    const sort = document.getElementById('srnSortBtn').getBoundingClientRect();
    const store = document.getElementById('srnStoreBtn').getBoundingClientRect();
    const tidy = [...tb.querySelectorAll('.action-btn')].find((b) => b.textContent.indexOf('一键整理') >= 0).getBoundingClientRect();
    const inToolbar = !!document.getElementById('srnSortBtn').closest('.toolbar');
    return {
      inToolbar, order: [...tb.querySelectorAll('.action-btn')].map((b) => b.textContent.trim().replace(/\s+/g, '')).join('|'),
      modLeft: sort.left < tidy.left, sameRow: Math.abs(sort.top - tidy.top) < 1.5,
      gapAuto: tidy.left - store.right
    };
  });
  check('bp:in-toolbar', row.inToolbar, '按钮挂官方 .toolbar 内');
  check('bp:mod-left', row.modLeft && row.sameRow, `modLeft=${row.modLeft} sameRow=${row.sameRow}`);
  check('bp:auto-gap', row.gapAuto > 50, `store→官方钮间隔=${Math.round(row.gapAuto)}px（margin-right:auto 钉左）`);
  check('bp:row-order', /⇅排序▾\|📦一键入库\|/.test(row.order), row.order);

  /* ② 排序弹层 7 项（参考图顺序）+ 选饱腹 → sortBy{owner:bag} + 弹层即关 */
  await fr.evaluate(() => document.getElementById('srnSortBtn').click());
  await fr.waitForFunction(() => !document.getElementById('srnSortPop').hidden, null, { timeout: 4000 });
  const opts = await fr.evaluate(() => [...document.querySelectorAll('#srnSortPop .srn-opt')].map((b) => b.getAttribute('data-k') + (b.classList.contains('active') ? '*' : '')));
  check('bp:pop-7', opts.join(',') === 'official*,sat,mind,en,hp,value,shelf', opts.join(','));
  await fr.evaluate(() => document.querySelector('#srnSortPop [data-k="sat"]').click());
  await page.waitForTimeout(250);
  const capSort = await page.evaluate(() => window.__SORTCAP.filter((c) => c[0] === 'sortBy').pop());
  check('bp:sortBy-owner-bag', !!(capSort && capSort[1] && capSort[1].key === 'sat' && String(capSort[1].owner) === '900001'), JSON.stringify(capSort && capSort[1]));
  check('bp:pop-closed-on-pick', await fr.evaluate(() => document.getElementById('srnSortPop').hidden), '选完即关（机器页同款）');
  check('bp:fsort-persist', (await fr.evaluate(() => { try { return JSON.parse(localStorage.getItem('srp_fsort_BackpackUI') || 'null'); } catch (e) { return null; } })) === 'sat', 'srp_fsort_BackpackUI=sat（lsSet JSON 口径）');

  /* ③ 角标：#srnBadges 在官方 .grid-container 内，值=icfg 维度（901=cfg1 饱腹15、903=cfg5 0→—） */
  await page.waitForTimeout(500); /* forge 刷新+观察器 50ms 防抖 */
  const bl = await fr.evaluate(() => {
    const lay = document.getElementById('srnBadges');
    const grid = document.querySelector('.bag-panel:not(.is-storage) .grid-container');
    return {
      inGrid: !!lay && !!lay.closest('.grid-container') && lay.closest('.grid-container') === grid,
      n: lay ? lay.querySelectorAll('i').length : 0,
      texts: lay ? [...lay.querySelectorAll('i')].map((i) => i.textContent) : []
    };
  });
  check('bp:badge-layer-in-grid', bl.inGrid && bl.n >= 8, `inGrid=${bl.inGrid} n=${bl.n}`);
  check('bp:badge-values', bl.texts.indexOf('15') >= 0 && bl.texts.indexOf('—') >= 0, `[${bl.texts.join(',')}]`);
  /* 默认复位：角标摘除 + sortBy official */
  await fr.evaluate(() => document.getElementById('srnSortBtn').click());
  await fr.waitForFunction(() => !document.getElementById('srnSortPop').hidden, null, { timeout: 4000 });
  await fr.evaluate(() => document.querySelector('#srnSortPop [data-k="official"]').click());
  await page.waitForTimeout(350);
  check('bp:reset-official', await page.evaluate(() => window.__SORTCAP.filter((c) => c[0] === 'sortBy').pop()[1].key) === 'official', 'sortBy official');
  check('bp:badges-removed', await fr.evaluate(() => !document.getElementById('srnBadges')), '默认无角标');

  /* ④ 入库确认窗 → storeAll{order} → mock 回推 → 差量 toast 落 #srnToast */
  await fr.evaluate(() => document.getElementById('srnStoreBtn').click());
  await fr.waitForFunction(() => !document.getElementById('srnConfirm').hidden, null, { timeout: 4000 });
  const cfText = await fr.evaluate(() => document.querySelector('#srnConfirm .srn-cf-body').textContent);
  check('bp:confirm-text', cfText.indexOf('背包现有') >= 0 && cfText.indexOf('叠') >= 0, cfText.slice(0, 40) + '…');
  await fr.evaluate(() => document.querySelector('#srnConfirm .srn-cf-cancel').click());
  check('bp:confirm-cancel', await fr.evaluate(() => document.getElementById('srnConfirm').hidden), '取消关闭');
  await fr.evaluate(() => document.getElementById('srnStoreBtn').click());
  await fr.waitForFunction(() => !document.getElementById('srnConfirm').hidden, null, { timeout: 4000 });
  await fr.evaluate(() => document.querySelector('#srnConfirm .srn-cf-go').click());
  await page.waitForTimeout(250);
  const capStore = await page.evaluate(() => window.__SORTCAP.filter((c) => c[0] === 'storeAll').pop());
  check('bp:storeAll-cmd', !!(capStore && capStore[1] && Array.isArray(capStore[1].order) && capStore[1].order.join(',') === '900101,900102,900103,900104'), JSON.stringify(capStore && capStore[1]));
  await fr.waitForFunction(() => { const t = document.getElementById('srnToast'); return t && !t.hidden && t.textContent.indexOf('已入库') >= 0; }, null, { timeout: 6000 }).then(
    () => check('bp:store-toast', true, 'settleXfer 差量 toast → #srnToast 兜底路由'),
    () => check('bp:store-toast', false, 'toast 未出现')
  );

  /* ⑤ ctx.bpBag 权威判据：false=摘（取用单柜）、true=恢复（B键背包/双背包） */
  await page.evaluate(() => {
    const j = JSON.parse(JSON.stringify(window.__HZ_MOCK__ || null));
  }).catch(() => { });
  const pushBp = async (bpBag) => {
    await page.evaluate((v) => {
      /* 复用 harness MOCK：手推一笔带 bpBag 的契约（ctxFor 不带该字段，测试直推） */
      const src = window.__CERAIL__; /* MOCK 不在 window 上——从 harness log 无法取，就地构造最小契约 */
      const j = {
        rev: 999, ctx: { page: 'BackpackUI', family: 'backpack', bagOnly: true, bpBag: v, bagCap: 42 },
        bag: 900001,
        ctn: [[900101, '食材柜', 'c', 40, 101, 104], [900102, '冷藏柜', 'f', 24, 102], [900103, '材料架', 'r', 60, 103, 106], [900104, '杂物柜', 'c', 18]],
        lib: [[101, '食材', 4, 1, '', '#8fc06e'], [102, '需冷藏', 3, 2, '', '#6fc7c9'], [103, '材料', 0, 3, '', '#7aa2d6'], [104, '蔬果', 1, 4, '', '#8fc06e'], [105, '贵重品', 0, 5, '', '#c9b458'], [106, '种植', 5, 6, '', '#6fc7c9']],
        icfg: [
          [1, '生态香米', 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==#v1', 12, 99, 1, 1, '食材', 0, 15, 0, 0, 0, 0],
          [5, '铁钉', 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==#v5', 4, 999, 9, 0, '材料', 0, 0, 0, 0, 0, 0]
        ],
        items: { bag: [[901, 1, 30, 7200, 0, 0, 1, 1, 0], [903, 5, 40, 0, 2, 0, 1, 1, 0]] }
      };
      window.__CERAIL__.setData(j);
    }, bpBag);
    await page.waitForTimeout(700); /* scanFrames 500ms 周期 */
  };
  await pushBp(false);
  check('bp:bpBag-false-strips', await fr.evaluate(() => !document.getElementById('srnSortBtn') && !document.getElementById('srnStoreBtn')), '取用单柜（bpBag=false）按钮摘除');
  await pushBp(true);
  check('bp:bpBag-true-restores', await fr.evaluate(() => !!document.getElementById('srnSortBtn') && !!document.getElementById('srnStoreBtn')), '背包页（bpBag=true）按钮恢复');

  check('zero-console-errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
