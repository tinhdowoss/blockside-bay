// The people of BLOCKSIDE BAY and their 16x16 pixel portraits.

export const CAST = {
  kai: { name: 'KAI NAVARRO', role: 'Wheelman', skin: '#c98a5e', hair: '#2a1a12', hairStyle: 'short', shirt: '#ff4fa3', eyes: '#1b1b1b', extra: 'stubble' },
  jolie: { name: 'JOLIE BANKS', role: 'Partner', skin: '#8d5a3b', hair: '#1a0f0a', hairStyle: 'curls', shirt: '#2ee6c8', eyes: '#1b1b1b', extra: 'hoops' },
  mari: { name: 'MARI VEGA', role: 'Planner', skin: '#e0a77a', hair: '#7a2a1a', hairStyle: 'bob', shirt: '#ffd23f', eyes: '#2b1b0b', extra: 'shades' },
  teddy: { name: 'TEDDY BRIX', role: 'Muscle', skin: '#6b4430', hair: '#111111', hairStyle: 'bald', shirt: '#7a5cff', eyes: '#1b1b1b', extra: 'beard' },
  dez: { name: 'DEZ OKORO', role: 'Hacker', skin: '#a8714c', hair: '#3fd0ff', hairStyle: 'spike', shirt: '#222a3a', accent: '#3fd0ff', eyes: '#1b1b1b', extra: 'visor' },
  pia: { name: 'PIA SOLANO', role: 'Lookout', skin: '#f1c7a0', hair: '#ff8fd0', hairStyle: 'bob', shirt: '#ff7a3d', eyes: '#1b1b1b', extra: 'freckles' },
  ocampo: { name: 'RICO OCAMPO', role: 'Neon Vipers boss', skin: '#d29a6a', hair: '#0d0d0d', hairStyle: 'slick', shirt: '#a020f0', eyes: '#c00000', extra: 'scar' },
  gus: { name: 'AUGUSTINE SALT', role: 'Saltwater Kings', skin: '#f1c7a0', hair: '#e8e8e8', hairStyle: 'slick', shirt: '#f4f4f4', eyes: '#2a4a8a', extra: 'shades' },
  dispatch: { name: 'BBPD DISPATCH', role: 'Police radio', skin: '#3a4a6a', hair: '#1a2440', hairStyle: 'cap', shirt: '#1d3c8f', eyes: '#ffffff', extra: 'headset' },
};

export const CREW = ['kai', 'jolie', 'mari', 'teddy', 'dez', 'pia'];

// Paints a portrait into a 16x16 area of ctx at (ox, oy) with pixel size s.
export function paintPortrait(ctx, id, ox = 0, oy = 0, s = 1, bg = null) {
  const c = CAST[id];
  const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(ox + x * s, oy + y * s, w * s, h * s); };
  if (bg) px(0, 0, 16, 16, bg);
  // Shoulders + shirt
  px(2, 13, 12, 3, c.shirt);
  px(6, 13, 4, 1, shade(c.shirt, -0.25));
  // Neck and head
  px(6, 11, 4, 2, shade(c.skin, -0.15));
  px(4, 3, 8, 9, c.skin);
  px(4, 10, 8, 2, shade(c.skin, -0.08));
  // Ears
  px(3, 6, 1, 3, shade(c.skin, -0.1));
  px(12, 6, 1, 3, shade(c.skin, -0.1));
  // Hair
  switch (c.hairStyle) {
    case 'short': px(4, 2, 8, 2, c.hair); px(4, 4, 1, 2, c.hair); px(11, 4, 1, 2, c.hair); break;
    case 'curls': px(3, 1, 10, 3, c.hair); px(2, 3, 2, 6, c.hair); px(12, 3, 2, 6, c.hair); px(5, 4, 2, 1, c.hair); break;
    case 'bob': px(3, 2, 10, 2, c.hair); px(3, 4, 2, 6, c.hair); px(11, 4, 2, 6, c.hair); px(5, 4, 4, 1, c.hair); break;
    case 'bald': px(4, 3, 8, 1, shade(c.skin, 0.12)); break;
    case 'spike': px(4, 2, 8, 2, c.hair); px(5, 0, 1, 2, c.hair); px(8, 0, 1, 2, c.hair); px(10, 1, 1, 1, c.hair); break;
    case 'slick': px(4, 2, 8, 2, c.hair); px(4, 4, 2, 1, c.hair); px(11, 4, 1, 3, c.hair); break;
    case 'cap': px(3, 2, 10, 2, c.hair); px(10, 4, 4, 1, c.hair); break;
    default: break;
  }
  // Eyes, brows, nose, mouth
  px(5, 6, 2, 1, '#ffffff'); px(9, 6, 2, 1, '#ffffff');
  px(6, 6, 1, 1, c.eyes); px(9, 6, 1, 1, c.eyes);
  px(5, 5, 2, 1, shade(c.hair, 0.1)); px(9, 5, 2, 1, shade(c.hair, 0.1));
  px(7, 8, 2, 1, shade(c.skin, -0.2));
  px(6, 10, 4, 1, '#7a2a2a');
  switch (c.extra) {
    case 'stubble': px(5, 9, 6, 1, shade(c.skin, -0.25)); px(5, 11, 6, 1, shade(c.skin, -0.25)); break;
    case 'hoops': px(3, 9, 1, 2, '#ffd23f'); px(12, 9, 1, 2, '#ffd23f'); break;
    case 'shades': px(4, 5, 8, 2, '#111111'); px(5, 5, 1, 1, '#ff5fa2'); px(9, 5, 1, 1, '#ff5fa2'); break;
    case 'beard': px(4, 9, 8, 3, '#1a1a1a'); px(6, 10, 4, 1, '#7a2a2a'); break;
    case 'visor': px(4, 5, 8, 2, '#3fd0ff'); px(5, 5, 2, 1, '#bff4ff'); break;
    case 'scar': px(10, 4, 1, 4, '#ffffff'); px(5, 9, 6, 1, shade(c.skin, -0.25)); break;
    case 'freckles': px(5, 8, 1, 1, '#c9805a'); px(10, 8, 1, 1, '#c9805a'); px(6, 9, 1, 1, '#c9805a'); px(9, 9, 1, 1, '#c9805a'); break;
    case 'headset': px(3, 4, 1, 5, '#222'); px(12, 4, 1, 5, '#222'); px(11, 9, 2, 1, '#222'); break;
    default: break;
  }
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  r = f(r); g = f(g); b = f(b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

const portraitCache = {};
// A data URL portrait sized for <img> with image-rendering: pixelated.
export function portraitURL(id, bg = '#2b1840') {
  const key = id + bg;
  if (!portraitCache[key]) {
    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = 16;
    paintPortrait(cv.getContext('2d'), id, 0, 0, 1, bg);
    portraitCache[key] = cv.toDataURL();
  }
  return portraitCache[key];
}
