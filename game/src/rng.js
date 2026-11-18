// Seeded random numbers (mulberry32) so screenshot scenes and the city layout are repeatable.

let state = 1;

export function setSeed(seed) {
  state = (Number(seed) >>> 0) || 1;
}

export function rand() {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const range = (a, b) => a + rand() * (b - a);
export const irange = (a, b) => Math.floor(range(a, b + 1));
export const pick = (arr) => arr[Math.floor(rand() * arr.length)];
export const chance = (p) => rand() < p;

// Independent generator for layout-only randomness (never disturbs gameplay sequence).
export function makeRng(seed) {
  let s = (seed >>> 0) || 7;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
