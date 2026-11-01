/* v196 实机终验（第九轮 a/b + ⑪ owner 现解析，构建 48aae7）。我方自起游戏→载作者存档→
   开背包→排序→用 [对账] 日志（60045/60093 InstanceId/实例/天赋单次/uses/角标）在 UI 里
   锁定那两份料理读角标对数；再拖拽换位（模型直改、契约不重推）复测数值跟物品。
   零真实数据改动（显示层 only）。单连接干净退出；游戏保持运行留给作者直接复测。 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const GAME = 'E:/SteamLibrary/steamapps/common/Survival Log/SurvivalLog.exe';
const LOG = 'E:/SteamLibrary/steamapps/common/Survival Log/BepInEx/LogOutput.log';
const OUT = path.join(__dirname, '..', '..', 'SurvivalLog.CabinetEverywhere', 'design-proto', 'shots', 'ingame-v196');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}
const evT = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms || 12000))]);
const WD = setTimeout(() => { console.log('[wd] 12min 收卷'); finish(); }, 720000);
function finish() {
  clearTimeout(WD);
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== v196 TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  try { fs.writeFileSync(path.join(OUT, 'matrix.json'), JSON.stringify(results, null, 1)); } catch (e) { }
  process.exit(fail ? 1 : 0);
}

(async () => {
  /* ① 起游戏（若已运行则跳过） */
  const { exec } = require('child_process');
  const httpGet = (url) => new Promise((res) => require('http').get(url, (r) => res(true)).on('error', () => res(false)));
  if (!(await evT(httpGet('http://127.0.0.1:9222/json/version'), 3000))) {
    exec('start "" "' + GAME + '"');
    let up = false;
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      up = await evT(httpGet('http://127.0.0.1:9222/json/version'), 2500);
      if (up) break;
    }
    check('boot:cdp', up, up ? '9222 就绪' : 'CDP 未起');
    if (!up) finish();
  } else check('boot:cdp', true, '游戏已在运行（沿用）');

  const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 30000 });
  const page = browser.contexts()[0].pages().find((p) => decodeURIComponent(p.url()).indexOf('Root') >= 0);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 100)));

  /* ② 载档（主菜单→继续生存→HUD；点击带重试——帧晚挂时 i===0 一次会扑空） */
  let menuClicked = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(3000);
    if (await evT(page.evaluate(() => !!document.querySelector('iframe#CoreUI1')), 8000)) break;
    if (!menuClicked) {
      const m = page.frames().find((f) => f.url().indexOf('/MainUI.') >= 0);
      if (m) await m.locator('.menu-text:has-text("继续生存")').first().click({ timeout: 5000 })
        .then(() => { menuClicked = true; }).catch(() => { });
    }
  }
  check('boot:hud', await evT(page.evaluate(() => !!document.querySelector('iframe#CoreUI1')), 8000), 'HUD 就绪');

  /* ③ 开背包（HUD 背包B 钮；已开则不点） */
  let bp = page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/BackpackUI.') >= 0);
  if (!bp) {
    const core = page.frames().find((f) => f.url().indexOf('/CoreUI1.') >= 0);
    await evT(core.evaluate(() => { const el = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').trim().indexOf('背包B') === 0); if (el) el.click(); }));
    for (let i = 0; i < 15; i++) { await page.waitForTimeout(1000); bp = page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/BackpackUI.') >= 0); if (bp) break; }
  }
  check('boot:bp', !!bp, bp ? 'BackpackUI 开' : '未开');
  if (!bp) finish();
  await bp.waitForFunction(() => !!document.getElementById('srnSortBtn'), null, { timeout: 12000 }).catch(() => { });
  check('boot:nb-btn', await evT(bp.evaluate(() => !!document.getElementById('srnSortBtn'))), '⇅排序▾ 在场');
  await page.waitForTimeout(1500);

  const sortSat = async () => {
    await evT(bp.evaluate(() => document.getElementById('srnSortBtn').click()));
    await bp.waitForFunction(() => !document.getElementById('srnSortPop').hidden, null, { timeout: 5000 });
    await evT(bp.evaluate(() => { const o = document.querySelector('#srnSortPop [data-k="sat"]'); if (o) o.click(); }));
    await page.waitForTimeout(900);
  };
  /* UI 侧：模型 id → 角标（下标直配：#srnBadges i 序 = 官方 cells 序 = bagA.items 序） */
  const badgeById = () => evT(bp.evaluate(() => {
    const su = document.getElementById('app')._vnode.component.setupState;
    const raw = [...document.querySelectorAll('#srnBadges i')];
    const out = {};
    su.bagA.items.forEach((m, i) => { out[m.id] = raw[i] ? raw[i].textContent : null; });
    return out;
  }), 15000);

  await sortSat();
  await page.screenshot({ path: path.join(OUT, 'bp-sat.png') }).catch(() => { });
  const uiBadges = await badgeById();
  check('ui:badges-present', Object.keys(uiBadges).length > 0 && Object.values(uiBadges).some((t) => t && t !== '-'),
    `n=${Object.keys(uiBadges).length} 有值=${Object.values(uiBadges).filter((t) => t && t !== '-').length}`);

  /* ④ 日志：[因子] + [对账]（60045 菌菇饭/60093 龙虎） */
  let log = '';
  for (let i = 0; i < 10; i++) { log = fs.readFileSync(LOG, 'utf-8'); if (log.indexOf('[CERail][对账]') >= 0) break; await page.waitForTimeout(1500); }
  const factorLine = (log.match(/\[CERail\]\[因子\].*/) || [])[0] || '';
  check('log:factor-line', factorLine.length > 0, factorLine.slice(0, 120));
  const vouches = [...log.matchAll(/\[CERail\]\[对账\] (\d+) (\S+) (?:实例|配置)=\[[^\]]*\] 天赋单次=\[([^\]]*)\] uses=(\d+)\/(\d+) → 角标=\[([^\]]*)\]/g)]
    .map((m) => ({ cfg: m[1], iid: m[2], per: m[3].split(',').map(Number), uses: +m[4], max: +m[5], badge: m[6].split(',').map((x) => x.trim()) }))
    .filter((v) => v.iid in uiBadges); /* 只取 UI 当前背包里在场的（对账会记冰箱副本） */
  check('log:vouch-in-bag', vouches.length > 0,
    vouches.map((v) => `cfg${v.cfg} 单次[${v.per.join(',')}]×${v.uses}次→[${v.badge.join(',')}]`).join(' ; ').slice(0, 130) || '（背包无 60045/60093——对账行数=' + (log.match(/\[对账\]/g) || []).length + '）');

  /* ⑤ UI 对数 */
  for (const v of vouches.slice(0, 2)) {
    const ui = uiBadges[v.iid];
    const expect = v.badge.filter((x) => x !== '-');
    check('ui:' + v.cfg + '-badge', ui != null && ui !== '-' && expect.indexOf(ui) >= 0,
      `iid=${v.iid} UI=${ui} 对账=[${v.badge.join(',')}]（单次[${v.per.join(',')}]×${v.uses}次）`);
  }

  /* ⑥ 拖拽场景（作者线索）：与另一件物品换模型位（契约不重推）→ 再排序 → 数值不变 */
  const someId = Object.keys(uiBadges).find((k) => k);
  const dishId = vouches.length ? vouches[0].iid : someId;
  if (dishId != null) {
    const before = uiBadges[dishId];
    await evT(bp.evaluate((a) => {
      const su = document.getElementById('app')._vnode.component.setupState;
      const ia = su.bagA.items.find((x) => String(x.id) === String(a));
      const ib = su.bagA.items.find((x) => String(x.id) !== String(a));
      if (!ia || !ib) return false;
      const tx = ia.x, ty = ia.y; ia.x = ib.x; ia.y = ib.y; ib.x = tx; ib.y = ty;
      return true;
    }, dishId));
    await page.waitForTimeout(300);
    await sortSat();
    const after = (await badgeById())[dishId];
    check('ui:drag-value-follows', before === after && after != null, `拖拽换位后 ${before} → ${after}（位置 join 红：变对方值/'-'）`);
    await page.screenshot({ path: path.join(OUT, 'bp-drag.png') }).catch(() => { });
  }

  check('ui:zero-page-errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close(); /* 断开 CDP；游戏保持运行（作者可直接接管复测） */
  finish();
})().catch((e) => { console.error('HARNESS ERROR', String(e).slice(0, 300)); process.exit(2); });
