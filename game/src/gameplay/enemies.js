// NPC shooter brains. When a gang member turns hostile it takes a role:
//   COVER  - find a spot the player cannot see (behind a crate while crouched, or around a building
//            corner), duck there, then pop up / step out to fire a short burst and duck back.
//   FLANK  - run wide to the player's side (90 degrees off where the player is facing), then dig in.
//   RUSH   - bosses and cuffing cops close in and strafe.
// Foot cops jump out of stopped cruisers. Accuracy drops with distance, player speed, crouching and
// cover; a dodge-rolling player cannot be hit.
import { collideCircle, sightBlocked } from '../world/city.js';
import { coverBetween, crateSpots } from '../world/cover.js';
import { player } from './player.js';
import { police } from './police.js';
import { shooters, spawnShooter, syncShooter, removeShooter, hurtPlayer } from './combat.js';
import { game, emit } from '../core/state.js';
import { flash, tracer } from '../fx/effects.js';
import { rand, range } from '../core/rng.js';

const THREE = window.THREE;

const seesPlayer = (x, z, crouched) => !sightBlocked(x, z, player.x, player.z) && !(crouched && coverBetween(x, z, player.x, player.z));

function pickRole(s) {
  if (s.boss || s.faction === 'police') return 'rush';
  // Every third gang member flanks; the rest work from cover.
  const n = shooters.filter((q) => q.role === 'flank' && q.alive).length;
  return n < Math.ceil(shooters.filter((q) => q.alive && q.faction === s.faction).length / 3) ? 'flank' : 'cover';
}

// Best hiding spot near s: crate spots first, then ring samples hidden by buildings.
function findCover(s) {
  const cands = crateSpots(s.x, s.z, player.x, player.z);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2, r = 4 + (k % 3) * 3;
    const q = collideCircle(s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, 0.5);
    cands.push({ x: q.x, z: q.z, crate: null });
  }
  let best = null, bs = Infinity;
  for (const c of cands) {
    const dp = Math.hypot(c.x - player.x, c.z - player.z);
    if (dp < 6 || dp > 40) continue;
    if (seesPlayer(c.x, c.z, true)) continue;
    const score = Math.hypot(c.x - s.x, c.z - s.z) + Math.abs(dp - 13) * 0.5;
    if (score < bs) { bs = score; best = c; }
  }
  return best;
}

// Where to fire from: stand up behind a crate, else step sideways out of the building's shadow.
function findPeek(s) {
  if (s.goal?.crate) return { x: s.goal.x, z: s.goal.z };
  const dx = player.x - s.x, dz = player.z - s.z, l = Math.hypot(dx, dz) || 1;
  for (const o of [1.8, -1.8, 3, -3, 4.5, -4.5]) {
    const q = collideCircle(s.x - (dz / l) * o, s.z + (dx / l) * o, 0.45);
    if (seesPlayer(q.x, q.z, false)) return q;
  }
  return null;
}

function moveTo(s, gx, gz, speed, dt) {
  const dx = gx - s.x, dz = gz - s.z, d = Math.hypot(dx, dz);
  if (d < 0.3) return true;
  const step = Math.min(d, speed * dt);
  const r = collideCircle(s.x + (dx / d) * step, s.z + (dz / d) * step, 0.45);
  s.x = r.x; s.z = r.z;
  s.phase += speed * dt * 1.6;
  return d < 0.6;
}

function tryShoot(s, d, rate = 1) {
  const canShoot = !(s.faction === 'police' && police.level < 2);
  if (canShoot && s.cool <= 0 && d < 50 && seesPlayer(s.x, s.z, false)) {
    s.cool = range(0.5, 1.2) * (s.boss ? 0.6 : 1) * rate;
    npcShoot(s, d);
  }
}

function updateShooter(s, dt) {
  if (!s.alive) {
    s.deadT += dt;
    const fall = Math.min(1, s.deadT * 4);
    s.model.scale.y = s.model.scale.x;
    s.model.rotation.set(0, s.fallDir, 0);
    s.model.rotateX(-fall * Math.PI / 2);
    s.model.position.y = 0.2 * fall;
    return;
  }
  const dx = player.x - s.x, dz = player.z - s.z, d = Math.hypot(dx, dz);
  const hostile = s.faction !== 'police' ? (d < s.guard || s.alerted) : police.level > 0;
  let speed = 0;
  if (hostile && game.mode === 'play') {
    s.yaw = Math.atan2(dx, dz);
    s.cool -= dt;
    s.aiT -= dt;
    s.role ||= pickRole(s);
    if (s.faction === 'police' && police.level === 1) s.role = 'rush';
    if (s.role === 'flank') {
      // Aim for a point 12 m to the player's side, on whichever side this shooter is already on.
      if (!s.goal || s.aiT <= 0) {
        const f = player.camYaw, side = Math.sign((s.x - player.x) * Math.cos(f) - (s.z - player.z) * Math.sin(f)) || 1;
        const a = f + side * Math.PI / 2;
        const q = collideCircle(player.x + Math.sin(a) * 12, player.z + Math.cos(a) * 12, 0.5);
        s.goal = { x: q.x, z: q.z }; s.aiT = 1.5;
        s.flankFrom ??= Math.atan2(s.x - player.x, s.z - player.z);
      }
      s.crouch = false;
      speed = 5;
      const there = moveTo(s, s.goal.x, s.goal.z, speed, dt);
      tryShoot(s, d, 1.8);
      if (there || (s.flankT = (s.flankT || 0) + dt) > 7) { s.role = 'cover'; s.ai = 'idle'; s.goal = null; s.flanked = true; }
    } else if (s.role === 'cover') {
      if (s.ai === 'idle' || (s.ai !== 'move' && s.aiT <= -6)) {
        const c = findCover(s);
        if (c) { s.goal = c; s.ai = 'move'; s.aiT = 0; } else { s.role = 'rush'; }
      }
      if (s.ai === 'move') {
        s.crouch = false; speed = 4.4;
        tryShoot(s, d, 2);
        if (moveTo(s, s.goal.x, s.goal.z, speed, dt)) { s.ai = 'hide'; s.aiT = range(0.9, 2.2); }
      } else if (s.ai === 'hide') {
        s.crouch = true;
        // The player walked round the cover: find new cover.
        if (seesPlayer(s.x, s.z, true)) { s.ai = 'idle'; }
        else if (s.aiT <= 0) { s.peek = findPeek(s); s.ai = s.peek ? 'peek' : 'idle'; s.aiT = range(1.2, 2); s.shots = 1 + Math.floor(rand() * 3); }
      } else if (s.ai === 'peek') {
        s.crouch = false;
        if (s.peek && !s.goal?.crate) { speed = 3; moveTo(s, s.peek.x, s.peek.z, speed, dt); }
        if (s.cool <= 0 && s.shots > 0 && seesPlayer(s.x, s.z, false)) { s.cool = 0.35; s.shots--; npcShoot(s, d); }
        if (s.aiT <= 0 || s.shots <= 0) { s.ai = 'move'; s.aiT = 0; }   // back into cover
      }
    } else {
      // RUSH: close in to mid range (cuffing cops all the way), strafe while shooting.
      s.crouch = false;
      s.strafeT -= dt;
      if (s.strafeT < 0) { s.strafe *= -1; s.strafeT = range(1, 2.5); }
      const want = s.faction === 'police' && police.level === 1 ? 1.4 : 11;
      const fwd = d > want + 2 ? 1 : d < want - 3 ? -0.6 : 0;
      const mx = (dx / d) * fwd + (-dz / d) * s.strafe * 0.6, mz = (dz / d) * fwd + (dx / d) * s.strafe * 0.6;
      speed = 3.4;
      const r = collideCircle(s.x + mx * speed * dt, s.z + mz * speed * dt, 0.45);
      s.x = r.x; s.z = r.z;
      s.phase += speed * dt * 1.6;
      tryShoot(s, d);
      if (s.faction === 'police' && police.level === 1 && d < 2 && !player.vehicle) emit('cuffing', dt);
    }
  } else s.crouch = false;
  syncShooter(s, speed);
}

function npcShoot(s, d) {
  const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
  const m = new THREE.Vector3(s.x + sy * 0.9 - cy * 0.42, 1.55, s.z + cy * 0.9 + sy * 0.42);
  flash(m.x, m.y, m.z, 1.2);
  const moving = player.vehicle ? player.vehicle.speed / 40 : player.speed / 12;
  let p = s.accuracy * (1 - Math.min(0.8, d / 60)) * (1 - moving * 0.6);
  if (player.crouch) p *= coverBetween(player.x, player.z, s.x, s.z) ? 0.2 : 0.55;
  if (player.rolling > 0) p = 0;
  const hit = rand() < p;
  const tx = player.x + (hit ? 0 : (rand() - 0.5) * 4), tz = player.z + (hit ? 0 : (rand() - 0.5) * 4);
  tracer(m, new THREE.Vector3(tx, hit ? (player.crouch ? 1 : 1.3) : rand() * 2, tz));
  emit('gunshot', { x: s.x, z: s.z, weapon: 'npc', by: s.faction });
  if (hit) hurtPlayer(s.boss ? 9 : 6, s.x, s.z);
}

// Foot cops jump out when the player is on foot near a stopped cruiser.
let copSpawnT = 0;
function updateFootCops(dt) {
  copSpawnT -= dt;
  if (police.level === 0 || player.vehicle || copSpawnT > 0) return;
  const cops = shooters.filter((s) => s.faction === 'police' && s.alive).length;
  if (cops >= 2 + police.level) return;
  for (const v of police.units) {
    const d = Math.hypot(v.x - player.x, v.z - player.z);
    if (d < 22 && v.speed < 3) {
      const s = Math.cos(v.heading), c = -Math.sin(v.heading);
      spawnShooter(v.x + s * 2.2, v.z + c * 2.2, 'police', { guard: 80 });
      copSpawnT = 3;
      break;
    }
  }
}

export function updateEnemies(dt) {
  updateFootCops(dt);
  for (let i = shooters.length - 1; i >= 0; i--) {
    const s = shooters[i];
    updateShooter(s, dt);
    if (!s.alive && s.deadT > 20 && !s.keep) removeShooter(i);
    else if (s.faction === 'police' && police.level === 0 && Math.hypot(s.x - player.x, s.z - player.z) > 60) removeShooter(i);
  }
}
