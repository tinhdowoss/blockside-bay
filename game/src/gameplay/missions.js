// Mission runner: start markers, stage objectives, timers, enemy squads, rewards, pass/fail, retry and
// the per-run numbers (time, cash, rep, accuracy, stars evaded) shown on the results card.
// Mission content (stages, dialogue, rewards) lives in data/missions-data.js; this file only runs it.
import { MISSIONS, HINTS } from '../data/missions-data.js';
import { WEAPONS } from '../core/config.js';
import { city, collideCircle, snapToRoad } from '../world/city.js';
import { makeMarker, fadeMarker } from '../world/models.js';
import { Vehicle, nearestVehicle } from './vehicles.js';
import { player, placePlayer } from './player.js';
import { police, setWanted, clearWanted } from './police.js';
import { exitVehicle } from './carjack.js';
import { spawnShooter, shooters, clearShooters } from './combat.js';
import { say, clearDialogue } from '../ui/dialogue.js';
import { showPassed, showFailed, dismissResults, resultsOpen } from '../ui/results.js';
import { setHour } from '../world/daylight.js';
import { game, on, emit, addCash, bumpSkill } from '../core/state.js';
import { CAST } from '../data/cast.js';
import { repLevel } from './progression.js';
import { rand } from '../core/rng.js';

// The running mission: its definition, current stage, countdown, squad, target, mission car and run stats.
export const ms = { def: null, stage: -1, timer: 0, enemies: [], target: null, vehicle: null, goal: null, run: null, armed: true };
let scene, startMarker, goalMarker, seekT = 0;

/** Creates the yellow start and pink goal markers and the chase-tracking hooks. */
export function setupMissions(sc) {
  scene = sc;
  startMarker = makeMarker('#ffd23f');
  goalMarker = makeMarker('#ff5fa2');
  scene.add(startMarker, goalMarker);
  startMarker.visible = goalMarker.visible = false;
  // Stars evaded: the peak wanted level of each chase that ends with the cops losing the player.
  on('wanted', (n) => { if (ms.run) ms.run.peak = Math.max(ms.run.peak, n); });
  on('lostCops', () => { if (ms.run) { ms.run.evaded += ms.run.peak; ms.run.peak = 0; } });
}

/** The first story mission not yet passed, or null when the story is complete. */
export const nextMission = () => MISSIONS.find((m) => !game.missionsDone.includes(m.id)) || null;
// A landmark key ('diner') resolves to its city landmark; a position object passes through.
const lm = (key) => (typeof key === 'string' ? city.landmarks[key] : key);

/** Starts a mission (optionally at a later stage): snapshots run stats, banner, first objective. */
export function startMission(def, stage = 0) {
  dismissResults();
  ms.def = def;
  ms.timer = 0;
  const s = game.stats;
  ms.run = { time: 0, cash: game.cash, rep: game.rep || 0, shots: s.shots, hits: s.hits, headshots: s.headshots, peak: police.level, evaded: 0 };
  game.activeMission = def.id;
  if (def.night) setHour(21.5);
  emit('missionStart', def);
  emit('banner', { top: `CHAPTER ${def.chapter}  ·  MISSION START`, title: def.title, color: '#ffd23f' });
  enterStage(stage);
  emit('objective');
}

/** ENTER on the failed card (or a play-test): back to the mission's start marker and go again. */
export function retryMission(def) {
  if (ms.def || game.mode !== 'play') return;
  if (player.vehicle) exitVehicle();
  clearWanted();
  game.health = Math.max(game.health, 100);
  const p = lm(def.start);
  placePlayer(p.x, p.z, 0);
  startMission(def);
}

// Sets up stage i: its timer, target, dialogue, wanted level, mission car or enemy squad.
function enterStage(i) {
  ms.stage = i;
  const st = ms.def.stages[i];
  ms.timer = st.timer || 0;
  ms.target = st.at ? lm(st.at) : null;
  for (const [who, text] of st.say || []) say(who, text);
  if (st.type === 'wanted') setWanted(Math.max(police.level, st.level));
  if (st.type === 'steal' && st.spawn) {
    const p = lm(st.spawn);
    const v = new Vehicle(st.model, p.x + 6, p.z, Math.PI / 2);
    v.keep = true;
    ms.vehicle = v;
  } else if (st.type === 'steal' && st.model && !findModel(st.model, 160)) {
    // "Steal any X": make sure one is parked on a nearby street so the job never stalls.
    const r = snapToRoad(player.x + 36, player.z + 20);
    const v = new Vehicle(st.model, r.x + (r.axis === 'z' ? 3.5 : 0), r.z + (r.axis === 'x' ? 3.5 : 0), r.axis === 'z' ? 0 : Math.PI / 2);
    v.keep = true;
  }
  if (st.type === 'eliminate') spawnSquad(st);
}

// Nearest intact car of the given model within range that the player is not already driving.
const findModel = (model, range) => nearestVehicle(player.x, player.z, range, (v) => v.model === model && !v.wrecked && v.driver !== 'player');

// A ring of st.count gang members around the stage target, plus the boss if the stage names one.
function spawnSquad(st) {
  const p = lm(st.at);
  ms.enemies = [];
  const n = st.count;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rand() * 0.5, r = 7 + rand() * 7;
    const q = collideCircle(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 0.6);
    ms.enemies.push(spawnShooter(q.x, q.z, st.gang, { guard: 40, tag: 'mission' }));
  }
  if (st.boss) {
    const q = collideCircle(p.x + 3, p.z + 3, 0.6);
    const boss = CAST[st.boss];
    ms.enemies.push(spawnShooter(q.x, q.z, st.gang, { boss: true, name: boss.name, tag: 'mission', look: { skin: boss.skin, shirt: boss.shirt, hair: boss.hair, shades: true } }));
  }
}

function stageDone() {
  const def = ms.def;
  if (ms.stage + 1 < def.stages.length) {
    emit('stageClear', { def, stage: ms.stage });
    enterStage(ms.stage + 1);
    emit('objective');
    return;
  }
  passMission();
}

const medalFor = (time, par) => (time <= par ? 'GOLD' : time <= par * 1.5 ? 'SILVER' : 'BRONZE');

// Pays out (reward + gold bonus), unlocks weapons/ammo/armor, records the best run and shows the results card.
function passMission() {
  const def = ms.def, run = ms.run;
  game.missionsDone.push(def.id);
  const medal = medalFor(run.time, def.par || 300);
  const bonus = medal === 'GOLD' ? Math.round(def.reward * 0.1 / 50) * 50 : 0;
  addCash(def.reward + bonus);
  const news = [], lvBefore = repLevel().level;
  if (def.unlock) {
    const w = WEAPONS.find((q) => q.id === def.unlock);
    if (w) {
      game.weapons[def.unlock] = true;
      game.ammo[def.unlock] = (game.ammo[def.unlock] || 0) + w.clip * 5;
      game.clip[def.unlock] = w.clip;
      emit('toast', { text: `${w.name} UNLOCKED`, color: '#ffd23f' });
      news.push(`${w.name} UNLOCKED  ·  SLOT ${WEAPONS.indexOf(w) + 1}`);
    }
  }
  if (def.ammo) for (const k in def.ammo) game.ammo[k] = (game.ammo[k] || 0) + def.ammo[k];
  if (def.armor) game.armor = Math.max(game.armor, def.armor);
  bumpSkill('driving', 0.05); bumpSkill('shooting', 0.04);
  emit('banner', { top: 'MISSION PASSED', title: `+$${(def.reward + bonus).toLocaleString('en-US')}`, color: '#7cff6b' });
  emit('missionPassed', def);   // progression adds the story rep here
  const lv = repLevel();
  if (lv.level > lvBefore) news.push(`REP LEVEL ${lv.level}  ·  ${lv.title}`);
  if (def.armor) news.push('ARMOR TOPPED UP');
  const prev = (game.missionBest ||= {})[def.id];
  const best = !prev || run.time < prev.time;
  if (best) game.missionBest[def.id] = { time: Math.round(run.time), medal };
  const s = game.stats;
  const result = {
    def, medal, bonus, news, best: best && !!prev, time: run.time, cash: game.cash - run.cash, rep: (game.rep || 0) - run.rep,
    shots: s.shots - run.shots, hits: Math.min(s.hits - run.hits, s.shots - run.shots), headshots: s.headshots - run.headshots, evaded: run.evaded,
  };
  ms.last = result;
  endMission();
  showPassed(result);
}

/** Fails the running mission with a reason; anything but QUIT shows the failed card with a retry. */
export function failMission(reason) {
  if (!ms.def) return;
  const def = ms.def, stage = ms.stage, time = ms.run?.time || 0;
  // Taken down or cuffed: the FLATLINED / CUFFED screen already says it; the card follows on respawn.
  if (game.mode === 'play') emit('banner', { top: 'MISSION FAILED', title: reason, color: '#ff4f6b' });
  emit('missionFailed', { def, reason });
  endMission();
  ms.last = { def, reason, stage, time, failed: true };
  if (reason !== 'QUIT') showFailed(ms.last, retryMission);
}

// Clears mission state: dead squad members go, survivors become ordinary shooters, the car is released.
function endMission() {
  clearShooters((s) => s.tag === 'mission' && !s.alive);
  for (const s of shooters) if (s.tag === 'mission') s.tag = null;
  if (ms.vehicle && ms.vehicle.driver !== 'player') ms.vehicle.keep = false;
  ms.def = null; ms.stage = -1; ms.enemies = []; ms.vehicle = null; ms.target = null; ms.goal = null; ms.run = null; ms.armed = false;
  game.activeMission = null;
  clearDialogue();
}

function near(p, r) { return p && Math.hypot(player.x - p.x, player.z - p.z) < r; }

/** Per-frame: shows the next start marker when idle, otherwise runs the current stage's check. */
export function updateMissions(dt, t) {
  const def = ms.def;
  if (!def) {
    const upcoming = nextMission();
    goalMarker.visible = false;
    if (upcoming && game.mode === 'play') {
      const p = lm(upcoming.start);
      startMarker.visible = true;
      startMarker.position.set(p.x, 0, p.z);
      // Story jobs wait while a side activity (race, fare, parcel run) or a results card is up, and a
      // marker only arms once the player has stepped off it (a job can end on the next one's start).
      if (!near(p, 6)) ms.armed = true;
      if (ms.armed && near(p, 3.5) && (!player.vehicle || player.vehicle.speed < 8) && !game.sideBusy && !resultsOpen()) startMission(upcoming);
    } else startMarker.visible = false;
    animateMarker(startMarker, t);
    return;
  }
  ms.run.time += dt;
  startMarker.visible = false;
  const st = def.stages[ms.stage];
  if (st.timer) {
    ms.timer -= dt;
    if (ms.timer <= 0) { failMission(st.type === 'lose' ? 'THE YACHT SAILED WITHOUT YOU' : 'OUT OF TIME'); return; }
  }
  if (ms.vehicle && ms.vehicle.wrecked) { failMission('THE CAR WAS WRECKED'); return; }
  let goal = null;
  switch (st.type) {
    case 'goto': goal = ms.target; if (near(goal, player.vehicle ? 7 : 3.5)) stageDone(); break;
    case 'pickup': goal = ms.target; if (near(goal, 3) && !player.vehicle) { emit('toast', { text: 'PICKED UP', color: '#ffd23f' }); stageDone(); } break;
    case 'drive': {
      goal = ms.target;
      const ok = player.vehicle && (!st.needModel || player.vehicle.model === st.needModel);
      // Wrong car (or on foot): the marker points back at the car the job needs.
      if (!ok && st.needModel && ms.vehicle && !player.vehicle) goal = ms.vehicle;
      if (ok && near(goal, 8)) { player.vehicle.controls.handbrake = true; stageDone(); }
      break;
    }
    case 'steal': {
      if (ms.vehicle && !ms.vehicle.wrecked) goal = ms.vehicle;
      else if (st.model) {
        // Re-target the nearest matching car twice a second.
        seekT -= dt;
        if (seekT <= 0 || !ms.seek || ms.seek.wrecked) { ms.seek = findModel(st.model, 400); seekT = 0.5; }
        goal = ms.seek;
      }
      const v = player.vehicle;
      if (v && (!st.model || v.model === st.model)) { if (st.model) ms.vehicle = v; stageDone(); }
      break;
    }
    case 'wanted': stageDone(); break;
    case 'lose': if (police.level === 0) stageDone(); break;
    case 'eliminate': {
      const alive = ms.enemies.filter((e) => e.alive);
      if (alive.length) goal = alive.find((e) => e.boss) || alive[0];
      if (!alive.length) stageDone();
      break;
    }
    default: break;
  }
  goalMarker.visible = !!goal && st.type !== 'eliminate';
  if (goal) goalMarker.position.set(goal.x, 0, goal.z);
  ms.goal = goal;
  animateMarker(goalMarker, t);
}

function animateMarker(m, t) {
  m.userData.chev.position.y = 7.2 + Math.sin(t * 3) * 0.4;
  m.userData.chev.rotation.y = t * 2;
  // The beam pulses gently and thins out when the player stands right next to it.
  const d = Math.hypot(m.position.x - player.x, m.position.z - player.z);
  fadeMarker(m, d);
  if (m.userData.beam) m.userData.beam.material.opacity *= 0.85 + 0.15 * Math.sin(t * 2.4);
  if (m.userData.pool) m.userData.pool.scale.setScalar(1 + 0.12 * Math.sin(t * 3));
}

/** What the HUD mission panel shows: chapter, title, objective text, next step, hint, counters. */
export function objectiveInfo() {
  const def = ms.def;
  if (!def) {
    const upcoming = nextMission();
    if (!upcoming) return { chapter: 0, title: 'THE BAY IS YOURS', text: 'Free roam - all 9 story missions complete', idle: true, hint: 'Steal, race and raise hell - the city is open' };
    return {
      chapter: upcoming.chapter, title: upcoming.title, text: `Go to ${lm(upcoming.start).name} to start`, idle: true,
      next: `${CAST[upcoming.giver].name.split(' ')[0]} has the job  ·  pays $${upcoming.reward.toLocaleString('en-US')}`, hint: 'Follow the yellow marker on the minimap',
    };
  }
  const st = def.stages[ms.stage];
  const after = def.stages[ms.stage + 1];
  const info = {
    chapter: def.chapter, title: def.title, text: st.text, stage: ms.stage, stages: def.stages.length,
    next: after ? after.text : `Payday  ·  $${def.reward.toLocaleString('en-US')}`, hint: st.hint || HINTS[st.type],
  };
  if (st.type === 'eliminate') {
    const dead = ms.enemies.filter((e) => !e.alive).length;
    info.count = `${dead}/${ms.enemies.length}`;
    info.frac = dead / ms.enemies.length;
  }
  if (st.timer) { info.timer = ms.timer; info.frac = ms.timer / st.timer; }
  if (st.type === 'lose' && police.level) info.extra = police.seen ? 'SPOTTED' : 'HIDDEN';
  return info;
}

/** Where the GPS should point: the current stage goal, or the next mission's start marker. */
export function missionGoal() { return ms.def ? ms.goal : (nextMission() ? lm(nextMission().start) : null); }
