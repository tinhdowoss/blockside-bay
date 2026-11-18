// SEA GLASS: 30 glowing shards hidden on sidewalks, in parks, on Seaglass Beach and out on Coral Pier.
// Walk or drive through one to pick it up ($250 + rep); every fifth pays a bonus and finding all 30
// pays $10,000. Found shards are saved; the counter is in the pause menu STATS tab, and a shard within
// 45 m shows as a faint sparkle on the minimap.
import { SHELL_COUNT, shellSpots } from '../data/activities-data.js';
import { city } from '../world/city.js';
import { glowTexture } from '../world/textures.js';
import { registerGlow } from '../fx/grade.js';
import { player } from './player.js';
import { addRep } from './progression.js';
import { game, emit, addCash } from '../core/state.js';

const THREE = window.THREE;
export const shells = { spots: [], mesh: null, halo: null };

export function setupCollectibles(scene) {
  shells.spots = shellSpots(city.parks);
  const n = shells.spots.length;
  // A chunky voxel shard: two stacked, twisted boxes (InstancedMesh) plus an additive halo sprite each.
  const g = new THREE.BoxGeometry(0.55, 0.9, 0.55);
  g.rotateY(Math.PI / 4);
  g.rotateZ(0.25);
  const mat = registerGlow(new THREE.MeshBasicMaterial({ color: '#7ffff0' }), 1.1, 2.6);
  shells.mesh = new THREE.InstancedMesh(g, mat, n);
  shells.mesh.castShadow = false;
  shells.mesh.frustumCulled = false;
  const hg = new THREE.PlaneGeometry(2.6, 2.6);
  shells.halo = new THREE.InstancedMesh(hg, new THREE.MeshBasicMaterial({ map: glowTexture('#5ffff0'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.75 }), n);
  shells.halo.frustumCulled = false;
  scene.add(shells.mesh, shells.halo);
}

export const shellFound = (id) => game.side.shells.includes(id);
export const shellsLeft = () => SHELL_COUNT - game.side.shells.length;

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler(), ZERO = new THREE.Vector3(0, 0, 0);
export function updateCollectibles(dt, t, camera, playing) {
  if (!shells.mesh) return;
  const yaw = Math.atan2(camera.position.x - player.x, camera.position.z - player.z);
  shells.spots.forEach((sp, i) => {
    const found = shellFound(sp.id);
    if (found) { m4.compose(p.set(sp.x, -50, sp.z), q, ZERO); shells.mesh.setMatrixAt(i, m4); shells.halo.setMatrixAt(i, m4); return; }
    const y = sp.y + Math.sin(t * 2 + i) * 0.18;
    m4.compose(p.set(sp.x, y, sp.z), q.setFromEuler(e.set(0, t * 1.8 + i, 0)), s.set(1, 1, 1));
    shells.mesh.setMatrixAt(i, m4);
    m4.compose(p.set(sp.x, y, sp.z), q.setFromEuler(e.set(0, yaw, 0)), s.setScalar(1 + Math.sin(t * 4 + i) * 0.1));
    shells.halo.setMatrixAt(i, m4);
    if (playing && Math.hypot(player.x - sp.x, player.z - sp.z) < (player.vehicle ? 3.2 : 2.2)) collect(sp);
  });
  shells.mesh.instanceMatrix.needsUpdate = true;
  shells.halo.instanceMatrix.needsUpdate = true;
}

export function collect(sp) {
  if (shellFound(sp.id)) return;
  game.side.shells.push(sp.id);
  const n = game.side.shells.length;
  const all = n >= SHELL_COUNT, fifth = n % 5 === 0;
  const pay = all ? 10000 : fifth ? 1000 : 250;
  addCash(pay);
  game.side.earned += pay;
  addRep(all ? 500 : fifth ? 60 : 15, 'SEA GLASS');
  emit('shell', { n, all });
  emit('popup', { text: `SEA GLASS ${n}/${SHELL_COUNT}  +$${pay.toLocaleString('en-US')}`, x: sp.x, y: 2.6, z: sp.z, color: '#5ffff0', big: true });
  if (all) emit('banner', { top: 'EVERY SHARD FOUND', title: 'SEA GLASS COLLECTOR', color: '#5ffff0' });
  else if (fifth) emit('toast', { text: `${n} SHARDS  ·  BONUS $1,000`, color: '#5ffff0' });
}
