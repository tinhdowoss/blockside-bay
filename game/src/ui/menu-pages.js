// Menu pages shared by the title screen and the pause menu: MISSIONS (chapter, status, best time and
// rating), STATS (career numbers by section), SAVE slots, CONTROLS (full key list + how to play) and
// CREDITS. Each returns an HTML string; menus.js places it and wires the buttons.
import { MISSIONS, CHAPTER_NAMES } from '../data/missions-data.js';
import { CAST, CREW } from '../data/cast.js';
import { listSlots } from '../core/save.js';
import { game } from '../core/state.js';
import { statSections } from '../gameplay/stats.js';
import { ms, nextMission } from '../gameplay/missions.js';

export const KEYS = [
  ['ON FOOT', [['W A S D', 'Walk'], ['SHIFT', 'Sprint'], ['MOUSE', 'Look / aim'], ['CLICK', 'Shoot / punch'], ['R', 'Reload'], ['1 - 5', 'Pick a weapon'], ['TAB / Q', 'Next weapon'], ['C', 'Crouch behind cover'], ['SPACE', 'Dodge roll'], ['E', 'Talk to people']]],
  ['DRIVING', [['W / S', 'Gas / brake + reverse'], ['A / D', 'Steer'], ['SPACE / SHIFT', 'Handbrake drift'], ['F', 'Get in / steal / get out'], ['E', 'Next radio station']]],
  ['CITY', [['G', 'Races, taxi, parcels, garage, gun counter'], ['1 - 4', 'Buy in a shop menu'], ['ENTER', 'Close results / retry a job'], ['M', 'City map + save'], ['ESC', 'Pause menu']]],
];

export function controlsHTML() {
  const cols = KEYS.map(([h, rows]) => `<div class="kcol"><h3>${h}</h3>${rows.map(([k, d]) => `<div class="k"><span class="kc">${k}</span>${d}</div>`).join('')}</div>`).join('');
  return `<div class="controls"><div class="kcols">${cols}</div>
    <div class="howto"><h3>HOW TO PLAY</h3>Walk into a <b style="color:#ffd23f">yellow beam</b> to start a story job and follow the <b style="color:#ff4fa3">pink GPS line</b> on the minimap.
    Walk up to any car and press <span class="kc">F</span> to take it - pulling a driver out earns a wanted star. Break line of sight with the BBPD and the stars cool down.
    Side jobs at the round map pins pay cash and street rep; rep levels unlock better gear at the gun counter. Click the game once to lock the mouse.</div></div>`;
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const MEDAL = { GOLD: '#ffd23f', SILVER: '#e0e8ff', BRONZE: '#ff9a5c' };

export function missionsHTML() {
  const now = (ms.def || nextMission())?.id;
  return `<div class="list">${MISSIONS.map((m) => {
    const done = game.missionsDone.includes(m.id), best = game.missionBest?.[m.id];
    const status = done ? `<span style="color:#5dff6a">COMPLETE</span>` : m.id === now ? '<span style="color:#ffd23f">AVAILABLE NOW</span>' : '<span style="color:#9a8ab0">LOCKED</span>';
    const rating = best ? `  ·  BEST ${mmss(best.time)} <b style="color:${MEDAL[best.medal]}">${best.medal}</b>` : '';
    return `<div class="mcard panel ${done ? 'done' : m.id === now ? 'now' : 'locked'}"><div class="h">CH ${m.chapter} ${CHAPTER_NAMES[m.chapter]} · ${m.title}</div>
      <div class="blurb">${m.blurb}</div>
      <div class="meta">${status}  ·  $${m.reward.toLocaleString('en-US')}  ·  ${CAST[m.giver].name}${rating}</div>
      <div class="meta dim">${m.stages.length} STAGES  ·  PAR ${mmss(m.par || 300)}${m.unlock ? `  ·  UNLOCKS ${m.unlock.toUpperCase()}` : ''}</div></div>`;
  }).join('')}</div>`;
}

export function statsHTML() {
  const fit = (v) => { const n = String(v).length; return n > 12 ? ' class="sm"' : ''; };
  return `<div class="statgrid">${statSections().map(([h, rows]) => `<div class="card panel ssec"><h3>${h}</h3>${rows.map(([k, v]) => `<div class="srow"><span>${k}</span><b${fit(v)}>${v}</b></div>`).join('')}</div>`).join('')}</div>`;
}

export function saveHTML() {
  return `<div class="slots">${listSlots().map((s) => `<div class="card panel"><h3>SLOT ${s.slot + 1}${s.slot === game.slot ? '  (CURRENT)' : ''}</h3>
    <div style="font-size:30px;color:#5dff6a">${s.data ? s.data.pct + '%' : 'EMPTY'}</div>
    <div style="font-family:Trebuchet MS;font-weight:bold;font-size:14px;margin:6px 0">${s.data ? `${s.data.chapter}<br>${s.data.place}  ·  $${s.data.cash.toLocaleString()}<br>${new Date(s.data.savedAt).toLocaleString()}` : 'No data'}</div>
    <div class="btn panel" data-save="${s.slot}" style="padding:6px;text-align:center">SAVE HERE</div></div>`).join('')}</div>`;
}

export function creditsHTML() {
  const crew = CREW.map((id) => `<div><b style="color:${CAST[id].accent || CAST[id].shirt}">${CAST[id].name}</b> ${CAST[id].role}</div>`).join('');
  return `<div class="credits"><h3>BLOCKSIDE BAY</h3>
    <div class="cl">An original voxel open-world crime story. Every character, district, street, shop, song and line of dialogue was made for this game.</div>
    <h3>THE CREW</h3><div class="cgrid">${crew}</div>
    <h3>THE OPPOSITION</h3><div class="cgrid"><div><b style="color:#a020f0">RICO OCAMPO</b> Neon Vipers</div><div><b style="color:#f4f4f4">AUGUSTINE SALT</b> Saltwater Kings</div><div><b style="color:#3fa0ff">BBPD</b> Blockside Bay Police</div></div>
    <h3>MADE WITH</h3><div class="cl">Design, code, voxel models, pixel portraits and fonts: the BLOCKSIDE BAY team. Music and sound: procedural WebAudio, four original stations.
    Rendering: three.js (MIT licence). Made for the make.fun "Make GTA 6" challenge.</div>
    <div class="cl dim">Thanks for playing. Drive safe out there - or at least drive pink.</div></div>`;
}
