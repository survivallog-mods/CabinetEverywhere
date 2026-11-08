/* TradeFx 批1 harness（计划 Task 4 骨架：消费壳/分块重组/探针上报；Task 5/6 追加 chips/bar 组）。
   serve.cjs 须已在 8180（worktree 实例）。断言：
   ① 入口存在：根窗 __CERAIL_TRADEFX__（函数，.data 暴露解析态）与 __CERAIL_TRADEFX_CHUNK__；
   ② 分块乱序重组：i=1 先到 i=0 后到 → 应用成功（mode=trade）；过期 pid 片丢弃（data 不变）；
   ③ 探针 report：依赖选择器缺失 → drain 队列出现 op:report（text 带 bar）；恢复再坏 →
      Set 去重恒 1 条（页面级一次上报纪律）；
   ④ 非法 JSON 静默（无 pageerror，data 不变）；
   尾部：零 console error / pageerror。 */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/temp/baidu_up/node_modules/playwright-core')); }

const BASE = 'http://127.0.0.1:8180';
const TRADE_JSON = '{"mode":"trade","trader":{"wants":[{"n":"食物","x":"×1.5"},{"n":"药品","x":"×½"}],"half":[{"n":"材料","x":"×0.5"}]},"bar":{"offer":84,"goods":30,"dealLine":12,"picked":true}}';
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
  await page.evaluate(() => window.__HZ_SHOW__('TradeUI'));

  function frame() { return page.frames().find((f) => f.url().includes('/fixtures/Trade.html')); }
  await frame().waitForFunction(() => {
    const d = document;
    return d.querySelector('.foot-main') && d.querySelector('.bal-track') && d.querySelector('.bubble');
  }, null, { timeout: 15000 });

  // ① 入口存在
  const entry = await page.evaluate(() => ({
    fn: typeof window.__CERAIL_TRADEFX__,
    chunk: typeof window.__CERAIL_TRADEFX_CHUNK__,
    data: window.__CERAIL_TRADEFX__ ? typeof window.__CERAIL_TRADEFX__.data : '(missing)',
  }));
  check('tfx:entry', entry.fn === 'function' && entry.chunk === 'function' && entry.data !== '(missing)',
    `fn=${entry.fn} chunk=${entry.chunk} data=${entry.data}`);

  // ② 分块乱序重组 + 过期 pid 丢弃（pid 1 两片乱序 → 应用；pid 0 迟到片 → 丢弃）
  const reorder = await page.evaluate((json) => {
    const half = Math.floor(json.length / 2);
    const e = window.__CERAIL_TRADEFX__;
    window.__CERAIL_TRADEFX_CHUNK__(1, 1, 2, json.slice(half));
    const mid = e.data && e.data.mode;
    window.__CERAIL_TRADEFX_CHUNK__(1, 0, 2, json.slice(0, half));
    const applied = e.data ? JSON.stringify({ mode: e.data.mode, offer: e.data.bar && e.data.bar.offer }) : '(null)';
    const before = applied;
    window.__CERAIL_TRADEFX_CHUNK__(0, 0, 1, '{"mode":"none"}'); // 过期包
    const afterStale = e.data ? JSON.stringify({ mode: e.data.mode, offer: e.data.bar && e.data.bar.offer }) : '(null)';
    return { mid, applied, before, afterStale };
  }, TRADE_JSON);
  check('tfx:chunk-half-silent', reorder.mid == null, `半包不应用（mid=${reorder.mid}）`);
  check('tfx:chunk-reorder-apply', reorder.applied === '{"mode":"trade","offer":84}', reorder.applied);
  check('tfx:chunk-stale-drop', reorder.afterStale === reorder.before && reorder.afterStale === '{"mode":"trade","offer":84}', reorder.afterStale);

  // ③ 探针 report：坏 Trade 帧 .bal-track → report(bar)；恢复→再坏 → 去重恒 1
  //    （.bal-track 在 Trade 帧文档——破坏/恢复必须在帧内做，entry+drain 在根窗做）
  await frame().evaluate(() => {
    const t = document.querySelector('.bal-track');
    window.__tfxB = t || null;
    if (t) t.remove();
  });
  const r1 = await page.evaluate(() => {
    window.__CERAIL_TRADEFX__('{"mode":"trade"}');
    try { return JSON.parse(window.__CERAIL__.drain() || '[]')
      .filter((c) => c && c.op === 'report' && String(c.text || '').indexOf('bar') >= 0).length; } catch (e) { return -1; }
  });
  await frame().evaluate(() => {
    if (window.__tfxB) document.querySelector('.foot-main').appendChild(window.__tfxB);
  });
  await page.evaluate(() => { window.__CERAIL_TRADEFX__('{"mode":"trade"}'); window.__CERAIL__.drain(); });
  await frame().evaluate(() => { if (window.__tfxB) window.__tfxB.remove(); }); // 第二坏（去重）
  const r2 = await page.evaluate(() => {
    window.__CERAIL_TRADEFX__('{"mode":"trade"}');
    try { return JSON.parse(window.__CERAIL__.drain() || '[]')
      .filter((c) => c && c.op === 'report' && String(c.text || '').indexOf('bar') >= 0).length; } catch (e) { return -1; }
  });
  await frame().evaluate(() => { if (window.__tfxB) document.querySelector('.foot-main').appendChild(window.__tfxB); }); // 还原
  check('tfx:probe-report-once', r1 === 1, `首次缺件上报=${r1}（期望1）`);
  check('tfx:probe-report-dedup', r2 === 0, `再坏不重报（r2=${r2}——累计恒1）`);

  // ④ 非法 JSON 静默
  const bad = await page.evaluate(() => {
    const e = window.__CERAIL_TRADEFX__;
    const before = e.data ? e.data.mode : '(null)';
    let threw = false;
    try { e('not json {{{'); } catch (err) { threw = true; }
    const after = e.data ? e.data.mode : '(null)';
    return { threw, before, after };
  });
  check('tfx:invalid-json-silent', !bad.threw && bad.before === 'trade' && bad.after === 'trade',
    `threw=${bad.threw} ${bad.before}→${bad.after}`);

  // ===== Task 5：A3 想要/半价 chips =====
  // 播种 .info-rows + 官方「想要」行（夹具 harness 数据态 hasHeadIntel=false 不渲染该块——
  // DOM 形状合成，两条宿主路径都可测；探针逻辑只认文本匹配，测试自控）
  await frame().evaluate(() => {
    let rows = document.querySelector('.info-rows');
    if (!rows) {
      rows = document.createElement('div');
      rows.className = 'info-rows';
      document.querySelector('.bubble').appendChild(rows);
    }
    if (!rows.querySelector(':scope > .cp-row.cfx-seed')) {
      const row = document.createElement('div');
      row.className = 'cp-row cfx-seed';
      const k = document.createElement('span');
      k.className = 'cp-k';
      k.textContent = '想要';
      row.appendChild(k);
      rows.appendChild(row);
    }
  });

  // ① 全量渲染：wants 2 chips / half 1 chip / 首片文本 / 官方行隐藏
  await page.evaluate((j) => window.__CERAIL_TRADEFX__(j), TRADE_JSON);
  const chips1 = await frame().evaluate(() => {
    const wants = document.querySelectorAll('.info-rows .cfx-head-row.cfx-wants .cfx-chip');
    const half = document.querySelectorAll('.info-rows .cfx-head-row.cfx-half .cfx-chip');
    const official = document.querySelector('.info-rows .cp-row.cfx-seed');
    return {
      wantsN: wants.length,
      halfN: half.length,
      first: wants[0] ? wants[0].textContent : '(none)',
      officialHidden: official ? official.classList.contains('cfx-hide') : '(missing)',
    };
  });
  check('tfx:chips-render', chips1.wantsN === 2 && chips1.halfN === 1 && chips1.first === '食物 ×1.5', JSON.stringify(chips1));
  check('tfx:chips-official-hidden', chips1.officialHidden === true, String(chips1.officialHidden));

  // ② 空组：无 cfx 行、官方行不隐藏（Review Focus 1）
  await page.evaluate(() => window.__CERAIL_TRADEFX__('{"mode":"trade","trader":{"wants":[],"half":[]},"bar":null}'));
  const chips2 = await frame().evaluate(() => {
    const official = document.querySelector('.info-rows .cp-row.cfx-seed');
    return {
      rows: document.querySelectorAll('.cfx-head-row').length,
      head: document.querySelectorAll('.cfx-head').length,
      hidden: official ? official.classList.contains('cfx-hide') : '(missing)',
    };
  });
  check('tfx:chips-empty-keeps-official', chips2.rows === 0 && chips2.head === 0 && chips2.hidden === false, JSON.stringify(chips2));

  // ③ 幂等：渲染→快照→重推同 JSON → .info-rows outerHTML 恒等（Review Focus 3）
  await page.evaluate((j) => window.__CERAIL_TRADEFX__(j), TRADE_JSON);
  await frame().evaluate(() => { window.__snapshot = document.querySelector('.info-rows').outerHTML; });
  await page.evaluate((j) => window.__CERAIL_TRADEFX__(j), TRADE_JSON);
  const idemOk = await frame().evaluate(() => document.querySelector('.info-rows').outerHTML === window.__snapshot);
  check('tfx:chips-idempotent', idemOk === true, '同 JSON 重推零 DOM 写');

  // ④ mode:none → 全清 + 官方行解除隐藏（Review Focus 4）
  await page.evaluate(() => window.__CERAIL_TRADEFX__('{"mode":"none"}'));
  const cleared = await frame().evaluate(() => {
    const official = document.querySelector('.info-rows .cp-row.cfx-seed');
    return {
      rows: document.querySelectorAll('.cfx-head-row, .cfx-head').length,
      hidden: official ? official.classList.contains('cfx-hide') : '(missing)',
    };
  });
  check('tfx:chips-clear-on-none', cleared.rows === 0 && cleared.hidden === false, JSON.stringify(cleared));

  // ⑤ .info-rows 缺席 → .bubble 自建容器；回归 → 迁回且自建容器移除
  await frame().evaluate(() => {
    const rows = document.querySelector('.info-rows');
    window.__rowsBak = rows;
    if (rows) rows.remove();
  });
  await page.evaluate((j) => window.__CERAIL_TRADEFX__(j), TRADE_JSON);
  const bubbleHost = await frame().evaluate(() => {
    const head = document.querySelector('.bubble .cfx-head');
    return head ? head.querySelectorAll('.cfx-head-row').length : 0;
  });
  await frame().evaluate(() => {
    const bubble = document.querySelector('.bubble');
    if (window.__rowsBak && bubble && bubble.parentNode) bubble.parentNode.insertBefore(window.__rowsBak, bubble);
  });
  await page.evaluate((j) => window.__CERAIL_TRADEFX__(j), TRADE_JSON);
  const backHost = await frame().evaluate(() => ({
    inRows: document.querySelectorAll('.info-rows .cfx-head-row').length,
    leftover: document.querySelectorAll('.bubble .cfx-head').length,
  }));
  check('tfx:chips-bubble-fallback', bubbleHost === 2, `bubble 自建容器行数=${bubbleHost}（期望2）`);
  check('tfx:chips-host-restore', backHost.inRows === 2 && backHost.leftover === 0, JSON.stringify(backHost));

  // ===== Task 6：A4 天平条两端数字 + hover 气泡 =====
  // ① trade+bar picked → 两端数字/体类/气泡三段文本（RF 无关）
  await page.evaluate((j) => window.__CERAIL_TRADEFX__(j), TRADE_JSON);
  const bar1 = await frame().evaluate(() => {
    const main = document.querySelector('.foot-main');
    const offer = main.querySelector(':scope > .cfx-bar-offer');
    const goods = main.querySelector(':scope > .cfx-bar-goods');
    const tip = main.querySelector(':scope > .cfx-bar-tip');
    return {
      body: document.body.classList.contains('cfx-bar'),
      offer: offer ? offer.textContent : '(none)',
      goods: goods ? goods.textContent : '(none)',
      tip: tip ? tip.textContent : '(none)',
      tipHidden: tip ? tip.hidden : '(none)',
    };
  });
  check('tfx:bar-render', bar1.body && bar1.offer === '84' && bar1.goods === '30', JSON.stringify(bar1));
  check('tfx:bar-tip-text', bar1.tip.indexOf('84') >= 0 && bar1.tip.indexOf('30') >= 0 && bar1.tip.indexOf('12') >= 0
    && bar1.tipHidden === true, `tip="${bar1.tip}" hidden=${bar1.tipHidden}`);

  // ② picked=false → goods 不在，offer 在
  await page.evaluate(() => window.__CERAIL_TRADEFX__('{"mode":"trade","trader":{"wants":[],"half":[]},"bar":{"offer":90,"goods":0,"dealLine":0,"picked":false}}'));
  const bar2 = await frame().evaluate(() => {
    const main = document.querySelector('.foot-main');
    return {
      offer: main.querySelector(':scope > .cfx-bar-offer') ? 'y' : 'n',
      goods: main.querySelector(':scope > .cfx-bar-goods') ? 'y' : 'n',
    };
  });
  check('tfx:bar-unpicked-no-goods', bar2.offer === 'y' && bar2.goods === 'n', JSON.stringify(bar2));

  // ③ bar:null → 零节点零体类（Review Focus 2 的 JS 半边）
  await page.evaluate(() => window.__CERAIL_TRADEFX__('{"mode":"trade","trader":{"wants":[],"half":[]},"bar":null}'));
  const bar3 = await frame().evaluate(() => ({
    nodes: document.querySelectorAll('.cfx-bar-offer,.cfx-bar-goods,.cfx-bar-tip').length,
    body: document.body.classList.contains('cfx-bar'),
  }));
  check('tfx:bar-null-no-render', bar3.nodes === 0 && bar3.body === false, JSON.stringify(bar3));

  // ④ 幂等：渲染→快照→重推同 JSON → .foot-main outerHTML 恒等
  await page.evaluate((j) => window.__CERAIL_TRADEFX__(j), TRADE_JSON);
  await frame().evaluate(() => { window.__snapBar = document.querySelector('.foot-main').outerHTML; });
  await page.evaluate((j) => window.__CERAIL_TRADEFX__(j), TRADE_JSON);
  const barIdem = await frame().evaluate(() => document.querySelector('.foot-main').outerHTML === window.__snapBar);
  check('tfx:bar-idempotent', barIdem === true, '同 JSON 重推零 DOM 写');

  // ⑤ mode:none → 全清（Review Focus 4）
  await page.evaluate(() => window.__CERAIL_TRADEFX__('{"mode":"none"}'));
  const bar5 = await frame().evaluate(() => ({
    nodes: document.querySelectorAll('.cfx-bar-offer,.cfx-bar-goods,.cfx-bar-tip').length,
    body: document.body.classList.contains('cfx-bar'),
  }));
  check('tfx:bar-clear-on-none', bar5.nodes === 0 && bar5.body === false, JSON.stringify(bar5));

  // ⑥ hover 气泡显隐（夹具天平条不可见，Playwright 物理 hover 不可行——直派事件测监听路径）
  await page.evaluate((j) => window.__CERAIL_TRADEFX__(j), TRADE_JSON);
  const tipShown = await frame().evaluate(() => {
    document.querySelector('.bal-track').dispatchEvent(new MouseEvent('mouseenter'));
    const t = document.querySelector('.foot-main .cfx-bar-tip');
    return t ? !t.hidden : false;
  });
  const tipGone = await frame().evaluate(() => {
    document.querySelector('.bal-track').dispatchEvent(new MouseEvent('mouseleave'));
    const t = document.querySelector('.foot-main .cfx-bar-tip');
    return t ? t.hidden : true;
  });
  check('tfx:bar-hover-tip', tipShown === true && tipGone === true, `shown=${tipShown} hidden-after=${tipGone}`);

  // ===== 终审修复 C1：C# 直推实参是对象（脚本拼接裸 JSON），入口必须直收对象 =====
  const objArg = await page.evaluate(() => {
    const e = window.__CERAIL_TRADEFX__;
    e('{"mode":"none"}'); // 清场
    e({ mode: 'trade', trader: { wants: [{ n: '食物', x: '×1.5' }], half: [] }, bar: null });
    return e.data ? e.data.mode : '(null)';
  });
  check('tfx:entry-object-arg', objArg === 'trade', `对象实参直收（实得 ${objArg}）`);
  const objChips = await frame().evaluate(() => document.querySelectorAll('.cfx-head-row.cfx-wants .cfx-chip').length);
  check('tfx:entry-object-renders', objChips === 1, `对象路径渲染 chips=${objChips}`);

  // ===== 实机批改：节拍器自愈（实机取证=推送落在官方 DOM 未就绪瞬间，纯推送驱动死到下包） =====
  // 拆 .foot-main → 推 bar 数据（此刻渲染条件不满足=清路）→ 复原宿主 → 节拍器 500ms 内自愈重渲
  await frame().evaluate(() => {
    const main = document.querySelector('.foot-main');
    window.__footBak = main;
    if (main) main.remove();
  });
  await page.evaluate((j) => window.__CERAIL_TRADEFX__(j), TRADE_JSON);
  const barGone = await frame().evaluate(() => document.querySelectorAll('.cfx-bar-offer').length);
  await frame().evaluate(() => {
    const host = document.querySelector('.trade') || document.body;
    if (window.__footBak) host.appendChild(window.__footBak);
  });
  await page.waitForTimeout(700); // 节拍器周期 500ms
  const healed = await frame().evaluate(() => {
    const o = document.querySelector('.foot-main .cfx-bar-offer');
    return { offer: o ? o.textContent : '(none)', body: document.body.classList.contains('cfx-bar') };
  });
  check('tfx:metronome-heal', barGone === 0 && healed.offer === '84' && healed.body === true,
    `宿主后到自愈（拆时=${barGone} 复原后=${JSON.stringify(healed)}）`);

  // ===== 实机批改二批：观察器当帧补画（官方重渲染抹节点→rAF 内补回，不等 500ms 兜底） =====
  await page.evaluate((j) => window.__CERAIL_TRADEFX__(j), TRADE_JSON);
  await page.waitForTimeout(50);
  const wiped = await frame().evaluate(() => {
    document.querySelectorAll('.cfx-head-row, .cfx-head, .cfx-bar-offer, .cfx-bar-goods, .cfx-bar-tip').forEach((n) => n.remove());
    return document.querySelectorAll('.cfx-head-row, .cfx-bar-offer').length; // 模拟 Vue 重渲染整段抹掉
  });
  await page.waitForTimeout(250); // <500ms 兜底周期——只有观察器来得及
  const healedFast = await frame().evaluate(() => ({
    chips: document.querySelectorAll('.cfx-head-row.cfx-wants .cfx-chip').length,
    offer: (document.querySelector('.foot-main .cfx-bar-offer') || {}).textContent || '(none)',
  }));
  check('tfx:observer-fast-heal', wiped === 0 && healedFast.chips === 2 && healedFast.offer === '84',
    `官方抹节点后 250ms 内补回（wiped=${wiped} healed=${JSON.stringify(healedFast)}）`);

  // ===== 批2 A1/A5（实机批改四批提前）：格子价值徽章（官方单件值）+ 货架单价 =====
  // 载荷 id 直读夹具 Vue bag.items（join 真实口径）；shelf 经 Vue state 推入（模板真渲行）
  const badgePayload = await frame().evaluate(() => {
    const a = document.getElementById('app');
    const su = a && a._vnode && a._vnode.component && a._vnode.component.setupState;
    const items = su && su.bag && su.bag.items ? su.bag.items : [];
    const i1 = items[0] && items[0].id, i2 = items[1] && items[1].id;
    window.__ids = [i1, i2];
    return JSON.stringify({ mode: 'trade', trader: { wants: [], half: [] }, bar: null,
      items: { [i1]: { v: 38, t: 'w' }, [i2]: { v: 5, t: 'f' } }, shelf: {} });
  });
  await page.evaluate((j) => window.__CERAIL_TRADEFX__(j), badgePayload);
  await page.waitForTimeout(80);
  const cellBadge = await frame().evaluate(() => {
    const cells = document.querySelectorAll('#tradeBagGrid .item');
    const out = [];
    cells.forEach((c) => { const b = c.querySelector(':scope > .cfx-cell-badge'); if (b) out.push(b.textContent + '/' + (b.className.indexOf('cfx-t-w') >= 0 ? 'w' : b.className.indexOf('cfx-t-l') >= 0 ? 'l' : 'f')); });
    return { n: document.querySelectorAll('#tradeBagGrid .cfx-cell-badge').length, out: out.slice(0, 4), cells: cells.length };
  });
  check('tfx:cell-badges', cellBadge.n === 2 && cellBadge.out.indexOf('38/w') >= 0 && cellBadge.out.indexOf('5/f') >= 0,
    JSON.stringify(cellBadge));

  // 幂等 + none 清路
  await page.evaluate((j) => window.__CERAIL_TRADEFX__(j), badgePayload);
  await page.evaluate(() => window.__CERAIL_TRADEFX__('{"mode":"none"}'));
  const cellCleared = await frame().evaluate(() => document.querySelectorAll('#tradeBagGrid .cfx-cell-badge').length);
  check('tfx:cell-badges-clear', cellCleared === 0, `none 后=${cellCleared}`);

  // 货架单价 + 点击弹详情命令（经 Vue state 种行=模板真渲染）
  await frame().evaluate(() => {
    const a = document.getElementById('app');
    const su = a && a._vnode && a._vnode.component && a._vnode.component.setupState;
    if (su && su.shelf && su.shelf.items) {
      su.shelf.items.push({ id: 55001, icon: '', name: '测试A' }, { id: 55002, icon: '', name: '测试B' });
    }
  });
  await page.waitForTimeout(120);
  await page.evaluate(() => window.__CERAIL_TRADEFX__(JSON.stringify({ mode: 'trade', trader: { wants: [], half: [] }, bar: null, items: {}, shelf: { 55001: { v: 20 }, 55002: { v: 30 } } })));
  await page.waitForTimeout(80);
  const shelfBadge = await frame().evaluate(() => {
    const bs = Array.from(document.querySelectorAll('.shelf-list .shelf-icon .cfx-cell-badge')).map((b) => b.textContent);
    const icon = document.querySelector('.shelf-list .shelf-icon');
    if (icon) icon.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { badges: bs, rows: document.querySelectorAll('.shelf-list .shelf-row').length };
  });
  const detailCmd = await page.evaluate(() => {
    try { return JSON.parse(window.__CERAIL__.drain() || '[]').filter((c) => c.op === 'detail'); } catch (e) { return []; }
  });
  check('tfx:shelf-badges', shelfBadge.rows === 2 && shelfBadge.badges.length === 2 &&
    shelfBadge.badges.indexOf('20') >= 0 && shelfBadge.badges.indexOf('30') >= 0, JSON.stringify(shelfBadge));
  check('tfx:shelf-detail-cmd', detailCmd.length === 1 && detailCmd[0].item === 55001, JSON.stringify(detailCmd));

  // ===== A2 悬停提示（实机批改七批定稿：tooltipState→div.tooltip 追加 .cfx-tip） =====
  const tipPayload = await frame().evaluate(() => {
    const a = document.getElementById('app');
    const su = a && a._vnode && a._vnode.component && a._vnode.component.setupState;
    const items = su && su.bag && su.bag.items ? su.bag.items : [];
    window.__tid = items[0] && items[0].id;
    return JSON.stringify({ mode: 'trade', trader: { wants: [], half: [] }, bar: null,
      items: { [window.__tid]: { v: 38, t: 'w', m: '×1.3', u: '2/4' } }, shelf: { 55001: { v: 20, u: '5次' } } });
  });
  await page.evaluate((j) => window.__CERAIL_TRADEFX__(j), tipPayload);
  await page.waitForTimeout(80);
  const tipCell = await frame().evaluate(async () => {
    const a = document.getElementById('app');
    const su = a && a._vnode && a._vnode.component && a._vnode.component.setupState;
    if (!su || typeof su.onItemEnter !== 'function') return '(no onItemEnter)';
    su.onItemEnter({ clientX: 100, clientY: 100 }, { id: window.__tid });
    await new Promise((r) => setTimeout(r, 120)); // wrap→官方→Vue 渲染→rAF 追加
    const b = document.querySelector('div.tooltip .cfx-tip');
    return b ? b.textContent : '(no block)';
  });
  check('tfx:tip-cell', tipCell === '出售 38 · 想要 ×1.3 · 剩余使用 2/4', tipCell);
  const tipShelf = await frame().evaluate(async () => {
    const a = document.getElementById('app');
    const su = a && a._vnode && a._vnode.component && a._vnode.component.setupState;
    su.onItemEnter({ clientX: 100, clientY: 100 }, { id: 55001 });
    await new Promise((r) => setTimeout(r, 120));
    const b = document.querySelector('div.tooltip .cfx-tip');
    return b ? b.textContent : '(no block)';
  });
  check('tfx:tip-shelf', tipShelf === '整件 20 · 5次使用', tipShelf);
  
  // ===== B7-10：request/supply 模式渲染（载荷直驱；行=手工种 .sup-list 结构） =====
  const reqPayload = await frame().evaluate(() => {
    const a = document.getElementById('app');
    const su = a && a._vnode && a._vnode.component && a._vnode.component.setupState;
    const items = su && su.bag && su.bag.items ? su.bag.items : [];
    window.__rid = items[0] && items[0].id;
    // 种官方 sup-list 结构（两行×两格——夹具非 dispatch 态不渲染该区）
    let list = document.querySelector('.sup-list');
    if (!list) {
      list = document.createElement('div');
      list.className = 'sup-list';
      (document.querySelector('.trade') || document.body).appendChild(list);
    }
    list.innerHTML = '';
    for (let r = 0; r < 2; r++) {
      const row = document.createElement('div');
      row.className = 'sup-row' + (r === 0 ? ' on' : '');
      const dims = document.createElement('div');
      dims.className = 'sup-dims';
      for (let c = 0; c < 2; c++) {
        const cell = document.createElement('span');
        cell.className = 'sup-cell';
        const dl = document.createElement('span');
        dl.className = 'sup-dl';
        dl.textContent = '需求' + r + c;
        cell.appendChild(dl);
        dims.appendChild(cell);
      }
      row.appendChild(dims);
      list.appendChild(row);
    }
    return JSON.stringify({
      mode: 'request',
      items: { [window.__rid]: { v: 3, t: 'f' } },
      requests: [
        { k: 1, id: 11, rows: [{ n: 5, p: 2, d: false, i: 55001 }, { n: 4, p: 4, d: true, i: 0 }] },
        { k: 4, id: 1002, rows: [{ n: 3, p: 0, d: false, i: 55002 }, { n: 6, p: 1, d: false, i: 0 }] },
      ],
      rewards: [
        { k: 1, id: 11, g: [{ c: 55001, q: 2 }] },
        { k: 4, id: 1002, g: [{ c: 55002, q: 1 }] },
      ],
      objects: {
        55001: JSON.stringify({ id: 55001, n: '物资A', icon: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }),
        55002: JSON.stringify({ id: 55002, n: '物资B', icon: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }),
      },
    });
  });
  await page.evaluate((j) => window.__CERAIL_TRADEFX__(j), reqPayload);
  await page.waitForTimeout(120);
  const reqState = await frame().evaluate(() => {
    const rows = document.querySelectorAll('.sup-list > .sup-row');
    const counts = Array.from(document.querySelectorAll('.cfx-count')).map((c) => c.textContent);
    const icons = document.querySelectorAll('img.cfx-dicon').length;
    const strips = document.querySelectorAll('.cfx-rewards').length;
    const stripTitles = document.querySelectorAll('.cfx-rewards-title').length;
    const cellBadge = document.querySelector('#tradeBagGrid .cfx-cell-badge');
    return {
      marked: document.querySelectorAll('.sup-row[data-cfx-bars]').length,
      counts: counts.join('|'), icons, strips, stripTitles,
      badge: cellBadge ? cellBadge.textContent : '(none)',
    };
  });
  check('tfx:req-cell-badge', reqState.badge === '+3', `request 徽章=${reqState.badge}`);
  check('tfx:req-rows', reqState.marked === 2 && reqState.counts === '' && reqState.icons === 2,
    JSON.stringify(reqState)); /* 十四批：计数已去（官方进度条重复），图标保留 */
  check('tfx:req-rewards', reqState.strips === 2 && reqState.stripTitles === 2, JSON.stringify(reqState));
  // B10：supply 模式药品 chip
  await page.evaluate((id) => window.__CERAIL_TRADEFX__(JSON.stringify({ mode: 'supply', medicine: 7, items: { [id]: { v: 4, t: 'w' } } })), await frame().evaluate(() => window.__rid));
  await page.waitForTimeout(100);
  const medState = await frame().evaluate(() => {
    const chip = document.querySelector('.cfx-med');
    const badge = document.querySelector('#tradeBagGrid .cfx-cell-badge');
    return { med: chip ? chip.textContent : '(none)', badge: badge ? badge.textContent : '(none)' };
  });
  check('tfx:supply-med', medState.med === '药品 +7' && medState.badge === '4', JSON.stringify(medState));
  // 清场（none）B 组全清
  await page.evaluate(() => window.__CERAIL_TRADEFX__('{"mode":"none"}'));
  const clearedB = await frame().evaluate(() => ({
    counts: document.querySelectorAll('.cfx-count, img.cfx-dicon').length,
    strips: document.querySelectorAll('.cfx-rewards').length,
    med: document.querySelectorAll('.cfx-med').length,
    badges: document.querySelectorAll('.cfx-cell-badge').length,
  }));
  check('tfx:b-clear-on-none', clearedB.counts === 0 && clearedB.strips === 0 && clearedB.med === 0 && clearedB.badges === 0,
    JSON.stringify(clearedB));

  // ===== 实机批改十批：奖励条带宿主适配（.sup-details 结构行——行外插入=无限堆叠复现） =====
  await frame().evaluate(() => {
    // 种一行无 .sup-dims、只有 .sup-details 的官方结构（复现当前派送页行形）
    const list = document.querySelector('.sup-list');
    list.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'sup-row';
    const det = document.createElement('div');
    det.className = 'sup-details';
    const cell = document.createElement('span');
    cell.className = 'sup-cell';
    const dl = document.createElement('span');
    dl.className = 'sup-dl';
    dl.textContent = '需求X';
    cell.appendChild(dl);
    det.appendChild(cell);
    row.appendChild(det);
    list.appendChild(row);
  });
  const stackPayload = JSON.stringify({
    mode: 'request', items: {},
    requests: [{ k: 4, id: 1002, rows: [{ n: 3, p: 1, d: false, i: 55002 }] }],
    rewards: [{ k: 4, id: 1002, g: [{ c: 55002, q: 2 }] }],
    objects: { 55002: { id: 55002, n: '物资B', icon: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' } },
  });
  await page.evaluate((j) => window.__CERAIL_TRADEFX__(j), stackPayload);
  await page.waitForTimeout(60);
  await page.evaluate((j) => window.__CERAIL_TRADEFX__(j), stackPayload); // 重推（观察器同款再入）
  await page.waitForTimeout(60);
  await page.evaluate((j) => window.__CERAIL_TRADEFX__(j), stackPayload);
  await page.waitForTimeout(60);
  const stack = await frame().evaluate(() => ({
    strips: document.querySelectorAll('.cfx-rewards').length,
    inRow: document.querySelectorAll('.sup-row > .cfx-rewards').length,
    x2: document.querySelectorAll('.cfx-xn').length,
  }));
  check('tfx:rewards-no-stack', stack.strips === 1 && stack.inRow === 1 && stack.x2 === 1, JSON.stringify(stack));

  // ===== 实机批改十三批：request 态兜底节拍器（开页官方行后到=apply 错过即死到下包） =====
  await frame().evaluate(() => { const l = document.querySelector('.sup-list'); if (l) l.remove(); });
  const latePayload = JSON.stringify({ mode: 'request', items: {},
    requests: [{ k: 4, id: 1003, rows: [{ n: 5, p: 2, d: false, i: 55002 }] }],
    rewards: [{ k: 4, id: 1003, g: [{ c: 55002, q: 1 }] }],
    objects: { 55002: { id: 55002, n: '物资B', icon: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' } } });
  await page.evaluate((j) => window.__CERAIL_TRADEFX__(j), latePayload); // 行未在场时推（=开页竞态）
  await frame().evaluate(() => { // 官方行后到
    const list = document.createElement('div');
    list.className = 'sup-list';
    (document.querySelector('.trade') || document.body).appendChild(list);
    const row = document.createElement('div');
    row.className = 'sup-row';
    const dims = document.createElement('div');
    dims.className = 'sup-dims';
    const cell = document.createElement('span');
    cell.className = 'sup-cell';
    cell.appendChild(Object.assign(document.createElement('span'), { className: 'sup-dl', textContent: '需求Y' }));
    dims.appendChild(cell);
    row.appendChild(dims);
    list.appendChild(row);
  });
  await page.waitForTimeout(700); // 兜底节拍器周期（<500ms×1.5）
  const lateRow = await frame().evaluate(() => ({
    icons: document.querySelectorAll('img.cfx-dicon').length,
    strips: document.querySelectorAll('.cfx-rewards').length,
  }));
  check('tfx:request-metronome-heal', lateRow.icons >= 1 && lateRow.strips >= 1, JSON.stringify(lateRow));

  // 尾检
  check('tfx:console-zero-errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' ; '));
  check('tfx:pageerror-zero', pageErrors.length === 0, pageErrors.slice(0, 2).join(' ; '));

  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== TRADEFX SUMMARY: ${results.length - fail}/${results.length} ${fail ? 'FAIL' : 'PASS'} ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS CRASH: ' + e); process.exit(2); });
