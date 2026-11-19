// Audio mixer: one AudioContext, four buses (music, sfx, ambience, ui) that meet in a master chain of
//   glue compressor -> makeup gain -> brick-wall limiter (fast compressor) -> soft clipper -> output
// plus two effect sends shared by everything: a convolution reverb (impulse response generated from
// decaying stereo noise, so no files) and a filtered ping-pong delay. Small helpers build one-shot
// tones and noise bursts routed to a bus, with optional reverb/delay sends and stereo pan.

export const mix = {
  ac: null, out: null, master: null, music: null, sfx: null, amb: null, ui: null,
  reverb: null, delay: null, analyser: null, noiseBuf: null, pinkBuf: null,
};

// Decaying noise with a darker tail: early reflections are bright, the tail is low-passed by mixing in
// a smoothed copy. Stereo channels use independent noise for width.
function impulse(ac, seconds, decay) {
  const n = Math.floor(ac.sampleRate * seconds);
  const fadeIn = ac.sampleRate * 0.012;   // 12 ms ramp so the reverb never clicks in
  const buf = ac.createBuffer(2, n, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const w = Math.random() * 2 - 1;
      lp += (w - lp) * (0.5 - t * 0.42);
      d[i] = lp * Math.pow(1 - t, decay) * (i < fadeIn ? i / fadeIn : 1);
    }
  }
  return buf;
}

// tanh wave shaper normalised so full scale stays full scale: rounds off peaks the limiter lets through.
function softClip(ac) {
  const ws = ac.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 1.2) / Math.tanh(1.2); }
  ws.curve = curve;
  ws.oversample = '2x';
  return ws;
}

/** Builds the AudioContext graph once (later calls return the same mix); null without WebAudio. */
export function createMixer() {
  if (mix.ac) return mix;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ac = new AC();
  mix.ac = ac;
  // Master chain
  const glue = ac.createDynamicsCompressor();
  glue.threshold.value = -20; glue.knee.value = 12; glue.ratio.value = 3.5; glue.attack.value = 0.008; glue.release.value = 0.22;
  const makeup = ac.createGain(); makeup.gain.value = 1.25;
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.08;
  const clip = softClip(ac);
  const out = ac.createGain(); out.gain.value = 0.85;
  glue.connect(makeup); makeup.connect(limiter); limiter.connect(clip); clip.connect(out); out.connect(ac.destination);
  mix.master = glue; mix.out = out;
  // Reverb send (convolver) and delay send (feedback echo with a darkening filter)
  const conv = ac.createConvolver(); conv.buffer = impulse(ac, 2.6, 3.2);
  const revIn = ac.createGain(); revIn.gain.value = 1;
  const revOut = ac.createGain(); revOut.gain.value = 0.55;
  const revHp = ac.createBiquadFilter(); revHp.type = 'highpass'; revHp.frequency.value = 180;
  revIn.connect(revHp); revHp.connect(conv); conv.connect(revOut); revOut.connect(glue);
  mix.reverb = revIn;
  const delayIn = ac.createGain();
  const delayLine = ac.createDelay(1.5); delayLine.delayTime.value = 0.31;
  const feedback = ac.createGain(); feedback.gain.value = 0.34;
  const delayLp = ac.createBiquadFilter(); delayLp.type = 'lowpass'; delayLp.frequency.value = 2400;
  const delayOut = ac.createGain(); delayOut.gain.value = 0.4;
  delayIn.connect(delayLine); delayLine.connect(delayLp); delayLp.connect(feedback); feedback.connect(delayLine); delayLp.connect(delayOut); delayOut.connect(glue);
  delayOut.connect(revIn);
  mix.delay = delayIn;
  // Buses. Each has its own send taps (bus.rev / bus.dly) whose level follows the bus volume, so the
  // music and effects sliders also scale their reverb and echo tails.
  const bus = (v) => {
    const g = ac.createGain(); g.gain.value = v; g.connect(glue);
    g.rev = ac.createGain(); g.rev.gain.value = v; g.rev.connect(revIn);
    g.dly = ac.createGain(); g.dly.gain.value = v; g.dly.connect(delayIn);
    return g;
  };
  mix.music = bus(0.32); mix.sfx = bus(0.8); mix.amb = bus(0.8); mix.ui = bus(0.8);
  mix.analyser = ac.createAnalyser(); mix.analyser.fftSize = 64;
  mix.music.connect(mix.analyser);
  // Noise sources: white and a pink-ish (filtered) one for surf and hum.
  mix.noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const white = mix.noiseBuf.getChannelData(0);
  for (let i = 0; i < white.length; i++) white[i] = Math.random() * 2 - 1;
  mix.pinkBuf = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate);
  const pink = mix.pinkBuf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < pink.length; i++) {
    const x = Math.random() * 2 - 1;
    b0 = 0.997 * b0 + x * 0.029; b1 = 0.985 * b1 + x * 0.032; b2 = 0.95 * b2 + x * 0.048;
    pink[i] = (b0 + b1 + b2 + x * 0.02) * 2.2;
  }
  return mix;
}

/** Routes a node to a bus with optional sends and stereo pan. Returns the gain node you drive. */
export function route(node, { bus = mix.sfx, rev = 0, dly = 0, pan = 0 } = {}) {
  const ac = mix.ac;
  let tail = node;
  if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); tail.connect(p); tail = p; }
  tail.connect(bus);
  if (rev > 0) { const s = ac.createGain(); s.gain.value = rev; tail.connect(s); s.connect(bus.rev || mix.reverb); }
  if (dly > 0) { const s = ac.createGain(); s.gain.value = dly; tail.connect(s); s.connect(bus.dly || mix.delay); }
  return tail;
}

/** Smoothly sets a bus level (and its send taps). */
export function setBus(bus, v, tc = 0.08) {
  if (!bus) return;
  const t = mix.ac.currentTime;
  bus.gain.setTargetAtTime(v, t, tc);
  bus.rev?.gain.setTargetAtTime(v, t, tc);
  bus.dly?.gain.setTargetAtTime(v, t, tc);
}

/** One-shot oscillator note with an attack/decay envelope (options: glide, detune, filter, hold, sends). */
export function tone(type, freq, t, dur, vol, o = {}) {
  const ac = mix.ac;
  const osc = ac.createOscillator(), g = ac.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, t);
  if (o.glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.glide), t + (o.glideT || dur));
  if (o.detune) osc.detune.value = o.detune;
  const a = o.attack ?? 0.008;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + a);
  if (o.hold) g.gain.setValueAtTime(Math.max(0.0002, vol), t + a + o.hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = osc;
  if (o.filter) {
    const f = ac.createBiquadFilter(); f.type = o.ftype || 'lowpass'; f.frequency.setValueAtTime(o.filter, t); f.Q.value = o.q ?? 0.7;
    if (o.fenv) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.fenv), t + dur);
    osc.connect(f); node = f;
  }
  node.connect(g);
  route(g, o);
  osc.start(t); osc.stop(t + dur + 0.05);
  return osc;
}

/** One-shot filtered noise burst (white, or pink with o.pink). */
export function noise(t, dur, vol, freq, o = {}) {
  const ac = mix.ac;
  const s = ac.createBufferSource(); s.buffer = o.pink ? mix.pinkBuf : mix.noiseBuf;
  const f = ac.createBiquadFilter(); f.type = o.ftype || 'highpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = o.q ?? 0.7;
  if (o.fenv) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.fenv), t + dur);
  const g = ac.createGain();
  const a = o.attack ?? 0.002;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + a);
  if (o.hold) g.gain.setValueAtTime(Math.max(0.0002, vol), t + a + o.hold); // gated: flat, then cut
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g);
  route(g, o);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}

/** MIDI note number to frequency in Hz (A4 = 69 = 440 Hz). */
export const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
