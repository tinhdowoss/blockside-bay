// Grid city: districts, roads, sidewalks, art-deco buildings, palms, beach, ocean, pier and neon (merged by the
// voxel Batcher, seed 1337), plus the road graph helpers, the collider grid and the story landmarks.
import { CELL, ROAD_W, GRID_N, CITY_SIZE, OCEAN_X, DISTRICTS, PALETTES, BEACH_NAME } from '../core/config.js';
import { makeRng } from '../core/rng.js';
import { Batcher } from './voxel.js';
import * as TX from './textures.js';
import { registerGlow } from '../fx/grade.js';
import { buildWater, updateWater } from './water.js';

const THREE = window.THREE;
const HALF_ROAD = ROAD_W / 2;
const EDGE = 26;                       // land margin outside the outer roads
export const PIER_Z = 6.5 * CELL;      // Coral Pier centre line
export const PIER_LEN = 90;

export const city = {
  group: null,
  colliders: [],      // {minX,maxX,minZ,maxZ,h,low}
  hash: new Map(),
  lots: [],           // for the map: {x0,z0,x1,z1,color,kind}
  parks: [],
  glowMats: [],       // facade materials whose emissive rises at night
  nightOnly: [],      // meshes visible at night only
  neon: [],           // neon sign meshes (pulse)
  water: null,
  landmarks: {},
  streetLights: [],
  buildings: [],      // {cx,cz,w,d,h,kind,pi,bx,bz} for storefronts, billboards and the like
};

export const districtAt = (x, z) => {
  if (x > OCEAN_X - 8 && Math.abs(z - PIER_Z) < 7) return DISTRICTS.find((d) => d.id === 'pier');
  if (x > CITY_SIZE + HALF_ROAD) return { id: 'beach', name: BEACH_NAME, color: '#ffe2a8' };
  const bx = Math.max(0, Math.min(GRID_N - 1, Math.floor(x / CELL)));
  const bz = Math.max(0, Math.min(GRID_N - 1, Math.floor(z / CELL)));
  return DISTRICTS.find((d) => d.test(bx, bz)) || DISTRICTS[0];
};
const districtOfBlock = (bx, bz) => DISTRICTS.find((d) => d.test(bx, bz)) || DISTRICTS[0];

// ---- Road graph -------------------------------------------------------------------------
export const nodePos = (i, j) => ({ x: i * CELL, z: j * CELL });
export function nearestNode(x, z) {
  return {
    i: Math.max(0, Math.min(GRID_N, Math.round(x / CELL))),
    j: Math.max(0, Math.min(GRID_N, Math.round(z / CELL))),
  };
}
export function nodeNeighbors(i, j) {
  const out = [];
  if (i > 0) out.push({ i: i - 1, j });
  if (i < GRID_N) out.push({ i: i + 1, j });
  if (j > 0) out.push({ i, j: j - 1 });
  if (j < GRID_N) out.push({ i, j: j + 1 });
  return out;
}
export function onRoad(x, z) {
  const rx = Math.abs(x - Math.round(x / CELL) * CELL) < HALF_ROAD;
  const rz = Math.abs(z - Math.round(z / CELL) * CELL) < HALF_ROAD;
  const inside = x > -HALF_ROAD && x < CITY_SIZE + HALF_ROAD && z > -HALF_ROAD && z < CITY_SIZE + HALF_ROAD;
  return inside && (rx || rz);
}
/** Closest point on any road centre line, with the axis that road runs along. */
export function snapToRoad(x, z) {
  const cx = Math.max(0, Math.min(CITY_SIZE, Math.round(x / CELL) * CELL));
  const cz = Math.max(0, Math.min(CITY_SIZE, Math.round(z / CELL) * CELL));
  const dx = Math.abs(x - cx), dz = Math.abs(z - cz);
  return dx < dz ? { x: cx, z: Math.max(0, Math.min(CITY_SIZE, z)), axis: 'z' } : { x: Math.max(0, Math.min(CITY_SIZE, x)), z: cz, axis: 'x' };
}

// ---- Colliders ---------------------------------------------------------------------------
const HC = 16;   // spatial hash cell size (world units)
/** Registers a solid box for movement, sight and bullets (also used by world/cover.js for crates). */
export function addCollider(minX, maxX, minZ, maxZ, h, low = false) {
  const c = { minX, maxX, minZ, maxZ, h, low };
  const id = city.colliders.push(c) - 1;
  for (let gx = Math.floor(minX / HC); gx <= Math.floor(maxX / HC); gx++) {
    for (let gz = Math.floor(minZ / HC); gz <= Math.floor(maxZ / HC); gz++) {
      const k = gx * 10007 + gz;
      if (!city.hash.has(k)) city.hash.set(k, []);
      city.hash.get(k).push(id);
    }
  }
}
function nearby(x, z, r) {
  const set = new Set();
  for (let gx = Math.floor((x - r) / HC); gx <= Math.floor((x + r) / HC); gx++) {
    for (let gz = Math.floor((z - r) / HC); gz <= Math.floor((z + r) / HC); gz++) {
      const l = city.hash.get(gx * 10007 + gz);
      if (l) for (const id of l) set.add(id);
    }
  }
  return set;
}
/** Pushes a circle out of every collider; returns {x, z, hit, nx, nz}. */
export function collideCircle(x, z, r) {
  let hit = false, nx = 0, nz = 0;
  for (const id of nearby(x, z, r + 1)) {
    const c = city.colliders[id];
    const px = Math.max(c.minX, Math.min(x, c.maxX));
    const pz = Math.max(c.minZ, Math.min(z, c.maxZ));
    let dx = x - px, dz = z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 < 1e-6) {
        // Centre inside the box: push out along the shallowest axis.
        const l = x - c.minX, rr = c.maxX - x, t = z - c.minZ, b = c.maxZ - z;
        const m = Math.min(l, rr, t, b);
        if (m === l) { x = c.minX - r; dx = -1; dz = 0; } else if (m === rr) { x = c.maxX + r; dx = 1; dz = 0; }
        else if (m === t) { z = c.minZ - r; dx = 0; dz = -1; } else { z = c.maxZ + r; dx = 0; dz = 1; }
        nx += dx; nz += dz;
      } else {
        const d = Math.sqrt(d2);
        x = px + (dx / d) * r; z = pz + (dz / d) * r;
        nx += dx / d; nz += dz / d;
      }
    }
  }
  const nl = Math.hypot(nx, nz) || 1;
  return { x, z, hit, nx: nx / nl, nz: nz / nl };
}
/** True if a straight 2D line between two points crosses a tall building. */
export function sightBlocked(x1, z1, x2, z2) {
  const steps = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 3);
  for (let s = 1; s < steps; s++) {
    const t = s / steps, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
    for (const id of nearby(x, z, 0)) {
      const c = city.colliders[id];
      if (!c.low && c.h > 3 && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
    }
  }
  return false;
}
/** 3D ray against buildings: returns distance to the first wall or Infinity. */
export function rayBuildings(ox, oy, oz, dx, dy, dz, maxD) {
  let best = maxD;
  const step = 2;
  for (let t = 0; t < best; t += step) {
    const x = ox + dx * t, z = oz + dz * t;
    for (const id of nearby(x, z, 0)) {
      const c = city.colliders[id];
      if (c.low) continue;
      const hitT = rayAabb(ox, oy, oz, dx, dy, dz, c);
      if (hitT < best) best = hitT;
    }
    if (best < maxD && t > best) break;
  }
  return best < maxD ? best : Infinity;
}
function rayAabb(ox, oy, oz, dx, dy, dz, c) {
  let tmin = 0, tmax = Infinity;
  const ax = [[ox, dx, c.minX, c.maxX], [oy, dy, 0, c.h], [oz, dz, c.minZ, c.maxZ]];
  for (const [o, d, lo, hi] of ax) {
    if (Math.abs(d) < 1e-8) { if (o < lo || o > hi) return Infinity; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

// ---- Build -------------------------------------------------------------------------------
let B; // Batcher in use while building
export const mats = {};
function lambert(opts) { return new THREE.MeshLambertMaterial(opts); }

function setupMaterials() {
  mats.road = lambert({ map: TX.roadTexture() });
  mats.cross = lambert({ map: TX.intersectionTexture() });
  mats.walk = lambert({ map: TX.sidewalkTexture() });
  mats.plaza = lambert({ map: TX.plazaTexture() });
  mats.grass = lambert({ map: TX.grassTexture() });
  mats.sand = lambert({ map: TX.sandTexture() });
  mats.roof = lambert({ map: TX.roofTexture() });
  mats.wood = lambert({ map: TX.woodTexture() });
  mats.bark = lambert({ map: TX.barkTexture(), vertexColors: true });
  mats.leaf = lambert({ map: TX.leafTexture(), vertexColors: true });
  mats.vc = lambert({ vertexColors: true });
  mats.glow = registerGlow(new THREE.MeshBasicMaterial({ vertexColors: true }), 1, 2.8);
  mats.cloud = lambert({ map: TX.cloudTexture(), emissive: new THREE.Color('#9fb8d8'), emissiveIntensity: 0.6 });
  B = new Batcher();
  for (const k of Object.keys(mats)) B.material(k, mats[k]);
}

function wallMat(pi, kind) {
  const key = `wall${pi}${kind}`;
  if (!mats[key]) {
    const seed = pi * 7 + kind.length;
    mats[key] = lambert({
      map: TX.facadeTexture(PALETTES[pi], kind, seed),
      emissiveMap: TX.facadeGlowTexture(kind, seed),
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0,
    });
    city.glowMats.push(mats[key]);
    B.material(key, mats[key]);
  }
  return key;
}

// One building (4 units per floor) with its trim, neon and roof details; returns its total height.
function building(cx, cz, w, d, floors, pi, kind, rnd) {
  const pal = PALETTES[pi];
  const h = floors * 4;
  const wk = wallMat(pi, kind);
  city.buildings.push({ cx, cz, w, d, h, kind, pi, bx: Math.floor(cx / CELL), bz: Math.floor(cz / CELL) });
  B.box(wk, cx, h / 2, cz, w, h, d, { uv: 8, top: 'roof' });
  addCollider(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, h);
  if (kind === 'warehouse') {
    B.box('vc', cx, h + 0.3, cz, w + 0.3, 0.6, d + 0.3, { color: pal.accent });
    return h;
  }
  // Parapet + corner fins (art-deco trim)
  B.box('vc', cx, h + 0.35, cz, w + 0.5, 0.7, d + 0.5, { color: pal.accent, top: 'roof' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    B.box('vc', cx + sx * (w / 2), h / 2, cz + sz * (d / 2), 0.7, h + 0.2, 0.7, { color: pal.trim });
  }
  // Ground-floor awning band
  B.box('vc', cx, 3.6, cz, w + 0.9, 0.35, d + 0.9, { color: pal.accent });
  // Neon tubes: a glowing ring under the parapet, and corner tubes on nightlife streets.
  const neon = NEON_TUBES[Math.floor(rnd() * NEON_TUBES.length)];
  if (kind !== 'house') B.box('glow', cx, h - 0.15, cz, w + 0.66, 0.22, d + 0.66, { color: neon, skip: 'py,ny' });
  B.box('glow', cx, 3.95, cz, w + 0.95, 0.12, d + 0.95, { color: neon, skip: 'py,ny' });
  if (kind === 'deco' || kind === 'hotel') {
    for (const sx of [-1, 1]) B.box('glow', cx + sx * (w / 2 + 0.36), h / 2 + 2, cz + d / 2 + 0.36, 0.14, h - 4, 0.14, { color: neon });
  }
  if (kind === 'tower') {
    const sw = w * 0.65, sd = d * 0.65, sh = 8;
    B.box(wk, cx, h + sh / 2, cz, sw, sh, sd, { uv: 8, top: 'roof' });
    B.box('vc', cx, h + sh + 3, cz, 0.4, 6, 0.4, { color: '#dddddd' });
    B.box('glow', cx, h + sh + 6.2, cz, 0.6, 0.6, 0.6, { color: '#ff3050' });
    return h + sh;
  }
  if (floors >= 4 || kind === 'hotel') {
    // Stepped crown with a deco fin
    const sw = w * 0.55, sd = d * 0.55;
    B.box(wk, cx, h + 2, cz, sw, 4, sd, { uv: 8, top: 'roof' });
    B.box('vc', cx, h + 4.3, cz, sw + 0.4, 0.6, sd + 0.4, { color: pal.accent });
    B.box('vc', cx, h + 6.5, cz, 1.2, 4.4, 1.2, { color: pal.trim });
    B.box('vc', cx, h + 8.9, cz, 0.5, 0.5, 0.5, { color: pal.accent });
    if (rnd() < 0.5) B.box('vc', cx, h + 2, cz + sd / 2 + 0.2, sw * 0.3, 4, 0.4, { color: pal.accent });
    return h + 9;
  }
  // Rooftop details: AC units and a water tank
  B.box('vc', cx + w * 0.2, h + 0.9, cz - d * 0.2, 2, 1.2, 1.6, { color: '#c8c8c8' });
  if (rnd() < 0.5) B.box('vc', cx - w * 0.2, h + 1.6, cz + d * 0.15, 1.8, 2.4, 1.8, { color: '#b07a4a' });
  return h;
}

function palm(x, z, rnd, scale = 1) {
  const h = (6 + rnd() * 3) * scale;
  const lean = (rnd() - 0.5) * 0.9, leanDir = rnd() * Math.PI * 2;
  const segs = 6;
  let px = x, pz = z;
  for (let s = 0; s < segs; s++) {
    const t = s / segs;
    const bend = lean * t * t * 2;
    px = x + Math.cos(leanDir) * bend; pz = z + Math.sin(leanDir) * bend;
    B.box('bark', px, (s + 0.5) * (h / segs), pz, 0.55 - t * 0.12, h / segs + 0.02, 0.55 - t * 0.12, { uv: 2 });
  }
  const topY = h;
  B.box('vc', px, topY, pz, 0.9, 0.6, 0.9, { color: '#3b8f2f' });
  B.box('vc', px + 0.3, topY - 0.4, pz, 0.35, 0.35, 0.35, { color: '#7a4a1a' });
  B.box('vc', px - 0.2, topY - 0.45, pz + 0.25, 0.35, 0.35, 0.35, { color: '#7a4a1a' });
  const leaves = 7;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let k = 0; k < leaves; k++) {
    const yaw = (k / leaves) * Math.PI * 2 + rnd() * 0.4;
    const len = (3.2 + rnd() * 1.2) * scale;
    // Inner half rises slightly, outer half droops.
    for (let seg = 0; seg < 2; seg++) {
      const pitch = seg === 0 ? -0.15 : 0.55;
      const r0 = seg === 0 ? len * 0.25 : len * 0.72;
      const yOff = seg === 0 ? 0.25 : -0.25;
      e.set(pitch, yaw, 0, 'YXZ');
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(px + Math.sin(yaw) * r0, topY + yOff, pz + Math.cos(yaw) * r0), q, new THREE.Vector3(1, 1, 1));
      B.box('leaf', 0, 0, 0, seg === 0 ? 1.1 : 0.9, 0.12, len * 0.52, { matrix: m, uv: 0, color: seg ? '#c8ffb0' : '#ffffff' });
    }
  }
  addCollider(x - 0.35, x + 0.35, z - 0.35, z + 0.35, h, false);
}

function streetLight(x, z, facing) {
  const ax = Math.sin(facing), az = Math.cos(facing);
  B.box('vc', x, 3.2, z, 0.25, 6.4, 0.25, { color: '#5b6070' });
  B.box('vc', x + ax * 1.0, 6.3, z + az * 1.0, Math.abs(ax) > 0.5 ? 2.2 : 0.25, 0.2, Math.abs(az) > 0.5 ? 2.2 : 0.25, { color: '#5b6070' });
  B.box('glow', x + ax * 1.9, 6.1, z + az * 1.9, 0.6, 0.25, 0.6, { color: '#fff3c0' });
  city.streetLights.push({ x: x + ax * 1.9, z: z + az * 1.9 });
  addCollider(x - 0.2, x + 0.2, z - 0.2, z + 0.2, 6.4);
}

function neonSign(text, color, x, y, z, faceYaw, height = 1.6) {
  const tex = TX.neonSignTexture(text, color);
  const w = height * tex.userData.aspect;
  const mat = registerGlow(new THREE.MeshBasicMaterial({ map: tex }), 1, 2.2);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, height), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = faceYaw;
  city.group.add(mesh);
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 1.5, height * 2.6),
    new THREE.MeshBasicMaterial({ map: TX.glowTexture(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }),
  );
  halo.position.set(x + Math.sin(faceYaw) * 0.05, y, z + Math.cos(faceYaw) * 0.05);
  halo.rotation.y = faceYaw;
  city.group.add(halo);
  city.neon.push({ mesh, halo, phase: x * 0.13 + z * 0.07 });
}

// Picks a road-facing side of a lot and puts a neon sign on that wall.
function signOnBuilding(text, color, cx, cz, w, d, bx, bz, y) {
  // Face toward the nearest road: compare distances to block edges.
  const x0 = bx * CELL, z0 = bz * CELL;
  const sides = [
    { yaw: 0, x: cx, z: cz + d / 2 + 0.12, dist: z0 + CELL - (cz + d / 2) },
    { yaw: Math.PI, x: cx, z: cz - d / 2 - 0.12, dist: cz - d / 2 - z0 },
    { yaw: Math.PI / 2, x: cx + w / 2 + 0.12, z: cz, dist: x0 + CELL - (cx + w / 2) },
    { yaw: -Math.PI / 2, x: cx - w / 2 - 0.12, z: cz, dist: cx - w / 2 - x0 },
  ].sort((a, b) => a.dist - b.dist);
  const s = sides[0];
  neonSign(text, color, s.x, y, s.z, s.yaw);
}

const NEON_TUBES = ['#ff3fd0', '#3fe8ff', '#ffd23f', '#7cff6b', '#b06bff', '#ff5f7a'];
const NEON_NAMES = [
  ['CLUB VOLTA', '#ff3fd0'], ['TACOS 24/7', '#ffd23f'], ['PINK PALMS', '#ff5fa2'], ['ARCADE', '#3fe8ff'],
  ['BAR CORAL', '#ff7a3d'], ['LIQUOR', '#7cff6b'], ['MOTEL SOL', '#ff3fd0'], ['DISCO', '#b06bff'],
  ['PAWN', '#3fe8ff'], ['HOTEL LUNA', '#ffd23f'], ['KARAOKE', '#ff5fa2'], ['CAFE ROSA', '#ff7a9a'],
];

// Fills block (bx, bz): sidewalk, palms, lamps, then the district's building style (or a park / plaza / car park).
function buildBlock(bx, bz, rnd) {
  const x0 = bx * CELL + HALF_ROAD, z0 = bz * CELL + HALF_ROAD;
  const size = CELL - ROAD_W;            // 36
  const cx = x0 + size / 2, cz = z0 + size / 2;
  const dist = districtOfBlock(bx, bz);
  // Sidewalk slab with curb
  B.box('walk', cx, 0.1, cz, size, 0.2, size, { uv: 4, skip: 'ny' });
  const lot = { x0: x0 + 3, z0: z0 + 3, x1: x0 + size - 3, z1: z0 + size - 3 };
  const L = lot.x1 - lot.x0; // 30
  const special = specialBlock(bx, bz);
  const pi = () => Math.floor(rnd() * PALETTES.length);

  // Palms along the sidewalk + streetlights at corners
  for (let k = 0; k < 4; k++) {
    for (let s = 0; s < 3; s++) {
      if (rnd() < (dist.id === 'midtown' ? 0.5 : 0.25)) continue;
      const t = 7 + s * 11;
      const off = 1.3;
      const p = [[x0 + t, z0 + off], [x0 + size - off, z0 + t], [x0 + size - t, z0 + size - off], [x0 + off, z0 + size - t]][k];
      palm(p[0], p[1], rnd, 0.95);
    }
  }
  streetLight(x0 + 1, z0 + 1, -Math.PI * 0.75);
  streetLight(x0 + size - 1, z0 + size - 1, Math.PI * 0.25);

  if (special === 'park' || special === 'plaza' || special === 'parking') {
    const mk = special === 'park' ? 'grass' : special === 'plaza' ? 'plaza' : 'cross';
    B.box(mk, cx, 0.22, cz, L, 0.05, L, { uv: special === 'park' ? 4 : 6, faces: 'py' });
    city.parks.push({ ...lot, kind: special });
    if (special === 'park') {
      for (let i = 0; i < 9; i++) palm(lot.x0 + 3 + rnd() * (L - 6), lot.z0 + 3 + rnd() * (L - 6), rnd, 1.1);
      B.box('vc', cx, 0.6, cz, 6, 0.8, 6, { color: '#ffffff' });
      B.box('vc', cx, 0.75, cz, 5, 0.6, 5, { color: '#41d6ff' });
      B.box('vc', cx, 1.8, cz, 0.8, 2.4, 0.8, { color: '#ffb3d1' });
    } else if (special === 'plaza') {
      B.box('vc', cx, 1.4, cz, 3, 2.8, 3, { color: '#ffffff' });
      B.box('vc', cx, 3.4, cz, 1.4, 1.2, 1.4, { color: '#ff5fa2' });
      for (let i = 0; i < 4; i++) palm(cx + (i % 2 ? 9 : -9), cz + (i < 2 ? 9 : -9), rnd, 1.2);
    } else {
      for (let r = 0; r < 4; r++) B.box('vc', cx, 0.26, lot.z0 + 3 + r * 8, L - 4, 0.02, 0.25, { color: '#ffffff' });
    }
    return;
  }

  const addLot = (x, z, w, d, color, kind) => city.lots.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, color, kind });
  let neonUsed = 0;
  // At most two neon signs per block; outside the nightlife districts only about a third get one.
  const neonAt = (x, z, w, d, y) => {
    if (dist.id !== 'neon' && dist.id !== 'caracol' && dist.id !== 'pier' && rnd() > 0.35) return;
    if (neonUsed > 1) return;
    const [text, color] = NEON_NAMES[Math.floor(rnd() * NEON_NAMES.length)];
    signOnBuilding(text, color, x, z, w, d, bx, bz, y);
    neonUsed++;
  };

  switch (dist.id) {
    case 'palmetto': {
      for (let i = 0; i < 4; i++) {
        const qx = lot.x0 + (i % 2) * 15 + 7.5, qz = lot.z0 + Math.floor(i / 2) * 15 + 7.5;
        B.box('grass', qx, 0.22, qz, 15, 0.05, 15, { uv: 4, faces: 'py' });
        const p = pi(), fl = 2 + Math.floor(rnd() * 2);
        const w = 9 + rnd() * 3, d = 9 + rnd() * 3;
        building(qx + (rnd() - 0.5) * 2, qz + (rnd() - 0.5) * 2, w, d, fl, p, 'house', rnd);
        addLot(qx, qz, w, d, PALETTES[p].wall, 'house');
        if (rnd() < 0.5) {
          const px = qx + (i % 2 ? -5.5 : 5.5), pz = qz + (i < 2 ? -5.5 : 5.5);
          B.box('vc', px, 0.25, pz, 3.4, 0.1, 3.4, { color: '#ffffff' });
          B.box('glow', px, 0.31, pz, 3, 0.04, 3, { color: '#5fe6ff' });
        } else palm(qx + (i % 2 ? -6 : 6), qz + (i < 2 ? -6 : 6), rnd, 1.1);
      }
      break;
    }
    case 'midtown': {
      const p = pi();
      B.box(wallMat(p, 'tower'), cx, 4, cz, L, 8, L, { uv: 8, top: 'roof' });
      addCollider(lot.x0, lot.x1, lot.z0, lot.z1, 8);
      const tw = 18 + rnd() * 4;
      building(cx, cz, tw, tw, 8 + Math.floor(rnd() * 9), (p + 3) % PALETTES.length, 'tower', rnd);
      addLot(cx, cz, L, L, PALETTES[p].wall, 'tower');
      if (rnd() < 0.4) neonAt(cx, cz, L, L, 6);
      break;
    }
    case 'docks': {
      const p = 4 + Math.floor(rnd() * 2);
      building(cx, lot.z0 + 8, L - 2, 14, 2, p, 'warehouse', rnd);
      addLot(cx, lot.z0 + 8, L - 2, 14, PALETTES[p].wall, 'warehouse');
      const cc = ['#ff5f5f', '#3f8fff', '#ffb000', '#2fbf8f', '#ff5fa2'];
      for (let i = 0; i < 6; i++) {
        const x = lot.x0 + 3 + (i % 3) * 9, z = lot.z0 + 19 + Math.floor(i / 3) * 5.5;
        const stack = 1 + Math.floor(rnd() * 2);
        for (let s = 0; s < stack; s++) B.box('vc', x, 1.25 + s * 2.5, z, 8, 2.5, 3, { color: cc[Math.floor(rnd() * cc.length)] });
        addCollider(x - 4, x + 4, z - 1.5, z + 1.5, stack * 2.5);
        city.lots.push({ x0: x - 4, z0: z - 1.5, x1: x + 4, z1: z + 1.5, color: '#c0703a', kind: 'container' });
      }
      break;
    }
    case 'shores':
    case 'pier': {
      const p = pi();
      const fl = dist.id === 'shores' ? 6 + Math.floor(rnd() * 4) : 3 + Math.floor(rnd() * 3);
      const w = 24, d = 24;
      building(cx, cz, w, d, fl, p, 'hotel', rnd);
      addLot(cx, cz, w, d, PALETTES[p].wall, 'hotel');
      neonAt(cx, cz, w, d, 5);
      break;
    }
    default: { // neon + caracol: two deco buildings
      const split = rnd() < 0.5;
      for (let k = 0; k < 2; k++) {
        const p = pi();
        const fl = dist.id === 'neon' ? 3 + Math.floor(rnd() * 4) : 2 + Math.floor(rnd() * 3);
        const w = split ? 14 : L - 1, d = split ? L - 1 : 14;
        const x = split ? lot.x0 + 7.5 + k * 15 : cx, z = split ? cz : lot.z0 + 7.5 + k * 15;
        building(x, z, w, d, fl, p, 'deco', rnd);
        addLot(x, z, w, d, PALETTES[p].wall, 'deco');
        neonAt(x, z, w, d, 5.5 + rnd() * 2);
      }
    }
  }
}

function specialBlock(bx, bz) {
  const key = `${bx},${bz}`;
  return { '1,1': 'park', '5,1': 'plaza', '3,4': 'plaza', '7,6': 'parking', '0,5': 'parking', '3,7': 'park' }[key] || null;
}

function buildRoads() {
  const n = GRID_N;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j < n; j++) {
      // along z at x = i*CELL
      B.box('road', i * CELL, 0.02, (j + 0.5) * CELL, ROAD_W, 0.04, CELL - ROAD_W, { uv: 12, faces: 'py', uo: 0.5 });
      B.box('road', (j + 0.5) * CELL, 0.02, i * CELL, ROAD_W, 0.04, CELL - ROAD_W, { uv: 12, faces: 'py', ry: Math.PI / 2, uo: 0.5 });
    }
    for (let j = 0; j <= n; j++) B.box('cross', i * CELL, 0.02, j * CELL, ROAD_W, 0.04, ROAD_W, { faces: 'py' });
  }
}

function buildGroundAndCoast(rnd) {
  // Land slab (grass edge) and beach
  const landX0 = -EDGE, landX1 = CITY_SIZE + HALF_ROAD, landZ0 = -EDGE, landZ1 = CITY_SIZE + EDGE;
  B.box('grass', (landX0 + landX1) / 2, -0.5, (landZ0 + landZ1) / 2, landX1 - landX0, 1, landZ1 - landZ0, { uv: 4, top: 'grass' });
  B.box('sand', (landX1 + OCEAN_X + 8) / 2, -0.5, (landZ0 + landZ1) / 2, OCEAN_X + 8 - landX1, 1, landZ1 - landZ0, { uv: 4 });
  // Seawall around the grass edge
  B.box('vc', landX0 - 0.5, 0.2, (landZ0 + landZ1) / 2, 1, 1.4, landZ1 - landZ0, { color: '#f2e6d8' });
  B.box('vc', (landX0 + OCEAN_X) / 2, 0.2, landZ0 - 0.5, OCEAN_X - landX0, 1.4, 1, { color: '#f2e6d8' });
  B.box('vc', (landX0 + OCEAN_X) / 2, 0.2, landZ1 + 0.5, OCEAN_X - landX0, 1.4, 1, { color: '#f2e6d8' });
  // Out-of-bounds water colliders (low: do not block sight or bullets)
  addCollider(-400, landX0 - 0.5, -400, 800, 0, true);
  addCollider(-400, 900, -400, landZ0 - 0.5, 0, true);
  addCollider(-400, 900, landZ1 + 0.5, 800, 0, true);
  addCollider(OCEAN_X + 6, 900, -400, PIER_Z - 5.5, 0, true);
  addCollider(OCEAN_X + 6, 900, PIER_Z + 5.5, 800, 0, true);
  addCollider(OCEAN_X + PIER_LEN, 900, PIER_Z - 6, PIER_Z + 6, 0, true);
  // Edge palms and beach props
  for (let z = 4; z < CITY_SIZE; z += 14) { palm(-15 + rnd() * 6, z, rnd); palm(z, -15 + rnd() * 6, rnd); palm(z, CITY_SIZE + 15 + rnd() * 5, rnd); }
  for (let z = -10; z < CITY_SIZE + 20; z += 9) palm(CITY_SIZE + 12 + rnd() * 4, z, rnd, 1.1);
  const umb = ['#ff5fa2', '#ffd23f', '#2ee6c8', '#7a5cff', '#ff7a3d'];
  for (let i = 0; i < 26; i++) {
    const x = CITY_SIZE + 22 + rnd() * 22, z = rnd() * CITY_SIZE;
    if (Math.abs(z - PIER_Z) < 10) continue;
    const c = umb[i % umb.length];
    B.box('vc', x, 1.2, z, 0.15, 2.4, 0.15, { color: '#ffffff' });
    B.box('vc', x, 2.5, z, 3, 0.3, 3, { color: c });
    B.box('vc', x, 2.75, z, 1.6, 0.25, 1.6, { color: '#ffffff' });
    B.box('vc', x + 1.4, 0.06, z + 0.6, 1.1, 0.08, 2, { color: umb[(i + 2) % umb.length] });
  }
  // Lifeguard towers
  for (const z of [60, 170, 250, 370]) {
    const x = CITY_SIZE + 36;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box('vc', x + sx, 1.5, z + sz, 0.25, 3, 0.25, { color: '#ffffff' });
    B.box('vc', x, 3.6, z, 3, 1.8, 3, { color: '#ff5fa2' });
    B.box('vc', x, 4.7, z, 3.6, 0.4, 3.6, { color: '#2ee6c8' });
    addCollider(x - 1.5, x + 1.5, z - 1.5, z + 1.5, 4.9);
  }
  // Wet sand along the waterline (the foam itself is drawn by the water shader).
  B.box('vc', OCEAN_X + 5.5, 0.01, (landZ0 + landZ1) / 2, 5, 0.04, landZ1 - landZ0, { color: '#d9b77a' });
}

// Coral Pier: plank deck on pilings with rails, the arch sign, and Salt's yacht moored at the end.
function buildPier() {
  const x0 = OCEAN_X - 6, len = PIER_LEN;
  B.box('wood', x0 + len / 2, 0.15, PIER_Z, len, 0.3, 11, { uv: 4 });
  for (let x = x0; x < x0 + len; x += 6) {
    for (const sz of [-1, 1]) {
      B.box('vc', x, -1, PIER_Z + sz * 5.2, 0.5, 2.4, 0.5, { color: '#6e4626' });
      B.box('vc', x, 0.9, PIER_Z + sz * 5.4, 0.2, 1.2, 0.2, { color: '#ffffff' });
    }
  }
  B.box('vc', x0 + len / 2, 1.4, PIER_Z - 5.4, len, 0.15, 0.15, { color: '#ffffff' });
  B.box('vc', x0 + len / 2, 1.4, PIER_Z + 5.4, len, 0.15, 0.15, { color: '#ffffff' });
  addCollider(x0, x0 + len, PIER_Z - 6.2, PIER_Z - 5.4, 1.5, true);
  addCollider(x0, x0 + len, PIER_Z + 5.4, PIER_Z + 6.2, 1.5, true);
  // The yacht moored at the end
  const yx = x0 + len + 8, yz = PIER_Z + 13;
  B.box('vc', yx, 0.2, yz, 26, 2.4, 8, { color: '#ffffff' });
  B.box('vc', yx, -0.6, yz, 26.2, 0.6, 8.2, { color: '#1d3c8f' });
  B.box('vc', yx - 1, 2.4, yz, 16, 2, 6.4, { color: '#f4f4f4' });
  B.box('vc', yx - 1, 2.4, yz, 16.1, 0.7, 6.5, { color: '#1d3f66' });
  B.box('vc', yx - 3, 4.2, yz, 9, 1.6, 5, { color: '#ffffff' });
  B.box('vc', yx - 3, 4.2, yz, 9.1, 0.5, 5.1, { color: '#1d3f66' });
  B.box('vc', yx - 4, 6, yz, 0.3, 3, 0.3, { color: '#dddddd' });
  B.box('vc', yx + 13.5, 0.4, yz, 3, 2, 5, { color: '#ffffff' });
  city.landmarks.yacht = { x: yx, z: yz, name: 'THE SALT MARGARITA' };
  // Pier arch sign
  B.box('vc', x0 + 2, 3, PIER_Z - 5.6, 0.6, 6, 0.6, { color: '#ff5fa2' });
  B.box('vc', x0 + 2, 3, PIER_Z + 5.6, 0.6, 6, 0.6, { color: '#ff5fa2' });
  B.box('vc', x0 + 2, 6.2, PIER_Z, 0.6, 0.8, 11.8, { color: '#ff5fa2' });
  neonSign('CORAL PIER', '#ffd23f', x0 + 1.6, 7.4, PIER_Z, -Math.PI / 2, 1.8);
}

function buildNightPools() {
  const mat = new THREE.MeshBasicMaterial({ map: TX.glowTexture('#ffcf80'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 });
  const geo = new THREE.PlaneGeometry(11, 11);
  const inst = new THREE.InstancedMesh(geo, mat, city.streetLights.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  city.streetLights.forEach((l, i) => { m.compose(new THREE.Vector3(l.x, 0.08, l.z), q, new THREE.Vector3(1, 1, 1)); inst.setMatrixAt(i, m); });
  inst.visible = false;
  city.group.add(inst);
  city.nightOnly.push(inst);
}

function defineLandmarks() {
  const side = (bx, bz, s) => {
    const x0 = bx * CELL + HALF_ROAD, z0 = bz * CELL + HALF_ROAD, size = CELL - ROAD_W;
    return { n: { x: x0 + size / 2, z: z0 + 1.5 }, s: { x: x0 + size / 2, z: z0 + size - 1.5 }, w: { x: x0 + 1.5, z: z0 + size / 2 }, e: { x: x0 + size - 1.5, z: z0 + size / 2 } }[s];
  };
  Object.assign(city.landmarks, {
    safehouse: { ...side(1, 2, 's'), name: "KAI'S PLACE" },
    diner: { ...side(4, 3, 'n'), name: 'FLAMINGO DINER' },
    garage: { ...side(1, 4, 'e'), name: 'BRIX AUTO' },
    club: { ...side(5, 1, 'n'), name: 'CLUB VOLTA' },
    docks: { ...side(0, 6, 'e'), name: 'SALTWATER WAREHOUSE' },
    shores: { ...side(7, 4, 'e'), name: 'SUNSET SHORES MOTEL' },
    pier: { x: OCEAN_X + 70, z: PIER_Z, name: 'CORAL PIER' },
    caracol: { ...side(3, 6, 's'), name: 'CARACOL MARKET' },
    tower: { ...side(4, 4, 'w'), name: 'REEF TOWER' },
    beach: { x: CITY_SIZE + 30, z: 120, name: 'SEAGLASS BEACH' },
    clinic: { ...side(2, 3, 'n'), name: 'ST. CORAL CLINIC' },
  });
}

export function buildCity(scene) {
  city.group = new THREE.Group();
  scene.add(city.group);
  const rnd = makeRng(1337);
  setupMaterials();
  buildGroundAndCoast(rnd);
  buildRoads();
  for (let bx = 0; bx < GRID_N; bx++) for (let bz = 0; bz < GRID_N; bz++) buildBlock(bx, bz, rnd);
  buildPier();
  city.group.add(B.build(true));
  city.water = buildWater(city.group);
  buildNightPools();
  defineLandmarks();
  return city;
}

/** Per-frame: animates the water and flickers the neon halos (brighter at night). */
export function updateCity(t, night, focus = { x: CITY_SIZE / 2, z: CITY_SIZE / 2 }) {
  updateWater(t, focus);
  for (const n of city.neon) {
    const flick = 0.75 + 0.25 * Math.sin(t * 3 + n.phase) + (Math.sin(t * 23 + n.phase * 5) > 0.97 ? -0.4 : 0);
    n.halo.material.opacity = (0.25 + night * 0.6) * flick;
  }
}
