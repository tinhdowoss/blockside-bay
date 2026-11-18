// Box batcher: merges thousands of voxel boxes into one BufferGeometry per material.
const THREE = window.THREE;

// Each face: name, normal, tangent a, tangent b (a x b = normal).
const FACES = [
  ['px', [1, 0, 0], [0, 0, -1], [0, 1, 0]],
  ['nx', [-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  ['py', [0, 1, 0], [1, 0, 0], [0, 0, -1]],
  ['ny', [0, -1, 0], [1, 0, 0], [0, 0, 1]],
  ['pz', [0, 0, 1], [1, 0, 0], [0, 1, 0]],
  ['nz', [0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _c = new THREE.Color();

export class Batcher {
  constructor() {
    this.groups = new Map();
  }

  material(key, mat) {
    if (!this.groups.has(key)) this.groups.set(key, { mat, pos: [], nor: [], uv: [], col: [], idx: [] });
    return this;
  }

  // Adds a box centred at (x,y,z). opts: uv (world units per texture tile, 0 = stretch), ry (yaw),
  // color (vertex colour), top (material key for the top face), faces (subset like 'py,pz'), matrix.
  box(key, x, y, z, sx, sy, sz, opts = {}) {
    const uvs = opts.uv || 0;
    const only = opts.faces ? opts.faces.split(',') : null;
    _c.set(opts.color || '#ffffff');
    if (opts.matrix) _m.copy(opts.matrix);
    else _m.makeRotationY(opts.ry || 0).setPosition(x, y, z);
    _nm.getNormalMatrix(_m);
    const half = [sx / 2, sy / 2, sz / 2];
    const base = opts.matrix ? [0, 0, 0] : [x, y, z];
    for (const [name, n, a, b] of FACES) {
      if (only && !only.includes(name)) continue;
      if (opts.skip && opts.skip.includes(name)) continue;
      const gkey = name === 'py' && opts.top ? opts.top : name === 'ny' && opts.bottom ? opts.bottom : key;
      const g = this.groups.get(gkey);
      if (!g) throw new Error('unknown material ' + gkey);
      const start = g.pos.length / 3;
      _n.set(n[0], n[1], n[2]).applyMatrix3(_nm).normalize();
      for (const [ca, cb] of CORNERS) {
        const lx = (n[0] + a[0] * ca + b[0] * cb) * half[0];
        const ly = (n[1] + a[1] * ca + b[1] * cb) * half[1];
        const lz = (n[2] + a[2] * ca + b[2] * cb) * half[2];
        _v.set(lx, ly, lz).applyMatrix4(_m);
        g.pos.push(_v.x, _v.y, _v.z);
        g.nor.push(_n.x, _n.y, _n.z);
        g.col.push(_c.r, _c.g, _c.b);
        if (uvs) {
          const wx = lx + base[0], wy = ly + base[1], wz = lz + base[2];
          const u = (a[0] * wx + a[1] * wy + a[2] * wz) / uvs;
          const v = (b[0] * wx + b[1] * wy + b[2] * wz) / uvs;
          g.uv.push(u + (opts.uo || 0), v);
        } else g.uv.push((ca + 1) / 2, (cb + 1) / 2);
      }
      g.idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
    return this;
  }

  build(shadows = true) {
    const root = new THREE.Group();
    for (const [, g] of this.groups) {
      if (!g.pos.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
      geo.setIndex(g.pos.length / 3 > 65000 ? new THREE.Uint32BufferAttribute(g.idx, 1) : new THREE.Uint16BufferAttribute(g.idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, g.mat);
      mesh.castShadow = shadows && !g.mat.transparent;
      mesh.receiveShadow = shadows;
      root.add(mesh);
    }
    return root;
  }
}

// One vertex-coloured mesh from a list of [x,y,z,sx,sy,sz,color] boxes.
export function colorBoxes(list, material) {
  const b = new Batcher().material('m', material);
  for (const p of list) b.box('m', p[0], p[1], p[2], p[3], p[4], p[5], { color: p[6], ry: p[7] || 0 });
  const g = b.build();
  return g.children[0];
}

export const LAMBERT_VC = () => new THREE.MeshLambertMaterial({ vertexColors: true });
