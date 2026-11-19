// The player's weapons: five slots (fists, pistol, SMG, SCATTER, SEA LANCE) picked with 1-5 / Tab / wheel,
// reloads with a per-gun time, recoil that kicks the camera up and blooms the spread (crouching steadies
// both), hit markers with a tick, pellets for the scatter gun and a harpoon that pierces up to 3 bodies.
import { WEAPONS } from '../core/config.js';
import { MISSIONS } from '../data/missions-data.js';
import { rayBuildings } from '../world/city.js';
import { player } from './player.js';
import { peds } from '../world/pedestrians.js';
import { vehicles } from './vehicles.js';
import { police, addWanted } from './police.js';
import { shooters, damageCharacter, rayCharacters, rayVehicles } from './combat.js';
import { input, tapped } from '../core/input.js';
import { game, emit, bumpSkill } from '../core/state.js';
import { flash, tracer, sparks, fx } from '../fx/effects.js';
import { rand } from '../core/rng.js';

const THREE = window.THREE;
let camera, fireCooldown = 0, reloadT = 0, bloom = 0;
// Scratch vectors for the shot ray (origin, direction).
const _o = new THREE.Vector3(), _d = new THREE.Vector3();

/** Hands the module the camera that shots are fired along. */
export function setupWeapons(cam) { camera = cam; }
/** The WEAPONS entry in hand. */
export const currentWeapon = () => WEAPONS[game.weapon];
export const isReloading = () => reloadT > 0;
/** Current extra spread from recoil (0 when settled); the HUD crosshair opens with it. */
export const aimBloom = () => bloom;
/** The crosshair ray (camera position + direction), as plain numbers. */
export function aimRay() {
  camera.getWorldDirection(_d);
  return { o: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, d: { x: _d.x, y: _d.y, z: _d.z } };
}

function select(i) {
  game.weapon = i;
  reloadT = 0;
  emit('weapon', WEAPONS[i]);
}

/** Steps to the next (dir 1) or previous (dir -1) unlocked weapon. */
export function cycleWeapon(dir = 1) {
  let i = game.weapon;
  for (let k = 0; k < WEAPONS.length; k++) {
    i = (i + dir + WEAPONS.length) % WEAPONS.length;
    if (game.weapons[WEAPONS[i].id]) break;
  }
  select(i);
}

/** Refills the clip from reserve ammo (10 % faster crouched); does nothing if full, empty or already reloading. */
export function reload() {
  const w = currentWeapon();
  if (!w.clip || reloadT > 0) return;
  const take = Math.min(w.clip - game.clip[w.id], game.ammo[w.id] || 0);
  if (take <= 0) return;
  reloadT = (w.reloadT || 1.2) * (player.crouch ? 0.9 : 1);
  game.ammo[w.id] -= take;
  game.clip[w.id] += take;
  emit('reload', w);
}

/** World position of the gun muzzle in Kai's right hand. */
export function muzzlePos() {
  const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
  return new THREE.Vector3(player.x + s * 0.9 - c * 0.42, player.crouch ? 1.15 : 1.55, player.z + c * 0.9 + s * 0.42);
}

/** One trigger pull: a punch with fists, otherwise a shot (or pellet burst) with flash, recoil and crime check. */
export function playerFire() {
  const w = currentWeapon();
  if (w.id === 'fists') {
    player.punch = 1;
    emit('punch');
    // The first character in reach and roughly in front takes the punch.
    for (const c of [...shooters.filter((s) => s.alive), ...peds.filter((p) => p.state !== 'dead')]) {
      const dx = c.x - player.x, dz = c.z - player.z, d = Math.hypot(dx, dz);
      const facing = (dx * Math.sin(player.yaw) + dz * Math.cos(player.yaw)) / (d || 1);
      if (d < w.range && facing > 0.5) { const was = c.alive; damageCharacter(c, w.damage, false, player.x, player.z); if (c.isShooter) emit('hitMarker', { head: false, kill: was && !c.alive }); break; }
    }
    return;
  }
  if (game.clip[w.id] <= 0) { reload(); emit('dryfire'); return; }
  game.clip[w.id]--;
  game.stats.shots++;
  const muzzle = muzzlePos();
  flash(muzzle.x, muzzle.y, muzzle.z, w.id === 'smg' ? 1.2 : w.pellets ? 2.1 : 1.5);
  fx.shake = Math.max(fx.shake, (w.kick || 0.03) * 3.5);
  emit('gunshot', { x: player.x, z: player.z, weapon: w.id, by: 'player' });
  let landed = false;
  for (let k = 0; k < (w.pellets || 1); k++) landed = fireRay(w, muzzle) || landed;
  if (landed) { game.stats.hits++; bumpSkill('shooting', 0.003); }
  // Recoil: the camera kicks up and the spread blooms; crouching halves both.
  const steady = player.crouch ? 0.5 : 1;
  player.camPitch = Math.max(-0.35, player.camPitch - (w.kick || 0) * steady * (0.8 + rand() * 0.4));
  player.camYaw += (rand() - 0.5) * (w.kick || 0) * 0.5 * steady;
  bloom = Math.min(0.08, bloom + (w.bloom || 0) * steady);
  // Shooting where cops can see is a crime.
  if (police.level === 0 && copsNear(45)) addWanted(1);
}

// One bullet, pellet or harpoon from the camera along the crosshair. Returns true on a character hit.
function fireRay(w, muzzle) {
  camera.getWorldDirection(_d);
  const moving = player.speed > 1 ? 0.012 : 0;
  const spread = (w.spread * (player.crouch ? 0.6 : 1)) + bloom + moving;
  _d.x += (rand() - 0.5) * spread * 2; _d.y += (rand() - 0.5) * spread * 2; _d.z += (rand() - 0.5) * spread * 2;
  _d.normalize();
  _o.copy(camera.position);
  const wall = rayBuildings(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, w.range);
  const ground = _d.y < 0 ? -_o.y / _d.y : Infinity;
  const maxD = Math.min(w.range, wall, ground);
  const hits = rayCharacters(_o, _d, maxD, w.pierce || 1);
  const hv = rayVehicles(_o, _d, Math.min(maxD, hits.length ? hits[0].t : maxD));
  const carFirst = !!hv.v;   // rayVehicles only reports cars nearer than the first body
  const stopAt = carFirst ? hv.t : hits.length ? hits[hits.length - 1].t : maxD;
  const hit = _o.clone().addScaledVector(_d, stopAt === Infinity ? w.range : stopAt);
  tracer(muzzle, hit);
  if (w.id === 'lance') sparks(hit.x, hit.y, hit.z, 8, '#5ffff0');
  if (hits.length && !carFirst) {
    let head = false, kill = false;
    for (const h of hits) {
      const was = h.target.alive !== false && h.target.state !== 'dead';
      const at = _o.clone().addScaledVector(_d, h.t);
      damageCharacter(h.target, h.head ? 999 : w.damage, h.head, player.x, player.z, at);
      sparks(at.x, at.y, at.z, 5, '#ffe9a0');
      head ||= h.head;
      kill ||= was && (h.target.isShooter ? !h.target.alive : h.target.state === 'dead');
    }
    emit('hitMarker', { head, kill });
    return true;
  }
  if (carFirst) {
    hv.v.damage(w.damage * 0.35);
    sparks(hit.x, hit.y, hit.z, 10);
    if (hv.v.police) addWanted(1);
  } else if (stopAt < Infinity) sparks(hit.x, hit.y, hit.z, 6, '#fff0c0');
  return false;
}

// Any police car or living foot cop within r metres.
function copsNear(r) {
  return vehicles.some((v) => v.police && Math.hypot(v.x - player.x, v.z - player.z) < r) || shooters.some((s) => s.alive && s.faction === 'police' && Math.hypot(s.x - player.x, s.z - player.z) < r);
}

/** Per-frame: cooldowns, recoil settle, weapon switching keys, reload (manual and automatic) and the trigger. */
export function updateWeapons(dt) {
  fireCooldown -= dt;
  bloom *= Math.exp(-dt * (player.crouch ? 7 : 4.5));
  if (reloadT > 0) reloadT -= dt;
  if (tapped('Tab') || tapped('KeyQ')) cycleWeapon(1);
  if (input.wheel) cycleWeapon(input.wheel > 0 ? 1 : -1);
  WEAPONS.forEach((w, i) => {
    if (!tapped(`Digit${i + 1}`)) return;
    if (game.weapons[w.id]) { select(i); return; }
    // Story weapons unlock through missions (or the gun counter): say how instead of ignoring the key.
    const m = MISSIONS.find((d) => d.unlock === w.id);
    emit('toast', { text: `${w.name} LOCKED - unlocks in CH ${m ? m.chapter : '?'}`, color: '#ffd23f' });
  });
  if (tapped('KeyR')) reload();
  const w = currentWeapon();
  // An empty clip reloads on its own once the trigger is let go.
  if (w.clip && game.clip[w.id] <= 0 && !input.fire && reloadT <= 0 && (game.ammo[w.id] || 0) > 0) reload();
  const wantsFire = w.auto ? input.fire : input.firePressed;
  if (game.mode === 'play' && !player.vehicle && !player.rolling && wantsFire && fireCooldown <= 0 && reloadT <= 0) {
    fireCooldown = w.rate;
    playerFire();
  }
}
