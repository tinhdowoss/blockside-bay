// BLOCKSIDE BAY save slots (localStorage).
//
// Each slot is one JSON record under SAVE_KEY + slot index (0 .. SAVE_SLOTS-1). A record holds the
// run state (cash, health/armor, weapons/ammo, rep, story progress, stats, skills, radio, time of
// day, position) plus slot-card metadata read by the title and pause menus without loading it:
//   chapter  - "CH n TITLE" of the next story mission, or "STORY COMPLETE"
//   pct      - overall completion % (state.js completion())
//   cash, rep, playSeconds, place (district name), savedAt (ms epoch)
//
// Format versions (field `v`):
//   1 - original format (no playSeconds, rep/chapter may be missing on early saves)
//   2 - current: adds top-level playSeconds and guarantees every metadata field is present;
//       an optional `side` block (races, jobs, SEA GLASS shards) is filled with defaults when absent,
//       and an optional `missionBest` map ({ id: { time, medal } }) holds each mission's best run
// Older records are migrated in memory on read (migrate()), so the menus always see a complete
// record; the stored copy is upgraded the next time that slot is saved. Records from a newer,
// unknown version or that fail validation are treated as empty rather than crashing the game.
//
// Every localStorage access is wrapped in try/catch: private browsing, a full quota or disabled
// storage must never break saving, loading or the menus.
//
// Public API (used by core/main.js, ui/menus.js, dev/shots.js):
//   saveGame(slot?) -> record     readSlot(slot) -> record|null     listSlots() -> [{slot, data}]
//   latestSlot() -> {slot, data}|null     loadGame(slot) -> {x, z}|null     deleteSlot(slot)
import { SAVE_KEY, SAVE_SLOTS } from './config.js';
import { game, completion } from './state.js';
import { player } from '../gameplay/player.js';
import { sky } from '../world/daylight.js';
import { city, districtAt } from '../world/city.js';
import { repFromStory } from '../gameplay/progression.js';
import { MISSIONS } from '../data/missions-data.js';
import { normalizeSide } from '../data/activities-data.js';

export const SAVE_VERSION = 2;

// ---- storage (never throws) ----------------------------------------------------------------

function store() {
  try { return window.localStorage || null; } catch { return null; }
}

function storageGet(key) {
  try { return store()?.getItem(key) ?? null; } catch { return null; }
}

function storageSet(key, value) {
  try { const s = store(); if (!s) return false; s.setItem(key, value); return true; } catch { return false; }
}

function storageRemove(key) {
  try { store()?.removeItem(key); } catch { /* storage unavailable: nothing to remove */ }
}

const validSlot = (slot) => Number.isInteger(slot) && slot >= 0 && slot < SAVE_SLOTS;

// ---- metadata helpers ----------------------------------------------------------------------

// Chapter + title of the next story mission, shown on CONTINUE and the save cards.
function chapterFor(missionsDone) {
  const m = MISSIONS.find((q) => !missionsDone.includes(q.id));
  return m ? `CH ${m.chapter} ${m.title}` : 'STORY COMPLETE';
}

const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// ---- migration -----------------------------------------------------------------------------

// Brings any known older record up to SAVE_VERSION and fills missing/garbled fields with safe
// defaults. Returns null for records that cannot be used (wrong shape or a future version).
function migrate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = num(raw.v, 1);
  if (v > SAVE_VERSION) return null;
  const d = { ...raw };
  d.missionsDone = Array.isArray(d.missionsDone) ? d.missionsDone.filter((id) => typeof id === 'string') : [];
  d.stats = obj(d.stats);
  d.skills = obj(d.skills);
  d.weapons = obj(d.weapons);
  d.ammo = obj(d.ammo);
  d.clip = obj(d.clip);
  d.cash = num(d.cash, 0);
  d.health = num(d.health, 100);
  d.armor = num(d.armor, 0);
  d.weapon = num(d.weapon, 0);
  d.radioStation = num(d.radioStation, 0);
  d.savedAt = num(d.savedAt, 0);
  d.pct = num(d.pct, 0);
  d.rep = num(d.rep, repFromStory(d.missionsDone.length));
  if (typeof d.chapter !== 'string' || !d.chapter) d.chapter = chapterFor(d.missionsDone);
  if (typeof d.place !== 'string') d.place = '';
  if (v < 2) d.playSeconds = num(d.stats.playSeconds, 0);
  d.playSeconds = num(d.playSeconds, num(d.stats.playSeconds, 0));
  // Side progress (races, jobs, SEA GLASS) is an optional block: missing on older v2 saves.
  d.side = normalizeSide(d.side);
  d.v = SAVE_VERSION;
  return d;
}

// ---- public API ----------------------------------------------------------------------------

export function saveGame(slot = game.slot) {
  if (!validSlot(slot)) slot = 0;
  const data = {
    v: SAVE_VERSION, savedAt: Date.now(),
    cash: game.cash, health: game.health, armor: game.armor,
    weapons: game.weapons, ammo: game.ammo, clip: game.clip, weapon: game.weapon,
    rep: game.rep, chapter: chapterFor(game.missionsDone),
    missionsDone: game.missionsDone, stats: game.stats, skills: game.skills, radioStation: game.radioStation,
    hour: sky.hour, x: player.x, z: player.z,
    pct: completion(), place: districtAt(player.x, player.z).name,
    playSeconds: game.stats.playSeconds || 0,
    side: game.side, missionBest: game.missionBest || {},
  };
  storageSet(SAVE_KEY + slot, JSON.stringify(data));
  game.slot = slot;
  return data;
}

// Parsed + migrated record for a slot, or null if the slot is empty/unreadable.
export function readSlot(slot) {
  if (!validSlot(slot)) return null;
  const text = storageGet(SAVE_KEY + slot);
  if (!text) return null;
  try { return migrate(JSON.parse(text)); } catch { return null; }
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
    rep: d.rep,
    weapon: d.weapon || 0, missionsDone: [...d.missionsDone], stats: { ...game.stats, ...d.stats }, skills: { ...game.skills, ...d.skills },
    radioStation: d.radioStation || 0, slot, side: normalizeSide(d.side), missionBest: { ...obj(d.missionBest) },
  });
  if (!game.stats.playSeconds && d.playSeconds) game.stats.playSeconds = d.playSeconds;
  sky.hour = num(d.hour, 11);
  // A save without a usable position (corrupt or hand-edited) restarts outside the safehouse.
  if (!Number.isFinite(d.x) || !Number.isFinite(d.z)) {
    const s = city.landmarks?.safehouse;
    return s ? { x: s.x - 7, z: s.z } : { x: 0, z: 0 };
  }
  return { x: d.x, z: d.z };
}

export function deleteSlot(slot) {
  if (validSlot(slot)) storageRemove(SAVE_KEY + slot);
}
