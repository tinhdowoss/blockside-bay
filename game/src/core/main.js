// BLOCKSIDE BAY: boot (renderer, world, systems), game states (title, play, pause) and the main loop
// that steps every system in order. Gameplay rules live in gameplay/*; this file only wires them up.
import { CITY_SIZE } from './config.js';
import { setSeed } from './rng.js';
import { buildCity, updateCity, city, mats as cityMats } from '../world/city.js';
import { setupSky, updateSky, sky, setHour } from '../world/daylight.js';
import { setupEffects, updateEffects } from '../fx/effects.js';
import { setupVehicles, updateVehicles, vehicles, Vehicle } from '../gameplay/vehicles.js';
import { setupPlayer, updatePlayer, placePlayer, player, syncModel } from '../gameplay/player.js';
import { setupCamera, updateCamera, setCameraPose } from '../gameplay/camera.js';
import { setupInput, endFrame, input } from './input.js';
import { populateTraffic, updateTraffic } from '../world/traffic.js';
import { setupPedestrians, populatePeds, updatePeds, peds } from '../world/pedestrians.js';
import { toggleVehicle, exitVehicle } from '../gameplay/carjack.js';
import { setupPolice, updatePolice, clearWanted, updateHeliGlare } from '../gameplay/police.js';
import { setupCombat, updateCombat } from '../gameplay/combat.js';
import { setupConsequences, updateConsequences } from '../gameplay/consequences.js';
import { BOAT_SPOTS } from '../gameplay/boats.js';
import { setupWeapons, updateWeapons } from '../gameplay/weapons.js';
import { updateEnemies } from '../gameplay/enemies.js';
import { setupPickups, updatePickups } from '../gameplay/pickups.js';
import { buildCover } from '../world/cover.js';
import { setupMissions, updateMissions, failMission, ms } from '../gameplay/missions.js';
import { setupDialogue, updateDialogue, say, clearDialogue } from '../ui/dialogue.js';
import { setupHud, updateHud, showHud } from '../ui/hud.js';
import { setupMinimap, drawMinimap } from '../ui/minimap.js';
import { initAudio, updateAudio, setRadioPlaying, nextStation, setupAudioEvents } from '../audio/radio.js';
import { setupStats, updateStats, freshStats } from '../gameplay/stats.js';
import { setupMenus, showTitle, hideMenus, openPause, menuKey } from '../ui/menus.js';
import { saveGame, loadGame } from './save.js';
import { game, emit } from './state.js';
import { stageShot } from '../dev/shots.js';
import { setupProgression } from '../gameplay/progression.js';
import { setupPost, resizePost, renderFrame, post } from '../fx/post.js';
import { loadSettings } from './settings.js';
import { applyGrade } from '../fx/grade.js';
import { buildLandmarks, updateLandmarks } from '../world/landmarks.js';
import { buildStorefronts } from '../world/storefronts.js';
import { buildFurniture, updateFurniture } from '../world/furniture.js';
import { buildClouds, updateClouds } from '../world/clouds.js';
import { setupCarLights, updateCarLights } from '../fx/carlights.js';
import { setupActivities, updateActivities, updateActivityHud, defaultSide, abortActivity } from '../gameplay/activities.js';
import { setupResults, updateResults, resultsKey, dismissResults } from '../ui/results.js';
import { resetLocation } from '../ui/location.js';

const THREE = window.THREE;
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
setSeed(Number(params.get('seed') || 1));
// Screenshot mode: CSS blink animations sit still so captures are repeatable.
if (SHOT) document.body.classList.add('shot');
game.shot = SHOT;

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

// Setup order matters: the city exists before anything that reads it, and the HUD and menus last.
setupPost(renderer);
loadSettings(renderer, !!SHOT);
buildCity(scene);
buildLandmarks(city.group, cityMats.wood);
buildStorefronts(city.group);
buildFurniture(city.group);
buildCover(city.group);
setupSky(scene);
buildClouds(scene);
setupCarLights(scene);
setupEffects(scene);
setupVehicles(scene);
setupPlayer(scene);
setupCamera(camera);
setupPedestrians(scene);
setupPolice(scene);
setupCombat(scene);
setupWeapons(camera);
setupPickups(scene);
setupMissions(scene);
setupActivities(scene);
setupDialogue();
setupResults();
setupHud(camera);
setupMinimap();
setupAudioEvents();
setupProgression();
setupConsequences();
setupStats();
setupInput(canvas, onKey);
setupMenus({ newGame, continueGame, resume, save: (s) => { saveGame(s); emit('toast', { text: `SAVED TO SLOT ${s + 1}`, color: '#5dff6a' }); }, quit: quitToTitle });

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

// The pink Coralline parked on Seaglass Boulevard with Kai leaning beside it (title backdrop).
function setupShowcase() {
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

/** Switches to the title screen: HUD off, showcase staged, radio on. */
export function enterTitle() {
  game.mode = 'title';
  showHud(false);
  dismissResults();
  clearDialogue();
  document.getElementById('dialogue').style.display = 'none';
  if (!SHOT) document.exitPointerLock?.();
  input.wantLock = false;
  setupShowcase();
  showTitle();
  setRadioPlaying(true);
}

// Fresh-run values for everything a new game (or a load, before the slot is applied) resets.
function resetRun() {
  Object.assign(game, {
    cash: 2500, health: 100, armor: 50, weapons: { fists: true, pistol: true, smg: false, pump: false, lance: false },
    ammo: { pistol: 60, smg: 0, pump: 0, lance: 0 }, clip: { pistol: 12, smg: 0, pump: 0, lance: 0 }, weapon: 0, rep: 0, missionsDone: [], missionBest: {}, tipsSeen: [], activeMission: null, side: defaultSide(), sideBusy: false,
    stats: freshStats(),
    skills: { driving: 0.2, shooting: 0.15, stamina: 0.3, stealth: 0.1 },
  });
}

function startPlaying(x, z) {
  hideMenus();
  abortActivity();
  if (player.vehicle) exitVehicle();
  clearWanted();
  placePlayer(x, z, 0);
  resetLocation();
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
  const safehouse = city.landmarks.safehouse;
  startPlaying(safehouse.x - 7, safehouse.z);
  emit('playStart', true);
  say('kai', 'Blockside Bay. Six years and the sun still hits like a bat.');
  say('mari', "Kai! It's Mari. Come by the yellow marker outside your place - I've got work.");
}

function continueGame(slot) {
  if (!slot || !slot.data) { newGame(); return; }
  resetRun();
  const pos = loadGame(slot.slot);
  startPlaying(pos.x, pos.z);
  emit('playStart', false);
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
  abortActivity();
  enterTitle();
}

// Global key handler: menus get every key while open; in play, Esc/M pause, F enters/exits, E talks or tunes.
function onKey(code) {
  initAudio();
  if (game.mode === 'title' || game.mode === 'pause') {
    if (code === 'Escape' && game.mode === 'pause') { resume(); return; }
    if (code === 'KeyM' && game.mode === 'pause') { resume(); return; }
    menuKey(code);
    return;
  }
  if (game.mode !== 'play') return;
  if (resultsKey(code)) return;
  if (code === 'Escape') pause('map');
  if (code === 'KeyM') pause('map');
  if (code === 'KeyF') toggleVehicle();
  if (code === 'KeyE') {
    if (player.vehicle) nextStation();
    else talkToNearest();
  }
}

const QUIPS = ['Nice shirt. Very... loud.', 'Have you seen the yacht? Pink, like everything here.', 'Keep it moving, flamingo.', 'The Vipers own Neon Mile after dark. Careful.', 'Sunscreen and bail money. Bay essentials.'];
// A walking pedestrian within 3.5 m answers with a random quip bubble.
function talkToNearest() {
  let best = null, bestDist = 3.5;
  for (const p of peds) { const d = Math.hypot(p.x - player.x, p.z - player.z); if (d < bestDist && p.state === 'walk') { bestDist = d; best = p; } }
  if (best) emit('popup', { text: QUIPS[Math.floor(Math.random() * QUIPS.length)], x: best.x, y: 2.4, z: best.z, color: '#ffffff' });
}

// ---- Loop -------------------------------------------------------------------------------
let last = SHOT ? 12.5 : performance.now() / 1000, t = 0, frozen = false;
export const loop = { step, render, freeze: (f) => { frozen = f; } };

// Simulation: advances every system by dt seconds (skipped while frozen for staged shots).
function step(dt) {
  t += dt;
  const playing = game.mode === 'play' || game.mode === 'down';
  if (game.mode === 'play') {
    game.stats.playSeconds += dt;
    updatePlayer(dt);
    updateStats(dt);
  }
  // Side activities first: an open shop menu swallows the number keys before combat sees them.
  updateActivities(dt, t, camera);
  if (game.mode === 'play') {
    updateWeapons(dt);
    updateEnemies(dt);
    updateCombat(dt);
    updatePickups(dt, t);
    if (player.vehicle) player.vehicle.controls.handbrake ||= false;
  }
  updateConsequences(dt);
  if (playing || game.mode === 'title') {
    const actors = [...vehicles, ...peds.filter((p) => p.state !== 'dead'), { x: player.x, z: player.z, isPlayer: true }];
    updateTraffic(dt, player.x, player.z, actors);
    updatePeds(dt, player.x, player.z, vehicles);
    if (playing) updatePolice(dt, t);
    updateVehicles(dt, t);
    if (game.mode === 'play') updateMissions(dt, t);
  }
  updateDialogue(dt);
  updateResults(dt);
  updateEffects(dt);
}

let hurt = 0, lastHealth = 100;
// Presentation: sky, animated world dressing, camera, HUD, audio listener, grade and the final frame.
function render(dt, now) {
  const night = updateSky(game.mode === 'pause' ? 0 : dt, player, scene);
  const worldDt = game.mode === 'pause' ? 0 : dt;
  updateCity(t, night, player);
  updateLandmarks(t, worldDt, night);
  updateFurniture(worldDt);
  updateClouds(worldDt, player);
  updateCarLights(player, night, t, player.vehicle);
  if (game.mode === 'title' && !SHOT) {
    const a = now * 0.05;
    setCameraPose(SHOWCASE.x - 9 + Math.sin(a) * 2, 2.6, SHOWCASE.z + 7 + Math.cos(a) * 1.5, SHOWCASE.x - 1.5, 1.6, SHOWCASE.z - 1);
  } else if (game.mode !== 'title' && !frozen) updateCamera(dt, now);
  if (game.mode === 'play' || game.mode === 'down' || SHOT) { updateHud(dt, now); updateActivityHud(); drawMinimap(t); }
  updateAudio(dt, camera);
  updateHeliGlare(camera, night);
  if (game.mode !== 'play' && !SHOT) post.speed = 0;
  // A hit flashes the vignette red for a moment.
  if (game.health < lastHealth && game.mode === 'play') hurt = Math.min(1, hurt + (lastHealth - game.health) / 25);
  lastHealth = game.health ?? 100;
  hurt = Math.max(0, hurt - dt * 1.6);
  applyGrade(night, sky.hour, SHOT ? 0 : hurt);
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
for (const b of BOAT_SPOTS) new Vehicle('skiff', b.x, b.z, b.heading, b.color).keep = true;
populatePeds(SHOWCASE.x, SHOWCASE.z, 20);
setHour(SHOT ? 12 : 17.6);
if (SHOT) {
  stageShot(SHOT, { scene, camera, renderer, loop, enterTitle, startPlaying, pause, setupShowcase, SHOWCASE });
} else {
  enterTitle();
}
requestAnimationFrame(frame);
