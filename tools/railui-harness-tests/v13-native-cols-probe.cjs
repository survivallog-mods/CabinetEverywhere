/* v13 只读探针（零打扰版）：不开不点任何 UI，直读 Root 里已装载 iframe 的文档状态。
   Backpack(BackpackUI)/MaterialRack 若本会话开过，.grid-container inline 样式即原生列数。 */
const { chromium } = require('C:/temp/baidu_up/node_modules/playwright-core');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const page = browser.contexts()[0].pages().find((p) => decodeURIComponent(p.url()).indexOf('Root') >= 0);
  if (!page) { console.error('root page not found'); process.exit(2); }
  const out = await page.evaluate(() => {
    const res = { visiblePages: [], frames: {} };
    document.querySelectorAll('iframe.page-frame').forEach((f) => {
      const vis = (function () { try { return getComputedStyle(f).display !== 'none'; } catch (e) { return false; } })();
      if (vis) res.visiblePages.push(f.id);
      let d; try { d = f.contentDocument; } catch (e) { return; }
      if (!d || !d.body) return;
      const info = {
        url: (f.getAttribute('src') || '').slice(0, 60),
        visible: vis,
        bodyKids: d.body.children.length,
        containers: d.querySelectorAll('.backpack-container').length,
        bagPanels: d.querySelectorAll('.bag-panel').length,
        storagePanels: d.querySelectorAll('.bag-panel.is-storage').length,
        srRail: !!d.getElementById('srRail'),
        gridContainers: [...d.querySelectorAll('.grid-container')].map((gc) => ({
          inline: (gc.getAttribute('style') || '').trim(),
          cols: (function () { const bg = gc.querySelector('.grid-bg'); if (!bg) return 0; return (getComputedStyle(bg).gridTemplateColumns || '').split(' ').filter((s) => s).length; })(),
          items: gc.querySelectorAll('.item').length
        })),
        titles: [...d.querySelectorAll('.bag-panel .header')].map((h) => h.textContent.trim().slice(0, 24)),
        weightShown: [...d.querySelectorAll('.weight-section')].map((w) => getComputedStyle(w).display)
      };
      if (info.bodyKids > 0 || info.containers > 0) res.frames[f.id] = info;
    });
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
