// BLOCKSIDE BAY play-test: serves game/, opens the real title screen, starts a new game and drives
// through the core loop with simulated input (walk, steal a car, drive, drift, shoot, draw the police,
// pause), printing console errors and saving a frame per step to --out. Ends with "errors: N".
// Usage: PW_DIR=/path/with/node_modules node tools/playtest.mjs --out /tmp/pt
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const gameDir = join(root, 'game');
const require = createRequire(join(process.env.PW_DIR || root, 'package.json'));
const { chromium } = require('playwright-core');
const outIdx = process.argv.indexOf('--out');
const out = outIdx > 0 ? resolve(process.argv[outIdx + 1]) : '/tmp/blockside-playtest';
mkdirSync(out, { recursive: true });

// Static file server for game/ (paths outside it get a 404).
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = join(gameDir, p === '/' ? 'index.html' : p);
  if (!f.startsWith(gameDir) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on('console', (m) => { if (m.type() === 'error') { errors++; console.log('[console.error]', m.text()); } });
page.on('pageerror', (e) => { errors++; console.log('[pageerror]', e.message); });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await page.waitForTimeout(2500);
// snap: save a numbered frame; hold: keep keys down for ms.
const snap = async (n) => { await page.screenshot({ path: join(out, n + '.jpg'), type: 'jpeg', quality: 70 }); console.log('frame', n); };
const hold = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(ms); for (const k of keys) await page.keyboard.up(k); };
await snap('01-title');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');          // NEW GAME
await page.waitForTimeout(1500);
await snap('02-newgame');
await hold(['KeyW'], 2500);                  // walk to the mission marker / street
await snap('03-walk');
// Walk up to the nearest traffic car and steal it.
const near = await page.evaluate(() => {
  const { vehicles, player, placePlayer } = window.__bb;
  const v = vehicles.filter((c) => c.driver === 'traffic').sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0];
  placePlayer(v.x + 2.5, v.z, 0);
  return v.spec.name;
});
console.log('stealing', near);
await page.keyboard.press('KeyF');
await page.waitForTimeout(500);
await hold(['KeyW'], 3000);
await snap('04-drive');
console.log('after steal:', await page.evaluate(() => JSON.stringify({ inCar: !!__bb.player.vehicle, speed: __bb.player.vehicle?.speed.toFixed(1), stars: __bb.police.level, units: __bb.police.units.length })));
await hold(['KeyW', 'KeyA', 'ShiftLeft'], 1200);
await snap('05-drift');
// Out of the car, pistol out, four shots.
await page.keyboard.press('KeyF');
await page.keyboard.press('Digit2');
await page.mouse.click(640, 360);
for (let i = 0; i < 4; i++) { await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up(); await page.waitForTimeout(250); }
await snap('06-shoot');
await page.waitForTimeout(6000);
await snap('07-police');
console.log('police:', await page.evaluate(() => JSON.stringify({ stars: __bb.police.level, units: __bb.police.units.length, heli: !!__bb.police.heli, hp: __bb.game.health })));
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await snap('08-pause');
const state = await page.evaluate(() => document.querySelector('#stars')?.className + ' ' + document.querySelector('#mission .m-text')?.textContent);
console.log('hud state:', state);
console.log('errors:', errors);
await browser.close();
server.close();
