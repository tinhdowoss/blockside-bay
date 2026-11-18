// What happens when things go wrong: being taken down (FLATLINED, patched up at St. Coral Clinic for
// $500), cuffed by a cop at one star (CUFFED, $800), or caught in a car blast (the driver is thrown
// out, anyone within 7 m is hurt). Either of the first two fails a running story mission; after four
// seconds the player respawns at the clinic with the heat cleared.
import { game, on } from '../core/state.js';
import { city } from '../world/city.js';
import { player, placePlayer } from './player.js';
import { exitVehicle } from './carjack.js';
import { clearWanted } from './police.js';
import { clearShooters, hurtPlayer } from './combat.js';
import { ms, failMission } from './missions.js';
import { showDown } from '../ui/hud.js';

let downT = 0, cuffT = 0;

function goDown(title, sub, fine, reason) {
  game.mode = 'down';
  downT = 4;
  game.cash = Math.max(0, game.cash - fine);
  if (ms.def) failMission(reason);
  showDown(title, sub);
}

export function setupConsequences() {
  on('explosion', (v) => {
    if (!v || game.mode !== 'play') return;
    if (player.vehicle === v) { exitVehicle(); hurtPlayer(70, v.x, v.z); return; }
    const d = Math.hypot(player.x - v.x, player.z - v.z);
    if (d < 7) hurtPlayer(55 * (1 - d / 7), v.x, v.z);
  });
  on('playerDown', () => {
    if (game.mode !== 'play') return;
    game.stats.downed++;
    goDown('FLATLINED', 'Patched up at St. Coral Clinic  ·  -$500', 500, 'YOU WERE TAKEN DOWN');
  });
  on('cuffing', (dt) => {
    cuffT += dt;
    if (cuffT > 2.2 && game.mode === 'play') {
      cuffT = 0;
      game.stats.cuffed++;
      goDown('CUFFED', 'Released from BBPD holding  ·  -$800', 800, 'CUFFED BY THE BBPD');
    }
  });
}

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

export function updateConsequences(dt) {
  if (game.mode === 'down') { downT -= dt; if (downT <= 0) respawn(); }
  if (game.mode === 'play') cuffT = Math.max(0, cuffT - dt * 0.5);
}
