// Street-level dressing on the buildings. Its one job: give every street-facing ground floor a shopfront
// (painted name board, striped awning with valance, lit window, door) and put lit billboards with
// pixel-art adverts on low and mid-rise roofs. All names and adverts are invented for Blockside Bay.
// Boards and adverts come from two canvas atlases, so the whole lot is three merged meshes; the boards
// glow softly after dark (their materials join city.glowMats).
import { CELL, ROAD_W } from '../core/config.js';
import { city } from './city.js';
import { makeRng } from '../core/rng.js';
import { Batcher } from './voxel.js';
import { drawPixelText, textWidth } from '../ui/pixelfont.js';
import { registerGlow } from '../fx/grade.js';

const THREE = window.THREE;

export const SHOP_NAMES = [
  'SUNNY SIDE SURF', 'PALM PAWN', 'NEPTUNO TACOS', 'REEF RECORDS', 'BAY BODEGA', 'PIXEL PALMS',
  'SALTY DOG BAIT', 'CORAL COFFEE', 'MOJO MOPEDS', 'PINK PELICAN', 'BLOCK BURGER', 'TIDE PHARMACY',
  'LUCKY LIME WASH', 'CASA CHANCLA', 'FLAMINGO NAILS', 'SEASHELL SALON', 'MANGO MART', 'DISCOS DEL MAR',
  'HOT SAUCE HQ', 'BAYSIDE BOOKS', 'COCO CELLULAR', 'GECKO GYM', 'SUNDAE SCHOOL', 'ROLL & BOWL',
  'OCEAN OPTICS', 'PALOMA PIZZA', 'SOL SHOES', 'WAVE REPAIR', 'CHURRO CHURCH', 'KITE & KELP',
  'LOW TIDE LOUNGE', 'GUAVA GRILL',
];
// [board colour, lettering colour] pairs, cycled through the shop names.
const BOARD_COLS = [
  ['#ff5fa2', '#ffffff'], ['#2ee6c8', '#12061c'], ['#ffd23f', '#12061c'], ['#7a5cff', '#ffffff'], ['#ff7a3d', '#ffffff'],
  ['#1d3f66', '#ffe066'], ['#ffffff', '#ff3f7a'], ['#3fbf4f', '#ffffff'], ['#12061c', '#3fe8ff'], ['#ffb3d1', '#5a1060'],
];
const AWNING_COLS = ['#ff5fa2', '#2ee6c8', '#ffd23f', '#7a5cff', '#ff7a3d', '#3fa0ff', '#ff3f5f', '#3fbf4f'];

// ---- atlases ------------------------------------------------------------------------------------
// Crisp pixel-art texture from a canvas atlas.
function atlasTexture(cv) {
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

// Name boards: one ROW-pixel strip per shop name in an AW-wide atlas, each as wide as its text.
const ROW = 24, AW = 256;
function boardAtlas() {
  const cv = document.createElement('canvas');
  cv.width = AW; cv.height = ROW * SHOP_NAMES.length;
  const g = cv.getContext('2d');
  const rects = [];
  SHOP_NAMES.forEach((name, i) => {
    const [bg, fg] = BOARD_COLS[i % BOARD_COLS.length];
    const y = i * ROW;
    const w = Math.min(AW, textWidth(name, 2) + 16);
    g.fillStyle = bg; g.fillRect(0, y, w, ROW);
    g.fillStyle = fg; g.fillRect(0, y, w, 2); g.fillRect(0, y + ROW - 2, w, 2);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y + ROW - 5, w, 3);
    drawPixelText(g, name, 8, y + 5, 2, fg);
    rects.push({ u0: 0, u1: w / AW, v0: 1 - (y + ROW) / cv.height, v1: 1 - y / cv.height, aspect: w / ROW });
  });
  return { tex: atlasTexture(cv), rects };
}

// Adverts: 8 posters of 128x64 pixels in a 256x256 atlas (gradient bg, headline, strapline, icon).
const ADS = [
  { bg: ['#ff8ab8', '#ffd23f'], lines: ['FIZZBANG', 'SODA'], sub: 'TASTES LIKE SUMMER', icon: 'bottle' },
  { bg: ['#3fa0ff', '#2ee6c8'], lines: ['RIDE THE', 'SPAN'], sub: 'BAYLINE FERRY CO', icon: 'wave' },
  { bg: ['#ffe066', '#ff7a3d'], lines: ['GROMMETS', 'SUNBLOCK'], sub: 'SPF 9000', icon: 'sun' },
  { bg: ['#7a5cff', '#ff5fa2'], lines: ['WAVE 88.1', 'SYNTH FM'], sub: 'SUNSETS ON REPEAT', icon: 'note' },
  { bg: ['#2ee6c8', '#7cf29a'], lines: ['SEAGLASS', 'RESORT'], sub: 'YOU DESERVE IT', icon: 'palm' },
  { bg: ['#1d3f66', '#3fa0ff'], lines: ['BLOCKSIDE', 'BANK'], sub: 'WE COUNT IT TWICE', icon: 'coin' },
  { bg: ['#ff3f5f', '#ff8ab8'], lines: ['CORAL', 'WHEEL'], sub: 'OPEN TILL 2AM', icon: 'wheel' },
  { bg: ['#ffffff', '#b8e4ff'], lines: ['VOTE', 'ALBA'], sub: 'CLEAN STREETS NOW', icon: 'star' },
];
// Ad backgrounds light enough to need dark lettering.
const LIGHT_AD_BG = ['#ffffff', '#ffe066', '#2ee6c8'];

// A small pixel icon drawn on a 2-pixel grid with its top-left at (x, y).
function drawIcon(g, kind, x, y) {
  const px = (dx, dy, w, h, c) => { g.fillStyle = c; g.fillRect(x + dx * 2, y + dy * 2, w * 2, h * 2); };
  if (kind === 'bottle') { px(3, 0, 2, 3, '#ffffff'); px(2, 3, 4, 9, '#3fbf4f'); px(2, 6, 4, 3, '#ffffff'); }
  if (kind === 'wave') { for (let i = 0; i < 4; i++) px(i * 2, 6 + (i % 2), 2, 2, '#ffffff'); px(0, 9, 8, 3, '#ffffff'); }
  if (kind === 'sun') { px(2, 2, 5, 5, '#fff6c8'); px(4, 0, 1, 1, '#fff6c8'); px(4, 8, 1, 1, '#fff6c8'); px(0, 4, 1, 1, '#fff6c8'); px(8, 4, 1, 1, '#fff6c8'); }
  if (kind === 'note') { px(5, 0, 1, 8, '#ffffff'); px(2, 7, 4, 3, '#ffffff'); px(5, 0, 3, 2, '#ffffff'); }
  if (kind === 'palm') { px(4, 3, 1, 9, '#b07a4a'); px(1, 1, 7, 2, '#2fbf4f'); px(0, 3, 2, 1, '#2fbf4f'); px(7, 3, 2, 1, '#2fbf4f'); }
  if (kind === 'coin') { px(1, 1, 7, 7, '#ffd23f'); px(4, 2, 1, 5, '#b07a00'); }
  if (kind === 'wheel') { px(1, 1, 7, 7, '#ffffff'); px(2, 2, 5, 5, '#ff3f5f'); px(4, 1, 1, 7, '#ffffff'); px(1, 4, 7, 1, '#ffffff'); px(2, 8, 1, 3, '#ffffff'); px(6, 8, 1, 3, '#ffffff'); }
  if (kind === 'star') { px(4, 0, 1, 2, '#ff3f5f'); px(1, 2, 7, 2, '#ff3f5f'); px(2, 4, 5, 2, '#ff3f5f'); px(2, 6, 2, 2, '#ff3f5f'); px(5, 6, 2, 2, '#ff3f5f'); }
}

function adAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  const rects = [];
  ADS.forEach((ad, i) => {
    const x = (i % 2) * 128, y = Math.floor(i / 2) * 64;
    const grd = g.createLinearGradient(x, y, x, y + 64);
    grd.addColorStop(0, ad.bg[0]); grd.addColorStop(1, ad.bg[1]);
    g.fillStyle = grd; g.fillRect(x, y, 128, 64);
    // Faint scanlines
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (let k = 0; k < 64; k += 8) g.fillRect(x, y + k, 128, 2);
    const ink = LIGHT_AD_BG.includes(ad.bg[0]) ? '#12061c' : '#ffffff';
    drawIcon(g, ad.icon, x + 6, y + 14);
    drawPixelText(g, ad.lines[0], x + 28, y + 8, 2, ink);
    drawPixelText(g, ad.lines[1], x + 28, y + 26, 2, ink);
    drawPixelText(g, ad.sub, x + 28, y + 48, 1, ink);
    // Dark frame
    g.fillStyle = '#12061c'; g.fillRect(x, y, 128, 2); g.fillRect(x, y + 62, 128, 2); g.fillRect(x, y, 2, 64); g.fillRect(x + 126, y, 2, 64);
    rects.push({ u0: x / 256, u1: (x + 128) / 256, v0: 1 - (y + 64) / 256, v1: 1 - y / 256 });
  });
  return { tex: atlasTexture(cv), rects };
}

// Alternating white / light-grey stripes; tinted by the awning's vertex colour.
function stripeTexture() {
  const cv = document.createElement('canvas');
  cv.width = 32; cv.height = 4;
  const g = cv.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#c8c8c8'; g.fillRect(i * 4, 0, 4, 4); }
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- quads with atlas UVs ------------------------------------------------------------------------
// Collects textured quads into one indexed BufferGeometry.
class Quads {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; }
  // centre c, right r (unit), up u (unit), normal n, size w x h, uv rect
  add(c, r, u, n, w, h, uv) {
    const s = this.pos.length / 3;
    for (const [a, b, uu, vv] of [[-1, -1, uv.u0, uv.v0], [1, -1, uv.u1, uv.v0], [1, 1, uv.u1, uv.v1], [-1, 1, uv.u0, uv.v1]]) {
      this.pos.push(c.x + r.x * a * w / 2 + u.x * b * h / 2, c.y + r.y * a * w / 2 + u.y * b * h / 2, c.z + r.z * a * w / 2 + u.z * b * h / 2);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(uu, vv);
    }
    this.idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    return m;
  }
}

// Street-facing sides of a footprint: those whose wall sits within `maxGap` of the block's road edge.
// Each face: n = outward normal [x, z], gap = distance to the road edge, a -> b = wall ends (left to right
// seen from the street).
export function streetFaces(x0, z0, x1, z1, maxGap = 6) {
  const bx = Math.floor(((x0 + x1) / 2) / CELL), bz = Math.floor(((z0 + z1) / 2) / CELL);
  const bx0 = bx * CELL + ROAD_W / 2, bz0 = bz * CELL + ROAD_W / 2, size = CELL - ROAD_W;
  const faces = [
    { n: [0, 1], gap: bz0 + size - z1, a: [x0, z1], b: [x1, z1] },
    { n: [0, -1], gap: z0 - bz0, a: [x1, z0], b: [x0, z0] },
    { n: [1, 0], gap: bx0 + size - x1, a: [x1, z1], b: [x1, z0] },
    { n: [-1, 0], gap: x0 - bx0, a: [x0, z0], b: [x0, z1] },
  ];
  return faces.filter((f) => f.gap < maxGap);
}

// shops: { name, x, z } on the sidewalk in front of each shop; boards / ads: the two atlas meshes.
export const storefronts = { shops: [], boards: null, ads: null };

// Build all shopfronts and billboards for the generated city under `parent`. Returns their group.
export function buildStorefronts(parent) {
  const r = makeRng(2024);
  const boards = boardAtlas(), ads = adAtlas();
  const boardMat = new THREE.MeshLambertMaterial({ map: boards.tex, emissiveMap: boards.tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 });
  const adMat = new THREE.MeshLambertMaterial({ map: ads.tex, emissiveMap: ads.tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 });
  city.glowMats.push(boardMat, adMat);
  const vc = new THREE.MeshLambertMaterial({ vertexColors: true });
  const awn = new THREE.MeshLambertMaterial({ map: stripeTexture(), vertexColors: true });
  const glow = registerGlow(new THREE.MeshBasicMaterial({ vertexColors: true }), 0.6, 2.6);
  const B = new Batcher().material('vc', vc).material('awn', awn).material('glow', glow);
  const boardQuads = new Quads(), adQuads = new Quads();
  const m = new THREE.Matrix4(), tilt = new THREE.Matrix4();
  let nameI = Math.floor(r() * SHOP_NAMES.length);

  // An axis-aligned box flat against a wall with tangent (tx, tz) and normal (nx, nz):
  // `along` wide along the wall, `depth` thick out from it.
  const wallBox = (key, x, y, z, along, h, depth, tx, tz, nx, nz, color) =>
    B.box(key, x, y, z, Math.abs(tx) * along + Math.abs(nx) * depth, h, Math.abs(tz) * along + Math.abs(nz) * depth, { color });

  for (const lot of city.lots) {
    if (!['deco', 'hotel', 'tower'].includes(lot.kind)) continue;
    for (const f of streetFaces(lot.x0, lot.z0, lot.x1, lot.z1)) {
      const L = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
      if (L < 9) continue;
      const tx = (f.b[0] - f.a[0]) / L, tz = (f.b[1] - f.a[1]) / L;
      const nx = f.n[0], nz = f.n[1];
      const count = L > 22 ? 3 : L > 13 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        if (r() < 0.12) continue;
        const along = (k + 0.5) * (L / count);
        const shopW = Math.min(L / count - 1.4, 5.5 + r() * 2);
        const wx = f.a[0] + tx * along, wz = f.a[1] + tz * along;
        const name = SHOP_NAMES[nameI++ % SHOP_NAMES.length];
        const rect = boards.rects[SHOP_NAMES.indexOf(name)];
        // Name board under the facade band, on a dark backing plate.
        const boardH = 0.72, boardW = Math.min(shopW, boardH * rect.aspect);
        boardQuads.add({ x: wx + nx * 0.07, y: 3.08, z: wz + nz * 0.07 }, { x: tx, y: 0, z: tz }, { x: 0, y: 1, z: 0 }, { x: nx, y: 0, z: nz }, boardW, boardH, rect);
        wallBox('vc', wx + nx * 0.03, 3.08, wz + nz * 0.03, boardW + 0.3, boardH + 0.24, 0.05, tx, tz, nx, nz, '#2a1a3a');
        // Striped awning sloping out over the sidewalk, with a valance along its front edge.
        const col = AWNING_COLS[Math.floor(r() * AWNING_COLS.length)];
        const yaw = Math.atan2(nx, nz);
        m.makeRotationY(yaw).multiply(tilt.makeRotationX(0.3)).setPosition(wx + nx * 0.8, 2.48, wz + nz * 0.8);
        B.box('awn', 0, 0, 0, shopW, 0.1, 1.7, { matrix: m, color: col });
        wallBox('awn', wx + nx * 1.6, 2.1, wz + nz * 1.6, shopW, 0.32, 0.06, tx, tz, nx, nz, col);
        // Shop window glow strip (lit after dark) and a door
        wallBox('glow', wx + nx * 0.06 - tx * shopW * 0.18, 1.35, wz + nz * 0.06 - tz * shopW * 0.18, shopW * 0.5, 1.3, 0.04, tx, tz, nx, nz, '#ffe8b0');
        wallBox('vc', wx + nx * 0.06 + tx * shopW * 0.3, 1.15, wz + nz * 0.06 + tz * shopW * 0.3, 1.2, 2.3, 0.05, tx, tz, nx, nz, '#3a2a4a');
        storefronts.shops.push({ name, x: wx + nx * 2, z: wz + nz * 2 });
      }
    }
  }

  // Rooftop billboards on low and mid-rise buildings, facing the street.
  let adI = 0;
  for (const b of city.buildings) {
    if (!['deco', 'hotel', 'warehouse'].includes(b.kind) || b.h > 26 || r() > 0.4) continue;
    const faces = streetFaces(b.cx - b.w / 2, b.cz - b.d / 2, b.cx + b.w / 2, b.cz + b.d / 2, 8);
    if (!faces.length) continue;
    const f = faces[0];
    const L = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
    const tx = (f.b[0] - f.a[0]) / L, tz = (f.b[1] - f.a[1]) / L;
    const nx = f.n[0], nz = f.n[1];
    // Board centre: set back 1.6 from the roof edge; W x H poster standing y0 above the ground.
    const mx = (f.a[0] + f.b[0]) / 2 - nx * 1.6, mz = (f.a[1] + f.b[1]) / 2 - nz * 1.6;
    const W = Math.min(L - 3, 11), H = W / 2, y0 = b.h + 1.6;
    const rect = ads.rects[adI++ % ADS.length];
    adQuads.add({ x: mx + nx * 0.16, y: y0 + H / 2 + 0.6, z: mz + nz * 0.16 }, { x: tx, y: 0, z: tz }, { x: 0, y: 1, z: 0 }, { x: nx, y: 0, z: nz }, W, H, rect);
    wallBox('vc', mx, y0 + H / 2 + 0.6, mz, W + 0.5, H + 0.5, 0.25, tx, tz, nx, nz, '#2a2a3a');
    // Two legs down to the roof, each with a lamp arm reaching out in front.
    for (const s of [-0.32, 0.32]) {
      B.box('vc', mx + tx * W * s - nx * 0.4, (b.h + y0 + 0.6) / 2, mz + tz * W * s - nz * 0.4, 0.35, y0 + 0.6 - b.h, 0.35, { color: '#5b6070' });
      B.box('vc', mx + tx * W * s + nx * 0.9, y0 + 0.3, mz + tz * W * s + nz * 0.9, Math.abs(nx) * 1.6 + 0.2, 0.15, Math.abs(nz) * 1.6 + 0.2, { color: '#5b6070' });
      B.box('glow', mx + tx * W * s + nx * 1.6, y0 + 0.45, mz + tz * W * s + nz * 1.6, 0.5, 0.25, 0.5, { color: '#fff3c0' });
    }
  }

  const group = new THREE.Group();
  group.add(B.build(true));
  storefronts.boards = boardQuads.mesh(boardMat);
  storefronts.ads = adQuads.mesh(adMat);
  group.add(storefronts.boards, storefronts.ads);
  parent.add(group);
  return group;
}
