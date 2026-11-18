// Time-of-day colour grade: drives the post pass (exposure, filmic tone curve, bloom strength/threshold,
// saturation, contrast, shadow lift / highlight gain tints, vignette colour, warm tint) from the clock, and
// scales every registered glow material so neon runs hot (>1) at night.
//
//   morning  : soft peach lift, slightly lower contrast, cool highlights
//   midday   : crisp, neutral, a touch of teal in the shadows (sea air)
//   golden   : warm amber gain, magenta shadows, heavier vignette
//   night    : violet shadows, cyan-pink highlights, neon bloom turned up, exposure pushed a little
import { post } from './post.js';
import { smokeLight } from './smoke.js';

const THREE = window.THREE;
const WARM = new THREE.Color('#ffc796'), NIGHT = new THREE.Color('#5a5a8a');

// Materials that glow: base colour scale by day and by night (values above 1 feed the bloom).
const hdrMats = [];
export function registerGlow(mat, day = 1, night = 2.4) { hdrMats.push({ mat, day, night }); return mat; }

const smooth = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const mix3 = (out, a, b, t) => { for (let i = 0; i < 3; i++) out[i] = a[i] + (b[i] - a[i]) * t; return out; };

// Grade looks: [lift rgb], [gain rgb], [vignette tint rgb], contrast, filmic, exposure
const LOOK = {
  morning: { lift: [0.03, 0.012, 0.0], gain: [1.0, 0.99, 1.02], vig: [0.55, 0.45, 0.5], contrast: 1.0, filmic: 0.45, exposure: 1.02 },
  day: { lift: [0.0, 0.012, 0.02], gain: [1.0, 1.0, 0.985], vig: [0.45, 0.5, 0.6], contrast: 1.05, filmic: 0.5, exposure: 1.0 },
  golden: { lift: [0.035, 0.0, 0.03], gain: [1.04, 0.985, 0.93], vig: [0.55, 0.22, 0.32], contrast: 1.06, filmic: 0.55, exposure: 1.02 },
  night: { lift: [0.012, 0.0, 0.045], gain: [0.98, 1.0, 1.04], vig: [0.2, 0.08, 0.32], contrast: 1.08, filmic: 0.6, exposure: 1.1 },
};
const tmp = { lift: [0, 0, 0], gain: [1, 1, 1], vig: [1, 1, 1] };

// Gentle by day, neon-soaked at night, warm and hazy at golden hour.
export function applyGrade(night, hour, hurt = 0) {
  const golden = Math.max(smooth(5, 6.5, hour) * (1 - smooth(7.5, 9.5, hour)), smooth(16, 17.8, hour) * (1 - smooth(19.6, 21, hour)));
  const morning = smooth(5, 6.5, hour) * (1 - smooth(8.5, 10.5, hour));
  post.threshold = 1.1 - night * 0.42 - golden * 0.12;
  post.bloom = 0.38 + night * 0.72 + golden * 0.12;
  post.sat = 1.12 + night * 0.08 + golden * 0.05;
  post.vignette = 0.28 + night * 0.14 + golden * 0.1;
  post.warm = golden * 0.9;
  // Blend the looks: day -> morning/golden -> night.
  const base = LOOK.day;
  const warmLook = morning > golden ? LOOK.morning : LOOK.golden;
  const wk = Math.max(morning, golden) * (1 - night);
  mix3(tmp.lift, base.lift, warmLook.lift, wk); mix3(tmp.lift, tmp.lift, LOOK.night.lift, night);
  mix3(tmp.gain, base.gain, warmLook.gain, wk); mix3(tmp.gain, tmp.gain, LOOK.night.gain, night);
  mix3(tmp.vig, base.vig, warmLook.vig, wk); mix3(tmp.vig, tmp.vig, LOOK.night.vig, night);
  post.lift = tmp.lift; post.gain = tmp.gain;
  // Taking damage bleeds the vignette red and adds lens fringing for a moment.
  post.vigTint = hurt > 0 ? mix3([0, 0, 0], tmp.vig, [0.9, 0.05, 0.08], Math.min(1, hurt)) : tmp.vig;
  post.aberr = hurt * 0.012;
  const lerp = (k) => base[k] + (warmLook[k] - base[k]) * wk + (LOOK.night[k] - (base[k] + (warmLook[k] - base[k]) * wk)) * night;
  post.contrast = lerp('contrast');
  post.filmic = lerp('filmic');
  post.exposure = lerp('exposure');
  // Smoke picks up the light: warm at golden hour, dim blue at night.
  smokeLight.setRGB(1, 1, 1).lerp(WARM, golden * 0.8).lerp(NIGHT, night * 0.8);
  for (const h of hdrMats) h.mat.color.setScalar(h.day + (h.night - h.day) * Math.max(night, golden * 0.45));
}
