// Time-of-day colour grade: drives the post pass (bloom strength/threshold, saturation, vignette, warm
// tint) from the clock, and scales every registered glow material so neon runs hot (>1) at night.
import { post } from './post.js';
import { smokeLight } from './smoke.js';

const WARM = new window.THREE.Color('#ffc796'), NIGHT = new window.THREE.Color('#5a5a8a');

// Materials that glow: base colour scale by day and by night (values above 1 feed the bloom).
const hdrMats = [];
export function registerGlow(mat, day = 1, night = 2.4) { hdrMats.push({ mat, day, night }); return mat; }

const smooth = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

// Gentle by day, neon-soaked at night, warm and hazy at golden hour.
export function applyGrade(night, hour) {
  const golden = Math.max(smooth(5, 6.5, hour) * (1 - smooth(7.5, 9.5, hour)), smooth(16, 17.8, hour) * (1 - smooth(19.6, 21, hour)));
  post.threshold = 1.1 - night * 0.42 - golden * 0.12;
  post.bloom = 0.38 + night * 0.72 + golden * 0.12;
  post.sat = 1.14 + night * 0.08 + golden * 0.06;
  post.vignette = 0.28 + night * 0.14 + golden * 0.1;
  post.warm = golden * 0.9;
  // Smoke picks up the light: warm at golden hour, dim blue at night.
  smokeLight.setRGB(1, 1, 1).lerp(WARM, golden * 0.8).lerp(NIGHT, night * 0.8);
  for (const h of hdrMats) h.mat.color.setScalar(h.day + (h.night - h.day) * Math.max(night, golden * 0.45));
}
