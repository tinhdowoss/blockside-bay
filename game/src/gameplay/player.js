// The player on foot (walk, sprint, crouch, dodge roll, collide, face the aim) and the hand-off of
// controls to a car. The camera lives in camera.js.
import { PLAYER } from '../core/config.js';
import { makeCharacter, animateCharacter } from '../world/models.js';
import { collideCircle } from '../world/city.js';
import { vehicles } from './vehicles.js';
import { input, key, tapped } from '../core/input.js';
import { snapCamera } from './camera.js';
import { game, bumpSkill, emit } from '../core/state.js';
import { CAST } from '../data/cast.js';

const ROLL_TIME = 0.42;   // seconds a dodge roll lasts

export const player = {
  x: 60, z: 100, yaw: 0, vehicle: null, model: null,
  phase: 0, speed: 0, camYaw: 0, camPitch: 0.18, aiming: false, punch: 0,
  stamina: 1, hurt: 0, alive: true, crouch: false, rolling: 0, rollCD: 0, rollDir: null,
};

/** Builds Kai's voxel model and adds it to the scene. */
export function setupPlayer(scene) {
  const kai = CAST.kai;
  player.model = makeCharacter({ skin: kai.skin, shirt: '#ff4fa3', pants: '#1f2a4a', hair: kai.hair, shoes: '#ffffff', stripe: '#ffffff' });
  scene.add(player.model);
}

/** Teleports the player (standing, not rolling) and snaps the camera behind them. */
export function placePlayer(x, z, yaw = 0) {
  player.x = x; player.z = z; player.yaw = yaw; player.camYaw = yaw;
  player.crouch = false; player.rolling = 0;
  snapCamera();
}

/** Per-frame: mouse look, then either drive the current vehicle or move on foot. */
export function updatePlayer(dt) {
  // Mouse look (both modes)
  const sens = game.sens ?? 1;
  player.camYaw -= input.mouseDX * 0.0025 * sens;
  player.camPitch = Math.max(-0.35, Math.min(0.9, player.camPitch + input.mouseDY * 0.002 * sens * (game.invertY ? -1 : 1)));
  if (player.vehicle) {
    const v = player.vehicle;
    driveControls(v);
    player.x = v.x; player.z = v.z;
    // On the scooter Kai stays visible in the saddle, leaning with it; in cars and boats he is hidden.
    player.model.visible = !!v.spec.bike;
    if (v.spec.bike) {
      const m = player.model, fwdX = Math.sin(v.heading), fwdZ = Math.cos(v.heading);
      m.position.set(v.x - fwdX * 0.3, 0.1, v.z - fwdZ * 0.3);
      m.rotation.set(0, v.heading, 0);
      m.rotateZ(v.roll);
      m.scale.set(1, 1, 1);
      animateCharacter(m, 0, 0, true);
      m.userData.parts.legL.rotation.x = m.userData.parts.legR.rotation.x = -1.2;
      m.userData.parts.gun.visible = false;
    }
    return;
  }
  player.model.visible = true;
  const fwd = (key('KeyW') ? 1 : 0) - (key('KeyS') ? 1 : 0);
  const side = (key('KeyD') ? 1 : 0) - (key('KeyA') ? 1 : 0);
  const sprint = key('ShiftLeft') || key('ShiftRight');
  // Camera-relative move direction (unit length, or zero when no key is held).
  let mx = 0, mz = 0;
  if (fwd || side) {
    const s = Math.sin(player.camYaw), c = Math.cos(player.camYaw);
    mx = s * fwd - c * side;
    mz = c * fwd + s * side;
    const l = Math.hypot(mx, mz); mx /= l; mz /= l;
  }
  // C toggles a crouch (slower, steadier aim, hides behind crates); sprinting stands up.
  if (tapped('KeyC')) { player.crouch = !player.crouch; emit('crouch', player.crouch); }
  if (sprint && (fwd || side)) player.crouch = false;
  // SPACE: a quick dodge roll in the move direction (backwards when standing still). Bullets miss
  // during the roll; it costs stamina and has a short cooldown.
  player.rollCD = Math.max(0, (player.rollCD || 0) - dt);
  if (tapped('Space') && !player.rolling && player.rollCD <= 0 && player.stamina > 0.2) {
    const s = Math.sin(player.camYaw), c = Math.cos(player.camYaw);
    player.rollDir = (fwd || side) ? { x: mx, z: mz } : { x: -s, z: -c };
    player.rolling = ROLL_TIME; player.rollCD = 0.9; player.stamina -= 0.2; player.crouch = false;
    emit('roll');
  }
  const canSprint = sprint && player.stamina > 0.05;
  const spd = (fwd || side) ? (canSprint ? PLAYER.sprint : player.crouch ? PLAYER.walk * 0.5 : PLAYER.walk) : 0;
  player.stamina = Math.max(0, Math.min(1, player.stamina + (canSprint && spd ? -0.18 : 0.25) * dt));
  if (canSprint && spd) bumpSkill('stamina', dt * 0.0015);
  player.speed += (spd - player.speed) * Math.min(1, dt * 10);
  if (player.rolling > 0) {
    player.rolling = Math.max(0, player.rolling - dt);
    mx = player.rollDir.x; mz = player.rollDir.z;
    player.speed = 11;
  }
  player.x += mx * player.speed * dt;
  player.z += mz * player.speed * dt;
  const r = collideCircle(player.x, player.z, PLAYER.radius);
  player.x = r.x; player.z = r.z;
  // Push out of vehicles (a circle of 45 % of the car's length).
  for (const v of vehicles) {
    const dx = player.x - v.x, dz = player.z - v.z, d = Math.hypot(dx, dz), m = v.spec.len * 0.45;
    if (d < m && d > 0.01) { player.x = v.x + (dx / d) * m; player.z = v.z + (dz / d) * m; }
  }
  game.stats.walked = (game.stats.walked || 0) + player.speed * dt;
  // Facing: aim direction while armed or shooting, else movement direction.
  player.aiming = game.weapon > 0 || input.fire;
  const targetYaw = player.rolling > 0 ? Math.atan2(mx, mz) : player.aiming ? player.camYaw : (spd ? Math.atan2(mx, mz) : player.yaw);
  let dy = targetYaw - player.yaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  player.yaw += dy * Math.min(1, dt * 14);
  player.phase += player.speed * dt * 1.6;
  player.punch = Math.max(0, player.punch - dt * 3);
  syncModel();
}

/** Poses the player model from the current state (walk cycle, aim, punch, crouch, roll tumble). */
export function syncModel() {
  const m = player.model;
  m.position.set(player.x, 0, player.z);
  m.rotation.set(0, player.yaw, 0);
  m.scale.set(1, player.crouch ? 0.7 : 1, 1);
  animateCharacter(m, player.phase, Math.min(1, player.speed / 5), player.aiming && game.weapon > 0, player.punch);
  if (player.rolling > 0) {
    // Tuck and tumble forward once over the roll.
    const k = 1 - player.rolling / ROLL_TIME;
    m.position.y = 0.55 - Math.abs(Math.cos(k * Math.PI)) * 0.25;
    m.rotateX(k * Math.PI * 2);
    m.scale.set(1, 0.72, 1);
  }
  m.userData.parts.gun.visible = game.weapon > 0 && !(player.rolling > 0);
}

// WASD drive, Shift/Space handbrake; long fast drifts train the driving skill.
function driveControls(v) {
  const c = v.controls;
  c.throttle = key('KeyW') ? 1 : 0;
  c.brake = key('KeyS') ? 1 : 0;
  c.steer = (key('KeyD') ? 1 : 0) - (key('KeyA') ? 1 : 0);
  c.handbrake = key('ShiftLeft') || key('ShiftRight') || key('Space');
  if (v.drift > 5 && v.speed > 14) bumpSkill('driving', 0.0004);
}
