// Vehicle damage states. Body health 100 -> 0 runs through:
//   0 FINE     1 DENTED (<70: paint dulls)     2 SMOKING (<45: grey then black smoke, engine down to 85%)
//   3 ON FIRE (<20: flames from the engine bay, 60% power, and it blows after 7 s - bail out!)
//   4 WRECKED (explodes, burns for 10 s, hurts anyone close including a driver still inside)
import { fire, smoke } from '../fx/effects.js';
import { emit } from '../core/state.js';
import { rand } from '../core/rng.js';

export const STAGE_NAMES = ['FINE', 'DENTED', 'SMOKING', 'ON FIRE', 'WRECKED'];
const BURN_FUSE = 7;

export function damageStage(v) {
  if (v.wrecked) return 4;
  return v.health < 20 ? 3 : v.health < 45 ? 2 : v.health < 70 ? 1 : 0;
}

// Engine power left at the current damage stage.
export const powerFactor = (v) => [1, 1, 0.85, 0.6, 0][damageStage(v)];

// Seconds until a burning car explodes (null when not burning).
export const fuseLeft = (v) => (damageStage(v) === 3 ? Math.max(0, BURN_FUSE - (v.burnT || 0)) : null);

function tint(v, k) {
  v.mesh.traverse((o) => {
    if (!o.isMesh || !o.material.isMeshLambertMaterial) return;   // body panels only, not the lamps
    if (!o.userData.ownMat) { o.material = o.material.clone(); o.userData.ownMat = true; }
    o.material.color.setScalar(k);
  });
}

export function updateDamage(v, dt) {
  const stage = damageStage(v);
  if (stage !== v.stage) {
    if (stage >= 1 && stage < 4) tint(v, [1, 0.88, 0.76, 0.6][stage]);
    if (v.driver === 'player' && stage > (v.stage || 0)) emit('carDamage', { v, stage });
    v.stage = stage;
  }
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const hx = v.x + fx * v.spec.len * 0.36, hz = v.z + fz * v.spec.len * 0.36, hy = v.spec.boat ? 0.9 : 1.15;
  if (stage === 4) {
    v.burnT = (v.burnT || 0) - dt;
    if (v.burnT > 0) fire(v.x, 0.9, v.z, 1.4);
    return;
  }
  if (stage === 2 && rand() < (v.health < 32 ? 0.4 : 0.22)) smoke(hx, hy, hz, v.health < 32 ? '#2e2e2e' : '#7a7a7a', 1, { size: 0.8, grow: 2.5 });
  if (stage === 3) {
    fire(hx, hy - 0.2, hz);
    v.burnT = (v.burnT || 0) + dt;
    if (v.burnT > BURN_FUSE) v.health = 0;   // Vehicle.update wrecks it this frame
  } else v.burnT = 0;
}
