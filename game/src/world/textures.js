// Tiny pixel-art canvas textures (16x16 and friends) rendered with NearestFilter.
import { makeRng } from '../core/rng.js';
import { drawPixelText, textWidth } from '../ui/pixelfont.js';
import { shade } from '../data/cast.js';

const THREE = window.THREE;
const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTexture(cv, repeat = true) {
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function noise(ctx, w, h, base, amt, rnd, step = 1) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const v = (rnd() - 0.5) * amt;
    ctx.fillStyle = shade(base, v);
    ctx.fillRect(x, y, step, step);
  }
}

// Facade: 32x32 px covering two floors x two bays (8x8 world units). kind: deco | tower | house | warehouse
export function facadeTexture(pal, kind, seed) {
  return cached(`f${pal.wall}${kind}${seed}`, () => {
    const cv = canvas(32, 32), g = cv.getContext('2d'), rnd = makeRng(seed * 31 + 7);
    noise(g, 32, 32, pal.wall, 0.06, rnd);
    for (let fl = 0; fl < 2; fl++) {
      const y0 = fl * 16;
      if (kind === 'tower') {
        g.fillStyle = shade(pal.wall, -0.1); g.fillRect(0, y0 + 13, 32, 3);
        for (let b = 0; b < 4; b++) {
          g.fillStyle = '#5fa8d8'; g.fillRect(b * 8 + 1, y0 + 2, 6, 11);
          g.fillStyle = '#9fe0ff'; g.fillRect(b * 8 + 1, y0 + 2, 2, 11);
          g.fillStyle = '#3b7fb0'; g.fillRect(b * 8 + 5, y0 + 8, 2, 5);
        }
      } else if (kind === 'warehouse') {
        g.fillStyle = shade(pal.wall, -0.12);
        for (let x = 0; x < 32; x += 4) g.fillRect(x, y0, 1, 16);
        if (fl === 0) { g.fillStyle = '#5a6470'; g.fillRect(4, 4, 10, 6); g.fillRect(18, 4, 10, 6); }
      } else {
        // Art-deco: trim band, two windows per bay with sills, awnings on house
        g.fillStyle = pal.trim; g.fillRect(0, y0 + 14, 32, 2);
        g.fillStyle = pal.accent; g.fillRect(0, y0 + 15, 32, 1);
        for (let b = 0; b < 2; b++) {
          const x0 = b * 16;
          g.fillStyle = shade(pal.wall, -0.18); g.fillRect(x0 + 3, y0 + 3, 10, 9);
          g.fillStyle = '#3e9ad6'; g.fillRect(x0 + 4, y0 + 4, 8, 7);
          g.fillStyle = '#a6e8ff'; g.fillRect(x0 + 4, y0 + 4, 3, 3);
          g.fillStyle = pal.trim; g.fillRect(x0 + 7, y0 + 4, 1, 7); g.fillRect(x0 + 4, y0 + 7, 8, 1);
          g.fillStyle = pal.trim; g.fillRect(x0 + 2, y0 + 12, 12, 1);
          if (kind === 'house') { g.fillStyle = pal.accent; g.fillRect(x0 + 2, y0 + 2, 12, 2); g.fillStyle = '#ffffff'; for (let k = 0; k < 12; k += 4) g.fillRect(x0 + 2 + k, y0 + 2, 2, 2); }
          // Deco vertical fin between bays
          g.fillStyle = shade(pal.wall, 0.25); g.fillRect(x0 + 15, y0, 1, 14);
        }
      }
    }
    return toTexture(cv);
  });
}

// Night glow map: same layout as facade, windows randomly lit warm or neon.
export function facadeGlowTexture(kind, seed) {
  return cached(`g${kind}${seed}`, () => {
    const cv = canvas(32, 32), g = cv.getContext('2d'), rnd = makeRng(seed * 13 + 3);
    g.fillStyle = '#000'; g.fillRect(0, 0, 32, 32);
    const lit = ['#ffd27a', '#ffe9b0', '#ff9be0', '#9fe8ff'];
    for (let fl = 0; fl < 2; fl++) {
      const y0 = fl * 16;
      if (kind === 'tower') {
        for (let b = 0; b < 4; b++) if (rnd() < 0.55) { g.fillStyle = lit[Math.floor(rnd() * 4)]; g.fillRect(b * 8 + 1, y0 + 2, 6, 11); }
      } else if (kind === 'warehouse') {
        if (fl === 0 && rnd() < 0.5) { g.fillStyle = '#ffd27a'; g.fillRect(4, 4, 10, 6); }
      } else {
        for (let b = 0; b < 2; b++) if (rnd() < 0.6) { g.fillStyle = lit[Math.floor(rnd() * 4)]; g.fillRect(b * 16 + 4, y0 + 4, 8, 7); }
        g.fillStyle = '#ff5fd0'; if (kind === 'deco' && fl === 1) g.fillRect(0, y0 + 15, 32, 1);
      }
    }
    return toTexture(cv);
  });
}

export function roofTexture() {
  return cached('roof', () => {
    const cv = canvas(16, 16), g = cv.getContext('2d');
    noise(g, 16, 16, '#d8d2c8', 0.12, makeRng(5));
    g.fillStyle = '#bdb5a8'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 0, 1, 16);
    return toTexture(cv);
  });
}

// Road: one tile spans the 12-unit width; dashed yellow centre, white edges.
export function roadTexture() {
  return cached('road', () => {
    const cv = canvas(16, 16), g = cv.getContext('2d');
    noise(g, 16, 16, '#4a4d57', 0.14, makeRng(9));
    g.fillStyle = '#f2f2f2'; g.fillRect(1, 0, 1, 16); g.fillRect(14, 0, 1, 16);
    g.fillStyle = '#ffd23f'; g.fillRect(7, 2, 2, 8);
    return toTexture(cv);
  });
}

export function intersectionTexture() {
  return cached('cross', () => {
    const cv = canvas(16, 16), g = cv.getContext('2d');
    noise(g, 16, 16, '#4a4d57', 0.14, makeRng(19));
    g.fillStyle = '#f4f4f4';
    for (let i = 1; i < 15; i += 2) { g.fillRect(i, 0, 1, 2); g.fillRect(i, 14, 1, 2); g.fillRect(0, i, 2, 1); g.fillRect(14, i, 2, 1); }
    return toTexture(cv);
  });
}

export function sidewalkTexture() {
  return cached('walk', () => {
    const cv = canvas(16, 16), g = cv.getContext('2d');
    noise(g, 16, 16, '#f0dccf', 0.08, makeRng(4));
    g.fillStyle = '#d8bfb0'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 0, 1, 16); g.fillRect(8, 0, 1, 16); g.fillRect(0, 8, 16, 1);
    return toTexture(cv);
  });
}

export function plazaTexture() {
  return cached('plaza', () => {
    const cv = canvas(16, 16), g = cv.getContext('2d');
    for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x += 4) {
      g.fillStyle = ((x + y) / 4) % 2 ? '#ffffff' : '#ffb3d1'; g.fillRect(x, y, 4, 4);
    }
    return toTexture(cv);
  });
}

export function grassTexture() {
  return cached('grass', () => {
    const cv = canvas(16, 16), g = cv.getContext('2d'), r = makeRng(11);
    noise(g, 16, 16, '#5fd46a', 0.18, r);
    g.fillStyle = '#86ec7a'; for (let i = 0; i < 10; i++) g.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 1, 1);
    return toTexture(cv);
  });
}

export function sandTexture() {
  return cached('sand', () => {
    const cv = canvas(16, 16), g = cv.getContext('2d');
    noise(g, 16, 16, '#ffe2a8', 0.1, makeRng(12));
    return toTexture(cv);
  });
}

export function waterTexture() {
  return cached('water', () => {
    const cv = canvas(16, 16), g = cv.getContext('2d'), r = makeRng(13);
    noise(g, 16, 16, '#1fb6d6', 0.08, r);
    g.fillStyle = '#7ff0ff';
    for (let i = 0; i < 6; i++) { const x = Math.floor(r() * 14), y = Math.floor(r() * 16); g.fillRect(x, y, 3, 1); }
    return toTexture(cv);
  });
}

export function woodTexture() {
  return cached('wood', () => {
    const cv = canvas(16, 16), g = cv.getContext('2d');
    noise(g, 16, 16, '#b07a4a', 0.12, makeRng(14));
    g.fillStyle = '#7d5230'; for (let y = 0; y < 16; y += 4) g.fillRect(0, y, 16, 1);
    return toTexture(cv);
  });
}

export function barkTexture() {
  return cached('bark', () => {
    const cv = canvas(16, 16), g = cv.getContext('2d');
    noise(g, 16, 16, '#9a6a3e', 0.1, makeRng(15));
    g.fillStyle = '#6e4626'; for (let y = 0; y < 16; y += 3) g.fillRect(0, y, 16, 1);
    return toTexture(cv);
  });
}

export function leafTexture() {
  return cached('leaf', () => {
    const cv = canvas(16, 16), g = cv.getContext('2d');
    noise(g, 16, 16, '#2fbf4f', 0.2, makeRng(16));
    g.fillStyle = '#1e8f3a'; g.fillRect(7, 0, 2, 16);
    return toTexture(cv);
  });
}

// Neon sign: pixel-font text in a bright colour on a dark backing; used as map + emissive.
export function neonSignTexture(text, color) {
  return cached(`n${text}${color}`, () => {
    const w = textWidth(text) + 6, h = 13;
    const cv = canvas(w, h), g = cv.getContext('2d');
    g.fillStyle = '#1a0d26'; g.fillRect(0, 0, w, h);
    g.fillStyle = color; g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1); g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h);
    drawPixelText(g, text, 3, 3, 1, '#ffffff');
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.35; g.fillStyle = color; g.fillRect(0, 0, w, h);
    const t = toTexture(cv, false);
    t.userData = { aspect: w / h };
    return t;
  });
}

// Soft round glow used for headlights, neon halos and the spotlight pool.
export function glowTexture(color = '#ffffff') {
  return cached(`glow${color}`, () => {
    const cv = canvas(64, 64), g = cv.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, color); grd.addColorStop(0.35, color + 'aa'); grd.addColorStop(1, color + '00');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

export function cloudTexture() {
  return cached('cloud', () => {
    const cv = canvas(16, 16), g = cv.getContext('2d');
    noise(g, 16, 16, '#ffffff', 0.05, makeRng(17));
    return toTexture(cv);
  });
}
