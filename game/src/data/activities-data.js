// Side activities: where they are, what they pay. All names are invented for Blockside Bay.
//   races        - time trials along the road grid; checkpoints are road junctions (i, j) * CELL
//   sites        - garages, gun shops, the courier depot and the cab stand (x, z = interaction spot)
//   shop / tune  - price lists for the gun counter and the garage
//   shells       - hidden SEA GLASS shards (generated on sidewalks, parks, beach and pier)
import { CELL, GRID_N, ROAD_W, WALK_W, CITY_SIZE, OCEAN_X } from '../core/config.js';
import { makeRng } from '../core/rng.js';

export const RACES = [
  { id: 'r1', name: 'PALMETTO SPRINT', blurb: 'Two quick laps round the hills', start: [1, 1], cps: [[3, 1], [3, 3], [1, 3], [1, 1], [3, 1], [3, 3], [1, 3], [1, 1]], night: false },
  { id: 'r2', name: 'NEON MILE NIGHTRUN', blurb: 'Tight corners under the signs', start: [4, 0], cps: [[8, 0], [8, 2], [5, 2], [5, 1], [3, 1], [3, 0], [4, 0]], night: true },
  { id: 'r3', name: 'SEAGLASS COASTER', blurb: 'Down the boulevard and back through town', start: [8, 8], cps: [[8, 3], [6, 3], [6, 6], [2, 6], [2, 8], [8, 8]], night: false },
];

// Route length of a race (start -> checkpoints), in world units.
export function raceLength(r) {
  let len = 0, [pi, pj] = r.start;
  for (const [i, j] of r.cps) { len += (Math.abs(i - pi) + Math.abs(j - pj)) * CELL; pi = i; pj = j; }
  return len;
}
// Medal times (seconds): gold needs a sports car driven well, bronze is any car kept on the road.
export const medalTimes = (r) => { const L = raceLength(r); return { gold: Math.round(L / 27), silver: Math.round(L / 22), bronze: Math.round(L / 17) }; };
export const RACE_PAY = { gold: 1500, silver: 900, bronze: 500, none: 120 };
export const RACE_REP = { gold: 80, silver: 50, bronze: 30, none: 10 };

const H = ROAD_W / 2;
// (x, z) = where the player stops; (nx, nz) = unit vector from the street into the block (props sit there).
export const SITES = [
  { id: 'garage1', kind: 'garage', name: 'PAINT & PISTON', x: 3 * CELL + 3, z: 4 * CELL + 24, nx: 1, nz: 0, color: '#3fa0ff', ch: 'P' },
  { id: 'garage2', kind: 'garage', name: 'PAINT & PISTON', x: 6 * CELL + 24, z: 6 * CELL + 3, nx: 0, nz: 1, color: '#3fa0ff', ch: 'P' },
  { id: 'gun1', kind: 'gunshop', name: 'LEAD & LIME', x: 4 * CELL + 14, z: 3 * CELL - H - 1.5, nx: 0, nz: -1, color: '#ff5f3f', ch: 'A' },
  { id: 'gun2', kind: 'gunshop', name: 'LEAD & LIME', x: 2 * CELL - H - 1.5, z: 6 * CELL + 20, nx: -1, nz: 0, color: '#ff5f3f', ch: 'A' },
  { id: 'depot', kind: 'courier', name: 'BAYLINK PARCEL', x: 2 * CELL + 14, z: 7 * CELL - 3, nx: 0, nz: -1, color: '#5dff6a', ch: 'D' },
  { id: 'cabs', kind: 'cabstand', name: 'PALOMAR CAB CO.', x: 6 * CELL - 3, z: 4 * CELL + 30, nx: -1, nz: 0, color: '#ffd23f', ch: 'T' },
];

export const SHOP = [
  { key: 1, id: 'pistol', label: 'PISTOL AMMO', sub: '+48 rounds', price: 120, give: { ammo: 'pistol', n: 48 } },
  { key: 2, id: 'smg', label: 'SMG', sub: '+120 rounds', price: 300, unlock: 2000, rep: 3, give: { ammo: 'smg', n: 120 } },
  { key: 3, id: 'pump', label: 'SCATTER GUN', sub: '+24 shells', price: 350, unlock: 3500, rep: 5, give: { ammo: 'pump', n: 24 } },
  { key: 4, id: 'armor', label: 'BODY ARMOR', sub: 'Full plate', price: 400 },
  { key: 5, id: 'lance', label: 'SEA LANCE', sub: '+9 harpoon bolts', price: 450, unlock: 6000, rep: 7, give: { ammo: 'lance', n: 9 } },
];

export const TUNE = [
  { key: 1, id: 'repair', label: 'REPAIR', sub: 'Body back to 100%', price: 250 },
  { key: 2, id: 'respray', label: 'RESPRAY', sub: 'New colour  ·  -1 star if unseen', price: 400 },
  { key: 3, id: 'engine', label: 'ENGINE TUNE', sub: '+top speed, +acceleration', price: 1200, max: 3 },
  { key: 4, id: 'grip', label: 'GRIP KIT', sub: '+cornering grip', price: 900, max: 2 },
];
export const RESPRAY_COLORS = ['#ff4fa3', '#2ee6c8', '#ffd23f', '#7a5cff', '#ff7a3d', '#3fa0ff', '#ffffff', '#1d1d2a', '#5dff6a', '#ff3f5f'];

// Taxi / courier payout tuning.
export const TAXI = { base: 40, perUnit: 0.85, tipPerSec: 4, rep: 15 };
export const COURIER = { drops: 3, perDrop: 180, bonus: 300, rep: 20 };

// Saved side progress (game.side) and a sanitiser for records from saves.
export const defaultSide = () => ({ shells: [], raceBest: {}, raceMedal: {}, races: 0, fares: 0, parcels: 0, runs: 0, resprays: 0, upgrades: 0, earned: 0, spent: 0 });
export function normalizeSide(s) {
  const d = defaultSide();
  if (!s || typeof s !== 'object' || Array.isArray(s)) return d;
  for (const k of Object.keys(d)) {
    if (Array.isArray(d[k])) d[k] = Array.isArray(s[k]) ? [...new Set(s[k].filter((x) => Number.isInteger(x) && x >= 0 && x < SHELL_COUNT))] : [];
    else if (typeof d[k] === 'object') d[k] = s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) ? { ...s[k] } : {};
    else d[k] = Number.isFinite(s[k]) ? s[k] : 0;
  }
  return d;
}

// SEA GLASS shards: 30 hidden pickups. Deterministic (same in every game), all reachable on foot.
export const SHELL_COUNT = 30;
export function shellSpots(parks) {
  const r = makeRng(3030);
  const spots = [];
  const used = new Set();
  // Sidewalk corners and mid-sides of blocks spread over the whole grid.
  while (spots.length < 18) {
    const bx = Math.floor(r() * GRID_N), bz = Math.floor(r() * GRID_N), side = Math.floor(r() * 4);
    const k = `${bx},${bz}`;
    if (used.has(k)) continue;
    used.add(k);
    const x0 = bx * CELL + H, z0 = bz * CELL + H, size = CELL - ROAD_W, w = WALK_W / 2, t = 5 + r() * (size - 10);
    const [x, z] = [[x0 + t, z0 + w], [x0 + size - w, z0 + t], [x0 + t, z0 + size - w], [x0 + w, z0 + t]][side];
    spots.push({ x, z, y: 0.9 });
  }
  // Parks and plazas (beside the fountain)
  for (const p of parks.filter((q) => q.kind !== 'parking').slice(0, 5)) spots.push({ x: (p.x0 + p.x1) / 2 + 6, z: (p.z0 + p.z1) / 2 + 4, y: 0.9 });
  // Seaglass Beach and Coral Pier
  for (let i = 0; spots.length < SHELL_COUNT - 2; i++) spots.push({ x: CITY_SIZE + H + 10 + r() * (OCEAN_X - CITY_SIZE - H - 16), z: 20 + r() * (CITY_SIZE - 40), y: 0.9 });
  spots.push({ x: OCEAN_X + 30, z: 6.5 * CELL + 3, y: 1.0 }, { x: OCEAN_X + 78, z: 6.5 * CELL - 3, y: 1.0 });
  return spots.slice(0, SHELL_COUNT).map((s, i) => ({ ...s, id: i }));
}
