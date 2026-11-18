// Night driving lights. Every car near the player gets a soft headlight pool on the road, a faint
// volumetric beam cone in front of the lamps and red tail-light glows (three InstancedMeshes, additive).
// The player's car also carries a real SpotLight that lights walls and other cars, and the nearest police
// car with its siren on throws a red/blue strobe onto the street. All of it fades in at dusk.
import { vehicles } from '../gameplay/vehicles.js';
import { glowTexture } from '../world/textures.js';

const THREE = window.THREE;
const MAX = 36, RANGE = 150;
export const carLights = { pools: null, beams: null, tails: null, spot: null, strobe: null };

function beamGeometry() {
  // Cone along +z from the lamp, wide at the far end, vertex colours fading out with distance.
  const g = new THREE.CylinderGeometry(3.2, 0.5, 16, 12, 4, true);
  g.translate(0, 8, 0);
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position, col = [];
  for (let i = 0; i < p.count; i++) { const k = Math.max(0, 1 - p.getZ(i) / 16); col.push(k * k, k * k * 0.95, k * k * 0.8); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export function setupCarLights(scene) {
  const add = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.count = 0; scene.add(m); return m; };
  const poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2);
  carLights.pools = add(poolGeo, new THREE.MeshBasicMaterial({ map: glowTexture('#fff0c8'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }), MAX);
  carLights.beams = add(beamGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.07, side: THREE.DoubleSide }), MAX * 2);
  carLights.tails = add(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTexture('#ff2040'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8, side: THREE.DoubleSide }), MAX * 2);
  // Player headlights: a real spot light (kept in the scene all day at zero intensity so shaders never recompile).
  const spot = new THREE.SpotLight('#fff2d0', 0, 55, 0.62, 0.65, 1.2);
  spot.castShadow = false;
  scene.add(spot, spot.target);
  carLights.spot = spot;
  const strobe = new THREE.PointLight('#ff2040', 0, 28, 1.4);
  scene.add(strobe);
  carLights.strobe = strobe;
}

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
export function updateCarLights(focus, night, t, playerCar) {
  const on = Math.max(0, Math.min(1, (night - 0.15) / 0.4));
  const P = carLights.pools, Bm = carLights.beams, T = carLights.tails;
  let n = 0, nb = 0, nt = 0, cop = null, copD = 1e9;
  if (on > 0) {
    for (const v of vehicles) {
      const d = Math.hypot(v.x - focus.x, v.z - focus.z);
      if (v.siren && d < copD) { copD = d; cop = v; }
      if (v.wrecked || d > RANGE || n >= MAX) continue;
      const lit = v.driver || v.siren;
      if (!lit) continue;
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading), rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
      const L = v.spec.len, W = v.spec.wid;
      // Pool on the road ahead
      pv.set(v.x + fx * (L / 2 + 5), 0.06, v.z + fz * (L / 2 + 5));
      q.setFromEuler(e.set(0, v.heading, 0));
      m4.compose(pv, q, sv.set(W * 2.6, 1, 11));
      P.setMatrixAt(n++, m4);
      // Two beam cones from the lamps
      for (const s of [-1, 1]) {
        if (nb >= MAX * 2) break;
        pv.set(v.x + fx * (L / 2) + rx * s * (W / 2 - 0.3), 0.85, v.z + fz * (L / 2) + rz * s * (W / 2 - 0.3));
        q.setFromEuler(e.set(0.08, v.heading, 0, 'YXZ'));
        m4.compose(pv, q, sv.set(1, 1, 1));
        Bm.setMatrixAt(nb++, m4);
      }
      // Tail glows (brighter when braking)
      const brake = v.controls.brake > 0 ? 1.8 : 1;
      for (const s of [-1, 1]) {
        if (nt >= MAX * 2) break;
        pv.set(v.x - fx * (L / 2 + 0.08) + rx * s * (W / 2 - 0.3), 0.87, v.z - fz * (L / 2 + 0.08) + rz * s * (W / 2 - 0.3));
        q.setFromEuler(e.set(0, v.heading, 0));
        m4.compose(pv, q, sv.set(1.1 * brake, 0.7 * brake, 1));
        T.setMatrixAt(nt++, m4);
      }
    }
  }
  P.count = n; Bm.count = nb; T.count = nt;
  P.instanceMatrix.needsUpdate = Bm.instanceMatrix.needsUpdate = T.instanceMatrix.needsUpdate = true;
  P.material.opacity = 0.5 * on; Bm.material.opacity = 0.05 * on; T.material.opacity = 0.85 * on;
  // Player spot light
  const spot = carLights.spot;
  if (playerCar && on > 0) {
    const fx = Math.sin(playerCar.heading), fz = Math.cos(playerCar.heading);
    spot.position.set(playerCar.x + fx * playerCar.spec.len * 0.45, 1.1, playerCar.z + fz * playerCar.spec.len * 0.45);
    spot.target.position.set(playerCar.x + fx * 22, 0, playerCar.z + fz * 22);
    spot.target.updateMatrixWorld();
    spot.intensity = 9 * on;
  } else spot.intensity = 0;
  // Police strobe
  const st = carLights.strobe;
  if (cop && copD < 90) {
    const ph = Math.floor(t * 8) % 2;
    st.color.set(ph ? '#ff2040' : '#2060ff');
    st.position.set(cop.x, 2.6, cop.z);
    st.intensity = (3 + on * 9) * (ph ? 1 : 0.85);
  } else st.intensity = 0;
}
