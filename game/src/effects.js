// Particles (smoke, sparks, debris), muzzle flashes, bullet tracers and camera shake.
import { glowTexture } from './textures.js';
import { rand } from './rng.js';

const THREE = window.THREE;
const MAX = 600;
const parts = [];
let inst, flashSprite, flashLight, scene;
const tracers = [];
const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
export const fx = { shake: 0 };

export function setupEffects(sc) {
  scene = sc;
  inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX);
  inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  inst.count = 0;
  inst.frustumCulled = false;
  scene.add(inst);
  flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#ffe08a'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flashSprite.visible = false;
  scene.add(flashSprite);
  flashLight = new THREE.PointLight(0xffc060, 0, 14, 1.5);
  scene.add(flashLight);
  for (let i = 0; i < 24; i++) {
    // A thin glowing box stretched between muzzle and impact.
    const line = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
}

const col = new THREE.Color();
export function spawn(x, y, z, vx, vy, vz, life, size, color, opts = {}) {
  if (parts.length >= MAX) parts.shift();
  parts.push({ x, y, z, vx, vy, vz, life, max: life, size, color: col.set(color).clone(), grow: opts.grow || 0, grav: opts.grav ?? 0 });
}

export function smoke(x, y, z, color = '#9a9a9a', n = 1) {
  for (let i = 0; i < n; i++) spawn(x + (rand() - 0.5), y, z + (rand() - 0.5), (rand() - 0.5) * 0.8, 1.2 + rand(), (rand() - 0.5) * 0.8, 1.4, 0.5, color, { grow: 1.2 });
}

export function sparks(x, y, z, n = 10, color = '#ffd040') {
  for (let i = 0; i < n; i++) spawn(x, y, z, (rand() - 0.5) * 10, rand() * 6, (rand() - 0.5) * 10, 0.4 + rand() * 0.3, 0.15, color, { grav: 18 });
}

export function blood(x, y, z, n = 8) {
  for (let i = 0; i < n; i++) spawn(x, y, z, (rand() - 0.5) * 4, rand() * 4, (rand() - 0.5) * 4, 0.6, 0.18, '#c0102a', { grav: 14 });
}

export function explosion(x, y, z) {
  for (let i = 0; i < 40; i++) spawn(x, y + 1, z, (rand() - 0.5) * 16, rand() * 12, (rand() - 0.5) * 16, 0.8 + rand() * 0.5, 0.6, i % 2 ? '#ff8a1a' : '#ffd040', { grav: 6, grow: 1 });
  for (let i = 0; i < 20; i++) smoke(x, y + 2, z, '#3a3a3a');
  fx.shake = Math.max(fx.shake, 1.2);
  flash(x, y + 1, z, 6);
}

let flashT = 0;
export function flash(x, y, z, scale = 1.4) {
  flashSprite.position.set(x, y, z);
  flashSprite.scale.setScalar(scale);
  flashSprite.visible = true;
  flashLight.position.set(x, y, z);
  flashLight.intensity = 30;
  flashT = 0.06;
}

export function tracer(a, b) {
  const t = tracers.find((q) => q.life <= 0) || tracers[0];
  const len = a.distanceTo(b);
  t.line.position.copy(a).add(b).multiplyScalar(0.5);
  t.line.lookAt(b);
  t.line.scale.set(0.07, 0.07, len);
  t.line.visible = true;
  t.life = 0.07;
}

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
export function updateEffects(dt) {
  let n = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vy -= p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
    const k = p.life / p.max;
    const size = p.size * (1 + (1 - k) * p.grow * 2) * (p.grow ? 1 : k * 0.5 + 0.5);
    m4.compose(v.set(p.x, p.y, p.z), q, s.setScalar(size));
    inst.setMatrixAt(n, m4);
    inst.setColorAt(n, p.color);
    n++;
  }
  inst.count = n;
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  if (flashT > 0) { flashT -= dt; if (flashT <= 0) { flashSprite.visible = false; flashLight.intensity = 0; } }
  for (const t of tracers) if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.line.visible = false; }
  fx.shake = Math.max(0, fx.shake - dt * 2.5);
}

// Leaves the last muzzle flash lit (screenshot staging).
export function holdFlash() { flashT = 999; }
