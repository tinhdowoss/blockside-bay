// Ambient beds that follow the listener around the bay:
//   surf      - pink noise through a low-pass whose level swells like breaking waves, louder near the
//               water and panned towards the sea
//   city hum  - low rumble plus a band of distant traffic, strongest downtown, quieter at night
//   gulls     - short gliding cries by day near the shore, panned at random, with a little room
//   crickets  - pulsed high chirps at night, away from the busiest streets
//   night bed - a soft distant bass thump drifting out of the clubs on Neon Mile after dark
// Levels follow the effects volume via the ambience bus.
import { CITY_SIZE, OCEAN_X } from '../core/config.js';
import { mix, tone, noise } from './mixer.js';
import { listener as L } from './sfx.js';

let surf = null, hum = null, nextGull = 0, nextCricket = 0, nextClub = 0;

function build() {
  const ac = mix.ac;
  const s = ac.createBufferSource(); s.buffer = mix.pinkBuf; s.loop = true;
  const sf = ac.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 700;
  const sg = ac.createGain(); sg.gain.value = 0;
  const sp = ac.createStereoPanner ? ac.createStereoPanner() : null;
  s.connect(sf); sf.connect(sg);
  if (sp) { sg.connect(sp); sp.connect(mix.amb); } else sg.connect(mix.amb);
  s.start();
  surf = { f: sf, g: sg, pan: sp };
  const h = ac.createBufferSource(); h.buffer = mix.pinkBuf; h.loop = true; h.playbackRate.value = 0.7;
  const hl = ac.createBiquadFilter(); hl.type = 'lowpass'; hl.frequency.value = 160;
  const hb = ac.createBiquadFilter(); hb.type = 'bandpass'; hb.frequency.value = 900; hb.Q.value = 0.4;
  const hbg = ac.createGain(); hbg.gain.value = 0.18;
  const hg = ac.createGain(); hg.gain.value = 0;
  h.connect(hl); hl.connect(hg); h.connect(hb); hb.connect(hbg); hbg.connect(hg); hg.connect(mix.amb);
  h.start();
  hum = { g: hg };
}

// Distance to open water: the beach/ocean to the east, seawalls on the other sides.
function seaDistance(x, z) {
  const east = OCEAN_X - x, west = x + 27, north = z + 27, south = CITY_SIZE + 27 - z;
  const d = Math.min(east, west, north, south);
  const dir = d === east ? [1, 0] : d === west ? [-1, 0] : d === north ? [0, -1] : [0, 1];
  return { d: Math.max(0, d), dir };
}

export function updateAmbience(dt, t, night, playing) {
  if (!mix.ac) return;
  if (!surf) build();
  const at = mix.ac.currentTime;
  const sea = seaDistance(L.x, L.z);
  const near = Math.max(0, 1 - sea.d / 110);
  // Waves: two slow overlapping swells give an irregular break rhythm.
  const swell = 0.55 + 0.3 * Math.sin(t * 0.52) + 0.15 * Math.sin(t * 1.27 + 1.3);
  const sv = playing ? (0.04 + near * 0.32) * swell : 0;
  surf.g.gain.setTargetAtTime(sv, at, 0.15);
  surf.f.frequency.setTargetAtTime(380 + swell * 900 * (0.4 + near * 0.6), at, 0.2);
  if (surf.pan) surf.pan.pan.setTargetAtTime(Math.max(-0.7, Math.min(0.7, (sea.dir[0] * L.rx + sea.dir[1] * L.rz) * near)), at, 0.3);
  // City hum: strongest mid-city, softer at night.
  const cx = CITY_SIZE / 2, inCity = Math.max(0, 1 - Math.hypot(L.x - cx, L.z - cx) / (CITY_SIZE * 0.85));
  hum.g.gain.setTargetAtTime(playing ? (0.05 + inCity * 0.22) * (1 - night * 0.45) : 0, at, 0.4);
  if (!playing) return;
  // Gulls by day near the shore
  if (t > nextGull) {
    nextGull = t + 2.5 + Math.random() * 6;
    if (night < 0.4 && near > 0.2 && Math.random() < near + 0.2) {
      const pan = Math.random() * 1.6 - 0.8, n = 2 + Math.floor(Math.random() * 3), v = 0.03 + near * 0.04;
      for (let k = 0; k < n; k++) {
        const s = at + k * (0.18 + Math.random() * 0.08), f = 1900 + Math.random() * 500;
        tone('triangle', f, s, 0.16, v, { bus: mix.amb, glide: f * 0.62, attack: 0.02, pan, rev: 0.35, filter: 3200 });
      }
    }
  }
  // Crickets at night, away from the beach surf
  if (t > nextCricket) {
    nextCricket = t + 0.5 + Math.random() * 0.9;
    if (night > 0.5) {
      const pan = Math.random() * 1.6 - 0.8, f = 4300 + Math.random() * 600, v = 0.012 + (1 - inCity) * 0.012;
      for (let k = 0; k < 3; k++) tone('sine', f, at + k * 0.055, 0.035, v, { bus: mix.amb, pan, attack: 0.004 });
    }
  }
  // Distant club bass from Neon Mile at night (north-east blocks)
  if (t > nextClub) {
    nextClub = t + 60 / 124;
    const nm = Math.hypot(L.x - 290, L.z - 70);
    if (night > 0.5 && nm < 160) {
      const v = 0.08 * (1 - nm / 160);
      tone('sine', 55, at, 0.25, v, { bus: mix.amb, glide: 40, filter: 200 });
      noise(at, 0.08, v * 0.15, 220, { bus: mix.amb, ftype: 'lowpass' });
    }
  }
}
