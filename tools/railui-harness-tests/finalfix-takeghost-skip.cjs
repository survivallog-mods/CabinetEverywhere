/* 终审建议-4 断言（Playwright，root harness；serve.cjs 需已起在 127.0.0.1:8180）。
   覆盖 Review Focus 1 JS 侧落点：drain 出的命令含不存在 logicId（源容器查无）时，
   root harness mock 执行器按 C# OpTake 红线4 语义——不抛错、静默跳过计数
   （skip=N/moved=0），整批不中断。 */
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
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__HZ_TAKEGHOST__, null, { timeout: 30000 });

  /* 用例：take 两个不存在 logicId（999999/888888 ∉ 900101 的 911..914）→ mock 不抛错、
     skip=2/moved=0、整批不中断（回推一包照常发） */
  const r = await page.evaluate(() => window.__HZ_TAKEGHOST__());
  check('take-ghost:no-throw', r.threw === null, 'threw=' + r.threw);
  check('take-ghost:cmd-recorded', r.lastCmd === 'take:{"ids":[999999,888888],"all":true,"from":900101}', r.lastCmd);
  check('take-ghost:skip-count', /take 已生效 moved=0 skip=2/.test(r.log || ''), 'log 含 moved=0 skip=2（查无静默跳过）');

  /* 混合用例：一个存在 id（911）+ 一个不存在 id（999999）→ 存在的照搬、查无跳过计数，
     C# 语义=整批不因查无中断 */
  const r2 = await page.evaluate(() => {
    window.__CERAIL__.cmd('take', { ids: [911, 999999], all: false, from: 900101 });
    return window.__HZ_LASTCMD__();
  });
  check('take-mixed:cmd-recorded', r2 === 'take:{"ids":[911,999999],"all":false,"from":900101}', r2);

  await page.waitForTimeout(400);
  check('pageerror:zero', pageErrors.length === 0, pageErrors.slice(0, 5).join(' || ') || '0 异常');

  await browser.close();
  const fails = results.filter((x) => !x.ok);
  console.log('\n==== SUMMARY: ' + (results.length - fails.length) + '/' + results.length + ' PASS ====');
  if (fails.length) { fails.forEach((f) => console.log('FAIL: ' + f.name + ' | ' + f.detail)); process.exit(1); }
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
