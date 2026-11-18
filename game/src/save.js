// Save slots in localStorage: progress, money, weapons, skills, stats, time of day and position.
import { SAVE_KEY, SAVE_SLOTS } from './config.js';
import { game, completion } from './state.js';
import { player } from './player.js';
import { sky } from './daylight.js';
import { districtAt } from './city.js';

const store = () => { try { return window.localStorage; } catch { return null; } };

export function saveGame(slot = game.slot) {
  const data = {
    v: 1, savedAt: Date.now(),
    cash: game.cash, health: game.health, armor: game.armor,
    weapons: game.weapons, ammo: game.ammo, clip: game.clip, weapon: game.weapon,
    missionsDone: game.missionsDone, stats: game.stats, skills: game.skills, radioStation: game.radioStation,
    hour: sky.hour, x: player.x, z: player.z,
    pct: completion(), place: districtAt(player.x, player.z).name,
  };
  store()?.setItem(SAVE_KEY + slot, JSON.stringify(data));
  game.slot = slot;
  return data;
}

export function readSlot(slot) {
  try { return JSON.parse(store()?.getItem(SAVE_KEY + slot) || 'null'); } catch { return null; }
}

export function listSlots() {
  return Array.from({ length: SAVE_SLOTS }, (_, i) => ({ slot: i, data: readSlot(i) }));
}

export function latestSlot() {
  let best = null;
  for (const s of listSlots()) if (s.data && (!best || s.data.savedAt > best.data.savedAt)) best = s;
  return best;
}

// Applies a slot to the game state; returns the saved position or null.
export function loadGame(slot) {
  const d = readSlot(slot);
  if (!d) return null;
  Object.assign(game, {
    cash: d.cash, health: Math.max(60, d.health), armor: d.armor,
    weapons: { ...game.weapons, ...d.weapons }, ammo: { ...game.ammo, ...d.ammo }, clip: { ...game.clip, ...d.clip },
    weapon: d.weapon || 0, missionsDone: [...d.missionsDone], stats: { ...game.stats, ...d.stats }, skills: { ...game.skills, ...d.skills },
    radioStation: d.radioStation || 0, slot,
  });
  sky.hour = d.hour ?? 11;
  return { x: d.x, z: d.z };
}

export function deleteSlot(slot) { store()?.removeItem(SAVE_KEY + slot); }
