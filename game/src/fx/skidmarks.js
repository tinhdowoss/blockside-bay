// Skid marks: dark rubber strips laid on the asphalt under sliding or hard-braking tyres. A ring buffer of
// flat quads in one instanced draw; when the buffer is full the oldest mark is overwritten.
const THREE = window.THREE;
const MAX = 1400;
let geo, segs, alphas, head = 0, count = 0;

const VS = `attribute vec4 aSeg; attribute float aA; varying float vA; varying vec2 vUv;
void main(){
  // aSeg = (x, z, angle, length); the quad is 0.32 wide, laid flat just above the road.
  float s = sin(aSeg.z), c = cos(aSeg.z);
  vec2 p = vec2(position.x * 0.32, position.y * aSeg.w);
  vec3 w = vec3(aSeg.x + p.x * c + p.y * s, 0.035, aSeg.y - p.x * s + p.y * c);
  vA = aA; vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const FS = `varying float vA; varying vec2 vUv;
void main(){
  float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
  gl_FragColor = vec4(0.05, 0.045, 0.06, vA * edge * 0.7);
  #include <colorspace_fragment>
}`;

/** Creates the instanced skid-mark mesh and adds it to the scene. */
export function setupSkidmarks(scene) {
  const plane = new THREE.PlaneGeometry(1, 1);
  geo = new THREE.InstancedBufferGeometry();
  geo.index = plane.index;
  geo.setAttribute('position', plane.getAttribute('position'));
  geo.setAttribute('uv', plane.getAttribute('uv'));
  segs = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
  alphas = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aSeg', segs);
  geo.setAttribute('aA', alphas);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
}

/** One strip from (x0, z0) to (x1, z1) with strength 0..1 (ignores tiny or teleport-sized gaps). */
export function addSkid(x0, z0, x1, z1, strength = 1) {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  if (len < 0.05 || len > 4) return;
  segs.setXYZW(head, (x0 + x1) / 2, (z0 + z1) / 2, Math.atan2(dx, dz), len + 0.06);
  alphas.setX(head, Math.min(1, strength));
  head = (head + 1) % MAX;
  count = Math.min(MAX, count + 1);
  geo.instanceCount = count;
  segs.needsUpdate = true;
  alphas.needsUpdate = true;
}

/** Tyre bookkeeping for one car: lays marks from both rear wheels while `strength` > 0. */
export function skidCar(v, strength) {
  const fwdX = Math.sin(v.heading), fwdZ = Math.cos(v.heading);
  const back = v.spec.len * 0.32, side = v.spec.wid * 0.38;
  const wheels = [
    [v.x - fwdX * back - fwdZ * side, v.z - fwdZ * back + fwdX * side],
    [v.x - fwdX * back + fwdZ * side, v.z - fwdZ * back - fwdX * side],
  ];
  if (strength > 0 && v.skidPrev) wheels.forEach((w, i) => addSkid(v.skidPrev[i][0], v.skidPrev[i][1], w[0], w[1], strength));
  v.skidPrev = strength > 0 ? wheels : null;
}
