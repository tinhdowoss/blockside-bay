// First-play tutorial: TIP banners that teach one thing at the moment it matters (moving, the yellow
// job marker, the GPS line, stealing, driving, wanted stars, fighting, the map and side jobs). Each
// tip shows once per save (game.tipsSeen) and can be switched off in SETTINGS (game.tips === false).
import { game, on } from '../core/state.js';
import { ms } from '../gameplay/missions.js';

const K = (k) => `<span class="kc">${k}</span>`;
export const TIPS = {
  move: `${K('W A S D')} walk  ·  ${K('MOUSE')} look  ·  ${K('SHIFT')} sprint  ·  click the screen to lock the mouse`,
  marker: `Walk into the <b style="color:#ffd23f">YELLOW BEAM</b> to start a job  ·  the minimap GPS line shows the way`,
  gps: `Follow the <b style="color:#ff4fa3">PINK GPS LINE</b> on the minimap and the beam in the sky`,
  steal: `Walk up to any car and press ${K('F')} to take it  ·  pulling a driver out costs a star`,
  drive: `${K('W')} ${K('S')} gas / brake  ·  ${K('SPACE')} handbrake  ·  ${K('E')} radio  ·  ${K('F')} get out`,
  wanted: `<b style="color:#ffd23f">&#9733;</b> = police heat  ·  get out of their sight and the stars cool down`,
  fight: `${K('CLICK')} fire  ·  ${K('R')} reload  ·  ${K('1')}-${K('5')} weapons  ·  ${K('C')} crouch  ·  ${K('SPACE')} roll`,
  map: `${K('M')} city map  ·  side jobs pay too: races, taxi fares and parcel runs at the round pins (${K('G')})`,
};

let el, queue = [], cur = null, t = 0;

export function setupTips(hudRoot) {
  el = document.createElement('div');
  el.id = 'tipbanner';
  el.className = 'outl';
  hudRoot.appendChild(el);
  on('playStart', (fresh) => { queue = []; cur = null; el.classList.remove('show'); if (fresh) { tip('move'); tip('marker'); } });
  on('missionStart', () => tip('gps'));
  on('objective', () => { const st = ms.def?.stages[ms.stage]; if (st?.type === 'steal') tip('steal'); if (st?.type === 'eliminate') tip('fight'); });
  on('enterVehicle', () => tip('drive'));
  on('wanted', (n) => { if (n > 0) tip('wanted'); });
  on('missionPassed', () => tip('map'));
}

export function tip(id) {
  if (game.tips === false || game.shot) return;
  const seen = (game.tipsSeen ||= []);
  if (seen.includes(id) || queue.includes(id) || cur === id) return;
  queue.push(id);
}

export function updateTips(dt) {
  if (cur) {
    t -= dt;
    if (t <= 0) { el.classList.remove('show'); cur = null; t = -0.6; }
    return;
  }
  t += dt;
  if (t < 0 || !queue.length || game.mode !== 'play') return;
  cur = queue.shift();
  game.tipsSeen.push(cur);
  el.innerHTML = `<b class="tag">TIP</b><span>${TIPS[cur]}</span>`;
  el.classList.add('show');
  t = 6.5;
}

export const currentTip = () => cur;
