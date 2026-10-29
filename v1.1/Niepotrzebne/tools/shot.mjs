// Robotea: headless Chrome (real GPU via ANGLE/Metal) screenshots, page images and stats; FAKECAM=<mjpeg> feeds a video as the webcam
// node shot.mjs <url> <out.jpg|png> [width] [height] [flag] [timeoutMs]   env: SHOTS="1000,4000" (ms after flag), FAKECAM, DPR
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');

const [url, out, w = '1280', h = '720', flag = '__done', timeout = '240000'] = process.argv.slice(2);
const args = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-webgpu'];
if (process.env.FAKECAM) args.push('--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${process.env.FAKECAM}`);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +(process.env.DPR || 1) });
const logs = [];
page.on('console', m => { if (!m.text().includes('favicon')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
try {
  await page.waitForFunction(k => window[k] === true, flag, { timeout: +timeout });
} catch {
  logs.push('[harness] timeout waiting for ' + flag);
}
logs.push(`[harness] ready after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const base = out.replace(/\.(jpg|png)$/, '');
const jpg = out.endsWith('.jpg');
const shots = (process.env.SHOTS || '').split(',').filter(Boolean).map(Number);
let elapsed = 0;
for (const [i, ms] of shots.entries()) {
  await page.waitForTimeout(Math.max(0, ms - elapsed));
  elapsed = ms;
  await page.screenshot({ path: `${base}-t${i + 1}.${jpg ? 'jpg' : 'png'}`, type: jpg ? 'jpeg' : 'png', ...(jpg ? { quality: 86 } : {}) });
  const info = await page.evaluate(() => window.__info || null);
  if (info) logs.push(`[info @${ms}ms] ` + JSON.stringify(info));
}
const imgs = await page.evaluate(() => window.__images || []);
imgs.forEach((b64, i) => fs.writeFileSync(`${base}-${i + 1}.jpg`, Buffer.from(b64, 'base64')));
const info = await page.evaluate(() => window.__info || null);
if (info && !shots.length) logs.push('[info] ' + JSON.stringify(info));
await page.screenshot({ path: out, fullPage: true, type: jpg ? 'jpeg' : 'png', ...(jpg ? { quality: 86 } : {}) });
if (process.env.LOGFILE) fs.writeFileSync(process.env.LOGFILE, logs.join('\n'));
console.log(logs.slice(-80).join('\n'));
console.log('saved', path.resolve(out), imgs.length ? `+ ${imgs.length} images` : '');
await browser.close();
