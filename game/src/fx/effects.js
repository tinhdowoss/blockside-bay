// Particles (sparks, debris, blood), muzzle flashes, bullet tracers and camera shake; smoke goes to the
// soft puff system (smoke.js) and tyre marks to skidmarks.js.
import { glowTexture } from '../world/textures.js';
import { setupSmoke, updateSmoke, puff } from './smoke.js';
import { setupSkidmarks } from './skidmarks.js';
import { rand } from '../core/rng.js';

const THREE = window.THREE;
const MAX = 600;            // live particle cap; the oldest is dropped first
const TRACERS = 24;
const parts = [];
let inst, flashSprite, flashLight, scene;
const tracers = [];
const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
export const fx = { shake: 0 };

/** Builds the particle instancer, muzzle flash sprite + light and the tracer pool. */
export function setupEffects(sc) {
  scene = sc;
  setupSmoke(sc);
  setupSkidmarks(sc);
  inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX);
  inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  inst.count = 0;
  inst.frustumCulled = false;
  scene.add(inst);
  flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#ffe08a'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flashSprite.visible = false;
  scene.add(flashSprite);
  flashLight = new THREE.PointLight(0xffd8a0, 0, 10, 1.8);
  scene.add(flashLight);
  for (let i = 0; i < TRACERS; i++) {
    // A thin glowing box stretched between muzzle and impact.
    const line = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
}

const col = new THREE.Color();
/** One cube particle: position, velocity, life (s), size, colour; opts.grow / grav / hot. */
export function spawn(x, y, z, vx, vy, vz, life, size, color, opts = {}) {
  if (parts.length >= MAX) parts.shift();
  // hot > 1 pushes the colour past white so the bloom pass makes it glow (sparks, embers).
  parts.push({ x, y, z, vx, vy, vz, life, max: life, size, color: col.set(color).multiplyScalar(opts.hot || 1).clone(), grow: opts.grow || 0, grav: opts.grav ?? 0 });
}

/** n soft smoke puffs scattered around a point. */
export function smoke(x, y, z, color = '#9a9a9a', n = 1, opts = {}) {
  for (let i = 0; i < n; i++) puff(x + (rand() - 0.5) * 0.8, y, z + (rand() - 0.5) * 0.8, { color, ...opts });
}

/** Thick low tyre smoke that rolls out sideways from a sliding wheel. */
export function tyreSmoke(x, z, vx = 0, vz = 0) {
  puff(x, 0.45, z, { color: '#d9d4d0', vx: vx * 0.15 + (rand() - 0.5) * 2, vy: 0.5 + rand() * 0.5, vz: vz * 0.15 + (rand() - 0.5) * 2, size: 1.3, grow: 3.6, life: 2.4, alpha: 0.42 });
}

/** A burst of hot, falling sparks. */
export function sparks(x, y, z, n = 10, color = '#ffd040') {
  for (let i = 0; i < n; i++) spawn(x, y, z, (rand() - 0.5) * 10, rand() * 6, (rand() - 0.5) * 10, 0.4 + rand() * 0.3, 0.13, color, { grav: 18, hot: 3.2 });
}

/** A small red splash on a hit. */
export function blood(x, y, z, n = 8) {
  for (let i = 0; i < n; i++) spawn(x, y, z, (rand() - 0.5) * 4, rand() * 4, (rand() - 0.5) * 4, 0.6, 0.18, '#c0102a', { grav: 14 });
}

/** Licking flames for a burning car: hot orange/yellow motes that rise and shrink, with dark smoke above. */
export function fire(x, y, z, k = 1) {
  for (let i = 0; i < 2; i++) spawn(x + (rand() - 0.5) * 0.9 * k, y, z + (rand() - 0.5) * 0.9 * k, (rand() - 0.5) * 0.8, 2.2 + rand() * 1.6, (rand() - 0.5) * 0.8, 0.35 + rand() * 0.25, 0.32 * k, i ? '#ff7a1a' : '#ffd040', { grow: -0.4, hot: 2.8 });
  if (rand() < 0.4) smoke(x, y + 1.2, z, '#262626', 1, { size: 1.1, grow: 3, life: 2.4, alpha: 0.7, vy: 2.5 });
}

/** White spray thrown off a boat's bow and wake. */
export function spray(x, z, vx = 0, vz = 0) {
  for (let i = 0; i < 2; i++) spawn(x, 0.4, z, vx * 0.2 + (rand() - 0.5) * 3, 1.5 + rand() * 2.5, vz * 0.2 + (rand() - 0.5) * 3, 0.5 + rand() * 0.3, 0.2, '#f4fbff', { grav: 9, hot: 1.3 });
}

/** Fireball, black smoke column, a big flash and heavy camera shake. */
export function explosion(x, y, z) {
  for (let i = 0; i < 40; i++) spawn(x, y + 1, z, (rand() - 0.5) * 16, rand() * 12, (rand() - 0.5) * 16, 0.8 + rand() * 0.5, 0.6, i % 2 ? '#ff8a1a' : '#ffd040', { grav: 6, grow: 1, hot: 2.5 });
  for (let i = 0; i < 20; i++) smoke(x, y + 2, z, '#3a3a3a', 1, { size: 2.5, grow: 6, life: 3.5, alpha: 0.8, vy: 2 + rand() * 2 });
  fx.shake = Math.max(fx.shake, 1.2);
  flash(x, y + 1, z, 6);
}

let flashT = 0;
/** A 60 ms muzzle/blast flash (glow sprite plus a point light) at a point. */
export function flash(x, y, z, scale = 1.4) {
  flashSprite.position.set(x, y, z);
  flashSprite.scale.setScalar(scale);
  flashSprite.visible = true;
  flashLight.position.set(x, y, z);
  flashLight.intensity = 9;
  flashT = 0.06;
}

/** A bullet tracer from Vector3 a to Vector3 b (reuses a free one, else the first). */
export function tracer(a, b) {
  const tr = tracers.find((q) => q.life <= 0) || tracers[0];
  const len = a.distanceTo(b);
  tr.line.position.copy(a).add(b).multiplyScalar(0.5);
  tr.line.lookAt(b);
  tr.line.scale.set(0.07, 0.07, len);
  tr.line.visible = true;
  tr.life = 0.07;
}

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
/** Moves and ages every particle, flash and tracer, decays shake, then updates smoke. */
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
  for (const tr of tracers) if (tr.life > 0) { tr.life -= dt; if (tr.life <= 0) tr.line.visible = false; }
  fx.shake = Math.max(0, fx.shake - dt * 2.5);
  updateSmoke(dt);
}

/** Leaves the last muzzle flash lit (screenshot staging). */
export function holdFlash() { flashT = 999; }
