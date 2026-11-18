// Armor vests: one stashed near each landmark (back 90 s after it is taken) and dropped by downed gang
// members (bosses always, others one time in three; dropped vests fade after 40 s). Walk over one for
// +50 armor. Shown spinning in the world and as small blue diamonds on the minimap.
import { city, collideCircle } from '../world/city.js';
import { colorBoxes, LAMBERT_VC } from '../world/voxel.js';
import { player } from './player.js';
import { game, on, emit } from '../core/state.js';
import { rand } from '../core/rng.js';

export const pickups = [];
const STASH = ['safehouse', 'clinic', 'diner', 'garage', 'club', 'docks', 'shores', 'caracol', 'tower', 'pier'];
const ARMOR = 50, RESPAWN = 90, DROP_LIFE = 40;
let scene, proto;

function vestMesh() {
  if (!proto) {
    proto = colorBoxes([
      [0, 0.45, 0, 0.62, 0.7, 0.3, '#2f8dff'], [0, 0.82, 0, 0.36, 0.08, 0.32, '#2f8dff'],
      [-0.2, 0.86, 0, 0.12, 0.14, 0.3, '#1d5fbf'], [0.2, 0.86, 0, 0.12, 0.14, 0.3, '#1d5fbf'],
      [0, 0.5, 0.16, 0.4, 0.26, 0.02, '#9fe0ff'], [0, 0.18, 0, 0.64, 0.08, 0.32, '#12305f'],
    ], LAMBERT_VC());
  }
  const m = proto.clone();
  m.castShadow = true;
  return m;
}

function add(x, z, opts = {}) {
  const q = collideCircle(x, z, 0.6);
  const mesh = vestMesh();
  mesh.position.set(q.x, 0.3, q.z);
  scene.add(mesh);
  const p = { x: q.x, z: q.z, mesh, taken: false, t: 0, stash: !!opts.stash, life: opts.life || 0 };
  pickups.push(p);
  return p;
}

export function setupPickups(sc) {
  scene = sc;
  // Stashes sit a few metres along the sidewalk from each landmark's door.
  STASH.forEach((k, i) => { const l = city.landmarks[k]; if (l) add(l.x + (i % 2 ? 4 : -4), l.z + (i % 3 === 0 ? 2 : -2), { stash: true }); });
  on('shooterDown', (c) => { if (c.faction !== 'police' && (c.boss || rand() < 0.34)) add(c.x + 0.8, c.z + 0.5, { life: DROP_LIFE }); });
}

export function updatePickups(dt, t) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (p.taken) {
      p.t -= dt;
      if (p.t <= 0) { p.taken = false; p.mesh.visible = true; }
      continue;
    }
    p.mesh.rotation.y = t * 1.8;
    p.mesh.position.y = 0.3 + Math.sin(t * 3 + i) * 0.12;
    if (p.life) {
      p.life -= dt;
      p.mesh.visible = p.life > 6 || Math.floor(t * 6) % 2 === 0;
      if (p.life <= 0) { scene.remove(p.mesh); pickups.splice(i, 1); continue; }
    }
    const reach = player.vehicle ? 2.6 : 1.4;
    if (game.mode === 'play' && game.armor < 100 && Math.hypot(player.x - p.x, player.z - p.z) < reach) take(p, i);
  }
}

function take(p, i) {
  game.armor = Math.min(100, game.armor + ARMOR);
  emit('pickup', { kind: 'armor' });
  emit('toast', { text: `+${ARMOR} ARMOR`, color: '#9fe0ff' });
  if (p.stash) { p.taken = true; p.t = RESPAWN; p.mesh.visible = false; } else { scene.remove(p.mesh); pickups.splice(i, 1); }
}

// Vests within `r` metres of the player, for the minimap.
export const nearPickups = (r = 120) => pickups.filter((p) => !p.taken && Math.hypot(p.x - player.x, p.z - player.z) < r);
