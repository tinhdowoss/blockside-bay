// Post-processing. Its one job: draw a frame through the screen-space effect chain. The scene renders
// into a multisampled half-float target; a bright pass feeds a two-level blurred bloom (neon tubes, light
// bars, muzzle flashes and the searchlight glow); a final composite adds a soft highlight shoulder / filmic
// tone curve (sunlit pastel walls keep their colour instead of clipping), saturation, the time-of-day
// colour grade, vignette, lens fringing and speed streaks. With `post.enabled` off (QUALITY LOW) the
// scene is drawn straight to the screen. The settings object `post` is written by grade.js and the camera.
const THREE = window.THREE;

// Live post settings, read every frame by renderFrame().
export const post = {
  enabled: true,
  bloom: 0.9,          // bloom strength
  threshold: 1.0,      // max-channel brightness where bloom starts (linear)
  exposure: 1.0,
  sat: 1.12,
  vignette: 0.32,
  speed: 0,            // 0..1 speed streaks (set by the camera)
  warm: 0,             // 0..1 warm grade (sunset/sunrise)
  filmic: 0.5,         // 0 = soft highlight shoulder, 1 = full ACES filmic tone curve
  contrast: 1.04,
  lift: [0, 0, 0],     // shadow tint added in the grade (time of day)
  gain: [1, 1, 1],     // highlight tint multiplied in the grade
  vigTint: [1, 1, 1],  // colour the vignette falls off to (deep violet at night)
  aberr: 0,            // extra lens fringing (pain flash)
};

// Full-screen triangle pair: positions are already in clip space.
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

// Keeps only pixels brighter than the threshold (soft knee), for the bloom.
const BRIGHT = `uniform sampler2D tSrc; uniform float threshold; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb;
  float m = max(c.r, max(c.g, c.b));
  float k = smoothstep(threshold, threshold * 1.5 + 0.15, m);
  gl_FragColor = vec4(c * k, 1.0);
}`;

// One direction of a 9-tap Gaussian using linear-filtered taps (weights sum to 1).
// With dir = (0, 0) it is a plain copy, used to downsample.
const BLUR = `uniform sampler2D tSrc; uniform vec2 dir; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270;
  c += texture2D(tSrc, vUv + dir * 1.3846).rgb * 0.3162;
  c += texture2D(tSrc, vUv - dir * 1.3846).rgb * 0.3162;
  c += texture2D(tSrc, vUv + dir * 3.2308).rgb * 0.0703;
  c += texture2D(tSrc, vUv - dir * 3.2308).rgb * 0.0703;
  gl_FragColor = vec4(c, 1.0);
}`;

// Final pass to the screen: fringing, speed blur/streaks, bloom, tone curve, saturation, grade, vignette.
const COMPOSITE = `uniform sampler2D tScene; uniform sampler2D tBloomA; uniform sampler2D tBloomB;
uniform float bloom; uniform float exposure; uniform float sat; uniform float vignette; uniform float speed; uniform float warm; uniform float time;
uniform float filmic; uniform float contrast; uniform vec3 lift; uniform vec3 gain; uniform vec3 vigTint; uniform float aberr;
uniform vec2 aspect; varying vec2 vUv;
// Soft roll-off above 0.72 so bright pastels approach white without a hard clip.
vec3 shoulder(vec3 x){
  float t = 0.72;
  vec3 over = t + (1.0 - t) * (1.0 - exp(-(x - t) / (1.0 - t)));
  return mix(x, over, step(vec3(t), x));
}
// Fitted ACES filmic curve (Narkowicz), scaled so mid-grey stays where the pastel palette expects it.
vec3 aces(vec3 x){
  x *= 0.84;
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 tonemap(vec3 x){ return mix(shoulder(x), aces(x * 1.32), filmic); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
float hash(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  vec2 d = (uv - 0.5);
  vec3 c = texture2D(tScene, uv).rgb;
  if (aberr > 0.0005) {
    // Lens fringing that grows towards the frame edge (stronger at speed and when hurt).
    vec2 o = d * aberr * dot(d, d) * 4.0;
    c.r = texture2D(tScene, uv - o).r;
    c.b = texture2D(tScene, uv + o).b;
  }
  if (speed > 0.001) {
    // Radial motion blur towards the edges plus thin bright streaks rushing outwards.
    float e = smoothstep(0.3, 0.8, length(d * aspect));
    vec3 acc = c;
    for (int i = 1; i < 6; i++) acc += texture2D(tScene, uv - d * float(i) * 0.006 * speed).rgb;
    c = mix(c, acc / 6.0, e);
    float ang = atan(d.y, d.x);
    float lane = floor(ang * 38.0);
    float on = step(0.78, hash(lane * 1.7 + 3.1));
    float r = length(d * aspect);
    float run = fract(r * 2.6 - time * (2.2 + hash(lane) * 1.8) + hash(lane * 9.1));
    float streak = on * smoothstep(0.55, 1.0, run) * smoothstep(0.3, 0.62, r) * (1.0 - abs(fract(ang * 38.0) - 0.5) * 2.0);
    c += vec3(1.0, 0.95, 0.85) * streak * speed * 0.7;
  }
  vec3 b = texture2D(tBloomA, uv).rgb * 0.75 + texture2D(tBloomB, uv).rgb;
  c = c * exposure + b * bloom;
  c = tonemap(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, sat), 0.0);
  c *= mix(vec3(1.0), vec3(1.08, 0.98, 0.9), warm);
  // Colour grade: contrast around mid-grey (in a gamma-ish space), tinted shadows (lift) and highlights (gain).
  vec3 g = pow(max(c, 0.0), vec3(1.0 / 2.2));
  g = (g - 0.5) * contrast + 0.5;
  float lg = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g += lift * (1.0 - smoothstep(0.0, 0.55, lg));
  g *= mix(vec3(1.0), gain, smoothstep(0.35, 1.0, lg));
  c = pow(max(g, 0.0), vec3(2.2));
  float v = smoothstep(0.92, 0.28, length(d * vec2(1.0, 0.85)));
  c *= mix(vigTint * (1.0 - vignette), vec3(1.0), v);
  gl_FragColor = vec4(toSRGB(clamp(c, 0.0, 1.0)), 1.0);
}`;

let renderer;
// Render targets: full-res multisampled scene, then half- and quarter-res ping-pong pairs for the bloom.
let sceneRT, halfA, halfB, quarterA, quarterB;
let quadScene, quadCam, quad, brightMat, blurMat, compositeMat;
const drawSize = new THREE.Vector2();

// A linear-filtered half-float render target (with depth only when multisampled, i.e. the scene target).
function makeTarget(w, h, samples = 0) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType, samples, depthBuffer: samples > 0,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });
}

// Create the post materials and full-screen quad for this renderer, and size the targets.
export function setupPost(r) {
  renderer = r;
  const shader = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
  brightMat = shader(BRIGHT, { tSrc: { value: null }, threshold: { value: 1 } });
  blurMat = shader(BLUR, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
  compositeMat = shader(COMPOSITE, {
    tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null },
    bloom: { value: 1 }, exposure: { value: 1 }, sat: { value: 1 }, vignette: { value: 0 }, speed: { value: 0 }, warm: { value: 0 }, time: { value: 0 },
    filmic: { value: 0.5 }, contrast: { value: 1 }, lift: { value: new THREE.Vector3() }, gain: { value: new THREE.Vector3(1, 1, 1) },
    vigTint: { value: new THREE.Vector3(1, 1, 1) }, aberr: { value: 0 },
    aspect: { value: new THREE.Vector2(1, 1) },
  });
  quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMat);
  quad.frustumCulled = false;
  quadScene = new THREE.Scene();
  quadScene.add(quad);
  quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  resizePost();
}

// Recreate the render targets to match the renderer's drawing buffer (call after a resize / pixel-ratio change).
export function resizePost() {
  if (!renderer) return;
  renderer.getDrawingBufferSize(drawSize);
  for (const t of [sceneRT, halfA, halfB, quarterA, quarterB]) t?.dispose();
  sceneRT = makeTarget(drawSize.x, drawSize.y, 4);
  halfA = makeTarget(drawSize.x >> 1, drawSize.y >> 1);
  halfB = makeTarget(drawSize.x >> 1, drawSize.y >> 1);
  quarterA = makeTarget(drawSize.x >> 2, drawSize.y >> 2);
  quarterB = makeTarget(drawSize.x >> 2, drawSize.y >> 2);
}

// Draw the full-screen quad with `mat` into `out` (null = the screen).
function pass(mat, out) {
  quad.material = mat;
  renderer.setRenderTarget(out);
  renderer.render(quadScene, quadCam);
}

// Separable blur of `target` in place (horizontal into `scratch`, vertical back), for a w x h target.
function blurInPlace(target, scratch, w, h) {
  blurMat.uniforms.tSrc.value = target.texture;
  blurMat.uniforms.dir.value.set(1 / w, 0);
  pass(blurMat, scratch);
  blurMat.uniforms.tSrc.value = scratch.texture;
  blurMat.uniforms.dir.value.set(0, 1 / h);
  pass(blurMat, target);
}

// Render one frame of `scene` from `camera` through the post chain to the screen; `time` drives the streaks.
export function renderFrame(scene, camera, time = 0) {
  if (!post.enabled) {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    return;
  }
  renderer.setRenderTarget(sceneRT);
  renderer.render(scene, camera);
  // Bright pass at half resolution, blurred twice; a quarter-res copy blurred again for the wide halo.
  brightMat.uniforms.tSrc.value = sceneRT.texture;
  brightMat.uniforms.threshold.value = post.threshold;
  pass(brightMat, halfA);
  blurInPlace(halfA, halfB, halfA.width, halfA.height);
  blurInPlace(halfA, halfB, halfA.width, halfA.height);
  blurMat.uniforms.tSrc.value = halfA.texture;
  blurMat.uniforms.dir.value.set(0, 0);
  pass(blurMat, quarterA);
  blurInPlace(quarterA, quarterB, quarterA.width, quarterA.height);
  blurInPlace(quarterA, quarterB, quarterA.width, quarterA.height);
  const u = compositeMat.uniforms;
  u.tScene.value = sceneRT.texture;
  u.tBloomA.value = halfA.texture;
  u.tBloomB.value = quarterA.texture;
  u.bloom.value = post.bloom; u.exposure.value = post.exposure; u.sat.value = post.sat;
  u.vignette.value = post.vignette; u.speed.value = post.speed; u.warm.value = post.warm; u.time.value = time;
  u.filmic.value = post.filmic; u.contrast.value = post.contrast; u.aberr.value = post.aberr + post.speed * 0.006;
  u.lift.value.set(post.lift[0], post.lift[1], post.lift[2]);
  u.gain.value.set(post.gain[0], post.gain[1], post.gain[2]);
  u.vigTint.value.set(post.vigTint[0], post.vigTint[1], post.vigTint[2]);
  u.aspect.value.set(drawSize.x / drawSize.y, 1);
  pass(compositeMat, null);
}
