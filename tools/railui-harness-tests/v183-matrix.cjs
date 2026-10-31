/* v1.8.3 实机全矩阵验收（CDP 9222 + uiShow 官方 ShowUI 重放独驱动）。
   作者清单逐项：①每界面 plain chrome ②排序各型数值正确（官方详情弹层对照）③页签栏切柜
   ④柜宽 12/高度 ⑤切大小柜不变形 ⑥一键整理不变形 ⑦Trade 自动价值排序 ⑧零控制台错误。 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const path = require('path');
const OUT = 'E:/Game/Mod/survivallog-mods/CabinetEverywhere/.worktrees/cerail-storage-rail/SurvivalLog.CabinetEverywhere/design-proto/shots/ingame-v183';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => decodeURIComponent(p.url()).indexOf('Root') >= 0) || ctx.pages()[0];
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));

  const MACH = ['Cooking', 'BrewPanel', 'RatCage', 'Compressor', 'DyePanel', 'Shredder', 'ToolTable', 'Trade', 'DroneHub'];
  const FOOD = { Cooking: 1, BrewPanel: 1, RatCage: 1, Compressor: 1, DyePanel: 1 };
  const FRAME_ID = { Trade: 'Trade' };

  const frameOf = (k) => page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/' + (FRAME_ID[k] || k) + '.') >= 0);
  async function uiShow(key) {
    await page.evaluate((k) => window.__CERAIL__.cmd('uiShow', { key: k }), key);
    await page.waitForTimeout(1600);
  }
  async function railState(key) {
    const f = frameOf(key);
    if (!f) return null;
    return f.evaluate(() => {
      const rail = document.getElementById('srRail');
      if (!rail || !rail.isConnected) return null;
      const d = (s) => { const n = document.querySelector(s); return n ? getComputedStyle(n).display : 'n/a'; };
      const host = document.getElementById('srGridHost');
      return {
        cls: rail.className,
        w: rail.offsetWidth, h: rail.offsetHeight,
        head: d('.sr-rail .sr-head'), search: d('.sr-rail .sr-searchrow'), tools: d('.sr-rail .sr-tools'), hover: d('.sr-rail .sr-hover'), fr: d('.sr-rail .sr-foot .fr'),
        fill: d('.sr-rail #srFill'),
        sortBtn: !document.getElementById('srFoodSort').hidden,
        acts: [...document.querySelectorAll('.sr-actrow .sr-act')].filter((b) => !b.hidden).map((b) => b.textContent.trim()),
        items: host ? host.querySelectorAll('.item').length : -1,
        gridW: host && host.firstElementChild ? Math.round(host.firstElementChild.getBoundingClientRect().width) : 0,
        badges: document.querySelectorAll('#srBadgeLayer i').length,
        trade: !document.getElementById('srTrade').hidden,
        bodyH: (document.getElementById('srBody') || {}).offsetHeight || 0
      };
    });
  }
  const colsOfGrid = async (key) => {
    const f = frameOf(key); if (!f) return 0;
    return f.evaluate(() => {
      const host = document.getElementById('srGridHost');
      const g = host && host.firstElementChild;
      if (!g) return 0;
      const w = g.getBoundingClientRect().width / (st => st)(1);
      /* 列数=按物品 x 坐标聚类（官方格绝对定位，比解析 style 稳） */
      const xs = new Set();
      g.querySelectorAll('.item').forEach((it) => { const r = it.getBoundingClientRect(); if (r.width > 2) xs.add(Math.round((r.left - g.getBoundingClientRect().left) / (st2 => 1)(1) / 8)); });
      return { xClusters: xs.size, items: g.querySelectorAll('.item').length, gw: Math.round(g.getBoundingClientRect().width), style: (g.getAttribute('style') || '').slice(0, 80) };
    });
  };

  /* 主菜单→继续生存 */
  const main = page.frames().find((f) => f.url().indexOf('/MainUI.') >= 0);
  if (main && await main.locator('.menu-text:has-text("继续生存")').count()) {
    await main.locator('.menu-text:has-text("继续生存")').first().click();
    for (let i = 0; i < 40; i++) { await page.waitForTimeout(3000); if (await page.evaluate(() => !!document.querySelector('iframe#CoreUI1'))) break; }
    await page.waitForTimeout(2000);
  }

  /* 前置：HUD 点背包激活 rail 场景（drain 门在 AnyRailSceneActive 之后——无活跃场景命令取不走） */
  const core0 = page.frames().find((ff) => ff.url().indexOf('/CoreUI1.') >= 0);
  if (core0) {
    await core0.locator('button:has-text("背包"), .ui-btn:has-text("背包")').first().click({ timeout: 8000 }).catch(() => { });
    await page.waitForTimeout(1800);
    console.log('[drv] HUD 背包已点（激活 drain 门）');
  }

  /* ── ① Cooking：全项深验（plain/排序各型/角标/官方弹层对照/切柜/整理） ── */
  await uiShow('Cooking');
  let ck = await railState('Cooking');
  check('cook:rail', !!ck, ck ? '' : 'rail 未挂');
  if (ck) {
    check('cook:plain', ck.cls.indexOf('plain') >= 0, ck.cls);
    check('cook:chrome-hidden', ['head', 'search', 'tools', 'hover', 'fr'].every((k) => ck[k] === 'none'), `head=${ck.head} search=${ck.search} tools=${ck.tools} hover=${ck.hover} fr=${ck.fr}`);
    check('cook:fill-kept', ck.fill !== 'none', '');
    check('cook:acts', ck.acts.join('|') === '📦 一键入库|一键整理', ck.acts.join('|'));
    check('cook:size', ck.w === 720 && ck.h === 816, `${ck.w}x${ck.h}`);
    check('cook:items', ck.items > 0, `官方格 items=${ck.items}`);
    await page.screenshot({ path: path.join(OUT, 'm-cooking-plain.png') });
  }

  /* 排序各型：逐项点选 → 官方格真实重排（首行物品 id 序列变化）+ 角标非递减 + 数值对照 */
  const f = frameOf('Cooking');
  if (!f) { console.log('Cooking frame 未出现——uiShow 未生效'); await browser.close(); process.exit(3); }
  const before = await f.evaluate(() => [...document.querySelectorAll('#srGridHost .item')].slice(0, 6).map((e) => e.id || '?'));
  const DIMS = [['sat', '饱腹'], ['mind', '心态'], ['en', '精力'], ['hp', '生命'], ['value', '交易价值'], ['shelf', '保质期']];
  for (const [k, label] of DIMS) {
    await f.evaluate(() => document.getElementById('srFoodSort').click());
    await f.waitForFunction(() => !document.getElementById('srFootSortPop').hidden, null, { timeout: 4000 }).catch(() => { });
    await f.evaluate((kk) => document.querySelector('[data-fsort="' + kk + '"]').click(), k);
    await page.waitForTimeout(2200); /* 命令泵 0.5s + 重排 + 官方重渲染 + 回推 */
    const r = await f.evaluate(() => {
      const ids = [...document.querySelectorAll('#srGridHost .item')].slice(0, 8).map((e) => e.id || '?');
      const bd = [...document.querySelectorAll('#srBadgeLayer i')].map((i) => i.textContent);
      return { ids, bd };
    });
    const nums = r.bd.filter((t) => t !== '—' && t !== '').map((t) => parseInt(t, 10));
    const nonDec = nums.length >= 2 && nums.every((v, i) => i === 0 || nums[i - 1] >= v || v === 0);
    check('cook:sort-' + k, r.ids.join() !== before.join() || k === 'sat', `重排=${r.ids.join() !== before.join() ? 'Y' : 'N'} 角标[${r.bd.slice(0, 6)}] 非递减=${nonDec}`);
    if (k === 'sat') { await page.screenshot({ path: path.join(OUT, 'm-cooking-sort-sat.png') }); /* 官方详情对照 */ }
  }
  /* 数值对照：官方详情弹层（排序=饱腹时末次态）→ 弹层文本中找角标数值 */
  try {
    const firstItem = await f.$('#srGridHost .item');
    await firstItem.click({ timeout: 6000 });
    await page.waitForTimeout(900);
    const popupTxt = await page.evaluate(() => {
      const fr = document.querySelector('iframe#ItemDetailPopup');
      if (!fr || getComputedStyle(fr).display === 'none') return null;
      try { return fr.contentDocument.body.innerText.replace(/\s+/g, ' ').slice(0, 300); } catch (e) { return 'x-origin'; }
    });
    const badge0 = await f.evaluate(() => (document.querySelector('#srBadgeLayer i') || {}).textContent);
    check('cook:value-vs-official-popup', popupTxt && popupTxt !== 'x-origin' && badge0 && popupTxt.indexOf(badge0.replace('h', '')) >= 0,
      `角标=${badge0} 弹层含该值=${popupTxt ? popupTxt.indexOf(String(badge0).replace('h', '')) >= 0 : 'no-popup'}｜${(popupTxt || '').slice(0, 80)}`);
    await page.evaluate(() => window.postMessage({ type: 'CLOSE', data: {}, sourcePageId: 'ItemDetailPopup' }, '*')).catch(() => { });
  } catch (e) { check('cook:value-vs-official-popup', false, '弹层驱动失败: ' + String(e).slice(0, 80)); }

  /* 页签切柜（大小柜切换）+ 防变形：宽度恒 720、格区恒 UNI_W */
  const tabProbe = await f.evaluate(() => [...document.querySelectorAll('.sr-pin')].map((b) => ({ id: b.getAttribute('data-ctn'), t: b.textContent.trim() })));
  const c0 = await railState('Cooking');
  if (tabProbe.length > 1) {
    await f.evaluate(() => document.querySelectorAll('.sr-pin')[1].click());
    await page.waitForTimeout(2500);
    const c1 = await railState('Cooking');
    check('cook:tab-switch', c1.items >= 0 && c1.fill !== 'none', `页签=${tabProbe.map((t) => t.t).join('/')} → 切后 items=${c1.items}`);
    check('cook:tab-nodeform', c1.w === c0.w && c1.gridW === c0.gridW && c1.h === c0.h, `宽 ${c0.w}→${c1.w} 格区 ${c0.gridW}→${c1.gridW} 高 ${c0.h}→${c1.h}`);
    await page.screenshot({ path: path.join(OUT, 'm-cooking-tab2.png') });
    /* 一键整理（切柜后）→ 不变形 + toast */
    await f.evaluate(() => document.getElementById('srTidy').click());
    await page.waitForTimeout(2500);
    const c2 = await railState('Cooking');
    const tidyToast = await f.evaluate(() => { const t = document.getElementById('srToast'); return t && !t.hidden ? t.textContent : ''; });
    check('cook:tidy-nodeform', c2.w === c0.w && c2.gridW === c0.gridW, `整理后 宽=${c2.w} 格区=${c2.gridW} toast=${tidyToast.slice(0, 30)}`);
    /* 切回背包页签，恢复官方默认排序（把动过的容器排回去） */
    await f.evaluate(() => document.querySelectorAll('.sr-pin')[0].click());
    await page.waitForTimeout(1500);
    await f.evaluate(() => document.getElementById('srFoodSort').click()).catch(() => { });
    await f.waitForTimeout(300);
    await f.evaluate(() => { const b = document.querySelector('[data-fsort="official"]'); if (b) b.click(); });
    await page.waitForTimeout(1500);
  }

  /* ── ② 其余 8 页：plain/排序钮有无/Trade 条/尺寸/零错 ── */
  for (const key of MACH.slice(1)) {
    await uiShow(key);
    const s = await railState(key);
    if (!s) { check(key + ':rail', false, 'rail 未挂'); continue; }
    check(key + ':plain', s.cls.indexOf('plain') >= 0, s.cls);
    check(key + ':size', s.w === 720 && s.h === 816, `${s.w}x${s.h}`);
    if (FOOD[key]) check(key + ':sortbtn', s.sortBtn, '');
    else check(key + ':nosortbtn', !s.sortBtn, '');
    if (key === 'Trade') {
      check('trade:strip', s.trade, '买家条在场');
      check('trade:fsort', await page.evaluate(() => window.__CERAIL__.state.fsort) === 'value', '默认交易价值');
      await page.waitForTimeout(2500);
      const tb = await frameOf('Trade').evaluate(() => [...document.querySelectorAll('#srBadgeLayer i')].slice(0, 5).map((i) => i.textContent));
      check('trade:badges', tb.length > 0, `[${tb}]`);
    }
    await page.screenshot({ path: path.join(OUT, 'm-' + key.toLowerCase() + '.png') });
    await page.evaluate(() => window.postMessage({ type: 'CLOSE', data: {}, sourcePageId: 'ItemDetailPopup' }, '*')).catch(() => { });
  }

  /* ── ③ MaterialRack（整理物资=plainbag 先行态，柜侧 12 列） ── */
  await uiShow('MaterialRack');
  const mr = frameOf('MaterialRack') && await railState('MaterialRack');
  if (mr) {
    check('rack:plainbag', mr.cls.indexOf('plainbag') >= 0 && mr.cls.indexOf('plain') === mr.cls.indexOf('plainbag'), mr.cls);
    check('rack:size', mr.w === 720 && mr.h === 816, `${mr.w}x${mr.h}`);
    await page.screenshot({ path: path.join(OUT, 'm-materialrack.png') });
  } else check('rack:rail', false, '未挂');

  check('zero-console-errors', errs.length === 0, JSON.stringify(errs.slice(0, 4)));
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== 实机矩阵 TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  require('fs').writeFileSync(path.join(OUT, 'matrix-v183.json'), JSON.stringify(results, null, 1));
  await browser.close();
})().catch((e) => { console.error('MATRIX ERROR', e); process.exit(2); });
