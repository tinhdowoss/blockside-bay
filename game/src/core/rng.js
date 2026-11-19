// Seeded random numbers (mulberry32) so screenshot scenes and the city layout are repeatable.
// One shared gameplay stream (setSeed/rand and helpers) plus makeRng() for private layout streams.

let state = 1;

// One mulberry32 step: advances a 32-bit state and returns [newState, value in 0..1).
function step(s) {
  const next = (s + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [next, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

/** Reseeds the shared gameplay stream (0 or junk falls back to 1). */
export function setSeed(seed) {
  state = (Number(seed) >>> 0) || 1;
}

/** Next value in 0..1 from the shared gameplay stream. */
export function rand() {
  let value;
  [state, value] = step(state);
  return value;
}

/** Float in [a, b). */
export const range = (a, b) => a + rand() * (b - a);
/** Integer in [a, b], both ends included. */
export const irange = (a, b) => Math.floor(range(a, b + 1));
/** Random element of arr. */
export const pick = (arr) => arr[Math.floor(rand() * arr.length)];
/** True with probability p. */
export const chance = (p) => rand() < p;

/** Independent generator for layout-only randomness (never disturbs the gameplay sequence). */
export function makeRng(seed) {
  let s = (seed >>> 0) || 7;
  return () => {
    let value;
    [s, value] = step(s);
    return value;
  };
}
