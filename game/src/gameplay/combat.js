// Combat core: the shooter list (gang members, bosses, foot cops), damage to the player (armor first,
// none while dodge-rolling, less inside a vehicle) and to characters (headshots, takedowns, crimes), the
// ray tests weapons use, and slow health regen. Weapons live in weapons.js, the NPC brains in enemies.js.
import { HEADSHOT_BONUS } from '../core/config.js';
import { makeCharacter, animateCharacter } from '../world/models.js';
import { player } from './player.js';
import { peds, knockDown } from '../world/pedestrians.js';
import { vehicles } from './vehicles.js';
import { police, addWanted } from './police.js';
import { game, emit, addCash } from '../core/state.js';
import { blood } from '../fx/effects.js';
import { rand, range } from '../core/rng.js';

export const shooters = [];
let scene;

// Default outfit per faction; spawnShooter's opts.look overrides individual pieces.
const GANG_LOOKS = {
  vipers: { shirt: '#a020f0', pants: '#1a1a1a', bandana: '#3fff6b', skin: '#c98a5e', hair: '#111111', shades: true },
  salt: { shirt: '#f4f4f4', pants: '#2b3a67', bandana: '#1d6fff', skin: '#e0a77a', hair: '#3a2010' },
  police: { shirt: '#1d3c8f', pants: '#1d2440', hat: '#1d2440', badge: true, skin: '#a8714c', hair: '#111111' },
};

/** Remembers the scene that shooter models are added to. */
export function setupCombat(sc) { scene = sc; }

/** Spawns an armed NPC of a faction (vipers, salt, police); opts: boss, name, guard, accuracy, tag, role, look. */
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
    role: opts.role || null, ai: 'idle', aiT: 0, crouch: false, goal: null,
  };
  shooters.push(s);
  syncShooter(s, 0);
  return s;
}

/** Removes every shooter the filter accepts (default: all). */
export function clearShooters(filter = () => true) {
  for (let i = shooters.length - 1; i >= 0; i--) {
    if (!filter(shooters[i])) continue;
    scene.remove(shooters[i].model);
    shooters.splice(i, 1);
  }
}

/** Removes the shooter at index i. */
export function removeShooter(i) { scene.remove(shooters[i].model); shooters.splice(i, 1); }

/** Poses a shooter's model: walking, aiming, or ducked low behind cover. */
export function syncShooter(s, speed) {
  const k = s.boss ? 1.12 : 1;
  s.model.position.set(s.x, 0, s.z);
  s.model.rotation.set(0, s.yaw, 0);
  s.model.scale.set(k, k * (s.crouch ? 0.68 : 1), k);
  animateCharacter(s.model, s.phase, Math.min(1, speed / 4), true);
}

// ---- Damage to the player --------------------------------------------------------------
/** Hurts the player by n from a direction: armor soaks 70 %, vehicles cut it to 40 %, rolls dodge it. */
export function hurtPlayer(n, fromX, fromZ) {
  if (game.mode !== 'play' || player.rolling > 0) return;
  if (player.vehicle) n *= 0.4;
  const absorbed = Math.min(game.armor, n * 0.7);
  game.armor -= absorbed;
  game.health -= n - absorbed;
  player.hurt = 0.4;
  emit('hurt', { fromX, fromZ });
  if (game.health <= 0) { game.health = 0; emit('playerDown', 'shot'); }
}

// ---- Ray tests --------------------------------------------------------------------------
// Distance along unit ray (o, d) to a sphere, or Infinity on a miss / behind the origin.
function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - c;
  if (h < 0) return Infinity;
  const t = -b - Math.sqrt(h);
  return t > 0 ? t : Infinity;
}

/** Characters hit along a ray, nearest first, at most `max` of them: [{ target, t, head }].
 *  Each body is a head sphere plus two torso/leg spheres; crouched shooters are shorter (their spheres sit lower). */
export function rayCharacters(o, d, maxD, max = 1) {
  const hits = [];
  const test = (c, x, z, k, ky) => {
    const tHead = raySphere(o, d, x, 1.88 * ky, z, 0.3 * k);
    const tBody = Math.min(raySphere(o, d, x, 1.3 * ky, z, 0.48 * k), raySphere(o, d, x, 0.55 * ky, z, 0.42 * k));
    const t = Math.min(tHead, tBody);
    if (t < maxD) hits.push({ target: c, t, head: tHead <= tBody });
  };
  for (const s of shooters) if (s.alive) test(s, s.x, s.z, s.model.scale.x, s.model.scale.y);
  for (const p of peds) if (p.state !== 'dead') test(p, p.x, p.z, 1, 1);
  hits.sort((a, b) => a.t - b.t);
  return hits.slice(0, max);
}

/** Nearest vehicle (other than the player's) a ray hits before maxD: { v, t } with v null on a miss. */
export function rayVehicles(o, d, maxD) {
  let best = { v: null, t: maxD };
  for (const v of vehicles) {
    if (v === player.vehicle) continue;
    const t = raySphere(o, d, v.x, 0.9, v.z, v.spec.wid * 0.7);
    if (t < best.t) best = { v, t };
  }
  return best;
}

// ---- Damage to characters -----------------------------------------------------------------
/** Applies dmg to a shooter or pedestrian: takedown popups and bonuses, wanted stars for crimes, flee on survival. */
export function damageCharacter(c, dmg, head, fromX, fromZ, at) {
  if (c.isShooter) {
    c.health -= dmg;
    blood(at ? at.x : c.x, at ? at.y : 1.3, at ? at.z : c.z, head ? 14 : 6);
    if (c.health <= 0 && c.alive) {
      c.alive = false;
      c.deadT = 0;
      c.crouch = false;
      c.fallDir = Math.atan2(c.x - fromX, c.z - fromZ);
      game.stats.kills++;
      c.headshot = head;
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
    } else {
      c.state = 'flee'; c.fleeT = 6; c.fx = c.x - fromX; c.fz = c.z - fromZ;
      const l = Math.hypot(c.fx, c.fz) || 1; c.fx /= l; c.fz /= l;
    }
  }
}

/** Slow health regen (1.5 HP/s) while below 40, capped at 40. */
export function updateCombat(dt) {
  if (game.health < 40 && game.health > 0) game.health = Math.min(40, game.health + dt * 1.5);
}
