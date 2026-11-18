// Entering, leaving and stealing vehicles (F). Pulling a driver out is a crime: +1 wanted star.
// Boats board from up to 8.5 m and drop the player on the nearest shore.
import { player } from './player.js';
import { snapCamera } from './camera.js';
import { nearestVehicle } from './vehicles.js';
import { spawnPed, peds } from '../world/pedestrians.js';
import { addWanted, detachUnit } from './police.js';
import { game, emit, bumpSkill } from '../core/state.js';
import { CELL, GRID_N } from '../core/config.js';
import { shoreSpot } from './boats.js';

const REACH = 5;

export function toggleVehicle() {
  if (player.vehicle) return exitVehicle();
  // Boats sit off the seawall, so they can be boarded from a little further away.
  const v = nearestVehicle(player.x, player.z, 8.5, (c) => !c.wrecked && Math.hypot(c.x - player.x, c.z - player.z) < (c.spec.boat ? 8.5 : REACH));
  if (!v) return false;
  return stealVehicle(v);
}

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

function ejectDriver(v) {
  // The old driver lands on the street beside the car and runs.
  const bx = Math.max(0, Math.min(GRID_N - 1, Math.floor(v.x / CELL)));
  const bz = Math.max(0, Math.min(GRID_N - 1, Math.floor(v.z / CELL)));
  const p = spawnPed(bx, bz, 0, v.police ? { look: { shirt: '#1d3c8f', pants: '#1d2440', hat: '#1d2440', badge: true } } : {});
  const sx = Math.cos(v.heading), sz = -Math.sin(v.heading);
  p.x = v.x + sx * 2.2; p.z = v.z + sz * 2.2;
  p.state = 'flee'; p.fleeT = 6; p.fx = sx; p.fz = sz;
  void peds;
}

export function exitVehicle() {
  const v = player.vehicle;
  if (!v) return false;
  // Off a boat: step onto the nearest dry spot, or stay aboard out at sea.
  const shore = v.spec.boat ? shoreSpot(v) : null;
  if (v.spec.boat && !shore) { emit('toast', { text: 'TOO FAR FROM SHORE', color: '#3fd0ff' }); return false; }
  v.driver = null;
  v.controls.throttle = 0; v.controls.brake = 0; v.controls.steer = 0; v.controls.handbrake = true;
  const sx = Math.cos(v.heading), sz = -Math.sin(v.heading);
  player.x = shore ? shore.x : v.x + sx * 2.3; player.z = shore ? shore.z : v.z + sz * 2.3;
  player.yaw = v.heading;
  player.vehicle = null;
  emit('exitVehicle', v);
  return true;
}
