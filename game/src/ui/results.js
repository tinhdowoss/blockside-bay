// Mission results card. After a pass: time against par, cash, rep, accuracy, headshots, stars evaded
// and a GOLD / SILVER / BRONZE rating. After a fail: the reason, the stage reached, the mission
// giver's line and ENTER to retry from the mission start. ENTER closes a passed card early; both
// cards close on their own. The mission's outro dialogue plays when the passed card closes.
import { game } from '../core/state.js';
import { CAST } from '../data/cast.js';
import { say } from './dialogue.js';

let el = null, card = null;

export function setupResults() {
  el = document.createElement('div');
  el.id = 'results';
  el.className = 'outl';
  document.getElementById('game-root').appendChild(el);
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const money = (n) => `${n < 0 ? '-' : '+'}$${Math.abs(n).toLocaleString('en-US')}`;
const MEDAL_COLOR = { GOLD: '#ffd23f', SILVER: '#d8e4ff', BRONZE: '#ff9a5c' };

// r: { def, time, cash, rep, shots, hits, headshots, evaded, medal, bonus, best, news: [lines] }
export function showPassed(r) {
  const acc = r.shots ? `${Math.round((r.hits / r.shots) * 100)}%  <small>${r.hits}/${r.shots}</small>` : '<small>NO SHOTS FIRED</small>';
  const rows = [
    ['TIME', `${mmss(r.time)}  <small>PAR ${mmss(r.def.par || 300)}${r.best ? '  ·  NEW BEST' : ''}</small>`],
    ['CASH', money(r.cash)],
    ['STREET REP', `+${r.rep} XP`],
    ['ACCURACY', acc],
    ['HEADSHOTS', String(r.headshots)],
    ['STARS EVADED', r.evaded ? '&#9733;'.repeat(Math.min(5, r.evaded)) + (r.evaded > 5 ? ` <small>x${r.evaded}</small>` : '') : '<small>CLEAN</small>'],
  ];
  if (r.bonus) rows.push(['PAR BONUS', money(r.bonus)]);
  open({
    kind: 'pass', t: 9, def: r.def, html: `
    <div class="r-top" style="color:#7cff6b">MISSION PASSED  ·  CHAPTER ${r.def.chapter}</div>
    <div class="r-title">${r.def.title}</div>
    <div class="r-rows">${rows.map(([k, v]) => `<div class="r-row"><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    <div class="r-medal" style="color:${MEDAL_COLOR[r.medal]}">${r.medal}</div>
    ${(r.news || []).map((n) => `<div class="r-news">${n}</div>`).join('')}
    <div class="r-keys">ENTER  CONTINUE</div>`,
  });
}

// r: { def, reason, stage, time }
export function showFailed(r, retry) {
  const [who, line] = r.def.failLine || ['mari', 'Again, Kai.'];
  open({
    kind: 'fail', t: 12, def: r.def, retry, html: `
    <div class="r-top" style="color:#ff4f6b">MISSION FAILED  ·  CHAPTER ${r.def.chapter}</div>
    <div class="r-title">${r.def.title}</div>
    <div class="r-reason">${r.reason}</div>
    <div class="r-rows">
      <div class="r-row"><span>REACHED</span><b>STAGE ${r.stage + 1}/${r.def.stages.length}</b></div>
      <div class="r-row"><span>TIME</span><b>${mmss(r.time)}</b></div>
    </div>
    <div class="r-line"><b style="color:${CAST[who].shirt}">${CAST[who].name.split(' ')[0]}</b>  ${line}</div>
    <div class="r-keys">ENTER  RETRY  ·  or walk back to the yellow marker</div>`,
  });
}

function open(c) {
  card = c;
  el.innerHTML = c.html;
  el.className = `outl show ${c.kind}`;
}

function close(retry) {
  const c = card;
  card = null;
  el.className = 'outl';
  if (!c) return;
  if (c.kind === 'pass') for (const [who, text] of c.def.outro || []) say(who, text);
  if (c.kind === 'fail' && retry && c.retry) c.retry(c.def);
}

export const resultsOpen = () => !!card;
export const resultsKind = () => card?.kind || null;

// ENTER on an open card: continue (pass) or retry (fail). Returns true if the key was used.
export function resultsKey(code) {
  if (!card || (code !== 'Enter' && code !== 'NumpadEnter')) return false;
  close(true);
  return true;
}

export function updateResults(dt) {
  if (!card) return;
  // Hidden under the FLATLINED / CUFFED screen; slides in once the player is back on their feet.
  el.style.display = game.mode === 'play' ? '' : 'none';
  if (game.mode !== 'play') return;
  card.t -= dt;
  if (card.t <= 0) close(false);
}

// A new mission or quitting to the title drops any card still on screen.
export function dismissResults() { card = null; if (el) el.className = 'outl'; }
