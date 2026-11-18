// Sound effects, all synthesised: weapons (crack + body + thump, with a reverb tail and an echo off the
// buildings), punches, crashes, explosions, horn, reload/dry-fire clicks, coins, doors, UI clicks and
// hovers, wanted stingers. Sounds that happen somewhere in the world are placed with distance
// attenuation, air absorption (low-pass) and stereo pan relative to the camera.
//
// Continuous voices: the player's engine (5 gears matching the HUD rev bar, load from the throttle,
// a dip and pitch drop on every upshift, off-throttle burble), tyre screech, and the nearest police
// siren (wail far away, yelp up close) with distance gain, stereo pan and a doppler pitch shift from
// the relative velocity of the car and the listener.
import { mix, tone, noise, midi } from './mixer.js';

const L = { x: 0, z: 0, rx: 1, rz: 0, vx: 0, vz: 0 }; // listener: position, right vector, velocity
export const listener = L;

export function setListener(x, z, yaw, dt) {
  if (dt > 0) { L.vx = (x - L.x) / dt; L.vz = (z - L.z) / dt; if (Math.hypot(L.vx, L.vz) > 120) L.vx = L.vz = 0; }
  L.x = x; L.z = z;
  // Camera looks along (sin yaw, cos yaw); its right-hand side is (-cos yaw, sin yaw).
  L.rx = -Math.cos(yaw); L.rz = Math.sin(yaw);
}

// Volume / pan / cutoff for a sound at (x, z).
export function place(x, z, ref = 14, max = 220) {
  if (x == null) return { vol: 1, pan: 0, lp: 18000 };
  const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
  if (d > max) return { vol: 0, pan: 0, lp: 400 };
  const vol = 1 / (1 + Math.pow(d / ref, 1.6));
  const pan = d < 0.5 ? 0 : Math.max(-0.9, Math.min(0.9, (dx * L.rx + dz * L.rz) / d));
  return { vol, pan, lp: Math.max(500, 16000 - d * 90), d };
}

// ---- weapons and impacts ---------------------------------------------------------------------------
const WPN = {
  pistol: { crack: 0.55, body: 0.6, bodyF: 900, bodyT: 0.16, thump: 120, len: 0.5 },
  smg: { crack: 0.4, body: 0.45, bodyF: 1300, bodyT: 0.09, thump: 150, len: 0.3 },
  pump: { crack: 0.6, body: 0.9, bodyF: 600, bodyT: 0.3, thump: 80, len: 0.9 },
  npc: { crack: 0.45, body: 0.5, bodyF: 1000, bodyT: 0.14, thump: 130, len: 0.45 },
  lance: { crack: 0.15, body: 0.75, bodyF: 420, bodyT: 0.22, thump: 60, len: 0.6 },
};
export function gunshot(kind = 'pistol', x, z, mine = true) {
  if (!mix.ac) return;
  const w = WPN[kind] || WPN.pistol;
  const p = mine ? { vol: 1, pan: 0, lp: 18000, d: 0 } : place(x, z, 18, 260);
  if (p.vol < 0.01) return;
  const t = mix.ac.currentTime, v = p.vol * (mine ? 1 : 0.7);
  // Distant shots lose their crack and gain more room.
  const rev = mine ? 0.45 : 0.45 + Math.min(0.5, (p.d || 0) / 120);
  noise(t, 0.04, w.crack * v, Math.min(p.lp, 2400), { pan: p.pan, rev: rev * 0.6 });
  noise(t, w.bodyT, w.body * v, Math.min(p.lp, w.bodyF), { ftype: 'lowpass', pan: p.pan, rev, dly: mine ? 0.18 : 0.08 });
  tone('sine', w.thump, t, 0.14, 0.45 * v, { glide: 45, pan: p.pan });
  if (kind === 'pump') noise(t + 0.32, 0.05, 0.25 * v, 1500, { ftype: 'bandpass', q: 2, pan: p.pan }); // rack
  if (kind === 'lance') tone('sawtooth', 900, t, 0.25, 0.08 * v, { glide: 180, filter: 2400, pan: p.pan, rev: 0.3 }); // cable whine
}

// Crosshair hit tick: higher and brighter for headshots, a double tick for a takedown.
export function hitTick(head = false, kill = false) {
  if (!mix.ac) return;
  const t = mix.ac.currentTime, f = head ? 2400 : 1700;
  tone('square', f, t, 0.04, 0.05, { bus: mix.ui, filter: 5000 });
  if (kill) tone('square', f * 1.5, t + 0.05, 0.05, 0.05, { bus: mix.ui, filter: 5000 });
}
export function punch() { if (mix.ac) { const t = mix.ac.currentTime; noise(t, 0.09, 0.55, 500, { ftype: 'lowpass' }); tone('sine', 90, t, 0.1, 0.4, { glide: 50 }); } }
export function crash(impact, x, z) {
  if (!mix.ac) return;
  const p = place(x, z, 16);
  const t = mix.ac.currentTime, v = Math.min(1, impact / 20) * p.vol;
  if (v < 0.02) return;
  noise(t, 0.4, v, Math.min(p.lp, 1100), { ftype: 'lowpass', pan: p.pan, rev: 0.3 });
  tone('sawtooth', 70, t, 0.22, 0.22 * v, { glide: 40, pan: p.pan });
  // Glass and panel rattle
  for (let k = 0; k < 4; k++) noise(t + 0.03 + k * 0.035 * Math.random(), 0.05, 0.12 * v, 5000 + Math.random() * 3000, { ftype: 'bandpass', q: 6, pan: p.pan });
}
export function boom(x, z) {
  if (!mix.ac) return;
  const p = place(x, z, 40, 600);
  const t = mix.ac.currentTime;
  noise(t, 1.6, p.vol, 260, { ftype: 'lowpass', pan: p.pan, rev: 0.8, dly: 0.2, pink: true });
  noise(t, 0.12, 0.6 * p.vol, Math.min(p.lp, 3000), { pan: p.pan });
  tone('sine', 55, t, 1.0, 0.7 * p.vol, { glide: 30, pan: p.pan });
}
export function horn() { if (mix.ac) { const t = mix.ac.currentTime; tone('square', 392, t, 0.5, 0.07, { filter: 1500, hold: 0.35, rev: 0.2 }); tone('square', 494, t, 0.5, 0.05, { filter: 1500, hold: 0.35 }); } }
export function reloadSfx() { if (mix.ac) { const t = mix.ac.currentTime; noise(t, 0.03, 0.3, 2500, { ftype: 'bandpass', q: 3 }); noise(t + 0.22, 0.04, 0.35, 1800, { ftype: 'bandpass', q: 3 }); } }
export function dryFire() { if (mix.ac) noise(mix.ac.currentTime, 0.02, 0.3, 3500, { ftype: 'bandpass', q: 4 }); }
export function hurtSfx() { if (mix.ac) { const t = mix.ac.currentTime; tone('sine', 140, t, 0.18, 0.4, { glide: 60 }); noise(t, 0.08, 0.3, 700, { ftype: 'lowpass' }); } }
export function door(close = true) { if (mix.ac) { const t = mix.ac.currentTime; noise(t, 0.08, 0.4, close ? 400 : 900, { ftype: 'lowpass' }); tone('sine', close ? 75 : 110, t, 0.09, 0.3); } }
export function coin() { if (mix.ac) { const t = mix.ac.currentTime; tone('square', midi(88), t, 0.08, 0.05, { bus: mix.ui, filter: 5000 }); tone('square', midi(93), t + 0.07, 0.25, 0.05, { bus: mix.ui, filter: 5000, dly: 0.2 }); } }
export function stinger(up = true) {
  if (!mix.ac) return;
  const t = mix.ac.currentTime;
  if (up) { tone('sawtooth', midi(50), t, 0.5, 0.06, { filter: 900, fenv: 2400, rev: 0.4 }); tone('sawtooth', midi(56), t, 0.5, 0.05, { filter: 900, fenv: 2400 }); }
  else [62, 66, 69, 74].forEach((n, i) => tone('triangle', midi(n), t + i * 0.07, 0.6, 0.07, { bus: mix.ui, rev: 0.4 }));
}

// ---- UI --------------------------------------------------------------------------------------------
export function blip(f = 660) { if (mix.ac) tone('square', f, mix.ac.currentTime, 0.07, 0.06, { bus: mix.ui, filter: 3500 }); }
export function uiClick() { if (mix.ac) { const t = mix.ac.currentTime; tone('square', 880, t, 0.05, 0.05, { bus: mix.ui, filter: 3000 }); tone('sine', 1320, t + 0.03, 0.06, 0.04, { bus: mix.ui }); } }
export function uiHover() { if (mix.ac) tone('sine', 1500, mix.ac.currentTime, 0.04, 0.025, { bus: mix.ui }); }
// Menu open (rising) / close (falling) swoosh: a filtered noise sweep with a soft tone under it.
export function uiSwoosh(open = true) {
  if (!mix.ac) return;
  const t = mix.ac.currentTime;
  noise(t, 0.16, 0.18, open ? 1400 : 2600, { ftype: 'bandpass', q: 1.5, bus: mix.ui });
  tone('triangle', open ? 440 : 660, t, 0.16, 0.05, { bus: mix.ui, glide: open ? 660 : 440, rev: 0.2 });
}
// Settings slider tick: pitch follows the value (0..1).
export function uiTick(v = 0.5) { if (mix.ac) tone('square', 440 + v * 660, mix.ac.currentTime, 0.05, 0.05, { bus: mix.ui, filter: 3000 }); }
export function jingle(ok = true) {
  if (!mix.ac) return;
  const t = mix.ac.currentTime, notes = ok ? [72, 76, 79, 84] : [67, 63, 60];
  notes.forEach((n, i) => tone('square', midi(n), t + i * 0.12, 0.3, 0.1, { bus: mix.ui, filter: 3000, rev: 0.3 }));
  if (ok) tone('triangle', midi(60), t + 0.36, 0.9, 0.08, { bus: mix.ui, rev: 0.4 });
}
export function checkpointSfx(last = false) {
  if (!mix.ac) return;
  const t = mix.ac.currentTime;
  tone('square', midi(last ? 84 : 79), t, 0.12, 0.06, { bus: mix.ui, filter: 4000 });
  tone('square', midi(last ? 91 : 86), t + 0.08, 0.2, 0.06, { bus: mix.ui, filter: 4000, dly: 0.2 });
}

// ---- continuous voices -----------------------------------------------------------------------------
let eng = null, scr = null, sir = null, wind = null;
function build() {
  const ac = mix.ac;
  // Engine: saw fundamental + square sub + detuned saw an octave up -> load filter -> gain
  const o1 = ac.createOscillator(), o2 = ac.createOscillator(), o3 = ac.createOscillator();
  o1.type = 'sawtooth'; o2.type = 'square'; o3.type = 'sawtooth'; o3.detune.value = 9;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400; f.Q.value = 2.5;
  const g = ac.createGain(); g.gain.value = 0;
  const g2 = ac.createGain(); g2.gain.value = 0.5; const g3 = ac.createGain(); g3.gain.value = 0.25;
  o1.connect(f); o2.connect(g2); g2.connect(f); o3.connect(g3); g3.connect(f); f.connect(g); g.connect(mix.sfx);
  // Intake rumble: noise through a band-pass that tracks rpm
  const rn = ac.createBufferSource(); rn.buffer = mix.pinkBuf; rn.loop = true;
  const rf = ac.createBiquadFilter(); rf.type = 'bandpass'; rf.Q.value = 1.4; rf.frequency.value = 200;
  const rg = ac.createGain(); rg.gain.value = 0;
  rn.connect(rf); rf.connect(rg); rg.connect(mix.sfx);
  [o1, o2, o3, rn].forEach((n) => n.start());
  eng = { o1, o2, o3, f, g, rf, rg, gear: 0, dip: 0, pop: 0 };
  // Tyre screech: noise through a resonant band-pass
  const sn = ac.createBufferSource(); sn.buffer = mix.noiseBuf; sn.loop = true;
  const sf = ac.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 2100; sf.Q.value = 7;
  const sg = ac.createGain(); sg.gain.value = 0;
  sn.connect(sf); sf.connect(sg); sg.connect(mix.sfx); sn.start();
  scr = { g: sg, f: sf };
  // Siren: two saws an octave apart, wail/yelp LFO on frequency, doppler via detune, distance
  // low-pass, stereo panner and a reverb send so it bounces off the blocks.
  const so = ac.createOscillator(), so2 = ac.createOscillator(); so.type = 'sawtooth'; so2.type = 'square';
  so.frequency.value = 900; so2.frequency.value = 450;
  const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.type = 'triangle'; lfo.frequency.value = 0.35; lg.gain.value = 380;
  lfo.connect(lg); lg.connect(so.frequency);
  const lg2 = ac.createGain(); lg2.gain.value = 190; lg.connect(lg2); lg2.connect(so2.frequency);
  const sl = ac.createBiquadFilter(); sl.type = 'lowpass'; sl.frequency.value = 3000;
  const sm = ac.createGain(); sm.gain.value = 0.35; so2.connect(sm);
  const sgn = ac.createGain(); sgn.gain.value = 0;
  so.connect(sl); sm.connect(sl); sl.connect(sgn);
  const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
  if (pan) { sgn.connect(pan); pan.connect(mix.sfx); } else sgn.connect(mix.sfx);
  const srev = ac.createGain(); srev.gain.value = 0.3; (pan || sgn).connect(srev); srev.connect(mix.sfx.rev);
  [so, so2, lfo].forEach((n) => n.start());
  sir = { o: [so, so2], lfo, lg, lg2, f: sl, g: sgn, pan, prevD: null };
  // Wind rush at speed
  const wn = ac.createBufferSource(); wn.buffer = mix.pinkBuf; wn.loop = true;
  const wf = ac.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 700; wf.Q.value = 0.5;
  const wg = ac.createGain(); wg.gain.value = 0;
  wn.connect(wf); wf.connect(wg); wg.connect(mix.amb); wn.start();
  wind = { g: wg, f: wf };
}

const C_SOUND = 140; // exaggerated speed of sound so the doppler is audible at street speeds

// car: the player's vehicle or null; siren: nearest siren car or null; playing: in normal play.
export function updateVoices(dt, car, siren, playing) {
  if (!mix.ac) return;
  if (!eng) build();
  const t = mix.ac.currentTime;
  // ---- engine
  if (car && playing) {
    const k = Math.min(1, Math.abs(car.speed) / car.spec.top);
    const gear = car.speed < 0.5 ? 0 : Math.min(4, Math.floor(k * 5));
    if (gear > eng.gear && eng.gear > 0) eng.dip = 0.14;   // upshift: cut and drop
    eng.gear = gear;
    eng.dip = Math.max(0, eng.dip - dt);
    const within = k * 5 - gear;
    const thr = Math.max(0, car.controls.throttle || 0);
    let rpm = car.speed < 0.5 ? 0.16 + thr * 0.25 : 0.25 + within * 0.75;
    if (eng.dip > 0) rpm *= 0.82;
    const base = car.spec.sporty ? 46 : car.spec.police ? 44 : 38;
    const f0 = base + rpm * (car.spec.sporty ? 125 : 105) + Math.sin(t * 31) * 0.6;
    eng.o1.frequency.setTargetAtTime(f0, t, 0.03);
    eng.o2.frequency.setTargetAtTime(f0 * 0.5, t, 0.03);
    eng.o3.frequency.setTargetAtTime(f0 * 2, t, 0.03);
    const load = 0.35 + thr * 0.65;
    eng.f.frequency.setTargetAtTime(220 + rpm * 1300 * load + k * 300, t, 0.06);
    const gain = (0.045 + rpm * 0.05) * (0.55 + load * 0.45) * (eng.dip > 0 ? 0.45 : 1);
    eng.g.gain.setTargetAtTime(gain, t, 0.04);
    eng.rf.frequency.setTargetAtTime(90 + rpm * 500, t, 0.05);
    eng.rg.gain.setTargetAtTime(0.05 + thr * 0.12 * rpm, t, 0.08);
    // Off-throttle burble at high revs
    if (thr < 0.05 && rpm > 0.55 && Math.random() < dt * 9) noise(t, 0.03, 0.12, 300 + Math.random() * 300, { ftype: 'bandpass', q: 2 });
    scr.g.gain.setTargetAtTime((car.skid || 0) * 0.2, t, 0.04);
    scr.f.frequency.setTargetAtTime(1700 + (car.skid || 0) * 900 + k * 400, t, 0.1);
    wind.g.gain.setTargetAtTime(Math.pow(k, 2) * 0.25, t, 0.2);
    wind.f.frequency.setTargetAtTime(500 + k * 900, t, 0.2);
  } else {
    eng.g.gain.setTargetAtTime(0, t, 0.12); eng.rg.gain.setTargetAtTime(0, t, 0.12);
    scr.g.gain.setTargetAtTime(0, t, 0.05); wind.g.gain.setTargetAtTime(0, t, 0.2);
    eng.gear = 0;
  }
  // ---- siren
  if (siren && playing) {
    const dx = siren.x - L.x, dz = siren.z - L.z, d = Math.max(0.5, Math.hypot(dx, dz));
    const ux = dx / d, uz = dz / d;
    // Radial speed (positive = moving apart) from both velocities -> doppler factor.
    const vr = ((siren.vx || 0) - L.vx) * ux + ((siren.vz || 0) - L.vz) * uz;
    const factor = C_SOUND / Math.max(40, C_SOUND + vr);
    const cents = 1200 * Math.log2(factor);
    for (const o of sir.o) o.detune.setTargetAtTime(cents, t, 0.08);
    const yelp = d < 45;
    sir.lfo.frequency.setTargetAtTime(yelp ? 3.6 : 0.33, t, 0.3);
    sir.lg.gain.setTargetAtTime(yelp ? 300 : 420, t, 0.3);
    const vol = 0.085 / (1 + Math.pow(d / 30, 1.5));
    sir.g.gain.setTargetAtTime(d > 260 ? 0 : vol, t, 0.1);
    sir.f.frequency.setTargetAtTime(Math.max(700, 5200 - d * 18), t, 0.1);
    if (sir.pan) sir.pan.pan.setTargetAtTime(Math.max(-0.85, Math.min(0.85, ux * L.rx + uz * L.rz)), t, 0.05);
  } else sir.g.gain.setTargetAtTime(0, t, 0.25);
}
