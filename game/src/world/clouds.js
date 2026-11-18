// Voxel clouds: chunky stacked boxes in one InstancedMesh that drift with the sea breeze and wrap
// around the player. They pick up the sky: white by day, peach and pink at golden hour, violet at night.
import { makeRng } from '../core/rng.js';
import { sky } from './daylight.js';

const THREE = window.THREE;
const RANGE = 900;            // clouds live in a square of this half-size around the player
const WIND = { x: 2.4, z: 0.7 };

export const clouds = { mesh: null, list: [], parts: 0, offX: 0, offZ: 0 };

export function buildClouds(scene) {
  const r = makeRng(4242);
  const parts = [];
  for (let i = 0; i < 46; i++) {
    const cloud = { x: (r() - 0.5) * RANGE * 2, z: (r() - 0.5) * RANGE * 2, y: 95 + r() * 55, parts: [] };
    const big = 0.7 + r() * 0.9;
    // A flat base slab, then 2-3 layers of smaller puffs stepping up (classic voxel cumulus).
    const baseW = (26 + r() * 30) * big, baseD = (14 + r() * 14) * big;
    cloud.parts.push([0, 0, 0, baseW, 5 * big, baseD]);
    const layers = 1 + Math.floor(r() * 3);
    for (let l = 1; l <= layers; l++) {
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const w = baseW * (0.35 + r() * 0.35) / l * 1.4, d = baseD * (0.4 + r() * 0.4);
        cloud.parts.push([(r() - 0.5) * (baseW - w) * 0.8, l * 4.6 * big, (r() - 0.5) * (baseD - d) * 0.6, w, 5 * big, d]);
      }
    }
    // Ragged fringe blocks along the base
    for (let k = 0; k < 2; k++) cloud.parts.push([(r() - 0.5) * baseW, -1.5 * big, (r() - 0.5) * baseD, 6 + r() * 8, 3, 5 + r() * 6]);
    clouds.list.push(cloud);
    parts.push(...cloud.parts);
  }
  clouds.parts = parts.length;
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: new THREE.Color('#9fb8d8'), emissiveIntensity: 0.55, fog: false });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, parts.length);
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  scene.add(mesh);
  clouds.mesh = mesh;
  updateClouds(0, { x: 0, z: 0 });
}

const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
const tint = new THREE.Color(), WHITE = new THREE.Color('#ffffff'), NIGHT = new THREE.Color('#4a3a8a');
const wrap = (v, c) => { const s = RANGE * 2; return ((((v - c + RANGE) % s) + s) % s) - RANGE + c; };

export function updateClouds(dt, focus) {
  if (!clouds.mesh) return;
  clouds.offX += WIND.x * dt; clouds.offZ += WIND.z * dt;
  let i = 0;
  for (const c of clouds.list) {
    const cx = wrap(c.x + clouds.offX, focus.x), cz = wrap(c.z + clouds.offZ, focus.z);
    for (const p of c.parts) {
      pos.set(cx + p[0], c.y + p[1], cz + p[2]);
      scl.set(p[3], p[4], p[5]);
      m4.compose(pos, quat, scl);
      clouds.mesh.setMatrixAt(i++, m4);
    }
  }
  clouds.mesh.instanceMatrix.needsUpdate = true;
  // Light: the undersides glow with the horizon colour at golden hour, dim violet at night.
  const mat = clouds.mesh.material;
  tint.copy(WHITE).lerp(sky.horizon, 0.35 + sky.golden * 0.4).lerp(NIGHT, sky.night * 0.8);
  mat.emissive.copy(tint);
  mat.emissiveIntensity = 0.5 + sky.golden * 0.2 - sky.night * 0.25;
}
