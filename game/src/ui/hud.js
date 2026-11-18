// HUD: mission panel (stage, objective, next step, tip), street-rep bar, police response panel (every unit
// by call sign with distance and state), clock, cash, wanted stars, weapon slots with ammo and locks,
// health/armor, speedometer with gear and body condition, radio, crosshair, popups, banners and toasts.
import { WEAPONS } from '../core/config.js';
import { MISSIONS } from '../data/missions-data.js';
import { game, on } from '../core/state.js';
import { player } from '../gameplay/player.js';
import { police, responseReport, STATE_COLORS } from '../gameplay/police.js';
import { objectiveInfo } from '../gameplay/missions.js';
import { repLevel } from '../gameplay/progression.js';
import { sky } from '../world/daylight.js';
import { districtAt } from '../world/city.js';
import { isReloading } from '../gameplay/combat.js';
import { radioInfo } from '../audio/radio.js';

const THREE = window.THREE;
let root, camera, els = {};
const popups = [];
let banner = null, toast = null, shownCash = 0, lastHTML = {};

const ICONS = {
  fists: ['................', '.....XXXXXX.....', '....XXXXXXXX....', '....XX.XX.XX....', '....XXXXXXXX....', '.....XXXXXXX....', '......XXXXX.....', '......XXXXX.....'],
  pistol: ['................', '..XXXXXXXXXXXX..', '..XXXXXXXXXXXX..', '..XXXXXXX.......', '..XXXX.X........', '..XXXX..........', '..XXXX..........', '................'],
  smg: ['................', 'XXXXXXXXXXXXXXX.', 'XXXXXXXXXXXXXXX.', '...XXXXX.X......', '...XXX.XXX......', '...XXX..XX......', '...XXX..XX......', '........XX......'],
  pump: ['................', 'XXXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXXX', '.XXXX..XXXX.....', 'XXXX............', 'XXX.............', 'XX..............', '................'],
  lock: ['......XXXX......', '.....X....X.....', '.....X....X.....', '....XXXXXXXX....', '....XXX..XXX....', '....XXX..XXX....', '....XXXXXXXX....', '................'],
};

function icon(id) {
  const cv = document.createElement('canvas');
  cv.width = 16; cv.height = 8;
  const g = cv.getContext('2d');
  ICONS[id].forEach((row, y) => [...row].forEach((c, x) => { if (c === 'X') { g.fillStyle = '#ffffff'; g.fillRect(x, y, 1, 1); } }));
  return cv;
}

// Only touch the DOM when the markup actually changed (the HUD updates every frame).
function setHTML(el, key, html) {
  if (lastHTML[key] === html) return;
  lastHTML[key] = html;
  el.innerHTML = html;
}

export function setupHud(cam) {
  camera = cam;
  root = document.getElementById('hud');
  root.innerHTML = `
    <div id="hurt"></div>
    <div id="leftcol">
      <div id="mission" class="panel outl">
        <div class="m-head"><span class="m-ch">CH 1</span><span class="m-title"></span><span class="m-stage"></span></div>
        <div class="m-text"></div>
        <div class="m-bar"><i></i></div>
        <div class="m-meta"><span class="m-count"></span><span class="m-dots"></span></div>
        <div class="m-next"><b>NEXT</b><span></span></div>
        <div class="m-hint"><b>TIP</b><span></span></div>
      </div>
      <div id="rep" class="panel outl"><div class="r-lv"><b class="lv"></b><span class="ttl"></span><em class="gain"></em></div><div class="r-bar"><i></i></div><div class="r-xp"></div></div>
    </div>
    <div id="topright" class="outl">
      <div id="clock"></div>
      <div id="cash">$0</div>
      <div id="stars"></div>
      <div id="weapons"></div>
      <div id="ammo"></div>
      <div id="response" class="panel"></div>
    </div>
    <div id="mapwrap" class="outl">
      <div id="district"></div>
      <canvas id="minimap" width="214" height="214"></canvas>
      <div class="bar" id="hp"><b style="color:#7cff8a">+</b><i></i></div>
      <div class="bar" id="ar"><b style="color:#9fe0ff">&#9670;</b><i></i></div>
    </div>
    <div id="radio" class="panel outl"><div class="eq"></div><div><div class="st"></div><div class="tag"></div></div></div>
    <div id="speedo" class="outl">
      <div class="sp"><span class="num">0</span><span class="unit">MPH</span></div>
      <div class="gearrow"><span class="gearno"></span><div class="gear"></div></div>
      <div class="cond"><b>BODY</b><div class="cbar"><i></i></div><span class="cpct"></span></div>
      <div class="car"></div>
    </div>
    <div id="crosshair"><i></i><i></i><i></i><i></i></div>
    <div id="banner" class="outl"></div>
    <div id="toastline" class="outl"></div>
    <div id="downscreen" class="outl"><div class="t"></div><div class="s"></div></div>`;
  for (const id of ['mission', 'rep', 'response', 'clock', 'cash', 'stars', 'weapons', 'ammo', 'district', 'hp', 'ar', 'radio', 'speedo', 'crosshair', 'banner', 'toastline', 'hurt', 'downscreen', 'mapwrap', 'topright']) els[id] = document.getElementById(id);
  els.weapons.innerHTML = WEAPONS.map((w, i) => `<div class="slot panel" data-id="${w.id}"><span class="key">${i + 1}</span><b></b><small></small></div>`).join('');
  els.weapons.querySelectorAll('.slot').forEach((s, i) => s.insertBefore(icon(WEAPONS[i].id), s.querySelector('b')));
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
  // Pop-ups that appear together stack upwards instead of printing over each other.
  const slot = popups.filter((q) => q.t > 0.8).length;
  popups.push({ el, x: p.x, y: p.y, z: p.z, t: p.hold ? 1e9 : 1.6, lift: slot * 46 });
}

const v3 = new THREE.Vector3();
function place(el, x, y, z, lift = 0) {
  v3.set(x, y, z).project(camera);
  if (v3.z > 1) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.left = `${(v3.x * 0.5 + 0.5) * innerWidth}px`;
  el.style.top = `${(-v3.y * 0.5 + 0.5) * innerHeight - lift}px`;
}

export function showHud(on_) { root.style.display = on_ ? 'block' : 'none'; }

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function updateMission() {
  const m = objectiveInfo();
  const mp = els.mission;
  mp.querySelector('.m-ch').textContent = m.chapter ? `CH ${m.chapter}` : 'FREE';
  mp.querySelector('.m-title').textContent = m.title;
  mp.querySelector('.m-stage').textContent = m.idle ? 'NEW JOB' : `STAGE ${m.stage + 1}/${m.stages}`;
  mp.querySelector('.m-text').textContent = m.text;
  const frac = m.frac ?? (m.stages ? m.stage / m.stages : 0);
  mp.querySelector('.m-bar').style.display = m.idle ? 'none' : 'block';
  mp.querySelector('.m-bar i').style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  const meta = [];
  if (m.timer != null) meta.push(`${mmss(m.timer)} LEFT`);
  if (m.count) meta.push(`${m.count} DOWN`);
  if (m.extra) meta.push(m.extra);
  const metaEl = mp.querySelector('.m-meta');
  metaEl.style.display = m.idle ? 'none' : 'flex';
  mp.querySelector('.m-count').textContent = meta.join('  ·  ') || 'IN PROGRESS';
  setHTML(mp.querySelector('.m-dots'), 'dots', m.stages ? Array.from({ length: m.stages }, (_, i) => `<span class="${i < m.stage ? 'done' : i === m.stage ? 'now' : ''}"></span>`).join('') : '');
  mp.querySelector('.m-next').style.display = m.next ? 'flex' : 'none';
  mp.querySelector('.m-next span').textContent = m.next || '';
  mp.querySelector('.m-hint').style.display = m.hint ? 'flex' : 'none';
  mp.querySelector('.m-hint span').textContent = m.hint || '';
}

function updateRep(dt) {
  const r = repLevel();
  const el = els.rep;
  el.querySelector('.lv').textContent = `REP ${r.level}`;
  el.querySelector('.ttl').textContent = r.title;
  el.querySelector('.r-bar i').style.width = `${r.frac * 100}%`;
  el.querySelector('.r-xp').textContent = r.need ? `${r.into.toLocaleString('en-US')} / ${r.need.toLocaleString('en-US')} XP` : 'MAX LEVEL';
  const g = game.repGain;
  const gain = el.querySelector('.gain');
  if (g && g.t > 0) { g.t -= dt; gain.textContent = `+${g.n} ${g.why}`; gain.style.opacity = Math.min(1, g.t * 2); } else gain.textContent = '';
}

function updateResponse() {
  const r = responseReport();
  if (!r) { setHTML(els.response, 'resp', ''); els.response.style.display = 'none'; return; }
  els.response.style.display = 'block';
  const rows = r.rows.slice(0, 5).map((u) => `<div class="u"><span class="sign">${u.air ? '&#9650; ' : ''}${u.sign}</span><span class="dist">${Math.round(u.d)}m</span><span class="st" style="background:${STATE_COLORS[u.state]}">${u.state}</span></div>`).join('');
  const more = r.rows.length > 5 ? `<div class="more">+${r.rows.length - 5} MORE</div>` : '';
  const status = `<div class="status ${r.seen ? 'seen' : 'lost'}">${r.status}${r.seen ? '' : `<i style="width:${Math.round(r.evade * 100)}%"></i>`}</div>`;
  setHTML(els.response, 'resp', `<div class="hdr"><span>BBPD RESPONSE</span><b>${r.count} UNIT${r.count === 1 ? '' : 'S'}</b></div>${status}${rows}${more}`);
}

function updateWeapons() {
  const w = WEAPONS[game.weapon];
  els.weapons.querySelectorAll('.slot').forEach((s, i) => {
    const id = WEAPONS[i].id, owned = !!game.weapons[id];
    s.classList.toggle('on', i === game.weapon);
    s.classList.toggle('locked', !owned);
    s.querySelector('b').textContent = WEAPONS[i].name;
    const m = MISSIONS.find((d) => d.unlock === id);
    s.querySelector('small').textContent = !owned ? `LOCKED CH${m ? m.chapter : '?'}` : WEAPONS[i].clip ? `${game.clip[id] + game.ammo[id]}` : '∞';
  });
  setHTML(els.ammo, 'ammo', w.clip ? (isReloading() ? 'RELOADING' : `${game.clip[w.id]} <small>/ ${game.ammo[w.id]}</small>`) : '<small>MELEE</small>');
}

function updateSpeedo(v) {
  els.speedo.style.display = v ? 'block' : 'none';
  els.radio.style.display = v ? 'flex' : 'none';
  if (!v) return;
  const mph = Math.round(v.speed * 2.6);
  const k = Math.max(0, v.forwardSpeed) / v.spec.top;
  const gear = v.forwardSpeed < -0.5 ? 'R' : v.speed < 0.5 ? 'N' : String(Math.min(5, 1 + Math.floor(k * 5)));
  els.speedo.querySelector('.num').textContent = mph;
  els.speedo.querySelector('.gearno').textContent = `GEAR ${gear}`;
  // Rev bar: climbs through each gear and drops back on the shift.
  const rev = gear === 'N' ? 0.08 : gear === 'R' ? 0.3 : 0.25 + ((k * 5) % 1) * 0.75;
  els.speedo.querySelectorAll('.gear span').forEach((s, i) => { s.className = i < Math.round(rev * 10) ? (i > 7 ? 'hot' : 'on') : ''; });
  const hp = Math.max(0, Math.round(v.health));
  const cb = els.speedo.querySelector('.cbar i');
  cb.style.width = `${hp}%`;
  cb.style.background = hp > 60 ? '#5dff6a' : hp > 30 ? '#ffd23f' : '#ff3f5f';
  els.speedo.querySelector('.cpct').textContent = `${hp}%`;
  setHTML(els.speedo.querySelector('.car'), 'car', `${v.spec.name}${v.stolen ? ' <em>STOLEN</em>' : ''}`);
  const r = radioInfo();
  els.radio.querySelector('.st').textContent = r.name;
  els.radio.querySelector('.st').style.color = r.color;
  els.radio.querySelector('.tag').textContent = r.tag ? `${r.tag}  ·  E: NEXT` : 'E: NEXT STATION';
  els.radio.style.borderLeftColor = r.color;
  els.radio.querySelectorAll('.eq i').forEach((b, i) => { b.style.height = `${r.levels[i] * 24 + 2}px`; b.style.background = r.color; });
}

export function updateHud(dt) {
  updateMission();
  updateRep(dt);
  updateResponse();

  // Clock, cash, stars
  const h = Math.floor(sky.hour), mi = Math.floor((sky.hour % 1) * 60);
  els.clock.textContent = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}  ·  DAY ${1 + Math.floor(game.stats.playSeconds / 900)}`;
  shownCash += (game.cash - shownCash) * Math.min(1, dt * 6);
  if (Math.abs(game.cash - shownCash) < 1 || !dt) shownCash = game.cash;
  els.cash.textContent = `$${Math.round(shownCash).toLocaleString('en-US')}`;
  els.stars.querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', i < police.level));
  els.stars.classList.toggle('flash', police.level > 0 && !police.seen);

  updateWeapons();

  // Health / armor
  els.hp.querySelector('i').style.width = `${Math.max(0, game.health)}%`;
  els.ar.querySelector('i').style.width = `${Math.max(0, game.armor)}%`;

  const d = districtAt(player.x, player.z);
  els.district.textContent = d.name;
  els.district.style.color = d.color;

  const v = player.vehicle;
  updateSpeedo(v);

  // Crosshair on foot with a gun
  els.crosshair.style.display = !v && game.mode === 'play' && (game.weapon > 0 || player.aiming) ? 'block' : 'none';

  // Popups float up
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.t -= dt;
    p.y += dt * 0.8;
    place(p.el, p.x, p.y, p.z, p.lift);
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
