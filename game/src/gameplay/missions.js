// Mission runner: start markers, stage objectives, timers, enemy squads, rewards, pass/fail.
import { MISSIONS, HINTS } from '../data/missions-data.js';
import { WEAPONS } from '../core/config.js';
import { city, collideCircle } from '../world/city.js';
import { makeMarker } from '../world/models.js';
import { Vehicle } from './vehicles.js';
import { player } from './player.js';
import { police, setWanted } from './police.js';
import { spawnShooter, shooters, clearShooters } from './combat.js';
import { say, clearDialogue } from '../ui/dialogue.js';
import { sky, setHour } from '../world/daylight.js';
import { game, emit, addCash, bumpSkill } from '../core/state.js';
import { CAST } from '../data/cast.js';
import { rand } from '../core/rng.js';

export const ms = { def: null, stage: -1, timer: 0, enemies: [], target: null, vehicle: null, failT: 0 };
let scene, startMarker, goalMarker;

export function setupMissions(sc) {
  scene = sc;
  startMarker = makeMarker('#ffd23f');
  goalMarker = makeMarker('#ff5fa2');
  scene.add(startMarker, goalMarker);
  startMarker.visible = goalMarker.visible = false;
}

export const nextMission = () => MISSIONS.find((m) => !game.missionsDone.includes(m.id)) || null;
const lm = (key) => (typeof key === 'string' ? city.landmarks[key] : key);

export function startMission(def, stage = 0) {
  ms.def = def;
  ms.timer = 0;
  game.activeMission = def.id;
  if (def.night) setHour(21.5);
  emit('missionStart', def);
  emit('banner', { top: `CHAPTER ${def.chapter}`, title: def.title, color: '#ffd23f' });
  enterStage(stage);
}

function enterStage(i) {
  ms.stage = i;
  const st = ms.def.stages[i];
  ms.timer = st.timer || 0;
  ms.target = st.at ? lm(st.at) : null;
  for (const [who, text] of st.say || []) say(who, text);
  if (st.type === 'wanted') { setWanted(Math.max(police.level, st.level)); }
  if (st.type === 'steal' && st.spawn) {
    const p = lm(st.spawn);
    const v = new Vehicle(st.model, p.x + 6, p.z, Math.PI / 2);
    v.keep = true;
    ms.vehicle = v;
  }
  if (st.type === 'eliminate') spawnSquad(st);
}

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
    const c = CAST[st.boss];
    ms.enemies.push(spawnShooter(q.x, q.z, st.gang, { boss: true, name: c.name, tag: 'mission', look: { skin: c.skin, shirt: c.shirt, hair: c.hair, shades: true } }));
  }
}

function stageDone() {
  const def = ms.def;
  if (ms.stage + 1 < def.stages.length) { enterStage(ms.stage + 1); emit('objective'); return; }
  passMission();
}

function passMission() {
  const def = ms.def;
  game.missionsDone.push(def.id);
  addCash(def.reward);
  if (def.unlock) {
    const w = WEAPONS.find((q) => q.id === def.unlock);
    game.weapons[def.unlock] = true;
    game.ammo[def.unlock] = (game.ammo[def.unlock] || 0) + w.clip * 5;
    game.clip[def.unlock] = w.clip;
    emit('toast', { text: `${w.name} UNLOCKED`, color: '#ffd23f' });
  }
  if (def.ammo) for (const k in def.ammo) game.ammo[k] += def.ammo[k];
  if (def.armor) game.armor = Math.max(game.armor, def.armor);
  bumpSkill('driving', 0.05); bumpSkill('shooting', 0.04);
  emit('banner', { top: 'MISSION PASSED', title: `+$${def.reward.toLocaleString()}`, color: '#7cff6b' });
  emit('missionPassed', def);
  endMission();
}

export function failMission(reason) {
  if (!ms.def) return;
  emit('banner', { top: 'MISSION FAILED', title: reason, color: '#ff4f6b' });
  endMission();
}

function endMission() {
  clearShooters((s) => s.tag === 'mission' && !s.alive);
  for (const s of shooters) if (s.tag === 'mission') s.tag = null;
  if (ms.vehicle && ms.vehicle.driver !== 'player') ms.vehicle.keep = false;
  ms.def = null; ms.stage = -1; ms.enemies = []; ms.vehicle = null; ms.target = null;
  game.activeMission = null;
  clearDialogue();
}

function near(p, r) { return p && Math.hypot(player.x - p.x, player.z - p.z) < r; }

export function updateMissions(dt, t) {
  const def = ms.def;
  if (!def) {
    const nm = nextMission();
    goalMarker.visible = false;
    if (nm && game.mode === 'play') {
      const p = lm(nm.start);
      startMarker.visible = true;
      startMarker.position.set(p.x, 0, p.z);
      if (near(p, 3.5) && (!player.vehicle || player.vehicle.speed < 8)) startMission(nm);
    } else startMarker.visible = false;
    animateMarker(startMarker, t);
    return;
  }
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
      if (ok && near(goal, 8)) { player.vehicle.controls.handbrake = true; stageDone(); }
      break;
    }
    case 'steal': {
      if (ms.vehicle && !ms.vehicle.wrecked) goal = ms.vehicle;
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
  if (goal) goalMarker.position.set(goal.x, goal.isShooter ? 0 : 0, goal.z);
  ms.goal = goal;
  animateMarker(goalMarker, t);
}

function animateMarker(m, t) {
  m.userData.chev.position.y = 7.2 + Math.sin(t * 3) * 0.4;
  m.userData.chev.rotation.y = t * 2;
  // The beam pulses gently and thins out when the player stands right next to it.
  const d = Math.hypot(m.position.x - player.x, m.position.z - player.z);
  if (m.userData.beam) m.userData.beam.material.opacity = (0.35 + 0.15 * Math.sin(t * 2.4)) * Math.min(1, 0.25 + d / 30);
  if (m.userData.pool) m.userData.pool.scale.setScalar(1 + 0.12 * Math.sin(t * 3));
}

// What the HUD mission panel shows.
export function objectiveInfo() {
  const def = ms.def;
  if (!def) {
    const nm = nextMission();
    if (!nm) return { chapter: 0, title: 'THE BAY IS YOURS', text: 'Free roam - all 9 story missions complete', idle: true, hint: 'Steal, race and raise hell - the city is open' };
    return {
      chapter: nm.chapter, title: nm.title, text: `Go to ${lm(nm.start).name} to start`, idle: true,
      next: `${CAST[nm.giver].name.split(' ')[0]} has the job  ·  pays $${nm.reward.toLocaleString('en-US')}`, hint: 'Follow the yellow marker on the minimap',
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

export function missionGoal() { return ms.def ? ms.goal : (nextMission() ? lm(nextMission().start) : null); }
void sky;
