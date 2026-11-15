/* cookfx-assert.js —— harness 断言集（Playwright evaluate 执行；T3 复跑口径）
 * 用法：browser_evaluate(function 读本文件内容执行)。覆盖：排序五态/同值 ID tiebreak/
 * 重挂确定性/默认还原/官方字形包⇄SVG 回退/记忆恢复/CSS 自足注入。全部断言返回多行文本。 */
(function () {
  var tick = function () { return new Promise(function (r) { setTimeout(r, 60); }); };
  var names = function () { return Array.prototype.map.call(document.querySelectorAll('#bookList .book-item .nm'), function (e) { return e.textContent; }); };
  var clickChip = function (l) { Array.prototype.filter.call(document.querySelectorAll('.cefx-chip'), function (c) { return c.textContent === l; })[0].click(); };
  var out = [];
  var fails = 0;
  var A = function (name, ok, detail) { out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : '  ' + detail)); if (!ok) fails++; };

  return (async function () {
    localStorage.removeItem('cefx_sort_v1');
    await tick();
    A('css注入自足', !!document.getElementById('cefx-style') && !!document.querySelector('.cefx-chip'), '');
    A('chips五枚', document.querySelectorAll('.cefx-chip').length === 5, document.querySelectorAll('.cefx-chip').length + '枚');

    clickChip('默认'); await tick();
    var official = names().join(',');
    A('默认=官方序', official.indexOf('佛跳墙') === 0, official.slice(0, 24));

    clickChip('饱腹'); await tick();
    var s1 = names().join(',');
    A('饱腹序首三', s1.indexOf('八宝饭') === 0 && s1.indexOf('全家桶') > 0, s1.slice(0, 24));
    var n = names();
    A('同值ID序(45组)', n.indexOf('全家桶') < n.indexOf('双拼烤肉'), '');
    A('同值ID序(20组)', n.indexOf('药膳汤') < n.indexOf('蘑菇炖鸡'), '');
    A('锁定垫尾', n.indexOf('油炸薯条') === n.length - 1, '');

    document.getElementById('btnReshuffle').click(); await tick();
    var s2 = names().join(',');
    document.getElementById('btnReshuffle').click(); await tick();
    var s3 = names().join(',');
    A('重渲染自动重挂+确定性', s1 === s2 && s2 === s3, '');

    clickChip('默认'); await tick();
    A('默认还原官方序', names().join(',') === official, '');

    clickChip('精力'); await tick();
    A('精力序首位', names()[0] === '提神咖啡', names()[0]);

    /* 图标双形态 */
    document.getElementById('btnPred').click(); await tick();
    var chips = Array.prototype.slice.call(document.querySelectorAll('.cefx-pred b'));
    A('初始SVG回退', chips.length > 0 && chips.every(function (b) { return b.querySelector('svg'); }), '');
    document.getElementById('btnIcons').click(); await tick();
    chips = Array.prototype.slice.call(document.querySelectorAll('.cefx-pred b'));
    A('官方字形包', chips.every(function (b) { return b.querySelector('.cefx-glyph'); }) && chips.every(function (b) { return !b.querySelector('svg'); }), '');
    A('无文字标签残留', chips.every(function (b) { return !/饱腹|心态|精力|生命/.test(b.textContent); }), '');
    document.getElementById('btnIconsOff').click(); await tick();
    chips = Array.prototype.slice.call(document.querySelectorAll('.cefx-pred b'));
    A('清包回退SVG', chips.every(function (b) { return b.querySelector('svg'); }), '');

    /* 记忆恢复 */
    clickChip('饱腹'); await tick();
    localStorage; /* 保持 */
    location.reload();
    return null; /* 重载后由外层二段断言（见下） */
  })();
})();
/* 二段（reload 后执行）：
   A('记忆恢复(饱腹)', names()[0]==='八宝饭')；A('重载CSS/观察器重注', !!document.getElementById('cefx-style')) */
