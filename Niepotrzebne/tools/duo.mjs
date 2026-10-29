// Robotea: two headless players (host and guest with the fake webcam) joining one room, reporting the link state
// node duo.mjs <baseUrl> <outPrefix> [seconds]   env: FAKECAM (optional video, else Chrome's test pattern), EXTRA (extra query, e.g. &game=range&selftest=range), AFTER (ms to keep playing once both are open)
import { createRequire } from 'node:module';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');

const [base, out, secs = '20'] = process.argv.slice(2);
const cam = process.env.FAKECAM;
const args = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', ...(cam ? [`--use-file-for-fake-video-capture=${cam}`] : [])];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args });
const code = 'T' + Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X').padEnd(4, 'X');
const logs = [];
const open = async (role) => {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (/error/i.test(m.type())) logs.push(`[${role} ${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => logs.push(`[${role} pageerror] ${e.message}`));
  await page.goto(`${base}?test=1&autostart=1&dpr=0.75&mode=${role}&code=${code}${process.env.EXTRA || ''}`, { waitUntil: 'load' });
  return page;
};
const host = await open('host');
await host.waitForTimeout(1500);
const guest = await open('guest');
const t0 = Date.now();
let states = '';
while (Date.now() - t0 < +secs * 1000) {
  await host.waitForTimeout(2000);
  const a = await host.evaluate(() => window.__info?.link);
  const b = await guest.evaluate(() => window.__info?.link);
  states += `${((Date.now() - t0) / 1000).toFixed(0)}s host=${a} guest=${b}\n`;
  if (a === 'open' && b === 'open') break;
}
await host.waitForTimeout(+(process.env.AFTER || 3000));
console.log('host info', JSON.stringify(await host.evaluate(() => window.__info)));
console.log('guest info', JSON.stringify(await guest.evaluate(() => window.__info)));
await host.screenshot({ path: `${out}-host.jpg`, type: 'jpeg', quality: 85 });
await guest.screenshot({ path: `${out}-guest.jpg`, type: 'jpeg', quality: 85 });
console.log('code', code);
console.log(states.trim());
console.log(logs.slice(0, 20).join('\n'));
await browser.close();
