// Time-of-day colour grade. Its one job: each frame, turn the clock (night / hour) and the player's pain
// level into settings for the post pass (exposure, filmic tone curve, bloom strength and threshold,
// saturation, contrast, shadow lift / highlight gain tints, vignette colour, warm tint), tint the smoke,
// and scale every registered glow material so neon runs hot (>1, feeding the bloom) after dark.
//
//   morning  : soft peach lift, slightly lower contrast, cool highlights
//   midday   : crisp, neutral, a touch of teal in the shadows (sea air)
//   golden   : warm amber gain, magenta shadows, heavier vignette
//   night    : violet shadows, cyan-pink highlights, neon bloom turned up, exposure pushed a little
import { post } from './post.js';
import { smokeLight } from './smoke.js';

const THREE = window.THREE;
const SMOKE_GOLDEN = new THREE.Color('#ffc796');
const SMOKE_NIGHT = new THREE.Color('#5a5a8a');
const HURT_VIGNETTE = [0.9, 0.05, 0.08];

// Materials that glow, each with its colour scale by day and by night.
const glowMaterials = [];

// Register a glowing material: its colour is scaled from `day` to `night` as the light fades
// (values above 1 push it past the bloom threshold). Returns the material for chaining.
export function registerGlow(mat, day = 1, night = 2.4) { glowMaterials.push({ mat, day, night }); return mat; }

// Hermite smoothstep of x between edges a and b.
const smooth = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
// Linear blend of two rgb triples into `out` (which may alias `a`).
const mix3 = (out, a, b, t) => { for (let i = 0; i < 3; i++) out[i] = a[i] + (b[i] - a[i]) * t; return out; };

// Grade looks: lift (shadow tint), gain (highlight tint), vig (vignette colour), contrast, filmic, exposure.
const LOOK = {
  morning: { lift: [0.03, 0.012, 0.0], gain: [1.0, 0.99, 1.02], vig: [0.55, 0.45, 0.5], contrast: 1.0, filmic: 0.45, exposure: 1.02 },
  day: { lift: [0.0, 0.012, 0.02], gain: [1.0, 1.0, 0.985], vig: [0.45, 0.5, 0.6], contrast: 1.05, filmic: 0.5, exposure: 1.0 },
  golden: { lift: [0.035, 0.0, 0.03], gain: [1.04, 0.985, 0.93], vig: [0.55, 0.22, 0.32], contrast: 1.06, filmic: 0.55, exposure: 1.02 },
  night: { lift: [0.012, 0.0, 0.045], gain: [0.98, 1.0, 1.04], vig: [0.2, 0.08, 0.32], contrast: 1.08, filmic: 0.6, exposure: 1.1 },
};
// Scratch triples for the blended look (post.lift / post.gain point at these).
const blended = { lift: [0, 0, 0], gain: [1, 1, 1], vig: [1, 1, 1] };

// Set the post pass for this moment: `night` 0..1 darkness, `hour` 0..24 clock, `hurt` 0..1 pain flash.
// Gentle by day, neon-soaked at night, warm and hazy at golden hour.
export function applyGrade(night, hour, hurt = 0) {
  const golden = Math.max(smooth(5, 6.5, hour) * (1 - smooth(7.5, 9.5, hour)), smooth(16, 17.8, hour) * (1 - smooth(19.6, 21, hour)));
  const morning = smooth(5, 6.5, hour) * (1 - smooth(8.5, 10.5, hour));
  post.threshold = 1.1 - night * 0.42 - golden * 0.12;
  post.bloom = 0.38 + night * 0.72 + golden * 0.12;
  post.sat = 1.12 + night * 0.08 + golden * 0.05;
  post.vignette = 0.28 + night * 0.14 + golden * 0.1;
  post.warm = golden * 0.9;
  // Blend the looks: day -> morning/golden (whichever is stronger) -> night.
  const base = LOOK.day;
  const warmLook = morning > golden ? LOOK.morning : LOOK.golden;
  const warmWeight = Math.max(morning, golden) * (1 - night);
  for (const key of ['lift', 'gain', 'vig']) {
    mix3(blended[key], base[key], warmLook[key], warmWeight);
    mix3(blended[key], blended[key], LOOK.night[key], night);
  }
  post.lift = blended.lift; post.gain = blended.gain;
  // Taking damage bleeds the vignette red and adds lens fringing for a moment.
  post.vigTint = hurt > 0 ? mix3([0, 0, 0], blended.vig, HURT_VIGNETTE, Math.min(1, hurt)) : blended.vig;
  post.aberr = hurt * 0.012;
  // Same day -> warm -> night blend for the scalar settings.
  const blendScalar = (key) => {
    const dayToWarm = base[key] + (warmLook[key] - base[key]) * warmWeight;
    return dayToWarm + (LOOK.night[key] - dayToWarm) * night;
  };
  post.contrast = blendScalar('contrast');
  post.filmic = blendScalar('filmic');
  post.exposure = blendScalar('exposure');
  // Smoke picks up the light: warm at golden hour, dim blue at night.
  smokeLight.setRGB(1, 1, 1).lerp(SMOKE_GOLDEN, golden * 0.8).lerp(SMOKE_NIGHT, night * 0.8);
  const glowMix = Math.max(night, golden * 0.45);
  for (const g of glowMaterials) g.mat.color.setScalar(g.day + (g.night - g.day) * glowMix);
}
