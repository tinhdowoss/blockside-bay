// Street races: time trials through junction checkpoints with a 3-2-1 countdown, a running clock,
// split popups and bronze / silver / gold medal times. Start by stopping a car in a race start marker
// (chequered arch) and pressing G. Leaving the car, wrecking it or taking more than twice the bronze
// time ends the race. Pays cash and street rep; best times and medals are saved.
import { CELL } from '../core/config.js';
import { RACES, medalTimes, RACE_PAY, RACE_REP } from '../data/activities-data.js';
import { makeMarker, fadeMarker } from '../world/models.js';
import { player } from './player.js';
import { addRep } from './progression.js';
import { game, emit, addCash, bumpSkill } from '../core/state.js';

export const race = { def: null, cp: 0, t: 0, countdown: 0, splits: [] };
let gate, nextGate;

export const raceStart = (r) => ({ x: r.start[0] * CELL, z: r.start[1] * CELL });
const cpPos = (r, k) => ({ x: r.cps[k][0] * CELL, z: r.cps[k][1] * CELL });
export const fmtTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

export function setupRaces(scene) {
  gate = makeMarker('#3fe8ff');
  gate.scale.set(2.6, 1, 2.6);
  nextGate = makeMarker('#3fe8ff');
  nextGate.scale.set(1.4, 0.6, 1.4);
  scene.add(gate, nextGate);
  gate.visible = nextGate.visible = false;
}

export function startRace(def) {
  Object.assign(race, { def, cp: 0, t: 0, countdown: 3.2, splits: [] });
  const m = medalTimes(def);
  emit('banner', { top: 'STREET RACE', title: def.name, color: '#3fe8ff' });
  emit('toast', { text: `GOLD ${fmtTime(m.gold)}  ·  SILVER ${fmtTime(m.silver)}  ·  BRONZE ${fmtTime(m.bronze)}`, color: '#3fe8ff' });
}

export function endRace() {
  race.def = null;
  gate.visible = nextGate.visible = false;
}

function finish() {
  const def = race.def, t = race.t, m = medalTimes(def);
  const medal = t <= m.gold ? 'gold' : t <= m.silver ? 'silver' : t <= m.bronze ? 'bronze' : 'none';
  const side = game.side;
  const prevBest = side.raceBest[def.id];
  const firstGold = medal === 'gold' && side.raceMedal[def.id] !== 'gold';
  if (!prevBest || t < prevBest) side.raceBest[def.id] = Math.round(t * 10) / 10;
  const rank = { none: 0, bronze: 1, silver: 2, gold: 3 };
  if (rank[medal] > rank[side.raceMedal[def.id] || 'none']) side.raceMedal[def.id] = medal;
  side.races++;
  const pay = RACE_PAY[medal] + (firstGold ? 1000 : 0);
  addCash(pay);
  side.earned += pay;
  addRep(RACE_REP[medal], 'RACE');
  bumpSkill('driving', 0.03);
  const label = medal === 'none' ? 'FINISHED' : `${medal.toUpperCase()} MEDAL`;
  emit('banner', { top: `${def.name}  ·  ${fmtTime(t)}`, title: label, color: { gold: '#ffd23f', silver: '#e0e8ff', bronze: '#ff9a5c', none: '#ffffff' }[medal] });
  emit('toast', { text: `+$${pay.toLocaleString('en-US')}${firstGold ? '  ·  FIRST GOLD BONUS' : ''}${!prevBest || t < prevBest ? '  ·  NEW BEST' : ''}`, color: '#5dff6a' });
  emit('activityDone', { kind: 'race', id: def.id, medal, time: t, pay });
  endRace();
  return { done: true };
}

// Returns null while running, or { fail: reason } / { done: true }.
export function updateRace(dt, t) {
  const def = race.def;
  if (!def) return null;
  const v = player.vehicle;
  if (!v || v.wrecked) { endRace(); return { fail: v ? 'CAR WRECKED' : 'YOU LEFT THE CAR' }; }
  const target = cpPos(def, race.cp);
  gate.visible = true;
  gate.position.set(target.x, 0, target.z);
  gate.userData.chev.position.y = 7.2 + Math.sin(t * 3) * 0.4;
  fadeMarker(gate, Math.hypot(v.x - target.x, v.z - target.z));
  if (race.cp + 1 < def.cps.length) { const n = cpPos(def, race.cp + 1); nextGate.visible = true; nextGate.position.set(n.x, 0, n.z); } else nextGate.visible = false;
  if (race.countdown > 0) {
    // Hold the car on the line until GO.
    const before = Math.ceil(race.countdown);
    race.countdown -= dt;
    v.vx *= 0.5; v.vz *= 0.5;
    const now = Math.ceil(race.countdown);
    if (now !== before) emit('countdown', now > 0 ? now : 0);
    return null;
  }
  race.t += dt;
  const m = medalTimes(def);
  if (race.t > m.bronze * 2) { endRace(); return { fail: 'TOO SLOW' }; }
  if (Math.hypot(v.x - target.x, v.z - target.z) < 11) {
    race.splits.push(race.t);
    race.cp++;
    const last = race.cp >= def.cps.length;
    emit('checkpoint', { last });
    if (last) return finish();
    emit('popup', { text: `CHECKPOINT ${race.cp}/${def.cps.length}  ${fmtTime(race.t)}`, x: v.x, y: 3, z: v.z, color: '#3fe8ff' });
  }
  return null;
}

export function raceInfo() {
  const def = race.def;
  if (!def) return null;
  const m = medalTimes(def);
  const next = race.t <= m.gold ? ['GOLD', m.gold, '#ffd23f'] : race.t <= m.silver ? ['SILVER', m.silver, '#e0e8ff'] : ['BRONZE', m.bronze, '#ff9a5c'];
  return {
    title: def.name, tag: 'STREET RACE', color: '#3fe8ff',
    text: race.countdown > 0 ? 'Get ready...' : race.cp + 1 >= def.cps.length ? 'Final checkpoint - floor it!' : `Checkpoint ${race.cp + 1} of ${def.cps.length}`,
    big: fmtTime(race.t), frac: race.cp / def.cps.length,
    meta: `${next[0]} ${fmtTime(next[1])}${game.side.raceBest[def.id] ? `  ·  BEST ${fmtTime(game.side.raceBest[def.id])}` : ''}`, metaColor: next[2],
    target: cpPos(def, race.cp),
  };
}

export { RACES };
