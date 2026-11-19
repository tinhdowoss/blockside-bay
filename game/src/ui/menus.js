// Title screen (blocky logo, Continue / New / Load / Controls / Settings / Credits, crew portraits) and
// the pause menu shell (MAP, MISSIONS, STATS, SAVE, SETTINGS, CONTROLS, CREDITS tabs). Page contents
// live in menu-pages.js, settings-menu.js and pause-map.js; this file owns layout, navigation,
// transitions and menu sounds. Styles live in game/menus.css.
import { GAME_TITLE, SAVE_SLOTS } from '../core/config.js';
import { drawBlockyTitle, textWidth } from './pixelfont.js';
import { CAST, CREW, portraitURL } from '../data/cast.js';
import { MISSIONS, CHAPTER_NAMES, STORY_HOOK } from '../data/missions-data.js';
import { police } from '../gameplay/police.js';
import { ms, nextMission } from '../gameplay/missions.js';
import { listSlots, latestSlot } from '../core/save.js';
import { game, completion } from '../core/state.js';
import { sky } from '../world/daylight.js';
import { blip, uiClick, uiHover, uiSwoosh } from '../audio/radio.js';
import { repLevel } from '../gameplay/progression.js';
import { settingsHTML, bindSettings, settingsKey, resetSettingsCursor } from './settings-menu.js';
import { controlsHTML, creditsHTML, missionsHTML, statsHTML, saveHTML } from './menu-pages.js';
import { drawPauseMap } from './pause-map.js';

// actions: callbacks from main.js (newGame, continueGame, resume, save, quit).
let root, actions = {}, titleSel = 0, titleSub = null, pauseTab = 'map', pauseSel = 0, titleItems = [];

/** Stores main.js's callbacks and the #menus root. */
export function setupMenus(acts) {
  actions = acts;
  root = document.getElementById('menus');
}

/** The BLOCKSIDE BAY logo drawn with the pixel font on a 300x104 canvas, with palm pixels either side. */
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
/** Builds the title screen (menu items reflect the save slots). */
export function showTitle() {
  const latest = latestSlot();
  titleItems = [
    { id: 'continue', label: 'CONTINUE', sub: latest ? slotLine(latest) : 'No save yet - starts a new story', act: () => actions.continueGame(latest) },
    { id: 'new', label: 'NEW GAME', sub: 'Chapter 1: Homecoming', act: () => actions.newGame() },
    { id: 'load', label: 'LOAD GAME', sub: `${listSlots().filter((s) => s.data).length} of ${SAVE_SLOTS} slots used`, act: () => openTitleSub('load') },
    { id: 'controls', label: 'CONTROLS', sub: 'Keyboard + mouse  ·  how to play', act: () => openTitleSub('controls') },
    { id: 'settings', label: 'SETTINGS', sub: 'Volume x3  ·  mouse  ·  FOV  ·  shake  ·  graphics', act: () => openTitleSub('settings') },
    { id: 'credits', label: 'CREDITS', sub: 'The crew behind the Bay', act: () => openTitleSub('credits') },
  ];
  titleSel = 0;
  titleSub = null;
  root.innerHTML = `<div id="title" class="outl">
    <div class="logo-holder"></div>
    <div class="tagline">A VOXEL CRIME STORY  ·  SUN, NEON & BAD DECISIONS</div>
    <div class="hook">${STORY_HOOK}</div>
    <div class="menu"></div>
    <div class="sub panel"></div>
    <div class="crewlabel">THE CREW</div>
    <div class="crew">${CREW.map((id) => `<div class="c" style="--c:${CAST[id].accent || CAST[id].shirt}"><img src="${portraitURL(id)}" alt=""><b>${CAST[id].name}</b><i>${CAST[id].role}</i></div>`).join('')}</div>
    <div class="foot"><span class="kc">&#8593; &#8595;</span> choose  <span class="kc">&#8592; &#8594;</span> change  <span class="kc">ENTER</span> select  <span class="kc">ESC</span> back</div>
  </div>`;
  const logo = logoCanvas();
  logo.className = 'logo';
  root.querySelector('.logo-holder').appendChild(logo);
  renderTitleMenu();
}

function renderTitleMenu() {
  const menu = root.querySelector('#title .menu');
  if (!menu) return;
  menu.innerHTML = titleItems.map((it, i) => `<div class="btn ${i === titleSel ? 'sel' : ''}" data-i="${i}">${it.label}<small>${it.sub}</small></div>`).join('');
  menu.querySelectorAll('.btn').forEach((b) => {
    b.onmouseenter = () => { if (titleSel !== +b.dataset.i) uiHover(); titleSel = +b.dataset.i; renderTitleMenu(); };
    b.onclick = () => { uiClick(); titleItems[+b.dataset.i].act(); };
  });
}

// Opens a title side panel: load, controls, settings or credits (the crew strip hides behind it).
function openTitleSub(kind) {
  const el = root.querySelector('#title .sub');
  titleSub = kind;
  el.className = `sub panel ${kind === 'controls' || kind === 'credits' ? 'wide' : kind === 'settings' ? 'mid' : ''}`;
  el.style.display = 'block';
  root.querySelector('#title').classList.add('subopen');
  // Restart the pop-in animation (reading offsetWidth forces a reflow between the class changes).
  el.classList.remove('anim'); void el.offsetWidth; el.classList.add('anim');
  uiSwoosh(true);
  if (kind === 'controls') el.innerHTML = controlsHTML();
  if (kind === 'credits') el.innerHTML = creditsHTML();
  if (kind === 'settings') { resetSettingsCursor(); el.innerHTML = settingsHTML(); }
  if (kind === 'load') {
    el.innerHTML = '<h3>LOAD GAME</h3>' + listSlots().map((s) => `<div class="btn panel" data-slot="${s.slot}" style="padding:8px;margin:6px 0;font-size:16px">SLOT ${s.slot + 1}  ${s.data ? `· ${s.data.pct}% · $${s.data.cash.toLocaleString()}<small style="display:block;font-size:12px;color:#ffe9a8">${s.data.chapter}</small>` : '· empty'}</div>`).join('');
    el.querySelectorAll('[data-slot]').forEach((b) => { b.onclick = () => { const s = listSlots()[+b.dataset.slot]; if (s.data) { uiClick(); actions.continueGame(s); } }; b.onmouseenter = () => uiHover(); });
  }
  bindSettings(el);
}

function closeTitleSub() {
  const el = root.querySelector('#title .sub');
  if (el) el.style.display = 'none';
  root.querySelector('#title')?.classList.remove('subopen');
  titleSub = null;
  uiSwoosh(false);
}

/** Removes whichever menu is showing (with a swoosh when it was the pause menu). */
export function hideMenus() {
  if (root.firstElementChild?.id === 'pause') uiSwoosh(false);
  root.innerHTML = '';
}

// One line describing a save: chapter, completion, cash and play time.
function slotLine(s) {
  const d = s.data, secs = d.stats?.playSeconds || 0;
  const time = `${Math.floor(secs / 3600)}h ${String(Math.floor(secs / 60) % 60).padStart(2, '0')}m`;
  return `Slot ${s.slot + 1}  ·  ${d.chapter || d.place}  ·  ${d.pct}%  ·  $${d.cash.toLocaleString('en-US')}  ·  ${time}`;
}

// ---- Pause -----------------------------------------------------------------------------
const TABS = ['map', 'missions', 'stats', 'save', 'settings', 'controls', 'credits'];
const MAP_ACTIONS = ['resume', 'save', 'quit'];

/** Opens the pause menu on a tab. */
export function openPause(tab = 'map') {
  pauseTab = tab;
  pauseSel = 0;
  resetSettingsCursor();
  uiSwoosh(true);
  renderPause(true);
}

// Rebuilds the whole pause screen (top bar, current page, footer) and binds its buttons.
function renderPause(opening = false) {
  const h = Math.floor(sky.hour), mi = Math.floor((sky.hour % 1) * 60);
  root.innerHTML = `<div id="pause" class="outl ${opening ? 'opening' : ''}">
    <div class="top"><span class="brand">${GAME_TITLE}</span>${TABS.map((t) => `<span class="tab btn ${t === pauseTab ? 'sel' : ''}" data-t="${t}">${t.toUpperCase()}</span>`).join('')}
      <div class="info"><b>$${game.cash.toLocaleString('en-US')}</b><br>${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}  ·  ${'&#9733;'.repeat(police.level)}${'&#9734;'.repeat(5 - police.level)}</div></div>
    <div class="body anim">${pauseBody()}</div>
    <div class="pfoot"><span class="kc">Q</span> <span class="kc">E</span> tabs  <span class="kc">ESC</span> resume</div></div>`;
  root.querySelectorAll('.tab').forEach((t) => { t.onclick = () => { uiClick(); setTab(t.dataset.t); }; t.onmouseenter = () => uiHover(); });
  root.querySelectorAll('[data-act]').forEach((b) => { b.onclick = () => { uiClick(); doAction(b.dataset.act); }; b.onmouseenter = () => uiHover(); });
  root.querySelectorAll('[data-save]').forEach((b) => { b.onclick = () => { uiClick(); actions.save(+b.dataset.save); renderPause(); }; b.onmouseenter = () => uiHover(); });
  if (pauseTab === 'map') drawPauseMap(root.querySelector('#pausemap'));
  bindSettings(root);
}

function setTab(t) {
  if (t === pauseTab) return;
  pauseTab = t;
  if (t === 'settings') resetSettingsCursor();
  blip(760);
  renderPause();
}

function doAction(a) {
  if (a === 'resume') actions.resume();
  if (a === 'save') { actions.save(game.slot); renderPause(); }
  if (a === 'quit') actions.quit();
}

// MAP tab: city map, story checklist, skills, legend and the save-slot card with resume/save/quit.
function mapHTML() {
  const done = game.missionsDone.length;
  const current = ms.def || nextMission();
  const story = MISSIONS.map((m, i) => {
    const d = game.missionsDone.includes(m.id), now = current && current.id === m.id;
    return `<div class="${d || now ? '' : 'dim'}"><span class="ck ${d ? 'done' : now ? 'now' : ''}">${d ? '&#10003;' : i + 1}</span>${m.title}<em>$${(m.reward / 1000).toFixed(m.reward % 1000 ? 1 : 0)}K</em></div>`;
  }).join('');
  const skills = Object.entries(game.skills).map(([k, v]) => `<div class="skill">${k.toUpperCase()} <span style="float:right;color:#ffe9a8">LV ${1 + Math.floor(v * 9)}</span><div class="bar"><i style="width:${v * 100}%"></i></div></div>`).join('');
  const pct = completion();
  const rep = repLevel();
  const acts = [['resume', 'RESUME'], ['save', 'SAVE GAME'], ['quit', 'QUIT TO TITLE']];
  const ch = (ms.def || nextMission() || { chapter: 7 }).chapter;
  return `<div class="mapbox panel"><canvas id="pausemap" width="640" height="560"></canvas></div>
    <div class="side">
      <div class="card panel story"><h3>STORY  ${done}/9</h3>${story}</div>
      <div class="card panel"><h3>SKILLS</h3>${skills}</div>
      <div class="card panel legend"><h3>LEGEND</h3>
        <div><span style="background:#ffd23f;border-radius:50% 50% 50% 0"></span>Next job (1-9)</div><div><span style="background:#ff4fa3"></span>Route + objective</div><div><span style="background:#ffffff;border-radius:50%"></span>You</div>
        <div><span style="background:#2a6aff"></span>Police</div><div><span style="background:#ff2a2a"></span>Gang</div><div><span style="background:#2ee6c8"></span>Safehouse</div>
        <div><span style="background:#fff"></span>Landmark</div><div><span style="background:#ffe2a0"></span>Beach</div><div><span style="background:#c08a55"></span>Pier + yacht</div>
        <div><span class="act" style="background:#3fe8ff"></span>Street race (R)</div><div><span class="act" style="background:#ffd23f"></span>Cab stand (T)</div><div><span class="act" style="background:#5dff6a"></span>Parcel depot (D)</div>
        <div><span class="act" style="background:#3fa0ff"></span>Garage (P)</div><div><span class="act" style="background:#ff5f3f"></span>Gun counter (A)</div><div><span class="act" style="background:#5ffff0"></span>Sea glass ${game.side.shells.length}/30</div></div>
      <div class="card panel slotcard"><div class="slotinfo"><h3>SAVE SLOT ${game.slot + 1}</h3><div class="pct">${pct}% <span style="font-size:16px;color:#fff">COMPLETE</span></div>
        <div class="meta">CH ${ch} ${CHAPTER_NAMES[ch]}  ·  ${Math.floor(game.stats.playSeconds / 3600)}h ${String(Math.floor(game.stats.playSeconds / 60) % 60).padStart(2, '0')}m played</div>
        <div class="bar pbar"><i style="width:${pct}%"></i></div>
        <div class="meta rep">REP ${rep.level}  ${rep.title}  ·  ${game.rep.toLocaleString('en-US')} XP</div></div>
        <div class="actions">${acts.map(([a, l], i) => `<div class="btn ${i === pauseSel ? 'sel' : ''}" data-act="${a}">${l}</div>`).join('')}</div></div>
    </div>`;
}

function pauseBody() {
  if (pauseTab === 'map') return mapHTML();
  if (pauseTab === 'missions') return missionsHTML();
  if (pauseTab === 'stats') return statsHTML();
  if (pauseTab === 'save') return saveHTML();
  if (pauseTab === 'controls') return `<div class="card panel pagecard">${controlsHTML()}</div>`;
  if (pauseTab === 'credits') return `<div class="card panel pagecard">${creditsHTML()}</div>`;
  return `<div class="card panel pagecard narrow">${settingsHTML()}</div>`;
}

// ---- Keyboard navigation -----------------------------------------------------------------
/** Routes a key to the open title or pause menu; returns true when a menu took it. */
export function menuKey(code) {
  if (document.getElementById('title')) {
    if (titleSub) {
      if (code === 'Escape' || code === 'Backspace') { closeTitleSub(); return true; }
      if (titleSub === 'settings' && settingsKey(code, root.querySelector('#title .sub'))) return true;
    }
    if (code === 'ArrowDown' || code === 'KeyS') { titleSel = (titleSel + 1) % titleItems.length; blip(); renderTitleMenu(); }
    if (code === 'ArrowUp' || code === 'KeyW') { titleSel = (titleSel + titleItems.length - 1) % titleItems.length; blip(); renderTitleMenu(); }
    if (code === 'Enter' || code === 'Space') { uiClick(); titleItems[titleSel].act(); }
    return true;
  }
  if (document.getElementById('pause')) {
    const i = TABS.indexOf(pauseTab);
    if (pauseTab === 'settings' && settingsKey(code, root)) return true;
    if (code === 'ArrowRight' || code === 'KeyD' || code === 'KeyE') setTab(TABS[(i + 1) % TABS.length]);
    if (code === 'ArrowLeft' || code === 'KeyA' || code === 'KeyQ') setTab(TABS[(i + TABS.length - 1) % TABS.length]);
    if (pauseTab === 'map' && (code === 'ArrowDown' || code === 'KeyS')) { pauseSel = (pauseSel + 1) % 3; blip(); renderPause(); }
    if (pauseTab === 'map' && (code === 'ArrowUp' || code === 'KeyW')) { pauseSel = (pauseSel + 2) % 3; blip(); renderPause(); }
    if (pauseTab === 'map' && code === 'Enter') { uiClick(); doAction(MAP_ACTIONS[pauseSel]); }
    return true;
  }
  return false;
}
