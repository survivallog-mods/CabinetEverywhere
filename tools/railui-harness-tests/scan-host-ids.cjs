/* 宿主内被官方查询的 id 全量清单（fix round 2 静态扫源）：加载各 fixture，取宿主子树内
   [id] 节点集合 ∩ 页面源码 $()/getElementById/querySelector('#x') 查询目标。 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const FIX = 'E:/Game/Mod/survivallog-mods/CabinetEverywhere/.worktrees/cerail-storage-rail/SurvivalLog.CabinetEverywhere/design-proto/fixtures';
const HOSTS = {
  BackpackUI: '.backpack-container', MaterialRack: '#rackSystem',
  Cooking: "#bagTabs.closest('.panel')", BrewPanel: "#bagTabs.closest('.col')", RatCage: "#bagTabs.closest('.panel')",
  DyePanel: "#bagTabs.closest('.col.bag-col')", Compressor: '.cart', Shredder: '.cart',
  GreenhouseBuild: '#cartPane', ToolTable: '.backpack-panel', Trade: '.cols>.col:first-child',
  DroneHub: '#paneMine'
};
const QUERIED = {}; // 由源码扫描得出（见上一命令输出）
const pages = Object.keys(HOSTS);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  for (const p of pages) {
    // 源码查询目标
    const s = fs.readFileSync(path.join(FIX, p + '.html'), 'utf8');
    const q = new Set();
    let m; const re = /\$\(\s*'([^']+)'\s*\)|getElementById\(\s*'([^']+)'\s*\)|querySelector(?:All)?\(\s*'#([A-Za-z][\w-]*)/g;
    while ((m = re.exec(s))) q.add(m[1] || m[2] || m[3]);
    // 宿主内 id（DOM）
    await page.goto('http://127.0.0.1:8180/fixtures/' + p + '.html', { waitUntil: 'load' });
    await page.waitForTimeout(400);
    let sel = HOSTS[p];
    const inner = await page.evaluate((sel) => {
      let i = sel.indexOf(".closest('");
      let host = null;
      if (i > 0) { const a = document.querySelector(sel.slice(0, i)); host = a ? a.closest(sel.slice(i + 10, sel.length - 2)) : null; }
      else host = document.querySelector(sel);
      return host ? [...host.querySelectorAll('[id]')].map((e) => e.id) : null;
    }, sel);
    const hit = (inner || []).filter((id) => q.has(id));
    console.log(p + ':\n  宿主内 id×' + (inner || []).length + '，被源码查询：' + (hit.length ? hit.join(', ') : '（无）'));
  }
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
