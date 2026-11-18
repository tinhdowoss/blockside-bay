// Combat: fists, pistol and SMG with mouse aim; health/armor; gang members and foot cops who shoot back;
// headshots pay a bonus and pop a HEADSHOT label.
import { WEAPONS, HEADSHOT_BONUS } from './config.js';
import { MISSIONS } from './missions-data.js';
import { makeCharacter, animateCharacter } from './models.js';
import { collideCircle, rayBuildings, sightBlocked } from './city.js';
import { player } from './player.js';
import { peds, knockDown } from './pedestrians.js';
import { vehicles } from './vehicles.js';
import { police, addWanted } from './police.js';
import { input, tapped } from './input.js';
import { game, emit, addCash, bumpSkill } from './state.js';
import { flash, tracer, blood, sparks, fx } from './effects.js';
import { rand, range } from './rng.js';

const THREE = window.THREE;
export const shooters = [];
let scene, camera, fireCooldown = 0, reloadT = 0;

const GANG_LOOKS = {
  vipers: { shirt: '#a020f0', pants: '#1a1a1a', bandana: '#3fff6b', skin: '#c98a5e', hair: '#111111', shades: true },
  salt: { shirt: '#f4f4f4', pants: '#2b3a67', bandana: '#1d6fff', skin: '#e0a77a', hair: '#3a2010' },
  police: { shirt: '#1d3c8f', pants: '#1d2440', hat: '#1d2440', badge: true, skin: '#a8714c', hair: '#111111' },
};

export function setupCombat(sc, cam) { scene = sc; camera = cam; }

export function spawnShooter(x, z, faction, opts = {}) {
  const look = { ...GANG_LOOKS[faction], ...(opts.look || {}) };
  const model = makeCharacter(look);
  model.userData.parts.gun.visible = true;
  if (opts.boss) model.scale.setScalar(1.12);
  scene.add(model);
  const s = {
    model, x, z, yaw: rand() * 6, faction, boss: !!opts.boss, name: opts.name || null,
    health: opts.boss ? 260 : faction === 'police' ? 70 : 60, alive: true, deadT: 0,
    cool: range(0.5, 1.5), strafe: rand() < 0.5 ? 1 : -1, strafeT: range(1, 3), phase: 0, guard: opts.guard ?? 45,
    accuracy: opts.accuracy ?? (opts.boss ? 0.45 : 0.3), tag: opts.tag || null, isShooter: true,
  };
  shooters.push(s);
  sync(s, 0);
  return s;
}

export function clearShooters(filter = () => true) {
  for (let i = shooters.length - 1; i >= 0; i--) {
    if (!filter(shooters[i])) continue;
    scene.remove(shooters[i].model);
    shooters.splice(i, 1);
  }
}

function sync(s, speed) {
  s.model.position.set(s.x, 0, s.z);
  s.model.rotation.set(0, s.yaw, 0);
  animateCharacter(s.model, s.phase, Math.min(1, speed / 4), true);
}

// ---- Damage to the player --------------------------------------------------------------
export function hurtPlayer(n, fromX, fromZ) {
  if (game.mode !== 'play') return;
  if (player.vehicle) n *= 0.4;
  const absorbed = Math.min(game.armor, n * 0.7);
  game.armor -= absorbed;
  game.health -= n - absorbed;
  player.hurt = 0.4;
  emit('hurt', { fromX, fromZ });
  if (game.health <= 0) { game.health = 0; emit('playerDown', 'shot'); }
}

// ---- Ray tests --------------------------------------------------------------------------
function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - c;
  if (h < 0) return Infinity;
  const t = -b - Math.sqrt(h);
  return t > 0 ? t : Infinity;
}

function scale(m) { return m.scale.x; }

// Closest character hit along a ray: {target, t, head}
function rayCharacters(o, d, maxD) {
  let best = { target: null, t: maxD, head: false };
  const test = (c, x, z, k) => {
    const th = raySphere(o, d, x, 1.88 * k, z, 0.3 * k);
    const tb = Math.min(raySphere(o, d, x, 1.3 * k, z, 0.48 * k), raySphere(o, d, x, 0.55 * k, z, 0.42 * k));
    if (th < best.t && th <= tb) best = { target: c, t: th, head: true };
    else if (tb < best.t) best = { target: c, t: tb, head: false };
  };
  for (const s of shooters) if (s.alive) test(s, s.x, s.z, scale(s.model));
  for (const p of peds) if (p.state !== 'dead') test(p, p.x, p.z, 1);
  return best;
}

function rayVehicles(o, d, maxD) {
  let best = { v: null, t: maxD };
  for (const v of vehicles) {
    if (v === player.vehicle) continue;
    const t = raySphere(o, d, v.x, 0.9, v.z, v.spec.wid * 0.7);
    if (t < best.t) best = { v, t };
  }
  return best;
}

// ---- Player weapons -------------------------------------------------------------------
export function currentWeapon() { return WEAPONS[game.weapon]; }

export function cycleWeapon(dir = 1) {
  let i = game.weapon;
  for (let k = 0; k < WEAPONS.length; k++) {
    i = (i + dir + WEAPONS.length) % WEAPONS.length;
    if (game.weapons[WEAPONS[i].id]) break;
  }
  game.weapon = i;
  reloadT = 0;
  emit('weapon', WEAPONS[i]);
}

function reload() {
  const w = currentWeapon();
  if (!w.clip) return;
  const need = w.clip - game.clip[w.id];
  const take = Math.min(need, game.ammo[w.id]);
  if (take <= 0) return;
  reloadT = 1.1;
  game.ammo[w.id] -= take;
  game.clip[w.id] += take;
  emit('reload', w);
}

const _o = new THREE.Vector3(), _d = new THREE.Vector3();
export function playerFire(t) {
  const w = currentWeapon();
  if (w.id === 'fists') {
    player.punch = 1;
    emit('punch');
    for (const c of [...shooters.filter((s) => s.alive), ...peds.filter((p) => p.state !== 'dead')]) {
      const dx = c.x - player.x, dz = c.z - player.z, d = Math.hypot(dx, dz);
      const facing = (dx * Math.sin(player.yaw) + dz * Math.cos(player.yaw)) / (d || 1);
      if (d < w.range && facing > 0.5) { damageCharacter(c, w.damage, false, player.x, player.z); break; }
    }
    return;
  }
  if (game.clip[w.id] <= 0) { reload(); emit('dryfire'); return; }
  game.clip[w.id]--;
  game.stats.shots++;
  camera.getWorldDirection(_d);
  _d.x += (rand() - 0.5) * w.spread * 2; _d.y += (rand() - 0.5) * w.spread * 2; _d.z += (rand() - 0.5) * w.spread * 2;
  _d.normalize();
  _o.copy(camera.position);
  const wall = rayBuildings(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, w.range);
  const ground = _d.y < 0 ? -_o.y / _d.y : Infinity;
  const maxD = Math.min(w.range, wall, ground);
  const hc = rayCharacters(_o, _d, maxD);
  const hv = rayVehicles(_o, _d, Math.min(maxD, hc.t));
  const end = Math.min(maxD, hc.t, hv.t);
  const muzzle = muzzlePos();
  flash(muzzle.x, muzzle.y, muzzle.z, w.id === 'smg' ? 1.2 : 1.5);
  const hit = _o.clone().addScaledVector(_d, end === Infinity ? w.range : end);
  tracer(muzzle, hit);
  fx.shake = Math.max(fx.shake, w.id === 'smg' ? 0.08 : 0.15);
  emit('gunshot', { x: player.x, z: player.z, weapon: w.id, by: 'player' });
  if (hc.target && hc.t <= end) {
    game.stats.hits++;
    bumpSkill('shooting', 0.003);
    damageCharacter(hc.target, hc.head ? 999 : w.damage, hc.head, player.x, player.z, hit);
  } else if (hv.v && hv.t <= end) {
    hv.v.damage(w.damage * 0.35);
    sparks(hit.x, hit.y, hit.z, 6);
    if (hv.v.police) addWanted(1);
  } else if (end < Infinity) sparks(hit.x, hit.y, hit.z, 4, '#dddddd');
  // Shooting where cops can see is a crime.
  if (police.level === 0 && copsNear(45)) addWanted(1);
  void t;
}

function copsNear(r) {
  return vehicles.some((v) => v.police && Math.hypot(v.x - player.x, v.z - player.z) < r) || shooters.some((s) => s.alive && s.faction === 'police' && Math.hypot(s.x - player.x, s.z - player.z) < r);
}

export function muzzlePos() {
  const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
  return new THREE.Vector3(player.x + s * 0.9 - c * 0.42, 1.55, player.z + c * 0.9 + s * 0.42);
}

export function damageCharacter(c, dmg, head, fromX, fromZ, at) {
  if (c.isShooter) {
    c.health -= dmg;
    blood(at ? at.x : c.x, at ? at.y : 1.3, at ? at.z : c.z, head ? 14 : 6);
    if (c.health <= 0 && c.alive) {
      c.alive = false;
      c.deadT = 0;
      c.fallDir = Math.atan2(c.x - fromX, c.z - fromZ);
      game.stats.kills++;
      if (head) {
        game.stats.headshots++;
        addCash(HEADSHOT_BONUS);
        emit('popup', { text: `HEADSHOT +$${HEADSHOT_BONUS}`, x: c.x, y: 2.3, z: c.z, color: '#ffe14a', big: true });
      } else emit('popup', { text: c.boss ? 'BOSS DOWN' : 'DOWN', x: c.x, y: 2.2, z: c.z, color: '#ffffff' });
      if (c.faction === 'police') addWanted(2);
      emit('shooterDown', c);
    } else if (c.faction !== 'police' || police.level === 0) {
      if (c.faction === 'police') addWanted(1);
      c.alerted = true;
    }
  } else {
    c.health -= dmg;
    if (c.health <= 0) {
      knockDown(c, fromX, fromZ, 'shot');
      if (head) emit('popup', { text: 'HEADSHOT', x: c.x, y: 2.3, z: c.z, color: '#ffe14a' });
      emit('crime', { x: c.x, z: c.z, kind: 'assault' });
      if (police.level < 2) addWanted(1);
    } else { c.state = 'flee'; c.fleeT = 6; c.fx = c.x - fromX; c.fz = c.z - fromZ; const l = Math.hypot(c.fx, c.fz) || 1; c.fx /= l; c.fz /= l; }
  }
}

// ---- NPC shooters ------------------------------------------------------------------------
function updateShooter(s, dt, t) {
  if (!s.alive) {
    s.deadT += dt;
    const fall = Math.min(1, s.deadT * 4);
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
    // Close in to mid range, strafe while shooting
    s.strafeT -= dt;
    if (s.strafeT < 0) { s.strafe *= -1; s.strafeT = range(1, 2.5); }
    const want = s.faction === 'police' && police.level === 1 ? 1.4 : 11;
    const fwd = d > want + 2 ? 1 : d < want - 3 ? -0.6 : 0;
    const mx = (dx / d) * fwd + (-dz / d) * s.strafe * 0.6, mz = (dz / d) * fwd + (dx / d) * s.strafe * 0.6;
    speed = 3.4;
    s.x += mx * speed * dt; s.z += mz * speed * dt;
    const r = collideCircle(s.x, s.z, 0.45);
    s.x = r.x; s.z = r.z;
    s.phase += speed * dt * 1.6;
    s.cool -= dt;
    const canShoot = !(s.faction === 'police' && police.level < 2);
    if (canShoot && s.cool <= 0 && d < 50 && !sightBlocked(s.x, s.z, player.x, player.z)) {
      s.cool = range(0.5, 1.2) * (s.boss ? 0.6 : 1);
      npcShoot(s, d, t);
    }
    if (s.faction === 'police' && police.level === 1 && d < 2 && !player.vehicle) emit('cuffing', dt);
  }
  sync(s, speed);
}

function npcShoot(s, d, t) {
  const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
  const m = new THREE.Vector3(s.x + sy * 0.9 - cy * 0.42, 1.55, s.z + cy * 0.9 + sy * 0.42);
  flash(m.x, m.y, m.z, 1.2);
  const moving = player.vehicle ? player.vehicle.speed / 40 : player.speed / 12;
  const p = s.accuracy * (1 - Math.min(0.8, d / 60)) * (1 - moving * 0.6);
  const hit = rand() < p;
  const tx = player.x + (hit ? 0 : (rand() - 0.5) * 4), tz = player.z + (hit ? 0 : (rand() - 0.5) * 4);
  tracer(m, new THREE.Vector3(tx, hit ? 1.3 : rand() * 2, tz));
  emit('gunshot', { x: s.x, z: s.z, weapon: 'npc', by: s.faction });
  if (hit) hurtPlayer(s.boss ? 9 : 6, s.x, s.z);
  void t;
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

export function updateCombat(dt, t) {
  fireCooldown -= dt;
  if (reloadT > 0) reloadT -= dt;
  if (tapped('Tab') || tapped('KeyQ')) cycleWeapon(1);
  if (input.wheel) cycleWeapon(input.wheel > 0 ? 1 : -1);
  for (const [k, i] of [['Digit1', 0], ['Digit2', 1], ['Digit3', 2]]) {
    if (!tapped(k)) continue;
    if (game.weapons[WEAPONS[i].id]) { game.weapon = i; reloadT = 0; emit('weapon', WEAPONS[i]); continue; }
    // Story weapons unlock through missions: say which chapter instead of silently ignoring the key.
    const m = MISSIONS.find((d) => d.unlock === WEAPONS[i].id);
    emit('toast', { text: `${WEAPONS[i].name} LOCKED - unlocks in CH ${m ? m.chapter : '?'}`, color: '#ffd23f' });
  }
  if (tapped('KeyR')) reload();
  const w = currentWeapon();
  const wantsFire = w.auto ? input.fire : input.firePressed;
  if (game.mode === 'play' && !player.vehicle && wantsFire && fireCooldown <= 0 && reloadT <= 0) {
    fireCooldown = w.rate;
    playerFire(t);
  }
  updateFootCops(dt);
  for (let i = shooters.length - 1; i >= 0; i--) {
    const s = shooters[i];
    updateShooter(s, dt, t);
    if (!s.alive && s.deadT > 20 && !s.keep) { scene.remove(s.model); shooters.splice(i, 1); }
    else if (s.faction === 'police' && police.level === 0 && Math.hypot(s.x - player.x, s.z - player.z) > 60) { scene.remove(s.model); shooters.splice(i, 1); }
  }
  // Slow regen up to 40 health
  if (game.health < 40 && game.health > 0) game.health = Math.min(40, game.health + dt * 1.5);
}

export function isReloading() { return reloadT > 0; }
