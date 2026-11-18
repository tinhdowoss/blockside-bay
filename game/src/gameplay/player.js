// The player on foot (walk, sprint, collide, face the aim) and the hand-off of controls to a car.
// The camera lives in camera.js.
import { PLAYER } from '../core/config.js';
import { makeCharacter, animateCharacter } from '../world/models.js';
import { collideCircle } from '../world/city.js';
import { vehicles } from './vehicles.js';
import { input, key } from '../core/input.js';
import { snapCamera } from './camera.js';
import { game, bumpSkill } from '../core/state.js';
import { CAST } from '../data/cast.js';


export const player = {
  x: 60, z: 100, yaw: 0, vehicle: null, model: null,
  phase: 0, speed: 0, camYaw: 0, camPitch: 0.18, aiming: false, punch: 0,
  stamina: 1, hurt: 0, alive: true,
};

export function setupPlayer(scene) {
  const k = CAST.kai;
  player.model = makeCharacter({ skin: k.skin, shirt: '#ff4fa3', pants: '#1f2a4a', hair: k.hair, shoes: '#ffffff', stripe: '#ffffff' });
  scene.add(player.model);
}

export function placePlayer(x, z, yaw = 0) {
  player.x = x; player.z = z; player.yaw = yaw; player.camYaw = yaw;
  snapCamera();
}

export function updatePlayer(dt) {
  // Mouse look (both modes)
  const sens = game.sens ?? 1;
  player.camYaw -= input.mouseDX * 0.0025 * sens;
  player.camPitch = Math.max(-0.35, Math.min(0.9, player.camPitch + input.mouseDY * 0.002 * sens));
  if (player.vehicle) {
    driveControls(player.vehicle);
    player.x = player.vehicle.x; player.z = player.vehicle.z;
    player.model.visible = false;
    return;
  }
  player.model.visible = true;
  const fwd = (key('KeyW') ? 1 : 0) - (key('KeyS') ? 1 : 0);
  const side = (key('KeyD') ? 1 : 0) - (key('KeyA') ? 1 : 0);
  const sprint = key('ShiftLeft') || key('ShiftRight');
  let mx = 0, mz = 0;
  if (fwd || side) {
    const s = Math.sin(player.camYaw), c = Math.cos(player.camYaw);
    mx = s * fwd - c * side;
    mz = c * fwd + s * side;
    const l = Math.hypot(mx, mz); mx /= l; mz /= l;
  }
  const canSprint = sprint && player.stamina > 0.05;
  const spd = (fwd || side) ? (canSprint ? PLAYER.sprint : PLAYER.walk) : 0;
  player.stamina = Math.max(0, Math.min(1, player.stamina + (canSprint && spd ? -0.18 : 0.25) * dt));
  if (canSprint && spd) bumpSkill('stamina', dt * 0.0015);
  player.speed += (spd - player.speed) * Math.min(1, dt * 10);
  player.x += mx * player.speed * dt;
  player.z += mz * player.speed * dt;
  const r = collideCircle(player.x, player.z, PLAYER.radius);
  player.x = r.x; player.z = r.z;
  for (const v of vehicles) {
    const dx = player.x - v.x, dz = player.z - v.z, d = Math.hypot(dx, dz), m = v.spec.len * 0.45;
    if (d < m && d > 0.01) { player.x = v.x + (dx / d) * m; player.z = v.z + (dz / d) * m; }
  }
  game.stats.distance += player.speed * dt;
  // Facing: aim direction while armed or shooting, else movement direction.
  player.aiming = game.weapon > 0 || input.fire;
  const targetYaw = player.aiming ? player.camYaw : (spd ? Math.atan2(mx, mz) : player.yaw);
  let dy = targetYaw - player.yaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  player.yaw += dy * Math.min(1, dt * 14);
  player.phase += player.speed * dt * 1.6;
  player.punch = Math.max(0, player.punch - dt * 3);
  syncModel();
}

export function syncModel() {
  player.model.position.set(player.x, 0, player.z);
  player.model.rotation.y = player.yaw;
  animateCharacter(player.model, player.phase, Math.min(1, player.speed / 5), player.aiming && game.weapon > 0, player.punch);
  player.model.userData.parts.gun.visible = game.weapon > 0;
}

function driveControls(v) {
  const c = v.controls;
  c.throttle = key('KeyW') ? 1 : 0;
  c.brake = key('KeyS') ? 1 : 0;
  c.steer = (key('KeyD') ? 1 : 0) - (key('KeyA') ? 1 : 0);
  c.handbrake = key('ShiftLeft') || key('ShiftRight') || key('Space');
  if (v.drift > 5 && v.speed > 14) bumpSkill('driving', 0.0004);
}
