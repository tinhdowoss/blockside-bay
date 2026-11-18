// Player settings (persisted in localStorage). Every option applies the moment it changes:
// MASTER / MUSIC / EFFECTS volume (audio buses), MOUSE sensitivity and INVERT Y (player.js), FIELD OF
// VIEW (camera.js), CAMERA SHAKE, GRAPHICS preset (post-processing + resolution), SHADOWS and TIPS.
import { game } from './state.js';
import { post, resizePost } from '../fx/post.js';
import { setVolume } from '../audio/radio.js';

const KEY = 'blockside-bay-settings';
const FIELDS = ['masterVol', 'musicVol', 'sfxVol', 'sens', 'invertY', 'fov', 'shake', 'quality', 'shadows', 'tips'];
const DEFAULTS = { masterVol: 1, musicVol: 0.32, sfxVol: 0.8, sens: 1, invertY: false, fov: 62, shake: true, quality: 'HIGH', shadows: true, tips: true };
const QUALITY = ['LOW', 'MEDIUM', 'HIGH'];
let renderer = null;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const level = (v, max) => Math.round((v / max) * 10);
const toggle = (id) => ({ kind: 'toggle', get: () => game[id] !== false, change: () => { game[id] = game[id] === false; } });

// The rows of the SETTINGS page, in order. `value` is 0..1 for the slider bar; `text` is what is shown.
export const SETTINGS = [
  { id: 'master', label: 'MASTER VOLUME', group: 'AUDIO', kind: 'slider', value: () => game.masterVol, change: (d) => { game.masterVol = clamp(Math.round(game.masterVol * 10 + d) / 10, 0, 1); } },
  { id: 'music', label: 'MUSIC / RADIO', group: 'AUDIO', kind: 'slider', value: () => game.musicVol / 0.64, change: (d) => { game.musicVol = clamp(Math.round(game.musicVol / 0.064 + d) * 0.064, 0, 0.64); } },
  { id: 'sfx', label: 'EFFECTS', group: 'AUDIO', kind: 'slider', value: () => game.sfxVol, change: (d) => { game.sfxVol = clamp(Math.round(game.sfxVol * 10 + d) / 10, 0, 1); } },
  { id: 'sens', label: 'MOUSE SENSITIVITY', group: 'CONTROLS', kind: 'slider', value: () => game.sens / 2, change: (d) => { game.sens = clamp(Math.round(game.sens * 5 + d) / 5, 0.2, 2); } },
  { id: 'invert', label: 'INVERT MOUSE Y', group: 'CONTROLS', ...toggle('invertY'), get: () => !!game.invertY, change: () => { game.invertY = !game.invertY; } },
  { id: 'fov', label: 'FIELD OF VIEW', group: 'CAMERA', kind: 'slider', value: () => (game.fov - 52) / 30, text: () => `${game.fov}°`, change: (d) => { game.fov = clamp(game.fov + d * 5, 52, 82); } },
  { id: 'shake', label: 'CAMERA SHAKE', group: 'CAMERA', ...toggle('shake') },
  { id: 'quality', label: 'GRAPHICS', group: 'VIDEO', kind: 'choice', text: () => game.quality, change: (d) => { game.quality = QUALITY[(QUALITY.indexOf(game.quality) + (d < 0 ? 2 : 1)) % 3]; } },
  { id: 'shadows', label: 'SHADOWS', group: 'VIDEO', ...toggle('shadows') },
  { id: 'tips', label: 'TUTORIAL TIPS', group: 'GAME', ...toggle('tips') },
];
for (const s of SETTINGS) {
  if (s.kind === 'slider' && !s.text) s.text = () => String(level(s.value(), 1));
  if (s.kind === 'toggle') { s.value = () => (s.get() ? 1 : 0); s.text = () => (s.get() ? 'ON' : 'OFF'); }
  if (s.kind === 'choice') s.value = () => (QUALITY.indexOf(game.quality) + 1) / 3;
}

export function loadSettings(r, fresh = false) {
  renderer = r;
  let s = {};
  if (!fresh) try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { s = {}; }
  for (const f of FIELDS) game[f] = s[f] ?? DEFAULTS[f];
  if (!QUALITY.includes(game.quality)) game.quality = 'HIGH';
  applySettings();
}

export function saveSettings() {
  const out = {};
  for (const f of FIELDS) out[f] = game[f];
  try { localStorage.setItem(KEY, JSON.stringify(out)); } catch { /* private mode */ }
}

export function applySettings() {
  setVolume(game.musicVol, game.sfxVol, game.masterVol);
  if (!renderer) return;
  const q = game.quality;
  post.enabled = q !== 'LOW';
  renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'HIGH' ? 1.5 : 1));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = game.shadows !== false;
  renderer.shadowMap.needsUpdate = true;
  resizePost();
}

// One step left (-1) or right (+1) on a settings row; applied and saved at once.
export function changeSetting(id, d) {
  const s = SETTINGS.find((q) => q.id === id);
  if (!s) return;
  s.change(d);
  applySettings();
  saveSettings();
}

export function resetSettings() {
  Object.assign(game, DEFAULTS);
  applySettings();
  saveSettings();
}
