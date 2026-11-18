// Post-processing: the scene renders into a multisampled half-float target, then a bright pass feeds a
// two-level blurred bloom (neon tubes, light bars, muzzle flashes and the searchlight glow), and a final
// composite adds a soft highlight shoulder (sunlit pastel walls keep their colour instead of clipping),
// saturation, vignette and speed streaks at high speed. QUALITY LOW skips all of it.
const THREE = window.THREE;

export const post = {
  enabled: true,
  bloom: 0.9,          // bloom strength
  threshold: 1.0,      // max-channel brightness where bloom starts (linear)
  exposure: 1.0,
  sat: 1.12,
  vignette: 0.32,
  speed: 0,            // 0..1 speed streaks (set by the camera)
  warm: 0,             // 0..1 warm grade (sunset/sunrise)
};

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const BRIGHT = `uniform sampler2D tSrc; uniform float threshold; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb;
  float m = max(c.r, max(c.g, c.b));
  float k = smoothstep(threshold, threshold * 1.5 + 0.15, m);
  gl_FragColor = vec4(c * k, 1.0);
}`;

const BLUR = `uniform sampler2D tSrc; uniform vec2 dir; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270;
  c += texture2D(tSrc, vUv + dir * 1.3846).rgb * 0.3162;
  c += texture2D(tSrc, vUv - dir * 1.3846).rgb * 0.3162;
  c += texture2D(tSrc, vUv + dir * 3.2308).rgb * 0.0703;
  c += texture2D(tSrc, vUv - dir * 3.2308).rgb * 0.0703;
  gl_FragColor = vec4(c, 1.0);
}`;

const COMPOSITE = `uniform sampler2D tScene; uniform sampler2D tBloomA; uniform sampler2D tBloomB;
uniform float bloom; uniform float exposure; uniform float sat; uniform float vignette; uniform float speed; uniform float warm; uniform float time;
uniform vec2 aspect; varying vec2 vUv;
vec3 shoulder(vec3 x){
  float t = 0.72;
  vec3 over = t + (1.0 - t) * (1.0 - exp(-(x - t) / (1.0 - t)));
  return mix(x, over, step(vec3(t), x));
}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
float hash(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  vec2 d = (uv - 0.5);
  vec3 c = texture2D(tScene, uv).rgb;
  if (speed > 0.001) {
    // Radial motion blur towards the edges plus thin bright streaks rushing outwards.
    float e = smoothstep(0.12, 0.62, length(d * aspect));
    vec3 acc = c;
    for (int i = 1; i < 6; i++) acc += texture2D(tScene, uv - d * float(i) * 0.014 * speed).rgb;
    c = mix(c, acc / 6.0, e);
    float ang = atan(d.y, d.x);
    float lane = floor(ang * 38.0);
    float on = step(0.78, hash(lane * 1.7 + 3.1));
    float r = length(d * aspect);
    float run = fract(r * 2.6 - time * (2.2 + hash(lane) * 1.8) + hash(lane * 9.1));
    float streak = on * smoothstep(0.55, 1.0, run) * smoothstep(0.3, 0.62, r) * (1.0 - abs(fract(ang * 38.0) - 0.5) * 2.0);
    c += vec3(0.9, 0.95, 1.0) * streak * speed * 0.55;
  }
  vec3 b = texture2D(tBloomA, uv).rgb * 0.75 + texture2D(tBloomB, uv).rgb;
  c = c * exposure + b * bloom;
  c = shoulder(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, sat), 0.0);
  c *= mix(vec3(1.0), vec3(1.08, 0.98, 0.9), warm);
  float v = smoothstep(0.9, 0.3, length(d * vec2(1.0, 0.85)));
  c *= mix(1.0 - vignette, 1.0, v);
  gl_FragColor = vec4(toSRGB(clamp(c, 0.0, 1.0)), 1.0);
}`;

let renderer, sceneRT, halfA, halfB, quarterA, quarterB;
let quadScene, quadCam, quad, mBright, mBlur, mComp;
const size = new THREE.Vector2();

function target(w, h, samples = 0) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType, samples, depthBuffer: samples > 0,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });
}

export function setupPost(r) {
  renderer = r;
  const shader = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
  mBright = shader(BRIGHT, { tSrc: { value: null }, threshold: { value: 1 } });
  mBlur = shader(BLUR, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
  mComp = shader(COMPOSITE, {
    tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null },
    bloom: { value: 1 }, exposure: { value: 1 }, sat: { value: 1 }, vignette: { value: 0 }, speed: { value: 0 }, warm: { value: 0 }, time: { value: 0 },
    aspect: { value: new THREE.Vector2(1, 1) },
  });
  quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mComp);
  quad.frustumCulled = false;
  quadScene = new THREE.Scene();
  quadScene.add(quad);
  quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  resizePost();
}

export function resizePost() {
  if (!renderer) return;
  renderer.getDrawingBufferSize(size);
  for (const t of [sceneRT, halfA, halfB, quarterA, quarterB]) t?.dispose();
  sceneRT = target(size.x, size.y, 4);
  halfA = target(size.x >> 1, size.y >> 1);
  halfB = target(size.x >> 1, size.y >> 1);
  quarterA = target(size.x >> 2, size.y >> 2);
  quarterB = target(size.x >> 2, size.y >> 2);
}

function pass(mat, out) {
  quad.material = mat;
  renderer.setRenderTarget(out);
  renderer.render(quadScene, quadCam);
}

function blur(src, tmp, w, h) {
  mBlur.uniforms.tSrc.value = src.texture;
  mBlur.uniforms.dir.value.set(1 / w, 0);
  pass(mBlur, tmp);
  mBlur.uniforms.tSrc.value = tmp.texture;
  mBlur.uniforms.dir.value.set(0, 1 / h);
  pass(mBlur, src);
}

export function renderFrame(scene, camera, time = 0) {
  if (!post.enabled) {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    return;
  }
  renderer.setRenderTarget(sceneRT);
  renderer.render(scene, camera);
  // Bright pass at half resolution, blurred twice; a quarter-res copy blurred again for the wide halo.
  mBright.uniforms.tSrc.value = sceneRT.texture;
  mBright.uniforms.threshold.value = post.threshold;
  pass(mBright, halfA);
  blur(halfA, halfB, halfA.width, halfA.height);
  blur(halfA, halfB, halfA.width, halfA.height);
  mBlur.uniforms.tSrc.value = halfA.texture;
  mBlur.uniforms.dir.value.set(0, 0);
  pass(mBlur, quarterA);
  blur(quarterA, quarterB, quarterA.width, quarterA.height);
  blur(quarterA, quarterB, quarterA.width, quarterA.height);
  const u = mComp.uniforms;
  u.tScene.value = sceneRT.texture;
  u.tBloomA.value = halfA.texture;
  u.tBloomB.value = quarterA.texture;
  u.bloom.value = post.bloom; u.exposure.value = post.exposure; u.sat.value = post.sat;
  u.vignette.value = post.vignette; u.speed.value = post.speed; u.warm.value = post.warm; u.time.value = time;
  u.aspect.value.set(size.x / size.y, 1);
  pass(mComp, null);
}
