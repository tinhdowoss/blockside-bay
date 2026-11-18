// BLOCKSIDE BAY vehicles play-test: new game from the real title screen, then drives every model with
// the keyboard on an empty avenue and checks: 9 distinct models, different acceleration and turning
// (muscle beats van off the line, scooter out-turns van), muscle burnout smoke, scooter lean with the
// rider visible, the BAY SKIFF boarding from the marina seawall / staying on water / refusing to drop
// you at sea / landing you ashore, damage stages (dented, smoking, on fire with a fuse, wreck ejects and
// hurts the driver) with HUD warnings, and a radio preset per car that remembers your switch.
// Usage: PW_DIR=/path/with/node_modules node tools/playtest-vehicles.mjs [--out /tmp/veh]
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
const out = outIdx > 0 ? resolve(process.argv[outIdx + 1]) : '/tmp/blockside-vehicles';
mkdirSync(out, { recursive: true });

const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = join(gameDir, p === '/' ? 'index.html' : p);
  if (!f.startsWith(gameDir) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on('console', (m) => { if (m.type() === 'error') { errors++; console.log('[console.error]', m.text()); } });
page.on('pageerror', (e) => { errors++; console.log('[pageerror]', e.message); });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(2500);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');          // NEW GAME
await page.waitForTimeout(1200);

const checks = [];
const ok = (name, cond, info = '') => { checks.push({ name, pass: !!cond }); console.log(cond ? 'PASS' : 'FAIL', name, info); };
const snap = (n) => page.screenshot({ path: join(out, n + '.jpg'), type: 'jpeg', quality: 72 });
const wait = (ms) => page.waitForTimeout(ms);
const hold = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await wait(ms); for (const k of keys) await page.keyboard.up(k); };
const text = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
const M = `const M = { state: await import('/src/core/state.js'), cfg: await import('/src/core/config.js'), veh: await import('/src/gameplay/vehicles.js'),
  jack: await import('/src/gameplay/carjack.js'), pl: await import('/src/gameplay/player.js'), pol: await import('/src/gameplay/police.js'),
  boats: await import('/src/gameplay/boats.js'), dmg: await import('/src/gameplay/vehicle-damage.js'), music: await import('/src/audio/music.js') };
  const { game } = M.state, { player } = M.pl;`;
const run = (body, arg) => page.evaluate(new Function('arg', `return (async () => { ${M} ${body} })();`), arg);

// A fresh car of `model` at the south end of Volta Ave (x = 240) facing north, with the player in it.
// Traffic within 200 m is cleared so nothing gets in the way.
const board = (model, x = 240, z = 30, heading = 0) => run(`
  if (player.vehicle) M.jack.exitVehicle();
  for (const v of [...M.veh.vehicles]) if (v.driver === 'traffic' && Math.abs(v.x - arg.x) < 30) v.remove();
  const v = new M.veh.Vehicle(arg.model, arg.x, arg.z, arg.heading); v.keep = true;
  M.pl.placePlayer(arg.x + 2.5, arg.z, 0); M.jack.stealVehicle(v, true); M.pol.clearWanted(); game.health = 100;
  window.__v = v; return v.spec.name;`, { model, x, z, heading });

// ---- Models and handling ------------------------------------------------------------------------
const models = await run(`return Object.keys(M.cfg.CAR_MODELS);`);
ok('9 original vehicle models', models.length >= 9, models.join(', '));
const trial = {};
for (const m of models.filter((k) => k !== 'skiff')) {
  await board(m);
  await hold(['KeyW'], 1600);
  const sp = await run(`return { speed: window.__v.speed, skid: 0 };`);
  const h0 = await run(`return window.__v.heading;`);
  await hold(['KeyW', 'KeyD'], 700);
  const turn = await run(`return Math.abs(window.__v.heading - arg);`, h0);
  trial[m] = { speed: +sp.speed.toFixed(1), turn: +turn.toFixed(2) };
}
console.log(JSON.stringify(trial));
ok('BRUISER V8 out-accelerates the BAYRUNNER van', trial.bruiser.speed > trial.bayrunner.speed + 4);
ok('ZIPPA scooter out-turns the van', trial.zippa.turn > trial.bayrunner.turn * 1.3);
ok('CORALLINE GT is quicker than the CRUZA sedan', trial.coralline.speed > trial.cruza.speed);

// Muscle burnout from a standstill.
await board('bruiser');
await page.keyboard.down('KeyW'); await wait(350);
const burn = await run(`return window.__v.skid;`);
await page.keyboard.up('KeyW');
ok('BRUISER V8 lays a burnout off the line', burn > 0.5, burn.toFixed(2));
// Scooter lean and visible rider.
await board('zippa');
await page.keyboard.down('KeyW'); await wait(900); await page.keyboard.down('KeyA'); await wait(450);
const lean = await run(`return { roll: window.__v.roll, rider: player.model.visible };`);
await snap('01-scooter');
await page.keyboard.up('KeyA'); await page.keyboard.up('KeyW');
ok('scooter leans into the turn with Kai on it', Math.abs(lean.roll) > 0.08 && lean.rider, JSON.stringify(lean));

// ---- Radio per car ------------------------------------------------------------------------------------
await board('cruza');
const r1 = await run(`return M.music.radio.station;`);
await page.keyboard.press('KeyE');
await wait(100);
const cruza = await run(`return window.__v;`).then(() => run(`window.__cruza = window.__v; return M.music.radio.station;`));
await board('coralline', 260, 30);
const r2 = await run(`return M.music.radio.station;`);
await run(`M.jack.exitVehicle(); const v = window.__cruza; M.pl.placePlayer(v.x + 2.5, v.z, 0); M.jack.stealVehicle(v, true);`);
await wait(100);
const r3 = await run(`return M.music.radio.station;`);
ok('each car has its own radio preset', r1 === 1 && r2 === 0, `cruza ${r1} coralline ${r2}`);
ok('a car remembers the station you switched to', r3 === cruza && cruza === 2, `switched ${cruza} back ${r3}`);

// ---- Boat ---------------------------------------------------------------------------------------------
const boat = await run(`
  if (player.vehicle) M.jack.exitVehicle();
  const b = M.veh.vehicles.find((v) => v.model === 'skiff' && v.x < 0);
  M.pl.placePlayer(-25.4, b.z, -Math.PI / 2); window.__boat = b; return { x: b.x, z: b.z, water: M.boats.isWater(b.x, b.z) };`);
ok('a BAY SKIFF waits in the water at the marina', boat.water, JSON.stringify(boat));
await page.keyboard.press('KeyF');
await wait(200);
ok('F boards the skiff from the seawall', await run(`return player.vehicle === window.__boat;`));
await hold(['KeyW'], 3000);
const sail = await run(`const b = window.__boat; return { x: b.x, z: b.z, speed: b.speed, water: M.boats.isWater(b.x, b.z) };`);
await snap('02-boat');
ok('the skiff motors out to sea and stays on water', sail.x < boat.x - 20 && sail.water, JSON.stringify(sail));
await page.keyboard.press('KeyF');
await wait(150);
ok('cannot step off out at sea', (await run(`return player.vehicle === window.__boat;`)) && /TOO FAR FROM SHORE/.test(await text('#toastline')));
// Turn round and ram the seawall: it must not climb onto land.
await run(`const b = window.__boat; b.heading = Math.PI / 2; b.vx = b.vz = 0; b.x = -40;`);
await hold(['KeyW'], 2500);
const wall = await run(`const b = window.__boat; return { x: b.x, water: M.boats.isWater(b.x, b.z) };`);
ok('the seawall stops the boat', wall.x < -26.5 && wall.water, JSON.stringify(wall));
await page.keyboard.press('KeyF');
await wait(150);
const ashore = await run(`return { inBoat: !!player.vehicle, water: M.boats.isWater(player.x, player.z), x: player.x };`);
ok('stepping off near shore lands Kai on dry ground', !ashore.inBoat && !ashore.water, JSON.stringify(ashore));

// ---- Damage stages -----------------------------------------------------------------------------------
await board('vista', 240, 60);
const stages = [];
for (const h of [60, 40, 15]) {
  await run(`window.__v.health = arg;`, h);
  await wait(250);
  stages.push(await run(`return M.dmg.damageStage(window.__v);`));
}
const warn = await text('#speedo .warn');
await snap('03-on-fire');
ok('damage stages: dented, smoking, on fire', stages.join(',') === '1,2,3', stages.join(','));
ok('HUD warns to bail out with a countdown', /ON FIRE - BAIL OUT \d/.test(warn), warn);
await run(`game.health = 100; game.armor = 0;`);
await wait(7600);
const boom = await run(`return { wrecked: window.__v.wrecked, inCar: !!player.vehicle, health: Math.round(game.health) };`);
ok('a burning car blows up, throws the driver out and hurts', boom.wrecked && !boom.inCar && boom.health < 100, JSON.stringify(boom));

console.log('errors:', errors);
const failed = checks.filter((c) => !c.pass).length;
console.log(`${checks.length - failed}/${checks.length} checks passed`);
await browser.close();
server.close();
process.exit(failed || errors ? 1 : 0);
