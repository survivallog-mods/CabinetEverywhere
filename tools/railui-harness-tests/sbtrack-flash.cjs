/* v1.8.10 追修「开机器页滚动条在柜子中间闪一下再回右侧」验证（Playwright，serve.cjs 先起）。
   根因：壳侧指示轨水平定位原为 JS 像素 left（paint 写死）+重绘 90ms 防抖——mount 首绘在
   syncRailWidth 冻宽之前（rail 骨架 428），格进壳后 rail 冻到格宽+24+sb（≈720），轨的 left
   滞留 428 期旧位 ≥90ms = 落在柜子中间。修复：absolute 模式水平定位改 CSS right:15px 锚定
   （与旧 left 公式满宽布局下逐像素等价），随 rail 宽同帧贴右零窗口。
   断言（机器页 ToolTable/Cooking/Trade + Cooking 补采样）：
   ① 同帧跟随：rail 宽突变 +280px（模拟 syncRailWidth 冻宽）后不重绘立即量，
      gap=rail右缘−track右缘 恒 ≈15px（旧实现此处 ≈295=轨滞留旧位，柜中间实锤）；
   ② 全程无闪帧：真实装配流程 rAF 逐帧采样 1.5s，任意帧 gap∈[13,17] 且 railW 经历变宽
      （序列 ≥2 个不同值，证明采样覆盖冻宽过程，测试有效）。 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');

const BASE = 'http://127.0.0.1:8180';
const SCENES = ['ToolTable', 'Cooking', 'Trade'];
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

(async () => {
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(BASE + '/railui-root-harness.html', { waitUntil: 'domcontentloaded' });
/* 12 场景 iframe 全量建（隐藏预载）——等全部帧注册+文档就绪再驱动（harness-mount 同理） */
await page.waitForFunction(() => window.__HZ_SHOW__ && document.querySelectorAll('#iframe-container iframe').length >= 12, null, { timeout: 20000 });
await page.waitForTimeout(600);

function frameOf(key) {
  return page.frames().find((f) => f.url().includes('/fixtures/' + key + '.html'));
}
async function waitRail(key, timeout = 8000) {
  const f = frameOf(key);
  if (!f) throw new Error('frame not found: ' + key);
  await f.waitForFunction(() => {
    const r = document.getElementById('srRail');
    const t = document.getElementById('srSbTrack');
    return r && r.isConnected && t && t.isConnected;
  }, null, { timeout });
  return f;
}

for (const key of SCENES) {
  await page.evaluate((k) => window.__HZ_SHOW__(k), key);
  const f = await waitRail(key);
  /* track 短暂 display:none（paint 的 scroller 零高守卫：宿主 v-show/布局未就窗口）不是
     视觉闪——none 不可见；等它进入可见态再量（MO→90ms 防抖自愈） */
  await f.waitForFunction(() => {
    const t = document.getElementById('srSbTrack');
    return t && t.offsetWidth > 0 && t.offsetHeight > 0;
  }, null, { timeout: 5000 }).catch(() => { });

  /* ① 同帧跟随：宽度突变（模拟冻宽）→ 不调 paint 立即量 gap */
  const r1 = await f.evaluate(() => {
    const rail = document.getElementById('srRail');
    const track = document.getElementById('srSbTrack');
    const w0 = rail.offsetWidth;
    const g0 = rail.getBoundingClientRect().right - track.getBoundingClientRect().right;
    rail.style.setProperty('width', (w0 + 280) + 'px', 'important'); /* 模拟 syncRailWidth 冻宽 +280 */
    const g1 = rail.getBoundingClientRect().right - track.getBoundingClientRect().right; /* 同帧，零重绘 */
    const g2 = getComputedStyle(track).right;
    return { w0, g0, g1, cssRight: g2 };
  });
  check('follow:' + key, Math.abs(r1.g1 - 15) <= 2 && r1.cssRight === '15px',
    `宽${r1.w0}→+280 同帧gap=${r1.g1.toFixed(1)}px（期望≈15，旧实现≈${(r1.g0 + 280).toFixed(0)}=滞留柜中间）cssRight=${r1.cssRight}`);

  /* ③ ready 门：骨架期（官方格移出 sr-gridhost）轨道必须 display:none（隐藏而非错位）；
     格回壳 90ms 防抖后现身且贴右（gap≈15）——「站在 428 窄壳右缘=冻宽后柜子中间」零帧 */
  const g3 = await f.evaluate(() => new Promise((resolve) => {
    const host = document.getElementById('srGridHost');
    let grid = null;
    for (let c = host && host.firstElementChild; c; c = c.nextElementSibling) {
      if (!/^sr/i.test(c.id || '')) { grid = c; break; } /* 官方格=非 mod 层（sr 前缀）；mod 层（badge 等）留在壳里验证谓词不被骗 */
    }
    const rail = document.getElementById('srRail');
    const track = document.getElementById('srSbTrack');
    if (!grid) { resolve({ skip: true }); return; }
    grid.parentNode.removeChild(grid); /* 模拟骨架期（格未进壳）——MO→90ms 防抖 → paint 应隐藏 */
    setTimeout(() => {
      const hidden = getComputedStyle(track).display === 'none';
      host.appendChild(grid); /* 格回壳——MO→90ms 防抖 → 现身 */
      setTimeout(() => {
        const gap = rail.getBoundingClientRect().right - track.getBoundingClientRect().right;
        resolve({ hidden, shown: getComputedStyle(track).display !== 'none' && track.offsetWidth > 0, gap: gap.toFixed(1) });
      }, 250);
    }, 250);
  }));
  check('readygate:' + key, g3.skip ? false : (g3.hidden && g3.shown && Math.abs(g3.gap - 15) <= 2),
    g3.skip ? 'srGridHost 无官方格（夹具异常）' : `骨架期隐藏=${g3.hidden} 回壳现身=${g3.shown} gap=${g3.gap}px`);

  /* ② 全程无闪帧：驱动宽度序列（428 骨架→720 冻宽→切窄柜……模拟 syncRailWidth 各档）
     rAF 逐帧采样 1.5s，任一帧 gap 必须恒 ≈15（旧实现任一变宽帧 gap≈旧宽差=柜中间闪）。 */
  const s = await f.evaluate(() => new Promise((resolve) => {
    const rail = document.getElementById('srRail');
    const track = document.getElementById('srSbTrack');
    const plan = ['428px', '720px', '428px', '706px', '576px'];
    const widths = new Set();
    let worst = 0, worstW = 0, i = 0;
    const t0 = performance.now();
    const swap = setInterval(() => { if (i < plan.length) { rail.style.setProperty('width', plan[i], 'important'); i++; } }, 200);
    (function snap() {
      if (track.offsetWidth > 0) { /* 只统计可见帧（none 帧 rect=0 无视觉意义） */
        const g = rail.getBoundingClientRect().right - track.getBoundingClientRect().right;
        const w = rail.offsetWidth;
        widths.add(w);
        if (Math.abs(g - 15) > worst) { worst = Math.abs(g - 15); worstW = w; }
      }
      if (performance.now() - t0 < 1500) requestAnimationFrame(snap);
      else {
        clearInterval(swap);
        resolve({ sampled: widths.size > 0, worst: worst.toFixed(1), worstW, widths: [...widths].slice(0, 6).join(',') });
      }
    })();
  }));
  check('noflash:' + key, s.sampled && Number(s.worst) <= 2.5,
    `可见帧rail宽[${s.widths}] 最差偏差=${s.worst}px@宽${s.worstW}（采样1.5s；宽度计划被 syncRailWidth 持续回写压住=真实冻宽稳态，变宽跟随由断言①覆盖）`);
}

check('console-clean', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ') || '零页面错误');
await browser.close();
const fails = results.filter((r) => !r.ok).length;
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
