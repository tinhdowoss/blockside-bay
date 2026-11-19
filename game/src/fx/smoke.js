// Soft smoke puffs: tyre smoke, exhaust, burning wrecks, gun smoke. One instanced draw of camera-facing
// quads with a round soft falloff; each puff rises, spreads, fades in then out, and is tinted by the
// ambient light colour so smoke glows warm at sunset and goes dark blue at night.
import { rand } from '../core/rng.js';

const THREE = window.THREE;
const MAX = 500;
const puffs = [];
let geo, mesh, offs, cols;
// Ambient tint applied to every puff; the colour grade (fx/grade.js) writes it each frame.
export const smokeLight = new THREE.Color(1, 1, 1);

const VS = `attribute vec4 aOff; attribute vec4 aCol; varying vec2 vUv; varying vec4 vCol;
void main(){
  vec4 mv = modelViewMatrix * vec4(aOff.xyz, 1.0);
  mv.xy += position.xy * aOff.w;
  vUv = uv; vCol = aCol;
  gl_Position = projectionMatrix * mv;
}`;
const FS = `uniform vec3 uLight; varying vec2 vUv; varying vec4 vCol;
void main(){
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  float a = smoothstep(1.0, 0.25, r) * vCol.a;
  // A little lumpiness so puffs don't read as perfect discs.
  a *= 0.82 + 0.18 * sin(d.x * 19.0 + d.y * 13.0);
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol.rgb * uLight, a);
  #include <colorspace_fragment>
}`;

/** Creates the instanced billboard mesh for all puffs. */
export function setupSmoke(scene) {
  const plane = new THREE.PlaneGeometry(1, 1);
  geo = new THREE.InstancedBufferGeometry();
  geo.index = plane.index;
  geo.setAttribute('position', plane.getAttribute('position'));
  geo.setAttribute('uv', plane.getAttribute('uv'));
  offs = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
  cols = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aOff', offs);
  geo.setAttribute('aCol', cols);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { uLight: { value: smokeLight } }, transparent: true, depthWrite: false });
  mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);
}

const tint = new THREE.Color();
/** Adds one puff. size: start diameter; grow: extra diameter over its life; alpha: peak opacity. */
export function puff(x, y, z, opts = {}) {
  if (puffs.length >= MAX) puffs.shift();
  tint.set(opts.color || '#eeeeee');
  puffs.push({
    x, y, z, vx: opts.vx ?? (rand() - 0.5) * 0.8, vy: opts.vy ?? 0.8 + rand() * 0.8, vz: opts.vz ?? (rand() - 0.5) * 0.8,
    life: opts.life ?? 1.8, max: opts.life ?? 1.8, size: opts.size ?? 1.2, grow: opts.grow ?? 2.4, alpha: opts.alpha ?? 0.55,
    r: tint.r, g: tint.g, b: tint.b,
  });
}

/** Moves and fades every puff. They are held still while the simulation is frozen (dt = 0) so staged shots keep their smoke. */
export function updateSmoke(dt) {
  let n = 0;
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.life -= dt;
    if (p.life <= 0) { puffs.splice(i, 1); continue; }
    const drag = Math.exp(-dt * 1.4);
    p.vx *= drag; p.vz *= drag; p.vy *= Math.exp(-dt * 0.6);
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const k = 1 - p.life / p.max;                       // 0 -> 1 over the life
    const a = p.alpha * Math.min(1, k * 6) * (1 - k) * (1 - k * 0.3);
    offs.setXYZW(n, p.x, p.y, p.z, p.size + p.grow * Math.sqrt(k));
    cols.setXYZW(n, p.r, p.g, p.b, a);
    n++;
  }
  geo.instanceCount = n;
  offs.needsUpdate = true;
  cols.needsUpdate = true;
}

/** Sets the age of every live puff (0..1) at once: staged shots pre-age smoke so it reads as a trail. */
export function agePuffs(fn) { puffs.forEach((p, i) => { p.life = p.max * (1 - fn(i, puffs.length)); }); }
