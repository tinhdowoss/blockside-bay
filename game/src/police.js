// Wanted level (0-5 stars) and the police response: pursuit and ramming cars, roadblocks at 4+,
// a helicopter with a searchlight at 3+. Break line of sight long enough and the stars cool down.
import { WANTED, CELL, GRID_N } from './config.js';
import { nodePos, nearestNode, nodeNeighbors, sightBlocked } from './city.js';
import { Vehicle, vehicles } from './vehicles.js';
import { makeHelicopter } from './models.js';
import { glowTexture } from './textures.js';
import { player } from './player.js';
import { game, emit } from './state.js';
import { rand, pick } from './rng.js';

const THREE = window.THREE;
export const police = {
  level: 0, evade: 0, seen: false, lastX: 0, lastZ: 0,
  units: [], heli: null, roadblocks: [], roadblockTimer: 6,
  ramming: false, frozen: false,
};
let scene;

export function setupPolice(sc) {
  scene = sc;
}

export function addWanted(n, x = player.x, z = player.z) {
  const before = police.level;
  police.level = Math.min(WANTED.max, police.level + n);
  police.evade = 0;
  police.lastX = x; police.lastZ = z;
  game.stats.maxStars = Math.max(game.stats.maxStars, police.level);
  if (police.level > before) emit('wanted', police.level);
}

export function setWanted(n) {
  police.level = n;
  police.evade = 0;
  game.stats.maxStars = Math.max(game.stats.maxStars, n);
  emit('wanted', n);
}

export function clearWanted() {
  police.level = 0;
  for (const u of police.units) releaseUnit(u);
  police.units.length = 0;
  for (const rb of police.roadblocks) for (const v of rb.cars) releaseUnit(v);
  police.roadblocks.length = 0;
}

// ---- Units -------------------------------------------------------------------------------
export function spawnUnit(x, z, heading) {
  const v = new Vehicle('interceptor', x, z, heading);
  v.driver = 'police';
  v.siren = true;
  v.keep = true;
  v.ai = { node: nearestNode(x, z), stuck: 0, reverse: 0 };
  police.units.push(v);
  return v;
}

function spawnPursuit() {
  // A road node 70-120 units away, preferably out of the player's sight.
  for (let tries = 0; tries < 30; tries++) {
    const i = Math.floor(rand() * (GRID_N + 1)), j = Math.floor(rand() * (GRID_N + 1));
    const p = nodePos(i, j);
    const d = Math.hypot(p.x - player.x, p.z - player.z);
    if (d < 70 || d > 125) continue;
    if (tries < 20 && !sightBlocked(p.x, p.z, player.x, player.z)) continue;
    return spawnUnit(p.x, p.z, Math.atan2(player.x - p.x, player.z - p.z));
  }
  return null;
}

function releaseUnit(v) {
  v.siren = false;
  if (v.wrecked || !vehicles.includes(v)) return;
  const n = nearestNode(v.x, v.z);
  v.driver = 'traffic';
  v.keep = false;
  v.ai = { from: n, to: pick(nodeNeighbors(n.i, n.j)), cruise: 14, blocked: 0, honk: 0 };
}

function steerTo(v, tx, tz, speed, dt) {
  const want = Math.atan2(tx - v.x, tz - v.z);
  const diff = Math.atan2(Math.sin(want - v.heading), Math.cos(want - v.heading));
  const c = v.controls;
  const ai = v.ai;
  if (ai.reverse > 0) {
    ai.reverse -= dt;
    c.throttle = 0; c.brake = 1; c.steer = diff > 0 ? 1 : -1; c.handbrake = false;
    return;
  }
  c.steer = Math.max(-1, Math.min(1, -diff * 2.5));
  const fs = v.forwardSpeed;
  const turnSlow = Math.abs(diff) > 0.6 ? 0.5 : 1;
  c.throttle = fs < speed * turnSlow ? 1 : 0;
  c.brake = fs > speed * turnSlow + 3 ? 0.6 : 0;
  c.handbrake = Math.abs(diff) > 1.1 && fs > 12;
  if (fs < 1.5 && c.throttle) { ai.stuck += dt; if (ai.stuck > 1.6) { ai.reverse = 1.2; ai.stuck = 0; } } else ai.stuck = 0;
}

function driveUnit(v, dt) {
  const target = player.vehicle || player;
  const px = player.x, pz = player.z;
  const d = Math.hypot(px - v.x, pz - v.z);
  const tvx = player.vehicle ? player.vehicle.vx : 0, tvz = player.vehicle ? player.vehicle.vz : 0;
  const direct = d < 38 || (Math.abs(px - v.x) < 5 || Math.abs(pz - v.z) < 5) && !sightBlocked(v.x, v.z, px, pz);
  if (direct) {
    const lead = Math.min(0.8, d / 40);
    const ram = d < 16;
    v.ai.ramming = ram;
    if (!player.vehicle && d < 9) { steerTo(v, px, pz, 2, dt); v.controls.brake = 1; v.controls.throttle = 0; return; }
    steerTo(v, px + tvx * lead, pz + tvz * lead, ram ? v.spec.top * 1.1 : v.spec.top * 0.95, dt);
  } else {
    v.ai.ramming = false;
    const n = nodePos(v.ai.node.i, v.ai.node.j);
    if (Math.hypot(n.x - v.x, n.z - v.z) < 7) {
      let best = v.ai.node, bd = 1e9;
      for (const nb of nodeNeighbors(v.ai.node.i, v.ai.node.j)) {
        const p = nodePos(nb.i, nb.j);
        const dd = Math.hypot(p.x - px, p.z - pz);
        if (dd < bd) { bd = dd; best = nb; }
      }
      v.ai.node = best;
    }
    const tn = nodePos(v.ai.node.i, v.ai.node.j);
    steerTo(v, tn.x, tn.z, v.spec.top * 0.85, dt);
  }
  void target;
}

// ---- Helicopter with searchlight -------------------------------------------------------
function makeHeli() {
  const mesh = makeHelicopter();
  scene.add(mesh);
  const spot = new THREE.SpotLight(0xfff4c8, 900, 120, 0.22, 0.4, 1.2);
  scene.add(spot, spot.target);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 4.2, 1, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  scene.add(beam);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshBasicMaterial({ map: glowTexture('#fff2b0'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
  pool.rotation.x = -Math.PI / 2;
  scene.add(pool);
  const a = rand() * Math.PI * 2;
  return { mesh, spot, beam, pool, x: player.x + Math.cos(a) * 140, z: player.z + Math.sin(a) * 140, y: 38, angle: a, aimX: player.x, aimZ: player.z };
}

function removeHeli() {
  const h = police.heli;
  scene.remove(h.mesh, h.spot, h.spot.target, h.beam, h.pool);
  police.heli = null;
}

export function placeHeli(x, y, z, aimX, aimZ) {
  if (!police.heli) police.heli = makeHeli();
  const h = police.heli;
  h.x = x; h.y = y; h.z = z; h.aimX = aimX; h.aimZ = aimZ;
  syncHeli(h, 0, 0);
}

function syncHeli(h, t, dt) {
  h.mesh.position.set(h.x, h.y, h.z);
  h.mesh.rotation.set(0.12, Math.atan2(h.aimX - h.x, h.aimZ - h.z), 0.05);
  h.mesh.userData.rotor.rotation.y += dt * 30;
  h.mesh.userData.tail.rotation.x += dt * 40;
  h.spot.position.set(h.x, h.y - 1.2, h.z);
  h.spot.target.position.set(h.aimX, 0, h.aimZ);
  const dx = h.aimX - h.x, dy = -h.y + 1.2, dz = h.aimZ - h.z;
  const len = Math.hypot(dx, dy, dz);
  h.beam.scale.set(1, len, 1);
  h.beam.position.set(h.x + dx / 2, h.y - 1.2 + dy / 2, h.z + dz / 2);
  h.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(dx, dy, dz).normalize());
  h.pool.position.set(h.aimX, 0.15, h.aimZ);
  void t;
}

function updateHeli(dt, t) {
  const want = police.level >= WANTED.heliAt;
  if (want && !police.heli) police.heli = makeHeli();
  const h = police.heli;
  if (!h) return false;
  if (!want) {
    h.x += (h.x - player.x) * dt * 0.5; h.y += dt * 8;
    syncHeli(h, t, dt);
    if (Math.hypot(h.x - player.x, h.z - player.z) > 220) removeHeli();
    return false;
  }
  h.angle += dt * 0.25;
  const tx = player.x + Math.cos(h.angle) * 26, tz = player.z + Math.sin(h.angle) * 26;
  const k = Math.min(1, dt * 0.9);
  h.x += (tx - h.x) * k; h.z += (tz - h.z) * k;
  h.y += (36 - h.y) * k;
  // The searchlight lags behind the player; it can be shaken off under cover.
  const lag = Math.min(1, dt * 1.8);
  h.aimX += (player.x - h.aimX) * lag; h.aimZ += (player.z - h.aimZ) * lag;
  syncHeli(h, t, dt);
  return Math.hypot(h.aimX - player.x, h.aimZ - player.z) < 9 && Math.hypot(h.x - player.x, h.z - player.z) < 60;
}

// ---- Roadblocks -------------------------------------------------------------------------
function placeRoadblock() {
  const v = player.vehicle;
  const hx = v ? Math.sin(v.heading) : Math.sin(player.yaw), hz = v ? Math.cos(v.heading) : Math.cos(player.yaw);
  const ax = player.x + hx * 75, az = player.z + hz * 75;
  const n = nearestNode(ax, az);
  const p = nodePos(n.i, n.j);
  if (Math.hypot(p.x - player.x, p.z - player.z) < 40) return;
  const alongX = Math.abs(hx) > Math.abs(hz);
  const cars = [];
  for (const s of [-1, 1]) {
    const x = p.x + (alongX ? 0 : s * 3), z = p.z + (alongX ? s * 3 : 0);
    const c = spawnUnit(x, z, alongX ? 0 : Math.PI / 2);
    c.ai.parked = true;
    police.units.splice(police.units.indexOf(c), 1);
    cars.push(c);
  }
  police.roadblocks.push({ x: p.x, z: p.z, cars, life: 40 });
}

export function placeRoadblockAt(x, z, alongX) {
  const cars = [];
  for (const s of [-1, 1]) {
    const c = spawnUnit(x + (alongX ? 0 : s * 3), z + (alongX ? s * 3 : 0), alongX ? 0 : Math.PI / 2);
    c.ai.parked = true;
    police.units.splice(police.units.indexOf(c), 1);
    cars.push(c);
  }
  police.roadblocks.push({ x, z, cars, life: 40 });
}

// ---- Main update ------------------------------------------------------------------------
export function updatePolice(dt, t) {
  if (police.frozen) { for (const u of police.units) u.sync(t); return; }
  police.units = police.units.filter((u) => vehicles.includes(u) && !u.wrecked);
  if (police.level === 0) {
    for (const u of police.units) releaseUnit(u);
    police.units.length = 0;
  } else {
    const wantCars = WANTED.policeCars[police.level];
    if (police.units.length < wantCars && rand() < dt * 0.8) spawnPursuit();
  }
  let seen = false;
  police.ramming = false;
  for (const u of police.units) {
    driveUnit(u, dt);
    if (u.ai.ramming) police.ramming = true;
    const d = Math.hypot(u.x - player.x, u.z - player.z);
    if (d < 75 && !sightBlocked(u.x, u.z, player.x, player.z)) seen = true;
  }
  if (updateHeli(dt, t)) seen = true;
  // Roadblocks
  if (police.level >= WANTED.roadblockAt) {
    police.roadblockTimer -= dt;
    if (police.roadblockTimer <= 0 && player.vehicle && player.vehicle.speed > 10) { placeRoadblock(); police.roadblockTimer = 22; }
  }
  for (let i = police.roadblocks.length - 1; i >= 0; i--) {
    const rb = police.roadblocks[i];
    rb.life -= dt;
    for (const c of rb.cars) { c.controls.throttle = 0; c.controls.brake = 1; }
    if (rb.life <= 0 || police.level === 0) { for (const c of rb.cars) releaseUnit(c); police.roadblocks.splice(i, 1); }
  }
  // Cool-down when nobody can see the player
  police.seen = seen;
  if (police.level > 0) {
    if (seen) { police.evade = 0; police.lastX = player.x; police.lastZ = player.z; }
    else {
      police.evade += dt;
      if (police.evade > WANTED.evadeTime[police.level]) {
        police.level--;
        police.evade = 0;
        emit('wanted', police.level);
        if (police.level === 0) emit('lostCops');
      }
    }
  }
}

// What the HUD's police-response list shows.
export function responseList() {
  if (police.level === 0) return [];
  const list = [];
  if (police.ramming) list.push({ label: 'RAMMING', color: '#ff3f5f' });
  list.push(police.units.length ? { label: `PURSUIT x${police.units.length}`, color: '#3fa0ff' } : { label: 'UNITS EN ROUTE', color: '#3fa0ff' });
  if (police.heli) list.push({ label: 'SPOTLIGHT', color: '#ffe066' });
  if (police.roadblocks.length) list.push({ label: 'ROADBLOCK', color: '#ff9a3f' });
  if (!police.seen) list.push({ label: 'SEARCHING', color: '#bbbbbb' });
  return list;
}
void CELL;
