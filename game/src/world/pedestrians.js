// Pedestrians: walk the sidewalk loops around blocks; gunfire makes the nearest duck and cover their heads
// before bolting, everyone else runs; speeding cars send them diving clear; cars knock them down.
import { CELL, GRID_N, ROAD_W } from '../core/config.js';
import { makeCharacter, animateCharacter } from './models.js';
import { collideCircle } from './city.js';
import { rand, pick, irange } from '../core/rng.js';
import { emit, on } from '../core/state.js';
import { blood } from '../fx/effects.js';

const THREE = window.THREE;
export const peds = [];
let scene;
const TARGET = 34;

const SKINS = ['#f1c7a0', '#e0a77a', '#c98a5e', '#a8714c', '#8d5a3b', '#6b4430'];
const SHIRTS = ['#ff5fa2', '#2ee6c8', '#ffd23f', '#ffffff', '#7a5cff', '#ff7a3d', '#3fd0ff', '#9dff8a', '#ff3f6b'];
const PANTS = ['#1f2a4a', '#f4f4f4', '#3a3a3a', '#7a5a3a', '#2f8dff', '#ffb3d1'];
const HAIR = ['#1a0f0a', '#3a2010', '#e8c070', '#a03a1a', '#111111', 'none'];

export function setupPedestrians(sc) {
  scene = sc;
  on('gunshot', (p) => panic(p.x, p.z, 30, 0.35));
  on('crime', (p) => panic(p.x, p.z, 16));
  on('explosion', (p) => panic(p.x, p.z, 35));
}

// Sidewalk loop rectangle of a block (1.5 units inside the curb).
function loopOf(bx, bz) {
  const x0 = bx * CELL + ROAD_W / 2 + 1.5, z0 = bz * CELL + ROAD_W / 2 + 1.5;
  const s = CELL - ROAD_W - 3;
  return { x0, z0, s };
}
function pointOnLoop(L, t) {
  const p = ((t % 4) + 4) % 4, k = Math.floor(p), f = p - k;
  if (k === 0) return { x: L.x0 + f * L.s, z: L.z0 };
  if (k === 1) return { x: L.x0 + L.s, z: L.z0 + f * L.s };
  if (k === 2) return { x: L.x0 + L.s - f * L.s, z: L.z0 + L.s };
  return { x: L.x0, z: L.z0 + L.s - f * L.s };
}

export function spawnPed(bx, bz, t, opts = {}) {
  const look = {
    skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIR), shoes: pick(['#222222', '#ffffff', '#ff5fa2']),
    hat: rand() < 0.2 ? pick(['#ffffff', '#ffd23f', '#2ee6c8']) : null, shades: rand() < 0.3, ...opts.look,
  };
  const model = makeCharacter(look);
  scene.add(model);
  const L = loopOf(bx, bz);
  const p = pointOnLoop(L, t);
  const ped = {
    model, loop: L, t, dir: rand() < 0.5 ? 1 : -1, speed: 1.3 + rand() * 0.8,
    x: p.x, z: p.z, yaw: 0, phase: rand() * 6, state: 'walk', fleeT: 0, fx: 0, fz: 0, health: 40, deadT: 0, isPed: true,
  };
  peds.push(ped);
  return ped;
}

export function populatePeds(px, pz, n = TARGET) {
  for (let k = 0; k < n; k++) {
    const bx = Math.max(0, Math.min(GRID_N - 1, Math.floor(px / CELL) + irange(-2, 2)));
    const bz = Math.max(0, Math.min(GRID_N - 1, Math.floor(pz / CELL) + irange(-2, 2)));
    spawnPed(bx, bz, rand() * 4);
  }
}

function panic(x, z, radius, cower = 0) {
  for (const p of peds) {
    if (p.state === 'dead') continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < radius) {
      p.fx = (p.x - x) / (d || 1); p.fz = (p.z - z) / (d || 1);
      if (p.state === 'cower') continue;
      // Close to the shots some freeze and cover their heads for a moment, then run.
      if (d < radius * 0.5 && rand() < cower) { p.state = 'cower'; p.fleeT = 1.5 + rand() * 2; }
      else { p.state = 'flee'; p.fleeT = 6 + rand() * 4; }
      if (rand() < 0.3) emit('scream', p);
    }
  }
}

export function knockDown(p, fromX, fromZ, cause = 'car') {
  if (p.state === 'dead') return;
  p.state = 'dead';
  p.deadT = 0;
  p.fallDir = Math.atan2(p.x - fromX, p.z - fromZ);
  blood(p.x, 1, p.z, 10);
  emit('pedDown', { ped: p, cause });
}

export function removePed(p) {
  scene.remove(p.model);
  const i = peds.indexOf(p);
  if (i >= 0) peds.splice(i, 1);
}

export function updatePeds(dt, px, pz, vehicles) {
  for (let i = peds.length - 1; i >= 0; i--) {
    const p = peds[i];
    const far = Math.hypot(p.x - px, p.z - pz);
    if (far > 140 && !p.keep) { removePed(p); continue; }
    if (p.state === 'dead') {
      p.deadT += dt;
      const fall = Math.min(1, p.deadT * 4);
      p.model.rotation.set(0, p.fallDir, 0);
      p.model.rotateX(fall * Math.PI / 2);
      p.model.position.y = 0.2 * fall;
      if (p.deadT > 25 && !p.keep) removePed(p);
      continue;
    }
    let mx = Math.sin(p.yaw), mz = Math.cos(p.yaw), spd = 0;
    if (p.state === 'cower') {
      p.fleeT -= dt;
      if (p.fleeT <= 0) { p.state = 'flee'; p.fleeT = 5 + rand() * 3; }
    }
    if (p.state === 'flee') {
      p.fleeT -= dt;
      spd = 6.5; mx = p.fx; mz = p.fz;
      if (p.fleeT <= 0) { p.state = 'walk'; p.t = nearestT(p); }
    }
    if (p.state === 'walk') {
      let q = pointOnLoop(p.loop, p.t);
      if (Math.hypot(q.x - p.x, q.z - p.z) < 0.6) {
        p.t += (p.dir * p.speed * dt) / p.loop.s;
        q = pointOnLoop(p.loop, p.t);
      }
      mx = q.x - p.x; mz = q.z - p.z;
      const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l;
      spd = p.speed;
      const step = Math.min(l, spd * dt * (l > 0.6 ? 1.6 : 1));
      p.x += mx * step; p.z += mz * step;
    } else if (p.state === 'flee') {
      p.x += mx * spd * dt; p.z += mz * spd * dt;
      const r = collideCircle(p.x, p.z, 0.45);
      if (r.hit) { p.fx = p.fx * 0.3 + r.nx; p.fz = p.fz * 0.3 + r.nz; const l = Math.hypot(p.fx, p.fz) || 1; p.fx /= l; p.fz /= l; }
      p.x = r.x; p.z = r.z;
    }
    // Cars hitting pedestrians
    for (const v of vehicles) {
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d < v.spec.len * 0.48 && v.speed > 5) { knockDown(p, v.x, v.z); if (v.driver === 'player') emit('crime', { x: p.x, z: p.z, kind: 'runover' }); break; }
      // A fast car (the player's or a cop with sirens) bearing down: jump clear, sideways to its path.
      if (d < 10 && v.speed > 9 && p.state === 'walk' && (v.driver === 'player' || v.siren)) {
        const ux = v.vx / v.speed, uz = v.vz / v.speed;
        if ((p.x - v.x) * ux + (p.z - v.z) * uz > 0) {
          const side = (p.x - v.x) * uz - (p.z - v.z) * ux > 0 ? 1 : -1;
          p.state = 'flee'; p.fleeT = 2.5; p.fx = uz * side; p.fz = -ux * side;
        }
      }
    }
    if (p.state === 'dead') continue;
    if (p.state !== 'cower') p.yaw = Math.atan2(mx, mz);
    p.phase += spd * dt * 1.7;
    p.spd = spd;
    posePed(p);
  }
  if (peds.length < TARGET) {
    const bx = Math.max(0, Math.min(GRID_N - 1, Math.floor(px / CELL) + irange(-2, 2)));
    const bz = Math.max(0, Math.min(GRID_N - 1, Math.floor(pz / CELL) + irange(-2, 2)));
    const L = loopOf(bx, bz), t = rand() * 4, q = pointOnLoop(L, t);
    if (Math.hypot(q.x - px, q.z - pz) > 45) spawnPed(bx, bz, t);
  }
}

// Puts a pedestrian's model where the simulation says, in the pose for its state.
export function posePed(p) {
  const m = p.model, parts = m.userData.parts;
  m.position.set(p.x, 0, p.z);
  m.rotation.set(0, p.yaw, 0);
  animateCharacter(m, p.phase, Math.min(1, (p.spd ?? p.speed) / 4), false);
  if (p.state === 'flee') { parts.armL.rotation.x = -2.6; parts.armR.rotation.x = -2.4 + Math.sin(p.phase * 2) * 0.3; }
  if (p.state === 'cower') {
    // Crouched with both hands over the head.
    m.position.y = -0.38;
    parts.legL.rotation.x = parts.legR.rotation.x = -1.25;
    parts.armL.rotation.x = parts.armR.rotation.x = -2.9;
    parts.armL.rotation.z = 0.5; parts.armR.rotation.z = -0.5;
  } else { parts.armL.rotation.z = 0; parts.armR.rotation.z = 0; }
}

function nearestT(p) {
  const bx = Math.max(0, Math.min(GRID_N - 1, Math.floor(p.x / CELL)));
  const bz = Math.max(0, Math.min(GRID_N - 1, Math.floor(p.z / CELL)));
  p.loop = loopOf(bx, bz);
  let best = 0, bd = 1e9;
  for (let t = 0; t < 4; t += 0.05) {
    const q = pointOnLoop(p.loop, t);
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

export const _v = new THREE.Vector3();
