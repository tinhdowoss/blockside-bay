// Shared game state (the run in progress) plus a tiny event bus between systems.

export const game = {
  mode: 'boot',          // boot | title | play | pause | down
  time: 0,               // seconds of play this session
  cash: 2500,
  health: 100,
  armor: 50,
  weapons: { fists: true, pistol: true, smg: false, pump: false },
  ammo: { pistol: 60, smg: 0, pump: 0 },
  clip: { pistol: 12, smg: 0, pump: 0 },
  rep: 0,                // street reputation XP (gameplay/progression.js)
  weapon: 1,             // index into WEAPONS
  missionsDone: [],
  activeMission: null,
  // Career counters; every key is listed in gameplay/stats.js (STAT_DEFAULTS), which resets them per run.
  stats: { stolen: 0, copCars: 0, wrecked: 0, headshots: 0, kills: 0, shots: 0, hits: 0, distance: 0, walked: 0, topSpeed: 0, maxStars: 0, evaded: 0,
    cuffed: 0, downed: 0, playSeconds: 0, stunts: 0, racesWon: 0, earned: 0, missionFails: 0 },
  skills: { driving: 0.2, shooting: 0.15, stamina: 0.3, stealth: 0.1 },
  radioStation: 0,
  slot: 0,
  shot: null,            // screenshot scene name when staging
};

const handlers = {};
export function on(evt, fn) { (handlers[evt] ||= []).push(fn); }
export function emit(evt, data) { for (const fn of handlers[evt] || []) fn(data); }

export function addCash(n) {
  game.cash = Math.max(0, game.cash + n);
  emit('cash', n);
}

export function bumpSkill(name, amt) {
  game.skills[name] = Math.min(1, game.skills[name] + amt);
}

// Overall completion % used by the save slots and the pause menu.
export function completion() {
  const story = game.missionsDone.length / 9;
  const skills = Object.values(game.skills).reduce((a, b) => a + b, 0) / 4;
  const stolen = Math.min(1, game.stats.stolen / 30);
  // Side content: SEA GLASS shards, race medals, taxi fares and parcel runs.
  const s = game.side || {};
  const medals = Object.values(s.raceMedal || {}).reduce((a, m) => a + ({ gold: 1, silver: 0.66, bronze: 0.33 }[m] || 0), 0) / 3;
  const side = (s.shells?.length || 0) / 30 * 0.4 + medals * 0.3 + Math.min(1, (s.fares || 0) / 10) * 0.15 + Math.min(1, (s.runs || 0) / 3) * 0.15;
  return Math.round((story * 0.6 + skills * 0.15 + stolen * 0.05 + side * 0.2) * 100);
}
