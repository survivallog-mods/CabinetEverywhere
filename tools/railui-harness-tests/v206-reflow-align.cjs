/* v206 面板级回流自愈（第十三轮：详情弹窗开/关=祖先 class 切换驱动格区压扁/复原，
   纯 CSS 回流不动格子内联样式 → 旧观察器静默 → 角标钉旧坐标「关弹窗也不回来，
   点别的物品才恢复」——作者实锤）。模拟：host class 切换 → 格子 CSS 尺寸 50→218×50。
   断言：角标 ≤0.8s 跟齐（防线=面板级 MO + 500ms 对齐节拍器）。 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}
const FULL = {
  rev: 700, ctx: { page: 'BackpackUI', family: 'backpack', bagOnly: true, bpBag: true, bagCap: 42 },
  bag: 900001,
  ctn: [[900101, '食材柜', 'c', 40, 101]],
  lib: [[101, '食材', 4, 1, '', '#8fc06e']],
  icfg: [
    [1, '生态香米', 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==#v1', 12, 99, 1, 1, '食材', 0, 15, 0, 0, 0, 0],
    [5, '铁钉', 'data:image/gif;base64,R0lGODlhAQABAIAAAPLt4gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==#v5', 4, 999, 9, 0, '材料', 0, 0, 0, 0, 0, 0]
  ],
  items: { bag: [[901, 1, 30, 7200, 0, 0, 1, 1, 0, 15, null, null, null, 360, 3.5], [902, 3, 5, 10800, 1, 1, 1, 1, 0, 8, null, null, null, null, null], [903, 5, 40, 0, 2, 0, 1, 1, 0, null, null, null, null, null, null]] }
};

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await (await browser.newContext({ viewport: { width: 1536, height: 864 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__HZ_SHOW__('BackpackUI'));
  const fr = page.frames().find((f) => f.url().includes('/fixtures/BackpackUI.html'));
  await fr.waitForFunction(() => !!document.getElementById('srnSortBtn'), null, { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.evaluate((j) => window.__CERAIL__.setData(j), FULL);
  await page.waitForTimeout(700);

  await fr.evaluate(() => document.getElementById('srnSortBtn').click());
  await fr.waitForFunction(() => !document.getElementById('srnSortPop').hidden, null, { timeout: 4000 });
  await fr.evaluate(() => document.querySelector('#srnSortPop [data-k="sat"]').click());
  await page.waitForTimeout(400);

  const firstValued = () => fr.evaluate(() => {
    const layer = document.getElementById('srnBadges');
    if (!layer) return null;
    const i = [...layer.querySelectorAll('i')].find((x) => x.textContent && x.textContent !== '-');
    return i ? { l: parseFloat(i.style.left), t: parseFloat(i.style.top) } : null;
  });
  const b0 = await firstValued();
  check('pre:valued-badge', b0 != null, JSON.stringify(b0));

  /* 真实机制模拟：祖先 class 切换 → 格子 CSS 尺寸变化（offset 全变、格子属性零变更） */
  await fr.evaluate(() => {
    const st = document.createElement('style');
    st.id = 'srSqueezeTest';
    st.textContent = '.sr-squeeze .bag-panel:not(.is-storage) .grid-container .item{width:218px !important;height:50px !important;}';
    document.head.appendChild(st);
    document.querySelector('.bag-panel:not(.is-storage)').parentElement.classList.add('sr-squeeze');
  });
  await page.waitForTimeout(800);
  const b1 = await firstValued();
  check('reflow:badge-follows', b1 != null && b0 != null && b1.l > b0.l + 60, '挤压后 ' + (b0 && b0.l) + ' → ' + (b1 && b1.l) + '（格子 50→218 宽，角标应右移 ~168）');

  /* 复原（关弹窗同款：class 摘除、无格子属性变更） */
  await fr.evaluate(() => {
    document.querySelector('.bag-panel:not(.is-storage)').parentElement.classList.remove('sr-squeeze');
  });
  await page.waitForTimeout(800);
  const b2 = await firstValued();
  check('restore:badge-back', b2 != null && b0 != null && Math.abs(b2.l - b0.l) < 6, '复位 ' + (b0 && b0.l) + ' → ' + (b2 && b2.l));
  check('console-clean', errs.length === 0, errs.slice(0, 3).join(' | '));

  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log('\n==== v206 TOTAL ' + results.length + ' PASS ' + (results.length - fail) + ' FAIL ' + fail + ' ====');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FATAL', String(e)); process.exit(1); });
