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
  stats: { stolen: 0, headshots: 0, kills: 0, shots: 0, hits: 0, distance: 0, maxStars: 0, cuffed: 0, downed: 0, playSeconds: 0, stunts: 0 },
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
  return Math.round((story * 0.7 + skills * 0.2 + stolen * 0.1) * 100);
}
