// Boats on the bay: two BAY SKIFFs wait at the water's edge (Mangrove Marina on the west seawall and off
// Seaglass Beach by Coral Pier). A boat only moves on open water: the sea is the area covered by the
// city's out-of-bounds water boxes, so it bumps off the seawall, the beach and the pier. Leaving a boat
// puts the player on the nearest dry spot within 12 m (and refuses out at sea).
import { city, collideCircle, PIER_Z } from '../world/city.js';
import { OCEAN_X } from '../core/config.js';

let sea = null;
const seaBoxes = () => (sea ||= city.colliders.filter((c) => c.low && c.h === 0));

export function isWater(x, z) {
  return seaBoxes().some((c) => x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ);
}

// Keep a boat's bow and stern on the water; returns the push-back normal and impact speed if it hit.
export function boatCollide(v, px, pz) {
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading), off = v.spec.len * 0.42;
  const ok = (x, z) => isWater(x + fx * off, z + fz * off) && isWater(x - fx * off, z - fz * off) && isWater(x, z);
  if (ok(v.x, v.z)) return null;
  // Slide along whichever axis is still open water, else stop dead.
  if (ok(v.x, pz)) { const imp = Math.abs(v.vz); v.z = pz; v.vz *= -0.3; return imp; }
  if (ok(px, v.z)) { const imp = Math.abs(v.vx); v.x = px; v.vx *= -0.3; return imp; }
  const imp = v.speed;
  v.x = px; v.z = pz; v.vx *= -0.3; v.vz *= -0.3;
  return imp;
}

// Nearest dry, walkable spot to a boat (null if the shore is more than 12 m away).
export function shoreSpot(v) {
  for (let r = 2.5; r <= 12; r += 1.5) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, x = v.x + Math.sin(a) * r, z = v.z + Math.cos(a) * r;
      if (isWater(x, z)) continue;
      const q = collideCircle(x, z, 0.5);
      if (!q.hit && !isWater(q.x, q.z)) return { x: q.x, z: q.z };
    }
  }
  return null;
}

export const BOAT_SPOTS = [
  { x: -32.5, z: 255.5, heading: -Math.PI / 2, color: '#2ee6c8' },             // Mangrove Marina, nose out to sea
  { x: OCEAN_X + 10, z: PIER_Z - 22, heading: Math.PI / 2, color: '#ff4fa3' },  // off Seaglass Beach, south of the pier
];
