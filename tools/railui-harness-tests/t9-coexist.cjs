/* T9 共存检查扩展（tmp-t8/coexist-check.cjs 的 3 断言 + rail 侧消费 = task-9 ④）：
   游戏内 TagFilter(__SLTF__) 与 CERail(__CERAIL__) 同注入 Root——两套 wrapRelay 串联
   （保留前一引用并调用）。本脚本补注真 tagfilter.page.js 后断言：
   1) coexist:two-contracts   两契约共存；
   2) coexist:cmd-channel     rail 命令通道照常（点柜→右键 take 入队）；
   3) coexist:zero-errors     控制台零报错；
   4) coexist:relay-both      postMessage 包装链串联：Cooking 帧收到模拟回包时
      rail wrapRelay 截读 active 跟随（title 切柜）+ 官方 fixture 照常消费
      （State.workbenchName 探针）——「双方都收到消息」。 */
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('http://127.0.0.1:8180/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HZ_CURRENT__ !== undefined && window.__HZ_CURRENT__() !== null, null, { timeout: 20000 });
  /* 注入 tagfilter（游戏内 TagFilter.Tick 同位注入 Root；此时 rail 已先行包装 Cooking 帧） */
  await page.evaluate(() => new Promise((res) => {
    const s = document.createElement('script');
    s.src = '../tagfilter.page.js';
    s.onload = res;
    document.body.appendChild(s);
  }));
  const both = await page.evaluate(() => ({
    sltf: !!(window.__SLTF__ && window.__SLTF__.ver === 3),
    cerail: !!(window.__CERAIL__ && window.__CERAIL__.ver === 1),
    sltfState: window.__SLTF__.state()
  }));
  console.log((both.sltf && both.cerail ? 'PASS' : 'FAIL') + ' | coexist:two-contracts ' + JSON.stringify(both));
  // rail 场景照常装配 + 命令通道照常（tagfilter 的 wrapRelay 已包装 postMessage，rail 命令不受影响）。
  await page.evaluate(() => window.__HZ_SHOW__('Cooking'));
  await page.waitForFunction(() => {
    const f = document.getElementById('Cooking');
    return f && f.contentDocument && f.contentDocument.querySelector('#srGrid .sr-slot[data-it]');
  }, null, { timeout: 8000 });
  await page.evaluate(() => {
    const d = document.getElementById('Cooking').contentDocument;
    const tab = d.querySelector('#srPinRow [data-ctn="900103"]');
    tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  /* T9：点柜触发 forge → 消息模拟层回包（链：rail 包装→预包装→原生）→ rail 跟随渲染 */
  await page.waitForFunction(() => {
    const f = document.getElementById('Cooking');
    const d = f && f.contentDocument;
    return d && d.getElementById('srTitle').textContent === '材料架' && d.querySelector('#srGrid .sr-slot[data-it]');
  }, null, { timeout: 8000 });
  await page.evaluate(() => {
    const d = document.getElementById('Cooking').contentDocument;
    d.querySelector('#srGrid .sr-slot[data-it]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(150);
  const cmd = await page.evaluate(() => window.__HZ_LASTCMD__());
  console.log((cmd.indexOf('take') >= 0 ? 'PASS' : 'FAIL') + ' | coexist:cmd-channel ' + (cmd || '（无命令）'));

  /* ④ rail 侧消费：真 tagfilter 包装已串联在链上（rail 先包→tagfilter 后包或反之，链序无关），
     向 Cooking 帧投模拟回包 → rail 截读 active 跟随 + 官方 fixture State 探针被送达。
     时序注意：rail 包装在投递调用内同步观察（title 先变），原生 postMessage 是排队投递、
     页面 handler 在其后一拍任务才跑——探针必须等一拍再读。 */
  await page.evaluate(() => {
    document.getElementById('Cooking').contentWindow.postMessage({
      type: 'WebUI_Cooking_BagMsg',
      data: {
        bagTabs: [{ ownerId: 900001, name: '背包' }, { ownerId: 900101, name: '食材柜' }, { ownerId: 900102, name: '冷藏柜' }, { ownerId: 900103, name: '材料架' }, { ownerId: 900104, name: '杂物柜' }],
        bagOwnerId: 900102, bagItems: [], workbenchItems: [], workbenchName: 'PROBE-RELAY'
      }
    }, '*');
  });
  await page.waitForFunction(() => {
    const fr = document.getElementById('Cooking');
    return fr.contentDocument.getElementById('srTitle').textContent === '冷藏柜';
  }, null, { timeout: 5000 });
  await page.waitForTimeout(150); /* 页面 handler 任务拍 */
  const relay = await page.evaluate(() => {
    const fr = document.getElementById('Cooking');
    return {
      title: fr.contentDocument.getElementById('srTitle').textContent,
      probe: (() => { try { return fr.contentWindow.eval('State.workbenchName'); } catch (e) { return 'eval-fail'; } })(),
      forges: window.__HZ_FORGES__().length
    };
  });
  console.log((relay.title === '冷藏柜' ? 'PASS' : 'FAIL') + ' | coexist:relay-rail-follow title=' + relay.title +
    '（回包 active=900102 → rail 跟随；链上含真 tagfilter wrapRelay）');
  console.log((relay.probe === 'PROBE-RELAY' ? 'PASS' : 'FAIL') + ' | coexist:relay-page-consumed State.workbenchName=' + relay.probe +
    '（链尾原生送达=官方页面照常消费；tagfilter 无 SLTF 数据恒放行=两链共存）');

  console.log((errs.length === 0 ? 'PASS' : 'FAIL') + ' | coexist:zero-errors ' + (errs.slice(0, 3).join('||') || '0 错误'));
  await browser.close();
  const outputs = [
    both.sltf && both.cerail, cmd.indexOf('take') >= 0, errs.length === 0,
    relay.title === '冷藏柜', relay.probe === 'PROBE-RELAY'
  ];
  if (outputs.some((x) => !x)) process.exit(1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
