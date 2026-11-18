// Pause-menu city map: the shared top-down map image with district labels, landmark and activity pins,
// numbered story pins, the GPS route to the current job, police units and the player.
import { DISTRICTS, CELL, OCEAN_X, CITY_SIZE, BEACH_NAME } from '../core/config.js';
import { drawPixelText, textWidth } from './pixelfont.js';
import { MISSIONS } from '../data/missions-data.js';
import { cityMapImage, toMap } from './minimap.js';
import { gpsRoute } from './gps.js';
import { city } from '../world/city.js';
import { player } from '../gameplay/player.js';
import { police } from '../gameplay/police.js';
import { ms, nextMission } from '../gameplay/missions.js';
import { game } from '../core/state.js';
import { activityPins, foundShells } from '../gameplay/activities.js';

// Label anchor per district, in block units (hand-placed so names never collide).
const LABEL_AT = { palmetto: [1.5, 0.55], neon: [5.5, 0.55], midtown: [3.4, 3.6], docks: [1.05, 5.6], caracol: [3.0, 7.55], pier: [6.5, 6.55], shores: [6.5, 3.6] };
const LANDMARK_PINS = { diner: 'D', garage: 'G', club: 'C', docks: 'W', shores: 'M', caracol: 'K', tower: 'T', clinic: '+', pier: 'P' };
const VIEW = { x0: -40, z0: -40, x1: OCEAN_X + 100, z1: CITY_SIZE + 40 };

export function drawPauseMap(cv) {
  const g = cv.getContext('2d');
  const img = cityMapImage();
  const a = toMap(VIEW.x0, VIEW.z0), b = toMap(VIEW.x1, VIEW.z1);
  g.imageSmoothingEnabled = false;
  g.drawImage(img, a.x, a.y, b.x - a.x, b.y - a.y, 0, 0, cv.width, cv.height);
  const sx = cv.width / (VIEW.x1 - VIEW.x0), sz = cv.height / (VIEW.z1 - VIEW.z0);
  const P = (x, z) => ({ x: (x - VIEW.x0) * sx, y: (z - VIEW.z0) * sz });
  // GPS route to the current job (the same router as the minimap), under the labels so they stay readable.
  const cur = ms.def || nextMission();
  const goal = ms.goal || (cur && city.landmarks[cur.start]);
  if (goal) {
    const pts = gpsRoute(player.x, player.z, goal.x, goal.z).map((q) => P(q.x, q.z));
    g.lineJoin = 'round';
    for (const [w, c] of [[9, '#12061c'], [5, '#ff4fa3']]) {
      g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
      g.lineWidth = w; g.strokeStyle = c; g.setLineDash(c === '#12061c' ? [] : [10, 6]); g.stroke();
    }
    g.setLineDash([]);
  }
  for (const d of DISTRICTS) {
    const [bx, bz] = LABEL_AT[d.id];
    label(g, d.name, P(bx * CELL, bz * CELL), d.color);
  }
  label(g, BEACH_NAME, P(CITY_SIZE + 26, 1.6 * CELL), '#ffe36b', true);
  for (const [k, ch] of Object.entries(LANDMARK_PINS)) {
    const l = city.landmarks[k];
    const p = P(l.x, l.z);
    g.fillStyle = '#12061c'; g.fillRect(p.x - 9, p.y - 9, 18, 18);
    g.fillStyle = '#ffffff'; g.fillRect(p.x - 7, p.y - 7, 14, 14);
    drawPixelText(g, ch, p.x - 5, p.y - 7, 2, '#12061c');
  }
  const y = city.landmarks.yacht, yp = P(y.x, y.z);
  g.fillStyle = '#12061c'; g.fillRect(yp.x - 16, yp.y - 6, 32, 12);
  g.fillStyle = '#ffffff'; g.fillRect(yp.x - 14, yp.y - 4, 28, 8);
  const pin = (p, col, ch) => {
    g.fillStyle = '#12061c'; g.fillRect(p.x - 10, p.y - 10, 20, 20);
    g.fillStyle = col; g.fillRect(p.x - 8, p.y - 8, 16, 16);
    g.fillStyle = '#12061c'; g.font = 'bold 13px Arial Black, sans-serif'; g.textAlign = 'center'; g.fillText(ch, p.x, p.y + 5);
  };
  pin(P(city.landmarks.safehouse.x, city.landmarks.safehouse.z), '#2ee6c8', 'H');
  // Side activities (round pins) and the SEA GLASS shards already found.
  for (const s of activityPins()) {
    const p = P(s.x, s.z);
    g.beginPath(); g.arc(p.x, p.y, 10, 0, Math.PI * 2); g.fillStyle = '#12061c'; g.fill();
    g.beginPath(); g.arc(p.x, p.y, 8, 0, Math.PI * 2); g.fillStyle = s.color; g.fill();
    g.fillStyle = '#12061c'; g.font = 'bold 11px Arial Black, sans-serif'; g.textAlign = 'center'; g.fillText(s.ch, p.x, p.y + 4);
  }
  for (const s of foundShells()) { const p = P(s.x, s.z); g.fillStyle = '#12061c'; g.fillRect(p.x - 4, p.y - 4, 8, 8); g.fillStyle = '#5ffff0'; g.fillRect(p.x - 2.5, p.y - 2.5, 5, 5); }
  // Story pins, numbered 1-9: done (green tick), the current job (big, yellow), the rest (grey).
  const byStart = {};
  MISSIONS.forEach((m, i) => (byStart[m.start] ||= []).push(i));
  MISSIONS.forEach((m, i) => {
    const l = city.landmarks[m.start], group = byStart[m.start], k = group.indexOf(i);
    const at = P(l.x, l.z);
    const x = at.x + (k - (group.length - 1) / 2) * 24, yy = at.y - 20;
    const done = game.missionsDone.includes(m.id), now = cur && cur.id === m.id;
    storyPin(g, x, now ? yy - 6 : yy, i + 1, done ? '#5dff6a' : now ? '#ffd23f' : '#b8b0c8', now ? 15 : 11, done);
  });
  if (ms.goal) pin(P(ms.goal.x, ms.goal.z), '#ff4fa3', '!');
  for (const u of police.units) { const p = P(u.x, u.z); g.fillStyle = '#2a6aff'; g.fillRect(p.x - 5, p.y - 5, 10, 10); }
  const pp = P(player.x, player.z);
  g.beginPath(); g.arc(pp.x, pp.y, 9, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#12061c'; g.stroke();
  g.fillStyle = '#ff4fa3'; g.beginPath(); g.arc(pp.x, pp.y, 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#12061c'; g.fillRect(cv.width - 46, 10, 36, 36);
  drawPixelText(g, 'N', cv.width - 34, 18, 2, '#ffd23f');
}

// A teardrop map pin with the mission number (or a tick once done).
function storyPin(g, x, y, n, col, r, done) {
  g.beginPath();
  g.moveTo(x, y + r * 1.9);
  g.arc(x, y, r, Math.PI * 0.75, Math.PI * 0.25);
  g.closePath();
  g.fillStyle = col; g.fill();
  g.lineWidth = 3; g.strokeStyle = '#12061c'; g.stroke();
  g.fillStyle = '#12061c'; g.textAlign = 'center';
  g.font = `bold ${Math.round(r * 1.25)}px Arial Black, sans-serif`;
  g.fillText(done ? '✓' : String(n), x, y + r * 0.45);
}

function label(g, text, p, color, vertical = false) {
  const s = 2;
  if (vertical) {
    // Stack letters top-to-bottom (the beach is a narrow strip).
    g.fillStyle = 'rgba(18,6,28,0.82)';
    g.fillRect(p.x - 9, p.y - 6, 18, text.length * 18 + 4);
    [...text].forEach((ch, i) => drawPixelText(g, ch, p.x - 5, p.y + i * 18, s, color));
    return;
  }
  const w = textWidth(text, s);
  g.fillStyle = 'rgba(18,6,28,0.82)';
  g.fillRect(p.x - w / 2 - 6, p.y - 7 * s / 2 - 5, w + 12, 7 * s + 10);
  drawPixelText(g, text, p.x - w / 2, p.y - 7 * s / 2, s, color);
}
