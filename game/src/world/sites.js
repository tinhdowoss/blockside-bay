// Voxel props for the side-activity sites, merged per material:
//   garage bays  - striped drive-in pad on the road, hydraulic lift, tyre stacks, oil drums, lit sign
//   gun counters - kiosk with a striped awning, target board and sign
//   courier depot- parcel stacks, roll cage trolleys, sign, a BAYRUNNER van parked and waiting
//   cab stand    - CAB sign post and a waiting PALOMAR cab
//   race starts  - chequered arch over the junction with the race name
// Parked vans/cabs are re-spawned when the player has driven off with them and is far away.
import { CELL } from '../core/config.js';
import { SITES, RACES } from '../data/activities-data.js';
import { Batcher } from './voxel.js';
import { neonSignTexture, glowTexture } from './textures.js';
import { registerGlow } from '../fx/grade.js';
import { Vehicle, vehicles } from '../gameplay/vehicles.js';
import { player } from '../gameplay/player.js';

const THREE = window.THREE;
let group;
const signs = [];
const parked = [];

function sign(text, color, x, y, z, yaw, h) {
  const tex = neonSignTexture(text, color);
  const w = h * tex.userData.aspect;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), registerGlow(new THREE.MeshBasicMaterial({ map: tex }), 1, 2.2));
  mesh.position.set(x, y, z); mesh.rotation.y = yaw;
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.3, h * 2.2), new THREE.MeshBasicMaterial({ map: glowTexture(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.3 }));
  halo.position.set(x - Math.sin(yaw) * 0.05, y, z - Math.cos(yaw) * 0.05); halo.rotation.y = yaw;
  group.add(mesh, halo);
  signs.push(halo);
  // Back plate so the sign reads from behind too
  const back = mesh.clone(); back.rotation.y = yaw + Math.PI; back.position.set(x - Math.sin(yaw) * 0.12, y, z - Math.cos(yaw) * 0.12);
  group.add(back);
  return w;
}

// Local frame of a site: n = into the block, t = along the street.
const frame = (s) => {
  const t = { x: -s.nz, z: s.nx };
  const at = (along, inward, y = 0) => [s.x + t.x * along + s.nx * inward, y, s.z + t.z * along + s.nz * inward];
  return { t, at, yaw: Math.atan2(-s.nx, -s.nz) };
};

function garage(B, s) {
  const { at, yaw } = frame(s);
  const box = (k, a, i, y, w, h, d, color) => { const [x, , z] = at(a, i); B.box(k, x, y, z, w, h, d, { ry: yaw, color }); };
  // Drive-in pad: blue and white chevrons on the asphalt
  box('vc', 0, 0, 0.03, 4.6, 0.06, 9, '#2a6ad8');
  for (let k = -4; k <= 4; k += 2) box('vc', 0, k, 0.07, 4.2, 0.03, 0.6, '#ffffff');
  // Workshop on the sidewalk: lift posts, tyre stacks, drums, tool chest
  for (const a of [-3.4, 3.4]) { box('vc', a, 4.5, 2.6, 0.5, 5.2, 0.5, '#d8dce8'); box('vc', a, 4.5, 5.25, 0.7, 0.3, 0.7, '#3fa0ff'); }
  box('vc', 0, 4.5, 5.0, 7.4, 0.5, 0.5, '#d8dce8');
  for (let k = 0; k < 3; k++) box('vc', -2.6, 5.1, 0.3 + k * 0.4, 1.0, 0.36, 1.0, '#1d1d24');
  for (let k = 0; k < 2; k++) box('vc', -1.4, 5.3, 0.3 + k * 0.4, 1.0, 0.36, 1.0, '#1d1d24');
  box('vc', 2.4, 5.0, 0.55, 0.8, 1.1, 0.8, '#ff5f3f'); box('vc', 1.4, 5.1, 0.55, 0.8, 1.1, 0.8, '#3fa0ff');
  box('vc', 2.6, 3.6, 0.6, 1.2, 1.2, 0.6, '#ff3f5f'); box('vc', 2.6, 3.6, 1.25, 1.22, 0.06, 0.62, '#c8c8d0');
  box('glow', 0, 4.25, 5.0, 6.8, 0.12, 0.2, '#9fd8ff');
  const [sx, , sz] = at(0, 4.2);
  sign(s.name, s.color, sx, 6.2, sz, yaw, 1.3);
}

function gunshop(B, s) {
  const { at, yaw } = frame(s);
  const box = (k, a, i, y, w, h, d, color) => { const [x, , z] = at(a, i); B.box(k, x, y, z, w, h, d, { ry: yaw, color }); };
  box('vc', 0, 1.0, 0.55, 3.2, 1.1, 0.9, '#3a2a3a');
  box('vc', 0, 1.0, 1.12, 3.3, 0.08, 1.0, '#c8915a');
  box('glow', 0, 0.08, 1.2, 2.8, 0.6, 0.06, '#ffe0a0');
  for (const a of [-1.6, 1.6]) box('vc', a, 1.2, 1.4, 0.15, 2.4, 0.15, '#5b6070');
  for (let k = 0; k < 6; k++) box('vc', -1.5 + k * 0.6, 1.25, 2.55, 0.6, 0.12, 1.4, k % 2 ? '#ffffff' : s.color);
  // Target board
  box('vc', 2.2, 1.2, 1.6, 0.9, 0.9, 0.06, '#ffffff'); box('vc', 2.2, 1.2, 1.62, 0.6, 0.6, 0.06, '#ff3f5f'); box('vc', 2.2, 1.2, 1.64, 0.25, 0.25, 0.06, '#ffffff');
  const [x, , z] = at(0, 1.3);
  sign(s.name, s.color, x, 3.3, z, yaw, 0.85);
}

function courier(B, s) {
  const { at, yaw } = frame(s);
  const box = (k, a, i, y, w, h, d, color) => { const [x, , z] = at(a, i); B.box(k, x, y, z, w, h, d, { ry: yaw, color }); };
  for (let k = 0; k < 7; k++) { const a = -4 + (k % 4) * 1.1, h = k < 4 ? 0 : 1; box('vc', a, 4.6 + (k % 2) * 0.3, 0.4 + h * 0.75, 1.0, 0.75, 1.0, '#c8915a'); box('vc', a, 4.6 + (k % 2) * 0.3, 0.4 + h * 0.75 + 0.38, 1.02, 0.04, 0.25, '#ffffff'); }
  box('vc', 3.2, 5.0, 0.9, 1.2, 1.8, 1.0, '#9aa0b0');
  box('glow', 3.2, 5.0, 1.82, 0.9, 0.08, 0.7, '#5dff6a');
  for (const a of [-5.5, 5.5]) box('vc', a, 4.8, 2.4, 0.3, 4.8, 0.3, '#5b6070');
  const [x, , z] = at(0, 4.8);
  sign(s.name, s.color, x, 4.6, z, yaw, 1.1);
}

function cabstand(B, s) {
  const { at, yaw } = frame(s);
  const box = (k, a, i, y, w, h, d, color) => { const [x, , z] = at(a, i); B.box(k, x, y, z, w, h, d, { ry: yaw, color }); };
  box('vc', 4, 4.2, 1.6, 0.18, 3.2, 0.18, '#5b6070');
  box('vc', 4, 4.2, 3.4, 1.4, 0.7, 0.12, '#ffd23f');
  box('vc', 4, 4.14, 3.4, 1.0, 0.3, 0.13, '#12061c');
  for (let k = -6; k <= 6; k += 1.5) box('vc', k, 0.1, 0.05, 0.75, 0.04, 0.2, '#ffd23f');
  const [x, , z] = at(-2, 4.6);
  sign(s.name, s.color, x, 3.6, z, yaw, 0.8);
}

function raceArch(B, r) {
  const x = r.start[0] * CELL, z = r.start[1] * CELL;
  const [ci, cj] = r.cps[0];
  const along = ci !== r.start[0] ? 'x' : 'z';
  // Arch across the road we leave on, a little behind the junction.
  const back = 9;
  const dx = along === 'x' ? -Math.sign(ci - r.start[0]) * back : 0, dz = along === 'z' ? -Math.sign(cj - r.start[1]) * back : 0;
  const cx = x + dx, cz = z + dz;
  const px = along === 'x' ? 0 : 1, pz = along === 'x' ? 1 : 0;   // across the road
  for (const s of [-1, 1]) B.box('vc', cx + px * s * 6.8, 3.2, cz + pz * s * 6.8, 0.6, 6.4, 0.6, { color: '#ffffff' });
  for (let k = 0; k < 14; k++) for (let row = 0; row < 2; row++) {
    const o = -6.5 + k;
    B.box('vc', cx + px * o, 6.1 + row * 0.5, cz + pz * o, px ? 1 : 0.3, 0.5, pz ? 1 : 0.3, { color: (k + row) % 2 ? '#12061c' : '#ffffff' });
  }
  const yaw = along === 'x' ? -Math.PI / 2 * Math.sign(ci - r.start[0]) : (cj > r.start[1] ? Math.PI : 0);
  sign(r.name, '#3fe8ff', cx, 7.6, cz, yaw, 0.9);
}

export function buildSites(scene) {
  group = new THREE.Group();
  scene.add(group);
  const B = new Batcher().material('vc', new THREE.MeshLambertMaterial({ vertexColors: true })).material('glow', registerGlow(new THREE.MeshBasicMaterial({ vertexColors: true }), 1, 2.4));
  for (const s of SITES) ({ garage, gunshop, courier, cabstand })[s.kind](B, s);
  for (const r of RACES) raceArch(B, r);
  group.add(B.build(true));
  // Parked work vehicles
  for (const s of SITES) {
    if (s.kind === 'courier') parked.push({ site: s, model: 'bayrunner', color: '#ffffff', along: 4 });
    if (s.kind === 'cabstand') parked.push({ site: s, model: 'palomar', color: '#ffd23f', along: 3 });
  }
  respawnParked(true);
  return group;
}

function respawnParked(force = false) {
  for (const p of parked) {
    const s = p.site;
    const x = s.x + -s.nz * p.along, z = s.z + s.nx * p.along;
    const here = p.v && vehicles.includes(p.v) && !p.v.wrecked && Math.hypot(p.v.x - x, p.v.z - z) < 4;
    if (here) continue;
    const far = Math.hypot(player.x - x, player.z - z) > 90;
    if (!force && (!far || (p.v && player.vehicle === p.v))) continue;
    if (p.v && vehicles.includes(p.v) && !p.v.driver && p.v !== player.vehicle && far) p.v.remove?.();
    p.v = new Vehicle(p.model, x, z, Math.atan2(-s.nz, s.nx), p.color);
    p.v.keep = true;
  }
}

let acc = 0;
export function updateSites(dt, night) {
  for (const h of signs) h.material.opacity = 0.15 + night * 0.55;
  acc += dt;
  if (acc > 3) { acc = 0; respawnParked(); }
}
