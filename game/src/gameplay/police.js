// POLICE — the wanted level (0-5 stars) and everything the law sends after the player.
//
//   * Pursuit cars spawn out of sight, chase on sight and ram at close range (WANTED.policeCars).
//   * From WANTED.roadblockAt stars, parked two-car roadblocks appear ahead of a speeding player.
//   * From WANTED.heliAt stars, a helicopter hovers ahead of the camera with a lagging searchlight.
//   * While no unit and no searchlight can see the player, an evade timer runs; when it reaches
//     WANTED.evadeTime[level] the level drops one star, down to zero ('lostCops').
//
// Also builds the HUD's police-response report (call signs, distances, unit states).
import { WANTED, GRID_N, CALL_SIGNS, HELI_SIGN } from '../core/config.js';
import { nodePos, nearestNode, nodeNeighbors, sightBlocked } from '../world/city.js';
import { Vehicle, vehicles } from './vehicles.js';
import { makeHelicopter } from '../world/models.js';
import { glowTexture } from '../world/textures.js';
import { player } from './player.js';
import { game, emit } from '../core/state.js';
import { rand, pick } from '../core/rng.js';

const THREE = window.THREE;

// Shared police state, read by the HUD, minimap, pause map, menus, missions and combat.
export const police = {
  level: 0, evade: 0, seen: false, lastX: 0, lastZ: 0,
  units: [], heli: null, roadblocks: [], roadblockTimer: 6,
  ramming: false, frozen: false, signs: 0,
};
let scene;

const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const distToPlayer = (x, z) => dist(x, z, player.x, player.z);

/** Keeps the scene the helicopter, beam and light pool are added to. */
export function setupPolice(sc) {
  scene = sc;
}

// ---- Wanted level ------------------------------------------------------------------------

/** Raises the wanted level by n stars (capped), remembering (x, z) as the last sighting. */
export function addWanted(n, x = player.x, z = player.z) {
  const before = police.level;
  police.level = Math.min(WANTED.max, police.level + n);
  police.evade = 0;
  police.lastX = x; police.lastZ = z;
  game.stats.maxStars = Math.max(game.stats.maxStars, police.level);
  if (police.level > before) emit('wanted', police.level);
}

/** Sets the wanted level to exactly n stars (missions and staged shots). */
export function setWanted(n) {
  police.level = n;
  police.evade = 0;
  game.stats.maxStars = Math.max(game.stats.maxStars, n);
  emit('wanted', n);
}

/** Drops the wanted level to zero and hands every unit and roadblock car back to traffic. */
export function clearWanted() {
  police.level = 0;
  for (const unit of police.units) releaseUnit(unit);
  police.units.length = 0;
  for (const roadblock of police.roadblocks) for (const car of roadblock.cars) releaseUnit(car);
  police.roadblocks.length = 0;
}

// ---- Units -------------------------------------------------------------------------------

/** Spawns a police interceptor with its siren on and a call sign, and adds it to the pursuit. */
export function spawnUnit(x, z, heading) {
  const car = new Vehicle('interceptor', x, z, heading);
  car.driver = 'police';
  car.siren = true;
  car.keep = true;
  car.ai = { node: nearestNode(x, z), stuck: 0, reverse: 0 };
  const n = police.signs++;
  car.callSign = `${CALL_SIGNS[n % CALL_SIGNS.length]}-${1 + Math.floor(n / CALL_SIGNS.length) + (n % 3)}`;
  police.units.push(car);
  return car;
}

// Picks a road node 70-125 units from the player, preferably out of their sight, and spawns a unit
// there facing them. Gives up (null) after 30 tries.
function spawnPursuit() {
  for (let tries = 0; tries < 30; tries++) {
    const i = Math.floor(rand() * (GRID_N + 1)), j = Math.floor(rand() * (GRID_N + 1));
    const node = nodePos(i, j);
    const d = distToPlayer(node.x, node.z);
    if (d < 70 || d > 125) continue;
    if (tries < 20 && !sightBlocked(node.x, node.z, player.x, player.z)) continue;
    return spawnUnit(node.x, node.z, Math.atan2(player.x - node.x, player.z - node.z));
  }
  return null;
}

// A unit only counts while a cop is still at the wheel; the player can take one with F.
const manned = (car) => car.driver === 'police' && !!car.ai && !car.wrecked && vehicles.includes(car);

/** The player took this car: it stops being a pursuit unit or part of any roadblock. */
export function detachUnit(car) {
  const i = police.units.indexOf(car);
  if (i >= 0) police.units.splice(i, 1);
  for (const roadblock of police.roadblocks) {
    const k = roadblock.cars.indexOf(car);
    if (k >= 0) roadblock.cars.splice(k, 1);
  }
  if (car.ai) car.ai.ramming = false;
}

// Siren off; a surviving car that the player isn't driving rejoins ordinary traffic.
function releaseUnit(car) {
  if (car.driver === 'player') return;
  car.siren = false;
  if (car.wrecked || !vehicles.includes(car)) return;
  const node = nearestNode(car.x, car.z);
  car.driver = 'traffic';
  car.keep = false;
  car.ai = { from: node, to: pick(nodeNeighbors(node.i, node.j)), cruise: 14, blocked: 0, honk: 0 };
}

// Sets a unit's controls to drive towards (tx, tz) at up to `speed`, slowing for sharp turns and
// backing up for a moment when it has been stuck against something.
function steerTo(car, tx, tz, speed, dt) {
  const want = Math.atan2(tx - car.x, tz - car.z);
  const diff = Math.atan2(Math.sin(want - car.heading), Math.cos(want - car.heading));
  const c = car.controls;
  const ai = car.ai;
  if (ai.reverse > 0) {
    ai.reverse -= dt;
    c.throttle = 0; c.brake = 1; c.steer = diff > 0 ? 1 : -1; c.handbrake = false;
    return;
  }
  c.steer = Math.max(-1, Math.min(1, -diff * 2.5));
  const fwd = car.forwardSpeed;
  const cap = speed * (Math.abs(diff) > 0.6 ? 0.5 : 1);
  c.throttle = fwd < cap ? 1 : 0;
  c.brake = fwd > cap + 3 ? 0.6 : 0;
  c.handbrake = Math.abs(diff) > 1.1 && fwd > 12;
  if (fwd < 1.5 && c.throttle) {
    ai.stuck += dt;
    if (ai.stuck > 1.6) { ai.reverse = 1.2; ai.stuck = 0; }
  } else ai.stuck = 0;
}

/**
 * What a unit is doing right now: RAMMING (close enough to hit), PURSUIT (has the player in sight and
 * drives straight at them), SEARCHING (routing through the grid towards the player), ROADBLOCK (parked).
 */
export function unitState(car) {
  if (car.ai && car.ai.parked) return 'ROADBLOCK';
  const d = distToPlayer(car.x, car.z);
  if (d < 16) return 'RAMMING';
  const sameStreet = Math.abs(player.x - car.x) < 5 || Math.abs(player.z - car.z) < 5;
  const direct = d < 38 || (sameStreet && !sightBlocked(car.x, car.z, player.x, player.z));
  return direct ? 'PURSUIT' : 'SEARCHING';
}

// One pursuit unit's AI step: aim at where the player is heading when in contact, otherwise hop
// node to node towards them.
function driveUnit(car, dt) {
  if (!car.ai || !car.ai.node) return;
  const px = player.x, pz = player.z;
  const d = distToPlayer(car.x, car.z);
  const state = unitState(car);
  car.ai.state = state;
  if (state !== 'SEARCHING') {
    const lead = Math.min(0.8, d / 40);
    const ram = state === 'RAMMING';
    car.ai.ramming = ram;
    if (!player.vehicle && d < 9) {
      // On foot and close: creep up and stop rather than run them over.
      steerTo(car, px, pz, 2, dt);
      car.controls.brake = 1; car.controls.throttle = 0;
      return;
    }
    const tvx = player.vehicle ? player.vehicle.vx : 0, tvz = player.vehicle ? player.vehicle.vz : 0;
    steerTo(car, px + tvx * lead, pz + tvz * lead, car.spec.top * (ram ? 1.1 : 0.95), dt);
  } else {
    car.ai.ramming = false;
    const here = nodePos(car.ai.node.i, car.ai.node.j);
    if (dist(here.x, here.z, car.x, car.z) < 7) {
      // Reached the node: next head for whichever neighbour is closest to the player.
      let best = car.ai.node, bestDist = 1e9;
      for (const nb of nodeNeighbors(car.ai.node.i, car.ai.node.j)) {
        const p = nodePos(nb.i, nb.j);
        const nd = dist(p.x, p.z, px, pz);
        if (nd < bestDist) { bestDist = nd; best = nb; }
      }
      car.ai.node = best;
    }
    const target = nodePos(car.ai.node.i, car.ai.node.j);
    steerTo(car, target.x, target.z, car.spec.top * 0.85, dt);
  }
}

// ---- Helicopter with searchlight -------------------------------------------------------

const LAMP_DROP = 1.2; // the searchlight hangs this far below the helicopter's origin

// Builds the helicopter, its spot light, the visible beam cone and the light pool on the ground,
// starting 140 units out in a random direction.
function makeHeli() {
  const mesh = makeHelicopter();
  mesh.scale.setScalar(1.35);
  scene.add(mesh);
  const spot = new THREE.SpotLight(0xfff4c8, 900, 120, 0.22, 0.4, 1.2);
  scene.add(spot, spot.target);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 4.2, 1, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  scene.add(beam);
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 16),
    new THREE.MeshBasicMaterial({ map: glowTexture('#fff2b0'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }),
  );
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

/** Puts the helicopter (creating it if needed) at a fixed pose, for staged screenshots. */
export function placeHeli(x, y, z, aimX, aimZ, heading) {
  if (!police.heli) police.heli = makeHeli();
  const h = police.heli;
  h.x = x; h.y = y; h.z = z; h.aimX = aimX; h.aimZ = aimZ; h.heading = heading;
  syncHeli(h, 0);
}

// Moves the meshes to the helicopter's simulated pose, spins the rotors and stretches the beam
// from the lamp down to the aim point.
function syncHeli(h, dt) {
  h.mesh.position.set(h.x, h.y, h.z);
  // The body points where it flies (it strafes sideways round the chase); the searchlight turret aims.
  h.mesh.rotation.set(0.12, h.heading ?? Math.atan2(h.aimX - h.x, h.aimZ - h.z), 0.05);
  h.mesh.userData.rotor.rotation.y += dt * 30;
  h.mesh.userData.tail.rotation.x += dt * 40;
  h.spot.position.set(h.x, h.y - LAMP_DROP, h.z);
  h.spot.target.position.set(h.aimX, 0, h.aimZ);
  const dx = h.aimX - h.x, dy = -h.y + LAMP_DROP, dz = h.aimZ - h.z;
  const len = Math.hypot(dx, dy, dz);
  h.beam.scale.set(1, len, 1);
  h.beam.position.set(h.x + dx / 2, h.y - LAMP_DROP + dy / 2, h.z + dz / 2);
  h.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(dx, dy, dz).normalize());
  h.pool.position.set(h.aimX, 0.15, h.aimZ);
}

const BEAM_OPACITY = 0.16, POOL_OPACITY = 0.85, BEAM_R0 = 0.3, BEAM_R1 = 4.2;
const smoothstep = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

/**
 * The beam and pool are additive: seen from inside the cone they wash the whole screen white.
 * Fades the beam (and softens the pool) as the camera nears or enters the cone; from outside it keeps
 * the full searchlight look. Called every rendered frame with the camera and night factor (0-1).
 */
export function updateHeliGlare(camera, night = 0) {
  const h = police.heli;
  if (!h) return;
  // The lamp is a pale wash in daylight and a hard white disc at night.
  h.spot.intensity = 250 + 650 * night;
  // Beam axis from the lamp (a) to the aim point; camera offset (c) projected onto it.
  const ax = h.x, ay = h.y - LAMP_DROP, az = h.z;
  const bx = h.aimX - ax, by = -ay, bz = h.aimZ - az;
  const cx = camera.position.x - ax, cy = camera.position.y - ay, cz = camera.position.z - az;
  const axisLen2 = bx * bx + by * by + bz * bz || 1;
  const along = Math.max(0, Math.min(1, (cx * bx + cy * by + cz * bz) / axisLen2));
  const ox = cx - bx * along, oy = cy - by * along, oz = cz - bz * along;
  const ratio = Math.hypot(ox, oy, oz) / (BEAM_R0 + (BEAM_R1 - BEAM_R0) * along);
  // ratio < 1: camera inside the cone. Fully faded inside, full strength from 3 radii out.
  const k = smoothstep(1, 3, ratio);
  h.beam.material.opacity = BEAM_OPACITY * k;
  h.beam.visible = k > 0.01;
  // The pool stays as a soft ring on the ground, just never a full-screen flare.
  const near = smoothstep(4, 16, dist(camera.position.x, camera.position.z, h.aimX, h.aimZ));
  h.pool.material.opacity = POOL_OPACITY * (0.45 + 0.55 * Math.max(k, near)) * (0.45 + 0.55 * night);
}

// Flies the helicopter in (or away once the stars drop below heliAt). Returns true when the
// searchlight is on the player, which counts as being seen.
function updateHeli(dt) {
  const wanted = police.level >= WANTED.heliAt;
  if (wanted && !police.heli) police.heli = makeHeli();
  const h = police.heli;
  if (!h) return false;
  if (!wanted) {
    // Climb and drift away, then despawn once well clear.
    h.x += (h.x - player.x) * dt * 0.5; h.y += dt * 8;
    syncHeli(h, dt);
    if (distToPlayer(h.x, h.z) > 220) removeHeli();
    return false;
  }
  // Hover low, out ahead of the chase camera and swaying side to side, so the helicopter body
  // stays in view instead of circling straight overhead.
  h.angle += dt * 0.25;
  const ahead = player.camYaw + Math.sin(h.angle) * 0.9;
  const tx = player.x + Math.sin(ahead) * 44, tz = player.z + Math.cos(ahead) * 44;
  const k = Math.min(1, dt * 0.9);
  const mvx = (tx - h.x) * k, mvz = (tz - h.z) * k;
  h.x += mvx; h.z += mvz;
  if (Math.hypot(mvx, mvz) > dt * 2) {
    const wantHeading = Math.atan2(mvx, mvz), cur = h.heading ?? wantHeading;
    h.heading = cur + Math.atan2(Math.sin(wantHeading - cur), Math.cos(wantHeading - cur)) * Math.min(1, dt * 1.5);
  }
  h.y += (15 - h.y) * k;
  // The searchlight lags behind the player; it can be shaken off under cover.
  const lag = Math.min(1, dt * 1.8);
  h.aimX += (player.x - h.aimX) * lag; h.aimZ += (player.z - h.aimZ) * lag;
  syncHeli(h, dt);
  return dist(h.aimX, h.aimZ, player.x, player.z) < 9 && distToPlayer(h.x, h.z) < 60;
}

// ---- Roadblocks -------------------------------------------------------------------------

const ROADBLOCK_LIFE = 40; // seconds a roadblock stays before its cars rejoin traffic

// Blocks the junction about 75 units ahead of the player, unless it is closer than 40.
function placeRoadblock() {
  const v = player.vehicle;
  const hx = v ? Math.sin(v.heading) : Math.sin(player.yaw), hz = v ? Math.cos(v.heading) : Math.cos(player.yaw);
  const node = nearestNode(player.x + hx * 75, player.z + hz * 75);
  const p = nodePos(node.i, node.j);
  if (distToPlayer(p.x, p.z) < 40) return;
  placeRoadblockAt(p.x, p.z, Math.abs(hx) > Math.abs(hz));
}

/** Parks two police cars side by side across the road at (x, z); alongX = the road runs along x. */
export function placeRoadblockAt(x, z, alongX) {
  const cars = [];
  for (const side of [-1, 1]) {
    const car = spawnUnit(x + (alongX ? 0 : side * 3), z + (alongX ? side * 3 : 0), alongX ? 0 : Math.PI / 2);
    car.ai.parked = true;
    police.units.splice(police.units.indexOf(car), 1);
    cars.push(car);
  }
  police.roadblocks.push({ x, z, cars, life: ROADBLOCK_LIFE });
}

// ---- Main update ------------------------------------------------------------------------

/** Steps the whole police response: spawning, unit AI, helicopter, roadblocks and the cool-down. */
export function updatePolice(dt, t) {
  if (police.frozen) { for (const unit of police.units) unit.sync(t); return; }
  police.units = police.units.filter(manned);
  if (police.level === 0) {
    for (const unit of police.units) releaseUnit(unit);
    police.units.length = 0;
  } else if (police.units.length < WANTED.policeCars[police.level] && rand() < dt * 0.8) {
    spawnPursuit();
  }
  let seen = false;
  police.ramming = false;
  for (const unit of police.units) {
    driveUnit(unit, dt);
    if (unit.ai && unit.ai.ramming) police.ramming = true;
    if (distToPlayer(unit.x, unit.z) < 75 && !sightBlocked(unit.x, unit.z, player.x, player.z)) seen = true;
  }
  if (updateHeli(dt)) seen = true;

  if (police.level >= WANTED.roadblockAt) {
    police.roadblockTimer -= dt;
    if (police.roadblockTimer <= 0 && player.vehicle && player.vehicle.speed > 10) { placeRoadblock(); police.roadblockTimer = 22; }
  }
  for (let i = police.roadblocks.length - 1; i >= 0; i--) {
    const roadblock = police.roadblocks[i];
    roadblock.life -= dt;
    roadblock.cars = roadblock.cars.filter(manned);
    for (const car of roadblock.cars) { car.controls.throttle = 0; car.controls.brake = 1; }
    if (roadblock.life <= 0 || police.level === 0 || !roadblock.cars.length) {
      for (const car of roadblock.cars) releaseUnit(car);
      police.roadblocks.splice(i, 1);
    }
  }

  // Cool-down: stars drop one at a time while nobody can see the player.
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

// ---- HUD report -------------------------------------------------------------------------

/** Badge colour per unit state in the HUD's police-response panel. */
export const STATE_COLORS = { RAMMING: '#ff3f5f', PURSUIT: '#4fb0ff', ROADBLOCK: '#ff9a3f', SPOTLIGHT: '#ffe066', SEARCHING: '#b8b0c8' };

/**
 * What the HUD's police-response panel shows: every live unit by call sign, nearest first, with its
 * distance and state; the helicopter; how many units are out and whether the player is in sight.
 * Null when there are no stars.
 */
export function responseReport() {
  if (police.level === 0) return null;
  const rows = [];
  for (const car of police.units) if (manned(car)) rows.push({ sign: car.callSign, d: distToPlayer(car.x, car.z), state: unitState(car) });
  for (const roadblock of police.roadblocks) {
    for (const car of roadblock.cars) if (manned(car)) rows.push({ sign: car.callSign, d: distToPlayer(car.x, car.z), state: 'ROADBLOCK' });
  }
  const h = police.heli;
  if (h) {
    const lit = dist(h.aimX, h.aimZ, player.x, player.z) < 9;
    rows.push({ sign: HELI_SIGN, d: distToPlayer(h.x, h.z), state: lit ? 'SPOTLIGHT' : 'SEARCHING', air: true });
  }
  rows.sort((a, b) => a.d - b.d);
  const evadeNeed = WANTED.evadeTime[police.level] || 1;
  return {
    rows, count: rows.length, seen: police.seen,
    status: police.seen ? 'IN SIGHT' : rows.length ? 'SEARCHING' : 'UNITS EN ROUTE',
    evade: police.seen ? 0 : Math.min(1, police.evade / evadeNeed),
  };
}
