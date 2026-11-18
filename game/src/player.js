// The player on foot (walk, sprint, collide) and the camera: over-shoulder on foot, smooth chase cam in a car.
import { PLAYER } from './config.js';
import { makeCharacter, animateCharacter } from './models.js';
import { collideCircle, rayBuildings } from './city.js';
import { vehicles } from './vehicles.js';
import { input, key } from './input.js';
import { fx } from './effects.js';
import { game, bumpSkill } from './state.js';
import { CAST } from './cast.js';

const THREE = window.THREE;

export const player = {
  x: 60, z: 100, yaw: 0, vehicle: null, model: null,
  phase: 0, speed: 0, camYaw: 0, camPitch: 0.18, aiming: false, punch: 0,
  stamina: 1, hurt: 0, alive: true,
};
let camera;
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();

export function setupPlayer(scene, cam) {
  camera = cam;
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

// Camera: over-shoulder on foot, chase behind the car (auto-centres when the mouse rests).
export function updateCamera(dt, now) {
  const v = player.vehicle;
  let target, dist, height, side, lookAhead;
  if (v) {
    const mouseIdle = now - input.lastMouseMove > 1.2;
    if (mouseIdle && v.speed > 2) {
      let travel = v.forwardSpeed >= -1 ? v.heading : v.heading + Math.PI;
      let d = travel - player.camYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      player.camYaw += d * Math.min(1, dt * 3.2);
      player.camPitch += (0.2 - player.camPitch) * Math.min(1, dt * 2);
    }
    target = new THREE.Vector3(v.x, 1.6, v.z);
    dist = 9 + v.speed * 0.07; height = 2.4; side = 0; lookAhead = 4;
    camera.fov += ((62 + Math.min(16, v.speed * 0.32)) - camera.fov) * Math.min(1, dt * 3);
  } else {
    target = new THREE.Vector3(player.x, 1.75, player.z);
    dist = player.aiming ? 3.6 : 4.8; height = 0.55; side = player.aiming ? 1.05 : 0.75; lookAhead = 8;
    camera.fov += (60 - camera.fov) * Math.min(1, dt * 4);
  }
  camera.updateProjectionMatrix();
  const s = Math.sin(player.camYaw), c = Math.cos(player.camYaw);
  const cp = Math.cos(player.camPitch), sp = Math.sin(player.camPitch);
  const want = new THREE.Vector3(
    target.x - s * dist * cp - c * side,
    target.y + height + sp * dist,
    target.z - c * dist * cp + s * side,
  );
  // Keep the camera out of walls.
  const dir = want.clone().sub(target);
  const len = dir.length(); dir.normalize();
  const hit = rayBuildings(target.x, target.y, target.z, dir.x, dir.y, dir.z, len);
  if (hit < len) want.copy(target).addScaledVector(dir, Math.max(1.2, hit - 0.4));
  const k = v ? Math.min(1, dt * 10) : Math.min(1, dt * 18);
  camPos.lerp(want, k);
  camLook.set(target.x + s * lookAhead, target.y + 0.3 - (v ? 0 : sp * 2), target.z + c * lookAhead);
  camera.position.copy(camPos);
  if (fx.shake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake * 0.5, (Math.random() - 0.5) * fx.shake));
  camera.lookAt(camLook);
}

export function snapCamera() {
  camPos.set(player.x - Math.sin(player.camYaw) * 8, 4, player.z - Math.cos(player.camYaw) * 8);
}

// Direct camera placement for menus and screenshot staging.
export function setCameraPose(px, py, pz, lx, ly, lz) {
  camPos.set(px, py, pz);
  camera.position.copy(camPos);
  camLook.set(lx, ly, lz);
  camera.lookAt(camLook);
}
