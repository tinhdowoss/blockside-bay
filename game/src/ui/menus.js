// Title screen (blocky logo, Continue/New/Load/Controls/Settings, key list, crew portraits) and the
// pause menu (MAP with district labels and pins, MISSIONS, STATS, SAVE, SETTINGS).
import { GAME_TITLE, DISTRICTS, CELL, GRID_N, OCEAN_X, CITY_SIZE, SAVE_SLOTS, BEACH_NAME } from '../core/config.js';
import { drawBlockyTitle, drawPixelText, textWidth } from './pixelfont.js';
import { CAST, CREW, portraitURL } from '../data/cast.js';
import { MISSIONS, CHAPTER_NAMES, STORY_HOOK } from '../data/missions-data.js';
import { cityMapImage, toMap } from './minimap.js';
import { city, nearestNode, nodePos } from '../world/city.js';
import { player } from '../gameplay/player.js';
import { police } from '../gameplay/police.js';
import { ms, nextMission } from '../gameplay/missions.js';
import { listSlots, latestSlot } from '../core/save.js';
import { game, completion } from '../core/state.js';
import { sky } from '../world/daylight.js';
import { blip } from '../audio/radio.js';
import { repLevel } from '../gameplay/progression.js';

let root, actions = {}, titleSel = 0, pauseTab = 'map', pauseSel = 0, titleItems = [];
const KEYS = [
  ['W A S D', 'Walk / drive'], ['MOUSE', 'Aim  ·  click to shoot'], ['SHIFT', 'Sprint  ·  handbrake drift'],
  ['F', 'Enter / steal car'], ['E', 'Talk  ·  next radio station'], ['TAB', 'Switch weapon'],
  ['M', 'City map + save'], ['ESC', 'Pause menu'],
];

export function setupMenus(acts) {
  actions = acts;
  root = document.getElementById('menus');
}

export function logoCanvas() {
  const cv = document.createElement('canvas');
  cv.width = 300; cv.height = 104;
  const g = cv.getContext('2d');
  const s1 = 5;
  const w1 = textWidth('BLOCKSIDE', s1);
  drawBlockyTitle(g, 'BLOCKSIDE', (300 - w1) / 2 - 6, 6, s1, '#ffe14a', '#ff9a1f', '#5a1060', 3);
  const s2 = 7;
  const w2 = textWidth('BAY', s2);
  drawBlockyTitle(g, 'BAY', (300 - w2) / 2 - 6, 50, s2, '#ff8fd0', '#ff3f9a', '#3a0d4a', 3);
  // Palm-leaf pixels either side of BAY
  g.fillStyle = '#2ee6c8';
  for (const [x, y] of [[40, 60], [46, 56], [52, 54], [58, 56], [64, 60], [236, 60], [242, 56], [248, 54], [254, 56], [260, 60]]) g.fillRect(x, y, 6, 4);
  g.fillStyle = '#b07a4a';
  g.fillRect(50, 62, 4, 34); g.fillRect(250, 62, 4, 34);
  return cv;
}

// ---- Title ----------------------------------------------------------------------------
export function showTitle() {
  const latest = latestSlot();
  titleItems = [
    { id: 'continue', label: 'CONTINUE', sub: latest ? slotLine(latest) : 'No save yet - starts a new story', act: () => actions.continueGame(latest) },
    { id: 'new', label: 'NEW GAME', sub: 'Chapter 1: Homecoming', act: () => actions.newGame() },
    { id: 'load', label: 'LOAD GAME', sub: `${listSlots().filter((s) => s.data).length} of ${SAVE_SLOTS} slots used`, act: () => titleSub('load') },
    { id: 'controls', label: 'CONTROLS', sub: 'Keyboard + mouse', act: () => titleSub('controls') },
    { id: 'settings', label: 'SETTINGS', sub: 'Audio  ·  graphics  ·  mouse  ·  shake', act: () => titleSub('settings') },
  ];
  titleSel = 0;
  root.innerHTML = `<div id="title" class="outl">
    <div class="logo-holder"></div>
    <div class="tagline">A VOXEL CRIME STORY  ·  SUN, NEON & BAD DECISIONS</div>
    <div class="hook">${STORY_HOOK}</div>
    <div class="menu"></div>
    <div class="sub panel"></div>
    <div class="crewlabel">THE CREW</div>
    <div class="crew">${CREW.map((id) => `<div class="c" style="--c:${CAST[id].accent || CAST[id].shirt}"><img src="${portraitURL(id)}" alt=""><b>${CAST[id].name}</b><i>${CAST[id].role}</i></div>`).join('')}</div>
    <div class="foot"><span class="kc">&#8593; &#8595;</span> choose  <span class="kc">ENTER</span> select</div>
  </div>`;
  const logo = logoCanvas();
  logo.className = 'logo';
  root.querySelector('.logo-holder').appendChild(logo);
  renderTitleMenu();
}

function renderTitleMenu() {
  const m = root.querySelector('#title .menu');
  if (!m) return;
  m.innerHTML = titleItems.map((it, i) => `<div class="btn ${i === titleSel ? 'sel' : ''}" data-i="${i}">${it.label}<small>${it.sub}</small></div>`).join('');
  m.querySelectorAll('.btn').forEach((b) => {
    b.onmouseenter = () => { titleSel = +b.dataset.i; renderTitleMenu(); };
    b.onclick = () => { blip(); titleItems[+b.dataset.i].act(); };
  });
}

function titleSub(kind) {
  const el = root.querySelector('#title .sub');
  el.style.display = 'block';
  if (kind === 'controls') el.innerHTML = `<h3 style="color:#ffd23f">CONTROLS</h3>${KEYS.map(([k, d]) => `<div class="k"><span class="kc">${k}</span>${d}</div>`).join('')}<h3 style="color:#ffd23f;margin-top:10px">HOW TO PLAY</h3><div style="font-family:Trebuchet MS;font-weight:bold;font-size:14px;line-height:1.4">Walk up to any car and press <span class="kc">F</span> to pull the driver out - every theft adds a wanted star. Break line of sight with the police to let the stars cool down. Yellow markers start story missions. Hold <span class="kc">SHIFT</span> in a car for handbrake drifts. Click the screen to lock the mouse for aiming.</div>`;
  if (kind === 'settings') el.innerHTML = settingsHTML();
  if (kind === 'load') {
    el.innerHTML = '<h3 style="color:#ffd23f">LOAD GAME</h3>' + listSlots().map((s) => `<div class="btn panel" data-slot="${s.slot}" style="padding:8px;margin:6px 0;font-size:16px">SLOT ${s.slot + 1}  ${s.data ? `· ${s.data.pct}% · $${s.data.cash.toLocaleString()}` : '· empty'}</div>`).join('');
    el.querySelectorAll('[data-slot]').forEach((b) => { b.onclick = () => { const s = listSlots()[+b.dataset.slot]; if (s.data) actions.continueGame(s); }; });
  }
  bindSettings(el);
}

export function hideMenus() { root.innerHTML = ''; }

// One line describing a save: chapter, completion, cash and play time.
function slotLine(s) {
  const d = s.data, secs = d.stats?.playSeconds || 0;
  const time = `${Math.floor(secs / 3600)}h ${String(Math.floor(secs / 60) % 60).padStart(2, '0')}m`;
  return `Slot ${s.slot + 1}  ·  ${d.chapter || d.place}  ·  ${d.pct}%  ·  $${d.cash.toLocaleString('en-US')}  ·  ${time}`;
}

// ---- Pause -----------------------------------------------------------------------------
export function openPause(tab = 'map') {
  pauseTab = tab;
  pauseSel = 0;
  renderPause();
}

const TABS = ['map', 'missions', 'stats', 'save', 'settings'];
function renderPause() {
  const h = Math.floor(sky.hour), mi = Math.floor((sky.hour % 1) * 60);
  root.innerHTML = `<div id="pause" class="outl">
    <div class="top"><span class="brand">${GAME_TITLE}</span>${TABS.map((t) => `<span class="tab btn ${t === pauseTab ? 'sel' : ''}" data-t="${t}">${t.toUpperCase()}</span>`).join('')}
      <div class="info"><b>$${game.cash.toLocaleString('en-US')}</b><br>${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}  ·  ${'&#9733;'.repeat(police.level)}${'&#9734;'.repeat(5 - police.level)}</div></div>
    <div class="body">${pauseBody()}</div></div>`;
  root.querySelectorAll('.tab').forEach((t) => { t.onclick = () => { blip(); pauseTab = t.dataset.t; renderPause(); }; });
  root.querySelectorAll('[data-act]').forEach((b) => { b.onclick = () => { blip(); doAction(b.dataset.act); }; });
  root.querySelectorAll('[data-save]').forEach((b) => { b.onclick = () => { actions.save(+b.dataset.save); renderPause(); }; });
  if (pauseTab === 'map') drawPauseMap(root.querySelector('#pausemap'));
  bindSettings(root);
}

function doAction(a) {
  if (a === 'resume') actions.resume();
  if (a === 'save') { actions.save(game.slot); renderPause(); }
  if (a === 'quit') actions.quit();
}

function pauseBody() {
  const done = game.missionsDone.length;
  if (pauseTab === 'map') {
    const nm = ms.def || nextMission();
    const story = MISSIONS.map((m, i) => {
      const d = game.missionsDone.includes(m.id), now = nm && nm.id === m.id;
      return `<div class="${d || now ? '' : 'dim'}"><span class="ck ${d ? 'done' : now ? 'now' : ''}">${d ? '&#10003;' : i + 1}</span>${m.title}<em>$${(m.reward / 1000).toFixed(m.reward % 1000 ? 1 : 0)}K</em></div>`;
    }).join('');
    const skills = Object.entries(game.skills).map(([k, v]) => `<div class="skill">${k.toUpperCase()} <span style="float:right;color:#ffe9a8">LV ${1 + Math.floor(v * 9)}</span><div class="bar"><i style="width:${v * 100}%"></i></div></div>`).join('');
    const pct = completion();
    const rep = repLevel();
    const acts = [['resume', 'RESUME'], ['save', 'SAVE GAME'], ['quit', 'QUIT TO TITLE']];
    return `<div class="mapbox panel"><canvas id="pausemap" width="640" height="560"></canvas></div>
      <div class="side">
        <div class="card panel story"><h3>STORY  ${done}/9</h3>${story}</div>
        <div class="card panel"><h3>SKILLS</h3>${skills}</div>
        <div class="card panel legend"><h3>LEGEND</h3>
          <div><span style="background:#ffd23f;border-radius:50% 50% 50% 0"></span>Next job (1-9)</div><div><span style="background:#ff4fa3"></span>Route + objective</div><div><span style="background:#ffffff;border-radius:50%"></span>You</div>
          <div><span style="background:#2a6aff"></span>Police</div><div><span style="background:#ff2a2a"></span>Gang</div><div><span style="background:#2ee6c8"></span>Safehouse</div>
          <div><span style="background:#fff"></span>Landmark</div><div><span style="background:#ffe2a0"></span>Beach</div><div><span style="background:#c08a55"></span>Pier + yacht</div></div>
        <div class="card panel slotcard"><div class="slotinfo"><h3>SAVE SLOT ${game.slot + 1}</h3><div class="pct">${pct}% <span style="font-size:16px;color:#fff">COMPLETE</span></div>
          <div class="meta">CH ${(ms.def || nextMission() || { chapter: 7 }).chapter} ${CHAPTER_NAMES[(ms.def || nextMission() || { chapter: 7 }).chapter]}  ·  ${Math.floor(game.stats.playSeconds / 3600)}h ${String(Math.floor(game.stats.playSeconds / 60) % 60).padStart(2, '0')}m played</div>
          <div class="bar pbar"><i style="width:${pct}%"></i></div>
          <div class="meta rep">REP ${rep.level}  ${rep.title}  ·  ${game.rep.toLocaleString('en-US')} XP</div></div>
          <div class="actions">${acts.map(([a, l], i) => `<div class="btn ${i === pauseSel ? 'sel' : ''}" data-act="${a}">${l}</div>`).join('')}</div></div>
      </div>`;
  }
  if (pauseTab === 'missions') {
    return `<div class="list">${MISSIONS.map((m) => {
      const d = game.missionsDone.includes(m.id);
      return `<div class="mcard panel"><div class="h">CH ${m.chapter} · ${m.title}</div><div style="margin:6px 0">${m.blurb}</div>
        <div style="color:${d ? '#5dff6a' : '#ffe9a8'}">${d ? 'COMPLETE' : 'LOCKED / AVAILABLE'}  ·  $${m.reward.toLocaleString()}  ·  ${CAST[m.giver].name}</div></div>`;
    }).join('')}</div>`;
  }
  if (pauseTab === 'stats') {
    const s = game.stats;
    const rows = [['CARS STOLEN', s.stolen], ['HEADSHOTS', s.headshots], ['TAKEDOWNS', s.kills], ['ACCURACY', s.shots ? Math.round((s.hits / s.shots) * 100) + '%' : '-'],
      ['DISTANCE', (s.distance / 1000).toFixed(1) + ' km'], ['MAX STARS', s.maxStars], ['TIMES CUFFED', s.cuffed], ['HOSPITAL VISITS', s.downed],
      ['STORY', `${done}/9`], ['COMPLETION', completion() + '%'], ['CASH', '$' + game.cash.toLocaleString()], ['PLAY TIME', Math.floor(s.playSeconds / 60) + ' min']];
    return `<div class="stats">${rows.map(([k, v]) => `<div class="card panel"><h3>${k}</h3><div>${v}</div></div>`).join('')}</div>`;
  }
  if (pauseTab === 'save') {
    return `<div class="slots">${listSlots().map((s) => `<div class="card panel"><h3>SLOT ${s.slot + 1}${s.slot === game.slot ? '  (CURRENT)' : ''}</h3>
      <div style="font-size:30px;color:#5dff6a">${s.data ? s.data.pct + '%' : 'EMPTY'}</div>
      <div style="font-family:Trebuchet MS;font-weight:bold;font-size:14px;margin:6px 0">${s.data ? `${s.data.place}  ·  $${s.data.cash.toLocaleString()}<br>${new Date(s.data.savedAt).toLocaleString()}` : 'No data'}</div>
      <div class="btn panel" data-save="${s.slot}" style="padding:6px;text-align:center">SAVE HERE</div></div>`).join('')}</div>`;
  }
  return `<div class="card panel settings" style="width:520px">${settingsHTML()}</div>`;
}

function settingsHTML() {
  const rows = [['music', 'MUSIC', Math.round((game.musicVol ?? 0.32) * 100 / 0.32 / 10)], ['sfx', 'EFFECTS', Math.round((game.sfxVol ?? 0.8) * 10)], ['sens', 'MOUSE', Math.round((game.sens ?? 1) * 5)], ['shadows', 'SHADOWS', game.shadows === false ? 'OFF' : 'ON']];
  return `<div class="settings"><h3 style="color:#ffd23f">SETTINGS</h3>${rows.map(([id, l, v]) => `<div class="row"><span style="width:120px">${l}</span><span class="btn" data-set="${id}" data-d="-1">-</span><b style="width:50px;text-align:center">${v}</b><span class="btn" data-set="${id}" data-d="1">+</span></div>`).join('')}</div>`;
}

function bindSettings(el) {
  el.querySelectorAll('[data-set]').forEach((b) => {
    b.onclick = () => {
      const d = +b.dataset.d;
      actions.setting(b.dataset.set, d);
      const holder = b.closest('.settings').parentElement;
      holder.innerHTML = settingsHTML();
      bindSettings(holder);
    };
  });
}

// ---- Pause city map ---------------------------------------------------------------------
// Label anchor per district, in block units (hand-placed so names never collide).
const LABEL_AT = { palmetto: [1.5, 0.55], neon: [5.5, 0.55], midtown: [3.4, 3.6], docks: [1.05, 5.6], caracol: [3.0, 7.55], pier: [6.5, 6.55], shores: [6.5, 3.6] };
const LANDMARK_PINS = { diner: 'D', garage: 'G', club: 'C', docks: 'W', shores: 'M', caracol: 'K', tower: 'T', clinic: '+', pier: 'P' };
const VIEW = { x0: -40, z0: -40, x1: OCEAN_X + 100, z1: CITY_SIZE + 40 };
function drawPauseMap(cv) {
  const g = cv.getContext('2d');
  const img = cityMapImage();
  const a = toMap(VIEW.x0, VIEW.z0), b = toMap(VIEW.x1, VIEW.z1);
  g.imageSmoothingEnabled = false;
  g.drawImage(img, a.x, a.y, b.x - a.x, b.y - a.y, 0, 0, cv.width, cv.height);
  const sx = cv.width / (VIEW.x1 - VIEW.x0), sz = cv.height / (VIEW.z1 - VIEW.z0);
  const P = (x, z) => ({ x: (x - VIEW.x0) * sx, y: (z - VIEW.z0) * sz });
  // District tints + labels at each district's block centroid
  for (const d of DISTRICTS) {
    const [bx, bz] = LABEL_AT[d.id];
    label(g, d.name, P(bx * CELL, bz * CELL), d.color);
  }
  label(g, BEACH_NAME, P(CITY_SIZE + 26, 1.6 * CELL), '#ffe36b', true, true);
  // Landmarks
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
  // Landmark + mission pins
  const pin = (p, col, ch) => {
    g.fillStyle = '#12061c'; g.fillRect(p.x - 10, p.y - 10, 20, 20);
    g.fillStyle = col; g.fillRect(p.x - 8, p.y - 8, 16, 16);
    g.fillStyle = '#12061c'; g.font = 'bold 13px Arial Black, sans-serif'; g.textAlign = 'center'; g.fillText(ch, p.x, p.y + 5);
  };
  pin(P(city.landmarks.safehouse.x, city.landmarks.safehouse.z), '#2ee6c8', 'H');
  // GPS route to the current job: along the road grid from the player to the target.
  const cur = ms.def || nextMission();
  const goal = ms.goal || (cur && city.landmarks[cur.start]);
  if (goal) {
    const a = nearestNode(player.x, player.z), b = nearestNode(goal.x, goal.z);
    const pa = nodePos(a.i, a.j), pb = nodePos(b.i, b.j);
    const pts = [P(player.x, player.z), P(pa.x, pa.z), P(pb.x, pa.z), P(pb.x, pb.z), P(goal.x, goal.z)];
    g.lineJoin = 'round';
    for (const [w, c] of [[9, '#12061c'], [5, '#ff4fa3']]) {
      g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
      g.lineWidth = w; g.strokeStyle = c; g.setLineDash(c === '#12061c' ? [] : [10, 6]); g.stroke();
    }
    g.setLineDash([]);
  }
  // Story pins, numbered 1-9: done (green tick), the current job (big, yellow), the rest (grey).
  const byStart = {};
  MISSIONS.forEach((m, i) => (byStart[m.start] ||= []).push(i));
  MISSIONS.forEach((m, i) => {
    const l = city.landmarks[m.start], group = byStart[m.start], k = group.indexOf(i);
    const at = P(l.x, l.z);
    const x = at.x + (k - (group.length - 1) / 2) * 24, y = at.y - 20;
    const done = game.missionsDone.includes(m.id), now = cur && cur.id === m.id;
    storyPin(g, x, now ? y - 6 : y, i + 1, done ? '#5dff6a' : now ? '#ffd23f' : '#b8b0c8', now ? 15 : 11, done);
  });
  if (ms.goal) pin(P(ms.goal.x, ms.goal.z), '#ff4fa3', '!');
  for (const u of police.units) { const p = P(u.x, u.z); g.fillStyle = '#2a6aff'; g.fillRect(p.x - 5, p.y - 5, 10, 10); }
  const pp = P(player.x, player.z);
  g.beginPath(); g.arc(pp.x, pp.y, 9, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#12061c'; g.stroke();
  g.fillStyle = '#ff4fa3'; g.beginPath(); g.arc(pp.x, pp.y, 4, 0, Math.PI * 2); g.fill();
  // Frame + compass
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

function label(g, text, p, color, small = false, vertical = false) {
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

// ---- Keyboard navigation -----------------------------------------------------------------
export function menuKey(code) {
  if (document.getElementById('title')) {
    if (code === 'ArrowDown' || code === 'KeyS') { titleSel = (titleSel + 1) % titleItems.length; blip(); renderTitleMenu(); }
    if (code === 'ArrowUp' || code === 'KeyW') { titleSel = (titleSel + titleItems.length - 1) % titleItems.length; blip(); renderTitleMenu(); }
    if (code === 'Enter' || code === 'Space') titleItems[titleSel].act();
    return true;
  }
  if (document.getElementById('pause')) {
    const i = TABS.indexOf(pauseTab);
    if (code === 'ArrowRight' || code === 'KeyD') { pauseTab = TABS[(i + 1) % TABS.length]; renderPause(); }
    if (code === 'ArrowLeft' || code === 'KeyA') { pauseTab = TABS[(i + TABS.length - 1) % TABS.length]; renderPause(); }
    if (pauseTab === 'map' && (code === 'ArrowDown' || code === 'KeyS')) { pauseSel = (pauseSel + 1) % 3; renderPause(); }
    if (pauseTab === 'map' && (code === 'ArrowUp' || code === 'KeyW')) { pauseSel = (pauseSel + 2) % 3; renderPause(); }
    if (pauseTab === 'map' && code === 'Enter') doAction(['resume', 'save', 'quit'][pauseSel]);
    return true;
  }
  return false;
}
