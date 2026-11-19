// Civilian traffic. Its one job: keep a ring of AI cars around the player that follow the right-hand lane
// of the road grid, turn at junctions, stop for red lights, brake for obstacles and honk at a player who
// blocks them; far-off traffic and abandoned cars are despawned and replaced near the player.
import { CELL, GRID_N, TRAFFIC_MODELS } from '../core/config.js';
import { nodePos, nodeNeighbors, nearestNode } from './city.js';
import { Vehicle, vehicles } from '../gameplay/vehicles.js';
import { rand, pick, irange } from '../core/rng.js';
import { emit } from '../core/state.js';
import { signalAt } from './furniture.js';

const LANE = 3;                      // lane centre offset from the road centre line
const TARGET_COUNT = 24;             // traffic cars kept alive around the player
const SPAWN_MIN = 70, SPAWN_MAX = 160, DESPAWN = 210;
const LOOK_AHEAD = 9;                // steering target distance along the lane
const SIGHT = 11, CAR_HALF_WIDTH = 2.2;

// Put a traffic car on the lane between two neighbouring nodes at fraction f (0..1) of the way along.
// `model` / `color` are optional (random traffic model, model's own colour). Returns the Vehicle.
export function spawnTrafficOn(from, to, f, model, color) {
  const a = nodePos(from.i, from.j), b = nodePos(to.i, to.j);
  const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
  const x = a.x + (b.x - a.x) * f - dz * LANE, z = a.z + (b.z - a.z) * f + dx * LANE;
  const v = new Vehicle(model || pick(TRAFFIC_MODELS), x, z, Math.atan2(dx, dz), color);
  v.driver = 'traffic';
  v.ai = { from, to, cruise: 13 + rand() * 6, blocked: 0, honk: 0 };
  const startSpeed = v.ai.cruise * 0.8;
  v.vx = Math.sin(v.heading) * startSpeed; v.vz = Math.cos(v.heading) * startSpeed;
  return v;
}

// A random road segment starting at a junction between SPAWN_MIN and SPAWN_MAX from (px, pz), or null.
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

// Fill the streets around (px, pz) with up to `count` cars at the normal spawn distance.
export function populateTraffic(px, pz, count = TARGET_COUNT) {
  for (let k = 0; k < count; k++) {
    const e = randomEdgeNear(px, pz);
    if (e) spawnTrafficOn(e.from, e.to, 0.2 + rand() * 0.6);
  }
}

// Traffic near a point (screenshot staging / mission scenes), spawned on edges within two junctions.
export function populateTrafficAround(px, pz, n) {
  const c = nearestNode(px, pz);
  const clampGrid = (v) => Math.max(0, Math.min(GRID_N, v));
  for (let k = 0; k < n; k++) {
    const from = { i: clampGrid(c.i + irange(-2, 2)), j: clampGrid(c.j + irange(-2, 2)) };
    spawnTrafficOn(from, pick(nodeNeighbors(from.i, from.j)), 0.15 + rand() * 0.7);
  }
}

// At the end of a segment pick the next one: straight on 55% of the time when possible, never a U-turn.
function chooseNext(ai) {
  const opts = nodeNeighbors(ai.to.i, ai.to.j).filter((n) => !(n.i === ai.from.i && n.j === ai.from.j));
  const straight = opts.find((n) => n.i - ai.to.i === ai.to.i - ai.from.i && n.j - ai.to.j === ai.to.j - ai.from.j);
  const next = straight && rand() < 0.55 ? straight : pick(opts);
  ai.from = ai.to;
  ai.to = next;
}

// One AI step for traffic car `v`: steer along its lane, obey the signal ahead and slow for anything in
// `actors` (cars, player, pedestrians: objects with x, z) in front of it.
export function driveTraffic(v, dt, actors) {
  const ai = v.ai;
  const a = nodePos(ai.from.i, ai.from.j), b = nodePos(ai.to.i, ai.to.j);
  const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
  const laneX = -dz * LANE, laneZ = dx * LANE;
  // Progress along the segment
  const along = (v.x - a.x) * dx + (v.z - a.z) * dz;
  const segLen = CELL;
  if (along > segLen - 4) { chooseNext(ai); return; }
  const look = Math.min(segLen - 2, along + LOOK_AHEAD);
  const targetX = a.x + dx * look + laneX, targetZ = a.z + dz * look + laneZ;
  const want = Math.atan2(targetX - v.x, targetZ - v.z);
  const diff = Math.atan2(Math.sin(want - v.heading), Math.cos(want - v.heading));
  const c = v.controls;
  c.steer = Math.max(-1, Math.min(1, -diff * 2.2));
  c.handbrake = false;
  let limit = ai.cruise * (Math.abs(diff) > 0.4 ? 0.55 : 1);
  // Traffic signals: stop at the line on red (and on amber if there is room to stop).
  const toNode = segLen - along;
  if (toNode > 7.5 && toNode < 26) {
    const signal = signalAt(ai.to.i, ai.to.j, dx ? 'x' : 'z');
    if (signal === 'red' || (signal === 'amber' && toNode > 13)) limit = Math.min(limit, Math.max(0, (toNode - 9) * 1.3));
  }
  // Obstacles straight ahead: other cars, the player, pedestrians in the road
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  let blockedBy = null;
  for (const o of actors) {
    if (o === v) continue;
    const ox = o.x - v.x, oz = o.z - v.z;
    const ahead = ox * fx + oz * fz;
    if (ahead < 1 || ahead > SIGHT) continue;
    const lateral = Math.abs(ox * fz - oz * fx);
    if (lateral < CAR_HALF_WIDTH) { limit = Math.min(limit, (ahead - 4) * 1.6); blockedBy = o; }
  }
  const fs = v.forwardSpeed;
  c.throttle = fs < limit ? 0.7 : 0;
  c.brake = fs > limit + 1.5 ? 1 : 0;
  if (limit <= 0.5 && fs < 1) { c.brake = 0; c.throttle = 0; }
  // Honk once in a while at a player who keeps blocking the lane.
  if (blockedBy && blockedBy.isPlayer) {
    ai.blocked += dt;
    if (ai.blocked > 2.5 && ai.honk <= 0) { emit('honk', v); ai.honk = 4; }
  } else ai.blocked = 0;
  ai.honk -= dt;
}

// Per-frame traffic upkeep around the player at (px, pz): drive, despawn far cars, top up the count.
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
  // At most one new car per frame keeps spawning smooth.
  if (count < TARGET_COUNT) {
    const e = randomEdgeNear(px, pz);
    if (e) spawnTrafficOn(e.from, e.to, 0.3 + rand() * 0.4);
  }
}
