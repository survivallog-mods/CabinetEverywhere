/* 验证 C# BuildBootstrap 的拼装物：语法合法 + 假宿主上运行后 __CERAIL__/__CERAIL_CSS__ 同时就位 */
const fs = require('fs'), path = require('path');
const MOD = 'E:/Game/Mod/survivallog-mods/CabinetEverywhere/.worktrees/cerail-storage-rail/SurvivalLog.CabinetEverywhere';
const js = fs.readFileSync(path.join(MOD, 'railui.page.js'), 'utf8');
const css = fs.readFileSync(path.join(MOD, 'railui.css'), 'utf8');
// C# EscapeJs 同款转义（\\ " \n \r \t，其余控制字符→空格）
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t').replace(/[\x00-\x1f]/g, ' ');
const boot = 'window.__CERAIL__||(function(){' + js + '\nwindow.__CERAIL_CSS__="' + esc(css) + '";})()';
fs.writeFileSync(path.join(__dirname, 'bootstrap-sim.js'), boot);
console.log('bootstrap bytes:', boot.length);
require('child_process').execSync('node --check "' + path.join(__dirname, 'bootstrap-sim.js') + '"', { stdio: 'inherit' });
console.log('BOOTSTRAP-SYNTAX-OK');

// 假宿主运行
const w = {};
const doc = {
  getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }),
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener: () => {},
  body: null, head: null, defaultView: null
};
const sandboxWindow = w;
function MutationObserver() { this.observe = () => {}; this.disconnect = () => {}; }
const fn = new Function('window', 'document', 'localStorage', 'setInterval', 'setTimeout', 'MutationObserver', 'console',
  boot + '\n;return {hasCERAIL:!!window.__CERAIL__,cssLen:(window.__CERAIL_CSS__||"").length,ver:window.__CERAIL__&&window.__CERAIL__.ver,' +
  'scan:typeof window.__CERAIL__.scan,scenes:Object.keys(window.__CERAIL__.scenes).length,' +
  'cssHasRule:(window.__CERAIL_CSS__||"").indexOf("#srp .sr-rail")>=0,cssBytes:(window.__CERAIL_CSS__||"").length};');
const r = fn(w, doc, { getItem: () => null, setItem: () => {} }, () => 0, () => 0, MutationObserver, console);
console.log('RUNTIME:', JSON.stringify(r));
if (!r.hasCERAIL || r.ver !== 1 || !r.cssHasRule || r.scan !== 'function' || r.scenes !== 12) { console.error('FAIL'); process.exit(1); }
console.log('BOOTSTRAP-RUNTIME-OK');
