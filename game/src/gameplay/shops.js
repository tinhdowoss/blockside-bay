// Garages and the gun counter: menus opened by stopping in a site and pressing G, options bought with
// the number keys 1-4 (the keys are swallowed while a menu is open so weapons do not switch).
//   PAINT & PISTON garage - repair, respray (a fresh colour sheds one wanted star if no unit can see
//     you pull in), engine tune (3 levels: top speed + acceleration), grip kit (2 levels)
//   LEAD & LIME gun counter - pistol ammo, SMG and scatter gun (unlock early with enough street rep,
//     then ammo), body armour
import { SHOP, TUNE, RESPRAY_COLORS, SITES } from '../data/activities-data.js';
import { WEAPONS } from '../core/config.js';
import { makeCar } from '../world/models.js';
import { player } from './player.js';
import { police } from './police.js';
import { repLevel } from './progression.js';
import { game, emit, addCash } from '../core/state.js';

export const shop = { open: null, site: null, flash: null };

export function openShop(site) { shop.open = site.kind; shop.site = site; shop.flash = null; emit('uiOpen'); }
export function closeShop() { shop.open = null; shop.site = null; }

const say = (text, ok = true) => { shop.flash = { text, ok, t: 2 }; emit(ok ? 'purchase' : 'denied'); };

function spend(price) {
  if (game.cash < price) { say(`NEED $${price.toLocaleString('en-US')}`, false); return false; }
  addCash(-price);
  game.side.spent += price;
  return true;
}

// Per-car tune state lives on the vehicle; the spec is cloned the first time a car is modified so
// other cars of the same model are untouched.
function tune(v) {
  if (!v.tune) { v.tune = { engine: 0, grip: 0 }; v.spec = { ...v.spec }; }
  return v.tune;
}

export function tuneOptions(v) {
  const t = v.tune || { engine: 0, grip: 0 };
  return TUNE.map((o) => {
    let price = o.price, note = o.sub, off = false;
    if (o.id === 'repair' && v.health >= 99.5) { note = 'Already mint'; off = true; }
    if (o.id === 'engine') { price = o.price * (t.engine + 1); note = t.engine >= o.max ? 'MAXED' : `Level ${t.engine + 1}/${o.max}  ·  ${o.sub}`; off = t.engine >= o.max; }
    if (o.id === 'grip') { price = o.price * (t.grip + 1); note = t.grip >= o.max ? 'MAXED' : `Level ${t.grip + 1}/${o.max}  ·  ${o.sub}`; off = t.grip >= o.max; }
    if (o.id === 'respray') note = police.level > 0 ? (police.seen ? 'Cops are watching - colour only' : 'Sheds 1 wanted star') : o.sub;
    return { ...o, price, note, off };
  });
}

export function shopOptions() {
  const lv = repLevel().level;
  return SHOP.map((o) => {
    let price = o.price, label = o.label, note = o.sub, off = false;
    if (o.unlock && !game.weapons[o.id]) {
      price = o.unlock; label = `${o.label} (BUY)`;
      note = lv >= o.rep ? 'Unlock now, ammo included' : `Needs REP ${o.rep}`;
      off = lv < o.rep;
    }
    if (o.id === 'armor' && game.armor >= 100) { note = 'Already full'; off = true; }
    return { ...o, price, label, note, off };
  });
}

function respray(v) {
  const scene = v.mesh.parent;
  let col = v.color;
  while (col === v.color) col = RESPRAY_COLORS[Math.floor(Math.random() * RESPRAY_COLORS.length)];
  scene.remove(v.mesh);
  v.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  v.color = col;
  v.mesh = makeCar(v.model, col);
  scene.add(v.mesh);
  v.sync();
  v.stolen = false;
  game.side.resprays++;
  if (police.level > 0 && !police.seen) {
    police.level--;
    police.evade = 0;
    emit('wanted', police.level);
    if (police.level === 0) emit('lostCops');
    say('FRESH PAINT  ·  ONE STAR SHED');
  } else say(police.level > 0 ? 'FRESH PAINT  ·  THEY SAW YOU COME IN' : 'FRESH PAINT');
}

// Handles a number key while a menu is open. Returns true if the key was used.
export function shopKey(n) {
  if (!shop.open) return false;
  if (shop.open === 'garage') {
    const v = player.vehicle;
    if (!v) return false;
    const o = tuneOptions(v).find((q) => q.key === n);
    if (!o) return false;
    if (o.off) { say(o.note.toUpperCase(), false); return true; }
    if (!spend(o.price)) return true;
    const t = tune(v);
    if (o.id === 'repair') { v.health = 100; say('GOOD AS NEW'); }
    if (o.id === 'respray') respray(v);
    if (o.id === 'engine') { t.engine++; v.spec.top *= 1.07; v.spec.accel *= 1.12; game.side.upgrades++; say(`ENGINE LEVEL ${t.engine}`); }
    if (o.id === 'grip') { t.grip++; v.spec.grip *= 1.12; game.side.upgrades++; say(`GRIP LEVEL ${t.grip}`); }
    return true;
  }
  const o = shopOptions().find((q) => q.key === n);
  if (!o) return false;
  if (o.off) { say(o.note.toUpperCase(), false); return true; }
  if (!spend(o.price)) return true;
  if (o.id === 'armor') { game.armor = 100; say('ARMOR STRAPPED ON'); return true; }
  if (o.unlock && !game.weapons[o.id]) {
    game.weapons[o.id] = true;
    const w = WEAPONS.find((q) => q.id === o.id);
    game.clip[o.id] = w.clip;
    game.ammo[o.id] = (game.ammo[o.id] || 0) + o.give.n;
    say(`${o.label} UNLOCKED`);
    return true;
  }
  game.ammo[o.give.ammo] = (game.ammo[o.give.ammo] || 0) + o.give.n;
  say(`+${o.give.n} ${{ pump: 'SHELLS', lance: 'BOLTS' }[o.id] || 'ROUNDS'}`);
  return true;
}

export function shopPanel() {
  if (!shop.open) return null;
  const garage = shop.open === 'garage';
  const v = player.vehicle;
  const opts = garage ? (v ? tuneOptions(v) : []) : shopOptions();
  return {
    title: shop.site.name, tag: garage ? `${v ? v.spec.name : ''}  ·  BODY ${v ? Math.round(v.health) : 0}%` : `REP ${repLevel().level}  ·  ARMOR ${Math.round(game.armor)}`,
    color: shop.site.color, opts, flash: shop.flash,
  };
}

export const garages = SITES.filter((s) => s.kind === 'garage');
