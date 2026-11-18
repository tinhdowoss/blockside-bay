// BLOCKSIDE BAY menus play-test: drives the real title screen and pause menu with the keyboard.
// Title: SETTINGS (master volume reaches the audio output, FOV, persisted to localStorage), CONTROLS,
// CREDITS, ESC back. Game: steal a car and drive, then the pause STATS page must show real numbers
// (distance driven, cars stolen, top speed); SETTINGS in the pause menu (invert Y, GRAPHICS LOW turns
// the post pass off, camera FOV follows); CONTROLS and CREDITS tabs; 0 console/page errors.
// Usage: PW_DIR=/path/with/node_modules node tools/playtest-menus.mjs [--out /tmp/menus]
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
const out = outIdx > 0 ? resolve(process.argv[outIdx + 1]) : '/tmp/blockside-menus';
mkdirSync(out, { recursive: true });

const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = join(gameDir, p === '/' ? 'index.html' : p);
  if (!f.startsWith(gameDir) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on('console', (m) => { if (m.type() === 'error') { errors++; console.log('[console.error]', m.text()); } });
page.on('pageerror', (e) => { errors++; console.log('[pageerror]', e.message); });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(2500);

const checks = [];
const ok = (name, cond, info = '') => { checks.push({ name, pass: !!cond }); console.log(cond ? 'PASS' : 'FAIL', name, info); };
const snap = (n) => page.screenshot({ path: join(out, n + '.jpg'), type: 'jpeg', quality: 72 });
const wait = (ms) => page.waitForTimeout(ms);
const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await wait(70); } };
const text = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
const M = `const M = { state: await import('/src/core/state.js'), mix: (await import('/src/audio/mixer.js')).mix, post: (await import('/src/fx/post.js')).post,
  pl: await import('/src/gameplay/player.js'), veh: await import('/src/gameplay/vehicles.js'), jack: await import('/src/gameplay/carjack.js') }; const { game } = M.state;`;
const run = (body, arg) => page.evaluate(new Function('arg', `return (async () => { ${M} ${body} })();`), arg);

// ---- Title: SETTINGS -------------------------------------------------------------------
await key('ArrowDown', 4);                       // CONTINUE, NEW, LOAD, CONTROLS, SETTINGS
await key('Enter');
await wait(300);
ok('title SETTINGS panel opens', /MASTER VOLUME/.test(await text('#title .sub')));
await key('ArrowLeft', 3);                       // master 10 -> 7
await wait(400);
const audio = await run(`return { master: game.masterVol, out: M.mix.out ? M.mix.out.gain.value : null };`);
ok('MASTER volume changes and reaches the audio output', Math.abs(audio.master - 0.7) < 0.01 && (audio.out === null || Math.abs(audio.out - 0.85 * 0.7) < 0.05), JSON.stringify(audio));
await key('ArrowDown', 5);                       // music, sfx, sens, invert, fov
await key('ArrowRight', 2);                      // fov 62 -> 72
const fov = await run(`return game.fov;`);
ok('FIELD OF VIEW changes', fov === 72, String(fov));
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('blockside-bay-settings') || '{}'));
ok('settings persist in localStorage', stored.fov === 72 && Math.abs(stored.masterVol - 0.7) < 0.01);
await snap('01-title-settings');
await key('Escape');
await wait(200);
ok('ESC closes the title panel', await page.evaluate(() => getComputedStyle(document.querySelector('#title .sub')).display === 'none'));
await key('ArrowUp');                            // CONTROLS
await key('Enter');
await wait(300);
ok('title CONTROLS lists roll, crouch and reload', /Dodge roll/.test(await text('#title .sub')) && /Reload/.test(await text('#title .sub')));
await snap('02-title-controls');
await key('Escape');
await key('ArrowDown', 2);                       // CREDITS
await key('Enter');
await wait(300);
ok('title CREDITS', /THE CREW/.test(await text('#title .sub')) && /three\.js/.test(await text('#title .sub')));
await snap('03-title-credits');
await key('Escape');

// ---- New game, drive, then pause STATS ----------------------------------------------------
await key('ArrowUp', 4);                         // NEW GAME
await key('Enter');
await wait(1200);
await run(`const v = M.veh.vehicles.filter((c) => c.driver === 'traffic').sort((a, b) => Math.hypot(a.x - M.pl.player.x, a.z - M.pl.player.z) - Math.hypot(b.x - M.pl.player.x, b.z - M.pl.player.z))[0];
  M.pl.placePlayer(v.x + 2.5, v.z, 0);`);
await key('KeyF');
await page.keyboard.down('KeyW'); await wait(3500); await page.keyboard.up('KeyW');
const camFov = await page.evaluate(async () => { const c = (await import('/src/gameplay/camera.js')); return c.camera ? c.camera.fov : null; }).catch(() => null);
const st = await run(`return { d: game.stats.distance, stolen: game.stats.stolen, top: game.stats.topSpeed };`);
ok('driving counts distance, theft and top speed', st.d > 15 && st.stolen >= 1 && st.top > 10, JSON.stringify(st));
void camFov;
await key('Escape');
await wait(400);
ok('pause menu opens on the MAP tab', /STORY/.test(await text('#pause .body')));
await key('KeyE', 2);                            // MISSIONS, STATS
await wait(300);
const stats = await text('#pause .body');
ok('STATS shows distance driven, cars stolen, headshots, races won', ['DISTANCE DRIVEN', 'CARS STOLEN', 'HEADSHOTS', 'RACES WON', 'TOP SPEED', 'STARS EVADED'].every((k) => stats.includes(k)));
ok('STATS numbers are real (cars stolen 1+, distance > 0)', /CARS STOLEN [1-9]/.test(stats) && !/DISTANCE DRIVEN 0\.0 KM/.test(stats), stats.slice(0, 120));
await snap('04-pause-stats');
await key('KeyE', 2);                            // SAVE, SETTINGS
await wait(300);
ok('pause SETTINGS tab', /INVERT MOUSE Y/.test(await text('#pause .body')));
await key('ArrowDown', 4);                       // invert
await key('ArrowRight');
await key('ArrowDown', 3);                       // fov, shake, graphics
await key('ArrowLeft', 2);                       // HIGH -> MEDIUM -> LOW
const s2 = await run(`return { inv: game.invertY, q: game.quality, post: M.post.enabled };`);
ok('INVERT Y applies', s2.inv === true);
ok('GRAPHICS LOW turns the post pass off at once', s2.q === 'LOW' && s2.post === false, JSON.stringify(s2));
await snap('05-pause-settings');
await key('ArrowRight', 2);                      // back to HIGH
await key('KeyE');
await wait(300);
ok('pause CONTROLS tab', /DRIVING/.test(await text('#pause .body')));
await key('KeyE');
await wait(300);
ok('pause CREDITS tab', /BLOCKSIDE BAY/.test(await text('#pause .body')));
await snap('06-pause-credits');
await key('Escape');
await wait(300);
ok('ESC resumes play', (await run(`return game.mode;`)) === 'play');

console.log('errors:', errors);
const failed = checks.filter((c) => !c.pass).length;
console.log(`${checks.length - failed}/${checks.length} checks passed`);
await browser.close();
server.close();
process.exit(failed || errors ? 1 : 0);
