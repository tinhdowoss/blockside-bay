// Dialogue box: pixel portrait, speaker name and typewriter text; lines queue up and auto-advance.
import { CAST, portraitURL } from '../data/cast.js';

const CHARS_PER_SECOND = 55;
const queue = [];
let current = null, el, shown = 0, hold = 0;

/** Builds the dialogue box markup (hidden until a line is said). */
export function setupDialogue() {
  el = document.getElementById('dialogue');
  el.innerHTML = '<img class="dlg-portrait" alt=""><div class="dlg-body"><div class="dlg-name"></div><div class="dlg-text"></div></div>';
  el.style.display = 'none';
}

/** Queues a line for a CAST member; it shows at once if nothing else is playing. */
export function say(who, text) {
  queue.push({ who, text });
  if (!current) next();
}

/** Drops the current line and everything queued. */
export function clearDialogue() {
  queue.length = 0;
  current = null;
  el.style.display = 'none';
}

// Shows the next queued line, or hides the box when the queue is empty.
function next() {
  current = queue.shift() || null;
  if (!current) { el.style.display = 'none'; return; }
  const speaker = CAST[current.who];
  el.style.display = 'flex';
  el.querySelector('.dlg-portrait').src = portraitURL(current.who);
  el.querySelector('.dlg-name').textContent = `${speaker.name}  ·  ${speaker.role.toUpperCase()}`;
  // Dez's dark shirt would vanish on the dark box, so his name uses his accent cyan.
  el.querySelector('.dlg-name').style.color = speaker.shirt === '#222a3a' ? '#3fd0ff' : speaker.shirt;
  shown = 0;
  hold = 2.2 + current.text.length * 0.035;
}

/** Types the current line out, then holds it for a reading-time pause before advancing. */
export function updateDialogue(dt) {
  if (!current) return;
  shown += dt * CHARS_PER_SECOND;
  el.querySelector('.dlg-text').textContent = current.text.slice(0, Math.floor(shown));
  if (shown >= current.text.length) {
    hold -= dt;
    if (hold <= 0) next();
  }
}

/** Shows a line fully typed and frozen (screenshot staging). */
export function showLine(who, text) {
  clearDialogue();
  say(who, text);
  shown = 1e9;
  hold = 1e9;
  el.querySelector('.dlg-text').textContent = text;
}
