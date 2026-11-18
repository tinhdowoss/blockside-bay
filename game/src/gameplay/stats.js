// Career statistics shown on the pause STATS page: distance driven and walked, top speed, cars and cop
// cars stolen, cars wrecked, stars evaded, races won, cash earned, plus the counters other systems
// already keep (shots, hits, headshots, takedowns, busts, hospital visits). Per-frame distance comes from
// updateStats(); everything else is counted from game events.
import { game, on } from '../core/state.js';
import { player } from './player.js';

export const STAT_DEFAULTS = {
  stolen: 0, copCars: 0, wrecked: 0, headshots: 0, kills: 0, shots: 0, hits: 0, distance: 0, walked: 0, topSpeed: 0,
  maxStars: 0, evaded: 0, cuffed: 0, downed: 0, playSeconds: 0, stunts: 0, racesWon: 0, earned: 0, missionFails: 0,
};
export const freshStats = () => ({ ...STAT_DEFAULTS });

let peak = 0;
export function setupStats() {
  on('enterVehicle', (v) => { if (v.police && game.mode === 'play' && !v.countedCop) { v.countedCop = true; game.stats.copCars++; } });
  on('wanted', (n) => { peak = Math.max(peak, n); });
  on('lostCops', () => { game.stats.evaded += peak; peak = 0; });
  on('activityDone', (e) => { if (e.kind === 'race' && e.medal && e.medal !== 'none') game.stats.racesWon++; });
  on('cash', (n) => { if (n > 0 && game.mode === 'play') game.stats.earned += n; });
  on('missionFailed', (e) => { if (e.reason !== 'QUIT') game.stats.missionFails++; });
  on('missionPassed', () => { peak = 0; });
  on('explosion', (v) => { if (v && (v === player.vehicle || v.stolen)) game.stats.wrecked++; });
}

export function updateStats(dt) {
  const s = game.stats, v = player.vehicle;
  if (!v) return;
  s.distance += v.speed * dt;
  s.topSpeed = Math.max(s.topSpeed, Math.round(v.speed * 2.6));
}

// The STATS page rows: [label, value] grouped by section.
export function statSections() {
  const s = game.stats, sd = game.side || {};
  const km = (m) => `${(m / 1000).toFixed(1)} KM`;
  const best = Object.values(game.missionBest || {});
  const golds = best.filter((b) => b.medal === 'GOLD').length;
  const medals = Object.values(sd.raceMedal || {});
  const h = Math.floor(s.playSeconds / 3600), m = Math.floor(s.playSeconds / 60) % 60;
  return [
    ['ON THE ROAD', [['DISTANCE DRIVEN', km(s.distance)], ['ON FOOT', km(s.walked || 0)], ['TOP SPEED', `${s.topSpeed || 0} MPH`], ['CARS STOLEN', s.stolen], ['COP CARS STOLEN', s.copCars || 0], ['CARS WRECKED', s.wrecked || 0]]],
    ['COMBAT', [['TAKEDOWNS', s.kills], ['HEADSHOTS', s.headshots], ['SHOTS FIRED', s.shots], ['ACCURACY', s.shots ? `${Math.round((s.hits / s.shots) * 100)}%` : '-']]],
    ['HEAT', [['STARS EVADED', s.evaded || 0], ['MOST STARS', s.maxStars], ['TIMES CUFFED', s.cuffed], ['HOSPITAL VISITS', s.downed]]],
    ['CAREER', [['STORY', `${game.missionsDone.length}/9`], ['GOLD RATINGS', `${golds}/9`], ['MISSIONS FAILED', s.missionFails || 0], ['RACES WON', s.racesWon || 0],
      ['RACE GOLDS', `${medals.filter((q) => q === 'gold').length}/3`], ['TAXI FARES', sd.fares || 0], ['PARCELS', sd.parcels || 0], ['SEA GLASS', `${(sd.shells || []).length}/30`],
      ['CASH EARNED', `$${(s.earned || 0).toLocaleString('en-US')}`], ['PLAY TIME', `${h}h ${String(m).padStart(2, '0')}m`]]],
  ];
}
