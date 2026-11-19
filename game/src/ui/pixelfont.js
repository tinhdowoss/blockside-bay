// A 5x7 bitmap font of our own, used for the blocky logo, neon signs and the city map labels.
// Each glyph is 7 rows; each row is a 5-bit mask with the leftmost pixel in the highest bit.

const G = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
  3: [30, 1, 1, 14, 1, 1, 30], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0], '-': [0, 0, 0, 31, 0, 0, 0], '!': [4, 4, 4, 4, 4, 0, 4],
  '.': [0, 0, 0, 0, 0, 0, 4], "'": [4, 4, 0, 0, 0, 0, 0], '/': [1, 1, 2, 4, 8, 16, 16],
  '&': [12, 18, 20, 8, 21, 18, 13], '$': [4, 15, 20, 14, 5, 30, 4], '+': [0, 4, 4, 31, 4, 4, 0],
  ':': [0, 0, 4, 0, 4, 0, 0], '*': [0, 21, 14, 31, 14, 21, 0], '?': [14, 17, 1, 2, 4, 0, 4],
};

export const GLYPH_W = 5;
export const GLYPH_H = 7;

/** Width in pixels of text drawn at scale with gap blank columns between glyphs. */
export function textWidth(text, scale = 1, gap = 1) {
  return text.length ? (text.length * (GLYPH_W + gap) - gap) * scale : 0;
}

/** Draws text with square pixels (unknown characters draw as '?'); returns the width drawn. */
export function drawPixelText(ctx, text, x, y, scale, color, gap = 1) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const rows = G[ch] || G['?'];
    for (let r = 0; r < GLYPH_H; r++) {
      for (let c = 0; c < GLYPH_W; c++) {
        if (rows[r] & (1 << (GLYPH_W - 1 - c))) ctx.fillRect(cx + c * scale, y + r * scale, scale, scale);
      }
    }
    cx += (GLYPH_W + gap) * scale;
  }
  return cx - x - gap * scale;
}

/** Chunky extruded text: a dark 3D side, an outline and a two-tone face (top colour, bottom colour). */
export function drawBlockyTitle(ctx, text, x, y, scale, top, bottom, side = '#3a0d4a', depth = 4) {
  for (let d = depth; d >= 1; d--) drawPixelText(ctx, text, x + d * scale * 0.5, y + d * scale * 0.5, scale, side);
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    drawPixelText(ctx, text, x + ox * scale * 0.35, y + oy * scale * 0.35, scale, '#1a0526');
  }
  const face = ctx.createLinearGradient(0, y, 0, y + GLYPH_H * scale);
  face.addColorStop(0, top);
  face.addColorStop(0.55, top);
  face.addColorStop(0.56, bottom);
  face.addColorStop(1, bottom);
  drawPixelText(ctx, text, x, y, scale, face);
}
