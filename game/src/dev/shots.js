// Screenshot staging: index.html?shot=<name>&seed=1 builds a deterministic scene with the game's own
// systems (no faked pixels), freezes the simulation and sets window.__shotReady = true.
import { CELL } from '../core/config.js';
import { city } from '../world/city.js';
import { setHour, sky } from '../world/daylight.js';
import { Vehicle, vehicles } from '../gameplay/vehicles.js';
import { player, placePlayer, syncModel } from '../gameplay/player.js';
import { setCameraPose, speedRush } from '../gameplay/camera.js';
import { stealVehicle } from '../gameplay/carjack.js';
import { police, setWanted, spawnUnit, placeHeli, placeRoadblockAt } from '../gameplay/police.js';
import { spawnShooter, shooters } from '../gameplay/combat.js';
import { startMission, ms } from '../gameplay/missions.js';
import { MISSIONS } from '../data/missions-data.js';
import { showLine } from '../ui/dialogue.js';
import { setStation, setRadioPlaying } from '../audio/radio.js';
import { holdPopup, clearCenterText } from '../ui/hud.js';
import { flash, holdFlash, tracer, sparks, spawn, tyreSmoke, updateEffects } from '../fx/effects.js';
import { agePuffs } from '../fx/smoke.js';
import { skidCar } from '../fx/skidmarks.js';
import { post } from '../fx/post.js';
import { spawnTrafficOn } from '../world/traffic.js';
import { spawnPed, peds, removePed, posePed } from '../world/pedestrians.js';
import { WEAPONS } from '../core/config.js';
import { repFromStory } from '../gameplay/progression.js';
import { game } from '../core/state.js';
import { saveGame } from '../core/save.js';

const THREE = window.THREE;

function clearStreet(x0, z0, x1, z1) {
  for (const v of [...vehicles]) if (v.x > x0 && v.x < x1 && v.z > z0 && v.z < z1) v.remove();
  for (const p of [...peds]) if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) removePed(p);
}

function settle(api, frames = 4) {
  for (let i = 0; i < frames; i++) api.loop.render(0, 0);
}

function ready(api) {
  settle(api);
  setTimeout(() => { settle(api, 2); window.__shotReady = true; }, 900);
}

// A pedestrian at an exact spot in a given state (walk / flee / cower), posed by the game's own rig.
function stagePed(x, z, state, yaw, phase) {
  const p = spawnPed(Math.floor(x / CELL), Math.floor(z / CELL), 0);
  Object.assign(p, { x, z, state, yaw, phase, spd: state === 'flee' ? 6.5 : state === 'walk' ? 1.6 : 0, fleeT: 9, keep: true });
  posePed(p);
  return p;
}

// Rubber laid by a car that slid along an S-curve ending at (x, z), heading north (-z).
function layTrail(v, x, z, sway, strength) {
  v.skidPrev = null;
  for (let k = 22; k >= 0; k--) {
    const t = k / 22;
    v.x = x + Math.sin(t * Math.PI * 1.2) * sway; v.z = z + 2.2 + t * 24;
    v.heading = Math.PI + Math.cos(t * Math.PI * 1.2) * sway * 0.12;
    skidCar(v, strength * (0.4 + 0.6 * (1 - t)));
  }
  v.skidPrev = null;
}

// The save state of a player who has finished the first `done` story missions.
function progress(done, extra = {}) {
  game.missionsDone = MISSIONS.slice(0, done).map((m) => m.id);
  for (const m of MISSIONS.slice(0, done)) if (m.unlock) {
    const w = WEAPONS.find((q) => q.id === m.unlock);
    game.weapons[m.unlock] = true; game.clip[m.unlock] = w.clip; game.ammo[m.unlock] = w.clip * 5;
  }
  game.rep = repFromStory(done);
  Object.assign(game, extra);
}

const SCENES = {
  // Cover: golden-hour pursuit down a palm avenue in Neon Mile - four cruisers ramming, a roadblock at the
  // junction, the SKYEYE helicopter's searchlight on the pink Coralline, people diving off the sidewalks.
  chase(api) {
    setHour(18.05); sky.fixed = true;
    const X = 4 * CELL + 3, Z = 2 * CELL + 30;
    clearStreet(X - 30, Z - 140, X + 30, Z + 60);
    api.startPlaying(X, Z + 5);
    const car = new Vehicle('coralline', X, Z, Math.PI, '#ff4fa3');
    stealVehicle(car, true);
    // Lay real rubber: drive the car (and a cruiser) back along the S-curve they just slid through.
    layTrail(car, X, Z, 1.6, 0.9);
    car.x = X; car.z = Z; car.vx = 2.2; car.vz = -31; car.heading = Math.PI + 0.1; car.roll = -0.035; car.health = 64;
    progress(6, { cash: 184250, health: 78, armor: 60, weapon: 2, rep: 5200 });
    startMission(MISSIONS[6], 2);
    ms.timer = 107;
    setWanted(4);
    const units = [
      spawnUnit(X - 3.3, Z + 2.6, Math.PI - 0.16),
      spawnUnit(X + 3.4, Z + 5.2, Math.PI + 0.12),
      spawnUnit(X - 4.0, Z - 9, Math.PI + 0.35),
      spawnUnit(X + 0.6, Z + 11, Math.PI - 0.04),
    ];
    layTrail(units[1], X + 3.4, Z + 5.2, -1.2, 0.6);
    units.forEach((u, i) => { u.vz = -30; u.sync(i % 2 ? 0.07 : 0.2); });
    units[1].x = X + 3.4; units[1].z = Z + 5.2; units[1].heading = Math.PI + 0.12;
    police.seen = true;
    placeRoadblockAt(4 * CELL, 2 * CELL, false);
    police.roadblocks[0].cars.forEach((c, i) => c.sync(0.07 + i * 0.13));
    placeHeli(X + 3.2, 12.2, Z - 17, X + 0.4, Z - 0.5, Math.PI / 2 + 0.5);
    spawnTrafficOn({ i: 4, j: 1 }, { i: 4, j: 2 }, 0.45, 'palomar');
    spawnTrafficOn({ i: 3, j: 2 }, { i: 4, j: 2 }, 0.75, 'bayrunner', '#a6e3ff');
    spawnTrafficOn({ i: 5, j: 2 }, { i: 4, j: 2 }, 0.8, 'cruza', '#3fd0ff');
    for (const v of vehicles) v.sync(0.07);
    // Tyre smoke boiling off the Coralline's rear wheels and the cruiser beside it, plus ram sparks.
    for (let i = 0; i < 10; i++) tyreSmoke(X + (i % 2 ? 1.1 : -1.1) - i * 0.12, Z + 2.4 + i * 0.6, 1.5, 0);
    for (let i = 0; i < 4; i++) tyreSmoke(X + 3.4 + (i % 2 ? 1 : -1), Z + 7.8 + i * 0.6, 0, 0);
    agePuffs((i) => 0.15 + (i % 10) / 10 * 0.6);
    sparks(X - 1.4, 0.8, Z + 3.4, 26);
    sparks(X + 1.6, 0.7, Z + 4.4, 14);
    // People on both sidewalks scattering from the chase.
    const W = 4 * CELL - 7.6, E = 4 * CELL + 7.6;
    const crowd = [
      [E + 0.4, Z - 3, 'flee', 0.5], [E + 1.6, Z - 7.5, 'cower', -2.4], [E + 0.2, Z - 12, 'flee', 0.9], [E + 1.2, Z - 17, 'flee', 2.6],
      [E - 0.2, Z - 25, 'flee', 1.4], [E + 2.0, Z - 31, 'walk', 3.1],
      [W - 0.3, Z - 1.5, 'flee', -0.6], [W - 1.4, Z - 6.5, 'cower', 2.2], [W + 0.2, Z - 11, 'flee', -1.1], [W - 0.8, Z - 16, 'flee', -2.7],
      [W - 0.2, Z - 23, 'flee', -1.3], [W - 1.6, Z - 29, 'cower', 1.8], [W - 0.5, Z - 36, 'walk', 0],
    ];
    crowd.forEach(([x, z, st, yaw], i) => stagePed(x, z, st, yaw, i * 1.7));
    setStation(0); setRadioPlaying(true);
    showLine('mari', "You've got the whole BBPD on your bumper. Lose them before the yacht leaves Coral Pier!");
    player.camYaw = Math.PI;
    player.model.visible = false;
    post.speed = speedRush(car) * 0.85;
    clearCenterText();
    setCameraPose(X + 1.6, 5.2, Z + 13.5, X - 0.8, 2.6, Z - 16);
    updateEffects(0);
    api.loop.freeze(true);
    ready(api);
  },

  // Title screen over the live city: Kai beside the pink Coralline on Seaglass Boulevard.
  title(api) {
    setHour(7.9); sky.fixed = true;
    const S = api.SHOWCASE;
    // A previous session in slot 1 so CONTINUE shows real progress.
    game.missionsDone = MISSIONS.slice(0, 6).map((m) => m.id);
    game.cash = 184250;
    game.skills = { driving: 0.7, shooting: 0.55, stamina: 0.6, stealth: 0.4 };
    Object.assign(game.stats, { stolen: 31 });
    placePlayer(city.landmarks.pier.x - 60, city.landmarks.pier.z, 0);
    saveGame(0);
    clearStreet(S.x - 20, S.z - 30, S.x + 20, S.z + 30);
    api.enterTitle();
    spawnTrafficOn({ i: 8, j: 2 }, { i: 8, j: 3 }, 0.2, 'palomar');
    for (const v of vehicles) v.sync(0);
    player.x = S.x - 1.9; player.z = S.z - 2.6; player.yaw = 0.35;
    syncModel();
    const pr = player.model.userData.parts;
    pr.armL.rotation.z = -0.25; pr.armR.rotation.x = -0.4; pr.legL.rotation.x = 0.12; pr.legR.rotation.x = -0.12;
    setCameraPose(S.x - 3.2, 2.2, S.z + 9.5, S.x - 6.4, 2.6, S.z - 6);
    api.loop.freeze(true);
    ready(api);
  },

  // Night on Neon Mile: SMG fire at Rico Ocampo's Vipers, a headshot pop-up mid-fight.
  combat(api) {
    setHour(22.3); sky.fixed = true;
    const X = 4 * CELL + 26, Z = 2 * CELL + 1.5;
    clearStreet(X - 60, Z - 25, X + 60, Z + 25);
    api.startPlaying(X, Z);
    game.cash = 61420; game.health = 72; game.armor = 45;
    game.weapons.smg = true; game.weapon = 2; game.clip.smg = 24; game.ammo.smg = 150;
    game.missionsDone = MISSIONS.slice(0, 4).map((m) => m.id);
    startMission(MISSIONS[4], 1);
    // Re-place the squad along the street ahead of the player.
    for (const s of [...shooters]) { s.x = 9999; }
    const spots = [[11, -3.2], [15, 2.8], [19.5, -1.5], [9, 4.2], [24, 3.4], [13.5, -4.6]];
    const sq = ms.enemies;
    sq.forEach((s, i) => {
      const p = spots[i % spots.length];
      s.x = X + p[0]; s.z = Z + p[1]; s.yaw = -Math.PI / 2 + (i % 2 ? 0.2 : -0.2);
      s.phase = i;
    });
    const boss = sq.find((s) => s.boss);
    boss.x = X + 16.5; boss.z = Z + 0.4;
    const downed = sq.filter((s) => !s.boss).slice(0, 3);
    downed.forEach((s, i) => { s.alive = false; s.deadT = 1; s.fallDir = Math.PI / 2 + (i - 1) * 0.4; s.x = X + 6 + i * 3.2; s.z = Z + (i - 1) * 2.4 + 0.6; });
    for (const s of shooters) {
      s.model.position.set(s.x, 0, s.z);
      if (!s.alive) { s.model.rotation.set(0, s.fallDir, 0); s.model.rotateX(-Math.PI / 2); s.model.position.y = 0.2; }
      else { s.model.rotation.set(0, s.yaw, 0); const pr = s.model.userData.parts; pr.armR.rotation.x = -Math.PI / 2; pr.armL.rotation.x = -1.2; pr.legL.rotation.x = 0.3 * Math.sin(s.phase); pr.legR.rotation.x = -0.3 * Math.sin(s.phase); }
    }
    setWanted(2); police.seen = true;
    const cruiser = spawnUnit(X + 46, Z - 2.5, -Math.PI / 2 + 0.1);
    cruiser.sync(0.07);
    placePlayer(X, Z, Math.PI / 2);
    player.yaw = Math.PI / 2; player.camYaw = Math.PI / 2; player.aiming = true;
    syncModel();
    const pr = player.model.userData.parts;
    pr.legL.rotation.x = 0.35; pr.legR.rotation.x = -0.3;
    // Muzzle flash, tracers and the headshot pop-up
    const m = new THREE.Vector3(X + 0.9, 1.55, Z - 0.42);
    flash(m.x, m.y, m.z, 1.8); holdFlash();
    const victim = sq.filter((s) => s.alive && !s.boss).sort((a, b) => a.z - b.z)[0];
    tracer(m, new THREE.Vector3(victim.x, 1.9, victim.z));
    tracer(new THREE.Vector3(boss.x - 0.9, 1.55, boss.z - 0.4), new THREE.Vector3(X + 0.6, 1.3, Z + 0.8));
    spawn(victim.x, 1.9, victim.z, 0, 0.5, 0, 99, 0.25, '#c0102a');
    for (let i = 0; i < 10; i++) spawn(victim.x + (i % 3) * 0.15 - 0.15, 1.7 + (i % 4) * 0.12, victim.z + (i % 2) * 0.2, 0, 0, 0, 99, 0.16, '#d0182a');
    for (let i = 0; i < 6; i++) spawn(X + 3 + i * 0.4, 0.06, Z - 0.6 + (i % 2) * 0.3, 0, 0, 0, 99, 0.12, '#ffd040');
    holdPopup({ text: 'HEADSHOT +$150', x: victim.x + 1, y: 3.6, z: victim.z, color: '#ffe14a', big: true });
    clearCenterText();
    showLine('ocampo', 'Navarro! This is MY mile. Every light on this street answers to me!');
    holdPopup({ text: 'BOSS: RICO OCAMPO', x: boss.x, y: 2.45, z: boss.z, color: '#e08bff' });
    setCameraPose(X - 4.4, 2.8, Z + 2.5, X + 14, 1.5, Z - 0.6);
    api.loop.freeze(true);
    ready(api);
  },

  // Pause menu MAP tab mid-story.
  map(api) {
    setHour(15.5); sky.fixed = true;
    const s = city.landmarks.diner;
    api.startPlaying(s.x + 20, s.z - 10);
    game.cash = 48210;
    game.missionsDone = MISSIONS.slice(0, 4).map((m) => m.id);
    game.skills = { driving: 0.62, shooting: 0.48, stamina: 0.71, stealth: 0.33 };
    Object.assign(game.stats, { stolen: 23, headshots: 41, kills: 96, shots: 820, hits: 455, distance: 48200, maxStars: 4, cuffed: 2, downed: 3, playSeconds: 3 * 3600 + 42 * 60 });
    game.slot = 0;
    saveGame(0);
    api.pause('map');
    api.loop.freeze(true);
    ready(api);
  },
};

export function stageShot(name, api) {
  const fn = SCENES[name];
  if (!fn) { console.error('unknown shot', name); window.__shotReady = true; return; }
  fn(api);
}
// Debug handle for tools/playtest.mjs.
window.__bb = { police, vehicles, player, game, ms, placePlayer };
