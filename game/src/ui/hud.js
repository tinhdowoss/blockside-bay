// HUD: mission panel, police-response list, clock, cash, wanted stars, weapon slots and ammo,
// health/armor, speedometer + car name, radio panel, crosshair, popups, banners and toasts.
import { WEAPONS } from '../core/config.js';
import { game, on } from '../core/state.js';
import { player } from '../gameplay/player.js';
import { police, responseList } from '../gameplay/police.js';
import { objectiveInfo } from '../gameplay/missions.js';
import { sky } from '../world/daylight.js';
import { districtAt } from '../world/city.js';
import { isReloading } from '../gameplay/combat.js';
import { radioInfo } from '../audio/radio.js';

const THREE = window.THREE;
let root, camera, els = {};
const popups = [];
let banner = null, toast = null, lastDistrict = '', districtT = 0, shownCash = 0;

const ICONS = {
  fists: ['................', '.....XXXXXX.....', '....XXXXXXXX....', '....XX.XX.XX....', '....XXXXXXXX....', '.....XXXXXXX....', '......XXXXX.....', '......XXXXX.....'],
  pistol: ['................', '..XXXXXXXXXXXX..', '..XXXXXXXXXXXX..', '..XXXXXXX.......', '..XXXX.X........', '..XXXX..........', '..XXXX..........', '................'],
  smg: ['................', 'XXXXXXXXXXXXXXX.', 'XXXXXXXXXXXXXXX.', '...XXXXX.X......', '...XXX.XXX......', '...XXX..XX......', '...XXX..XX......', '........XX......'],
};

function icon(id) {
  const cv = document.createElement('canvas');
  cv.width = 16; cv.height = 8;
  const g = cv.getContext('2d');
  ICONS[id].forEach((row, y) => [...row].forEach((c, x) => { if (c === 'X') { g.fillStyle = '#ffffff'; g.fillRect(x, y, 1, 1); } }));
  return cv;
}

export function setupHud(cam) {
  camera = cam;
  root = document.getElementById('hud');
  root.innerHTML = `
    <div id="hurt"></div>
    <div id="mission" class="panel outl">
      <div class="m-head"><span class="m-ch">CH 1</span><span class="m-title"></span></div>
      <div class="m-text"></div>
      <div class="m-bar"><i></i></div>
      <div class="m-meta"><span class="m-count"></span><span class="m-dots"></span></div>
    </div>
    <div id="response" class="outl"></div>
    <div id="topright" class="outl">
      <div id="clock"></div>
      <div id="cash">$0</div>
      <div id="stars"></div>
      <div id="weapons"></div>
      <div id="ammo"></div>
    </div>
    <div id="mapwrap" class="outl">
      <div id="district"></div>
      <canvas id="minimap" width="214" height="214"></canvas>
      <div class="bar" id="hp"><b style="color:#7cff8a">+</b><i></i></div>
      <div class="bar" id="ar"><b style="color:#9fe0ff">&#9670;</b><i></i></div>
    </div>
    <div id="radio" class="panel outl"><div class="eq"></div><div><div class="st"></div><div class="tag"></div></div></div>
    <div id="speedo" class="outl"><div><span class="num">0</span> <span class="unit">MPH</span></div><div class="gear"></div><div class="car"></div></div>
    <div id="crosshair"><i></i><i></i><i></i><i></i></div>
    <div id="banner" class="outl"></div>
    <div id="toastline" class="outl"></div>
    <div id="downscreen" class="outl"><div class="t"></div><div class="s"></div></div>`;
  for (const id of ['mission', 'response', 'clock', 'cash', 'stars', 'weapons', 'ammo', 'district', 'hp', 'ar', 'radio', 'speedo', 'crosshair', 'banner', 'toastline', 'hurt', 'downscreen', 'mapwrap', 'topright']) els[id] = document.getElementById(id);
  els.weapons.innerHTML = WEAPONS.map((w) => `<div class="slot panel" data-id="${w.id}"></div>`).join('');
  els.weapons.querySelectorAll('.slot').forEach((s, i) => { s.appendChild(icon(WEAPONS[i].id)); const b = document.createElement('b'); b.textContent = WEAPONS[i].name; s.appendChild(b); });
  els.radio.querySelector('.eq').innerHTML = '<i></i>'.repeat(7);
  els.speedo.querySelector('.gear').innerHTML = '<span></span>'.repeat(10);
  els.stars.innerHTML = '<span>&#9733;</span>'.repeat(5);
  on('popup', (p) => addPopup(p));
  on('banner', (b) => { banner = { ...b, t: 4 }; });
  on('toast', (t) => { toast = { ...t, t: 2.6 }; });
  on('hurt', () => { els.hurt.style.opacity = 1; });
  shownCash = game.cash;
}

function addPopup(p) {
  const el = document.createElement('div');
  el.className = 'popup outl' + (p.big ? ' big' : '');
  el.textContent = p.text;
  el.style.color = p.color || '#fff';
  root.appendChild(el);
  popups.push({ el, x: p.x, y: p.y, z: p.z, t: p.hold ? 1e9 : 1.6 });
}

const v3 = new THREE.Vector3();
function place(el, x, y, z) {
  v3.set(x, y, z).project(camera);
  if (v3.z > 1) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.left = `${(v3.x * 0.5 + 0.5) * innerWidth}px`;
  el.style.top = `${(-v3.y * 0.5 + 0.5) * innerHeight}px`;
}

export function showHud(on_) { root.style.display = on_ ? 'block' : 'none'; }

export function updateHud(dt) {
  // Mission panel
  const m = objectiveInfo();
  const mp = els.mission;
  mp.querySelector('.m-ch').textContent = m.chapter ? `CH ${m.chapter}` : 'FREE';
  mp.querySelector('.m-title').textContent = m.title;
  mp.querySelector('.m-text').textContent = m.text;
  const frac = m.frac ?? (m.stages ? (m.stage) / m.stages : 0);
  mp.querySelector('.m-bar').style.display = m.idle ? 'none' : 'block';
  mp.querySelector('.m-bar i').style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  const meta = [];
  if (m.timer != null) meta.push(`${Math.floor(m.timer / 60)}:${String(Math.floor(m.timer % 60)).padStart(2, '0')} LEFT`);
  if (m.count) meta.push(`${m.count} DOWN`);
  if (m.extra) meta.push(m.extra);
  mp.querySelector('.m-count').textContent = m.idle ? 'NEW MISSION' : meta.join('  ·  ') || `STAGE ${m.stage + 1}/${m.stages}`;
  mp.querySelector('.m-dots').innerHTML = m.stages ? Array.from({ length: m.stages }, (_, i) => `<span class="${i < m.stage ? 'done' : i === m.stage ? 'now' : ''}"></span>`).join('') : '';

  // Police response list
  const rl = responseList();
  els.response.style.top = `${mp.offsetHeight + 26}px`;
  els.response.innerHTML = rl.length ? '<div class="r-title">POLICE RESPONSE</div>' + rl.map((r) => `<div style="border-left-color:${r.color};color:${r.color}">${r.label}</div>`).join('') : '';

  // Clock, cash, stars
  const h = Math.floor(sky.hour), mi = Math.floor((sky.hour % 1) * 60);
  els.clock.textContent = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}  ·  DAY ${1 + Math.floor(game.stats.playSeconds / 900)}`;
  shownCash += (game.cash - shownCash) * Math.min(1, dt * 6);
  if (Math.abs(game.cash - shownCash) < 1 || !dt) shownCash = game.cash;
  els.cash.textContent = `$${Math.round(shownCash).toLocaleString('en-US').padStart(1, '0')}`;
  els.stars.querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', i < police.level));
  els.stars.classList.toggle('flash', police.level > 0 && !police.seen);

  // Weapons and ammo
  els.weapons.querySelectorAll('.slot').forEach((s, i) => {
    s.classList.toggle('on', i === game.weapon);
    s.classList.toggle('locked', !game.weapons[WEAPONS[i].id]);
  });
  const w = WEAPONS[game.weapon];
  els.ammo.innerHTML = w.clip ? (isReloading() ? 'RELOADING' : `${game.clip[w.id]} <small>/ ${game.ammo[w.id]}</small>`) : '<small>MELEE</small>';

  // Health / armor
  els.hp.querySelector('i').style.width = `${Math.max(0, game.health)}%`;
  els.ar.querySelector('i').style.width = `${Math.max(0, game.armor)}%`;

  // District name
  const d = districtAt(player.x, player.z);
  if (d.name !== lastDistrict) { lastDistrict = d.name; districtT = 4; }
  districtT -= dt;
  els.district.textContent = d.name;
  els.district.style.color = d.color;

  // Speedometer + radio (in a car)
  const v = player.vehicle;
  els.speedo.style.display = v ? 'block' : 'none';
  els.radio.style.display = v ? 'flex' : 'none';
  if (v) {
    const mph = Math.round(v.speed * 2.6);
    els.speedo.querySelector('.num').textContent = mph;
    els.speedo.querySelectorAll('.gear span').forEach((s, i) => { s.className = i < Math.round((v.speed / v.spec.top) * 10) ? (i > 7 ? 'hot' : 'on') : ''; });
    els.speedo.querySelector('.car').innerHTML = `${v.spec.name}${v.stolen ? ' <em>(stolen)</em>' : ''}`;
    const r = radioInfo();
    els.radio.querySelector('.st').textContent = r.name;
    els.radio.querySelector('.st').style.color = r.color;
    els.radio.querySelector('.tag').textContent = r.tag ? `${r.tag}  ·  E: NEXT` : 'E: NEXT STATION';
    els.radio.style.borderLeftColor = r.color;
    els.radio.querySelectorAll('.eq i').forEach((b, i) => { b.style.height = `${r.levels[i] * 24 + 2}px`; b.style.background = r.color; });
  }

  // Crosshair on foot with a gun
  els.crosshair.style.display = !v && game.mode === 'play' && (game.weapon > 0 || player.aiming) ? 'block' : 'none';

  // Popups float up
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.t -= dt;
    p.y += dt * 0.8;
    place(p.el, p.x, p.y, p.z);
    p.el.style.opacity = Math.min(1, p.t);
    if (p.t <= 0) { p.el.remove(); popups.splice(i, 1); }
  }
  if (banner) {
    banner.t -= dt;
    els.banner.innerHTML = `<div class="b-top" style="color:${banner.color}">${banner.top}</div><div class="b-title">${banner.title}</div>`;
    els.banner.style.opacity = Math.min(1, banner.t * 2);
    if (banner.t <= 0) { banner = null; els.banner.innerHTML = ''; }
  }
  if (toast) {
    toast.t -= dt;
    els.toastline.textContent = toast.text;
    els.toastline.style.color = toast.color || '#fff';
    els.toastline.style.opacity = Math.min(1, toast.t * 2);
    if (toast.t <= 0) { toast = null; els.toastline.textContent = ''; }
  }
  els.hurt.style.opacity = Math.max(0, parseFloat(els.hurt.style.opacity || 0) - dt * 2);
}

export function showDown(title, sub) {
  els.downscreen.style.display = title ? 'flex' : 'none';
  if (title) { els.downscreen.querySelector('.t').textContent = title; els.downscreen.querySelector('.s').textContent = sub; }
}

export function hitMarker() {
  els.crosshair.classList.add('hit');
  setTimeout(() => els.crosshair.classList.remove('hit'), 120);
}

export function clearCenterText() {
  banner = null; toast = null;
  els.banner.innerHTML = ''; els.toastline.textContent = '';
}

// Freeze banners/popups (screenshot staging).
export function holdPopup(p) { addPopup({ ...p, hold: true }); }
