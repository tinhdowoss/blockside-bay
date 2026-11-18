// Third-person camera: over-the-shoulder on foot, a chase cam behind the car that auto-centres when the
// mouse rests. Speed widens the FOV, adds a high-speed rumble and drives the post pass's speed streaks;
// impacts and gunfire shake it (Settings > SHAKE turns shake off).
import { input } from '../core/input.js';
import { game } from '../core/state.js';
import { rayBuildings } from '../world/city.js';
import { fx } from '../fx/effects.js';
import { post } from '../fx/post.js';
import { player } from './player.js';

const THREE = window.THREE;
let camera;
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const target = new THREE.Vector3(), want = new THREE.Vector3(), dir = new THREE.Vector3();
const smooth = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

export function setupCamera(cam) { camera = cam; }

// 0..1 'rush' of a car near its top speed: drives FOV, rumble and the speed streaks.
export const speedRush = (v) => smooth(0.45, 1, v.speed / v.spec.top);

export function updateCamera(dt, now) {
  const v = player.vehicle;
  let dist, height, side, lookAhead, rush = 0;
  if (v) {
    const mouseIdle = now - input.lastMouseMove > 1.2;
    if (mouseIdle && v.speed > 2) {
      const travel = v.forwardSpeed >= -1 ? v.heading : v.heading + Math.PI;
      const d = Math.atan2(Math.sin(travel - player.camYaw), Math.cos(travel - player.camYaw));
      player.camYaw += d * Math.min(1, dt * 3.2);
      player.camPitch += (0.2 - player.camPitch) * Math.min(1, dt * 2);
    }
    rush = speedRush(v);
    target.set(v.x, 1.6, v.z);
    dist = 9 + v.speed * 0.07 - rush * 1.2; height = 2.4 - rush * 0.5; side = 0; lookAhead = 4 + rush * 4;
    camera.fov += ((62 + Math.min(16, v.speed * 0.32) + rush * 6) - camera.fov) * Math.min(1, dt * 3);
  } else {
    target.set(player.x, 1.75, player.z);
    dist = player.aiming ? 3.6 : 4.8; height = 0.55; side = player.aiming ? 1.05 : 0.75; lookAhead = 8;
    camera.fov += (60 - camera.fov) * Math.min(1, dt * 4);
  }
  post.speed += (rush * 0.85 - post.speed) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
  const s = Math.sin(player.camYaw), c = Math.cos(player.camYaw);
  const cp = Math.cos(player.camPitch), sp = Math.sin(player.camPitch);
  want.set(target.x - s * dist * cp - c * side, target.y + height + sp * dist, target.z - c * dist * cp + s * side);
  // Keep the camera out of walls.
  dir.copy(want).sub(target);
  const len = dir.length(); dir.normalize();
  const hit = rayBuildings(target.x, target.y, target.z, dir.x, dir.y, dir.z, len);
  if (hit < len) want.copy(target).addScaledVector(dir, Math.max(1.2, hit - 0.4));
  camPos.lerp(want, v ? Math.min(1, dt * 10) : Math.min(1, dt * 18));
  camLook.set(target.x + s * lookAhead, target.y + 0.3 - (v ? 0 : sp * 2), target.z + c * lookAhead);
  camera.position.copy(camPos);
  if (game.shake !== false) {
    // Impacts/gunfire (fx.shake) plus a road rumble that builds with speed.
    const k = fx.shake + rush * rush * 0.06;
    if (k > 0) camera.position.add(want.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k * 0.5, (Math.random() - 0.5) * k));
  }
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
