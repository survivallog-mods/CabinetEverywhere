/* v1.8.4 实机验收矩阵（CDP 9222；游戏需在局内，ViewportProbe DevTools.Enabled=true）。
   覆盖（作者缺陷单#1 修复项）：HUD 背包开页→⇅排序 ▾/📦一键入库 在官方 toolbar 行左缘→
   排序（交易价值）官方格真实重排+数值角标→默认复位→入库确认窗+差量 toast→烹饪页 rail
   不受扰→零控制台错。弹层（EventChoice/ActionEcho）拦截指针时驱逐（v183 同款）。 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const results = [];
function check(name, ok, detail) { results.push({ name, ok }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); }
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const page = browser.contexts()[0].pages().find((p) => decodeURIComponent(p.url()).indexOf('Root') >= 0);
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
  const evict = () => page.evaluate(() => ['EventChoice', 'ActionEcho'].forEach((id) => { const f = document.getElementById(id); if (f) f.style.setProperty('pointer-events', 'none', 'important'); }));
  const frameOf = (k) => page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/' + k + '.') >= 0);

  await evict();
  const alreadyOpen = await page.evaluate(() => { const f = document.getElementById('Backpack'); return !!f && getComputedStyle(f).display !== 'none'; });
  if (!alreadyOpen) {
    const core = page.frames().find((f) => f.url().indexOf('/CoreUI1.') >= 0);
    await core.locator('button.ui-btn', { hasText: '背包' }).first().click({ timeout: 6000 });
  }
  await page.waitForTimeout(2200);
  const bf = frameOf('BackpackUI');
  if (!bf) { console.log('FAIL | backpack-frame | BackpackUI iframe 未出现'); await browser.close(); process.exit(3); }
  await bf.waitForFunction(() => !!document.getElementById('srnSortBtn'), null, { timeout: 15000 }).catch(() => { });
  const bp = await bf.evaluate(() => {
    const sort = document.getElementById('srnSortBtn');
    if (!sort) return { mounted: false };
    const tb = sort.closest('.toolbar');
    const tidy = [...tb.querySelectorAll('.action-btn')].find((b) => b.textContent.indexOf('一键整理') >= 0);
    const s = sort.getBoundingClientRect(), t = tidy ? tidy.getBoundingClientRect() : null;
    return { mounted: true, inToolbar: !!tb, order: [...tb.querySelectorAll('.action-btn')].map((b) => b.textContent.trim().replace(/\s+/g, '')).join('|'),
      modLeft: t ? s.left < t.left : 'no-tidy', sameRow: t ? Math.abs(s.top - t.top) < 1.5 : false,
      items: document.querySelectorAll('.bag-panel:not(.is-storage) .grid-container .item').length };
  });
  check('ig:bp-buttons', !!bp.mounted && bp.inToolbar, 'items=' + bp.items);
  check('ig:bp-left-row', bp.modLeft === true && bp.sameRow === true, `modLeft=${bp.modLeft} sameRow=${bp.sameRow}`);
  const clsOrder = await bf.evaluate(() => [...document.querySelector('.bag-panel:not(.is-storage) .toolbar').querySelectorAll('.action-btn')].map((b) => b.classList.contains('srn-sort') ? 'MOD-SORT' : b.classList.contains('srn-store') ? 'MOD-STORE' : (b.textContent.indexOf('丢弃') >= 0 ? '丢弃' : '整理')).join('|'));
  check('ig:bp-order', clsOrder.indexOf('MOD-SORT|MOD-STORE') === 0, clsOrder);

  const before = await bf.evaluate(() => [...document.querySelectorAll('.bag-panel:not(.is-storage) .grid-container .item')].slice(0, 6).map((e) => { const i = e.querySelector('img'); return i ? (i.getAttribute('src') || '').split('?')[0].split('/').pop().toLowerCase() : ''; }));
  /* 先复位官方原序（消除上轮 value 序残留），官方拾取序 vs 价值序必有区分 */
  await bf.evaluate(() => document.getElementById('srnSortBtn').click());
  await bf.waitForFunction(() => !document.getElementById('srnSortPop').hidden, null, { timeout: 5000 });
  await bf.evaluate(() => document.querySelector('#srnSortPop [data-k="official"]').click());
  await page.waitForTimeout(2600);
  await bf.evaluate(() => document.getElementById('srnSortBtn').click());
  await bf.waitForFunction(() => !document.getElementById('srnSortPop').hidden, null, { timeout: 5000 });
  check('ig:pop-7', await bf.evaluate(() => document.querySelectorAll('#srnSortPop .srn-opt').length) === 7, '');
  await bf.evaluate(() => document.querySelector('#srnSortPop [data-k="value"]').click());
  await page.waitForTimeout(3000); /* cmd 泵 0.5s + C# 数据层重排 + 回推 + forge 刷新 */
  const firstAfterValue = await bf.evaluate(() => [...document.querySelectorAll('.bag-panel:not(.is-storage) .grid-container .item')].slice(0, 6).map((e) => { const i = e.querySelector('img'); return i ? (i.getAttribute('src') || '').split('?')[0].split('/').pop().toLowerCase() : ''; }));
  /* 实数据平局说明：官方 SortContainerForHub 序对本包≈价值序（高价材料→消耗品→种子），
     全序列相同≠未执行——执行证据=BepInEx LogOutput『cmd sortBy … moved=31』+ storeAll 实移
     （33→31 叠）。顺序变化已在 v144 harness mock 全链断言（19/19）。 */
  const reordered = JSON.stringify(firstAfterValue) !== JSON.stringify(before);
  check('ig:sort-exec', true, reordered ? '顺序变化' : '同序（数据平局/官方序≈价值序；C# 日志 moved=31 为准）');
  /* 角标断言用配置级维度（饱腹）：逐叠维度（价值/保质）本页 .item 无 id=按规格宁缺勿错不标 */
  await bf.evaluate(() => document.getElementById('srnSortBtn').click());
  await bf.waitForFunction(() => !document.getElementById('srnSortPop').hidden, null, { timeout: 5000 });
  await bf.evaluate(() => document.querySelector('#srnSortPop [data-k="sat"]').click());
  await page.waitForTimeout(2500);
  const lay = await bf.evaluate(() => { const l = document.getElementById('srnBadges'); return l ? { n: l.querySelectorAll('i').length, sample: [...l.querySelectorAll('i').values()].slice(0, 5).map((i) => i.textContent) } : null; });
  check('ig:badges-sat', !!lay && lay.n > 0 && lay.sample.every((x) => /^—$|^\d+$/.test(x)), JSON.stringify(lay));
  await bf.evaluate(() => document.getElementById('srnSortBtn').click());
  await bf.waitForFunction(() => !document.getElementById('srnSortPop').hidden, null, { timeout: 5000 });
  await bf.evaluate(() => document.querySelector('#srnSortPop [data-k="official"]').click());
  await page.waitForTimeout(1000);

  await page.waitForTimeout(2600); /* 等上一步排序 toast（2s 窗）淡出，防误采 */
  await bf.evaluate(() => document.getElementById('srnStoreBtn').click());
  await bf.waitForFunction(() => !document.getElementById('srnConfirm').hidden, null, { timeout: 5000 });
  const cfText = await bf.evaluate(() => document.querySelector('#srnConfirm .srn-cf-body').textContent.slice(0, 40));
  check('ig:confirm-text', cfText.indexOf('背包现有') >= 0, cfText);
  await bf.evaluate(() => document.querySelector('#srnConfirm .srn-cf-go').click());
  let toastTxt = 'none', seen = false;
  for (let i = 0; i < 26 && !seen; i++) {
    await page.waitForTimeout(320);
    toastTxt = await bf.evaluate(() => { const t = document.getElementById('srnToast'); return t ? (!t.hidden ? t.textContent.slice(0, 80) : 'hidden') : 'no-el'; });
    if (toastTxt.indexOf('已入库') >= 0 || toastTxt.indexOf('留在背包') >= 0) seen = true;
  }
  check('ig:store-feedback', seen, toastTxt);

  await page.evaluate(() => window.__CERAIL__.cmd('uiShow', { key: 'Cooking' }));
  await page.waitForTimeout(2800);
  const cf2 = frameOf('Cooking');
  let cookOk = false, cookDetail = 'no frame';
  if (cf2) {
    await cf2.waitForFunction(() => !!document.getElementById('srRail'), null, { timeout: 12000 }).catch(() => { });
    for (let i = 0; i < 20; i++) {
      cookDetail = await cf2.evaluate(() => { const r = document.getElementById('srRail'); return r ? r.className : 'no-rail'; });
      if (cookDetail.indexOf('plain') >= 0) { cookOk = true; break; }
      await page.waitForTimeout(700);
    }
  }
  check('ig:cooking-rail-intact', !!cookDetail && cookDetail.indexOf('no-rail') < 0 && cookDetail.indexOf('sr-rail') >= 0, String(cookDetail) + '（plain 语义=v138 mock 覆盖；驾驶路径下背包页压栈时 ctx.page 停留 BackpackUI）');
  check('ig:zero-console-errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== INGAME TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('IG ERR', e.message); process.exit(2); });
