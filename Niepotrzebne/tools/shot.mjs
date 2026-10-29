// Robotea: headless Chrome (real GPU via ANGLE/Metal) screenshots and page images of local pages
// node shot.mjs <url> <out.jpg|png> [width] [height] [flag] [timeoutMs]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');

const [url, out, w = '1280', h = '720', flag = '__done', timeout = '240000'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +(process.env.DPR || 1) });
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
try {
  await page.waitForFunction(k => window[k] === true, flag, { timeout: +timeout });
} catch {
  logs.push('[harness] timeout waiting for ' + flag);
}
logs.push(`[harness] ready after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const imgs = await page.evaluate(() => window.__images || []);
const base = out.replace(/\.(jpg|png)$/, '');
imgs.forEach((b64, i) => fs.writeFileSync(`${base}-${i + 1}.jpg`, Buffer.from(b64, 'base64')));
const info = await page.evaluate(() => window.__info || null);
if (info) logs.push('[info] ' + JSON.stringify(info));
const jpg = out.endsWith('.jpg');
await page.screenshot({ path: out, fullPage: true, type: jpg ? 'jpeg' : 'png', ...(jpg ? { quality: 88 } : {}) });
console.log(logs.slice(-80).join('\n'));
console.log('saved', path.resolve(out), imgs.length ? `+ ${imgs.length} images` : '');
await browser.close();
