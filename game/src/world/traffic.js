// Civilian traffic: cars follow the right-hand lane of the road grid, turn at junctions and brake for obstacles.
import { CELL, GRID_N, TRAFFIC_MODELS } from '../core/config.js';
import { nodePos, nodeNeighbors, nearestNode } from './city.js';
import { Vehicle, vehicles } from '../gameplay/vehicles.js';
import { rand, pick, irange } from '../core/rng.js';
import { emit } from '../core/state.js';
import { signalAt } from './furniture.js';

const LANE = 3;
const TARGET_COUNT = 24;
const SPAWN_MIN = 70, SPAWN_MAX = 160, DESPAWN = 210;

// Put a traffic car on the lane between two neighbouring nodes at fraction f.
export function spawnTrafficOn(from, to, f, model, color) {
  const a = nodePos(from.i, from.j), b = nodePos(to.i, to.j);
  const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
  const x = a.x + (b.x - a.x) * f - dz * LANE, z = a.z + (b.z - a.z) * f + dx * LANE;
  const v = new Vehicle(model || pick(TRAFFIC_MODELS), x, z, Math.atan2(dx, dz), color);
  v.driver = 'traffic';
  v.ai = { from, to, cruise: 13 + rand() * 6, blocked: 0, honk: 0 };
  const sp = v.ai.cruise * 0.8;
  v.vx = Math.sin(v.heading) * sp; v.vz = Math.cos(v.heading) * sp;
  return v;
}

function randomEdgeNear(px, pz) {
  for (let tries = 0; tries < 20; tries++) {
    const from = { i: irange(0, GRID_N), j: irange(0, GRID_N) };
    const p = nodePos(from.i, from.j);
    const d = Math.hypot(p.x - px, p.z - pz);
    if (d < SPAWN_MIN || d > SPAWN_MAX) continue;
    const to = pick(nodeNeighbors(from.i, from.j));
    return { from, to };
  }
  return null;
}

export function populateTraffic(px, pz, count = TARGET_COUNT) {
  for (let k = 0; k < count; k++) {
    const e = randomEdgeNear(px, pz);
    if (e) spawnTrafficOn(e.from, e.to, 0.2 + rand() * 0.6);
  }
}

// Traffic near a point (screenshot staging / mission scenes), spawned on nearby edges.
export function populateTrafficAround(px, pz, n) {
  const c = nearestNode(px, pz);
  for (let k = 0; k < n; k++) {
    const from = { i: Math.max(0, Math.min(GRID_N, c.i + irange(-2, 2))), j: Math.max(0, Math.min(GRID_N, c.j + irange(-2, 2))) };
    spawnTrafficOn(from, pick(nodeNeighbors(from.i, from.j)), 0.15 + rand() * 0.7);
  }
}

function chooseNext(ai) {
  const opts = nodeNeighbors(ai.to.i, ai.to.j).filter((n) => !(n.i === ai.from.i && n.j === ai.from.j));
  const straight = opts.find((n) => n.i - ai.to.i === ai.to.i - ai.from.i && n.j - ai.to.j === ai.to.j - ai.from.j);
  const next = straight && rand() < 0.55 ? straight : pick(opts);
  ai.from = ai.to;
  ai.to = next;
}

export function driveTraffic(v, dt, actors) {
  const ai = v.ai;
  const a = nodePos(ai.from.i, ai.from.j), b = nodePos(ai.to.i, ai.to.j);
  const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
  const lx = -dz * LANE, lz = dx * LANE;
  // Progress along the segment
  const along = (v.x - a.x) * dx + (v.z - a.z) * dz;
  const segLen = CELL;
  if (along > segLen - 4) { chooseNext(ai); return; }
  const look = Math.min(segLen - 2, along + 9);
  const tx = a.x + dx * look + lx, tz = a.z + dz * look + lz;
  let want = Math.atan2(tx - v.x, tz - v.z);
  let diff = Math.atan2(Math.sin(want - v.heading), Math.cos(want - v.heading));
  const c = v.controls;
  c.steer = Math.max(-1, Math.min(1, -diff * 2.2));
  c.handbrake = false;
  let limit = ai.cruise * (Math.abs(diff) > 0.4 ? 0.55 : 1);
  // Traffic signals: stop at the line on red (and on amber if there is room to stop).
  const toNode = segLen - along;
  if (toNode > 7.5 && toNode < 26) {
    const st = signalAt(ai.to.i, ai.to.j, dx ? 'x' : 'z');
    if (st === 'red' || (st === 'amber' && toNode > 13)) limit = Math.min(limit, Math.max(0, (toNode - 9) * 1.3));
  }
  // Obstacles straight ahead: other cars, the player, pedestrians in the road
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  let blockedBy = null;
  for (const o of actors) {
    if (o === v) continue;
    const ox = o.x - v.x, oz = o.z - v.z;
    const ahead = ox * fx + oz * fz;
    if (ahead < 1 || ahead > 11) continue;
    const lat = Math.abs(ox * fz - oz * fx);
    if (lat < 2.2) { limit = Math.min(limit, (ahead - 4) * 1.6); blockedBy = o; }
  }
  const fs = v.forwardSpeed;
  c.throttle = fs < limit ? 0.7 : 0;
  c.brake = fs > limit + 1.5 ? 1 : 0;
  if (limit <= 0.5 && fs < 1) { c.brake = 0; c.throttle = 0; }
  if (blockedBy && blockedBy.isPlayer) {
    ai.blocked += dt;
    if (ai.blocked > 2.5 && ai.honk <= 0) { emit('honk', v); ai.honk = 4; }
  } else ai.blocked = 0;
  ai.honk -= dt;
}

export function updateTraffic(dt, px, pz, actors) {
  let count = 0;
  for (let i = vehicles.length - 1; i >= 0; i--) {
    const v = vehicles[i];
    if (v.driver !== 'traffic') continue;
    const d = Math.hypot(v.x - px, v.z - pz);
    if (d > DESPAWN) { v.remove(); continue; }
    count++;
    driveTraffic(v, dt, actors);
  }
  // Abandoned / wrecked cars far away get cleaned up too.
  for (let i = vehicles.length - 1; i >= 0; i--) {
    const v = vehicles[i];
    if (!v.driver && !v.keep && Math.hypot(v.x - px, v.z - pz) > DESPAWN + 40) v.remove();
  }
  if (count < TARGET_COUNT) {
    const e = randomEdgeNear(px, pz);
    if (e) spawnTrafficOn(e.from, e.to, 0.3 + rand() * 0.4);
  }
}
