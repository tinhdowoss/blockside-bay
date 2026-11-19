// Entering, leaving and stealing vehicles (F). Pulling a driver out is a crime: +1 wanted star.
// Boats board from up to 8.5 m and drop the player on the nearest shore.
import { player } from './player.js';
import { snapCamera } from './camera.js';
import { nearestVehicle } from './vehicles.js';
import { spawnPed } from '../world/pedestrians.js';
import { addWanted, detachUnit } from './police.js';
import { game, emit, bumpSkill } from '../core/state.js';
import { CELL, GRID_N } from '../core/config.js';
import { shoreSpot } from './boats.js';

const REACH = 5;        // metres to a car door
const BOAT_REACH = 8.5; // boats sit off the seawall, so they can be boarded from a little further away

/** F key: leaves the current vehicle, or takes the nearest one in reach. */
export function toggleVehicle() {
  if (player.vehicle) return exitVehicle();
  const v = nearestVehicle(player.x, player.z, BOAT_REACH, (c) => !c.wrecked && Math.hypot(c.x - player.x, c.z - player.z) < (c.spec.boat ? BOAT_REACH : REACH));
  if (!v) return false;
  return stealVehicle(v);
}

/** Puts the player in v. Unowned vehicles count as stolen and (unless quiet) raise the wanted level. */
export function stealVehicle(v, quiet = false) {
  const hadDriver = v.driver === 'traffic' || v.driver === 'police';
  if (hadDriver) ejectDriver(v);
  detachUnit(v);
  const crime = !v.owned;
  v.driver = 'player';
  v.ai = null;
  v.keep = true;
  if (v.police) v.siren = false;
  player.vehicle = v;
  player.camYaw = v.heading;
  snapCamera();
  if (crime && !v.stolen) {
    v.stolen = true;
    game.stats.stolen++;
    bumpSkill('stealth', 0.01);
    if (!quiet) {
      const stars = v.police ? 2 : 1;
      addWanted(stars, v.x, v.z);
      emit('crime', { x: v.x, z: v.z, kind: 'carjack' });
      const tag = `+${stars} STAR${stars > 1 ? 'S' : ''}`;
      const what = v.police ? 'COP CAR STOLEN!' : hadDriver ? 'CARJACKED!' : v.spec.boat ? 'BOAT TAKEN' : v.spec.bike ? 'SCOOTER STOLEN' : 'CAR STOLEN';
      emit('toast', { text: `${what}  ${tag}`, color: '#ff5fa2' });
    }
  }
  emit('enterVehicle', v);
  return true;
}

// The old driver lands on the street beside the car and runs.
function ejectDriver(v) {
  const bx = Math.max(0, Math.min(GRID_N - 1, Math.floor(v.x / CELL)));
  const bz = Math.max(0, Math.min(GRID_N - 1, Math.floor(v.z / CELL)));
  const ped = spawnPed(bx, bz, 0, v.police ? { look: { shirt: '#1d3c8f', pants: '#1d2440', hat: '#1d2440', badge: true } } : {});
  const sideX = Math.cos(v.heading), sideZ = -Math.sin(v.heading);
  ped.x = v.x + sideX * 2.2; ped.z = v.z + sideZ * 2.2;
  ped.state = 'flee'; ped.fleeT = 6; ped.fx = sideX; ped.fz = sideZ;
}

/** Steps out on the driver's side (or onto the nearest shore from a boat); false if that is not possible. */
export function exitVehicle() {
  const v = player.vehicle;
  if (!v) return false;
  // Off a boat: step onto the nearest dry spot, or stay aboard out at sea.
  const shore = v.spec.boat ? shoreSpot(v) : null;
  if (v.spec.boat && !shore) { emit('toast', { text: 'TOO FAR FROM SHORE', color: '#3fd0ff' }); return false; }
  v.driver = null;
  v.controls.throttle = 0; v.controls.brake = 0; v.controls.steer = 0; v.controls.handbrake = true;
  const sideX = Math.cos(v.heading), sideZ = -Math.sin(v.heading);
  player.x = shore ? shore.x : v.x + sideX * 2.3; player.z = shore ? shore.z : v.z + sideZ * 2.3;
  player.yaw = v.heading;
  player.vehicle = null;
  emit('exitVehicle', v);
  return true;
}
