// BLOCKSIDE BAY story play-test: serves game/, starts a new game from the real title screen and plays
// all 9 story missions in order through the mission code. Each mission is started by walking onto its
// yellow start marker; objectives are fast-forwarded with the game's own APIs (placePlayer, the F key to
// steal, moving the car to the drop-off, damageCharacter on the squad, the police cool-down sequence).
// Chapter 1 mission 2 is failed once on purpose (player taken down) and retried from the failed card
// with ENTER. Checks the results card (time, cash, rep, accuracy, stars evaded, medal), rewards and
// unlocks, the save round trip of best times, and 0 console/page errors.
// Usage: PW_DIR=/path/with/node_modules node tools/playtest-story.mjs [--out /tmp/story]
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
const out = outIdx > 0 ? resolve(process.argv[outIdx + 1]) : '/tmp/blockside-story';
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
const M = `const M = { mis: await import('/src/gameplay/missions.js'), data: await import('/src/data/missions-data.js'), city: (await import('/src/world/city.js')).city,
  veh: await import('/src/gameplay/vehicles.js'), jack: await import('/src/gameplay/carjack.js'), state: await import('/src/core/state.js'),
  pl: await import('/src/gameplay/player.js'), pol: await import('/src/gameplay/police.js'), combat: await import('/src/gameplay/combat.js'), save: await import('/src/core/save.js') };
  const { player } = M.pl, { ms } = M.mis, { game } = M.state;`;
const run = (body, arg) => page.evaluate(new Function('arg', `return (async () => { ${M} ${body} })();`), arg);

// Walk onto the next mission's start marker and let the mission code start it.
async function startNext() {
  const id = await run(`
    if (player.vehicle) M.jack.exitVehicle();
    M.pol.clearWanted();
    const nm = M.mis.nextMission(); const p = M.city.landmarks[nm.start];
    M.pl.placePlayer(p.x + 9, p.z, 0); return nm.id;`);
  await wait(250);
  const early = await run(`return !!ms.def;`);
  if (early) ok(`${id}: did not start before reaching the marker`, false);
  await run(`const p = M.city.landmarks[M.mis.nextMission().start]; M.pl.placePlayer(p.x, p.z, 0);`);
  await wait(400);
  const active = await run(`return ms.def && ms.def.id;`);
  return { id, active };
}

// Fast-forward the current stage with the game's own APIs. Returns the stage type handled.
async function advance() {
  const st = await run(`
    if (!ms.def) return null;
    const st = ms.def.stages[ms.stage];
    const T = st.at ? M.city.landmarks[st.at] : null;
    const moveCar = (x, z) => { const v = player.vehicle; v.x = x; v.z = z; v.vx = v.vz = 0; v.speed = 0; v.sync(); player.x = x; player.z = z; };
    switch (st.type) {
      case 'goto': if (player.vehicle) moveCar(T.x, T.z); else M.pl.placePlayer(T.x, T.z, 0); break;
      case 'pickup': if (player.vehicle) M.jack.exitVehicle(); M.pl.placePlayer(T.x, T.z, 0); break;
      case 'steal': {
        if (player.vehicle) M.jack.exitVehicle();
        const v = ms.vehicle || ms.goal || M.veh.nearestVehicle(player.x, player.z, 9999, (c) => !c.wrecked && (!st.model || c.model === st.model));
        M.pl.placePlayer(v.x + 2.5, v.z, 0); window.__stealTarget = v.model; break;
      }
      case 'drive': {
        if (!player.vehicle || (st.needModel && player.vehicle.model !== st.needModel)) { const v = ms.vehicle; M.pl.placePlayer(v.x, v.z, 0); M.jack.stealVehicle(v, true); }
        moveCar(T.x, T.z); break;
      }
      case 'eliminate': for (const e of ms.enemies) if (e.alive) M.combat.damageCharacter(e, 999, true, player.x, player.z); break;
      case 'lose': {
        // The same sequence police.js runs when the player stays out of sight: a star at a time, then lostCops.
        const { police } = M.pol;
        while (police.level > 0) { police.level--; M.state.emit('wanted', police.level); }
        M.state.emit('lostCops'); M.pol.clearWanted(); break;
      }
      default: break;
    }
    return st.type;`);
  if (st === 'steal') { await page.keyboard.press('KeyF'); }
  await wait(350);
  return st;
}

const resultsText = () => page.evaluate(() => { const r = document.getElementById('results'); return r && r.classList.contains('show') ? r.innerText.replace(/\s+/g, ' ') : ''; });

let failedOnce = false;
for (let n = 0; n < 9; n++) {
  const { id, active } = await startNext();
  ok(`${id}: starts from its marker`, active === id);
  const stages = await run(`return ms.def ? ms.def.stages.length : 0;`);
  ok(`${id}: has 2-4 stages`, stages >= 2 && stages <= 4, `(${stages})`);
  const panel = await page.evaluate(() => ({ next: document.querySelector('#mission .m-next span')?.textContent, tip: document.querySelector('#mission .m-hint span')?.textContent }));
  ok(`${id}: HUD shows NEXT and TIP`, panel.next && panel.tip, JSON.stringify(panel));
  if (id === 'pink' && !failedOnce) {
    // Fail path: taken down mid-mission, respawn, then ENTER on the failed card retries.
    failedOnce = true;
    await advance();
    await run(`M.combat.hurtPlayer(9999, player.x, player.z);`);
    await wait(600);
    const failCard = await resultsText();
    ok('pink: failed card after being taken down', /MISSION FAILED/.test(failCard) && /RETRY/.test(failCard), failCard.slice(0, 90));
    await snap('fail-card');
    await page.waitForFunction(() => window.__bb.game.mode === 'play', null, { timeout: 8000 });
    await page.keyboard.press('Enter');
    await wait(400);
    const retried = await run(`return { id: ms.def && ms.def.id, stage: ms.stage };`);
    ok('pink: ENTER retries from stage 1', retried.id === 'pink' && retried.stage === 0, JSON.stringify(retried));
  }
  let guard = 0;
  while (guard++ < 12 && await run(`return !!ms.def;`)) await advance();
  const r = await run(`return { done: game.missionsDone.includes(arg), last: ms.last && { medal: ms.last.medal, time: Math.round(ms.last.time), cash: ms.last.cash, rep: ms.last.rep, evaded: ms.last.evaded } };`, id);
  ok(`${id}: passed`, r.done, JSON.stringify(r.last));
  await wait(400);
  ok(`${id}: next job waits for the player to come back to its marker`, !(await run(`return !!ms.def;`)));
  const card = await resultsText();
  ok(`${id}: results card (time, cash, rep, accuracy, stars evaded)`, ['MISSION PASSED', 'TIME', 'CASH', 'STREET REP', 'ACCURACY', 'STARS EVADED'].every((k) => card.includes(k)));
  if (n === 0 || id === 'pit' || id === 'lastlight') await snap(`pass-${id}`);
  await page.keyboard.press('Enter');
  await wait(300);
  const outro = await page.evaluate(() => document.getElementById('dialogue').style.display !== 'none');
  ok(`${id}: outro dialogue after closing the card`, outro);
}

const end = await run(`return { done: game.missionsDone.length, weapons: Object.keys(game.weapons).filter((k) => game.weapons[k]), best: Object.keys(game.missionBest || {}).length, info: M.mis.objectiveInfo().title };`);
ok('all 9 missions done', end.done === 9, JSON.stringify(end));
ok('weapon unlocks granted (smg, lance, pump)', ['smg', 'lance', 'pump'].every((w) => end.weapons.includes(w)), end.weapons.join(','));
ok('best times recorded for every mission', end.best === 9);
ok('HUD free-roam after the story', end.info === 'THE BAY IS YOURS');
const saved = await run(`M.save.saveGame(1); const d = M.save.readSlot(1); return Object.keys(d.missionBest || {}).length;`);
ok('best times survive a save', saved === 9);
await snap('free-roam');

console.log('errors:', errors);
const failed = checks.filter((c) => !c.pass).length;
console.log(`${checks.length - failed}/${checks.length} checks passed`);
await browser.close();
server.close();
process.exit(failed || errors ? 1 : 0);
