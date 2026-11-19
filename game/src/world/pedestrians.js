// PEDESTRIANS — the people on the sidewalks around the player.
//
// Each walks a rectangular loop 1.5 units inside the curb of one block. Gunfire, crimes and
// explosions make the people nearby flee (close to gunfire some first cower, hands over their
// heads); a fast car bearing down sends walkers diving sideways; a car that hits one knocks them
// down. The crowd is topped back up to TARGET out of the player's sight and thinned out far away.
import { CELL, GRID_N, ROAD_W } from '../core/config.js';
import { makeCharacter, animateCharacter } from './models.js';
import { collideCircle } from './city.js';
import { rand, pick, irange } from '../core/rng.js';
import { emit, on } from '../core/state.js';
import { blood } from '../fx/effects.js';

/** Every live or fallen pedestrian. */
export const peds = [];
let scene;
const TARGET = 34;         // crowd size kept around the player
const DESPAWN_DIST = 140;  // pedestrians further away than this are removed
const FLEE_SPEED = 6.5;

const SKINS = ['#f1c7a0', '#e0a77a', '#c98a5e', '#a8714c', '#8d5a3b', '#6b4430'];
const SHIRTS = ['#ff5fa2', '#2ee6c8', '#ffd23f', '#ffffff', '#7a5cff', '#ff7a3d', '#3fd0ff', '#9dff8a', '#ff3f6b'];
const PANTS = ['#1f2a4a', '#f4f4f4', '#3a3a3a', '#7a5a3a', '#2f8dff', '#ffb3d1'];
const HAIR = ['#1a0f0a', '#3a2010', '#e8c070', '#a03a1a', '#111111', 'none'];
const SHOES = ['#222222', '#ffffff', '#ff5fa2'];
const HATS = ['#ffffff', '#ffd23f', '#2ee6c8'];

/** Keeps the scene and makes the crowd react to gunshots, crimes and explosions. */
export function setupPedestrians(sc) {
  scene = sc;
  on('gunshot', (e) => panic(e.x, e.z, 30, 0.35));
  on('crime', (e) => panic(e.x, e.z, 16));
  on('explosion', (e) => panic(e.x, e.z, 35));
}

// ---- Sidewalk loops ----------------------------------------------------------------------

const clampBlock = (b) => Math.max(0, Math.min(GRID_N - 1, b));

// Sidewalk loop rectangle of block (bx, bz): corner (x0, z0) and side length s.
function loopOf(bx, bz) {
  const x0 = bx * CELL + ROAD_W / 2 + 1.5, z0 = bz * CELL + ROAD_W / 2 + 1.5;
  const s = CELL - ROAD_W - 3;
  return { x0, z0, s };
}

// Point at loop position t (0-4, one unit per side, wrapping) on loop L.
function pointOnLoop(L, t) {
  const pos = ((t % 4) + 4) % 4, side = Math.floor(pos), f = pos - side;
  if (side === 0) return { x: L.x0 + f * L.s, z: L.z0 };
  if (side === 1) return { x: L.x0 + L.s, z: L.z0 + f * L.s };
  if (side === 2) return { x: L.x0 + L.s - f * L.s, z: L.z0 + L.s };
  return { x: L.x0, z: L.z0 + L.s - f * L.s };
}

// A random block within two of the one containing (x, z), clamped to the grid.
function blockNear(x, z) {
  const bx = clampBlock(Math.floor(x / CELL) + irange(-2, 2));
  const bz = clampBlock(Math.floor(z / CELL) + irange(-2, 2));
  return { bx, bz };
}

// Moves a pedestrian onto the loop of the block they are standing in and returns the loop
// position closest to them (sampled every 0.05).
function rejoinLoop(p) {
  p.loop = loopOf(clampBlock(Math.floor(p.x / CELL)), clampBlock(Math.floor(p.z / CELL)));
  let best = 0, bestDist = 1e9;
  for (let t = 0; t < 4; t += 0.05) {
    const q = pointOnLoop(p.loop, t);
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bestDist) { bestDist = d; best = t; }
  }
  return best;
}

// ---- Spawning and removal ----------------------------------------------------------------

/** Spawns a randomly dressed pedestrian at loop position t of block (bx, bz); opts.look overrides. */
export function spawnPed(bx, bz, t, opts = {}) {
  const look = {
    skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIR), shoes: pick(SHOES),
    hat: rand() < 0.2 ? pick(HATS) : null, shades: rand() < 0.3, ...opts.look,
  };
  const model = makeCharacter(look);
  scene.add(model);
  const loop = loopOf(bx, bz);
  const start = pointOnLoop(loop, t);
  const ped = {
    model, loop, t, dir: rand() < 0.5 ? 1 : -1, speed: 1.3 + rand() * 0.8,
    x: start.x, z: start.z, yaw: 0, phase: rand() * 6, state: 'walk', fleeT: 0, fx: 0, fz: 0, health: 40, deadT: 0, isPed: true,
  };
  peds.push(ped);
  return ped;
}

/** Fills the blocks around (px, pz) with n pedestrians at once (game start). */
export function populatePeds(px, pz, n = TARGET) {
  for (let k = 0; k < n; k++) {
    const { bx, bz } = blockNear(px, pz);
    spawnPed(bx, bz, rand() * 4);
  }
}

/** Removes a pedestrian from the scene and the crowd. */
export function removePed(p) {
  scene.remove(p.model);
  const i = peds.indexOf(p);
  if (i >= 0) peds.splice(i, 1);
}

// ---- Reactions ---------------------------------------------------------------------------

// Everyone alive within `radius` of (x, z) turns away from it and runs; within half the radius a
// `cower` share first freeze and cover their heads.
function panic(x, z, radius, cower = 0) {
  for (const p of peds) {
    if (p.state === 'dead') continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d >= radius) continue;
    p.fx = (p.x - x) / (d || 1); p.fz = (p.z - z) / (d || 1);
    if (p.state === 'cower') continue;
    if (d < radius * 0.5 && rand() < cower) { p.state = 'cower'; p.fleeT = 1.5 + rand() * 2; }
    else { p.state = 'flee'; p.fleeT = 6 + rand() * 4; }
    if (rand() < 0.3) emit('scream', p);
  }
}

/** Knocks a pedestrian down, falling away from (fromX, fromZ), and reports it as 'pedDown'. */
export function knockDown(p, fromX, fromZ, cause = 'car') {
  if (p.state === 'dead') return;
  p.state = 'dead';
  p.deadT = 0;
  p.fallDir = Math.atan2(p.x - fromX, p.z - fromZ);
  blood(p.x, 1, p.z, 10);
  emit('pedDown', { ped: p, cause });
}

// ---- Update ------------------------------------------------------------------------------

/** Steps every pedestrian (walk, cower, flee, fall), car hits and dives, and tops up the crowd. */
export function updatePeds(dt, px, pz, vehicles) {
  for (let i = peds.length - 1; i >= 0; i--) {
    const p = peds[i];
    if (Math.hypot(p.x - px, p.z - pz) > DESPAWN_DIST && !p.keep) { removePed(p); continue; }
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
      spd = FLEE_SPEED; mx = p.fx; mz = p.fz;
      if (p.fleeT <= 0) { p.state = 'walk'; p.t = rejoinLoop(p); }
    }
    if (p.state === 'walk') {
      // Head for the current loop point, advancing it once close; catch up quicker when far.
      let q = pointOnLoop(p.loop, p.t);
      if (Math.hypot(q.x - p.x, q.z - p.z) < 0.6) {
        p.t += (p.dir * p.speed * dt) / p.loop.s;
        q = pointOnLoop(p.loop, p.t);
      }
      mx = q.x - p.x; mz = q.z - p.z;
      const gap = Math.hypot(mx, mz) || 1; mx /= gap; mz /= gap;
      spd = p.speed;
      const step = Math.min(gap, spd * dt * (gap > 0.6 ? 1.6 : 1));
      p.x += mx * step; p.z += mz * step;
    } else if (p.state === 'flee') {
      p.x += mx * spd * dt; p.z += mz * spd * dt;
      const hit = collideCircle(p.x, p.z, 0.45);
      if (hit.hit) {
        // Glance off walls instead of running into them.
        p.fx = p.fx * 0.3 + hit.nx; p.fz = p.fz * 0.3 + hit.nz;
        const len = Math.hypot(p.fx, p.fz) || 1; p.fx /= len; p.fz /= len;
      }
      p.x = hit.x; p.z = hit.z;
    }
    for (const v of vehicles) {
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d < v.spec.len * 0.48 && v.speed > 5) {
        knockDown(p, v.x, v.z);
        if (v.driver === 'player') emit('crime', { x: p.x, z: p.z, kind: 'runover' });
        break;
      }
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
    // One new pedestrian per frame, only where the player won't see them appear.
    const { bx, bz } = blockNear(px, pz);
    const t = rand() * 4, q = pointOnLoop(loopOf(bx, bz), t);
    if (Math.hypot(q.x - px, q.z - pz) > 45) spawnPed(bx, bz, t);
  }
}

/** Puts a pedestrian's model where the simulation says, in the pose for its state. */
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
