// Sky dome, sun, hemisphere light, fog and the day/night cycle (0..24 hours).
import { city } from './city.js';
import { makeRng } from '../core/rng.js';

const THREE = window.THREE;

// Key colours through the day: [hour, skyTop, skyHorizon, sunColor, sunIntensity, hemiIntensity, night]
const KEYS = [
  [0, '#160c52', '#6a2a8a', '#a8b8ff', 0.45, 0.85, 1],
  [5, '#141a55', '#ff7aa8', '#ffb38a', 0.6, 0.7, 0.7],
  [7, '#3fa7ff', '#ffd2b0', '#ffe0b0', 1.6, 1.0, 0.1],
  [10, '#1f8fff', '#a8e6ff', '#fff4dc', 2.6, 1.35, 0],
  [15, '#1f8fff', '#b0ecff', '#fff0d0', 2.6, 1.35, 0],
  [18, '#4a6bd8', '#ff9a6b', '#ffb070', 1.7, 1.0, 0.15],
  [19.5, '#2a2470', '#ff5f8f', '#ff8a6b', 0.8, 0.75, 0.6],
  [21, '#1a1060', '#7a2a9a', '#a8b8ff', 0.5, 0.9, 1],
  [24, '#160c52', '#6a2a8a', '#a8b8ff', 0.45, 0.85, 1],
];

export const sky = { hour: 11, night: 0, sun: null, hemi: null, dome: null, stars: null, fixed: false };

export function setupSky(scene) {
  const geo = new THREE.SphereGeometry(1200, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y, 0.0, 1.0); vec3 c = mix(horizon, top, pow(h, 0.55));
      float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0); c += sunCol * (pow(s, 600.0) * 1.4 + pow(s, 12.0) * 0.25);
      if (vDir.y < 0.0) c = horizon * 0.95; gl_FragColor = vec4(c, 1.0); }`,
  });
  sky.dome = new THREE.Mesh(geo, mat);
  scene.add(sky.dome);

  // Blocky stars
  const sg = new THREE.BufferGeometry();
  const pts = [], r = makeRng(99);
  for (let i = 0; i < 400; i++) {
    const a = r() * Math.PI * 2, e = 0.15 + r() * 1.3;
    pts.push(Math.cos(a) * Math.cos(e) * 1100, Math.sin(e) * 1100, Math.sin(a) * Math.cos(e) * 1100);
  }
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  sky.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 3, sizeAttenuation: false, transparent: true, fog: false }));
  scene.add(sky.stars);

  sky.hemi = new THREE.HemisphereLight(0xcfeaff, 0xffd8b0, 1.2);
  scene.add(sky.hemi);
  sky.sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sky.sun.castShadow = true;
  sky.sun.shadow.mapSize.set(2048, 2048);
  const sc = sky.sun.shadow.camera;
  sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 10; sc.far = 400;
  sky.sun.shadow.bias = -0.0008;
  sky.sun.shadow.normalBias = 0.05;
  scene.add(sky.sun, sky.sun.target);
  scene.fog = new THREE.Fog(0xbfe8ff, 160, 620);
}

const ca = new THREE.Color(), cb = new THREE.Color();
function lerpKey(h) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = (h - a[0]) / (b[0] - a[0]);
  const col = (k) => ca.set(a[k]).lerp(cb.set(b[k]), t).clone();
  return { top: col(1), horizon: col(2), sunCol: col(3), sunI: a[4] + (b[4] - a[4]) * t, hemiI: a[5] + (b[5] - a[5]) * t, night: a[6] + (b[6] - a[6]) * t };
}

export function setHour(h) { sky.hour = ((h % 24) + 24) % 24; }

// Advance the clock and update lights; focus = where the player is (shadow camera follows).
export function updateSky(dt, focus, scene) {
  if (!sky.fixed) sky.hour = (sky.hour + dt * (24 / 900)) % 24; // full day = 15 minutes
  const k = lerpKey(sky.hour);
  sky.night = k.night;
  const u = sky.dome.material.uniforms;
  u.top.value.copy(k.top); u.horizon.value.copy(k.horizon); u.sunCol.value.copy(k.sunCol);
  // Sun arc: rises east (+x, over the ocean), sets west.
  const ang = ((sky.hour - 6) / 12) * Math.PI;
  const sunDir = new THREE.Vector3(Math.cos(ang) * 0.8, Math.max(Math.sin(ang), 0.25), 0.45).normalize();
  if (k.night > 0.5) sunDir.set(-0.4, 0.8, -0.3).normalize(); // moonlight
  u.sunDir.value.copy(sunDir);
  sky.sun.color.copy(k.sunCol);
  sky.sun.intensity = k.sunI;
  sky.hemi.intensity = k.hemiI;
  sky.hemi.color.copy(k.horizon).lerp(new THREE.Color('#ffffff'), 0.5);
  sky.sun.position.set(focus.x + sunDir.x * 200, sunDir.y * 200, focus.z + sunDir.z * 200);
  sky.sun.target.position.set(focus.x, 0, focus.z);
  sky.dome.position.set(focus.x, 0, focus.z);
  sky.stars.position.copy(sky.dome.position);
  sky.stars.material.opacity = k.night;
  sky.stars.visible = k.night > 0.05;
  scene.fog.color.copy(k.horizon);
  for (const m of city.glowMats) m.emissiveIntensity = k.night * 1.1;
  for (const o of city.nightOnly) o.visible = k.night > 0.3;
  return k.night;
}
