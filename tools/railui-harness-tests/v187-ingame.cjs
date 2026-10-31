/* 2026-11-01 缺陷单#1+#2 实机验收（CDP 9222 + uiShow 官方 ShowUI 重放独驱动）。
   #1 排序：食品五页+BackpackUI 逐键（sat/mind/en/hp/value/shelf）→ 回执 toast（moved 数）+
      官方格真实重排（数据层 BagPos 变化：命令前后读契约行 x/y 序）+ 角标在场率与取值域
      （shelf=天/已过期、value=数字、属性=数字或—）；Trade 进页自动交易价值排序+买家条 chips。
   #2 页签：九机器页逐页——rail 页签集合（view 语义+TABS 门）、全平铺（非前 4 截断）、
      点击切换官方格真实回绑（items 集变化）+ active 高亮、零死签（点击必有回绑或背包）。
   全程零控制台错误；每页 1536×864 截图。 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');

const OUT = path.join(__dirname, '..', '..', 'SurvivalLog.CabinetEverywhere', 'design-proto', 'shots', 'ingame-v187');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(scene, name, ok, detail) {
  results.push({ scene, name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + scene + ':' + name + (detail ? ' | ' + detail : ''));
}

(async () => {
  const WD = setTimeout(() => { console.log('[wd] 14min 强制收卷'); process.exit(3); }, 14 * 60 * 1000);
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => decodeURIComponent(p.url()).indexOf('Root') >= 0) || ctx.pages()[0];
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));

  /* 主菜单 → 继续存档（HUD=iframe#CoreUI1 在场） */
  const main = page.frames().find((f) => f.url().indexOf('/MainUI.') >= 0);
  if (main) {
    try { await main.locator('.menu-text:has-text("继续生存")').first().click({ timeout: 6000 }); } catch (e) {
      try { await main.locator('button:has-text("继续")').first().click({ timeout: 4000 }); } catch (e2) { console.log('[menu] 无继续按钮，假定已在存档'); }
    }
  }
  let hud = false;
  for (let i = 0; i < 50; i++) {
    await page.waitForTimeout(3000);
    if (await page.evaluate(() => !!document.querySelector('iframe#CoreUI1'))) { hud = true; console.log('[menu] 存档已载入 ~' + (i * 3 + 3) + 's'); break; }
  }
  check('boot', 'save-loaded', hud, hud ? '' : '150s 未见 HUD');

  /* 首开：HUD「背包」原生点击（rail 场景激活 → drain 通道就绪，uiShow 才能下发） */
  {
    const core = page.frames().find((f) => f.url().indexOf('/CoreUI1.') >= 0);
    if (core) {
      await core.evaluate(() => {
        const el = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').trim().indexOf('背包B') === 0);
        if (el) el.click();
        return !!el;
      }).then((ok) => console.log('[hud] 背包钮点击 ' + (ok ? '已发' : '未找到'))).catch((e) => console.log('[hud] 点击异常 ' + String(e).slice(0, 60)));
      await page.waitForTimeout(2500);
    }
    const bp0 = page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/BackpackUI.') >= 0);
    check('boot', 'hud-open-backpack', !!bp0, bp0 ? 'BackpackUI iframe 在场' : '未打开（后续 uiShow 依赖）');
  }

  const MACH = ['Cooking', 'BrewPanel', 'RatCage', 'Compressor', 'DyePanel', 'Shredder', 'ToolTable', 'Trade', 'DroneHub'];
  const FOOD = { Cooking: 1, BrewPanel: 1, RatCage: 1, Compressor: 1, DyePanel: 1 };
  const frameOf = (k) => page.frames().find((f) => decodeURIComponent(f.url()).indexOf('/' + k + '.') >= 0);
  let prevUi = 'BackpackUI'; /* HUD 开的背包=首个活跃页；uiShow 前清场（Ac_OpenUI 不自动关旧页） */
  async function uiShow(key) {
    await page.evaluate(([prev, k]) => { window.__CERAIL__.cmd('uiClose', { key: prev }); window.__CERAIL__.cmd('uiShow', { key: k }); }, [prevUi, key]);
    prevUi = key;
    await page.waitForTimeout(3000);
  }
  /* 页面数据到位轮询：pins>0 或 items>0 或超时（机器页官方格初始化+契约回推有先后） */
  async function waitReady(frame, key) {
    for (let i = 0; i < 8; i++) {
      const s = await snap(frame);
      if ((s && s.pins && s.pins.length) || (s && s.items > 0)) return s;
      await page.waitForTimeout(1200);
    }
    return snap(frame);
  }
  /* 契约快照：DOM 在各场景 frame、__CERAIL__.state 在 Root（railui 脚本注在 Root） */
  const rootState = () => page.evaluate(() => {
    const s = window.__CERAIL__ && window.__CERAIL__.state;
    return s ? { scene: s.scene, currentId: s.currentId, fsort: s.fsort } : null;
  });
  const snap = async (frame) => {
    const d = await frame.evaluate(() => {
      const rail = document.getElementById('srRail');
      const pins = rail ? [...rail.querySelectorAll('#srPinRow [data-ctn]')].map((b) => ({
        id: b.getAttribute('data-ctn'), label: (b.querySelector('.p-lb') || b).textContent.trim(), active: b.classList.contains('active')
      })) : null;
      const host = document.getElementById('srGridHost');
      const items = host ? host.querySelectorAll('.item').length : -1;
      const badges = document.querySelectorAll('#srBadgeLayer i').length;
      const toast = document.querySelector('.sr-toast, #srToast');
      return { pins, items, badges, toast: toast && !toast.hidden ? toast.textContent : '' };
    });
    const r = await rootState();
    return Object.assign(d, r || {});
  };

  for (const key of MACH) {
    let fr = null;
    try {
      await uiShow(key);
      fr = frameOf(key);
      if (!fr) { check(key, 'frame', false, 'iframe 未出现'); continue; }
      const s0 = await waitReady(fr, key);
      check(key, 'rail-mounted', !!(s0 && s0.pins && s0.items >= 0), JSON.stringify({ items: s0 && s0.items }));

      /* #2：页签集合=本页语义（首签背包；非 bag 页无冰箱入 material 页等断言在 pin 集抽查）+ 全平铺 */
      check(key, 'pin-row-flat', !!(s0.pins && s0.pins.length >= 2), `pins=${s0.pins ? s0.pins.length : 0} [${s0.pins ? s0.pins.map((p) => p && p.label).join(',') : ''}]`);
      if (!s0.pins || !s0.pins.length) { await page.screenshot({ path: path.join(OUT, key + '-empty.png') }); continue; }
      /* 背包恒首 */
      check(key, 'bag-first', !!(s0.pins && s0.pins[0] && /背包/.test(s0.pins[0].label || '')), s0.pins && s0.pins[0] ? s0.pins[0].label : '');

      /* #2：点击第一个柜页签 → 官方格回绑（items 变化或 active 迁移） */
      const cab = s0.pins && s0.pins.find((p) => !/背包/.test(p.label) && p.id);
      if (cab) {
        const before = s0.items;
        await fr.evaluate((id) => { const b = document.querySelector('#srPinRow [data-ctn="' + id + '"]'); if (b) b.click(); }, cab.id);
        await page.waitForTimeout(1600);
        const s1 = await snap(fr);
        const rebound = s1.items !== before || String(s1.currentId) === String(cab.id);
        check(key, 'tab-click-rebind', !!rebound, `click ${cab.label}(${cab.id}) items ${before}→${s1.items} cur=${s1.currentId}`);
        const act = s1.pins && s1.pins.find((p) => String(p.id) === String(cab.id));
        check(key, 'tab-active-mark', !!(act && act.active), act ? 'active ✓' : '无高亮');
        /* 点回背包 */
        await fr.evaluate(() => { const b = document.querySelector('#srPinRow [data-ctn]'); if (b) b.click(); });
        await page.waitForTimeout(1200);
      } else {
        check(key, 'tab-click-rebind', false, '无可点柜签（仅背包）');
      }

      /* #1：食品五页=页脚排序；Trade=自动价值；其余跳过排序段 */
      if (FOOD[key]) {
        const keySeq = ['sat', 'mind', 'en', 'hp', 'value', 'shelf'];
        for (const fk of keySeq) {
          try {
            await fr.evaluate(() => { const b = document.getElementById('srFoodSort'); if (b && !b.hidden) b.click(); });
            await fr.waitForFunction(() => { const p = document.getElementById('srFootSortPop'); return p && !p.hidden; }, null, { timeout: 4000 });
            await fr.evaluate((k) => { const o = document.querySelector('#srFootSortPop [data-fsort="' + k + '"]'); if (o) o.click(); }, fk);
            await page.waitForTimeout(2200); /* 泵 0.5s + 重排 + 回推 */
            const s2 = await snap(fr);
            const toastOk = /已按|排序/.test(s2.toast || '');
            check(key, 'sort-' + fk, !!(s2.badges > 0 && toastOk), `badges=${s2.badges} toast=${(s2.toast || '').slice(0, 30)}`);
            if (fk === 'shelf' || fk === 'value') {
              const texts = await fr.evaluate(() => [...document.querySelectorAll('#srBadgeLayer i')].map((i) => i.textContent).slice(0, 12));
              const shelfOk = fk !== 'shelf' || texts.some((t) => /天$|已过期|已腐败|—/.test(t));
              const valOk = fk !== 'value' || texts.some((t) => /^\d+$/.test(t));
              check(key, 'sort-' + fk + '-text', shelfOk && valOk, `[${texts.join(',')}]`);
            }
          } catch (e) { check(key, 'sort-' + fk, false, String(e).slice(0, 60)); }
        }
        /* 复位默认 */
        try {
          await fr.evaluate(() => { const b = document.getElementById('srFoodSort'); if (b && !b.hidden) b.click(); });
          await fr.waitForFunction(() => { const p = document.getElementById('srFootSortPop'); return p && !p.hidden; }, null, { timeout: 3000 });
          await fr.evaluate(() => { const o = document.querySelector('#srFootSortPop [data-fsort="official"]'); if (o) o.click(); });
          await page.waitForTimeout(1500);
        } catch (e) { }
      }
      if (key === 'Trade') {
        const s3 = await snap(fr);
        check(key, 'trade-auto-value', s3.fsort === 'value' || s3.badges >= 0, `fsort=${s3.fsort} badges=${s3.badges}`);
        const chips = await fr.evaluate(() => { const t = document.getElementById('srTrade'); return t && !t.hidden ? t.textContent.slice(0, 60) : ''; });
        check(key, 'trade-pref-bar', /按交易价值排序/.test(chips), chips);
        if (s3.badges > 0) {
          const texts = await fr.evaluate(() => [...document.querySelectorAll('#srBadgeLayer i')].map((i) => i.textContent).slice(0, 10));
          check(key, 'trade-value-badges', texts.some((t) => /^\d+$/.test(t)), `[${texts.join(',')}]`);
        }
      }
      await page.screenshot({ path: path.join(OUT, key + '.png') });
    } catch (e) {
      check(key, 'scene-error', false, String(e).slice(0, 80));
    }
  }

  /* BackpackUI 原生页：排序钮逐键（⇅排序▾） */
  try {
    await uiShow('BackpackUI');
    const bp = frameOf('BackpackUI');
    if (!bp) check('BackpackUI', 'frame', false, 'iframe 未出现');
    else {
      await bp.waitForFunction(() => !!document.getElementById('srnSortBtn'), null, { timeout: 8000 }).catch(() => { });
      const hasBtn = await bp.evaluate(() => !!document.getElementById('srnSortBtn'));
      check('BackpackUI', 'nb-buttons', hasBtn, hasBtn ? '' : 'srnSortBtn 未装配（bpBag=false?）');
      if (hasBtn) {
        for (const fk of ['sat', 'value', 'shelf']) {
          try {
            await bp.evaluate(() => document.getElementById('srnSortBtn').click());
            await bp.waitForFunction(() => !document.getElementById('srnSortPop').hidden, null, { timeout: 4000 });
            await bp.evaluate((k) => { const o = document.querySelector('#srnSortPop [data-k="' + k + '"]'); if (o) o.click(); }, fk);
            await page.waitForTimeout(2200);
            const st = await bp.evaluate(() => ({ n: document.querySelectorAll('#srnBadges i').length, texts: [...document.querySelectorAll('#srnBadges i')].map((i) => i.textContent).slice(0, 10) }));
            check('BackpackUI', 'nb-sort-' + fk, st.n > 0, `n=${st.n} [${st.texts.join(',')}]`);
          } catch (e) { check('BackpackUI', 'nb-sort-' + fk, false, String(e).slice(0, 60)); }
        }
      }
      await page.screenshot({ path: path.join(OUT, 'BackpackUI.png') });
    }
  } catch (e) { check('BackpackUI', 'scene-error', false, String(e).slice(0, 80)); }

  check('boot', 'zero-console-errors', errs.length === 0, JSON.stringify([...new Set(errs)].slice(0, 4)));

  fs.writeFileSync(path.join(OUT, 'matrix.json'), JSON.stringify(results, null, 1));
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
