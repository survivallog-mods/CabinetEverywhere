/* 构建脚本：从游戏 WebUI 真实源码生成 1:1 原型（官方页面 + 我们的储物侧栏）
 * 用法: node build-rail-proto.cjs   （在本目录运行；游戏更新后重跑即得最新官方样式）
 * 输入: ../../../suite/tools/webui_src/UI/*（官方 WebUI 快照，随游戏版本更新）
 * 输出: rail-game-1to1.html（ZCode 内嵌版） + standalone.html（Chrome 直开版）
 * 预览: node serve.cjs 后访问 http://127.0.0.1:8180/standalone.html
 * 规格文档: ../UI-SPEC.md（交互与几何的唯一定义源）；截图存档见 shots/
 *
 * 场景 ↔ 官方页面：
 *   backpack 单独背包    BackpackUI.html iframe 真渲染（对齐整理物资背包侧：12列+滚动；负重条保留）
 *   access   取用界面    BackpackUI.html iframe 真渲染（单柜面板：柜名+分类按钮，12列+滚动，无负重条）
 *   organize 整理物资    BackpackUI.html iframe 真渲染（官方双背包，12列+滚动，柜侧无负重条）
 *   cook     烹饪        Cooking.html      切 .panel（背包面板）
 *   brew     酿酒桶      BrewPanel.html    刷 .col（背包列）
 *   cage     老鼠笼      RatCage.html      刷 .panel（背包面板）
 *   shred    粉碎机      Shredder.html     刷 .cart（背包车）
 *   press    食物压制器  Compressor.html   刷 .cart（背包车）
 *   dye      颜料桶      DyePanel.html     刷 .col.bag-col（背包列）
 *   tool     工作台      ToolTable.html    刷 .backpack-panel
 *   trade    无人机交易  TradeUI.html      刷 .col
 *   drone    调度机队    DroneHub.html     刷 .pane.mine
 */
const fs = require('fs');
const path = require('path');

/* suite 官方源码快照定位：主仓布局 ../../../suite；worktree 布局（.worktrees/<名>/…）向上
   逐级找 suite/tools/webui_src（与 serve.cjs 两级解析同理） */
function findSuiteUi() {
  const rel = ['suite', 'tools', 'webui_src', 'UI'];
  let d = __dirname;
  for (let up = 0; up < 6; up++) {
    const cand = path.join.apply(null, [d].concat(rel));
    if (fs.existsSync(cand)) return cand;
    d = path.dirname(d);
  }
  return path.join.apply(null, [__dirname, '..', '..', '..'].concat(rel));
}
const SRC = findSuiteUi();
const OUT = path.join(__dirname, 'rail-game-1to1.html');
const OUT_STANDALONE = path.join(__dirname, 'standalone.html');

/* ── 工具 ── */
function tagBlock(html, startIdx, tag) {
  const open = '<' + tag, close = '</' + tag + '>';
  let i = startIdx, depth = 0;
  while (i < html.length) {
    const o = html.indexOf(open, i), c = html.indexOf(close, i);
    if (c < 0) break;
    if (o >= 0 && o < c) {
      const ch = html[o + open.length];
      if (ch === '>' || ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r') { depth++; i = o + open.length; continue; }
      i = o + open.length; continue;
    }
    depth--; i = c + close.length;
    if (depth === 0) return i;
  }
  return -1;
}
function cutBlock(html, startMarker, tag) {
  const s = html.indexOf(startMarker);
  if (s < 0) throw new Error('marker not found: ' + startMarker);
  const e = tagBlock(html, s, tag);
  if (e < 0) throw new Error('block end not found: ' + startMarker);
  return [s, e];
}
function cutRail(b, marker, tag) {
  const [s, e] = cutBlock(b, marker, tag);
  return b.slice(0, s) + '<!--RAIL-->' + b.slice(e);
}
function mustache(expr) {
  const map = [
    [/cp\.avatar/, '陈'], [/cp\.name/, '陈阿姨'], [/cp\.campStateText/, ''],
    [/bagTitle/, '储物栏'], [/weightLabel/, '负重'], [/cargoLabel/, '载货'],
    [/fmtWeightUp\(bag\.weight\)/, '3.2'], [/fmtWeightDown\(bag\.maxWeight\)/, '12.0'],
    [/drone\.usedCells/, '14'], [/drone\.totalCells/, '36'], [/drone\.cols/, '6'], [/drone\.rows/, '6'],
    [/shelf\.title/, '货架'], [/t\.name/, '物资'], [/localText\.dimFuel|dimFuel/, '燃料'],
    [/hintText|waitingText/, ''], [/recipeCount|unlockedCount/, '18'], [/total/, '32'],
    [/trust|t\.left|r\.left/, '3'],
  ];
  for (const [re, txt] of map) if (re.test(expr)) return txt;
  return '';
}
function cleanVue(html) {
  return html.replace(/\{\{([^}]*)\}\}/g, (_, e) => mustache(e));
}
function fixCssScope(css) {
  return css
    .replace(/(^|[\s,>+~])body(?=[\s,{:.\[])/g, '$1.gpage')
    .replace(/(^|[\s,>+~])html(?=[\s,{:.\[])/g, '$1.gpage')
    .replace(/:root/g, '.gpage');
}
function hideVueOnly(body, extras) {
  // 隐藏只在运行时显示的 v-if 浮层（静态原型没有数据源，留着就是变形源）
  let b = body
    .replace(/<div class="roster-mask/g, '<div hidden class="roster-mask')
    .replace(/<div class="bag-op-hint/g, '<div hidden class="bag-op-hint');
  for (const [re, rep] of extras || []) b = b.replace(re, rep);
  return b;
}
function extract(page, extras) {
  const h = fs.readFileSync(path.join(SRC, page), 'utf8');
  const style = [...h.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  const body = h.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
  return { style: fixCssScope(style), body: hideVueOnly(cleanVue(body), extras) };
}
const SLOT = '<div class="slot"></div>';
const GRID = (c, n, px, gap) => 'display:grid;grid-template-columns:repeat(' + c + ',' + (px || 40) + 'px);grid-auto-rows:' + (px || 40) + 'px;gap:' + (gap == null ? 6 : gap) + 'px;';
function slots(n) { return SLOT.repeat(n); }
function item(left, top, w, h, img, cnt) {
  w = w || 1; h = h || 1;
  const W = w * 40 + (w - 1) * 6, H = h * 40 + (h - 1) * 6;
  return '<div class="item" style="left:' + (10 + left * 46) + 'px;top:' + (10 + top * 46) + 'px;width:' + W + 'px;height:' + H + 'px;">' +
    '<img src="" alt="" draggable="false"><span class="item-count">' + (cnt || '') + '</span></div>';
}
/* 机器侧格子补内容：官方 grid 容器由 JS 填充，静态原型注入空格保持观感 */
function fillGrid(b, id, cols, n, px, extra, gap) {
  if (!b.includes('id="' + id + '"></div>')) throw new Error('grid id not found (empty): ' + id);
  return b.replace('id="' + id + '"></div>',
    'id="' + id + '" style="' + GRID(cols, n, px, gap) + '">' + slots(n) + (extra || '') + '</div>');
}

/* ── 单独背包 BackpackUI：整个 v-for 模板（双背包区+转移按钮）换成侧栏，页面只剩暗色底 + 侧栏 ── */
function buildBackpack() {
  // v-show/v-if 运行时浮层（tooltip/喷洒光标/愿望标记/拖拽幽灵/高亮键光标）静态无 Vue 驱动会常显，
  // 遮在侧栏格子区 → hidden。注意 v-if 可能排在 class 前（含跨行），正则按 class 属性匹配并保留前缀属性。
  const p = extract('BackpackUI/BackpackUI.html', [
    [/<div ([^>]*?)class="tooltip"/g, '<div hidden $1class="tooltip"'],
    [/<div ([^>]*?)class="spray-cursor"/g, '<div hidden $1class="spray-cursor"'],
    [/<div ([^>]*?)class="wish-mark"/g, '<div hidden $1class="wish-mark"'],
    [/<div ([^>]*?)class="item drag-ghost"/g, '<div hidden $1class="item drag-ghost"'],
    [/<div ([^>]*?)class="kin-cursor"/g, '<div hidden $1class="kin-cursor"'],
  ]);
  let b = cutRail(p.body, '<template v-for="(side, idx) in visibleSides"', 'template');
  return { style: p.style, body: b, shell: 'bag-panel' };
}


/* ── 烹饪 Cooking ── */
function buildCook() {
  const p = extract('Cooking/Cooking.html');
  let b = cutRail(p.body, '<div class="panel">', 'div');
  b = fillGrid(b, 'mainPotGrid', 5, 20, 40, item(0, 0, 1, 1, '', '3') + item(1, 0, 1, 1, '', '2'));
  const book = (n, ready) =>
    '<div class="book-item"><div class="book-ico"><img src="" alt=""></div>' +
    '<div class="book-bd"><div>' + n + '</div></div><span class="st-ready">' + (ready ? '可做' : '未解锁') + '</span></div>';
  b = b.replace('id="recipeList"></div>', 'id="recipeList">' +
    book('蘑菇炖兔肉', true) + book('烤土豆', true) + book('蔬菜汤', true) +
    book('大米饭', true) + book('香煎河鱼', false) + '</div>');
  b = b.replace('id="hotpotPanel"', 'id="hotpotPanel" hidden');
  return { style: p.style, body: b, shell: 'panel' };
}

/* ── 酿酒桶 BrewPanel：背包列换成侧栏 ── */
function buildBrew() {
  const p = extract('BrewPanel/BrewPanel.html');
  let b = cutRail(p.body, '<div class="col">', 'div');
  b = fillGrid(b, 'vatGrid', 3, 9);
  return { style: p.style, body: b, shell: 'col' };
}

/* ── 老鼠笼 RatCage：背包面板换成侧栏 ── */
function buildCage() {
  const p = extract('RatCage/RatCage.html');
  let b = cutRail(p.body, '<div class="panel">', 'div');
  // 官方标题靠 i18n 运行时填充，静态原型补演示文案
  b = b.replace('<span data-i18n="pageTitle"></span>', '<span data-i18n="pageTitle">老鼠笼</span>');
  return { style: p.style, body: b, shell: 'panel' };
}

/* ── 粉碎机 Shredder：背包车换成侧栏 ── */
function buildShred() {
  const p = extract('Shredder/Shredder.html');
  let b = cutRail(p.body, '<div class="cart">', 'div');
  b = fillGrid(b, 'hopperGrid', 6, 18, 45);
  return { style: p.style, body: b, shell: 'cart' };
}

/* ── 食物压制器 Compressor：背包车换成侧栏 ── */
function buildPress() {
  const p = extract('Compressor/Compressor.html');
  let b = cutRail(p.body, '<div class="cart">', 'div');
  b = fillGrid(b, 'binGrid', 3, 9);
  return { style: p.style, body: b, shell: 'cart' };
}

/* ── 颜料桶 DyePanel：背包列换成侧栏 ── */
function buildDye() {
  const p = extract('DyePanel/DyePanel.html');
  let b = cutRail(p.body, '<div class="col bag-col">', 'div');
  b = fillGrid(b, 'vatGrid', 6, 36);
  return { style: p.style, body: b, shell: 'col' };
}

/* ── 工作台 ToolTable：官方 BAG_CFG {cols:6, rows:5, slotSize:56, gap:0} ── */
function buildTool() {
  const p = extract('ToolTable/ToolTable.html');
  let b = cutRail(p.body, '<div class="backpack-panel">', 'div');
  b = fillGrid(b, 'workbench-grid', 6, 30, 56, '', 0);
  return { style: p.style, body: b, shell: 'backpack-panel' };
}

/* ── 无人机交易 TradeUI：官方 CELL=56，drone 货舱 6×6，尺寸由运行时函数设置 ── */
function buildTrade() {
  const p = extract('TradeUI/TradeUI.html');
  let b = p.body;
  // 删两个模式化右列，保留默认交易列
  for (const m of ['<div class="col right" v-if="isSupply">', '<div class="col right" v-if="isDispatch">']) {
    const [s, e] = cutBlock(b, m, 'div');
    b = b.slice(0, s) + b.slice(e);
  }
  const cols = b.indexOf('<div class="cols">');
  const [s, e] = cutBlock(b, '<div class="col">', 'div');
  if (s < cols) throw new Error('trade col order unexpected');
  b = b.slice(0, s) + '<!--RAIL-->' + b.slice(e);
  // 货舱：gridStyle/gridBgStyle(drone) 运行时才生效，静态补真实尺寸（CELL=56, 6×6=336px）
  b = b.replace(':style="gridStyle(drone)"', 'style="width:336px;height:336px"');
  b = b.replace(':style="gridBgStyle(drone)"', 'style="display:grid;grid-template-columns:repeat(6,56px);grid-auto-rows:56px"');
  b = b.replace(/<div class="slot" v-for="i in drone\.cols\*drone\.rows"[^>]*><\/div>/, slots(36));
  // 货架：v-for 静态只剩一行，克隆成 4 行演示（官方名称走 Vue 插值，静态为空，这里补演示名）
  const [ls, le] = cutBlock(b, '<div class="shelf-list">', 'div');
  const inner = b.slice(ls + '<div class="shelf-list">'.length, le - '</div>'.length);
  const names = ['松木木板', '铁钉', '草药', '亚麻布'];
  let rows = '';
  for (let i = 0; i < 4; i++) {
    rows += inner.replace(/(<span class="shelf-name"[^>]*>)[^<]*(<\/span>)/, '$1' + names[i] + '$2');
  }
  b = b.slice(0, ls) + '<div class="shelf-list">' + rows + '</div>' + b.slice(le);
  return { style: p.style, body: b, shell: 'col' };
}

/* ── 调度机队 DroneHub ── */
function buildDrone() {
  const p = extract('DroneHub/DroneHub.html');
  let b = cutRail(p.body, '<section class="pane mine"', 'section');
  b = fillGrid(b, 'storeGrid', 6, 30, 40, item(0, 0, 1, 1, '', '12') + item(1, 0, 1, 1, '', '7'));
  return { style: p.style, body: b, shell: 'pane mine' };
}

/* v13.2（作者 2026-10-31 审核）：取用/整理物资 两界面=官方页面 iframe 真渲染（rail.js 喂数+mod CSS）
   ——取用=单柜面板（柜名+分类标签按钮，无负重条）；整理物资=官方双背包（柜侧无负重条）。
   mod 改造点：宽度统一 12 列 / 高度扩容+纵向滚动（gutter 不压格）。 */
function buildLive(kind) {
  return { style: '', body: '<iframe class="proto-live" data-live="' + kind + '" src="./fixtures/BackpackUI.html"></iframe>', shell: 'live', live: kind };
}
const scenes = {
  /* v13.3（作者 2026-10-31）：单独背包不再注入自研侧栏，对齐整理物资背包侧=官方页真渲染
     （同 12 列+高度滚动；背包侧负重条保留）。旧注入版 buildBackpack() 保留备查不再挂场景。 */
  backpack: buildLive('backpack'),
  access: buildLive('access'),
  organize: buildLive('organize'),
  cook: buildCook(),
  brew: buildBrew(),
  cage: buildCage(),
  shred: buildShred(),
  press: buildPress(),
  dye: buildDye(),
  tool: buildTool(),
  trade: buildTrade(),
  drone: buildDrone()
};

/* ── 组装 ── */
const RAIL_CSS = fs.readFileSync(path.join(__dirname, 'rail.css'), 'utf8');
const RAIL_JS = fs.readFileSync(path.join(__dirname, 'rail.js'), 'utf8');

const SCENE_LABELS = [
  ['backpack', '单独背包'], ['access', '取用界面'], ['organize', '整理物资'], ['cook', '烹饪'], ['brew', '酿酒桶'],
  ['cage', '老鼠笼'], ['shred', '粉碎机'], ['press', '食物压制器'], ['dye', '颜料桶'],
  ['tool', '工作台'], ['trade', '无人机交易'], ['drone', '调度机队']
];

const inner = `<div id="srp">
<style>
${RAIL_CSS}
#srp .srp-fitwrap{position:relative;width:100%;overflow:hidden}
#srp .gpage{position:relative;width:1536px !important;height:864px !important;min-width:1536px !important;max-width:1536px !important;min-height:864px !important;max-height:864px !important;
  box-sizing:border-box !important;margin:0 !important;padding:0 !important;zoom:1 !important;transform-origin:top left;overflow:hidden !important;
  border:1px solid rgba(255,255,255,.10);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.5)}
</style>
${Object.entries(scenes).map(([k, v]) => `<style id="gs-${k}" class="gs">${v.style}</style>`).join('\n')}
<div class="srp-fitwrap" id="fitwrap">
  <div class="gpage" id="gpage"></div>
</div>
<div class="srp-controls viz-controls" id="controls">
  <span class="srp-lbl">场景</span>
  ${SCENE_LABELS.map(([k, l]) => `<button class="scb${k === 'cook' ? ' scb-on' : ''}" data-scene="${k}" type="button">${l}</button>`).join('\n  ')}
  <span class="srp-badge" id="scaleBadge">1536×864 · 100%</span>
</div>
<script id="scene-data" type="application/json">${JSON.stringify({
  scenes: Object.fromEntries(Object.entries(scenes).map(([k, v]) => [k, { body: v.body, shell: v.shell, live: v.live || null }]))
}).replace(/</g, '\\u003c')}</script>
<script>
${RAIL_JS}
</script>
</div>`;

fs.writeFileSync(OUT, inner);
console.log('written', OUT, (inner.length / 1024).toFixed(0) + 'KB');

const standalone = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>生存日志 · 储物系统 1:1 原型（真实页面源码）</title>
<style>
  html,body{margin:0;padding:0;background:#141416}
  body{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:14px 10px 30px;
       font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif;color:#cfc8bc}
  #srp{width:min(1560px,100%)}
  .viz-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  /* 场景按钮用独立类名 scb，避免与官方页面的 .btn 样式互相泄漏 */
  .scb{padding:5px 12px;border-radius:6px;border:1px solid #4a4a50;background:#26262b;color:#cfc8bc;
       font-size:13px;cursor:pointer;font-family:inherit}
  .scb:hover{border-color:#6a6a72;background:#2d2d33}
  .scb-on{background:#b5792f;border-color:#d09640;color:#fff}
  .scb-on:hover{background:#c98739}
  .srp-lbl{color:#888;font-size:12px}
  .srp-badge{padding:3px 9px;border-radius:6px;border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.25);color:#a89f92;font-size:11px;font-family:Consolas,monospace}
</style>
</head>
<body>
${inner}
</body>
</html>`;
fs.writeFileSync(OUT_STANDALONE, standalone);
console.log('written', OUT_STANDALONE, (standalone.length / 1024).toFixed(0) + 'KB');
