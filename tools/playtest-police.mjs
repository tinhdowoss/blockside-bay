// BLOCKSIDE BAY police play-test: runs the real game headless, starts a New Game, checks the weapon
// keys, carjacks a traffic car, steals a police unit car and keeps driving, then carjacks up to five
// stars. Asserts no console/page errors, the stars climb to 3+ and 5, police.units keeps holding
// manned pursuit cars that actually drive, and the helicopter turns up. Exits 1 on any failure.
// Usage: PW_DIR=../pwtools node tools/playtest-police.mjs [--out /tmp/bb-police]
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const gameDir = join(root, 'game');
const require = createRequire(join(resolve(process.env.PW_DIR || root), 'package.json'));
const { chromium } = require('playwright-core');
const outIdx = process.argv.indexOf('--out');
const out = outIdx > 0 ? resolve(process.argv[outIdx + 1]) : '/tmp/blockside-police';
mkdirSync(out, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = join(gameDir, p === '/' ? 'index.html' : p);
  if (!f.startsWith(gameDir) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('[console.error]', m.text()); } });
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });

const failures = [];
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures.push(what); };
const wait = (ms) => page.waitForTimeout(ms);
const snap = async (n) => { await page.screenshot({ path: join(out, n + '.jpg'), type: 'jpeg', quality: 75 }); };
const hold = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await wait(ms); for (const k of keys) await page.keyboard.up(k); };
const state = () => page.evaluate(() => {
  const { police, player, game } = window.__bb;
  return {
    mode: game.mode, stars: police.level, heli: !!police.heli, inCar: !!player.vehicle,
    copCar: !!player.vehicle?.police, weapon: game.weapon,
    units: police.units.map((u) => ({ driver: u.driver, ai: !!u.ai, speed: +u.speed.toFixed(1), mine: u === player.vehicle })),
    roadblockCars: police.roadblocks.flatMap((r) => r.cars).map((c) => ({ driver: c.driver, ai: !!c.ai, mine: c === player.vehicle })),
    toast: document.getElementById('toastline')?.textContent || '',
  };
});
// Every unit the police code holds must be a manned cop car, never the player's.
const unitsSane = (s) => [...s.units, ...s.roadblockCars].every((u) => u.driver === 'police' && u.ai && !u.mine);
// Drive around (weaving so the car doesn't just sit against a wall) while sampling the police.
let sawDriving = false, sawInsane = false;
async function drive(ms) {
  const steps = Math.ceil(ms / 600);
  for (let i = 0; i < steps; i++) {
    await hold(['KeyW', i % 4 === 1 ? 'KeyA' : i % 4 === 3 ? 'KeyD' : 'KeyW'], 600);
    const s = await state();
    if (!unitsSane(s)) sawInsane = true;
    if (s.units.some((u) => u.speed > 3)) sawDriving = true;
  }
}
// Put the player beside a car (stopped for the moment) and press F.
async function takeCar(pickFn) {
  if ((await state()).inCar) { await page.keyboard.press('KeyF'); await wait(200); }
  const ok = await page.evaluate((src) => {
    const { vehicles, police, player, placePlayer } = window.__bb;
    const v = new Function('vehicles', 'police', 'player', `return (${src})(vehicles, police, player);`)(vehicles, police, player);
    if (!v) return false;
    v.vx = 0; v.vz = 0;
    placePlayer(v.x + Math.cos(v.heading) * 2.4, v.z - Math.sin(v.heading) * 2.4, 0);
    window.__bbTarget = v;
    return true;
  }, pickFn.toString());
  if (!ok) return false;
  await page.keyboard.press('KeyF');
  await wait(150);
  return page.evaluate(() => window.__bb.player.vehicle === window.__bbTarget);
}
const nearestTraffic = (vehicles, police, player) => vehicles.filter((c) => c.driver === 'traffic' && !c.wrecked)
  .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0];
const nearestUnit = (vehicles, police, player) => police.units.filter((u) => u !== player.vehicle)
  .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0];

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => window.__bb && window.__bb.game.mode === 'title', null, { timeout: 30000 });
  await wait(1000);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');          // NEW GAME
  await wait(1500);
  let s = await state();
  check(s.mode === 'play', `New Game starts play mode (mode=${s.mode})`);

  // Weapon keys on a fresh run: the pistol is owned, the SMG unlocks in a story chapter.
  await page.keyboard.press('Digit2'); await wait(200);
  s = await state();
  check(s.weapon === 1, `key 2 selects the pistol (weapon=${s.weapon})`);
  await page.keyboard.press('Digit3'); await wait(200);
  s = await state();
  check(s.weapon === 1 && /SMG LOCKED - unlocks in CH 3/.test(s.toast), `key 3 shows the SMG lock toast ("${s.toast}")`);
  await page.keyboard.press('Digit1'); await wait(200);
  check((await state()).weapon === 0, 'key 1 selects fists');

  // 1. Carjack a traffic car.
  check(await takeCar(nearestTraffic), 'carjacked a traffic car');
  s = await state();
  check(s.stars >= 1, `carjack gives a star (stars=${s.stars})`);
  await drive(1200);

  // 2. Wait for a pursuit unit, then steal it.
  for (let i = 0; i < 30 && !(await state()).units.length; i++) await drive(600);
  s = await state();
  check(s.units.length > 0, `a pursuit unit spawned (units=${s.units.length})`);
  const before = s.stars;
  check(await takeCar(nearestUnit), 'stole a police unit car');
  await wait(300);
  s = await state();
  check(s.copCar, 'player is driving the police car');
  check(s.stars >= Math.min(5, before + 2), `stealing the cop car adds 2 stars (${before} -> ${s.stars})`);
  check(!s.units.some((u) => u.mine) && !s.roadblockCars.some((u) => u.mine), 'stolen car left police.units and roadblocks');
  check(s.stars >= 3, `stars reach 3+ (stars=${s.stars})`);
  const errsAtSteal = errors.length;
  await drive(9000);
  s = await state();
  check(errors.length === errsAtSteal, 'no errors while driving the stolen cop car');
  check(s.units.length > 0, `new pursuit units keep spawning (units=${s.units.length})`);
  check(s.heli, 'helicopter is up at 3+ stars');
  await snap('01-copcar-heli');

  // 3. More carjacks until five stars.
  for (let i = 0; i < 6 && (await state()).stars < 5; i++) {
    check(await takeCar(nearestTraffic), `carjack #${i + 2}`);
    await drive(1500);
  }
  s = await state();
  check(s.stars === 5, `stars reach 5 (stars=${s.stars})`);
  sawDriving = false;
  for (let i = 0; i < 4; i++) { await drive(3000); await snap(`02-five-stars-${i}`); }
  s = await state();
  check(s.units.length >= 2, `5-star pursuit has several units (units=${s.units.length})`);
  check(sawDriving, 'pursuit units are actually driving');
  check(!sawInsane && unitsSane(s), 'police.units/roadblocks only ever held manned cop cars');
  check(s.heli, 'police.heli exists at 5 stars');
  console.log('final:', JSON.stringify({ stars: s.stars, units: s.units.length, roadblockCars: s.roadblockCars.length, heli: s.heli, mode: s.mode }));
} catch (e) {
  failures.push('exception: ' + e.message);
  console.log('EXCEPTION', e);
}
check(errors.length === 0, `no console/page errors (${errors.length})`);
await browser.close();
server.close();
console.log(failures.length ? `PLAYTEST FAILED (${failures.length}): ${failures.join('; ')}` : 'PLAYTEST PASSED');
process.exit(failures.length ? 1 : 0);
