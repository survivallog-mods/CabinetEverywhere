/* v193 作者场景 harness（2026-11-01 第九轮作者线索：「开包后物品位置变更（手动拖拽/一键整理），
   再排序 → 数值全是原位置物品的/-'；重开背包才恢复」）。复现时序=作者真实操作序：
   开包（契约=此刻位置快照 P0）→ **先拖拽**（模型位置改写、契约不重推）→ **后排序**
   （首次 dispApply 才采 __srReal=已拖后位置 P1≠P0——位置 join 必错配/miss）。
   断言 id 直配（v1.8.5⑩）：①换位后数值跟物品走 ②拖去契约无行的空格数值保持不 '-'。
   红灯对照：位置 join 下 ①数值互换 ②'-'（toggle off 实测验证过测试有效性）。 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 } });

  const openPage = async () => {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
    await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { try { localStorage.removeItem('srp_fsort_BackpackUI'); } catch (e) { } });
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.__HZ_SHOW__('BackpackUI'));
    const fr = page.frames().find((f) => f.url().includes('/fixtures/BackpackUI.html'));
    await fr.waitForFunction(() => !!document.getElementById('srnSortBtn'), null, { timeout: 15000 });
    await page.waitForTimeout(400);
    return { page, fr, errs };
  };
  const sortSat = async (fr, page) => {
    await fr.evaluate(() => document.getElementById('srnSortBtn').click());
    await fr.waitForFunction(() => !document.getElementById('srnSortPop').hidden, null, { timeout: 4000 });
    await fr.evaluate(() => document.querySelector('#srnSortPop [data-k="sat"]').click());
    await page.waitForTimeout(350);
  };
  /* 模型位置直改（官方拖拽同款：reactive items 原位改 x/y，**不重推契约**） */
  const moveItem = (fr, id, x, y) => fr.evaluate(([iid, nx, ny]) => {
    const app = document.querySelector('#app');
    const su = (app.__vueParentComponent || app._vnode.component).setupState;
    const it = su.bagA.items.find((v) => v.id === iid);
    if (!it) return false;
    it.x = nx; it.y = ny;
    return true;
  }, [id, x, y]);
  /* 格↔角标配对：视觉序 zip（角标层与 .item 层同序），图标尾段 #v<cfg> 作物品身份 */
  const pairs = (fr) => fr.evaluate(() => {
    const grid = document.querySelector('.bag-panel:not(.is-storage) .grid-container');
    const cells = [...grid.querySelectorAll('.item')].map((c) => {
      const img = c.querySelector('img');
      return { tail: img ? (img.getAttribute('src').match(/#v(\d+)/) || [])[1] : null, l: c.offsetLeft, t: c.offsetTop };
    }).sort((a, b) => (a.t - b.t) || (a.l - b.l));
    const badges = [...document.querySelectorAll('#srnBadges i')]
      .map((b) => ({ txt: b.textContent, l: parseFloat(b.style.left) || 0, t: parseFloat(b.style.top) || 0 }))
      .sort((a, b) => (a.t - b.t) || (a.l - b.l));
    return cells.map((c, i) => ({ tail: c.tail, badge: badges[i] ? badges[i].txt : null }));
  });
  const badgeOf = async (fr, tail) => (await pairs(fr)).filter((p) => p.tail === tail).map((p) => p.badge);

  /* 场景 A：开包 → 先互换 901/902 位置（不重推契约）→ 后排序（首次=快照采在拖后位） */
  {
    const { page, fr, errs } = await openPage();
    const p1 = await fr.evaluate(() => { const app = document.querySelector('#app'); const su = (app.__vueParentComponent || app._vnode.component).setupState; const a = su.bagA.items.find((v) => v.id === 901), b = su.bagA.items.find((v) => v.id === 902); return [a.x, a.y, b.x, b.y]; });
    await moveItem(fr, 901, p1[2], p1[3]);
    await moveItem(fr, 902, p1[0], p1[1]);
    await page.waitForTimeout(250);
    await sortSat(fr, page);
    check('v193:swap-v1-still-15', (await badgeOf(fr, '1')).join(',') === '15', JSON.stringify(await badgeOf(fr, '1')) + '（位置 join 红=8：拿到原位物品 902 的值）');
    check('v193:swap-v3-still-8', (await badgeOf(fr, '3')).join(',') === '8', JSON.stringify(await badgeOf(fr, '3')) + '（位置 join 红=15）');
    const firstBadge = await fr.evaluate(() => [...document.querySelectorAll('#srnBadges i')]
      .map((i) => ({ t: i.textContent, l: parseFloat(i.style.left) || 0, tp: parseFloat(i.style.top) || 0 }))
      .sort((a, b) => (a.tp - b.tp) || (a.l - b.l)).map((x) => x.t)[0]);
    check('v193:swap-first=15', firstBadge === '15', '视觉首格=' + firstBadge);
    check('v193:swap-console-clean', errs.length === 0, errs.slice(0, 3).join(' | '));
    await page.close();
  }

  /* 场景 B：开包 → 先把 901 拖去契约无行的空格 (8,0) → 后排序（位置 join 必 miss → 旧路 '-'） */
  {
    const { page, fr, errs } = await openPage();
    await moveItem(fr, 901, 8, 0);
    await page.waitForTimeout(250);
    await sortSat(fr, page);
    check('v193:empty-slot-v1-keeps-15', (await badgeOf(fr, '1')).join(',') === '15', JSON.stringify(await badgeOf(fr, '1')) + '（位置 join 红=-）');
    const firstBadge = await fr.evaluate(() => [...document.querySelectorAll('#srnBadges i')]
      .map((i) => ({ t: i.textContent, l: parseFloat(i.style.left) || 0, tp: parseFloat(i.style.top) || 0 }))
      .sort((a, b) => (a.tp - b.tp) || (a.l - b.l)).map((x) => x.t)[0]);
    check('v193:empty-slot-first=15', firstBadge === '15', '视觉首格=' + firstBadge);
    check('v193:empty-console-clean', errs.length === 0, errs.slice(0, 3).join(' | '));
    await page.close();
  }

  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== v193 TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FATAL', String(e)); process.exit(1); });
