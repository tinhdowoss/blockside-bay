// BLOCKSIDE BAY side-activity play-test: serves game/, starts a new game from the real title screen and
// plays through the side content with the game's own code: a street race (G at the start arch, then
// the car is moved through every checkpoint), a taxi fare and a full parcel run (pickup / drop zones),
// the garage (repair + respray), the gun counter (ammo), one SEA GLASS shard and a save/load round
// trip of the side record. Checks cash, rep and counters after each, and 0 console/page errors.
// Usage: PW_DIR=/path/with/node_modules node tools/playtest-activities.mjs [--out /tmp/acts]
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
const out = outIdx > 0 ? resolve(process.argv[outIdx + 1]) : '/tmp/blockside-activities';
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
const snap = (n) => page.screenshot({ path: join(out, n + '.jpg'), type: 'jpeg', quality: 70 });
const wait = (ms) => page.waitForTimeout(ms);
const G = async () => { await page.keyboard.press('KeyG'); await wait(250); };
// Modules are fetched by URL, so these are the same instances the game runs.
const M = `const M = { act: await import('/src/gameplay/activities.js'), race: await import('/src/gameplay/races.js'), jobs: await import('/src/gameplay/jobs.js'),
  shops: await import('/src/gameplay/shops.js'), shells: await import('/src/gameplay/collectibles.js'), data: await import('/src/data/activities-data.js'),
  veh: await import('/src/gameplay/vehicles.js'), jack: await import('/src/gameplay/carjack.js'), state: await import('/src/core/state.js'),
  player: (await import('/src/gameplay/player.js')).player, police: (await import('/src/gameplay/police.js')).police, save: await import('/src/core/save.js') };`;
const run = (body, arg) => page.evaluate(new Function('arg', `return (async () => { ${M} ${body} })();`), arg);

// Put the player in a fresh car of `model` at (x, z), facing `heading`, through the real steal code.
const carAt = (model, x, z, heading = 0) => run(`
  const { player } = M; if (player.vehicle) M.jack.exitVehicle();
  const v = new M.veh.Vehicle(arg.model, arg.x, arg.z, arg.heading); v.keep = true;
  M.jack.stealVehicle(v, true); M.police.level = 0;
  return v.spec.name;`, { model, x, z, heading });
// Move the player's car to (x, z) and stop it there.
const moveCar = (x, z) => run(`const v = M.player.vehicle; v.x = arg.x; v.z = arg.z; v.vx = v.vz = 0; v.sync(); M.player.x = arg.x; M.player.z = arg.z;`, { x, z });
const state = () => run(`const g = M.state.game; return { cash: g.cash, rep: g.rep, side: JSON.parse(JSON.stringify(g.side)), busy: g.sideBusy };`);

// ---- 1. Street race ----------------------------------------------------------------------------
const r1 = await run(`const r = M.data.RACES[0]; return { start: M.race.raceStart(r), cps: r.cps.map(([i, j]) => ({ x: i * 48, z: j * 48 })), gold: M.data.medalTimes(r).gold, pay: M.data.RACE_PAY.gold, rep: M.data.RACE_REP.gold };`);
await carAt('coralline', r1.start.x, r1.start.z + 3, 0);
await wait(400);
const promptText = await page.evaluate(() => document.getElementById('actprompt')?.textContent || '');
ok('race prompt shown at the start arch', /START PALMETTO SPRINT/.test(promptText), promptText);
await snap('01-race-prompt');
let before = await state();
await G();
ok('G starts the race', await run('return !!M.race.race.def'));
await wait(1200);
await snap('02-race-countdown');
await wait(2600);                             // countdown over
for (const [k, cp] of r1.cps.entries()) {
  await moveCar(cp.x, cp.z);
  await wait(350);
  if (k === 0) await snap('03-race-checkpoint');
}
await wait(400);
let after = await state();
ok('race finished', !(await run('return !!M.race.race.def')));
ok('race paid gold + first-gold bonus', after.cash - before.cash === r1.pay + 1000, `+$${after.cash - before.cash}`);
ok('race gave rep', after.rep > before.rep, `${before.rep} -> ${after.rep}`);
ok('race best time and medal saved', after.side.raceBest.r1 > 0 && after.side.raceMedal.r1 === 'gold' && after.side.races === 1, JSON.stringify(after.side.raceBest));
await snap('04-race-done');

// ---- 2. Taxi fare --------------------------------------------------------------------------------
await carAt('palomar', 5 * 48 + 3, 3 * 48 + 30, Math.PI);
await wait(300);
before = await state();
await G();
ok('G in a cab goes on duty', (await run('return M.jobs.job.kind')) === 'taxi');
let spot = await run('return M.jobs.job.spot');
await snap('05-taxi-fare-waiting');
await moveCar(spot.cx, spot.cz);
await wait(500);
ok('fare boards at the curb', (await run('return M.jobs.job.stage')) === 'ride');
spot = await run('return M.jobs.job.spot');
await snap('06-taxi-ride');
await moveCar(spot.cx, spot.cz);
await wait(500);
after = await state();
ok('fare paid with tip', after.cash - before.cash >= 40 && after.side.fares === 1, `+$${after.cash - before.cash}`);
ok('fare gave rep', after.rep > before.rep);
ok('next fare is waiting', (await run('return M.jobs.job.stage')) === 'pickup');
await G();
ok('G goes off duty', !(await run('return M.jobs.job.kind')));

// ---- 3. Parcel run ---------------------------------------------------------------------------------
const depot = await run(`return M.data.SITES.find((s) => s.kind === 'courier');`);
await carAt('bayrunner', depot.x - 2, depot.z, Math.PI / 2);
await wait(300);
before = await state();
await G();
ok('G at the depot starts a parcel run', (await run('return M.jobs.job.kind')) === 'courier');
for (let d = 0; d < 3; d++) {
  spot = await run('return M.jobs.job.spot');
  if (d === 0) { await snap('07-parcel-run'); }
  await moveCar(spot.cx, spot.cz);
  await wait(450);
}
after = await state();
ok('parcel run completed', after.side.runs === 1 && after.side.parcels === 3, JSON.stringify({ runs: after.side.runs, parcels: after.side.parcels }));
ok('parcel run paid drops + bonus', after.cash - before.cash >= 3 * 180 + 300, `+$${after.cash - before.cash}`);

// ---- 4. Garage --------------------------------------------------------------------------------------
const gar = await run(`return M.data.SITES.find((s) => s.kind === 'garage');`);
await carAt('cruza', gar.x, gar.z, 0);
await run('M.player.vehicle.health = 40; M.state.game.cash += 5000;');
await wait(300);
await G();
ok('G in the bay opens the garage', (await run('return M.shops.shop.open')) === 'garage');
before = await state();
await page.keyboard.press('Digit1'); await wait(250);
const hp = await run('return M.player.vehicle.health');
const color0 = await run('return M.player.vehicle.color');
await page.keyboard.press('Digit2'); await wait(250);
await snap('08-garage-menu');
after = await state();
ok('repair restores the body', hp === 100, hp);
ok('respray changes the colour', (await run('return M.player.vehicle.color')) !== color0);
ok('garage charged repair + respray', before.cash - after.cash === 250 + 400, `-$${before.cash - after.cash}`);
ok('digit keys did not switch weapons in the menu', (await run('return M.state.game.weapon')) === 0);
await G();
ok('G closes the garage', !(await run('return M.shops.shop.open')));

// ---- 5. Gun counter ------------------------------------------------------------------------------------
const gun = await run(`const s = M.data.SITES.find((q) => q.kind === 'gunshop'); M.jack.exitVehicle(); (await import('/src/gameplay/player.js')).placePlayer(s.x, s.z, 0); return s;`);
await wait(300);
await G();
ok('G at the counter opens the gun shop', (await run('return M.shops.shop.open')) === 'gunshop');
before = await state();
const ammo0 = await run('return M.state.game.ammo.pistol');
await page.keyboard.press('Digit1'); await wait(250);
await snap('09-gun-counter');
after = await state();
ok('pistol ammo bought', (await run('return M.state.game.ammo.pistol')) === ammo0 + 48 && before.cash - after.cash === 120, `-$${before.cash - after.cash}`);
await G();
void gun;

// ---- 6. SEA GLASS ------------------------------------------------------------------------------------
before = await state();
await run(`const s = M.shells.shells.spots[0]; (await import('/src/gameplay/player.js')).placePlayer(s.x, s.z, 0);`);
await wait(400);
after = await state();
ok('sea glass shard collected', after.side.shells.length === 1 && after.cash - before.cash === 250, `+$${after.cash - before.cash}`);

// ---- 7. Save / load keeps side progress ------------------------------------------------------------
const rt = await run(`
  M.save.saveGame(2);
  const keep = JSON.stringify(M.state.game.side);
  M.state.game.side = M.data.defaultSide();
  M.save.loadGame(2);
  return { same: JSON.stringify(M.state.game.side) === keep, card: M.save.readSlot(2).side.shells.length };`);
ok('side progress survives save/load', rt.same && rt.card === 1, JSON.stringify(rt));

// ---- 8. Pause map legend + STATS tab -----------------------------------------------------------------
await page.keyboard.press('Escape');
await wait(400);
const legend = await page.evaluate(() => document.querySelector('#pause .legend')?.textContent || '');
ok('pause map legend lists the activities', /Street race/.test(legend) && /Garage/.test(legend) && /Sea glass 1\/30/.test(legend));
await snap('10-pause-map');
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
await wait(300);
const stats = await page.evaluate(() => document.querySelector('#pause .stats')?.textContent || '');
ok('STATS tab shows the side counters', /SEA GLASS\s*1\/30/.test(stats) && /TAXI FARES\s*1/.test(stats), stats.slice(0, 80));
await snap('11-stats');

ok('no console/page errors', errors === 0, `(${errors})`);
const failed = checks.filter((c) => !c.pass).length;
console.log(failed ? `ACTIVITIES TEST FAILED (${failed})` : 'ACTIVITIES TEST PASSED');
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
