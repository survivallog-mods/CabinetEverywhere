/* 诊断（报告证据）：无桩 vs 有桩 的五页官方推送异常对照（fix round 3：多通道消息数组，
   ToolTable=BagMsg+StatusMsg）。
   方法：清空 SCENES.stubs → 复活宿主 → scan 无桩重挂 → 推官方消息组 → 记录未捕获异常；
   恢复 stubs → 同法重挂 → 推送 → 应零异常。 */
const { chromium } = require('playwright');
const fs = require('fs');
const shapes = JSON.parse(fs.readFileSync(__dirname + '/stub-msg-shapes.json', 'utf8')); // { Page: [msg, ...] }
const PAGES = ['Shredder', 'Compressor', 'GreenhouseBuild', 'MaterialRack', 'ToolTable'];
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await page.goto('http://127.0.0.1:8180/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HZ_CURRENT__() !== null, null, { timeout: 20000 });
  const out = {};
  for (const key of PAGES) {
    /* 先等宿主快照（含 html 非空）再 show——与主套件同序，防 show 触发的装配抢在快照前 */
    await page.waitForFunction((k) => { const h = window.__HZ_HOSTCHK__ && window.__HZ_HOSTCHK__(k); return !!(h && h.html); }, key, { timeout: 30000 });
    await page.evaluate((k) => window.__HZ_SHOW__(k), key);
    await page.waitForFunction((k) => {
      const f = document.getElementById(k);
      return f && f.contentDocument && !!f.contentDocument.getElementById('srRail');
    }, key, { timeout: 8000 });
    const res = await page.evaluate(async ([k, msgs]) => {
      const R = window.__CERAIL__;
      const sc = R.scenes[k];
      const f = window.__HZ_FRAME__(k);
      const host = window.__HZ_HOSTCHK__(k);
      const install = () => {
        const w = f.contentWindow;
        w.__errs = w.__errs || [];
        if (!w.__errsInstalled) { w.__errsInstalled = 1; w.addEventListener('error', (e) => w.__errs.push(String((e && e.message) || e))); }
        w.__errs.length = 0;
      };
      // A：无桩重挂 + 推送（组内逐条）
      const saved = sc.stubs; sc.stubs = [];
      f.contentDocument.getElementById('srp').outerHTML = host.html;
      R.scan();
      await new Promise((r) => setTimeout(r, 150));
      install();
      for (const m of msgs) window.__HZ_POST__(k, m);
      await new Promise((r) => setTimeout(r, 400));
      const noStub = (f.contentWindow.__errs || []).slice();
      // B：有桩重挂 + 推送
      sc.stubs = saved;
      f.contentDocument.getElementById('srp').outerHTML = host.html;
      R.scan();
      await new Promise((r) => setTimeout(r, 150));
      install();
      for (const m of msgs) window.__HZ_POST__(k, m);
      await new Promise((r) => setTimeout(r, 400));
      const withStub = (f.contentWindow.__errs || []).slice();
      const stubCount = f.contentDocument.querySelectorAll('[data-cer-stub]').length;
      const classFed = (() => { const el = f.contentDocument.querySelector('.weight-text'); return el ? el.textContent.indexOf('Kg') >= 0 : null; })();
      return { noStub, withStub, stubCount, declared: saved.length, classFed };
    }, [key, shapes[key]]);
    out[key] = res;
    console.log('DIAG ' + key + ' | 无桩首抛: ' + (res.noStub[0] || '（零异常）') + (res.noStub.length > 1 ? ' （共 ' + res.noStub.length + ' 条）' : '') + ' | 有桩: ' + (res.withStub.length === 0 ? '零异常 ✓' : '仍有 ' + res.withStub.length + ' 条: ' + res.withStub[0]) + ' | 桩 ' + res.stubCount + '/' + res.declared + (res.classFed != null ? ' | StatusMsg 落类桩=' + res.classFed : ''));
  }
  fs.writeFileSync(__dirname + '/diag-nostub-result.json', JSON.stringify(out, null, 1));
  console.log('saved diag-nostub-result.json');
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
