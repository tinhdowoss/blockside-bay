// Player settings (persisted in localStorage). Every option really applies: music/effects volume,
// mouse sensitivity, shadows, QUALITY (post-processing + resolution) and camera shake.
import { game } from './state.js';
import { post, resizePost } from '../fx/post.js';

const KEY = 'blockside-bay-settings';
let renderer = null;

export function loadSettings(r, fresh = false) {
  renderer = r;
  let s = {};
  if (!fresh) try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { s = {}; }
  Object.assign(game, {
    musicVol: s.musicVol ?? 0.32, sfxVol: s.sfxVol ?? 0.8, sens: s.sens ?? 1,
    shadows: s.shadows ?? true, quality: s.quality ?? 'HIGH', shake: s.shake ?? true,
  });
  applySettings();
}

export function saveSettings() {
  const { musicVol, sfxVol, sens, shadows, quality, shake } = game;
  try { localStorage.setItem(KEY, JSON.stringify({ musicVol, sfxVol, sens, shadows, quality, shake })); } catch { /* private mode */ }
}

export function applySettings() {
  if (!renderer) return;
  const high = game.quality !== 'LOW';
  post.enabled = high;
  renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 1.5 : 1));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = game.shadows !== false;
  renderer.shadowMap.needsUpdate = true;
  resizePost();
}
