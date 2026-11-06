/* 本地预览服务：node serve.cjs 后 Chrome 访问 http://127.0.0.1:8180/standalone.html
 * （railui 测试床：http://127.0.0.1:8180/railui-harness.html，T2 起；
 *   root 测试床：http://127.0.0.1:8180/railui-root-harness.html，T8 起——fixtures/ 官方模板）
 * 只服务 mod 根目录内文件 + 官方 webui 快照资产，无依赖；ZCode 会话结束后重跑一次即可。 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MODROOT = path.dirname(__dirname); // mod 根：railui.page.js/railui.css 在本目录上级，railui-harness.html 以 ../ 引用（T2）
/* T8：fixtures/<Page>.html 是官方模板整文件拷贝，其内部以 ../../ 引用 webui_src 根的共享
   脚本（webui-core.js/webui-bag.js/vue 等）与 Res/ 图标——浏览器把 /fixtures/X.html 的 ../../
   归一化到站点根。两级快照只读回源：webui_src（Task 1 取证同版）与 gamekb webui（带 Res/
   图标目录，同 build 26157732 对账基线）。仅限这两个白名单根，其余越界照拒。 */
/* 快照根不再写死上级层数（主仓/worktree 检出深度不同）：从 __dirname 向上逐级探测，
   命中存在的那一级为止；两层快照找不到时保持空串、按原逻辑跳过。 */
function findSnapshotRoot(rel) {
  let dir = __dirname;
  for (let i = 0; i < 8; i++, dir = path.dirname(dir)) {
    const cand = path.resolve(dir, rel);
    if (fs.existsSync(cand)) return cand;
  }
  return '';
}
const WEBUI_SRC = findSnapshotRoot(path.join('suite', 'tools', 'webui_src'));
const GAMEKB_WEBUI = findSnapshotRoot(path.join('gamekb', '2026-10-23_26157732', 'webui'));
/* 完整原型自持：官方共享脚本+图标冻结在 vendor/（对账基线 build 26157732），仓外快照
   只是兜底；命中兜底=vendor 缺文件，打印 [vendor-miss] 提示补录。 */
const VENDOR = path.join(ROOT, 'vendor');
const PORT = 8180;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.md': 'text/plain; charset=utf-8',
  '.cjs': 'text/plain; charset=utf-8'
};

http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/' || p === '\\') p = '/standalone.html';
  /* railui-harness.html 以 ../ 引用 mod 根的 railui.css/railui.page.js——浏览器会把 ../
     归一化成站点根路径再发请求，服务端按「先本目录、后 mod 根、后官方快照」三级解析（T2/T8） */
  let file = path.join(ROOT, p);
  if (!fs.existsSync(file)) {
    const alt = path.join(VENDOR, p);
    if (fs.existsSync(alt)) file = alt;
  }
  if (!fs.existsSync(file)) {
    const alt = path.join(MODROOT, p);
    if (fs.existsSync(alt)) file = alt;
  }
  if (!fs.existsSync(file) && WEBUI_SRC && fs.existsSync(WEBUI_SRC)) {
    const alt = path.join(WEBUI_SRC, p);
    if (fs.existsSync(alt) && fs.statSync(alt).isFile()) { file = alt; console.log('[vendor-miss] ' + p + ' → webui_src 兜底，应补录 vendor/'); }
  }
  if (!fs.existsSync(file) && fs.existsSync(GAMEKB_WEBUI)) {
    const alt = path.join(GAMEKB_WEBUI, p);
    if (fs.existsSync(alt) && fs.statSync(alt).isFile()) { file = alt; console.log('[vendor-miss] ' + p + ' → gamekb 兜底，应补录 vendor/'); }
  }
  if (!file.startsWith(MODROOT) && !file.startsWith(WEBUI_SRC) && !file.startsWith(GAMEKB_WEBUI)) { res.writeHead(403); res.end(); return; } // 越出白名单根才拒
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log('design-proto preview at http://127.0.0.1:' + PORT + '/standalone.html'));
