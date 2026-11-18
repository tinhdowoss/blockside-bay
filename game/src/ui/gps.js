// GPS: a road route from the player to the current objective, as world points along the street grid.
// Every grid line is a road, so the shortest route is at most one connecting road between the start
// road and the goal road; the route is cached and only rebuilt when either end moves to another road
// segment or more than a few metres.
import { CELL, GRID_N } from '../core/config.js';
import { snapToRoad } from '../world/city.js';

let cache = null;

function build(fx, fz, tx, tz) {
  const a = snapToRoad(fx, fz), b = snapToRoad(tx, tz);
  const pts = [{ x: fx, z: fz }, { x: a.x, z: a.z }];
  // a.axis 'z' = a north-south avenue at x = a.x; 'x' = an east-west street at z = a.z.
  const bestLine = (p, q) => {
    let best = 0, bd = Infinity;
    for (let k = 0; k <= GRID_N; k++) { const v = k * CELL, d = Math.abs(p - v) + Math.abs(q - v); if (d < bd) { bd = d; best = v; } }
    return best;
  };
  if (a.axis === 'z' && b.axis === 'z') {
    if (Math.abs(a.x - b.x) > 1) { const zr = bestLine(a.z, b.z); pts.push({ x: a.x, z: zr }, { x: b.x, z: zr }); }
  } else if (a.axis === 'x' && b.axis === 'x') {
    if (Math.abs(a.z - b.z) > 1) { const xr = bestLine(a.x, b.x); pts.push({ x: xr, z: a.z }, { x: xr, z: b.z }); }
  } else if (a.axis === 'z') pts.push({ x: a.x, z: b.z });
  else pts.push({ x: b.x, z: a.z });
  pts.push({ x: b.x, z: b.z }, { x: tx, z: tz });
  return pts;
}

export function gpsRoute(fx, fz, tx, tz) {
  if (cache && Math.hypot(cache.fx - fx, cache.fz - fz) < 3 && Math.hypot(cache.tx - tx, cache.tz - tz) < 3) {
    cache.pts[0] = { x: fx, z: fz };
    return cache.pts;
  }
  cache = { fx, fz, tx, tz, pts: build(fx, fz, tx, tz) };
  return cache.pts;
}

// Route length in metres (shown as the distance on the mission panel).
export function routeLength(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return d;
}
