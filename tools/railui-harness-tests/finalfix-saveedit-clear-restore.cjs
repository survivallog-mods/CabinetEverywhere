/* 终审 Important-1 断言（Playwright，旧 harness；serve.cjs 需已起在 127.0.0.1:8180）。
   覆盖：✎ 弹窗改名基准=当前显示名 nm(c)（契约名 c.n 在 rename 被 C# 持久化后不再是
   「原名」）——①改名 A→保存→drain 出 rename{name:A}→mock 回推（模拟 C# 持久化，行名
   已是覆盖名）；②再开 ✎ 清空→保存→drain 出 rename{name:""}（旧实现静默无效的路径）
   且本地 overlay 删除；③回推官方名包→页签/✎ 回显恢复官方名；④T5「同名不重发」回归
   （显示名未变不发命令）。 */
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8180';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource|net::ERR_/.test(t)) return; // 资源缺席（预期）
    consoleErrors.push(t);
  });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(BASE + '/railui-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#srRail', { timeout: 15000 });
  await page.evaluate(() => localStorage.clear()); // 清历史 srp_*（含 srp_ctn_names），可复跑
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#srRail', { timeout: 15000 });

  const drain = () => page.evaluate(() => JSON.parse(window.__CERAIL__.drain()));
  const namesOf = () => page.evaluate(() => JSON.parse(localStorage.getItem('srp_ctn_names') || '{}'));
  const tabText = () => page.evaluate(() => {
    const t = document.querySelector('#srPinRow [data-ctn="900101"]');
    return t ? t.textContent : '';
  });
  const openEdit = () => page.evaluate(() => {
    document.querySelector('#srPinRow [data-ctn="900101"] .p-edit').click();
  });

  /* ① 改名 A→保存：drain 出 rename{name:A}，overlay 落盘，mock 回推（行名=覆盖名） */
  await openEdit();
  await page.waitForSelector('#srCtnEdit:not([hidden])', { timeout: 5000 });
  const shown0 = await page.inputValue('#srEditName');
  check('reopen-echo-official', shown0 === '食材柜', '回显=' + shown0);
  await page.fill('#srEditName', '测试名A');
  await page.click('#srEditSave');
  const d1 = await drain();
  const r1 = d1.find((c) => c.op === 'rename' && c.owner === 900101);
  check('rename-A-drain', !!r1 && r1.name === '测试名A', JSON.stringify(d1));
  const n1 = await namesOf();
  check('rename-A-overlay', n1['900101'] === '测试名A', JSON.stringify(n1));
  await page.waitForFunction(() => {
    const t = document.querySelector('#srPinRow [data-ctn="900101"]');
    return t && t.textContent.indexOf('测试名A') >= 0;
  }, null, { timeout: 5000 });
  check('rename-A-tab-repush', true, '页签=' + (await tabText()) + '（mock 模拟 C# 持久化后行名已是覆盖名）');

  /* ② 清空→保存：修复点——drain 出 rename{name:""}（旧实现只删 overlay 不发命令=静默无效） */
  await openEdit();
  await page.waitForSelector('#srCtnEdit:not([hidden])', { timeout: 5000 });
  const echo = await page.inputValue('#srEditName');
  check('reopen-echo-override', echo === '测试名A', '回显=' + echo + '（覆盖名回显，非契约名）');
  await page.fill('#srEditName', '');
  await page.click('#srEditSave');
  const d2 = await drain();
  const r2 = d2.find((c) => c.op === 'rename' && c.owner === 900101);
  check('clear-sends-empty-rename', !!r2 && r2.name === '', JSON.stringify(d2));
  const n2 = await namesOf();
  check('clear-overlay-removed', n2['900101'] === undefined, JSON.stringify(n2));

  /* ③ 回推官方名包（模拟 C# OpRename 空名=删覆盖+ForceRepublish）→ 页签/回显恢复 */
  await page.evaluate(() => {
    const j = window.__HZ_MOCK__();
    for (const row of j.ctn) if (row[0] === 900101) row[1] = '食材柜';
    window.__HZ_MOCK__(j);
    window.__HZ_REPUSH__();
  });
  await page.waitForFunction(() => {
    const t = document.querySelector('#srPinRow [data-ctn="900101"]');
    return t && t.textContent.indexOf('食材柜') >= 0;
  }, null, { timeout: 5000 });
  check('restore-official-tab', true, '页签=' + (await tabText()));
  await openEdit();
  await page.waitForSelector('#srCtnEdit:not([hidden])', { timeout: 5000 });
  const echo2 = await page.inputValue('#srEditName');
  check('restore-official-echo', echo2 === '食材柜', '回显=' + echo2);

  /* ④ T5「同名不重发」回归：显示名未变 → 不发命令 */
  await page.fill('#srEditName', '食材柜');
  await page.click('#srEditSave');
  const d3 = await drain();
  check('same-name-no-resend', d3.length === 0, JSON.stringify(d3));
  const n3 = await namesOf();
  check('same-name-no-overlay', n3['900101'] === undefined, JSON.stringify(n3));

  await page.waitForTimeout(300);
  check('console:zero-errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' || ') || '0 错误');
  check('pageerror:zero', pageErrors.length === 0, pageErrors.slice(0, 5).join(' || ') || '0 异常');

  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log('\n==== SUMMARY: ' + (results.length - fails.length) + '/' + results.length + ' PASS ====');
  if (fails.length) { fails.forEach((f) => console.log('FAIL: ' + f.name + ' | ' + f.detail)); process.exit(1); }
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
