// Dialogue box: pixel portrait, speaker name and typewriter text; lines queue up and auto-advance.
import { CAST, portraitURL } from '../data/cast.js';

const queue = [];
let current = null, el, shown = 0, hold = 0;

export function setupDialogue() {
  el = document.getElementById('dialogue');
  el.innerHTML = '<img class="dlg-portrait" alt=""><div class="dlg-body"><div class="dlg-name"></div><div class="dlg-text"></div></div>';
  el.style.display = 'none';
}

export function say(who, text) {
  queue.push({ who, text });
  if (!current) next();
}

export function clearDialogue() {
  queue.length = 0;
  current = null;
  el.style.display = 'none';
}

function next() {
  current = queue.shift() || null;
  if (!current) { el.style.display = 'none'; return; }
  const c = CAST[current.who];
  el.style.display = 'flex';
  el.querySelector('.dlg-portrait').src = portraitURL(current.who);
  el.querySelector('.dlg-name').textContent = `${c.name}  ·  ${c.role.toUpperCase()}`;
  el.querySelector('.dlg-name').style.color = c.shirt === '#222a3a' ? '#3fd0ff' : c.shirt;
  shown = 0;
  hold = 2.2 + current.text.length * 0.035;
}

export function updateDialogue(dt) {
  if (!current) return;
  shown += dt * 55;
  el.querySelector('.dlg-text').textContent = current.text.slice(0, Math.floor(shown));
  if (shown >= current.text.length) {
    hold -= dt;
    if (hold <= 0) next();
  }
}

// Show a line fully typed and frozen (screenshot staging).
export function showLine(who, text) {
  clearDialogue();
  say(who, text);
  shown = 1e9;
  hold = 1e9;
  el.querySelector('.dlg-text').textContent = text;
}
