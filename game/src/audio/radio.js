// Audio front door used by the rest of the game. Everything is procedural WebAudio (no files):
//   mixer.js    master bus (compressor -> limiter -> soft clip), reverb + delay sends, helpers
//   music.js    four radio stations with drums, bass, chords, lead and arpeggio
//   sfx.js      weapons, impacts, UI, and the engine / screech / siren voices (pan + doppler)
//   ambience.js surf, city hum, gulls, crickets, distant club bass
// Volumes follow the settings (music slider -> music bus; effects slider -> sfx, ambience, ui).
import { STATIONS } from '../core/config.js';
import { game, on } from '../core/state.js';
import { mix, createMixer, setBus } from './mixer.js';
import { radio, setStationMusic, scheduleMusic, setMusicVolume, musicLevels } from './music.js';
import * as S from './sfx.js';
import { updateAmbience } from './ambience.js';
import { vehicles } from '../gameplay/vehicles.js';
import { player } from '../gameplay/player.js';
import { sky } from '../world/daylight.js';

export const { blip, uiClick, uiHover, uiSwoosh, uiTick, jingle, checkpointSfx, coin, gunshot } = S;

export function initAudio() {
  if (mix.ac) { if (mix.ac.state === 'suspended') mix.ac.resume(); return; }
  if (!createMixer()) return;
  setVolume(game.musicVol ?? 0.32, game.sfxVol ?? 0.8);
  setStationMusic(game.radioStation ?? 0);
  setInterval(() => scheduleMusic(radio.on && game.mode !== 'pause'), 50);
}

// Music / effects bus levels plus the master output level (Settings: MASTER, MUSIC, EFFECTS).
export function setVolume(music, sfx, master = game.masterVol ?? 1) {
  setMusicVolume(music ?? 0.32);
  if (!mix.ac) return;
  const v = sfx ?? 0.8;
  setBus(mix.sfx, v); setBus(mix.amb, v * 0.9); setBus(mix.ui, v);
  setBus(mix.out, 0.85 * master);
}

export function setStation(i) { setStationMusic(i); game.radioStation = radio.station; }
export function nextStation() { setStation(radio.station + 1); S.blip(880); }
export function setRadioPlaying(on_) { radio.on = on_; }

let lastT = 0;
// Called every rendered frame with the camera (listener position and facing).
export function updateAudio(dt, camera) {
  if (!mix.ac) return;
  const yaw = camera ? Math.atan2(-camera.matrixWorld.elements[8], -camera.matrixWorld.elements[10]) : player.camYaw;
  S.setListener(camera ? camera.position.x : player.x, camera ? camera.position.z : player.z, yaw, dt);
  const playing = game.mode === 'play';
  let siren = null, sd = 1e9;
  for (const v of vehicles) if (v.siren) { const d = Math.hypot(v.x - S.listener.x, v.z - S.listener.z); if (d < sd) { sd = d; siren = v; } }
  S.updateVoices(dt, player.vehicle, siren, playing);
  lastT += dt;
  updateAmbience(dt, lastT, sky.night, playing || game.mode === 'down');
}

export function radioInfo(t = performance.now() / 1000) {
  return { ...STATIONS[radio.station], levels: musicLevels(t) };
}

export function setupAudioEvents() {
  on('gunshot', (e) => S.gunshot(e.weapon, e.x, e.z, e.by === 'player'));
  on('punch', S.punch);
  on('crash', (impact) => S.crash(impact));
  on('carHit', (e) => S.crash(e.impact, e.a?.x, e.a?.z));
  on('explosion', (v) => S.boom(v?.x, v?.z));
  on('honk', S.horn);
  on('reload', S.reloadSfx);
  on('dryfire', S.dryFire);
  on('hurt', S.hurtSfx);
  // The car radio plays while you are in a vehicle (the title screen turns it on by itself).
  on('enterVehicle', () => { S.door(true); radio.on = true; });
  on('exitVehicle', () => { S.door(false); if (game.mode === 'play') radio.on = false; });
  on('cash', (n) => { if (n > 0) S.coin(); });
  on('wanted', (n) => { if (n > 0) S.stinger(true); });
  on('lostCops', () => S.stinger(false));
  on('missionPassed', () => S.jingle(true));
  on('missionFailed', () => S.jingle(false));
  on('weapon', () => S.blip(520));
  // Side activities
  on('checkpoint', (e) => S.checkpointSfx(e?.last));
  on('countdown', (n) => S.blip(n > 0 ? 660 : 1320));
  on('activityDone', () => S.jingle(true));
  on('purchase', () => S.coin());
  on('denied', () => S.dryFire());
  on('uiOpen', () => S.uiClick());
  on('door', () => S.door(true));
  on('shell', (e) => { S.checkpointSfx(true); if (e?.all) S.jingle(true); });
}
