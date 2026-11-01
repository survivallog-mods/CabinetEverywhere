/* v190 作者场景实机验证（2026-11-01 缺陷单#1 第三轮：显示层排序 v2 模型级）。
   场景=作者实测路径：ProjectCook 停用 + HUD 开单独背包 + ⇅排序▾ 逐键。
   断言（每键 sat/mind/en/hp/value/shelf）：
   ①模型真实位不变（排序前后 su.bagA.items 的 id→(x,y) 全等——真实布局零触碰）
   ②视觉序变化（DOM 格 left/top 集合变化）
   ③角标在场且数值稳定（两次读取一致——「数值变来去」根治）
   ④official 还原=视觉位回到排序前原件
   ⑤零数据层 sortBy 命令（BepInEx 日志事后核对）。单连接干净退出。 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const OUT = path.join(__dirname, '..', '..', 'SurvivalLog.CabinetEverywhere', 'design-proto', 'shots', 'ingame-v190');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}
const WD = setTimeout(() => { console.log('[wd] 6min 强制收卷'); finish(); }, 360000);
function finish() {
  clearTimeout(WD);
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  try { fs.writeFileSync(path.join(OUT, 'matrix.json'), JSON.stringify(results, null, 1)); } catch (e) { }
  process.exit(fail ? 1 : 0);
}
const evT = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r('__TO__'), ms || 12000))]);

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 30000 });
  const page = browser.contexts()[0].pages().find((p) => decodeURIComponent(p.url()).indexOf('Root') >= 0);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));

  /* 存档就绪（主菜单→继续生存→HUD） */
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(3000);
    if (await evT(page.evaluate(() => !!document.querySelector('iframe#CoreUI1')), 8000)) break;
    const m = page.frames().find((f) => f.url().indexOf('/MainUI.') >= 0);
    if (m && i === 0) await m.locator('.menu-text:has-text("继续生存")').first().click({ timeout: 5000 }).catch(() => { });
  }
  /* 开背包：已开则不再点 HUD（HUD 钮会切换/关闭形态——两次实机教训）；未开才点 */
  let bp = page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/BackpackUI.') >= 0);
  if (!bp) {
    const core = page.frames().find((f) => f.url().indexOf('/CoreUI1.') >= 0);
    if (!core) { check('boot', false, 'CoreUI1 缺'); finish(); }
    await evT(core.evaluate(() => { const el = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').trim().indexOf('背包B') === 0); if (el) el.click(); }));
    for (let i = 0; i < 10; i++) { await page.waitForTimeout(1000); bp = page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/BackpackUI.') >= 0); if (bp) break; }
  }
  if (!bp) { check('boot:bp-open', false, 'BackpackUI 未开'); finish(); }
  await bp.waitForFunction(() => !!document.getElementById('srnSortBtn'), null, { timeout: 10000 }).catch(() => { });
  check('boot:nb-buttons', await evT(bp.evaluate(() => !!document.getElementById('srnSortBtn'))), '⇅排序▾ 在场（A=背包形态才装配）');
  await page.waitForTimeout(1200); /* 首包+渲染稳定 */

  const realOf = () => evT(bp.evaluate(() => {
    const su = document.getElementById('app')._vnode.component.setupState;
    const o = {};
    for (const it of su.bagA.items) o[it.id] = (it.x || 0) + ',' + (it.y || 0);
    return o;
  }));
  const visOf = () => evT(bp.evaluate(() => {
    const g = document.querySelector('.bag-panel:not(.is-storage) .grid-container');
    return g ? [...g.querySelectorAll('.item')].map((e) => Math.round(parseFloat(e.style.left) || 0) + ':' + Math.round(parseFloat(e.style.top) || 0)).join(';') : '';
  }));
  const badgesOf = () => evT(bp.evaluate(() => {
    const l = document.getElementById('srnBadges');
    return l ? [...l.querySelectorAll('i')].map((i) => i.textContent) : [];
  }));

  const real0 = await realOf();
  const vis0 = await visOf();
  check('boot:bag-items', Object.keys(real0).length > 0, `${Object.keys(real0).length} 叠`);

  for (const key of ['sat', 'mind', 'en', 'hp', 'value', 'shelf']) {
    try {
      await evT(bp.evaluate(() => document.getElementById('srnSortBtn').click()));
      await bp.waitForFunction(() => !document.getElementById('srnSortPop').hidden, null, { timeout: 5000 });
      await evT(bp.evaluate((k) => { const o = document.querySelector('#srnSortPop [data-k="' + k + '"]'); if (o) o.click(); }, key));
      await page.waitForTimeout(900);
      const real1 = await realOf(), vis1 = await visOf(), bd1 = await badgesOf();
      await page.waitForTimeout(1200); /* 一包回推后再读——稳定性（数值变来变去根治断言） */
      const bd2 = await badgesOf(), vis2 = await visOf();
      const realSame = JSON.stringify(real0) === JSON.stringify(real1);
      const visChanged = vis0 !== vis1;
      check(key + ':real-untouched', realSame, realSame ? '真实位零变动' : '真实位被改!');
      check(key + ':visual-reorder', visChanged, visChanged ? '视觉序变化' : '视觉未变');
      check(key + ':badges-stable', JSON.stringify(bd1) === JSON.stringify(bd2) && bd1.length > 0,
        `n=${bd1.length} 稳定=${JSON.stringify(bd1) === JSON.stringify(bd2)} [${bd1.slice(0, 6).join(',')}]`);
      await page.screenshot({ path: path.join(OUT, 'bp-' + key + '.png') }).catch(() => { });
      /* official 还原后视觉回到原件 */
      await evT(bp.evaluate(() => document.getElementById('srnSortBtn').click()));
      await bp.waitForFunction(() => !document.getElementById('srnSortPop').hidden, null, { timeout: 5000 });
      await evT(bp.evaluate(() => { const o = document.querySelector('#srnSortPop [data-k="official"]'); if (o) o.click(); }));
      await page.waitForTimeout(800);
      const visR = await visOf();
      check(key + ':official-restore', visR === vis0, visR === vis0 ? '还原=排序前原件' : '还原不符');
    } catch (e) { check(key + ':scene', false, String(e).slice(0, 80)); }
  }
  check('zero-page-errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await page.screenshot({ path: path.join(OUT, 'bp-final.png') }).catch(() => { });
  await browser.close(); /* 干净退出（防 devtools 楔死） */
  finish();
})().catch((e) => { console.error('HARNESS ERROR', String(e).slice(0, 200)); process.exit(2); });
