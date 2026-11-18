// Driving jobs.
//   PALOMAR CAB (taxi): in any yellow Palomar cab press G to go on duty. A fare waves from a curb
//     somewhere nearby; stop next to them, they hop in and name a destination with a meter running.
//     Fast drops earn tips; a fare whose meter runs out storms off unpaid. Fares keep coming (with a
//     streak bonus) until you press G again or leave the cab.
//   BAYLINK PARCEL (courier): at the depot in Little Caracol press G in any vehicle to take three
//     parcels; each drop has its own clock, the whole run pays a bonus.
import { CELL, GRID_N, ROAD_W, WALK_W } from '../core/config.js';
import { TAXI, COURIER, SITES } from '../data/activities-data.js';
import { makeMarker, makeCharacter, animateCharacter, fadeMarker } from '../world/models.js';
import { colorBoxes } from '../world/voxel.js';
import { city } from '../world/city.js';
import { player } from './player.js';
import { addRep } from './progression.js';
import { game, emit, addCash, bumpSkill } from '../core/state.js';
import { rand, pick } from '../core/rng.js';

const THREE = window.THREE;
export const job = { kind: null, stage: null, spot: null, timer: 0, total: 0, streak: 0, drops: 0, earned: 0, passenger: null, dist: 0 };
let scene, marker, parcel;
const NAMES = ['Dolores', 'Javi', 'Marisol', 'Teo', 'Gloria', 'Benny', 'Lucia', 'Rafa', 'Nina', 'Oscar', 'Paz', 'Tito'];
const LOOKS = ['#ff5fa2', '#2ee6c8', '#ffd23f', '#7a5cff', '#ff7a3d', '#ffffff', '#3fa0ff'];

export function setupJobs(sc) {
  scene = sc;
  marker = makeMarker('#5dff6a');
  marker.visible = false;
  scene.add(marker);
  parcel = colorBoxes([[0, 0, 0, 0.9, 0.7, 0.9, '#c8915a'], [0, 0.36, 0, 0.92, 0.04, 0.2, '#ffffff'], [0, 0.36, 0, 0.2, 0.04, 0.92, '#ffffff']], new THREE.MeshLambertMaterial({ vertexColors: true }));
  parcel.visible = false;
  scene.add(parcel);
}

// A random curb: sidewalk point (where people stand) and the road lane beside it (where cars stop).
export function curbSpot(minD = 90, maxD = 260, fromX = player.x, fromZ = player.z) {
  const H = ROAD_W / 2, size = CELL - ROAD_W;
  for (let tries = 0; tries < 80; tries++) {
    const bx = Math.floor(rand() * GRID_N), bz = Math.floor(rand() * GRID_N), side = Math.floor(rand() * 4);
    const x0 = bx * CELL + H, z0 = bz * CELL + H, t = 8 + rand() * (size - 16), w = WALK_W / 2;
    const walk = [[x0 + t, z0 + w], [x0 + size - w, z0 + t], [x0 + t, z0 + size - w], [x0 + w, z0 + t]][side];
    const n = [[0, -1], [1, 0], [0, 1], [-1, 0]][side];
    const d = Math.hypot(walk[0] - fromX, walk[1] - fromZ);
    if (d < minD || d > maxD) continue;
    return { x: walk[0], z: walk[1], cx: walk[0] + n[0] * 4, cz: walk[1] + n[1] * 4, yaw: Math.atan2(n[0], n[1]), d };
  }
  return { x: fromX + 100, z: fromZ, cx: fromX + 100, cz: fromZ, yaw: 0, d: 100 };
}

const nearCurb = (s, v) => Math.hypot(v.x - s.cx, v.z - s.cz) < 7 || Math.hypot(v.x - s.x, v.z - s.z) < 6;
const placeMarker = (s) => { marker.visible = true; marker.position.set(s.cx, 0, s.cz); };

function newFare() {
  job.stage = 'pickup';
  job.spot = curbSpot(60, 220);
  job.timer = 0;
  const look = { shirt: pick(LOOKS), skin: pick(['#f1c7a3', '#c98a5e', '#8d5a3b', '#5a3a28', '#e0ac7e']), hair: pick(['#2a1a12', '#d9b45a', '#6a3a1a', '#111111']), hat: rand() < 0.3 ? pick(LOOKS) : null };
  const m = makeCharacter(look);
  m.position.set(job.spot.x, 0, job.spot.z);
  m.rotation.y = job.spot.yaw;
  scene.add(m);
  job.passenger = { model: m, name: pick(NAMES) };
  placeMarker(job.spot);
}

export function startTaxi() {
  Object.assign(job, { kind: 'taxi', streak: 0, earned: 0 });
  emit('banner', { top: 'PALOMAR CAB CO.', title: 'ON DUTY', color: '#ffd23f' });
  newFare();
}

export function startCourier() {
  Object.assign(job, { kind: 'courier', drops: 0, earned: 0 });
  emit('banner', { top: 'BAYLINK PARCEL', title: 'PARCEL RUN', color: '#5dff6a' });
  nextDrop();
}

function nextDrop() {
  job.stage = 'drop';
  job.spot = curbSpot(100, 240);
  job.total = job.timer = Math.round(job.spot.d / 13 + 22);
  placeMarker(job.spot);
  parcel.visible = true;
  parcel.position.set(job.spot.x, 0.4, job.spot.z);
}

function clearPassenger() {
  if (job.passenger) { scene.remove(job.passenger.model); job.passenger = null; }
}

export function endJob(msg) {
  if (job.kind === 'taxi' && job.earned) emit('toast', { text: `SHIFT OVER  ·  EARNED $${job.earned.toLocaleString('en-US')}`, color: '#ffd23f' });
  else if (msg) emit('toast', { text: msg, color: '#ff8a5c' });
  clearPassenger();
  job.kind = null; job.stage = null;
  marker.visible = false; parcel.visible = false;
}

function pay(n, why, color) {
  addCash(n);
  job.earned += n;
  game.side.earned += n;
  emit('popup', { text: `+$${n}  ${why}`, x: player.x, y: 3, z: player.z, color, big: true });
}

// Returns null while running, { fail } or { done } when the job ends.
export function updateJobs(dt, t) {
  if (!job.kind) return null;
  const v = player.vehicle;
  if (!v || v.wrecked) { const k = job.kind; endJob(k === 'taxi' ? null : 'PARCEL RUN ABANDONED'); return { fail: k === 'taxi' ? 'OFF DUTY' : 'YOU LEFT THE VAN' }; }
  if (job.kind === 'taxi' && !v.spec.taxi) { endJob(); return { fail: 'NOT A CAB' }; }
  marker.userData.chev.position.y = 7.2 + Math.sin(t * 3) * 0.4;
  fadeMarker(marker, Math.hypot(v.x - marker.position.x, v.z - marker.position.z));
  const stopped = v.speed < 3;
  if (job.kind === 'taxi') {
    const p = job.passenger;
    if (job.stage === 'pickup') {
      if (p) { animateCharacter(p.model, t * 6, 0.15); p.model.userData.parts.armR.rotation.x = -2.6 + Math.sin(t * 8) * 0.3; }
      if (nearCurb(job.spot, v) && stopped) {
        clearPassenger();
        job.stage = 'ride';
        const from = { x: v.x, z: v.z };
        // Half the fares want a landmark, the rest a random address.
        const lms = Object.values(city.landmarks).filter((l) => l.name && Math.hypot(l.x - from.x, l.z - from.z) > 110);
        if (rand() < 0.5 && lms.length) { const l = pick(lms); job.spot = { ...curbSpot(0, 40, l.x, l.z), name: l.name }; }
        else job.spot = { ...curbSpot(110, 280), name: null };
        job.dist = Math.hypot(job.spot.cx - from.x, job.spot.cz - from.z);
        job.total = job.timer = Math.round(job.dist / 12 + 18);
        job.fareName = p ? p.name : 'Fare';
        placeMarker(job.spot);
        emit('door');
        emit('toast', { text: `${job.fareName.toUpperCase()}: "${job.spot.name ? `${job.spot.name}, please` : 'Just drive, I will tell you where'}!"`, color: '#ffd23f' });
      }
    } else if (job.stage === 'ride') {
      job.timer -= dt;
      if (job.timer <= 0) {
        job.streak = 0;
        emit('toast', { text: `${job.fareName.toUpperCase()} GOT OUT  ·  NO FARE`, color: '#ff8a5c' });
        newFare();
        return null;
      }
      if (nearCurb(job.spot, v) && stopped) {
        job.streak++;
        const fare = Math.round(TAXI.base + job.dist * TAXI.perUnit);
        const tip = Math.round(job.timer * TAXI.tipPerSec);
        const streak = job.streak >= 3 ? 50 * Math.min(5, job.streak - 2) : 0;
        pay(fare + tip + streak, `FARE${tip ? ` + $${tip} TIP` : ''}${streak ? `  ·  STREAK x${job.streak}` : ''}`, '#ffd23f');
        game.side.fares++;
        addRep(TAXI.rep + Math.min(30, job.streak * 3), 'FARE');
        bumpSkill('driving', 0.01);
        emit('checkpoint', { last: true });
        emit('activityDone', { kind: 'taxi', pay: fare + tip + streak });
        emit('door');
        newFare();
      }
    }
  } else if (job.kind === 'courier') {
    job.timer -= dt;
    parcel.rotation.y = t * 1.5;
    parcel.position.y = 0.5 + Math.sin(t * 3) * 0.12;
    if (job.timer <= 0) { endJob(`PARCEL LATE  ·  ${job.drops}/${COURIER.drops} DELIVERED`); return { fail: 'OUT OF TIME' }; }
    if (nearCurb(job.spot, v) && stopped) {
      job.drops++;
      game.side.parcels++;
      const quick = Math.round(job.timer * 6);
      pay(COURIER.perDrop + quick, `DELIVERED${quick ? ` + $${quick} EARLY` : ''}`, '#5dff6a');
      emit('checkpoint', { last: job.drops >= COURIER.drops });
      if (job.drops >= COURIER.drops) {
        pay(COURIER.bonus, 'RUN BONUS', '#5dff6a');
        game.side.runs++;
        addRep(COURIER.rep * 2, 'COURIER');
        emit('banner', { top: 'BAYLINK PARCEL', title: 'RUN COMPLETE', color: '#5dff6a' });
        emit('activityDone', { kind: 'courier', pay: job.earned });
        const earned = job.earned;
        job.earned = 0;
        endJob();
        emit('toast', { text: `RUN PAID $${earned.toLocaleString('en-US')}`, color: '#5dff6a' });
        return { done: true };
      }
      addRep(COURIER.rep, 'DROP');
      nextDrop();
    }
  }
  return null;
}

export function jobInfo() {
  if (!job.kind) return null;
  if (job.kind === 'taxi') {
    const ride = job.stage === 'ride';
    return {
      title: 'PALOMAR CAB', tag: `ON DUTY  ·  STREAK ${job.streak}`, color: '#ffd23f',
      text: ride ? `Drop ${job.fareName} at ${job.spot.name || 'the green marker'}` : 'Pick up the fare waving at the green marker',
      big: ride ? `${Math.ceil(job.timer)}s` : '', frac: ride ? job.timer / job.total : 0,
      meta: `SHIFT $${job.earned.toLocaleString('en-US')}  ·  G: GO OFF DUTY`, metaColor: '#ffe9a8', target: { x: job.spot.cx, z: job.spot.cz },
    };
  }
  return {
    title: 'BAYLINK PARCEL', tag: `DROP ${job.drops + 1} OF ${COURIER.drops}`, color: '#5dff6a',
    text: 'Deliver the parcel to the green marker', big: `${Math.ceil(job.timer)}s`, frac: job.timer / job.total,
    meta: `RUN $${job.earned.toLocaleString('en-US')}  ·  BONUS $${COURIER.bonus} FOR ALL ${COURIER.drops}`, metaColor: '#ffe9a8', target: { x: job.spot.cx, z: job.spot.cz },
  };
}

export const depot = SITES.find((s) => s.kind === 'courier');
