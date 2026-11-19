// Street reputation: XP earned from story missions, takedowns, headshots, car thefts and escapes.
// Levels (REP_LEVELS) carry titles shown on the HUD; levelling up pays out and pops a banner.
import { REP_LEVELS, REP_TITLES } from '../core/config.js';
import { game, on, emit, addCash } from '../core/state.js';

/** Level, title and progress into the current level for an XP total (default: the player's). */
export function repLevel(xp = game.rep || 0) {
  let lv = 0;
  while (lv + 1 < REP_LEVELS.length && xp >= REP_LEVELS[lv + 1]) lv++;
  const lo = REP_LEVELS[lv], hi = REP_LEVELS[lv + 1] ?? lo;
  return { level: lv + 1, title: REP_TITLES[lv], xp, into: xp - lo, need: hi - lo, frac: hi > lo ? (xp - lo) / (hi - lo) : 1 };
}

/** Grants n rep during play (why labels the HUD gain popup); a level-up pays 250 x level. */
export function addRep(n, why) {
  if (game.mode !== 'play' || n <= 0) return;
  const before = repLevel().level;
  game.rep = (game.rep || 0) + n;
  game.repGain = { n, why, t: 2.2 };
  const now = repLevel();
  if (now.level > before) {
    addCash(250 * now.level);
    emit('banner', { top: `REP LEVEL ${now.level}`, title: now.title, color: '#2ee6c8' });
  }
}

// Highest wanted level reached in the current chase; an escape pays 30 rep per star of it.
let wantedPeak = 0;
/** Hooks the events that earn rep. */
export function setupProgression() {
  on('missionPassed', (def) => addRep(Math.round(def.reward / 12), 'STORY'));
  on('shooterDown', (c) => addRep(c.boss ? 150 : c.headshot ? 25 : 12, c.boss ? 'BOSS' : c.headshot ? 'HEADSHOT' : 'TAKEDOWN'));
  on('crime', (e) => { if (e.kind === 'carjack') addRep(20, 'CARJACK'); });
  on('wanted', (n) => { wantedPeak = Math.max(wantedPeak, n); });
  on('lostCops', () => { addRep(wantedPeak * 30, 'ESCAPED'); wantedPeak = 0; });
}

/** Rep a save slot started with, from story progress (old saves had no rep field). */
export function repFromStory(done) { return done * 260; }
