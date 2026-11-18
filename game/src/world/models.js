// Voxel models: blocky people, cars and the police helicopter, built from vertex-coloured boxes.
import { Batcher } from './voxel.js';
import { CAR_MODELS } from '../core/config.js';
import { shade } from '../data/cast.js';
import { glowTexture } from './textures.js';
import { registerGlow } from '../fx/grade.js';

const THREE = window.THREE;
export const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
export const glowMat = registerGlow(new THREE.MeshBasicMaterial({ vertexColors: true }), 1.15, 3);
export const redLightMat = new THREE.MeshBasicMaterial({ color: 0xff1030 });
export const blueLightMat = new THREE.MeshBasicMaterial({ color: 0x1060ff });

function part(boxes, glow = []) {
  const b = new Batcher().material('b', bodyMat).material('g', glowMat);
  for (const p of boxes) b.box('b', p[0], p[1], p[2], p[3], p[4], p[5], { color: p[6] });
  for (const p of glow) b.box('g', p[0], p[1], p[2], p[3], p[4], p[5], { color: p[6] });
  const g = b.build();
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return g;
}

// A person ~1.9 units tall. Pivots: legs at hips, arms at shoulders; head on top of the torso.
export function makeCharacter(spec) {
  const s = { skin: '#c98a5e', shirt: '#ff4fa3', pants: '#2b3a67', hair: '#2a1a12', shoes: '#222222', ...spec };
  const root = new THREE.Group();
  const pivot = (x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); root.add(g); return g; };

  const legL = pivot(-0.17, 0.9, 0), legR = pivot(0.17, 0.9, 0);
  for (const leg of [legL, legR]) {
    leg.add(part([[0, -0.4, 0, 0.3, 0.8, 0.32, s.pants], [0, -0.85, 0.05, 0.32, 0.12, 0.42, s.shoes]]));
  }
  const torso = pivot(0, 0.9, 0);
  const torsoBoxes = [[0, 0.38, 0, 0.66, 0.76, 0.38, s.shirt], [0, 0.04, 0, 0.68, 0.1, 0.4, shade(s.pants, -0.2)]];
  if (s.vest) torsoBoxes.push([0, 0.4, 0, 0.7, 0.6, 0.42, s.vest]);
  if (s.badge) torsoBoxes.push([0.18, 0.56, 0.21, 0.1, 0.1, 0.04, '#ffd23f']);
  if (s.stripe) torsoBoxes.push([0, 0.5, 0.2, 0.67, 0.12, 0.02, s.stripe]);
  torso.add(part(torsoBoxes));

  const head = pivot(0, 1.66, 0);
  const hb = [
    [0, 0.22, 0, 0.44, 0.44, 0.44, s.skin],
    [-0.1, 0.25, 0.225, 0.08, 0.06, 0.02, '#1b1b1b'], [0.1, 0.25, 0.225, 0.08, 0.06, 0.02, '#1b1b1b'],
    [0, 0.1, 0.225, 0.14, 0.04, 0.02, shade(s.skin, -0.35)],
  ];
  if (s.hair !== 'none') hb.push([0, 0.42, -0.02, 0.48, 0.1, 0.48, s.hair], [0, 0.28, -0.2, 0.48, 0.3, 0.1, s.hair]);
  if (s.hat) hb.push([0, 0.48, 0, 0.5, 0.12, 0.5, s.hat], [0, 0.44, 0.28, 0.5, 0.05, 0.2, s.hat]);
  if (s.bandana) hb.push([0, 0.36, 0, 0.47, 0.08, 0.47, s.bandana]);
  if (s.shades) hb.push([0, 0.25, 0.23, 0.42, 0.08, 0.02, '#101010']);
  head.add(part(hb));

  const armL = pivot(-0.42, 1.58, 0), armR = pivot(0.42, 1.58, 0);
  for (const arm of [armL, armR]) {
    arm.add(part([[0, -0.3, 0, 0.2, 0.62, 0.22, s.shirt], [0, -0.68, 0, 0.18, 0.18, 0.2, s.skin]]));
  }
  // Gun held in the right hand (hidden unless armed).
  const gun = part([[0, -0.72, 0.22, 0.1, 0.14, 0.42, '#202020'], [0, -0.82, 0.1, 0.08, 0.14, 0.08, '#303030']]);
  armR.add(gun);
  gun.visible = false;

  root.userData.parts = { legL, legR, armL, armR, torso, head, gun };
  return root;
}

// Swing limbs; phase advances with distance walked. aim: arm raised pointing forward.
export function animateCharacter(model, phase, amount, aim = false, punch = 0) {
  const p = model.userData.parts;
  const sw = Math.sin(phase) * 0.8 * amount;
  p.legL.rotation.x = sw;
  p.legR.rotation.x = -sw;
  p.armL.rotation.x = -sw * 0.8;
  p.armR.rotation.x = aim ? -Math.PI / 2 : sw * 0.8;
  if (punch > 0) p.armR.rotation.x = -Math.PI / 2 - Math.sin(punch * Math.PI) * 0.3;
  if (aim) p.armL.rotation.x = -1.2;
  p.torso.position.y = 0.9 + Math.abs(Math.sin(phase)) * 0.05 * amount;
}

// A car facing +z. Returns a Group with userData {lights: [red, blue meshes], wheels}.
export function makeCar(key, color) {
  const m = CAR_MODELS[key];
  const L = m.len, W = m.wid, H = m.hgt;
  const body = color || m.colors[0];
  const dark = shade(body, -0.3);
  const glass = '#1d3f66';
  const boxes = [], glow = [];
  const rideY = 0.45;
  if (key === 'bayrunner') {
    boxes.push([0, rideY + 1.0, -0.2, W, 1.9, L - 0.6, body]);
    boxes.push([0, rideY + 0.55, L / 2 - 0.45, W, 1.0, 0.9, body]);
    boxes.push([0, rideY + 1.45, L / 2 - 0.62, W - 0.1, 0.65, 0.04, glass]);
    boxes.push([W / 2 + 0.01, rideY + 1.45, L / 2 - 1.2, 0.04, 0.6, 0.9, glass]);
    boxes.push([-W / 2 - 0.01, rideY + 1.45, L / 2 - 1.2, 0.04, 0.6, 0.9, glass]);
    boxes.push([0, rideY + 1.1, -0.4, W + 0.02, 0.25, L - 1.6, '#ff5fa2']);
  } else {
    const cabH = m.sporty ? 0.48 : 0.6;
    const cabL = m.sporty ? L * 0.42 : L * 0.5;
    const cabZ = m.sporty ? -0.25 : -0.15;
    boxes.push([0, rideY + 0.35, 0, W, 0.62, L, body]);
    boxes.push([0, rideY + 0.69, L / 2 - 0.55, W - 0.05, 0.08, 1.0, shade(body, 0.08)]);
    boxes.push([0, rideY + 0.66 + cabH / 2, cabZ, W - 0.2, cabH, cabL, body]);
    // Windows: windscreen, rear, sides
    boxes.push([0, rideY + 0.66 + cabH / 2, cabZ + cabL / 2 + 0.01, W - 0.3, cabH - 0.12, 0.04, glass]);
    boxes.push([0, rideY + 0.66 + cabH / 2, cabZ - cabL / 2 - 0.01, W - 0.3, cabH - 0.14, 0.04, glass]);
    boxes.push([W / 2 - 0.09, rideY + 0.66 + cabH / 2, cabZ, 0.04, cabH - 0.14, cabL - 0.3, glass]);
    boxes.push([-W / 2 + 0.09, rideY + 0.66 + cabH / 2, cabZ, 0.04, cabH - 0.14, cabL - 0.3, glass]);
    if (m.sporty) {
      boxes.push([0, rideY + 0.86, -L / 2 + 0.2, W - 0.1, 0.06, 0.4, dark]);
      boxes.push([0.6, rideY + 0.75, -L / 2 + 0.2, 0.08, 0.2, 0.1, dark], [-0.6, rideY + 0.75, -L / 2 + 0.2, 0.08, 0.2, 0.1, dark]);
      boxes.push([0, rideY + 0.36, 0, W + 0.02, 0.1, L * 0.7, '#ffffff']);
      // Side skirts, hood scoop, rear diffuser and a full-width tail-light bar
      boxes.push([0, rideY + 0.06, 0, W + 0.06, 0.14, L * 0.62, dark]);
      boxes.push([0, rideY + 0.72, L / 2 - 1.0, 0.7, 0.12, 0.8, dark]);
      boxes.push([0, rideY - 0.02, -L / 2 + 0.1, W - 0.4, 0.14, 0.3, '#202020']);
      glow.push([0, rideY + 0.5, -L / 2 - 0.02, W - 0.5, 0.08, 0.05, '#ff3050']);
    }
    if (m.taxi) {
      boxes.push([0, rideY + 0.66 + cabH + 0.12, cabZ, 0.7, 0.24, 0.3, '#ffffff']);
      boxes.push([0, rideY + 0.36, 0, W + 0.02, 0.16, L * 0.8, '#202020']);
    }
    if (m.police) {
      boxes.push([0, rideY + 0.3, 0.1, W + 0.02, 0.4, 2.0, '#18234a']);
      boxes.push([0, rideY + 0.58, 0.1, W + 0.03, 0.1, 2.0, '#3fa0ff']);
      boxes.push([0, rideY + 0.66 + cabH + 0.04, cabZ, 1.5, 0.08, 0.36, '#202020']);
    }
  }
  // Bumpers, lights, wheels
  boxes.push([0, rideY + 0.12, L / 2 + 0.05, W - 0.1, 0.2, 0.12, '#d0d0d0']);
  boxes.push([0, rideY + 0.12, -L / 2 - 0.05, W - 0.1, 0.2, 0.12, '#d0d0d0']);
  glow.push([W / 2 - 0.3, rideY + 0.42, L / 2 + 0.01, 0.38, 0.16, 0.06, '#fff6c8']);
  glow.push([-W / 2 + 0.3, rideY + 0.42, L / 2 + 0.01, 0.38, 0.16, 0.06, '#fff6c8']);
  glow.push([W / 2 - 0.3, rideY + 0.42, -L / 2 - 0.01, 0.36, 0.14, 0.06, '#ff2040']);
  glow.push([-W / 2 + 0.3, rideY + 0.42, -L / 2 - 0.01, 0.36, 0.14, 0.06, '#ff2040']);
  const wz = L / 2 - 0.85;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    boxes.push([sx * (W / 2 - 0.12), 0.38, sz * wz, 0.32, 0.76, 0.76, '#1a1a1a']);
    boxes.push([sx * (W / 2 - 0.02), 0.38, sz * wz, 0.14, 0.34, 0.34, '#bfbfbf']);
  }
  const g = new THREE.Group();
  g.add(part(boxes, glow));
  const lights = [];
  if (m.police) {
    const barY = rideY + 0.66 + 0.6 + 0.16;
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.26, 0.42), redLightMat.clone());
    r.position.set(-0.42, barY, -0.15);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.26, 0.42), blueLightMat.clone());
    bl.position.set(0.42, barY, -0.15);
    g.add(r, bl);
    lights.push(r, bl);
    for (const [m, col] of [[r, '#ff2040'], [bl, '#2060ff']]) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(col), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.scale.setScalar(3.2);
      m.add(s);
      m.userData.glow = s;
    }
  }
  g.userData = { lights, model: key };
  return g;
}

export function makeHelicopter() {
  const g = new THREE.Group();
  g.add(part([
    [0, 0, 0, 2.4, 2.0, 4.2, '#1d3c8f'],
    [0, 0.2, 2.0, 2.2, 1.4, 0.6, '#9fd8ff'],
    [0, -0.5, 0, 2.42, 0.4, 4.22, '#ffffff'],
    [0, 0.4, -4.0, 0.5, 0.6, 4.0, '#1d3c8f'],
    [0.3, 0.9, -5.8, 0.1, 1.4, 0.8, '#ffffff'],
    [0, 1.2, 0, 0.5, 0.4, 0.5, '#333333'],
    [1.0, -1.35, 0, 0.15, 0.15, 4.0, '#333333'], [-1.0, -1.35, 0, 0.15, 0.15, 4.0, '#333333'],
    [1.0, -1.1, 0.8, 0.12, 0.5, 0.12, '#333333'], [-1.0, -1.1, 0.8, 0.12, 0.5, 0.12, '#333333'],
    [1.0, -1.1, -0.8, 0.12, 0.5, 0.12, '#333333'], [-1.0, -1.1, -0.8, 0.12, 0.5, 0.12, '#333333'],
  ], [[0, -1.0, 1.6, 0.6, 0.4, 0.6, '#fffbe0'], [0, 0.95, -6.2, 0.2, 0.2, 0.2, '#ff2040']]));
  const rotor = part([[0, 0, 0, 11, 0.08, 0.5, '#2a2a2a'], [0, 0, 0, 0.5, 0.08, 11, '#2a2a2a']]);
  rotor.position.y = 1.45;
  g.add(rotor);
  const tail = part([[0, 0, 0, 0.08, 2.2, 0.3, '#2a2a2a']]);
  tail.position.set(0.4, 0.9, -5.8);
  g.add(tail);
  g.userData = { rotor, tail };
  return g;
}

// Glowing mission marker column + ground ring.
// Thin a marker's column and beam as the viewer gets close (d = distance in world units).
export function fadeMarker(m, d) {
  const k = Math.min(1, Math.max(0, (d - 3) / 25));
  m.children[0].material.opacity = 0.06 + 0.29 * k;
  if (m.userData.beam) m.userData.beam.material.opacity = 0.08 + 0.42 * k;
}

export function makeMarker(color = '#ffd23f') {
  const g = new THREE.Group();
  const col = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 6, 8, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  col.position.y = 3;
  const ring = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 3.2), new THREE.MeshBasicMaterial({ color }));
  ring.position.y = 0.08;
  const chev = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.2, 4), new THREE.MeshBasicMaterial({ color }));
  chev.rotation.x = Math.PI;
  chev.position.y = 7.2;
  // Tall light beam visible across the city: open cylinder, vertex alpha fading upwards (additive).
  const bg = new THREE.CylinderGeometry(0.9, 1.25, 90, 10, 6, true);
  bg.translate(0, 45, 0);
  const bp = bg.attributes.position, bcol = [];
  const c3 = new THREE.Color(color);
  for (let i = 0; i < bp.count; i++) { const k = Math.pow(1 - bp.getY(i) / 90, 1.6); bcol.push(c3.r * k, c3.g * k, c3.b * k); }
  bg.setAttribute('color', new THREE.Float32BufferAttribute(bcol, 3));
  const beam = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: glowTexture(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.1;
  g.add(col, ring, chev, beam, pool);
  g.userData.chev = chev;
  g.userData.beam = beam;
  g.userData.pool = pool;
  return g;
}
