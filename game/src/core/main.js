// BLOCKSIDE BAY — boot, main loop and game states (title, play, pause, down).
import { CITY_SIZE } from './config.js';
import { setSeed } from './rng.js';
import { buildCity, updateCity, city } from '../world/city.js';
import { setupSky, updateSky, sky, setHour } from '../world/daylight.js';
import { setupEffects, updateEffects } from '../fx/effects.js';
import { setupVehicles, updateVehicles, vehicles, Vehicle } from '../gameplay/vehicles.js';
import { setupPlayer, updatePlayer, placePlayer, player, syncModel } from '../gameplay/player.js';
import { setupCamera, updateCamera, setCameraPose } from '../gameplay/camera.js';
import { setupInput, endFrame, input, tapped } from './input.js';
import { populateTraffic, updateTraffic } from '../world/traffic.js';
import { setupPedestrians, populatePeds, updatePeds, peds } from '../world/pedestrians.js';
import { toggleVehicle, exitVehicle } from '../gameplay/carjack.js';
import { setupPolice, updatePolice, police, clearWanted, updateHeliGlare } from '../gameplay/police.js';
import { setupCombat, updateCombat, shooters, clearShooters } from '../gameplay/combat.js';
import { setupMissions, updateMissions, failMission, ms } from '../gameplay/missions.js';
import { setupDialogue, updateDialogue, say, clearDialogue } from '../ui/dialogue.js';
import { setupHud, updateHud, showHud, showDown } from '../ui/hud.js';
import { setupMinimap, drawMinimap } from '../ui/minimap.js';
import { initAudio, updateAudio, setRadioPlaying, nextStation, setupAudioEvents, setVolume } from '../audio/radio.js';
import { setupMenus, showTitle, hideMenus, openPause, menuKey } from '../ui/menus.js';
import { saveGame, loadGame } from './save.js';
import { game, on, emit } from './state.js';
import { stageShot } from '../dev/shots.js';
import { setupProgression } from '../gameplay/progression.js';
import { setupPost, resizePost, renderFrame, post } from '../fx/post.js';
import { loadSettings, applySettings, saveSettings } from './settings.js';
import { applyGrade } from '../fx/grade.js';

const THREE = window.THREE;
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
setSeed(Number(params.get('seed') || 1));
// Screenshot mode: CSS blink animations sit still so captures are repeatable.
if (SHOT) document.body.classList.add('shot');

// ---- Renderer + world -------------------------------------------------------------------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!SHOT });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2600);

setupPost(renderer);
loadSettings(renderer, !!SHOT);
buildCity(scene);
setupSky(scene);
setupEffects(scene);
setupVehicles(scene);
setupPlayer(scene);
setupCamera(camera);
setupPedestrians(scene);
setupPolice(scene);
setupCombat(scene, camera);
setupMissions(scene);
setupDialogue();
setupHud(camera);
setupMinimap();
setupAudioEvents();
setupProgression();
setupInput(canvas, onKey);
setupMenus({ newGame, continueGame, resume, save: (s) => { saveGame(s); emit('toast', { text: `SAVED TO SLOT ${s + 1}`, color: '#5dff6a' }); }, quit: quitToTitle, setting });

// Chrome swallows the Esc that releases pointer lock, so losing the lock mid-game pauses.
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && game.mode === 'play' && !SHOT) pause('map');
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  resizePost();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---- States -----------------------------------------------------------------------------
let showcaseCar = null;
const SHOWCASE = { x: CITY_SIZE + 2.5, z: 150 };

function setupShowcase() {
  // The pink Coralline parked on Seaglass Boulevard with Kai leaning beside it.
  if (!showcaseCar || !vehicles.includes(showcaseCar)) showcaseCar = new Vehicle('coralline', SHOWCASE.x, SHOWCASE.z, 0.0, '#ff4fa3');
  showcaseCar.keep = true;
  showcaseCar.x = SHOWCASE.x; showcaseCar.z = SHOWCASE.z; showcaseCar.heading = 0;
  showcaseCar.vx = showcaseCar.vz = 0;
  showcaseCar.sync();
  placePlayer(SHOWCASE.x - 2.1, SHOWCASE.z - 0.6, -0.5);
  player.model.visible = true;
  player.aiming = false;
  syncModel();
}

export function enterTitle() {
  game.mode = 'title';
  showHud(false);
  clearDialogue();
  document.getElementById('dialogue').style.display = 'none';
  if (!SHOT) document.exitPointerLock?.();
  input.wantLock = false;
  setupShowcase();
  showTitle();
  setRadioPlaying(true);
}

function resetRun() {
  Object.assign(game, {
    cash: 2500, health: 100, armor: 50, weapons: { fists: true, pistol: true, smg: false, pump: false },
    ammo: { pistol: 60, smg: 0, pump: 0 }, clip: { pistol: 12, smg: 0, pump: 0 }, weapon: 0, rep: 0, missionsDone: [], activeMission: null,
    stats: { stolen: 0, headshots: 0, kills: 0, shots: 0, hits: 0, distance: 0, maxStars: 0, cuffed: 0, downed: 0, playSeconds: 0, stunts: 0 },
    skills: { driving: 0.2, shooting: 0.15, stamina: 0.3, stealth: 0.1 },
  });
}

function startPlaying(x, z) {
  hideMenus();
  if (player.vehicle) exitVehicle();
  clearWanted();
  placePlayer(x, z, 0);
  game.mode = 'play';
  showHud(true);
  input.wantLock = true;
  setRadioPlaying(false);
  if (!SHOT) initAudio();
  if (peds.length < 10) populatePeds(x, z);
}

function newGame() {
  resetRun();
  game.slot = 0;
  setHour(10.5);
  const s = city.landmarks.safehouse;
  startPlaying(s.x - 7, s.z);
  say('kai', 'Blockside Bay. Six years and the sun still hits like a bat.');
  say('mari', "Kai! It's Mari. Come by the yellow marker outside your place - I've got work.");
}

function continueGame(slot) {
  if (!slot || !slot.data) { newGame(); return; }
  resetRun();
  const pos = loadGame(slot.slot);
  startPlaying(pos.x, pos.z);
  emit('toast', { text: `WELCOME BACK  ·  SLOT ${slot.slot + 1}`, color: '#ffd23f' });
}

function pause(tab = 'map') {
  if (game.mode !== 'play') return;
  game.mode = 'pause';
  document.exitPointerLock?.();
  showHud(false);
  openPause(tab);
}

function resume() {
  hideMenus();
  game.mode = 'play';
  showHud(true);
}

function quitToTitle() {
  hideMenus();
  if (ms.def) failMission('QUIT');
  enterTitle();
}

function setting(id, d) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  if (id === 'music') game.musicVol = clamp((game.musicVol ?? 0.32) + d * 0.032, 0, 0.64);
  if (id === 'sfx') game.sfxVol = clamp((game.sfxVol ?? 0.8) + d * 0.1, 0, 1);
  if (id === 'sens') game.sens = clamp((game.sens ?? 1) + d * 0.2, 0.2, 2);
  if (id === 'shadows') game.shadows = game.shadows === false;
  if (id === 'quality') game.quality = game.quality === 'LOW' ? 'HIGH' : 'LOW';
  if (id === 'shake') game.shake = game.shake === false;
  setVolume(game.musicVol, game.sfxVol);
  applySettings();
  saveSettings();
}

function onKey(code) {
  initAudio();
  if (game.mode === 'title' || game.mode === 'pause') {
    if (code === 'Escape' && game.mode === 'pause') { resume(); return; }
    if (code === 'KeyM' && game.mode === 'pause') { resume(); return; }
    menuKey(code);
    return;
  }
  if (game.mode !== 'play') return;
  if (code === 'Escape') pause('map');
  if (code === 'KeyM') pause('map');
  if (code === 'KeyF') toggleVehicle();
  if (code === 'KeyE') {
    if (player.vehicle) nextStation();
    else talkToNearest();
  }
}

const QUIPS = ['Nice shirt. Very... loud.', 'Have you seen the yacht? Pink, like everything here.', 'Keep it moving, flamingo.', 'The Vipers own Neon Mile after dark. Careful.', 'Sunscreen and bail money. Bay essentials.'];
function talkToNearest() {
  let best = null, bd = 3.5;
  for (const p of peds) { const d = Math.hypot(p.x - player.x, p.z - player.z); if (d < bd && p.state === 'walk') { bd = d; best = p; } }
  if (best) emit('popup', { text: QUIPS[Math.floor(Math.random() * QUIPS.length)], x: best.x, y: 2.4, z: best.z, color: '#ffffff' });
}

// ---- Down / cuffed --------------------------------------------------------------------
let downT = 0, cuffT = 0;
on('playerDown', () => {
  if (game.mode !== 'play') return;
  game.mode = 'down';
  downT = 4;
  game.stats.downed++;
  game.cash = Math.max(0, game.cash - 500);
  if (ms.def) failMission('YOU WERE TAKEN DOWN');
  showDown('FLATLINED', 'Patched up at St. Coral Clinic  ·  -$500');
});
on('cuffing', (dt) => {
  cuffT += dt;
  if (cuffT > 2.2 && game.mode === 'play') {
    game.mode = 'down';
    downT = 4; cuffT = 0;
    game.stats.cuffed++;
    game.cash = Math.max(0, game.cash - 800);
    if (ms.def) failMission('CUFFED BY THE BBPD');
    showDown('CUFFED', 'Released from BBPD holding  ·  -$800');
  }
});

function respawn() {
  showDown(null);
  if (player.vehicle) exitVehicle();
  clearWanted();
  clearShooters((s) => !s.alive || s.faction === 'police');
  game.health = 100;
  const c = city.landmarks.clinic;
  placePlayer(c.x, c.z, 0);
  game.mode = 'play';
}

// ---- Loop -------------------------------------------------------------------------------
let last = SHOT ? 12.5 : performance.now() / 1000, t = 0, frozen = false;
export const loop = { step, render, freeze: (f) => { frozen = f; } };

function step(dt) {
  t += dt;
  const playing = game.mode === 'play' || game.mode === 'down';
  if (game.mode === 'play') {
    game.stats.playSeconds += dt;
    updatePlayer(dt);
    updateCombat(dt, t);
    if (player.vehicle) player.vehicle.controls.handbrake ||= false;
  }
  if (game.mode === 'down') { downT -= dt; if (downT <= 0) respawn(); }
  if (playing || game.mode === 'title') {
    const actors = [...vehicles, ...peds.filter((p) => p.state !== 'dead'), { x: player.x, z: player.z, isPlayer: true }];
    updateTraffic(dt, player.x, player.z, actors);
    updatePeds(dt, player.x, player.z, vehicles);
    if (playing) updatePolice(dt, t);
    updateVehicles(dt, t);
    if (game.mode === 'play') updateMissions(dt, t);
  }
  updateDialogue(dt);
  updateEffects(dt);
  if (game.mode === 'play') cuffT = Math.max(0, cuffT - dt * 0.5);
}

function render(dt, now) {
  const night = updateSky(game.mode === 'pause' ? 0 : dt, player, scene);
  updateCity(t, night);
  if (game.mode === 'title' && !SHOT) {
    const a = now * 0.05;
    setCameraPose(SHOWCASE.x - 9 + Math.sin(a) * 2, 2.6, SHOWCASE.z + 7 + Math.cos(a) * 1.5, SHOWCASE.x - 1.5, 1.6, SHOWCASE.z - 1);
  } else if (game.mode !== 'title' && !frozen) updateCamera(dt, now);
  if (game.mode === 'play' || game.mode === 'down' || SHOT) { updateHud(dt, now); drawMinimap(t); }
  let sirenD = 999;
  for (const v of vehicles) if (v.siren) sirenD = Math.min(sirenD, Math.hypot(v.x - player.x, v.z - player.z));
  const pv = player.vehicle;
  updateAudio(pv ? pv.speed : null, pv ? pv.spec.top : 1, sirenD, pv ? pv.skid || 0 : 0);
  updateHeliGlare(camera, night);
  if (game.mode !== 'play' && !SHOT) post.speed = 0;
  applyGrade(night, sky.hour);
  renderFrame(scene, camera, now);
}

function frame() {
  // Staged screenshots run on a pinned clock so every capture of a scene is identical.
  const now = SHOT ? 12.5 : performance.now() / 1000;
  const dt = Math.min(0.05, now - last);
  last = now;
  if (!frozen) step(dt);
  render(frozen ? 0 : dt, now);
  endFrame();
  requestAnimationFrame(frame);
}

// ---- Boot -------------------------------------------------------------------------------
populateTraffic(SHOWCASE.x, SHOWCASE.z, 18);
populatePeds(SHOWCASE.x, SHOWCASE.z, 20);
setHour(SHOT ? 12 : 17.6);
if (SHOT) {
  stageShot(SHOT, { scene, camera, renderer, loop, enterTitle, startPlaying, pause, setupShowcase, SHOWCASE });
} else {
  enterTitle();
}
requestAnimationFrame(frame);
void [sky, police, shooters, Vehicle, tapped, populateTraffic];
