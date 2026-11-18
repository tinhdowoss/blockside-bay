// Street names of BLOCKSIDE BAY. North-south roads (x = i * CELL) are avenues, east-west roads
// (z = j * CELL) are streets; the eastern edge along the beach is Seaglass Boulevard. streetAt()
// names the road under (or nearest to) a point, and the crossing when standing in an intersection.
import { CELL, GRID_N, CITY_SIZE, ROAD_W, OCEAN_X } from '../core/config.js';
import { PIER_Z, PIER_LEN } from './city.js';

export const AVENUES = ['MANGROVE AVE', 'PALMETTO AVE', 'HIBISCUS AVE', 'CORAL WAY', 'FLAMINGO AVE', 'VOLTA AVE', 'TARPON AVE', 'SUNDIAL AVE', 'SEAGLASS BLVD'];
export const STREETS = ['NORTHSHORE DR', 'JASMINE ST', 'NEON ST', 'REEF ST', 'MARLIN ST', 'CANNERY ST', 'CARACOL ST', 'PELICAN ST', 'HARBOR DR'];

const HALF = ROAD_W / 2;
const idx = (v) => Math.max(0, Math.min(GRID_N, Math.round(v / CELL)));

export function streetAt(x, z) {
  if (x > OCEAN_X - 8 && Math.abs(z - PIER_Z) < 7 && x < OCEAN_X + PIER_LEN) return 'CORAL PIER BOARDWALK';
  if (x > CITY_SIZE + HALF + 2) return 'SEAGLASS BEACH';
  const i = idx(x), j = idx(z);
  const onAve = Math.abs(x - i * CELL) < HALF, onSt = Math.abs(z - j * CELL) < HALF;
  if (onAve && onSt) return `${AVENUES[i]} & ${STREETS[j]}`;
  if (onAve) return AVENUES[i];
  if (onSt) return STREETS[j];
  // Off the road (sidewalk, plaza, alley): the nearer of the two roads around the block.
  return Math.abs(x - i * CELL) < Math.abs(z - j * CELL) ? AVENUES[i] : STREETS[j];
}
