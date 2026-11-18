// Waist-high cover: crate and barrier clusters at the story's firefight sites (Club Volta on Neon Mile,
// the Saltwater warehouse at the docks, the end of Coral Pier). Crates are solid for movement and stop
// bullets below their top; a crouched character behind one cannot be seen or hit from the other side.
import { city, addCollider } from './city.js';
import { colorBoxes, LAMBERT_VC } from './voxel.js';

export const crates = [];    // { x, z, hw, hd, h }

const H = 1.3;
function crate(list, x, z, w = 1.4, d = 1.4, kind = 'wood') {
  const hw = w / 2, hd = d / 2;
  crates.push({ x, z, hw, hd, h: H });
  addCollider(x - hw, x + hw, z - hd, z + hd, H);
  if (kind === 'wood') {
    list.push([x, H / 2, z, w, H, d, '#b0753f'], [x, H - 0.05, z, w + 0.06, 0.1, d + 0.06, '#7a4a22'], [x, 0.35, z, w + 0.04, 0.1, d + 0.04, '#7a4a22']);
  } else {
    // Striped concrete barrier.
    list.push([x, H / 2, z, w, H, d, '#e8e2d8'], [x, H * 0.7, z, w + 0.04, 0.22, d + 0.04, '#ff5fa2']);
  }
}

export function buildCover(parent) {
  const L = city.landmarks, list = [];
  // Club Volta: the landmark sits on the block's north sidewalk (an east-west strip).
  const c = L.club;
  for (const dx of [-11, -6.5, 6.5, 11]) crate(list, c.x + dx, c.z + 0.1, 1.4, 1.2, Math.abs(dx) > 8 ? 'barrier' : 'wood');
  // Saltwater warehouse: east sidewalk (a north-south strip), plus a double stack by the bay door.
  const d = L.docks;
  for (const dz of [-12, -7, 7, 12]) crate(list, d.x + 0.1, d.z + dz, 1.2, 1.4);
  crate(list, d.x + 0.1, d.z - 3.2, 1.2, 1.2, 'barrier');
  // Coral Pier: crates along both rails near the end.
  const p = L.pier;
  for (const dx of [-22, -14, -6, 2]) { crate(list, p.x + dx, p.z - 3.4, 1.4, 1.2); crate(list, p.x + dx + 4, p.z + 3.4, 1.4, 1.2, 'barrier'); }
  const mesh = colorBoxes(list, LAMBERT_VC());
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
}

// True if the 2D segment a -> b crosses a crate that sits within `near` metres of a: someone crouched
// at a is hidden from b (and b's shots at a hit the crate).
export function coverBetween(ax, az, bx, bz, near = 2.4) {
  for (const c of crates) {
    if (Math.abs(c.x - ax) > near + c.hw || Math.abs(c.z - az) > near + c.hd) continue;
    if (segBox(ax, az, bx, bz, c.x - c.hw - 0.1, c.x + c.hw + 0.1, c.z - c.hd - 0.1, c.z + c.hd + 0.1)) return true;
  }
  return false;
}

function segBox(ax, az, bx, bz, x0, x1, z0, z1) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [o, d, lo, hi] of [[ax, dx, x0, x1], [az, dz, z0, z1]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; continue; }
    let u = (lo - o) / d, v = (hi - o) / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    if (t0 > t1) return false;
  }
  return true;
}

// Spots to crouch behind a crate, on the side away from (tx, tz), within `range` of (x, z).
export function crateSpots(x, z, tx, tz, range = 26) {
  const out = [];
  for (const c of crates) {
    if (Math.hypot(c.x - x, c.z - z) > range) continue;
    const dx = c.x - tx, dz = c.z - tz, l = Math.hypot(dx, dz) || 1;
    out.push({ x: c.x + (dx / l) * (Math.max(c.hw, c.hd) + 0.75), z: c.z + (dz / l) * (Math.max(c.hw, c.hd) + 0.75), crate: c });
  }
  return out;
}
