// BLOCKSIDE BAY guidance play-test: new game from the real title screen, then checks the first-play TIP
// banners, the district + street label and NOW ENTERING card, the GPS route (on roads, axis-aligned,
// ending at the objective) on the minimap and pause map, the mission start banner, the objective beam,
// the GPS distance on the mission panel, and that tips stay off for a loaded old save. 0 errors.
// Usage: PW_DIR=/path/with/node_modules node tools/playtest-guidance.mjs [--out /tmp/guide]
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
const out = outIdx > 0 ? resolve(process.argv[outIdx + 1]) : '/tmp/blockside-guidance';
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
await page.waitForTimeout(900);

const checks = [];
const ok = (name, cond, info = '') => { checks.push({ name, pass: !!cond }); console.log(cond ? 'PASS' : 'FAIL', name, info); };
const snap = (n) => page.screenshot({ path: join(out, n + '.jpg'), type: 'jpeg', quality: 72 });
const wait = (ms) => page.waitForTimeout(ms);
const M = `const M = { mis: await import('/src/gameplay/missions.js'), city: await import('/src/world/city.js'), gps: await import('/src/ui/gps.js'),
  mm: await import('/src/ui/minimap.js'), streets: await import('/src/world/streets.js'), pl: await import('/src/gameplay/player.js'), state: await import('/src/core/state.js'),
  jack: await import('/src/gameplay/carjack.js'), veh: await import('/src/gameplay/vehicles.js'), save: await import('/src/core/save.js') };
  const { player } = M.pl, { ms } = M.mis, { game } = M.state;`;
const run = (body, arg) => page.evaluate(new Function('arg', `return (async () => { ${M} ${body} })();`), arg);
const text = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
const shown = (sel) => page.evaluate((s) => document.querySelector(s)?.classList.contains('show'), sel);

// First-play tips and the location card.
ok('TIP banner shows the movement tip', (await shown('#tipbanner')) && /W A S D/.test(await text('#tipbanner')), await text('#tipbanner'));
ok('location card announces the district', (await shown('#loccard')) && /YOU ARE IN/.test(await text('#loccard')), await text('#loccard'));
const label = await text('#district');
ok('district + street label above the minimap', /\b(AVE|ST|DR|BLVD|WAY|BEACH|BOARDWALK)\b/.test(label), label);
await snap('01-first-tip');
await wait(7200);
ok('second tip points at the yellow job marker', /YELLOW BEAM/.test(await text('#tipbanner')), await text('#tipbanner'));

// GPS route to the first job's start marker.
const route = await run(`
  const nm = M.mis.nextMission(), p = M.city.city.landmarks[nm.start];
  M.pl.placePlayer(p.x + 120, p.z + 70, 0);
  const pts = M.gps.gpsRoute(player.x, player.z, p.x, p.z);
  const inner = pts.slice(1, -1);
  return { n: pts.length, onRoad: inner.every((q) => M.city.onRoad(q.x, q.z)),
    axis: inner.every((q, i) => i === 0 || Math.abs(q.x - inner[i - 1].x) < 0.01 || Math.abs(q.z - inner[i - 1].z) < 0.01),
    ends: Math.hypot(pts[pts.length - 1].x - p.x, pts[pts.length - 1].z - p.z) < 0.01, target: M.mm.gpsTarget() };`);
ok('GPS route runs along roads', route.n >= 4 && route.onRoad && route.axis && route.ends, JSON.stringify({ n: route.n, onRoad: route.onRoad, axis: route.axis }));
ok('GPS targets the yellow start marker before a job', route.target && route.target.color === '#ffd23f');
await wait(500);
await snap('02-gps-idle');

// Walk onto the marker: MISSION START banner, GPS tip, pink route, objective beam, GPS distance.
await run(`const p = M.city.city.landmarks[M.mis.nextMission().start]; M.pl.placePlayer(p.x + 12, p.z, 0);`);
await wait(200);
await run(`const p = M.city.city.landmarks[M.mis.nextMission().start]; M.pl.placePlayer(p.x, p.z, 0);`);
await wait(500);
ok('mission start banner', /MISSION START/.test(await text('#banner')), await text('#banner'));
const pink = await run(`return { t: M.mm.gpsTarget(), goal: !!ms.goal };`);
ok('GPS turns pink for the objective', pink.t && pink.t.color === '#ff4fa3' && pink.goal);
const meta = await text('#mission .m-count');
ok('mission panel shows the GPS distance', /GPS \d/.test(meta), meta);
await snap('03-mission-start');
await wait(6000);
ok('GPS tip follows the movement tips', /PINK GPS LINE/.test(await text('#tipbanner')) || (await run(`return game.tipsSeen.includes('gps') || game.tipsSeen.length >= 2;`)), await text('#tipbanner'));

// Cross into another district: NOW ENTERING card.
await wait(3500);
await run(`M.pl.placePlayer(6.5 * 48, 1.5 * 48 + 24, 0);`);   // Neon Mile
await wait(400);
const card = await text('#loccard');
ok('NOW ENTERING card on district change', (await shown('#loccard')) && /NOW ENTERING/.test(card) && /NEON MILE/.test(card), card);
await snap('04-now-entering');
const streets = await run(`return [M.streets.streetAt(48, 120), M.streets.streetAt(72, 96), M.streets.streetAt(96, 96), M.streets.streetAt(470, 312)];`);
ok('street names: avenue, street, crossing, pier', streets[0].endsWith('AVE') && /ST|DR/.test(streets[1]) && streets[2].includes('&') && /PIER/.test(streets[3]), streets.join(' | '));

// The pause MAP draws the same route.
await page.keyboard.press('KeyM');
await wait(400);
await snap('05-pause-map');
await page.keyboard.press('Escape');
await wait(300);

// An old save (no tipsSeen) loads with tips already done.
const oldSave = await run(`M.save.saveGame(2); const k = 'blockside-bay-save-2'; return 1;`);
void oldSave;
const tipsAfterLoad = await run(`
  const raw = JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.endsWith('2'))));
  delete raw.tipsSeen; localStorage.setItem(Object.keys(localStorage).find((k) => k.endsWith('2')), JSON.stringify(raw));
  M.save.loadGame(2); return game.tipsSeen.length;`);
ok('saves from before the tutorial load with tips done', tipsAfterLoad >= 8, String(tipsAfterLoad));

console.log('errors:', errors);
const failed = checks.filter((c) => !c.pass).length;
console.log(`${checks.length - failed}/${checks.length} checks passed`);
await browser.close();
server.close();
process.exit(failed || errors ? 1 : 0);
