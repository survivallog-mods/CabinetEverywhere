/* fix round 3 扫源：类名查询 ∩ 宿主子树 —— 每页取宿主子树内 class 集合（DOM 实取），
   交源码 querySelector(All)?/getElementsByClassName 的选择器左一类名 token，报命中项
   （人工复核解引用守卫后定类桩清单）。 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const FIX = 'E:/Game/Mod/survivallog-mods/CabinetEverywhere/.worktrees/cerail-storage-rail/SurvivalLog.CabinetEverywhere/design-proto/fixtures';
const HOSTS = {
  MaterialRack: '#rackSystem', Cooking: "#bagTabs.closest('.panel')",
  BrewPanel: "#bagTabs.closest('.col')", RatCage: "#bagTabs.closest('.panel')",
  DyePanel: "#bagTabs.closest('.col.bag-col')", Compressor: '.cart', Shredder: '.cart',
  GreenhouseBuild: '#cartPane', ToolTable: '.backpack-panel', DroneHub: '#paneMine'
};
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  for (const p of Object.keys(HOSTS)) {
    await page.goto('http://127.0.0.1:8180/fixtures/' + p + '.html', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const s = fs.readFileSync(path.join(FIX, p + '.html'), 'utf8');
    const sels = new Set(); // 源码里出现的类选择器串
    let m;
    let re = /querySelector(?:All)?\(\s*'((?:\.[A-Za-z][\w-]*[^'()]*)?)'\s*\)/g;
    while ((m = re.exec(s))) { if (m[1] && m[1].indexOf('.') === 0) sels.add(m[1]); }
    re = /getElementsByClassName\(\s*'([^']+)'\s*\)/g;
    while ((m = re.exec(s))) sels.add('.' + m[1]);
    const inner = await page.evaluate(async (sel) => {
      let i = sel.indexOf(".closest('");
      let host = null;
      if (i > 0) { const a = document.querySelector(sel.slice(0, i)); host = a ? a.closest(sel.slice(i + 10, sel.length - 2)) : null; }
      else host = document.querySelector(sel);
      if (!host) return null;
      const cls = new Set();
      host.querySelectorAll('[class]').forEach((e) => String(e.className).split(/\s+/).forEach((c) => { if (c) cls.add(c); }));
      String(host.className).split(/\s+/).forEach((c) => { if (c) cls.add(c); });
      return [...cls];
    }, HOSTS[p]);
    if (!inner) { console.log(p + ': 宿主未取到'); continue; }
    const hits = [];
    for (const sel of sels) {
      const toks = sel.split(/[\s.:>#\[]/).filter((t) => t);
      if (toks.length && inner.indexOf(toks[0]) >= 0) hits.push(sel);
    }
    console.log(p + ':\n  宿主内 class×' + inner.length + '；类选择器查询∩宿主：' + (hits.length ? hits.join(' | ') : '（无）'));
  }
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
