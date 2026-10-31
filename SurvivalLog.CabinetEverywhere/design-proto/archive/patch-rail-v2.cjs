/* patch-rail-v2: 四问题修复补丁（对 rail.js） */
const fs = require('fs');
let j = fs.readFileSync(__dirname + '/rail.js', 'utf8');
function rep(from, to, name) {
  if (!j.includes(from)) { console.error('MISS:', name); process.exitCode = 1; return; }
  j = j.replace(from, to);
}

/* 状态扩展 */
rep("var COMMON = ['食材', '菜品', '材料', '医疗', '饮品'];",
    "var COMMON_DEFAULT = ['食材', '菜品', '材料', '医疗', '饮品'];\n  var COMMON = COMMON_DEFAULT.slice();   /* 快捷筛选栏，可增删 */\n  var PIN_MAX = 3;                        /* 页签直显上限，其余折叠 */", 'common');
rep("    srcC: 0, srcR: 0, ctnQ: ''",
    "    srcC: 0, srcR: 0, ctnQ: '',\n    tagManage: false, dragId: null", 'state');

/* RAIL_HTML 新控件 */
rep("'<div class=\"sr-pinrow\" id=\"srPinRow\"></div>' +\n    '<button class=\"sr-allctn\" id=\"srAllCtn\" type=\"button\">☰ 全部</button></div>' +",
    "'<div class=\"sr-pinrow\" id=\"srPinRow\"></div>' +\n    '<button class=\"sr-overflow\" id=\"srCtnMore\" type=\"button\" hidden></button>' +\n    '<button class=\"sr-allctn\" id=\"srAllCtn\" type=\"button\">☰ 全部</button></div>' +", 'more btn');
rep("'<div class=\"sr-tagrow\"><div class=\"sr-tags\" id=\"srTagRow\"></div>' +\n    '<button class=\"sr-tagmore\" id=\"srTagMore\" type=\"button\">更多标签 ▾</button></div>' +",
    "'<div class=\"sr-tagrow\"><div class=\"sr-tags\" id=\"srTagRow\"></div>' +\n    '<button class=\"sr-tagadd\" id=\"srTagAdd\" type=\"button\" aria-label=\"管理快捷标签\">＋</button>' +\n    '<button class=\"sr-tagmore\" id=\"srTagMore\" type=\"button\">更多标签 ▾</button></div>' +", 'tagadd');
rep("'<button class=\"sr-popclear\" id=\"srTagClr\" type=\"button\">清除筛选</button></div></div>';",
    "'<button class=\"sr-popclear\" id=\"srTagClr\" type=\"button\">清除筛选</button></div></div>' +\n    '<div class=\"sr-tag-manage\" id=\"srTagManage\" hidden><div class=\"sr-pophead\"><span>管理快捷标签</span>' +\n    '<button class=\"sr-popclear\" id=\"srTagManageX\" type=\"button\">完成</button></div>' +\n    '<div class=\"sr-popbody\"><div class=\"sr-tm-note\">点击标签加入/移出快捷栏（搜索框下一排）。快捷栏内点 × 移除。</div>' +\n    '<div class=\"sr-tagwrap\" id=\"srTagManageBody\"></div></div></div>';", 'manage panel');

/* bind 注册 */
rep("var ids = ['srTitle', 'srCols', 'srCap', 'srTags', 'srExpand', 'srCtnCur', 'srPinRow', 'srAllCtn', 'srSearch',\n      'srTagRow', 'srTagMore',",
    "var ids = ['srTitle', 'srCols', 'srCap', 'srTags', 'srExpand', 'srCtnCur', 'srPinRow', 'srAllCtn', 'srSearch',\n      'srCtnMore', 'srTagAdd', 'srTagManage', 'srTagManageX', 'srTagManageBody', 'srTagRow', 'srTagMore',", 'ids');

/* 新事件 */
rep("    el.srTagClr.onclick = function () { st.tags = []; render(); };",
    "    el.srTagClr.onclick = function () { st.tags = []; render(); };\n" +
    "    el.srCtnMore.onclick = function () { renderCtnPop(); el.srTagPop.hidden = true; el.srCtnPop.hidden = !el.srCtnPop.hidden; };\n" +
    "    el.srTagAdd.onclick = function () { el.srCtnPop.hidden = true; el.srTagPop.hidden = true; st.tagManage = !st.tagManage; renderTagManage(); };\n" +
    "    el.srTagManageX.onclick = function () { st.tagManage = false; renderTagManage(); };\n" +
    "    el.srTagManageBody.onclick = function (e) {\n" +
    "      var b = e.target.closest('[data-tg]'); if (!b) return;\n" +
    "      var t = b.getAttribute('data-tg'), i = COMMON.indexOf(t);\n" +
    "      if (i >= 0) COMMON.splice(i, 1); else COMMON.push(t);\n" +
    "      saveCommon(); renderTags(); renderTagManage();\n" +
    "    };\n" +
    "    bindPinDrag();", 'events');

/* renderCtnBar：折叠 + 拖拽属性 */
rep("    el.pinRow.innerHTML = CTN.filter(function (x) { return x.pin; }).map(function (p) {\n" +
    "      return '<button type=\"button\" class=\"sr-pin' + (p.id === st.currentId ? ' active' : '') + '\" data-ctn=\"' + p.id + '\">' +\n" +
    "        '<span class=\"p-dot\" style=\"background:' + ((p.tags[0] && tagColor(p.tags[0])) || '#888') + '\"></span>' + esc(p.n) + '</button>';\n" +
    "    }).join('');",
    "    var pins = CTN.filter(function (x) { return x.pin; });\n" +
    "    var shown = pins.slice(0, PIN_MAX), rest = pins.length - shown.length;\n" +
    "    el.pinRow.innerHTML = shown.map(function (p) {\n" +
    "      return '<button type=\"button\" draggable=\"true\" class=\"sr-pin' + (p.id === st.currentId ? ' active' : '') + (st.dragId === p.id ? ' dragging' : '') + '\" data-ctn=\"' + p.id + '\">' +\n" +
    "        '<span class=\"p-dot\" style=\"background:' + ((p.tags[0] && tagColor(p.tags[0])) || '#888') + '\"></span>' + esc(p.n) + '</button>';\n" +
    "    }).join('');\n" +
    "    el.srCtnMore.hidden = rest <= 0;\n" +
    "    if (rest > 0) el.srCtnMore.innerHTML = '+' + rest;", 'ctnbar');

/* 快捷标签显示 × */
rep("    for (var i = 0; i < COMMON.length; i++)\n" +
    "      h += '<button type=\"button\" class=\"sr-tag' + (st.tags.indexOf(COMMON[i]) >= 0 ? ' active' : '') + '\" data-tag=\"' + COMMON[i] + '\"><span class=\"t-dot\" style=\"background:' + GROUP_COLOR[groupOf(COMMON[i])] + '\"></span>' + COMMON[i] + '</button>';\n" +
    "    el.srTagRow.innerHTML = h;",
    "    for (var i = 0; i < COMMON.length; i++)\n" +
    "      h += '<button type=\"button\" class=\"sr-tag' + (st.tags.indexOf(COMMON[i]) >= 0 ? ' active' : '') + '\" data-tag=\"' + COMMON[i] + '\"><span class=\"t-dot\" style=\"background:' + GROUP_COLOR[groupOf(COMMON[i])] + '\"></span>' + COMMON[i] +\n" +
    "        '<span class=\"t-x\" data-tx=\"' + COMMON[i] + '\" role=\"button\" aria-label=\"移除\">×</span></button>';\n" +
    "    el.srTagRow.innerHTML = h;", 'tag x');

/* saveCommon / renderTagManage / bindPinDrag 注入 */
rep("  function renderCtnPop() {",
    "  function saveCommon() {\n" +
    "    try { localStorage.setItem('srp_common_tags', JSON.stringify(COMMON)); } catch (e) { }\n" +
    "  }\n" +
    "  function renderTagManage() {\n" +
    "    el.srTagManage.hidden = !st.tagManage;\n" +
    "    if (!st.tagManage) return;\n" +
    "    var h = '';\n" +
    "    for (var g = 0; g < TAG_GROUPS.length; g++) {\n" +
    "      h += '<div class=\"sr-grp\">' + TAG_GROUPS[g].g + '</div><div class=\"sr-tagwrap\">';\n" +
    "      for (var t = 0; t < TAG_GROUPS[g].tags.length; t++) {\n" +
    "        var tg = TAG_GROUPS[g].tags[t];\n" +
    "        h += '<button type=\"button\" class=\"sr-tag2' + (COMMON.indexOf(tg) >= 0 ? ' active' : '') + '\" data-tg=\"' + tg + '\">' + tg + '</button>';\n" +
    "      }\n" +
    "      h += '</div>';\n" +
    "    }\n" +
    "    el.srTagManageBody.innerHTML = h;\n" +
    "  }\n" +
    "  function bindPinDrag() {\n" +
    "    var row = el.srPinRow;\n" +
    "    row.addEventListener('dragstart', function (e) {\n" +
    "      var b = e.target.closest('[data-ctn]'); if (!b) return;\n" +
    "      st.dragId = parseInt(b.getAttribute('data-ctn'), 10);\n" +
    "      e.dataTransfer.effectAllowed = 'move';\n" +
    "      try { e.dataTransfer.setData('text/plain', String(st.dragId)); } catch (x) { }\n" +
    "      b.classList.add('dragging');\n" +
    "    });\n" +
    "    row.addEventListener('dragend', function () {\n" +
    "      st.dragId = null;\n" +
    "      row.querySelectorAll('.sr-pin').forEach(function (b) { b.classList.remove('dragging', 'drop-before', 'drop-after'); });\n" +
    "      render();\n" +
    "    });\n" +
    "    row.addEventListener('dragover', function (e) {\n" +
    "      if (st.dragId == null) return;\n" +
    "      e.preventDefault();\n" +
    "      var b = e.target.closest('[data-ctn]');\n" +
    "      row.querySelectorAll('.sr-pin').forEach(function (x) { x.classList.remove('drop-before', 'drop-after'); });\n" +
    "      if (!b || parseInt(b.getAttribute('data-ctn'), 10) === st.dragId) return;\n" +
    "      var r = b.getBoundingClientRect();\n" +
    "      b.classList.add((e.clientX - r.left) < r.width / 2 ? 'drop-before' : 'drop-after');\n" +
    "    });\n" +
    "    row.addEventListener('drop', function (e) {\n" +
    "      e.preventDefault();\n" +
    "      var b = e.target.closest('[data-ctn]'); if (!b || st.dragId == null) return;\n" +
    "      var target = parseInt(b.getAttribute('data-ctn'), 10);\n" +
    "      if (target === st.dragId) return;\n" +
    "      var pins = CTN.filter(function (x) { return x.pin; });\n" +
    "      var from = -1, to = -1;\n" +
    "      for (var i = 0; i < pins.length; i++) {\n" +
    "        if (pins[i].id === st.dragId) from = i;\n" +
    "        if (pins[i].id === target) to = i;\n" +
    "      }\n" +
    "      if (from < 0 || to < 0) return;\n" +
    "      var r = b.getBoundingClientRect();\n" +
    "      var after = (e.clientX - r.left) >= r.width / 2;\n" +
    "      var order = pins.map(function (p) { return p.id; });\n" +
    "      order.splice(from, 1);\n" +
    "      order.splice(order.indexOf(target) + (after ? 1 : 0), 0, st.dragId);\n" +
    "      var pinMap = {};\n" +
    "      pins.forEach(function (p) { pinMap[p.id] = p; });\n" +
    "      var restCtn = CTN.filter(function (x) { return !x.pin; });\n" +
    "      CTN.length = 0;\n" +
    "      order.forEach(function (id) { CTN.push(pinMap[id]); });\n" +
    "      restCtn.forEach(function (p) { CTN.push(p); });\n" +
    "      try { localStorage.setItem('srp_pin_order', JSON.stringify(order)); } catch (x) { }\n" +
    "    });\n" +
    "  }\n" +
    "  function renderCtnPop() {", 'drag+manage fns');

/* 快捷标签 × 点击分流 */
rep("    el.srTagRow.onclick = function (e) {\n" +
    "      var b = e.target.closest('[data-tag]'); if (!b) return;\n" +
    "      var t = b.getAttribute('data-tag');\n" +
    "      if (t === '__all') st.tags = [];\n" +
    "      else { var i = st.tags.indexOf(t); if (i >= 0) st.tags.splice(i, 1); else st.tags.push(t); }\n" +
    "      render();\n" +
    "    };",
    "    el.srTagRow.onclick = function (e) {\n" +
    "      var x = e.target.closest('[data-tx]');\n" +
    "      if (x) {\n" +
    "        var tx = x.getAttribute('data-tx'), i = COMMON.indexOf(tx);\n" +
    "        if (i >= 0) { COMMON.splice(i, 1); saveCommon(); }\n" +
    "        var f = st.tags.indexOf(tx);\n" +
    "        if (f >= 0) st.tags.splice(f, 1);\n" +
    "        render();\n" +
    "        return;\n" +
    "      }\n" +
    "      var b = e.target.closest('[data-tag]'); if (!b) return;\n" +
    "      var t = b.getAttribute('data-tag');\n" +
    "      if (t === '__all') st.tags = [];\n" +
    "      else { var i2 = st.tags.indexOf(t); if (i2 >= 0) st.tags.splice(i2, 1); else st.tags.push(t); }\n" +
    "      render();\n" +
    "    };", 'tag click split');

/* 启动恢复 */
rep("  applySize(20, 16);\n  setScene('cook');",
    "  try {\n" +
    "    var sc = JSON.parse(localStorage.getItem('srp_common_tags') || 'null');\n" +
    "    if (Array.isArray(sc) && sc.length) COMMON = sc;\n" +
    "    var po = JSON.parse(localStorage.getItem('srp_pin_order') || 'null');\n" +
    "    if (Array.isArray(po) && po.length) {\n" +
    "      var map = {}, rest = [];\n" +
    "      CTN.forEach(function (c) { if (c.pin) map[c.id] = c; else rest.push(c); });\n" +
    "      var ordered = po.map(function (id) { return map[id]; }).filter(Boolean);\n" +
    "      Object.keys(map).forEach(function (k) { if (ordered.indexOf(map[k]) < 0) ordered.push(map[k]); });\n" +
    "      CTN.length = 0;\n" +
    "      ordered.forEach(function (c) { CTN.push(c); });\n" +
    "      rest.forEach(function (c) { CTN.push(c); });\n" +
    "    }\n" +
    "  } catch (e) { }\n" +
    "  applySize(20, 16);\n  setScene('cook');", 'restore');

fs.writeFileSync(__dirname + '/rail.js', j);
console.log('patched OK, len', j.length);
