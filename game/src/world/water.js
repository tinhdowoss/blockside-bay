// The bay: a shader ocean that follows the player. Three long swells move the surface (vertex), small
// ripples break up the normal (fragment), a Fresnel blend mixes the sky into the deep water, the sun (or
// moon) draws a glitter path, shallow water near the coast turns turquoise and white foam laps against
// the beach and the seawalls. Uses three's fog chunks so it melts into the same haze as the city.
import { CITY_SIZE, OCEAN_X } from '../core/config.js';
import { sky } from './daylight.js';

const THREE = window.THREE;
// The land the sea wraps around (beach edge on the east, seawalls on the other three sides).
const LAND = { x0: -27, x1: OCEAN_X + 8, z0: -27, z1: CITY_SIZE + 27 };

const VS = `#include <fog_pars_vertex>
uniform float time; varying vec3 vW; varying float vH;
float swell(vec2 p){
  float h = 0.15 * sin(dot(p, vec2(0.8, 0.6)) * 0.11 + time * 1.1);
  h += 0.09 * sin(dot(p, vec2(-0.3, 0.95)) * 0.19 + time * 1.6);
  h += 0.05 * sin(dot(p, vec2(0.99, -0.1)) * 0.33 + time * 2.3);
  return h;
}
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  float h = swell(w.xz);
  w.y += h; vH = h; vW = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FS = `#include <fog_pars_fragment>
uniform float time; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunI; uniform vec3 skyTop; uniform vec3 horizon;
uniform vec3 deep; uniform vec3 shallow; uniform float night; uniform vec4 land; uniform float neon;
varying vec3 vW; varying float vH;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
// Distance outside the land rectangle (0 at the shoreline).
float coast(vec2 p){ vec2 c = (land.xz + land.yw) * 0.5; vec2 e = (land.yw - land.xz) * 0.5; vec2 q = abs(p - c) - e; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
void main(){
  vec2 p = vW.xz;
  // Analytic slope of the swells + two ripple layers for the normal.
  float t = time;
  vec2 g = vec2(0.0);
  g += 0.15 * 0.11 * vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.11 + t * 1.1);
  g += 0.09 * 0.19 * vec2(-0.3, 0.95) * cos(dot(p, vec2(-0.3, 0.95)) * 0.19 + t * 1.6);
  g += 0.05 * 0.33 * vec2(0.99, -0.1) * cos(dot(p, vec2(0.99, -0.1)) * 0.33 + t * 2.3);
  g += 0.035 * vec2(cos(p.x * 0.9 + t * 2.7 + p.y * 0.4), cos(p.y * 1.1 - t * 2.1 + p.x * 0.3));
  g += 0.02 * vec2(cos(p.x * 2.3 - t * 3.9), cos(p.y * 2.7 + t * 3.3 + p.x * 0.7));
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 v = normalize(cameraPosition - vW);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  vec3 r = reflect(-v, n);
  vec3 skyc = mix(horizon, skyTop, clamp(r.y * 1.6, 0.0, 1.0));
  // At night the reflected sky is pulled towards deep navy so the bay does not glow purple.
  skyc = mix(skyc, vec3(0.03, 0.05, 0.14), night * 0.6);
  float d = coast(p);
  // Water colour: turquoise over the shallows, deep blue offshore.
  vec3 base = mix(shallow, deep, smoothstep(2.0, 46.0, d));
  float lit = clamp(dot(n, normalize(sunDir)), 0.0, 1.0) * 0.35 + 0.65;
  vec3 col = base * lit * mix(1.0, 0.35, night);
  col = mix(col, skyc, 0.18 + fres * 0.6);
  // Sun / moon glitter: a tight specular lobe broken up by the ripples.
  float spec = pow(max(dot(r, normalize(sunDir)), 0.0), 220.0) * 3.0 + pow(max(dot(r, normalize(sunDir)), 0.0), 18.0) * 0.12;
  col += sunCol * spec * sunI;
  // City lights smear on the water at night.
  col += vec3(1.0, 0.35, 0.8) * neon * night * smoothstep(60.0, 0.0, d) * (0.5 + 0.5 * sin(p.x * 0.7 + t)) * 0.08;
  // Foam: a lapping band at the shore that surges in and out, plus streaks on the swell crests.
  float surge = 1.6 + 1.2 * sin(t * 1.3 + p.y * 0.05 + p.x * 0.05);
  float nz = vnoise(p * 0.6 + vec2(t * 0.3, -t * 0.2));
  float shore = smoothstep(surge + 1.4, surge - 0.4, d + nz * 1.6);
  float ring = smoothstep(0.12, 0.0, abs(d - surge - 2.2 - nz)) * 0.6;
  float crest = smoothstep(0.2, 0.28, vH + nz * 0.08) * 0.35 * smoothstep(80.0, 20.0, d);
  float foam = clamp(shore + ring + crest, 0.0, 1.0) * step(0.0, d);
  col = mix(col, vec3(0.95, 0.98, 1.0) * mix(1.0, 0.45, night), foam * 0.9);
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}`;

export const water = { mesh: null };

export function buildWater(group) {
  const geo = new THREE.PlaneGeometry(2400, 2400, 240, 240);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, sunI: { value: 1 },
      skyTop: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, night: { value: 0 }, neon: { value: 1 },
      deep: { value: new THREE.Color('#0a6fb2') }, shallow: { value: new THREE.Color('#2fe0d4') },
      land: { value: new THREE.Vector4(LAND.x0, LAND.x1, LAND.z0, LAND.z1) },
    }]),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(CITY_SIZE / 2, -0.35, CITY_SIZE / 2);
  mesh.frustumCulled = false;
  group.add(mesh);
  water.mesh = mesh;
  return mesh;
}

export function updateWater(t, focus) {
  const m = water.mesh;
  if (!m) return;
  // Follow the player in whole grid cells so the wave pattern (computed in world space) never swims.
  const cell = 10;
  m.position.x = Math.round(focus.x / cell) * cell;
  m.position.z = Math.round(focus.z / cell) * cell;
  const u = m.material.uniforms;
  u.time.value = t;
  u.sunDir.value.copy(sky.sunDir);
  u.sunCol.value.copy(sky.sunColor);
  u.sunI.value = sky.sun ? sky.sun.intensity / 2.6 : 1;
  u.horizon.value.copy(sky.horizon);
  u.skyTop.value.copy(sky.dome.material.uniforms.top.value);
  u.night.value = sky.night;
}
