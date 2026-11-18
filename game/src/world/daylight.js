// Sky dome (three-band gradient, sun disc with corona, horizon glow towards the sun, moon), stars,
// sun/moon light with soft shadows that follow the player, hemisphere light, distance haze and the
// day/night cycle (0..24 hours, a full day takes 15 minutes).
import { city } from './city.js';
import { makeRng } from '../core/rng.js';

const THREE = window.THREE;

// Key colours through the day:
// [hour, skyTop, skyHorizon, sunColor, sunIntensity, hemiIntensity, night, hazeColor, hazeNear, hazeFar]
const KEYS = [
  [0, '#160c52', '#6a2a8a', '#a8b8ff', 0.45, 0.85, 1, '#3a1d6a', 70, 430],
  [5, '#141a55', '#ff7aa8', '#ffb38a', 0.6, 0.7, 0.7, '#8a4a8a', 60, 380],
  [7, '#3fa7ff', '#ffd2b0', '#ffe0b0', 1.6, 1.0, 0.1, '#ffd8c0', 70, 420],
  [10, '#1f8fff', '#a8e6ff', '#fff4dc', 2.6, 1.35, 0, '#c4ecff', 150, 640],
  [15, '#1f8fff', '#b0ecff', '#fff0d0', 2.6, 1.35, 0, '#c8eeff', 150, 640],
  [16.5, '#2f7ce8', '#d8dcff', '#ffe0b0', 2.5, 1.2, 0, '#e0dcf6', 120, 560],
  [17.7, '#3d5cc8', '#ffb27a', '#ffb062', 2.15, 0.9, 0.05, '#ffb88a', 62, 360],
  [18.6, '#36309a', '#ff7f6a', '#ff8a4a', 1.8, 0.8, 0.3, '#ff8a7a', 66, 360],
  [19.5, '#2a2470', '#ff5f8f', '#ff6a6b', 0.8, 0.75, 0.6, '#b8507f', 60, 360],
  [21, '#1a1060', '#7a2a9a', '#a8b8ff', 0.5, 0.9, 1, '#45226e', 70, 430],
  [24, '#160c52', '#6a2a8a', '#a8b8ff', 0.45, 0.85, 1, '#3a1d6a', 70, 430],
];

export const sky = { hour: 11, night: 0, sun: null, hemi: null, dome: null, stars: null, fixed: false, sunDir: new THREE.Vector3(0, 1, 0), golden: 0, sunColor: new THREE.Color(), horizon: new THREE.Color() };

// Fog with a soft exponential roll-off instead of a hard linear ramp: near streets stay crisp, the far
// blocks melt into the haze colour. Patched into three's shared fog chunk so every material gets it.
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogT = clamp( ( vFogDepth - fogNear ) / ( fogFar - fogNear ), 0.0, 1.0 );
    float fogFactor = 1.0 - exp( -3.2 * fogT * fogT ) ;
    fogFactor = fogFactor / ( 1.0 - exp( -3.2 ) );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;

const SKY_VS = `varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`;
const SKY_FS = `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 moonDir; uniform float night; uniform float golden;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  // Three bands: horizon -> a lighter mid band -> zenith.
  vec3 mid = mix(horizon, top, 0.45) + vec3(0.04, 0.03, 0.05) * (1.0 - night);
  vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
  c = mix(c, top, smoothstep(0.12, 0.75, h));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  // Horizon glow towards the sun (strong at golden hour), corona and a hard-edged disc.
  float hz = pow(1.0 - h, 6.0);
  c += sunCol * hz * pow(s, 3.0) * (0.25 + golden * 0.6) * (1.0 - night);
  c += sunCol * (pow(s, 24.0) * 0.35 + pow(s, 220.0) * 0.6) * (1.0 - night * 0.9);
  float disc = smoothstep(0.9993, 0.9996, s);
  c = mix(c, sunCol * 2.6 + vec3(0.4), disc * (1.0 - night));
  // Moon: a pale disc with a faint halo.
  float m = max(dot(d, normalize(moonDir)), 0.0);
  c += vec3(0.75, 0.8, 1.0) * (smoothstep(0.9990, 0.9994, m) * 1.6 + pow(m, 80.0) * 0.18) * night;
  if (d.y < 0.0) c = horizon * 0.95;
  gl_FragColor = vec4(c, 1.0);
}`;

export function setupSky(scene) {
  const geo = new THREE.SphereGeometry(1200, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() },
      moonDir: { value: new THREE.Vector3(-0.4, 0.55, -0.6).normalize() }, night: { value: 0 }, golden: { value: 0 },
    },
    vertexShader: SKY_VS, fragmentShader: SKY_FS,
  });
  sky.dome = new THREE.Mesh(geo, mat);
  sky.dome.renderOrder = -10;
  sky.dome.frustumCulled = false;
  scene.add(sky.dome);

  // Blocky stars (a few brighter, coloured ones)
  const sg = new THREE.BufferGeometry();
  const pts = [], cols = [], r = makeRng(99);
  for (let i = 0; i < 520; i++) {
    const a = r() * Math.PI * 2, e = 0.12 + r() * 1.35;
    pts.push(Math.cos(a) * Math.cos(e) * 1100, Math.sin(e) * 1100, Math.sin(a) * Math.cos(e) * 1100);
    const k = r(), b = 0.6 + r() * 0.4;
    cols.push(b * (k < 0.1 ? 1 : 0.9), b * (k < 0.1 ? 0.8 : 0.92), b);
  }
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  sg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  sky.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, transparent: true, fog: false, vertexColors: true }));
  scene.add(sky.stars);

  sky.hemi = new THREE.HemisphereLight(0xcfeaff, 0xffd8b0, 1.2);
  scene.add(sky.hemi);
  sky.sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sky.sun.castShadow = true;
  sky.sun.shadow.mapSize.set(2048, 2048);
  const sc = sky.sun.shadow.camera;
  sc.left = -85; sc.right = 85; sc.top = 85; sc.bottom = -85; sc.near = 10; sc.far = 420;
  sky.sun.shadow.bias = -0.0006;
  sky.sun.shadow.normalBias = 0.06;
  sky.sun.shadow.radius = 3;
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
  const num = (k) => a[k] + (b[k] - a[k]) * t;
  return { top: col(1), horizon: col(2), sunCol: col(3), sunI: num(4), hemiI: num(5), night: num(6), haze: col(7), near: num(8), far: num(9) };
}

export function setHour(h) { sky.hour = ((h % 24) + 24) % 24; }

const WHITE = new THREE.Color('#ffffff');
const _sun = new THREE.Vector3();
// Advance the clock and update lights; focus = where the player is (shadow camera follows).
export function updateSky(dt, focus, scene) {
  if (!sky.fixed) sky.hour = (sky.hour + dt * (24 / 900)) % 24; // full day = 15 minutes
  const k = lerpKey(sky.hour);
  sky.night = k.night;
  const golden = Math.max(0, 1 - Math.abs(sky.hour - 18) / 1.6) * (1 - k.night);
  sky.golden = golden;
  const u = sky.dome.material.uniforms;
  u.top.value.copy(k.top); u.horizon.value.copy(k.horizon); u.sunCol.value.copy(k.sunCol);
  u.night.value = k.night; u.golden.value = golden;
  // Sun arc: rises east (+x, over the ocean), sets west.
  const ang = ((sky.hour - 6) / 12) * Math.PI;
  const sunDir = _sun.set(Math.cos(ang) * 0.8, Math.max(Math.sin(ang), 0.17), 0.45).normalize();
  u.sunDir.value.copy(sunDir);
  if (k.night > 0.5) sunDir.set(-0.4, 0.8, -0.3).normalize(); // moonlight
  sky.sunDir.copy(sunDir);
  sky.sunColor.copy(k.sunCol);
  sky.horizon.copy(k.horizon);
  sky.sun.color.copy(k.sunCol);
  sky.sun.intensity = k.sunI;
  sky.hemi.intensity = k.hemiI;
  sky.hemi.color.copy(k.horizon).lerp(WHITE, 0.5);
  // Shadow camera follows the player, snapped to whole shadow-map texels so edges do not shimmer.
  const texel = 170 / 2048;
  const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
  sky.sun.position.set(fx + sunDir.x * 200, sunDir.y * 200, fz + sunDir.z * 200);
  sky.sun.target.position.set(fx, 0, fz);
  sky.dome.position.set(focus.x, 0, focus.z);
  sky.stars.position.copy(sky.dome.position);
  sky.stars.material.opacity = k.night;
  sky.stars.visible = k.night > 0.05;
  // Haze: its own colour per time of day, pulled towards the horizon so distant blocks melt into the sky.
  scene.fog.color.copy(k.haze).lerp(k.horizon, 0.35);
  scene.fog.near = k.near; scene.fog.far = k.far;
  for (const m of city.glowMats) m.emissiveIntensity = k.night * 1.1;
  for (const o of city.nightOnly) o.visible = k.night > 0.3;
  return k.night;
}
