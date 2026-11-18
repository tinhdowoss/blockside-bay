// Landmarks of our own around the bay, all built from voxel boxes:
//   HALCYON SPAN   - a pastel art-deco suspension bridge across the north channel, with its own traffic
//   CORAL WHEEL    - a Ferris wheel on a deck beside Coral Pier, neon rim, gondolas that hang level
//   MANGROVE MARINA- piers off the docks seawall with sailboats and speedboats bobbing at their moorings
//   POINT GLASS    - a striped lighthouse on a rocky islet; its beam sweeps the bay after dusk
// Plus a few sailboats tacking slowly offshore. Static parts are merged per material (Batcher); only the
// things that move (wheel, gondolas, boats, bridge cars, beam) are separate meshes.
import { CITY_SIZE, OCEAN_X } from '../core/config.js';
import { makeRng } from '../core/rng.js';
import { Batcher, colorBoxes } from './voxel.js';
import { registerGlow } from '../fx/grade.js';
import { neonSignTexture, glowTexture } from './textures.js';

const THREE = window.THREE;
const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const glowMat = registerGlow(new THREE.MeshBasicMaterial({ vertexColors: true }), 1, 2.6);

export const BRIDGE = { z: -150, deckY: 14, x0: -380, x1: 760, towers: [40, 340], name: 'HALCYON SPAN' };
export const WHEEL = { x: 472, y: 23, z: 331, r: 18, name: 'CORAL WHEEL' };
export const LIGHTHOUSE = { x: OCEAN_X + 78, z: -62, name: 'POINT GLASS LIGHT' };
export const MARINA = { x: -48, z: 255, name: 'MANGROVE MARINA' };

export const landmarks = { wheel: null, gondolas: [], boats: [], sailers: [], bridgeCars: null, beam: null, beamGlow: null, signs: [] };
let group;

// ---- helpers ------------------------------------------------------------------------------------
const _m = new THREE.Matrix4();
// A box stretched between two points in the x/y plane (cables, spokes, struts).
function strut(B, key, x1, y1, z1, x2, y2, z2, th, color) {
  const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
  const len = Math.hypot(dx, dy, dz);
  const dir = new THREE.Vector3(dx, dy, dz).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
  _m.compose(new THREE.Vector3((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2), q, new THREE.Vector3(1, 1, 1));
  B.box(key, 0, 0, 0, len, th, th, { matrix: _m, color });
}

function signPlane(text, color, x, y, z, yaw, height) {
  const tex = neonSignTexture(text, color);
  const w = height * tex.userData.aspect;
  const mat = registerGlow(new THREE.MeshBasicMaterial({ map: tex }), 1, 2.2);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, height), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  group.add(mesh);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.4, height * 2.4),
    new THREE.MeshBasicMaterial({ map: glowTexture(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4 }));
  halo.position.set(x + Math.sin(yaw) * 0.06, y, z + Math.cos(yaw) * 0.06);
  halo.rotation.y = yaw;
  group.add(halo);
  landmarks.signs.push(halo);
}

// ---- Halcyon Span -------------------------------------------------------------------------------
function buildBridge(B) {
  const { z: Z, deckY: Y, x0, x1, towers } = BRIDGE;
  const W = 14, TOP = 80;
  const len = x1 - x0, cx = (x0 + x1) / 2;
  // Deck: concrete slab, asphalt, coral girders, centre line, kerbs.
  B.box('vc', cx, Y - 1.2, Z, len, 2.4, W, { color: '#e9dccf' });
  B.box('vc', cx, Y + 0.02, Z, len, 0.1, W - 2, { color: '#4a4d5e' });
  B.box('vc', cx, Y + 0.09, Z, len, 0.05, 0.3, { color: '#ffd23f' });
  for (const s of [-1, 1]) {
    B.box('vc', cx, Y - 0.6, Z + s * (W / 2 + 0.4), len, 3.2, 0.8, { color: '#ff7a6b' });
    B.box('vc', cx, Y + 0.9, Z + s * (W / 2 - 0.3), len, 0.25, 0.25, { color: '#ffffff' });
  }
  // Approach piers every 60 units outside the main span.
  for (let x = x0 + 30; x < x1; x += 60) {
    if (x > towers[0] - 20 && x < towers[1] + 20) continue;
    B.box('vc', x, (Y - 2.4 - 12) / 2, Z, 5, Y - 2.4 + 12, W - 3, { color: '#d9cbbd' });
    B.box('vc', x, Y - 3, Z, 6, 1, W + 1, { color: '#ff7a6b' });
  }
  // Deco towers: two legs, three cross beams, stepped crown and a red aviation light.
  for (const tx of towers) {
    for (const s of [-1, 1]) {
      B.box('vc', tx, (TOP - 12) / 2, Z + s * (W / 2 + 1), 3.6, TOP + 12, 3.6, { color: '#ffb3c1' });
      B.box('vc', tx, (TOP - 12) / 2, Z + s * (W / 2 + 1), 3.9, 2, 3.9, { color: '#ff7a6b' });
      B.box('vc', tx, TOP + 1.5, Z + s * (W / 2 + 1), 2.6, 3, 2.6, { color: '#ffe0e6' });
      B.box('glow', tx, TOP + 3.4, Z + s * (W / 2 + 1), 0.9, 0.9, 0.9, { color: '#ff2a3a' });
      for (let y = 22; y < TOP; y += 12) B.box('vc', tx + 1.85, y, Z + s * (W / 2 + 1), 0.15, 6, 1.2, { color: '#ff7a6b' });
    }
    for (const y of [Y + 18, Y + 40, TOP - 4]) B.box('vc', tx, y, Z, 3, 3, W + 5, { color: '#ffb3c1' });
    B.box('vc', tx, TOP - 4, Z, 3.2, 1, W + 5.4, { color: '#ff7a6b' });
    B.box('vc', tx, -4, Z, 9, 10, W + 6, { color: '#d9cbbd' });
  }
  // Main cables (parabolas between the towers, straight back-stays to the anchorages) + suspenders.
  const span = towers[1] - towers[0], mid = (towers[0] + towers[1]) / 2, sag = TOP - (Y + 4);
  const cableY = (x) => {
    if (x >= towers[0] && x <= towers[1]) { const u = (x - mid) / (span / 2); return Y + 4 + sag * u * u; }
    const a = x < towers[0] ? towers[0] : towers[1], anchor = x < towers[0] ? towers[0] - 160 : towers[1] + 160;
    const u = (x - anchor) / (a - anchor);
    return Y + 1 + (TOP - Y - 1) * u;
  };
  for (const s of [-1, 1]) {
    const cz = Z + s * (W / 2 + 1);
    const pts = [];
    for (let x = towers[0] - 160; x <= towers[1] + 160; x += 8) pts.push(x);
    for (let i = 0; i < pts.length - 1; i++) {
      strut(B, 'vc', pts[i], cableY(pts[i]), cz, pts[i + 1], cableY(pts[i + 1]), cz, 0.7, '#ff8a7a');
      if (i % 2 === 0) B.box('glow', pts[i], cableY(pts[i]) + 0.5, cz, 0.45, 0.45, 0.45, { color: '#fff1b8' });
      const yTop = cableY(pts[i]);
      if (yTop - Y > 2) B.box('vc', pts[i], (Y + yTop) / 2, cz, 0.18, yTop - Y, 0.18, { color: '#f2f2f2' });
    }
    // Anchorage blocks
    for (const ax of [towers[0] - 160, towers[1] + 160]) B.box('vc', ax, Y - 3, cz, 10, 8, 4, { color: '#d9cbbd' });
  }
  // Deck lamps
  for (let x = x0 + 10; x < x1; x += 30) for (const s of [-1, 1]) {
    B.box('vc', x, Y + 2.2, Z + s * (W / 2 - 0.4), 0.2, 4.4, 0.2, { color: '#5b6070' });
    B.box('glow', x, Y + 4.5, Z + s * (W / 2 - 0.9), 0.7, 0.25, 0.7, { color: '#fff3c0' });
  }
  // Traffic crossing the span: two lanes of little voxel cars.
  const n = 28;
  const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 1.5, 2), new THREE.MeshLambertMaterial({ color: '#ffffff' }), n);
  const r = makeRng(77), cols = ['#ff4fa3', '#3fd0ff', '#ffe066', '#ffffff', '#7cf29a', '#ff8a5c', '#9b6bff', '#ffd23f'];
  cars.userData.cars = [];
  for (let i = 0; i < n; i++) {
    const dir = i % 2 ? 1 : -1;
    cars.userData.cars.push({ dir, x: x0 + r() * len, v: 16 + r() * 8, lane: Z + dir * 3 });
    cars.setColorAt(i, new THREE.Color(cols[i % cols.length]));
  }
  cars.castShadow = false;
  group.add(cars);
  landmarks.bridgeCars = cars;
}

// ---- Coral Wheel ---------------------------------------------------------------------------------
function buildWheel(B) {
  const { x: X, y: Y, z: Z, r: R } = WHEEL;
  // Deck beside the pier and the A-frame legs.
  B.box('wood', X, 0.15, Z, 34, 0.3, 26, { uv: 4 });
  for (let x = X - 16; x <= X + 16; x += 8) for (const z of [Z - 12, Z + 12]) B.box('vc', x, -1, z, 0.6, 2.4, 0.6, { color: '#6e4626' });
  for (const s of [-1, 1]) {
    const lz = Z + s * 3.2;
    strut(B, 'vc', X - 11, 0.3, lz, X, Y, lz, 1.1, '#ffffff');
    strut(B, 'vc', X + 11, 0.3, lz, X, Y, lz, 1.1, '#ffffff');
    strut(B, 'vc', X - 6, Y * 0.48, lz, X + 6, Y * 0.48, lz, 0.6, '#ffffff');
  }
  B.box('vc', X, Y, Z, 1.6, 1.6, 7.4, { color: '#dddddd' });
  // Ticket booth + sign
  B.box('vc', X - 12, 1.6, Z - 9, 4, 3, 3, { color: '#ff5fa2' });
  B.box('vc', X - 12, 3.3, Z - 9, 4.6, 0.4, 3.6, { color: '#ffffff' });
  for (let k = 0; k < 6; k++) B.box('vc', X - 14 + k * 0.8, 2.9, Z - 10.8, 0.8, 0.4, 0.6, { color: k % 2 ? '#ffffff' : '#ff5fa2' });
  signPlane(WHEEL.name, '#ff5fa2', X - 12, 4.6, Z - 10.62, Math.PI, 1.1);

  // The rotating part: two rims, spokes and neon bulbs, merged into one mesh spun around its hub.
  const W = new Batcher().material('vc', vcMat).material('glow', glowMat);
  const segs = 36;
  for (const s of [-1.4, 1.4]) {
    for (let i = 0; i < segs; i++) {
      const a1 = (i / segs) * Math.PI * 2, a2 = ((i + 1) / segs) * Math.PI * 2;
      strut(W, 'vc', Math.cos(a1) * R, Math.sin(a1) * R, s, Math.cos(a2) * R, Math.sin(a2) * R, s, 0.5, '#ffffff');
      W.box('glow', Math.cos(a1) * R, Math.sin(a1) * R, s + Math.sign(s) * 0.3, 0.32, 0.32, 0.32, { color: ['#ff3fd0', '#3fe8ff', '#ffd23f'][i % 3] });
      if (i % 3 === 0) strut(W, 'vc', 0, 0, s, Math.cos(a1) * R, Math.sin(a1) * R, s, 0.3, '#ffe0ec');
      if (i % 3 === 0) strut(W, 'glow', 0, 0, s + Math.sign(s) * 0.2, Math.cos(a1) * R * 0.98, Math.sin(a1) * R * 0.98, s + Math.sign(s) * 0.2, 0.12, '#ff7ad0');
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    W.box('vc', Math.cos(a) * R, Math.sin(a) * R, 0, 0.3, 0.3, 3.2, { color: '#dddddd' });
  }
  const wheel = W.build(false);
  wheel.position.set(X, Y, Z);
  group.add(wheel);
  landmarks.wheel = wheel;
  // Gondolas hang level from the rim.
  const COLS = ['#ff5fa2', '#2ee6c8', '#ffd23f', '#7a5cff', '#ff7a3d', '#3fa0ff'];
  for (let i = 0; i < 12; i++) {
    const c = COLS[i % COLS.length];
    const g = colorBoxes([
      [0, -1.6, 0, 2.2, 1.6, 2.2, c], [0, -0.55, 0, 2.5, 0.25, 2.5, '#ffffff'], [0, -0.2, 0, 0.15, 0.6, 0.15, '#dddddd'],
      [0, -1.4, 1.11, 1.6, 0.6, 0.04, '#1d3f66'], [0, -1.4, -1.11, 1.6, 0.6, 0.04, '#1d3f66'],
    ], vcMat);
    g.castShadow = true;
    group.add(g);
    landmarks.gondolas.push({ mesh: g, a: (i / 12) * Math.PI * 2 });
  }
}

// ---- Mangrove Marina -----------------------------------------------------------------------------
function boatMesh(kind, color, r) {
  if (kind === 'sail') {
    return colorBoxes([
      [0, 0, 0, 2.6, 1.3, 7.4, '#ffffff'], [0, -0.55, 0, 2.62, 0.3, 7.42, color], [0, 0.2, 3.9, 1.6, 1.0, 0.8, '#ffffff'],
      [0, 0.95, -0.6, 1.8, 0.8, 2.6, '#f4f0e8'], [0, 1.05, -0.6, 1.82, 0.25, 2.62, '#1d3f66'],
      [0, 5.6, 0.6, 0.22, 10, 0.22, '#dddddd'], [0, 1.6, -1.2, 0.18, 0.18, 3.6, '#dddddd'], [0, 1.7, -1.2, 0.5, 0.45, 3.4, color],
    ], vcMat);
  }
  return colorBoxes([
    [0, 0, 0, 2.4, 1.0, 6.2, color], [0, 0.1, 3.3, 1.4, 0.8, 0.8, color], [0, 0.55, -0.3, 2.2, 0.15, 4.6, '#ffffff'],
    [0, 0.95, 0.9, 2.0, 0.7, 0.12, '#9fd8ff'], [0, 0.75, -1.4, 1.6, 0.4, 1.4, '#f0d0a0'], [0, 0.1, -3.2, 0.8, 0.8, 0.4, '#333333'],
    [0, -0.45, 0, 2.42, 0.12, 6.22, r() < 0.5 ? '#ffffff' : '#1d3c8f'],
  ], vcMat);
}

function buildMarina(B) {
  const x0 = -27.5, len = 44;
  const r = makeRng(55);
  B.box('wood', x0 - 2, 0.25, MARINA.z, 4, 0.3, 150, { uv: 4 });
  for (let i = 0; i < 6; i++) {
    const z = MARINA.z - 62 + i * 25;
    B.box('wood', x0 - len / 2, 0.25, z, len, 0.3, 3, { uv: 4 });
    for (let x = x0 - 4; x > x0 - len; x -= 6) for (const s of [-1, 1]) B.box('vc', x, -0.6, z + s * 1.6, 0.4, 2.2, 0.4, { color: '#6e4626' });
    B.box('vc', x0 - len + 0.5, 1.4, z, 0.4, 2.4, 0.4, { color: '#ffffff' });
    B.box('glow', x0 - len + 0.5, 2.7, z, 0.5, 0.5, 0.5, { color: i % 2 ? '#3fe86a' : '#ff3050' });
    // Moored boats on both sides of each pier
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
      if (r() < 0.25) continue;
      const kind = r() < 0.45 ? 'sail' : 'motor';
      const col = ['#ff5fa2', '#2ee6c8', '#ffd23f', '#3fa0ff', '#ff7a3d', '#ffffff'][Math.floor(r() * 6)];
      const m = boatMesh(kind, col, r);
      const bx = x0 - 12 - k * 16, bz = z + s * 6.2;
      m.position.set(bx, 0.15, bz);
      m.rotation.y = Math.PI / 2 + (r() - 0.5) * 0.1;
      m.castShadow = true;
      group.add(m);
      landmarks.boats.push({ mesh: m, x: bx, z: bz, yaw: m.rotation.y, ph: r() * 6 });
    }
  }
  // Fuel dock hut at the end of the walkway
  B.box('vc', x0 - 3, 1.7, MARINA.z + 78, 4, 3, 4, { color: '#2ee6c8' });
  B.box('vc', x0 - 3, 3.4, MARINA.z + 78, 4.8, 0.5, 4.8, { color: '#ffffff' });
  signPlane(MARINA.name, '#2ee6c8', x0 - 1.45, 4.7, MARINA.z - 20, Math.PI / 2, 1.2);
  B.box('vc', x0 - 1.4, 2.6, MARINA.z - 20 - 7, 0.4, 5.2, 0.4, { color: '#ffffff' });
  B.box('vc', x0 - 1.4, 2.6, MARINA.z - 20 + 7, 0.4, 5.2, 0.4, { color: '#ffffff' });
}

// ---- Point Glass Light ---------------------------------------------------------------------------
function buildLighthouse(B) {
  const { x: X, z: Z } = LIGHTHOUSE;
  const r = makeRng(31);
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2, d = r() * 14, s = 4 + r() * 7;
    B.box('vc', X + Math.cos(a) * d, -0.5 + r() * 2, Z + Math.sin(a) * d, s, 2 + r() * 3, s * (0.7 + r() * 0.5), { color: ['#8a8378', '#a39a8c', '#6f685e', '#b5a993'][i % 4], ry: r() });
  }
  B.box('vc', X, 2.4, Z, 12, 1.2, 12, { color: '#d9cbbd' });
  // Striped tower narrowing upwards
  const H = 34, bands = 8;
  for (let b = 0; b < bands; b++) {
    const t = b / bands, w = 6.4 - t * 2.4, y = 3 + (b + 0.5) * (H / bands);
    B.box('vc', X, y, Z, w, H / bands + 0.02, w, { color: b % 2 ? '#ff5f6b' : '#ffffff' });
    if (b % 2 === 0) B.box('vc', X, y, Z + w / 2 + 0.02, 0.8, 1.2, 0.05, { color: '#1d3f66' });
  }
  B.box('vc', X, 3 + H + 0.4, Z, 6.8, 0.6, 6.8, { color: '#2a2a3a' });
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) B.box('vc', X + dx * 3.3, 3 + H + 1.2, Z + dz * 3.3, dx ? 0.15 : 6.8, 1, dz ? 0.15 : 6.8, { color: '#2a2a3a' });
  B.box('glow', X, 3 + H + 2.4, Z, 3.2, 3, 3.2, { color: '#fff3c0' });
  B.box('vc', X, 3 + H + 4.4, Z, 4, 1, 4, { color: '#ff3a4a' });
  B.box('vc', X, 3 + H + 5.4, Z, 2.2, 1, 2.2, { color: '#ff3a4a' });
  B.box('vc', X, 3 + H + 6.4, Z, 0.3, 1.4, 0.3, { color: '#dddddd' });
  // Keeper's cottage
  B.box('vc', X + 9, 4.6, Z + 4, 6, 3.6, 5, { color: '#fff0a8' });
  B.box('vc', X + 9, 6.7, Z + 4, 6.6, 0.6, 5.6, { color: '#ff5f6b' });
  // The beam: two long cones from the lamp, vertex-coloured so they fade with distance (additive).
  const geo = new THREE.CylinderGeometry(9, 0.6, 150, 16, 6, true);
  geo.translate(0, 75, 0);
  geo.rotateZ(-Math.PI / 2);
  const pos = geo.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) { const k = 1 - pos.getX(i) / 150; col.push(k * k, k * k * 0.95, k * k * 0.8); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Group();
  const a = new THREE.Mesh(geo, beamMat), b = new THREE.Mesh(geo, beamMat);
  b.rotation.y = Math.PI;
  beam.add(a, b);
  beam.position.set(X, 3 + H + 2.4, Z);
  group.add(beam);
  landmarks.beam = beam;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#fff2c0'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  glow.scale.setScalar(16);
  glow.position.copy(beam.position);
  group.add(glow);
  landmarks.beamGlow = glow;
}

// ---- Offshore sailboats --------------------------------------------------------------------------
function buildSailers() {
  const r = makeRng(909);
  for (let i = 0; i < 6; i++) {
    const col = ['#ff5fa2', '#2ee6c8', '#ffd23f', '#ffffff', '#7a5cff', '#ff7a3d'][i];
    const m = colorBoxes([
      [0, 0, 0, 2.8, 1.2, 8, '#ffffff'], [0, -0.5, 0, 2.82, 0.3, 8.02, '#1d3c8f'], [0, 6, 0.4, 0.22, 11, 0.22, '#dddddd'],
      [0, 6.4, -1.4, 0.14, 9, 3.2, col], [0, 5.4, 2.2, 0.12, 7, 2.2, '#ffffff'], [0, 1.0, -1.2, 1.8, 0.8, 2.4, '#f4f0e8'],
    ], vcMat);
    m.castShadow = true;
    group.add(m);
    landmarks.sailers.push({ mesh: m, cx: OCEAN_X + 120 + r() * 260, cz: -60 + r() * (CITY_SIZE + 120), rad: 40 + r() * 70, w: (0.012 + r() * 0.01) * (r() < 0.5 ? -1 : 1), ph: r() * 6 });
  }
}

export function buildLandmarks(parent, woodMat) {
  group = new THREE.Group();
  parent.add(group);
  const B = new Batcher().material('vc', vcMat).material('glow', glowMat).material('wood', woodMat || vcMat);
  buildBridge(B);
  buildWheel(B);
  buildMarina(B);
  buildLighthouse(B);
  buildSailers();
  const merged = B.build(true);
  group.add(merged);
  return group;
}

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
export function updateLandmarks(t, dt, night) {
  if (!group) return;
  // Wheel: slow turn; gondolas hang level and sway a touch.
  const rot = t * 0.06;
  landmarks.wheel.rotation.z = rot;
  for (const g of landmarks.gondolas) {
    const a = g.a + rot;
    g.mesh.position.set(WHEEL.x + Math.cos(a) * WHEEL.r, WHEEL.y + Math.sin(a) * WHEEL.r, WHEEL.z);
    g.mesh.rotation.z = Math.sin(t * 0.9 + g.a * 3) * 0.05;
  }
  // Moored boats bob and roll on the swell.
  for (const b of landmarks.boats) {
    b.mesh.position.y = 0.1 + Math.sin(t * 1.3 + b.ph) * 0.12;
    b.mesh.rotation.set(Math.sin(t * 1.1 + b.ph) * 0.03, b.yaw + Math.sin(t * 0.3 + b.ph) * 0.04, Math.sin(t * 0.9 + b.ph * 2) * 0.05, 'YXZ');
  }
  for (const s of landmarks.sailers) {
    const a = s.ph + t * s.w;
    const x = s.cx + Math.cos(a) * s.rad, z = s.cz + Math.sin(a) * s.rad;
    s.mesh.position.set(x, 0.1 + Math.sin(t * 1.2 + s.ph) * 0.15, z);
    s.mesh.rotation.set(0, Math.atan2(-Math.sin(a) * s.w, Math.cos(a) * s.w), Math.sin(t * 0.8 + s.ph) * 0.06 - 0.08, 'YXZ');
  }
  // Bridge traffic loops end to end.
  const cars = landmarks.bridgeCars;
  const len = BRIDGE.x1 - BRIDGE.x0;
  cars.userData.cars.forEach((c, i) => {
    c.x += c.dir * c.v * dt;
    if (c.x > BRIDGE.x1) c.x -= len; else if (c.x < BRIDGE.x0) c.x += len;
    _p.set(c.x, BRIDGE.deckY + 0.85, c.lane);
    _m.compose(_p, _q.setFromEuler(_e.set(0, 0, 0)), _s);
    cars.setMatrixAt(i, _m);
  });
  cars.instanceMatrix.needsUpdate = true;
  // Lighthouse beam sweeps from dusk to dawn.
  const dusk = Math.max(night, 0);
  landmarks.beam.visible = dusk > 0.15;
  landmarks.beam.rotation.y = t * 0.7;
  landmarks.beam.children[0].material.opacity = 0.08 + dusk * 0.2;
  landmarks.beamGlow.material.opacity = 0.3 + dusk * 0.7;
  for (const h of landmarks.signs) h.material.opacity = 0.2 + night * 0.6;
}
