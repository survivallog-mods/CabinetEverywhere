/* v1.9.1 批改后筛选下拉回归锚（Playwright @ serve.cjs 8180，真 railui.page.js）。
   床=railui-root-harness.html；MOCK lib 7 标签中带 iconKey 的两条=103 材料(material)/
   1013 燃料(fuel)——FS_CATS 定版分类按 iconKey 解析，菜单=全部/食物/材料/燃料/其他（其余
   分类 lib 无对应 iconKey=按序跳行）。断言组：
   ① Trade：页脚 #srTagFilt 在场紧邻 #srFoodSort 右侧、缺省态（全部/无 .on/三横线图标）；
   ② 菜单：定版顺序+官方 SVG 图标（选项行 .f-ico svg）+选中 ✓（.sr-fsel-tick）；
   ③ 选中「材料」(tagId 解析 103)：label/.on/localStorage/命令 setFilter{sel:'103'}/触发钮
      图标换装（材料 SVG）/弹层关 五同步；
   ④ 语义项：食物=sel 'food'、其他=sel 'other'（补集口径 C# SelMatch 同源）；
   ⑤ 页集合（批改）：Cooking/ToolTable 恒藏（工作台撤钮=作者令）；DroneHub 排序+筛选并排；
   ⑥ 复位 sel='0'：清键+命令+.on 摘除+三横线图标回归；
   ⑦ 弹层锚定（offsetLeft px）+外部点击关；
   ⑧ 开页自愈：sel 在册时重进 Trade 补发 setFilter（rebindFrame 路）；
   ⑨ 全程 console 零报错。 */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/Users/wangk/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright')); }

const BASE = 'http://127.0.0.1:8180';
const EXEC = 'C:/Users/wangk/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' : '') + (detail || ''));
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXEC });
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HZ_CURRENT__ !== undefined && window.__HZ_CURRENT__() !== null, null, { timeout: 20000 });

  async function gotoScene(key, wantVisible) {
    await page.evaluate((k) => window.__HZ_SHOW__(k), key);
    await page.waitForFunction(([k, v]) => {
      const d = document.getElementById(k).contentDocument;
      if (!d || !d.getElementById('srRail') || !d.getElementById('srTagFilt')) return false;
      const hid = d.getElementById('srTagFilt').hidden;
      return v ? !hid : hid;
    }, [key, wantVisible], { timeout: 15000 });
  }
  const pickSel = (pageKey, sel) => page.evaluate(([pk, sv]) => {
    const d = document.getElementById(pk).contentDocument;
    d.getElementById('srTagFilt').click();
    const b = Array.from(d.querySelectorAll('#srTagFiltBody .sr-fselopt')).filter(function (x) { return x.getAttribute('data-fsel') === sv; })[0];
    if (!b) return { found: false, opts: Array.from(d.querySelectorAll('#srTagFiltBody .sr-fselopt')).map(function (x) { return x.getAttribute('data-fsel'); }) };
    b.click();
    return { found: true };
  }, [pageKey, sel]);

  /* ---- ① Trade 在场+缺省态 ---- */
  await page.evaluate(() => localStorage.clear());
  await gotoScene('Trade', true);
  const t1 = await page.evaluate(() => {
    const d = document.getElementById('Trade').contentDocument;
    const btn = d.getElementById('srTagFilt'), sort = d.getElementById('srFoodSort');
    return {
      nextToSort: !!(sort && sort.nextElementSibling === btn),
      sortVisible: !sort.hidden,
      lbl: d.getElementById('srTagFiltLbl').textContent,
      on: btn.classList.contains('on'),
      popHidden: d.getElementById('srTagFiltPop').hidden,
      btnIcoSvg: !!(btn.querySelector('.sr-ftag-ico svg'))
    };
  });
  check('1:trade-btn-visible', t1.sortVisible && t1.nextToSort && t1.btnIcoSvg, JSON.stringify(t1));
  check('1:trade-default-state', t1.lbl === '全部' && !t1.on && t1.popHidden, JSON.stringify(t1));

  /* ---- ② 菜单：定版顺序+SVG 图标+✓ ---- */
  const t2 = await page.evaluate(() => {
    const d = document.getElementById('Trade').contentDocument;
    d.getElementById('srTagFilt').click();
    const pop = d.getElementById('srTagFiltPop');
    const rows = Array.from(pop.querySelectorAll('.sr-fselopt'));
    return {
      open: !pop.hidden,
      seq: rows.map(function (b) { return b.getAttribute('data-fsel') + '=' + b.textContent.replace('✓', ''); }),
      svgs: rows.filter(function (b) { return !!b.querySelector('.f-ico svg'); }).length,
      tick: rows.filter(function (b) { return !!b.querySelector('.sr-fsel-tick'); }).map(function (b) { return b.getAttribute('data-fsel'); }),
      left: pop.style.left
    };
  });
  check('2:menu-open+anchor', t2.open && /^\d+(\.\d+)?px$/.test(t2.left) && parseFloat(t2.left) >= 0, 'left=' + t2.left);
  check('2:menu-fixed-order', t2.seq.length === 6 &&
    t2.seq[0] === '0=全部' && t2.seq[1] === 'food=食物' && t2.seq[2] === '103=材料' &&
    t2.seq[3] === '1013=燃料' && t2.seq[4] === '105=书刊' && t2.seq[5] === 'other=其他',
    'n=' + t2.seq.length + ' ' + t2.seq.join('|'));
  check('2:menu-icons+tick', t2.svgs === 6 && t2.tick.length === 1 && t2.tick[0] === '0',
    'svg行=' + t2.svgs + ' ✓=' + t2.tick.join(','));

  /* ---- ③ 选中材料（tagId 解析）五同步 ---- */
  const t3a = await pickSel('Trade', '103');
  check('3:pick-103-found', t3a.found, JSON.stringify(t3a));
  const t3 = await page.evaluate(() => {
    const d = document.getElementById('Trade').contentDocument;
    const btn = d.getElementById('srTagFilt');
    return {
      popHidden: d.getElementById('srTagFiltPop').hidden,
      lbl: d.getElementById('srTagFiltLbl').textContent,
      on: btn.classList.contains('on'),
      ls: localStorage.getItem('srp_filter_Trade'),
      cmd: window.__HZ_LASTCMD__(),
      icoHasSvg: !!btn.querySelector('.sr-ftag-ico svg')
    };
  });
  check('3:pick-material', t3.popHidden && t3.lbl === '材料' && t3.on && t3.ls === '103' &&
    /setFilter.*"key":"Trade".*"sel":"103"/.test(t3.cmd || '') && t3.icoHasSvg, JSON.stringify(t3));

  /* ---- ④ 语义项 food/other ---- */
  const t4f = await pickSel('Trade', 'food');
  const t4fcmd = await page.evaluate(() => window.__HZ_LASTCMD__());
  check('4:pick-food', t4f.found && /"sel":"food"/.test(t4fcmd || ''), t4fcmd);
  const t4o = await pickSel('Trade', 'other');
  const t4ocmd = await page.evaluate(() => window.__HZ_LASTCMD__());
  check('4:pick-other', t4o.found && /"sel":"other"/.test(t4ocmd || ''), t4ocmd);
  await page.evaluate(() => localStorage.setItem('srp_filter_Trade', 'food')); /* ⑧ 用：food 在册 */

  /* ---- ⑤ 页集合：Cooking/ToolTable 藏；DroneHub 并排 ---- */
  await gotoScene('Cooking', false);
  const c5 = await page.evaluate(() => document.getElementById('Cooking').contentDocument.getElementById('srTagFilt').hidden);
  check('5:cooking-hidden', c5, '集合外恒藏');
  await gotoScene('ToolTable', false); /* 批改：工作台撤钮 */
  const tt5 = await page.evaluate(() => {
    const d = document.getElementById('ToolTable').contentDocument;
    const vis = Array.from(d.querySelector('.sr-foot').querySelectorAll('button')).filter(function (b) { return !b.hidden; });
    return { fsHidden: d.getElementById('srTagFilt').hidden, firstBtn: vis.length ? vis[0].id : '' };
  });
  check('5:tooltable-hidden', tt5.fsHidden, '工作台撤钮（作者令）——页脚无筛选钮 ' + JSON.stringify(tt5));
  await gotoScene('DroneHub', true);
  const dh5 = await page.evaluate(() => {
    const d = document.getElementById('DroneHub').contentDocument;
    const btn = d.getElementById('srTagFilt'), sort = d.getElementById('srFoodSort');
    return { sortVisible: !sort.hidden, nextToSort: sort.nextElementSibling === btn, lbl: d.getElementById('srTagFiltLbl').textContent };
  });
  check('5:dronehub-pair', dh5.sortVisible && dh5.nextToSort && dh5.lbl === '全部', 'DroneHub 排序+筛选并排 ' + JSON.stringify(dh5));

  /* ---- ⑥ 复位（DroneHub 上先选再复位） ---- */
  const t6a = await pickSel('DroneHub', '1013');
  const t6 = await pickSel('DroneHub', '0');
  const t6s = await page.evaluate(() => {
    const d = document.getElementById('DroneHub').contentDocument;
    return { lbl: d.getElementById('srTagFiltLbl').textContent, on: d.getElementById('srTagFilt').classList.contains('on'),
      ls: localStorage.getItem('srp_filter_DroneHub'), cmd: window.__HZ_LASTCMD__() };
  });
  check('6:reset-all', t6a.found && t6.found && t6s.lbl === '全部' && !t6s.on && t6s.ls == null && /"sel":"0"/.test(t6s.cmd || ''), JSON.stringify(t6s));

  /* ---- ⑦ 外部点击关（DroneHub 重开→点标题） ---- */
  const t7 = await page.evaluate(() => {
    const d = document.getElementById('DroneHub').contentDocument;
    d.getElementById('srTagFilt').click();
    const wasOpen = !d.getElementById('srTagFiltPop').hidden;
    d.getElementById('srTitle').click();
    return { wasOpen: wasOpen, nowHidden: d.getElementById('srTagFiltPop').hidden };
  });
  check('7:outside-click-close', t7.wasOpen && t7.nowHidden, JSON.stringify(t7));

  /* ---- ⑧ 开页自愈：trade sel=food 在册 → 经 ToolTable 重进 Trade 补发 ---- */
  await gotoScene('Trade', true);
  const healed = await page.waitForFunction(() => {
    const c = window.__HZ_LASTCMD__();
    return c && /setFilter.*"key":"Trade".*"sel":"food"/.test(c) ? c : false;
  }, null, { timeout: 8000 }).catch(() => false);
  check('8:scene-open-selfreport', !!healed, '重进 Trade 补发 ' + (healed || '(未捕获)'));

  /* ---- ⑨ console 清洁 ---- */
  check('9:console-clean', consoleErrors.length === 0 && pageErrors.length === 0,
    'errors=' + consoleErrors.length + ' pageErrors=' + pageErrors.length);

  await browser.close();
  const pass = results.filter((r) => r.ok).length;
  console.log('---- page-filter: ' + pass + '/' + results.length + (pass === results.length ? ' PASS ----' : ' ----'));
  process.exit(pass === results.length ? 0 : 1);
})();
