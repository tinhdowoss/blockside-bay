// Street furniture on every block: benches, litter bins, fire hydrants, mailboxes, newspaper boxes and
// BAYLINK bus shelters with lit advert panels, plus traffic signals at every junction. The signals run
// a real cycle (with a green wave down the avenues) and civilian traffic stops for red - see
// signalAt(), used by world/traffic.js. Everything static is merged per material; the lit signal
// lamps are one InstancedMesh re-coloured a few times a second.
import { CELL, GRID_N, ROAD_W } from '../core/config.js';
import { makeRng } from '../core/rng.js';
import { Batcher } from './voxel.js';
import { registerGlow } from '../fx/grade.js';

const THREE = window.THREE;
const HALF = ROAD_W / 2;

// ---- signal timing -------------------------------------------------------------------------------
// Per junction: traffic along x gets green, then amber, then all-red, then the same for z.
const GREEN = 9, AMBER = 2.2, CLEAR = 1, CYCLE = 2 * (GREEN + AMBER + CLEAR);
const WAVE_OFFSET = 2.6;   // seconds each junction lags its neighbour: the green wave
export const signals = { t: 0, heads: [], lamps: null, acc: 0 };
// [x, z, radius] areas left empty of signal posts (set before the city is built; used by staged shots
// whose camera would otherwise sit right behind a post).
export const furnitureClear = [];
const cleared = (x, z) => furnitureClear.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r);

/** The light ('green' | 'amber' | 'red') shown to traffic travelling along axis at junction (i, j). */
export function signalAt(i, j, axis, t = signals.t) {
  const ph = (((t + (i + j) * WAVE_OFFSET) % CYCLE) + CYCLE) % CYCLE;
  const half = GREEN + AMBER + CLEAR;
  const local = axis === 'x' ? ph : (ph + half) % CYCLE;
  if (local < GREEN) return 'green';
  if (local < GREEN + AMBER) return 'amber';
  return 'red';
}

// Lamp colour per state as [r, g, b] (scaled by 1/4.2 for the instance colour; >1 blooms) plus its
// height offset in the signal head.
const LAMP = { red: [4.2, 0.35, 0.4, 0.45], amber: [3.6, 2.2, 0.3, 0], green: [0.3, 3.4, 1.2, -0.45] };

/** Scatters furniture along every block's sidewalks, builds the signal posts and adds it all to parent. */
export function buildFurniture(parent) {
  const r = makeRng(5150);
  const vc = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glow = registerGlow(new THREE.MeshBasicMaterial({ vertexColors: true }), 0.8, 2.4);
  const B = new Batcher().material('vc', vc).material('glow', glow);
  const size = CELL - ROAD_W;

  for (let bx = 0; bx < GRID_N; bx++) for (let bz = 0; bz < GRID_N; bz++) {
    const x0 = bx * CELL + HALF, z0 = bz * CELL + HALF;
    for (let k = 0; k < 4; k++) {
      // Point on side k at distance t along it, `off` in from the curb, and the yaw that faces the road.
      const at = (t, off) => [[x0 + t, z0 + off], [x0 + size - off, z0 + t], [x0 + size - t, z0 + size - off], [x0 + off, z0 + size - t]][k];
      const yaw = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][k];
      const busStop = (bx * 3 + bz * 5 + k) % 7 === 0;
      if (busStop) { shelter(B, ...at(24, 2.0), yaw); continue; }
      if (r() < 0.75) { const [x, z] = at(12.5, 2.35); bench(B, x, z, yaw); }
      if (r() < 0.8) { const [x, z] = at(14.6, 0.6); bin(B, x, z); }
      if (r() < 0.45) { const [x, z] = at(23.5, 0.55); hydrant(B, x, z); }
      if (r() < 0.25) { const [x, z] = at(31.5, 0.7); mailbox(B, x, z, yaw); }
      if (r() < 0.2) { const [x, z] = at(25.4, 0.7); paperBox(B, x, z, yaw, r); }
    }
  }
  // Traffic signals: two posts per junction on the corners free of street lamps.
  for (let i = 0; i <= GRID_N; i++) for (let j = 0; j <= GRID_N; j++) {
    const nx = i * CELL, nz = j * CELL;
    if (i < GRID_N && j > 0) signalPost(B, nx + HALF + 1, nz - HALF - 1, i, j, 1, -1);
    if (i > 0 && j < GRID_N) signalPost(B, nx - HALF - 1, nz + HALF + 1, i, j, -1, 1);
  }
  const group = new THREE.Group();
  group.add(B.build(true));
  // Lit lamps
  const lampMat = registerGlow(new THREE.MeshBasicMaterial({ color: '#ffffff' }), 1.3, 3.2);
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.34, 0.12), lampMat, signals.heads.length);
  lamps.castShadow = false;
  group.add(lamps);
  signals.lamps = lamps;
  parent.add(group);
  updateFurniture(0, true);
  return group;
}

function bench(B, x, z, yaw) {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const p = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  const box = (dx, y, dz, w, h, d, color) => { const [px, pz] = p(dx, dz); B.box('vc', px, y, pz, w, h, d, { ry: yaw, color }); };
  box(0, 0.5, 0, 2.2, 0.12, 0.6, '#c87a3e');
  box(0, 0.95, -0.3, 2.2, 0.5, 0.1, '#c87a3e');
  for (const sx of [-0.9, 0.9]) { box(sx, 0.25, 0, 0.12, 0.5, 0.5, '#3a3a48'); box(sx, 0.7, -0.3, 0.1, 0.5, 0.1, '#3a3a48'); }
}
function bin(B, x, z) {
  B.box('vc', x, 0.5, z, 0.6, 0.8, 0.6, { color: '#2fae6a' });
  B.box('vc', x, 0.95, z, 0.7, 0.12, 0.7, { color: '#1e7a4a' });
  B.box('vc', x, 0.62, z, 0.62, 0.08, 0.62, { color: '#ffffff' });
}
function hydrant(B, x, z) {
  B.box('vc', x, 0.35, z, 0.36, 0.6, 0.36, { color: '#ff3a4a' });
  B.box('vc', x, 0.72, z, 0.26, 0.16, 0.26, { color: '#ff3a4a' });
  B.box('vc', x, 0.42, z, 0.56, 0.14, 0.14, { color: '#d02a3a' });
  B.box('vc', x, 0.42, z, 0.14, 0.14, 0.56, { color: '#d02a3a' });
  B.box('vc', x, 0.1, z, 0.46, 0.1, 0.46, { color: '#b0b0b0' });
}
function mailbox(B, x, z, yaw) {
  B.box('vc', x, 0.55, z, 0.6, 0.9, 0.55, { ry: yaw, color: '#2f6dff' });
  B.box('vc', x, 1.05, z, 0.64, 0.14, 0.6, { ry: yaw, color: '#1d47b0' });
  B.box('vc', x, 0.06, z, 0.5, 0.12, 0.5, { ry: yaw, color: '#2a2a3a' });
}
function paperBox(B, x, z, yaw, r) {
  const col = ['#ffd23f', '#ff5fa2', '#2ee6c8'][Math.floor(r() * 3)];
  B.box('vc', x, 0.5, z, 0.55, 0.8, 0.5, { ry: yaw, color: col });
  B.box('vc', x, 0.62, z, 0.45, 0.3, 0.52, { ry: yaw, color: '#dfe8f0' });
  B.box('vc', x, 0.06, z, 0.4, 0.12, 0.4, { ry: yaw, color: '#2a2a3a' });
}
// BAYLINK bus shelter: roof, posts, glass back, lit advert panel, seat and a stop sign.
function shelter(B, x, z, yaw) {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const p = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  const box = (key, dx, y, dz, w, h, d, color) => { const [px, pz] = p(dx, dz); B.box(key, px, y, pz, w, h, d, { ry: yaw, color }); };
  box('vc', 0, 2.7, 0, 4.4, 0.16, 1.8, '#f4f4f4');
  box('vc', 0, 2.82, 0, 4.5, 0.08, 1.9, '#2ee6c8');
  for (const sx of [-2.1, 2.1]) box('vc', sx, 1.35, -0.75, 0.14, 2.7, 0.14, '#5b6070');
  box('vc', 0, 1.5, -0.8, 4.0, 1.9, 0.06, '#9fd8ff');
  box('glow', -2.15, 1.45, 0.05, 0.12, 1.9, 1.3, '#ffb3d1');
  box('vc', -2.15, 1.45, 0.05, 0.18, 2.1, 1.45, '#3a3a48');
  box('vc', 0.4, 0.5, -0.45, 2.4, 0.12, 0.5, '#c87a3e');
  // BAYLINK stop sign on a pole
  box('vc', 2.4, 1.5, 0.75, 0.12, 3.0, 0.12, '#5b6070');
  box('vc', 2.4, 2.95, 0.75, 0.06, 0.6, 0.7, '#2ee6c8');
  box('vc', 2.43, 2.95, 0.75, 0.04, 0.2, 0.5, '#ffffff');
}
// A signal post at a junction corner with two heads (one per road axis); (sx, sz) point into the junction.
function signalPost(B, x, z, i, j, sx, sz) {
  if (cleared(x, z)) return;
  B.box('vc', x, 2.8, z, 0.26, 5.6, 0.26, { color: '#3a3a48' });
  B.box('vc', x, 0.1, z, 0.6, 0.2, 0.6, { color: '#5b6070' });
  // Head for x-road traffic (faces along x, towards the cars coming at it) and one for z-road traffic.
  const heads = [
    { axis: 'x', hx: x - sx * 0.1, hz: z - sz * 1.8, fx: sx, fz: 0 },
    { axis: 'z', hx: x - sx * 1.8, hz: z - sz * 0.1, fx: 0, fz: sz },
  ];
  for (const h of heads) {
    B.box('vc', (x + h.hx) / 2, 5.2, (z + h.hz) / 2, Math.abs(h.hx - x) + 0.15, 0.15, Math.abs(h.hz - z) + 0.15, { color: '#3a3a48' });
    B.box('vc', h.hx, 4.6, h.hz, h.fx ? 0.4 : 0.55, 1.5, h.fz ? 0.4 : 0.55, { color: '#22222c' });
    // Unlit lenses for all three lamps; the lit one is an instance drawn over them.
    for (const lamp of Object.values(LAMP)) {
      B.box('vc', h.hx + h.fx * 0.21, 4.6 + lamp[3], h.hz + h.fz * 0.21, h.fx ? 0.04 : 0.32, 0.32, h.fz ? 0.04 : 0.32, { color: '#3a3038' });
    }
    // Visor
    B.box('vc', h.hx + h.fx * 0.35, 5.38, h.hz + h.fz * 0.35, h.fx ? 0.3 : 0.6, 0.06, h.fz ? 0.3 : 0.6, { color: '#22222c' });
    signals.heads.push({ ...h, i, j, state: null });
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0);
/** Advances the signal clock; five times a second (or when forced) moves each lit lamp to its current state. */
export function updateFurniture(dt, force = false) {
  signals.t += dt;
  signals.acc += dt;
  if (!signals.lamps || (!force && signals.acc < 0.2)) return;
  signals.acc = 0;
  const L = signals.lamps;
  signals.heads.forEach((h, n) => {
    const st = signalAt(h.i, h.j, h.axis);
    if (st === h.state && !force) return;
    h.state = st;
    const lamp = LAMP[st];
    _p.set(h.hx + h.fx * 0.26, 4.6 + lamp[3], h.hz + h.fz * 0.26);
    _q.setFromAxisAngle(_up, Math.atan2(h.fx, h.fz));
    _m.compose(_p, _q, _s);
    L.setMatrixAt(n, _m);
    L.setColorAt(n, _c.setRGB(lamp[0] / 4.2, lamp[1] / 4.2, lamp[2] / 4.2));
  });
  L.instanceMatrix.needsUpdate = true;
  if (L.instanceColor) L.instanceColor.needsUpdate = true;
}
