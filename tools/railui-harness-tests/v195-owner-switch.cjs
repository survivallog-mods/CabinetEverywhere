/* v195 换包/换存档场景（实机 11:52 实锤复现：作者换存档后排序 → 数值全不显示）。
   机制：契约 B（新 bag id/新容器 id/新物品 InstanceId）+ 模型重推（ItemsAMsg 新 items）
   → 旧代码 DISP.owner/st.currentId 留存旧 owner → itemsOf(旧 id)=空行 → 全 '-'。
   断言 v1.8.5⑪ owner 现解析：换包后排序数值照常显示且跟物品。 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}
const ICO = 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await (await browser.newContext({ viewport: { width: 1536, height: 864 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { localStorage.removeItem('srp_fsort_BackpackUI'); } catch (e) { } });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__HZ_SHOW__('BackpackUI'));
  const fr = page.frames().find((f) => f.url().includes('/fixtures/BackpackUI.html'));
  await fr.waitForFunction(() => !!document.getElementById('srnSortBtn'), null, { timeout: 15000 });
  await page.waitForTimeout(400);

  const sortSat = async () => {
    await fr.evaluate(() => document.getElementById('srnSortBtn').click());
    await fr.waitForFunction(() => !document.getElementById('srnSortPop').hidden, null, { timeout: 4000 });
    await fr.evaluate(() => document.querySelector('#srnSortPop [data-k="sat"]').click());
    await page.waitForTimeout(350);
  };
  const badgeOf = async (tail) => fr.evaluate((tl) => {
    const grid = document.querySelector('.bag-panel:not(.is-storage) .grid-container');
    const cells = [...grid.querySelectorAll('.item')].map((c) => {
      const img = c.querySelector('img');
      return { tail: img ? (img.getAttribute('src').match(/#v(\d+)/) || [])[1] : null, l: c.offsetLeft, t: c.offsetTop };
    }).sort((a, b) => (a.t - b.t) || (a.l - b.l));
    const badges = [...document.querySelectorAll('#srnBadges i')]
      .map((b) => ({ txt: b.textContent, l: parseFloat(b.style.left) || 0, t: parseFloat(b.style.top) || 0 }))
      .sort((a, b) => (a.t - b.t) || (a.l - b.l));
    return cells.map((c, i) => ({ tail: c.tail, badge: badges[i] ? badges[i].txt : null }))
      .filter((p) => p.tail === tl).map((p) => p.badge);
  }, tail);

  /* 基线（存档 A：901=15） */
  await sortSat();
  check('v195:baseline-v1=15', (await badgeOf('1')).join(',') === '15', JSON.stringify(await badgeOf('1')));

  /* 换存档：模型重推（官方 ItemsAMsg 新 items：id 951..958）+ 契约 B（bag=900002 新容器 id） */
  await fr.evaluate((ico) => {
    const mk = (id, x, cfg) => ({ id: id, x: x, y: x % 2, w: 1, h: 1, icon: ico + '#v' + cfg, name: '物品' + id, count: 2, quality: 3, cfgId: cfg, vd: cfg === 1 ? [15, 0, 0, 0, 0] : (cfg === 3 ? [8, 0, 0, 0, 0] : []), shelfLifeDays: null, isExpired: false, isRotten: false });
    const items = [mk(951, 0, 1), mk(952, 1, 3), mk(953, 2, 5), mk(954, 3, 5), mk(955, 4, 9), mk(956, 5, 2), mk(957, 6, 8), mk(958, 7, 4)];
    window.postMessage({}); /* noop：官方页监听 window message */
    window.addEventListener('message', function h(ev) { }, { once: true });
    /* 直接走官方 handler 入口：与 harness nudge 同型 postMessage 到本帧 */
    window.postMessage({ type: 'WebUI_Backpack_ItemsAMsg', data: { itemsJson: JSON.stringify(items) } }, '*');
  }, ICO);
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const j = {
      rev: 1000, ctx: { page: 'BackpackUI', family: 'backpack', bagOnly: true, bpBag: true, bagCap: 42 },
      bag: 900002,
      ctn: [[910101, '新档食材柜', 'c', 40, 9101]],
      lib: [[9101, '食材', 4, 1, '', '#8fc06e']],
      icfg: [
        [1, '生态香米', 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==#v1', 12, 99, 1, 1, '食材', 0, 15, 0, 0, 0, 0],
        [5, '铁钉', 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==#v5', 4, 999, 9, 0, '材料', 0, 0, 0, 0, 0, 0]
      ],
      items: { bag: [[951, 1, 30, 7200, 0, 0, 1, 1, 0, 15, null, null, null, 360, 3.5], [952, 3, 5, 10800, 1, 1, 1, 1, 0, 8, null, null, null, null, null], [953, 5, 40, 0, 2, 0, 1, 1, 0, null, null, null, null, null, null], [954, 5, 12, 0, 3, 1, 1, 1, 0, null, null, null, null, null, null], [955, 9, 3, 0, 4, 0, 1, 1, 0, null, null, null, null, 99, null], [956, 2, 2, 9000, 5, 1, 1, 1, 4, null, 7, null, null, null, 2.5], [957, 8, 6, 3600, 6, 0, 1, 1, 2, null, null, null, null, null, 0.5], [958, 4, 1, 0, 7, 1, 1, 1, 0, null, null, null, null, null, null]] }
    };
    window.__CERAIL__.setData(j);
  });
  await page.waitForTimeout(700);

  /* 换档后排序：v1 物品（951）=15、v3 物品（952）=8（旧代码=全 '-'） */
  await sortSat();
  check('v195:owner-switch-v1=15', (await badgeOf('1')).join(',') === '15', JSON.stringify(await badgeOf('1')) + '（旧行为红=-：owner 陈旧→空行）');
  check('v195:owner-switch-v3=8', (await badgeOf('3')).join(',') === '8', JSON.stringify(await badgeOf('3')));
  check('v195:console-clean', errs.length === 0, errs.slice(0, 3).join(' | '));

  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n==== v195 TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail} ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FATAL', String(e)); process.exit(1); });
