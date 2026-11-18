// Side-activity hub: owns the saved side-progress record (game.side), the on-screen prompt, the
// activity HUD panel, the shop menus, map pins, and routes the G key:
//   in a car at a race start          -> start the race
//   in a PALOMAR cab                  -> go on / off taxi duty
//   in a car at the BAYLINK depot     -> take a parcel run
//   stopped in a PAINT & PISTON bay   -> open the garage menu (1-4 to buy)
//   on foot at a LEAD & LIME counter  -> open the gun counter (1-4 to buy)
// Only one activity runs at a time and none start during a story mission (story markers wait too).
import { SITES, RACES, medalTimes, defaultSide, normalizeSide } from '../data/activities-data.js';
import { makeMarker, fadeMarker } from '../world/models.js';
import { buildSites, updateSites } from '../world/sites.js';
import { player } from './player.js';
import { ms } from './missions.js';
import { race, setupRaces, startRace, updateRace, endRace, raceInfo, raceStart, fmtTime } from './races.js';
import { job, setupJobs, startTaxi, startCourier, updateJobs, endJob, jobInfo } from './jobs.js';
import { shop, openShop, closeShop, shopKey, shopPanel } from './shops.js';
import { shells, setupCollectibles, updateCollectibles } from './collectibles.js';
import { input, tapped } from '../core/input.js';
import { game, on, emit } from '../core/state.js';
import { sky } from '../world/daylight.js';

export { defaultSide, normalizeSide };
game.side = defaultSide();

const startMarkers = [];
let els = {}, prompt = '', countT = 0, countN = 0;

export function setupActivities(scene) {
  buildSites(scene);
  setupRaces(scene);
  setupJobs(scene);
  setupCollectibles(scene);
  for (const r of RACES) {
    const m = makeMarker('#3fe8ff');
    const p = raceStart(r);
    m.position.set(p.x, 0, p.z);
    m.scale.set(1.6, 0.8, 1.6);
    scene.add(m);
    startMarkers.push({ m, r });
  }
  on('missionStart', () => abortActivity());
  on('playerDown', () => abortActivity());
  on('countdown', (n) => { countN = n; countT = 0.9; });
}

export const activityBusy = () => !!(race.def || job.kind);
export function abortActivity(msg) {
  if (race.def) { endRace(); if (msg) emit('toast', { text: msg, color: '#ff8a5c' }); }
  if (job.kind) endJob(msg);
  closeShop();
  game.sideBusy = false;
}

const dist = (a) => Math.hypot(player.x - a.x, player.z - a.z);

// What G would do right now, with the prompt text. null = nothing here.
function contextAction() {
  const v = player.vehicle;
  if (ms.def) return null;
  if (race.def) return null;
  if (job.kind) return job.kind === 'taxi' ? { text: 'G  GO OFF DUTY', run: () => endJob() } : null;
  for (const { r } of startMarkers) {
    if (dist(raceStart(r)) < 9) {
      const m = medalTimes(r), best = game.side.raceBest[r.id];
      if (!v) return { text: `${r.name}  ·  NEEDS A CAR`, run: null };
      return { text: `G  START ${r.name}  ·  GOLD ${fmtTime(m.gold)}${best ? `  ·  BEST ${fmtTime(best)}` : ''}`, run: () => startRace(r) };
    }
  }
  for (const s of SITES) {
    const d = dist(s);
    if (s.kind === 'garage' && d < 6) {
      if (!v) return { text: `${s.name}  ·  DRIVE IN TO USE`, run: null };
      if (shop.open) return null;
      return v.speed < 3 ? { text: `G  ${s.name}  ·  REPAIR · RESPRAY · TUNE`, run: () => openShop(s) } : { text: `${s.name}  ·  STOP IN THE BAY`, run: null };
    }
    if (s.kind === 'gunshop' && d < 3.5) {
      if (v) return { text: `${s.name}  ·  ON FOOT ONLY`, run: null };
      if (shop.open) return null;
      return { text: `G  ${s.name}  ·  AMMO · GUNS · ARMOR`, run: () => openShop(s) };
    }
    if (s.kind === 'courier' && d < 9) return v ? { text: `G  ${s.name}  ·  START A PARCEL RUN`, run: () => startCourier() } : { text: `${s.name}  ·  TAKE THE VAN, THEN G`, run: null };
    if (s.kind === 'cabstand' && d < 9 && !(v && v.spec.taxi)) return { text: `${s.name}  ·  GET IN A CAB, THEN G`, run: null };
  }
  if (v && v.spec.taxi) return { text: 'G  GO ON TAXI DUTY', run: () => startTaxi() };
  return null;
}

export function updateActivities(dt, t, camera) {
  const playing = game.mode === 'play';
  updateSites(dt, sky.night);
  updateCollectibles(dt, t, camera, playing);
  for (const { m } of startMarkers) {
    m.visible = playing && !race.def && !ms.def;
    m.userData.chev.position.y = 7.2 + Math.sin(t * 3) * 0.4; m.userData.chev.rotation.y = t * 2;
    fadeMarker(m, dist(m.position)); // never wash out the screen when you are standing in it
  }
  if (!playing) return;
  // Menus: number keys buy, walking/driving away closes.
  if (shop.open) {
    for (let n = 1; n <= 5; n++) if (tapped(`Digit${n}`) && shopKey(n)) input.pressed.delete(`Digit${n}`);
    if (shop.flash) shop.flash.t -= dt;
    const far = dist(shop.site) > (shop.open === 'garage' ? 8 : 5);
    if (far || (shop.open === 'garage' && !player.vehicle) || tapped('KeyG')) { closeShop(); input.pressed.delete('KeyG'); }
  }
  const act = contextAction();
  prompt = act ? act.text : '';
  if (act && act.run && tapped('KeyG')) { act.run(); emit('uiOpen'); }
  const res = updateRace(dt, t) || updateJobs(dt, t);
  if (res && res.fail) emit('banner', { top: 'ACTIVITY ENDED', title: res.fail, color: '#ff8a5c' });
  game.sideBusy = activityBusy();
  if (countT > 0) countT -= dt;
}

export function activityTarget() {
  return (race.def && raceInfo()?.target) || (job.kind && jobInfo()?.target) || null;
}

// Map pins for the minimap and the pause map.
export function activityPins() {
  const pins = SITES.map((s) => ({ x: s.x, z: s.z, color: s.color, ch: s.ch, kind: s.kind }));
  for (const r of RACES) { const p = raceStart(r); pins.push({ x: p.x, z: p.z, color: '#3fe8ff', ch: 'R', kind: 'race' }); }
  return pins;
}
export const foundShells = () => shells.spots.filter((s) => game.side.shells.includes(s.id));
export const nearShells = (r = 45) => shells.spots.filter((s) => !game.side.shells.includes(s.id) && dist(s) < r);

// ---- HUD ---------------------------------------------------------------------------------------
let last = {};
const set = (el, key, html) => { if (last[key] !== html) { last[key] = html; el.innerHTML = html; } };
// The HUD root is rebuilt by ui/hud.js setup, so our elements are (re)attached on first use.
function attach() {
  const hud = document.getElementById('hud');
  if (!hud) return false;
  const div = (id, cls) => { const e = document.createElement('div'); e.id = id; e.className = cls; hud.appendChild(e); return e; };
  els = { panel: div('actpanel', 'panel outl'), prompt: div('actprompt', 'outl'), menu: div('actmenu', 'panel outl'), count: div('actcount', 'outl') };
  last = {};
  return true;
}
export function updateActivityHud() {
  if ((!els.panel || !els.panel.isConnected) && !attach()) return;
  const info = raceInfo() || jobInfo();
  const hud = els.panel.parentElement;
  hud.classList.toggle('act-on', !!info);
  hud.classList.toggle('menu-on', !!shop.open);
  if (info) {
    els.panel.style.display = 'block';
    els.panel.style.borderLeftColor = info.color;
    set(els.panel, 'p', `<div class="a-tag" style="color:${info.color}">${info.tag}</div><div class="a-row"><span class="a-title">${info.title}</span><span class="a-big">${info.big}</span></div>
      <div class="a-text">${info.text}</div><div class="a-bar"><i style="width:${Math.round(Math.max(0, Math.min(1, info.frac)) * 100)}%;background:${info.color}"></i></div>
      <div class="a-meta" style="color:${info.metaColor}">${info.meta}</div>`);
  } else els.panel.style.display = 'none';
  els.prompt.style.display = prompt ? 'block' : 'none';
  set(els.prompt, 'pr', prompt.replace(/^G /, '<b>G</b> '));
  const sp = shopPanel();
  if (sp) {
    els.menu.style.display = 'block';
    els.menu.style.borderTopColor = sp.color;
    const flash = sp.flash && sp.flash.t > 0 ? `<div class="s-flash" style="color:${sp.flash.ok ? '#5dff6a' : '#ff5f5f'}">${sp.flash.text}</div>` : '';
    set(els.menu, 'm', `<div class="s-head" style="color:${sp.color}">${sp.title}</div><div class="s-tag">${sp.tag}</div>
      ${sp.opts.map((o) => `<div class="s-opt ${o.off ? 'off' : ''}"><span class="k">${o.key}</span><span class="l">${o.label}<small>${o.note}</small></span><b>${o.off ? '' : '$' + o.price.toLocaleString('en-US')}</b></div>`).join('')}
      ${flash}<div class="s-foot">1-${sp.opts.length} BUY  ·  G CLOSE  ·  CASH $${game.cash.toLocaleString('en-US')}</div>`);
  } else els.menu.style.display = 'none';
  els.count.style.display = countT > 0 ? 'block' : 'none';
  if (countT > 0) { set(els.count, 'c', countN > 0 ? String(countN) : 'GO!'); els.count.style.opacity = Math.min(1, countT * 2); els.count.style.color = countN > 0 ? '#ffd23f' : '#5dff6a'; }
}
