/* v13.5-v13.8 机器页简化/设施排序/角标/交易条 harness（作者 2026-10-31 执行令）。
   覆盖：①9 机器页 plain（头/搜索/标签/工具/悬停/N行 隐藏，页脚=排序钮+格数+入库|整理）；
   ②食品五设施排序钮+参考图 7 项弹层+sortBy 命令入队（cmd 截获）；③角标 overlay
   （注入模拟官方 .item → 观察器路径出角标，值与 icfg 维度一致）；④Trade 买家条；
   ⑤MaterialRack/BackpackUI 不受 plain 影响；⑥控制台零报错。 */
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
  await page.waitForTimeout(1500);

  /* cmd 截获（root 上下文包装 __CERAIL__.cmd，applyFsort 的 sortBy 可见） */
  await page.evaluate(() => {
    window.__SORTCAP = [];
    const orig = window.__CERAIL__.cmd;
    window.__CERAIL__.cmd = function (op, p) { window.__SORTCAP.push([op, p]); return orig.call(this, op, p); };
  });

  const frameOf = (k) => page.frames().find((f) => f.url().includes('/fixtures/' + k + '.html'));
  async function waitRail(key) {
    await page.evaluate((k) => window.__HZ_SHOW__(k), key); /* harness 场景切换：显示对应 iframe（display:none 下的帧不装配） */
    const f = frameOf(key);
    await f.waitForFunction(() => { const r = document.getElementById('srRail'); return r && r.isConnected; }, null, { timeout: 12000 });
    return f;
  }
  const disp = (f) => f.evaluate(() => {
    const d = (s) => { const n = document.querySelector(s); return n ? getComputedStyle(n).display : 'n/a'; };
    const rail = document.getElementById('srRail');
    return {
      plain: rail.classList.contains('plain'),
      head: d('.sr-rail .sr-head'), search: d('.sr-rail .sr-searchrow'), tags: d('.sr-rail .sr-tagrow'),
      tools: d('.sr-rail .sr-tools'), hover: d('.sr-rail .sr-hover'), fr: d('.sr-rail .sr-foot .fr'),
      fill: d('.sr-rail #srFill'),
      sortBtn: !document.getElementById('srFoodSort').hidden,
      acts: [...document.querySelectorAll('.sr-actrow .sr-act')].filter((b) => !b.hidden).map((b) => b.textContent.trim())
    };
  });

  /* ① Cooking（食品设施）：plain chrome + 排序钮 + 动作序 */
  const cf = await waitRail('Cooking');
  const ck = await disp(cf);
  check('cook:plain-class', ck.plain, 'rail.plain');
  check('cook:chrome-hidden', [ck.head, ck.search, ck.tags, ck.tools, ck.hover, ck.fr].every((v) => v === 'none'), `head=${ck.head} search=${ck.search} tags=${ck.tags} tools=${ck.tools} hover=${ck.hover} fr=${ck.fr}`);
  check('cook:fill-kept', ck.fill !== 'none', '已用/总格数保留');
  check('cook:sort-btn', ck.sortBtn, '⇅ 排序 钮可见');
  check('cook:act-order', ck.acts.join('|') === '📦 一键入库|一键整理', ck.acts.join('|'));

  /* ② 排序弹层 7 项（参考图顺序）+ 选择饱腹 → sortBy 入队 */
  await cf.evaluate(() => document.getElementById('srFoodSort').click());
  await cf.waitForFunction(() => !document.getElementById('srFootSortPop').hidden, null, { timeout: 4000 });
  const opts = await cf.evaluate(() => [...document.querySelectorAll('[data-fsort]')].map((b) => b.getAttribute('data-fsort') + (b.classList.contains('active') ? '*' : '')));
  check('cook:pop-7', opts.join(',') === 'official*,sat,mind,en,hp,value,shelf', opts.join(','));
  await cf.evaluate(() => document.querySelector('[data-fsort="sat"]').click());
  await page.waitForTimeout(200);
  const cap1 = await page.evaluate(() => window.__SORTCAP.filter((c) => c[0] === 'sortBy').pop());
  check('cook:sortBy-cmd', !!(cap1 && cap1[1] && cap1[1].key === 'sat'), JSON.stringify(cap1 && cap1[1]));
  check('cook:fsort-state', await page.evaluate(() => window.__CERAIL__.state.fsort) === 'sat', 'st.fsort=sat');

  /* ③ 角标 overlay：夹具页官方格已被 harness 喂数渲染 MOCK 物品（.item 带图标/id），
     观察器路径出角标——910=cfg7 净水（v1=5→'5'）、903=cfg5 铁钉（v1=0→'—'） */
  await page.waitForTimeout(400); /* 观察器 50ms 防抖 */
  const bl = await cf.evaluate(() => {
    const lay = document.getElementById('srBadgeLayer');
    return { layer: !!lay, n: lay ? lay.querySelectorAll('i').length : 0, texts: lay ? [...lay.querySelectorAll('i')].map((i) => i.textContent) : [] };
  });
  check('cook:badge-layer', bl.layer && bl.n >= 8, `layer=${bl.layer} n=${bl.n}（官方格 10 件全量角标）`);
  check('cook:badge-values', bl.texts.indexOf('15') >= 0 && bl.texts.indexOf('—') >= 0, `[${bl.texts}]（cfg1 饱腹15 / 零维物品 —）`);

  /* ④ ToolTable（机器非食品）：plain 但无排序钮；GreenhouseBuild（温室，作者清单外）非 plain */
  const tf = await waitRail('ToolTable');
  const tt = await disp(tf);
  check('tool:plain-no-sortbtn', tt.plain && !tt.sortBtn, `plain=${tt.plain} sortBtn=${tt.sortBtn}`);
  const gf = await waitRail('GreenhouseBuild');
  const gh = await disp(gf);
  check('greenhouse:not-plain', !gh.plain && gh.head !== 'none', `plain=${gh.plain} head=${gh.head}（清单外保持全 chrome）`);

  /* ⑤ Trade：买家条在场（排序口径）+ 排序钮不显示 */
  const xf = await waitRail('Trade');
  const td = await xf.evaluate(() => ({
    strip: !document.getElementById('srTrade').hidden,
    text: document.getElementById('srTrade').textContent.trim(),
    sortBtn: !document.getElementById('srFoodSort').hidden,
    plain: document.getElementById('srRail').classList.contains('plain')
  }));
  check('trade:strip', td.strip && td.text.indexOf('按交易价值排序') >= 0, td.text);
  check('trade:plain-no-sortbtn', td.plain && !td.sortBtn, `plain=${td.plain} sortBtn=${td.sortBtn}`);

  /* ⑥ MaterialRack：plainbag 先行态不受影响（无 plain 类） */
  const rf = await waitRail('MaterialRack');
  const rk = await rf.evaluate(() => document.getElementById('srRail').className);
  check('rack:not-plain', rk.indexOf('plainbag') >= 0 && rk.indexOf('plain') === rk.indexOf('plainbag'), rk);

  check('zero-console-errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
