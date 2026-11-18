// WebAudio sound: three procedural radio stations (synthwave, bay house, tropical brass) plus engine,
// siren, gunshot, punch, crash, horn and jingle effects. Nothing is loaded from files.
import { STATIONS } from './config.js';
import { makeRng } from './rng.js';
import { game, on } from './state.js';

let ac = null, master, musicBus, sfxBus, analyser, noiseBuf;
let engine = null, siren = null;
let station = 0, nextBeat = 0, step = 0, pattern = null;
const levels = new Array(7).fill(0.1);
let radioOn = false;

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination);
  musicBus = ac.createGain(); musicBus.gain.value = 0.32;
  analyser = ac.createAnalyser(); analyser.fftSize = 64;
  musicBus.connect(analyser); analyser.connect(master);
  sfxBus = ac.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  setStation(game.radioStation);
  setInterval(schedule, 50);
}

export function setVolume(music, sfx) {
  if (!ac) return;
  musicBus.gain.value = music;
  sfxBus.gain.value = sfx;
}

// ---- Music ------------------------------------------------------------------------------
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function makePattern(st) {
  const r = makeRng(st.root * 97 + st.bpm);
  const deg = () => st.scale[Math.floor(r() * st.scale.length)];
  const bars = [0, 5, 3, 4].map((x) => st.scale[x % st.scale.length]);
  const bass = [], lead = [];
  for (let i = 0; i < 64; i++) {
    const chord = bars[Math.floor(i / 16) % 4];
    bass.push(i % 4 === 0 || (st.style === 'tropical' && i % 16 === 6) || (st.style === 'house' && i % 4 === 2) ? chord : null);
    lead.push(r() < (st.style === 'synth' ? 0.42 : 0.3) ? chord + deg() + 12 : null);
  }
  return { bass, lead };
}

export function setStation(i) {
  station = (i + STATIONS.length) % STATIONS.length;
  game.radioStation = station;
  const st = STATIONS[station];
  pattern = st.style === 'off' ? null : makePattern(st);
  step = 0;
  if (ac) nextBeat = ac.currentTime + 0.05;
}

export function nextStation() { setStation(station + 1); blip(880); }
export function setRadioPlaying(on_) { radioOn = on_; }

function tone(type, freq, t, dur, vol, bus = musicBus, filter = 0) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (filter) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
  node.connect(g); g.connect(bus);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(t, dur, vol, freq, bus = musicBus, type = 'highpass') {
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(bus);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

function kick(t, vol = 0.9) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.32);
}

function schedule() {
  if (!ac || !pattern) return;
  const st = STATIONS[station];
  const playing = radioOn && game.mode !== 'pause';
  musicBus.gain.setTargetAtTime(playing ? (game.musicVol ?? 0.32) : 0.0001, ac.currentTime, 0.2);
  const spb = 60 / st.bpm / 4;
  while (nextBeat < ac.currentTime + 0.2) {
    const t = nextBeat, i = step % 64, root = st.root;
    if (st.style === 'house') {
      if (i % 4 === 0) kick(t);
      if (i % 4 === 2) noise(t, 0.05, 0.25, 7000);
      if (i % 8 === 4) noise(t, 0.15, 0.3, 1500, musicBus, 'bandpass');
    } else if (st.style === 'synth') {
      if (i % 8 === 0) kick(t);
      if (i % 8 === 4) { noise(t, 0.25, 0.35, 1800, musicBus, 'bandpass'); }
      if (i % 2 === 0) noise(t, 0.03, 0.12, 9000);
      if (i % 16 === 0) for (const k of [0, 3, 7]) tone('sawtooth', midi(root + 12 + (pattern.bass[i] ?? 0) + k), t, spb * 15, 0.035, musicBus, 1400);
    } else {
      if (i % 16 === 0 || i % 16 === 6 || i % 16 === 12) kick(t, 0.6);
      if (i % 4 === 2) noise(t, 0.04, 0.2, 5000);
      if (i % 8 === 7) tone('square', midi(root + 24 + (pattern.bass[i - (i % 16)] ?? 0)), t, 0.18, 0.05, musicBus, 2400);
    }
    const b = pattern.bass[i];
    if (b != null) tone(st.style === 'tropical' ? 'triangle' : 'sawtooth', midi(root + b - 12), t, spb * 3.5, 0.18, musicBus, 600);
    const l = pattern.lead[i];
    if (l != null) tone(st.style === 'tropical' ? 'sine' : 'square', midi(root + 12 + l), t, spb * 1.8, st.style === 'tropical' ? 0.12 : 0.05, musicBus, 3000);
    nextBeat += spb;
    step++;
  }
}

// ---- Effects ----------------------------------------------------------------------------
export function gunshot(kind = 'pistol', vol = 1) {
  if (!ac) return;
  const t = ac.currentTime;
  noise(t, kind === 'smg' ? 0.09 : 0.16, 0.7 * vol, kind === 'smg' ? 1200 : 700, sfxBus, 'lowpass');
  tone('square', kind === 'smg' ? 160 : 110, t, 0.08, 0.3 * vol, sfxBus);
}
export function punch() { if (ac) { noise(ac.currentTime, 0.08, 0.5, 400, sfxBus, 'lowpass'); } }
export function crash(impact) { if (ac) { const t = ac.currentTime; noise(t, 0.35, Math.min(1, impact / 20), 900, sfxBus, 'lowpass'); tone('sawtooth', 70, t, 0.2, 0.2, sfxBus); } }
export function boom() { if (ac) { const t = ac.currentTime; noise(t, 1.2, 1, 300, sfxBus, 'lowpass'); tone('sine', 50, t, 0.8, 0.6, sfxBus); } }
export function horn() { if (ac) { const t = ac.currentTime; tone('square', 392, t, 0.5, 0.08, sfxBus, 1500); tone('square', 494, t, 0.5, 0.06, sfxBus, 1500); } }
export function blip(f = 660) { if (ac) tone('square', f, ac.currentTime, 0.08, 0.08, sfxBus); }
export function jingle(ok = true) {
  if (!ac) return;
  const t = ac.currentTime, notes = ok ? [72, 76, 79, 84] : [67, 63, 60];
  notes.forEach((n, i) => tone('square', midi(n), t + i * 0.12, 0.3, 0.12, sfxBus, 3000));
}

// Engine hum follows the player's car; the siren swells with the nearest police light bar.
export function updateAudio(carSpeed, carTop, sirenDist) {
  if (!ac) return;
  if (!engine) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(sfxBus); o.start(); o2.start();
    engine = { o, o2, g, f };
    const so = ac.createOscillator(), sg = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    so.type = 'square'; so.frequency.value = 900; lfo.frequency.value = 1.6; lg.gain.value = 260; sg.gain.value = 0;
    const sf = ac.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 2200;
    lfo.connect(lg); lg.connect(so.frequency); so.connect(sf); sf.connect(sg); sg.connect(sfxBus); so.start(); lfo.start();
    siren = { g: sg };
  }
  const t = ac.currentTime;
  const on_ = carSpeed != null && game.mode === 'play';
  const k = on_ ? Math.min(1, carSpeed / carTop) : 0;
  const gearK = (k * 4) % 1;
  engine.o.frequency.setTargetAtTime(45 + k * 90 + gearK * 40, t, 0.05);
  engine.o2.frequency.setTargetAtTime((45 + k * 90 + gearK * 40) * 0.5, t, 0.05);
  engine.f.frequency.setTargetAtTime(300 + k * 1500, t, 0.1);
  engine.g.gain.setTargetAtTime(on_ ? 0.05 + k * 0.06 : 0, t, 0.1);
  const sv = sirenDist < 120 && game.mode === 'play' ? 0.05 * (1 - sirenDist / 120) : 0;
  siren.g.gain.setTargetAtTime(sv, t, 0.2);
}

export function radioInfo() {
  const st = STATIONS[station];
  if (analyser && radioOn) {
    const a = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(a);
    for (let i = 0; i < 7; i++) levels[i] = levels[i] * 0.6 + (a[1 + i * 3] / 255) * 0.4;
  } else {
    const t = performance.now() / 1000;
    for (let i = 0; i < 7; i++) levels[i] = st.style === 'off' ? 0.05 : 0.35 + 0.35 * Math.abs(Math.sin(t * (2 + i * 0.7) + i));
  }
  return { ...st, levels };
}

export function setupAudioEvents() {
  on('gunshot', (e) => gunshot(e.weapon === 'npc' ? 'pistol' : e.weapon, e.by === 'player' ? 1 : 0.5));
  on('punch', punch);
  on('crash', crash);
  on('carHit', (e) => crash(e.impact));
  on('explosion', boom);
  on('honk', horn);
  on('missionPassed', () => jingle(true));
  on('banner', (b) => { if (b.top === 'MISSION FAILED') jingle(false); });
  on('weapon', () => blip(520));
}
