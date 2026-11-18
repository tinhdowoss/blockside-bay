// BLOCKSIDE BAY save-slot test: serves game/, starts a new game from the real title screen, saves to
// slot 1 (SLOT 2 in the UI is index 1), scrambles the run, loads slot 1 back and checks the state
// round-trips. Also checks a legacy v1 record is migrated, garbage is ignored, and slot cards list it.
// Usage: PW_DIR=/path/with/node_modules node tools/playtest-save.mjs
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const gameDir = join(root, 'game');
const require = createRequire(join(resolve(process.env.PW_DIR || root), 'package.json'));
const { chromium } = require('playwright-core');

const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = join(gameDir, p === '/' ? 'index.html' : p);
  if (!f.startsWith(gameDir) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
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
await page.waitForTimeout(1500);

const result = await page.evaluate(async () => {
  const save = await import('/src/core/save.js');
  const { game } = await import('/src/core/state.js');
  const { player } = await import('/src/gameplay/player.js');
  const checks = [];
  const ok = (name, cond, info = '') => checks.push({ name, pass: !!cond, info });

  game.cash = 12345; game.rep = 777; game.missionsDone = ['m1']; game.stats.playSeconds = 321; game.weapons.smg = true;
  const px = player.x, pz = player.z;
  const rec = save.saveGame(1);
  ok('saveGame returns v2 record', rec.v === save.SAVE_VERSION && rec.v === 2, `v=${rec.v}`);
  ok('slot 1 stored', !!localStorage.getItem('blockside-bay-save-1'));
  ok('game.slot set to 1', game.slot === 1);

  game.cash = 1; game.rep = 0; game.missionsDone = []; game.stats.playSeconds = 0; game.weapons.smg = false;
  const pos = save.loadGame(1);
  ok('loadGame returns position', pos && Math.abs(pos.x - px) < 1e-6 && Math.abs(pos.z - pz) < 1e-6, JSON.stringify(pos));
  ok('cash restored', game.cash === 12345, game.cash);
  ok('rep restored', game.rep === 777, game.rep);
  ok('missions restored', game.missionsDone.join() === 'm1', game.missionsDone.join());
  ok('playSeconds restored', game.stats.playSeconds === 321, game.stats.playSeconds);
  ok('weapons restored', game.weapons.smg === true);

  const s1 = save.listSlots()[1].data;
  ok('slot card metadata', s1 && s1.cash === 12345 && s1.rep === 777 && s1.playSeconds === 321 && typeof s1.chapter === 'string' && typeof s1.pct === 'number' && typeof s1.place === 'string', JSON.stringify({ chapter: s1?.chapter, pct: s1?.pct, place: s1?.place }));
  ok('latestSlot is slot 1', save.latestSlot()?.slot === 1);

  localStorage.setItem('blockside-bay-save-2', JSON.stringify({ v: 1, savedAt: 5, cash: 900, health: 80, armor: 0, weapons: {}, ammo: {}, clip: {}, weapon: 1, missionsDone: [], stats: { playSeconds: 60 }, skills: {}, x: 10, z: 20, pct: 3, place: 'Old Town' }));
  const legacy = save.readSlot(2);
  ok('v1 save migrated', legacy && legacy.v === 2 && legacy.playSeconds === 60 && legacy.rep === 0 && legacy.chapter.length > 0, JSON.stringify(legacy && { v: legacy.v, rep: legacy.rep, chapter: legacy.chapter }));
  localStorage.setItem('blockside-bay-save-2', '{not json');
  ok('corrupt slot reads as empty', save.readSlot(2) === null);
  localStorage.setItem('blockside-bay-save-2', JSON.stringify({ v: 99, cash: 1 }));
  ok('future-version slot reads as empty', save.readSlot(2) === null);
  save.deleteSlot(2);
  ok('deleteSlot clears', localStorage.getItem('blockside-bay-save-2') === null);
  ok('out-of-range slot ignored', save.readSlot(7) === null && save.loadGame(-1) === null);
  return checks;
});

let failed = 0;
for (const c of result) { if (!c.pass) failed++; console.log(c.pass ? 'PASS' : 'FAIL', c.name, c.info); }
console.log('errors:', errors);
console.log(failed || errors ? 'SAVE TEST FAILED' : 'SAVE TEST OK');
await browser.close();
server.close();
process.exit(failed || errors ? 1 : 0);
