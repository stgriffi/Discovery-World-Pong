import { firefox } from 'playwright';
const browser = await firefox.launch({ headless: true, firefoxUserPrefs: { 'media.autoplay.default': 0 } });
for (const url of ['http://localhost:5000/', 'http://localhost:5003/']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 200)));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`.slice(0, 300)));
  await page.goto(url);
  await page.waitForTimeout(6000);
  const gl = await page.evaluate(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl'); return g ? g.getParameter(g.VERSION) + ' / ' + (g.getExtension('WEBGL_debug_renderer_info') ? g.getParameter(g.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL) : '?') : 'NO WEBGL'; });
  console.log(`== ${url}  webgl: ${gl}`);
  console.log(logs.slice(0, 25).join('\n'));
  await page.screenshot({ path: `results/smoke-${url.includes('5000') ? 'gameboard' : 'tyler'}.png` });
}
await browser.close();
