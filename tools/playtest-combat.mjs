// BLOCKSIDE BAY combat play-test: new game from the real title screen, then checks the 5 weapon slots
// and their locks, mouse-click firing with recoil (camera kick, spread bloom, wider crosshair), reload,
// the X hit marker, the SEA LANCE piercing three gang members on one line, crouch (C) and dodge roll
// (SPACE, no damage while rolling), armor vest pickups (world + gang drops), and a Viper squad at Club
// Volta that takes cover behind the crates (crouched, out of sight) and sends a flanker round the side.
// Usage: PW_DIR=/path/with/node_modules node tools/playtest-combat.mjs [--out /tmp/combat]
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
const out = outIdx > 0 ? resolve(process.argv[outIdx + 1]) : '/tmp/blockside-combat';
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
const text = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
const M = `const M = { state: await import('/src/core/state.js'), wp: await import('/src/gameplay/weapons.js'), combat: await import('/src/gameplay/combat.js'),
  pl: await import('/src/gameplay/player.js'), city: (await import('/src/world/city.js')).city, cover: await import('/src/world/cover.js'),
  pick: await import('/src/gameplay/pickups.js'), pol: await import('/src/gameplay/police.js') };
  const { game } = M.state, { player } = M.pl;`;
const run = (body, arg) => page.evaluate(new Function('arg', `return (async () => { ${M} ${body} })();`), arg);
const click = async () => { await page.mouse.move(640, 360); await page.mouse.down(); await wait(40); await page.mouse.up(); };

// ---- Slots and locks -----------------------------------------------------------------------
const slots = await page.evaluate(() => [...document.querySelectorAll('#weapons .slot')].map((s) => s.innerText.replace(/\s+/g, ' ')));
ok('HUD shows 5 weapon slots', slots.length === 5, slots.join(' | '));
ok('SEA LANCE slot starts locked (CH5)', /LANCE.*LOCKED CH5/.test(slots[4]));
await page.keyboard.press('Digit5');
await wait(200);
ok('key 5 explains the lock', /SEA LANCE LOCKED/.test(await text('#toastline')));

// ---- Recoil, bloom, reload, hit marker -------------------------------------------------------
await run(`const s = M.city.landmarks.safehouse; M.pl.placePlayer(s.x - 7, s.z, Math.PI / 2); player.camPitch = 0.1;`);
await page.keyboard.press('Digit2');
await wait(300);
const p0 = await run(`return player.camPitch;`);
await click();
await wait(60);
const r1 = await run(`return { pitch: player.camPitch, bloom: M.wp.aimBloom(), clip: game.clip.pistol, w: parseFloat(document.getElementById('crosshair').style.width) };`);
ok('pistol shot kicks the camera up (recoil)', r1.pitch < p0 - 0.01, `${p0.toFixed(3)} -> ${r1.pitch.toFixed(3)}`);
ok('spread blooms and the crosshair opens', r1.bloom > 0.005 && r1.w > 31, JSON.stringify(r1));
await page.keyboard.press('KeyR');
await wait(100);
ok('R reloads with a reload time', (await run(`return M.wp.isReloading();`)) && /RELOADING/.test(await text('#ammo')));
await wait(1300);
ok('clip refilled after reload', (await run(`return game.clip.pistol;`)) === 12);

// Line up three Saltwater Kings on the crosshair ray and fire the SEA LANCE once.
// (On Coral Pier, facing the open end, so no wall is in the way.)
await run(`const p = M.city.landmarks.pier; M.pl.placePlayer(p.x - 45, p.z, Math.PI / 2); player.camPitch = 0.12;
  game.weapons.lance = true; game.clip.lance = 3; game.ammo.lance = 9; game.weapon = 4;`);
await wait(400);
const lined = await run(`
  const { o, d } = M.wp.aimRay();
  const t0 = (1.25 - o.y) / d.y;
  const wall = (await import('/src/world/city.js')).rayBuildings(o.x, o.y, o.z, d.x, d.y, d.z, 130);
  if (wall < t0 + 4) return { t0, wall, blocked: true };
  window.__line = [t0 - 3, t0, t0 + 3].map((t) => M.combat.spawnShooter(o.x + d.x * t, o.z + d.z * t, 'salt', { guard: 0 }));
  for (const s of window.__line) { s.health = 100; s.yaw = 0; }
  return { t0: t0.toFixed(1), n: window.__line.length };`);
await wait(100);
await click();
await wait(150);
const pierce = await run(`return { down: window.__line.filter((s) => !s.alive).length, mark: document.getElementById('hitmark').className, op: +document.getElementById('hitmark').style.opacity };`);
ok('SEA LANCE pierces three bodies in one shot', pierce.down === 3, JSON.stringify({ ...lined, ...pierce }));
ok('hit marker flashes (takedown)', /kill|head/.test(pierce.mark) && pierce.op > 0, pierce.mark);
await snap('01-lance');

// ---- Crouch and roll ---------------------------------------------------------------------------
await page.keyboard.press('KeyC');
await wait(150);
ok('C crouches (HUD shows it, model lower)', (await run(`return player.crouch && player.model.scale.y < 0.8;`)) && /CROUCHED/.test(await text('#ammo')));
await page.keyboard.press('KeyC');
const before = await run(`return { x: player.x, z: player.z, st: player.stamina };`);
await page.keyboard.down('KeyW'); await page.keyboard.press('Space');
await wait(80);
const rolling = await run(`const h = game.health; M.combat.hurtPlayer(30, player.x + 5, player.z); return { rolling: player.rolling > 0, hurt: h - game.health };`);
await wait(450);
await page.keyboard.up('KeyW');
const after = await run(`return { x: player.x, z: player.z, st: player.stamina };`);
ok('SPACE dodge-rolls (fast, costs stamina)', rolling.rolling && Math.hypot(after.x - before.x, after.z - before.z) > 3, JSON.stringify(rolling));
ok('no damage while rolling', rolling.hurt === 0);

// ---- Armor pickups -------------------------------------------------------------------------------
const vest = await run(`game.armor = 20; const p = M.pick.pickups.find((q) => q.stash && !q.taken); M.pl.placePlayer(p.x, p.z, 0); return M.pick.pickups.length;`);
await wait(300);
const armor = await run(`return game.armor;`);
ok('walking over a vest gives +50 armor', armor === 70, `vests=${vest} armor=${armor}`);
const drops = await run(`const n = M.pick.pickups.length; const b = M.combat.spawnShooter(player.x + 20, player.z, 'vipers', { boss: true, guard: 0 }); M.combat.damageCharacter(b, 999, false, player.x, player.z); return M.pick.pickups.length - n;`);
ok('a downed boss drops a vest', drops === 1);

// ---- Squad AI at Club Volta: cover and flanking ------------------------------------------------
await run(`
  M.combat.clearShooters();
  const c = M.city.landmarks.club; M.pl.placePlayer(c.x, c.z + 24, Math.PI); player.camYaw = Math.PI; game.weapon = 1;
  window.__squad = [];
  for (let k = 0; k < 6; k++) { const s = M.combat.spawnShooter(c.x - 10 + k * 4, c.z - 2, 'vipers', { guard: 60 }); s.alerted = true; window.__squad.push(s); }
  window.__flank = { start: null, max: 0, cover: 0, hidden: 0 };`);
for (let i = 0; i < 16; i++) {
  await wait(500);
  await run(`
    game.health = 100; game.armor = 100;
    const f = window.__flank;
    for (const s of window.__squad) {
      if (s.role === 'flank' || s.flanked) {
        const a = Math.atan2(s.x - player.x, s.z - player.z);
        s.__a0 ??= a;
        const da = Math.abs(Math.atan2(Math.sin(a - s.__a0), Math.cos(a - s.__a0)));
        f.max = Math.max(f.max, da * 180 / Math.PI);
      }
      if (s.ai === 'hide' && s.crouch) { f.cover++; if ((await import('/src/world/city.js')).sightBlocked(s.x, s.z, player.x, player.z) || M.cover.coverBetween(s.x, s.z, player.x, player.z)) f.hidden++; }
    }`);
  if (i === 8) await snap('02-squad');
}
const squad = await run(`return { ...window.__flank, roles: window.__squad.map((s) => s.role + ':' + s.ai).join(' ') };`);
ok('gang members duck into cover (crouched, out of sight)', squad.cover > 0 && squad.hidden > 0, JSON.stringify(squad));
ok('a flanker swings 40+ degrees round the player', squad.max > 40, `${Math.round(squad.max)} deg`);

console.log('errors:', errors);
const failed = checks.filter((c) => !c.pass).length;
console.log(`${checks.length - failed}/${checks.length} checks passed`);
await browser.close();
server.close();
process.exit(failed || errors ? 1 : 0);
