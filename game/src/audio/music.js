// Procedural radio. Every station is an arrangement generated from a seed: drums, bass, chord
// progression, a lead line and an arpeggio, in four-bar loops that build in sections
// (intro -> groove -> full -> breakdown) so a drive never sounds like a two-second loop.
//
//   WAVE 88.1      synthwave   - gated reverb snare, saw pad chords, 16th arpeggio, detuned saw lead
//   REEF RADIO 102 bay house   - four-on-the-floor, open hats, offbeat organ stabs, plucked lead
//   CARACOL 95.5   tropical    - guiro scrape, congas, bouncing bass, brass stabs, marimba melody
//   LOW TIDE 79.3  lo-fi beats - swung boom-bap, dusty vinyl crackle, rhodes 9th chords, soft lead
//
// All original: progressions and melodies are generated, nothing is sampled or transcribed.
import { STATIONS } from '../core/config.js';
import { makeRng } from '../core/rng.js';
import { mix, tone, noise, midi } from './mixer.js';

const Q = { M: [0, 4, 7], m: [0, 3, 7], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10], m9: [0, 3, 7, 10, 14], 9: [0, 4, 7, 10, 14], M9: [0, 4, 7, 11, 14], sus: [0, 5, 7] };
const PROG = {
  synth: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M'], [0, 'm'], [5, 'm'], [8, 'M'], [10, 'sus']],
  house: [[0, 'M7'], [4, 'm7'], [9, 'm7'], [5, 'M7']],
  tropical: [[0, 'M'], [5, 'M'], [7, 'M'], [0, 'M'], [9, 'm'], [5, 'M'], [7, 'M'], [7, 'sus']],
  lofi: [[2, 'm9'], [7, '9'], [0, 'M9'], [9, 'm9']],
};

export const radio = { station: 0, on: false, step: 0, next: 0, arr: null, levels: new Array(7).fill(0.1) };

// ---- drum kit ------------------------------------------------------------------------------------
const M = () => ({ bus: mix.music });
function kick(t, v = 0.9, low = 42) {
  const o = mix.ac.createOscillator(), g = mix.ac.createGain();
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(low, t + 0.12);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
  o.connect(g); g.connect(mix.music); o.start(t); o.stop(t + 0.36);
  noise(t, 0.015, v * 0.25, 3000, M());
}
const snare = (t, v = 0.4, rev = 0.25) => { noise(t, 0.18, v, 1800, { ...M(), ftype: 'bandpass', q: 0.8, rev }); tone('triangle', 190, t, 0.08, v * 0.5, { ...M(), glide: 140 }); };
const gated = (t, v = 0.45) => { noise(t, 0.32, v, 1500, { ...M(), ftype: 'bandpass', q: 0.6, rev: 0.9, hold: 0.16 }); tone('triangle', 180, t, 0.1, v * 0.4, M()); };
const hat = (t, v = 0.12, open = false) => noise(t, open ? 0.22 : 0.035, v, open ? 6500 : 8500, M());
const clap = (t, v = 0.3) => { for (let k = 0; k < 3; k++) noise(t + k * 0.011, 0.12, v * (k === 2 ? 1 : 0.6), 1300, { ...M(), ftype: 'bandpass', q: 1.2, rev: 0.3 }); };
const conga = (t, f, v = 0.25) => tone('sine', f, t, 0.18, v, { ...M(), glide: f * 0.82, glideT: 0.12 });
const guiro = (t, v = 0.08) => { for (let k = 0; k < 5; k++) noise(t + k * 0.018, 0.016, v, 4200, { ...M(), ftype: 'bandpass', q: 3 }); };
const shaker = (t, v = 0.06) => noise(t, 0.05, v, 7000, { ...M(), attack: 0.02 });
const rim = (t, v = 0.15) => tone('square', 1700, t, 0.03, v, { ...M(), filter: 2400, ftype: 'bandpass', q: 4 });
const crackle = (t) => { if (Math.random() < 0.45) noise(t + Math.random() * 0.1, 0.006, 0.05 + Math.random() * 0.08, 2500, M()); };

// ---- arrangement -----------------------------------------------------------------------------------
function chordAt(st, bar) {
  const p = PROG[st.style];
  const [off, q] = p[bar % p.length];
  return { root: st.root + off, notes: Q[q].map((n) => st.root + off + n) };
}

// A melody for one 4-bar phrase: chord tones on strong beats, scale steps between, rests for breath.
function phrase(st, r, density) {
  const line = [];
  let last = 7;
  for (let i = 0; i < 64; i++) {
    const strong = i % 4 === 0;
    if (r() > (strong ? density + 0.2 : density * 0.6)) { line.push(null); continue; }
    const step = Math.round((r() - 0.5) * 4);
    last = Math.max(0, Math.min(st.scale.length * 2 - 1, last + step));
    const oct = Math.floor(last / st.scale.length);
    line.push(st.scale[last % st.scale.length] + oct * 12);
  }
  return line;
}

function arrange(st) {
  const r = makeRng(st.root * 131 + st.bpm * 7);
  return { leads: [phrase(st, r, st.style === 'synth' ? 0.5 : 0.38), phrase(st, r, st.style === 'synth' ? 0.42 : 0.3)], bassVar: r() };
}

export function setStationMusic(i) {
  radio.station = (i + STATIONS.length) % STATIONS.length;
  const st = STATIONS[radio.station];
  radio.arr = st.style === 'off' ? null : arrange(st);
  radio.step = 0;
  if (mix.ac) radio.next = mix.ac.currentTime + 0.06;
}

// One 16th-note step of the current station.
function playStep(st, t, step, spb) {
  const i = step % 16, bar = Math.floor(step / 16), loop = Math.floor(bar / 4);
  const section = loop % 6;                // 0 intro, 1-3 groove/full, 4 full + lead B, 5 breakdown
  const breakdown = section === 5 && bar % 4 >= 2;
  const ch = chordAt(st, bar);
  const nb = ch.root - 12;
  const lead = radio.arr.leads[section >= 3 ? 1 : 0][step % 64];
  const s = st.style;
  if (s === 'synth') {
    if (!breakdown) {
      if (i % 4 === 0 && (i % 8 === 0 || section > 0)) kick(t, 0.85);
      if (i === 4 || i === 12) gated(t);
      if (i % 2 === 0 && section > 0) hat(t, 0.08);
    }
    if (i === 0) for (const n of ch.notes) { tone('sawtooth', midi(n + 12), t, spb * 15.5, 0.022, { ...M(), filter: 1200, attack: 0.25, detune: -8, rev: 0.4 }); tone('sawtooth', midi(n + 12), t, spb * 15.5, 0.022, { ...M(), filter: 1200, attack: 0.25, detune: 8 }); }
    if (i % 2 === 0) tone('sawtooth', midi(nb + (i % 4 === 2 ? 12 : 0)), t, spb * 1.8, 0.14, { ...M(), filter: 700, fenv: 200 });
    if (section >= 1) { const a = ch.notes[i % ch.notes.length] + 24 + (i >= 8 ? 12 : 0); tone('square', midi(a), t, spb * 0.9, 0.025, { ...M(), filter: 3200, dly: 0.35 }); }
    if (lead != null && section >= 2) tone('sawtooth', midi(st.root + 24 + lead), t, spb * 2.6, 0.045, { ...M(), filter: 2600, detune: 6, dly: 0.25, rev: 0.3 });
  } else if (s === 'house') {
    if (!breakdown && i % 4 === 0) kick(t, 0.95, 46);
    if (!breakdown && i % 4 === 2) hat(t, 0.16, true);
    if (i % 2 === 1 && section > 0) hat(t, 0.06);
    if ((i === 4 || i === 12) && section > 0) clap(t);
    if (i % 4 === 2 && !breakdown) tone('sawtooth', midi(nb - (i === 14 ? 0 : 12) + (i === 10 ? 12 : 0)), t, spb * 1.6, 0.16, { ...M(), filter: 500, fenv: 160 });
    if ((i === 2 || i === 7 || i === 10) && section !== 0) for (const n of ch.notes) { tone('square', midi(n + 12), t, spb * 1.4, 0.016, { ...M(), filter: 1800, rev: 0.25 }); tone('sine', midi(n + 24), t, spb * 1.4, 0.02, M()); }
    if (breakdown && i === 0) for (const n of ch.notes) tone('triangle', midi(n + 12), t, spb * 30, 0.03, { ...M(), attack: 0.6, rev: 0.6 });
    if (lead != null && section >= 2) tone('triangle', midi(st.root + 24 + lead), t, spb * 1.2, 0.07, { ...M(), filter: 4000, fenv: 900, dly: 0.3 });
  } else if (s === 'tropical') {
    if (!breakdown) {
      if (i === 0 || i === 8) kick(t, 0.6, 50);
      if (i % 4 === 2) guiro(t);
      if (i % 2 === 0) shaker(t);
      if (i === 6 || i === 14) conga(t, 330); if (i === 7 || i === 15) conga(t, 250, 0.2); if (i === 11) conga(t, 200, 0.22);
      if (i === 4 || i === 12) rim(t);
    }
    // Bouncing cumbia bass: root on 1, fifth on 3, pickup before the bar.
    if (i === 0) tone('triangle', midi(nb), t, spb * 3, 0.24, M());
    if (i === 8) tone('triangle', midi(nb + 7), t, spb * 3, 0.22, M());
    if (i === 14) tone('triangle', midi(nb + (radio.arr.bassVar > 0.5 ? 5 : 4)), t, spb * 1.5, 0.18, M());
    // Brass stabs (two detuned saws through a closing filter)
    if ((i === 2 || i === 10 || (i === 13 && bar % 2)) && section > 0) for (const n of ch.notes) { tone('sawtooth', midi(n + 12), t, spb * 1.5, 0.022, { ...M(), filter: 2600, fenv: 700, detune: -6, rev: 0.2 }); tone('sawtooth', midi(n + 12), t, spb * 1.5, 0.02, { ...M(), filter: 2600, fenv: 700, detune: 7 }); }
    // Marimba: sine + bright 4x partial with a quick decay
    if (lead != null && section >= 1) { const f = midi(st.root + 24 + lead); tone('sine', f, t, 0.35, 0.1, { ...M(), rev: 0.25 }); tone('sine', f * 4, t, 0.06, 0.03, M()); }
  } else if (s === 'lofi') {
    // Swing: every second 16th is late.
    const ts = i % 2 ? t + spb * 0.28 : t;
    crackle(t);
    if (!breakdown) {
      if (i === 0 || i === 10 || (i === 7 && bar % 2)) kick(ts, 0.75, 40);
      if (i === 4 || i === 12) snare(ts, 0.28, 0.35);
      if (i % 2 === 0 || i === 15) hat(ts, i % 4 === 2 ? 0.07 : 0.045);
    }
    if (i === 0) tone('sine', midi(nb), t, spb * 7, 0.26, { ...M(), attack: 0.02 });
    if (i === 8 || i === 11) tone('sine', midi(nb + (i === 11 ? 7 : 0)), ts, spb * 3, 0.2, M());
    // Rhodes-ish chord: sine + soft triangle, rolled a little, washed in reverb.
    if (i === 0 || (i === 9 && section > 1)) ch.notes.forEach((n, k) => { const tt = ts + k * 0.018; tone('sine', midi(n + 12), tt, spb * 12, 0.03, { ...M(), attack: 0.015, rev: 0.45 }); tone('triangle', midi(n + 24), tt, spb * 4, 0.008, M()); });
    if (lead != null && section >= 2 && i % 2 === 0) tone('triangle', midi(st.root + 24 + lead), ts, spb * 3, 0.05, { ...M(), filter: 1800, attack: 0.03, dly: 0.35, rev: 0.3 });
  }
}

let musicVol = 0.32;
export function setMusicVolume(v) { musicVol = v; }

export function scheduleMusic(playing) {
  const ac = mix.ac;
  if (!ac) return;
  const st = STATIONS[radio.station];
  const want = playing && radio.arr ? musicVol : 0.0001;
  mix.music.gain.setTargetAtTime(want, ac.currentTime, 0.25);
  mix.music.rev.gain.setTargetAtTime(want, ac.currentTime, 0.25);
  mix.music.dly.gain.setTargetAtTime(want, ac.currentTime, 0.25);
  if (!radio.arr) { radio.next = ac.currentTime + 0.05; return; }
  const spb = 60 / st.bpm / 4;
  if (radio.next < ac.currentTime - 0.5) radio.next = ac.currentTime + 0.05;
  while (radio.next < ac.currentTime + 0.2) {
    if (playing) playStep(st, radio.next, radio.step, spb);
    radio.next += spb;
    radio.step++;
  }
}

export function musicLevels(t) {
  const st = STATIONS[radio.station];
  const L = radio.levels;
  if (mix.analyser && radio.on) {
    const a = new Uint8Array(mix.analyser.frequencyBinCount);
    mix.analyser.getByteFrequencyData(a);
    for (let i = 0; i < 7; i++) L[i] = L[i] * 0.6 + (a[1 + i * 3] / 255) * 0.4;
  } else {
    for (let i = 0; i < 7; i++) L[i] = st.style === 'off' ? 0.05 : 0.35 + 0.35 * Math.abs(Math.sin(t * (2 + i * 0.7) + i));
  }
  return L;
}
