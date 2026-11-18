// Round, camera-rotated minimap with the GPS route, and the shared top-down city map image (also used by
// the pause MAP tab).
import { CELL, GRID_N, CITY_SIZE, OCEAN_X, ROAD_W } from '../core/config.js';
import { city, PIER_Z, PIER_LEN } from '../world/city.js';
import { player } from '../gameplay/player.js';
import { police } from '../gameplay/police.js';
import { shooters } from '../gameplay/combat.js';
import { missionGoal, ms, nextMission } from '../gameplay/missions.js';
import { vehicles } from '../gameplay/vehicles.js';
import { activityPins, activityTarget, nearShells } from '../gameplay/activities.js';
import { gpsRoute } from './gps.js';
import { nearPickups } from '../gameplay/pickups.js';
import { game } from '../core/state.js';

const PX = 2;                 // map pixels per world unit
const ORIGIN = { x: -60, z: -60 };
const W = (OCEAN_X + 120 - ORIGIN.x) * PX, H = (CITY_SIZE + 120 - ORIGIN.z) * PX;
let base = null, ctx = null, canvasEl = null;

export const toMap = (x, z) => ({ x: (x - ORIGIN.x) * PX, y: (z - ORIGIN.z) * PX });

export function cityMapImage() {
  if (base) return base;
  base = document.createElement('canvas');
  base.width = W; base.height = H;
  const g = base.getContext('2d');
  const R = (x0, z0, x1, z1, col) => { const a = toMap(x0, z0), b = toMap(x1, z1); g.fillStyle = col; g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); };
  g.fillStyle = '#2ab8dc'; g.fillRect(0, 0, W, H);
  // Wave stripes
  g.fillStyle = '#4fd0ec';
  for (let y = 0; y < H; y += 18) for (let x = (y / 18) % 2 ? 0 : 9; x < W; x += 36) g.fillRect(x, y, 10, 2);
  R(-26, -26, CITY_SIZE + ROAD_W / 2, CITY_SIZE + 26, '#7fdc72');
  R(CITY_SIZE + ROAD_W / 2, -26, OCEAN_X + 2, CITY_SIZE + 26, '#ffe2a0');
  R(OCEAN_X - 6, PIER_Z - 5.5, OCEAN_X - 6 + PIER_LEN, PIER_Z + 5.5, '#c08a55');
  // Blocks (sidewalk colour) then roads
  for (let bx = 0; bx < GRID_N; bx++) for (let bz = 0; bz < GRID_N; bz++) {
    const x0 = bx * CELL + ROAD_W / 2, z0 = bz * CELL + ROAD_W / 2;
    R(x0, z0, x0 + CELL - ROAD_W, z0 + CELL - ROAD_W, '#f6e2d4');
  }
  for (const p of city.parks) R(p.x0, p.z0, p.x1, p.z1, p.kind === 'park' ? '#6fd85f' : p.kind === 'plaza' ? '#ffc8de' : '#9aa0b0');
  for (const l of city.lots) {
    R(l.x0, l.z0, l.x1, l.z1, '#3a2a4a');
    R(l.x0 + 0.8, l.z0 + 0.8, l.x1 - 0.8, l.z1 - 0.8, l.color);
  }
  for (let i = 0; i <= GRID_N; i++) {
    R(i * CELL - ROAD_W / 2, -ROAD_W / 2, i * CELL + ROAD_W / 2, CITY_SIZE + ROAD_W / 2, '#4a4d5e');
    R(-ROAD_W / 2, i * CELL - ROAD_W / 2, CITY_SIZE + ROAD_W / 2, i * CELL + ROAD_W / 2, '#4a4d5e');
  }
  for (let i = 0; i <= GRID_N; i++) {
    for (let k = 0; k < CITY_SIZE; k += 8) {
      R(i * CELL - 0.4, k, i * CELL + 0.4, k + 4, '#ffd23f');
      R(k, i * CELL - 0.4, k + 4, i * CELL + 0.4, '#ffd23f');
    }
  }
  return base;
}

export function setupMinimap() {
  canvasEl = document.getElementById('minimap');
  ctx = canvasEl.getContext('2d');
  cityMapImage();
}

function dot(g, x, y, r, fill, stroke = '#12061c') {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill; g.fill();
  g.lineWidth = 2; g.strokeStyle = stroke; g.stroke();
}

// What the GPS is pointing at: a running race / fare / parcel target first, else the story objective
// (pink) or the next job's start marker (yellow). Null when there is nothing to route to.
export function gpsTarget() {
  const at = game.sideBusy ? activityTarget() : null;
  if (at) return { x: at.x, z: at.z, color: '#5dff6a' };
  const goal = missionGoal();
  if (goal) return { x: goal.x, z: goal.z, color: ms.def ? '#ff4fa3' : '#ffd23f' };
  return null;
}

// GPS line along the streets, drawn under every marker; dashes crawl towards the target.
function drawRoute(g, C, zoom, rot, t) {
  const tg = gpsTarget();
  if (!tg || Math.hypot(tg.x - player.x, tg.z - player.z) < 10) return;
  const pts = gpsRoute(player.x, player.z, tg.x, tg.z);
  const c = Math.cos(rot), s = Math.sin(rot);
  g.save();
  g.beginPath(); g.arc(C, C, C - 2, 0, Math.PI * 2); g.clip();
  g.beginPath();
  pts.forEach((p, i) => {
    const dx = (p.x - player.x) * PX * zoom, dz = (p.z - player.z) * PX * zoom;
    const x = C + dx * c - dz * s, y = C + dx * s + dz * c;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  });
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = '#12061c'; g.lineWidth = 9; g.stroke();
  g.strokeStyle = tg.color; g.lineWidth = 5; g.stroke();
  g.setLineDash([6, 10]); g.lineDashOffset = -t * 30;
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2; g.stroke();
  g.restore();
}

export function drawMinimap(t) {
  const g = ctx, S = canvasEl.width, C = S / 2;
  const fast = player.vehicle ? Math.min(1, player.vehicle.speed / 40) : 0;
  const zoom = (0.62 - fast * 0.2);
  const rot = Math.PI + player.camYaw;
  g.save();
  g.clearRect(0, 0, S, S);
  g.beginPath(); g.arc(C, C, C, 0, Math.PI * 2); g.clip();
  g.translate(C, C);
  g.rotate(rot);
  g.scale(zoom, zoom);
  const pm = toMap(player.x, player.z);
  g.imageSmoothingEnabled = false;
  g.drawImage(base, -pm.x, -pm.y);
  g.restore();

  // Markers (unrotated sizes)
  const proj = (x, z) => {
    const dx = (x - player.x) * PX * zoom, dz = (z - player.z) * PX * zoom;
    const c = Math.cos(rot), s = Math.sin(rot);
    let px = dx * c - dz * s, py = dx * s + dz * c;
    const d = Math.hypot(px, py), lim = C - 12;
    const edge = d > lim;
    if (edge) { px *= lim / d; py *= lim / d; }
    return { x: C + px, y: C + py, edge };
  };
  const blink = Math.floor(t * 4) % 2;
  drawRoute(g, C, zoom, rot, t);
  for (const v of vehicles) {
    if (!v.police || v.driver !== 'police' && !v.siren) continue;
    const p = proj(v.x, v.z);
    if (!p.edge) dot(g, p.x, p.y, 6, blink ? '#ff2a4a' : '#2a6aff', '#fff');
  }
  if (police.heli) { const p = proj(police.heli.x, police.heli.z); if (!p.edge) { dot(g, p.x, p.y, 8, 'rgba(255,240,160,0.5)', '#ffe066'); } }
  for (const s of shooters) {
    if (!s.alive) continue;
    const p = proj(s.x, s.z);
    if (!p.edge) dot(g, p.x, p.y, s.boss ? 7 : 5, s.faction === 'police' ? '#3fa0ff' : '#ff2a2a', '#fff');
  }
  // Side activities: site pins nearby, SEA GLASS sparkles within 45 m, and the live race / job target.
  for (const a of activityPins()) {
    const p = proj(a.x, a.z);
    if (p.edge) continue;
    g.fillStyle = '#12061c'; g.beginPath(); g.arc(p.x, p.y, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = a.color; g.beginPath(); g.arc(p.x, p.y, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#12061c'; g.font = 'bold 10px Arial Black, sans-serif'; g.textAlign = 'center'; g.fillText(a.ch, p.x, p.y + 4);
  }
  for (const s of nearShells()) {
    const p = proj(s.x, s.z);
    if (p.edge) continue;
    g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6);
    g.fillStyle = '#5ffff0'; g.fillRect(p.x - 1.5, p.y - 5, 3, 10); g.fillRect(p.x - 5, p.y - 1.5, 10, 3);
    g.globalAlpha = 1;
  }
  for (const a of nearPickups()) {
    const p = proj(a.x, a.z);
    if (p.edge) continue;
    g.save(); g.translate(p.x, p.y); g.rotate(Math.PI / 4);
    g.fillStyle = '#12061c'; g.fillRect(-6, -6, 12, 12);
    g.fillStyle = '#2f8dff'; g.fillRect(-4, -4, 8, 8);
    g.restore();
  }
  const at = activityTarget();
  if (at) {
    const p = proj(at.x, at.z);
    g.fillStyle = blink || !p.edge ? '#5dff6a' : '#3fe8ff'; g.strokeStyle = '#12061c'; g.lineWidth = 3;
    g.beginPath(); g.arc(p.x, p.y, 9, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  const goal = missionGoal();
  if (goal) {
    const p = proj(goal.x, goal.z);
    const col = ms.def ? '#ff4fa3' : '#ffd23f';
    g.fillStyle = col; g.strokeStyle = '#12061c'; g.lineWidth = 3;
    g.fillRect(p.x - 8, p.y - 8, 16, 16); g.strokeRect(p.x - 8, p.y - 8, 16, 16);
    g.fillStyle = '#12061c'; g.font = 'bold 13px Arial Black, sans-serif'; g.textAlign = 'center';
    g.fillText(ms.def ? '!' : (nextMission()?.giver[0] || '?').toUpperCase(), p.x, p.y + 5);
  }
  // Police radius pulse when wanted
  if (police.level > 0) {
    g.strokeStyle = blink ? 'rgba(255,40,70,0.8)' : 'rgba(40,110,255,0.8)';
    g.lineWidth = 6; g.beginPath(); g.arc(C, C, C - 3, 0, Math.PI * 2); g.stroke();
  }
  // Player arrow
  const heading = player.vehicle ? player.vehicle.heading : player.yaw;
  const a = rot - heading;
  g.save();
  g.translate(C, C);
  g.rotate(a);
  g.beginPath(); g.moveTo(0, 11); g.lineTo(-8, -8); g.lineTo(0, -3); g.lineTo(8, -8); g.closePath();
  g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#12061c'; g.stroke();
  g.restore();
  // North marker on the rim
  const n = proj(player.x, player.z - 9999);
  g.fillStyle = '#12061c'; g.beginPath(); g.arc(n.x, n.y, 10, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 13px Arial Black, sans-serif'; g.textAlign = 'center'; g.fillText('N', n.x, n.y + 5);
}
