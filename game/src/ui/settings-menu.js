// SETTINGS page (title screen and pause menu): grouped rows with a slider bar or ON/OFF value. Mouse:
// click - / + (or the row). Keyboard: up/down picks a row, left/right changes it. Every change applies
// immediately (core/settings.js) and ticks with a pitch that follows the new value.
import { SETTINGS, changeSetting, resetSettings } from '../core/settings.js';
import { uiTick, uiHover } from '../audio/radio.js';

let sel = 0;

// A freshly opened settings page starts on the first row.
export function resetSettingsCursor() { sel = 0; }

export function settingsHTML() {
  let group = '';
  const rows = SETTINGS.map((s, i) => {
    const head = s.group !== group ? `<div class="sgroup">${(group = s.group)}</div>` : '';
    const v = Math.max(0, Math.min(1, s.value()));
    const bar = s.kind === 'slider' ? `<span class="sbar"><i style="width:${v * 100}%"></i></span>` : `<span class="spill ${v > 0.5 || s.kind === 'choice' ? 'on' : ''}">${s.text()}</span>`;
    return `${head}<div class="row ${i === sel ? 'sel' : ''}" data-row="${i}"><span class="lbl">${s.label}</span>
      <span class="btn step" data-set="${s.id}" data-d="-1">&#9664;</span>${bar}<b>${s.kind === 'slider' ? s.text() : ''}</b><span class="btn step" data-set="${s.id}" data-d="1">&#9654;</span></div>`;
  }).join('');
  return `<div class="settings"><h3>SETTINGS</h3>${rows}
    <div class="row sfoot"><span class="btn reset" data-reset="1">RESET TO DEFAULTS</span><span class="hint"><span class="kc">&#8593;&#8595;</span> pick  <span class="kc">&#8592;&#8594;</span> change</span></div></div>`;
}

// Re-render the settings block in place after a change.
function refresh(holder) {
  holder.innerHTML = settingsHTML();
  bindSettings(holder);
}

export function bindSettings(root) {
  const block = root.querySelector('.settings');
  if (!block) return;
  const holder = block.parentElement;
  block.querySelectorAll('[data-set]').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      sel = SETTINGS.findIndex((s) => s.id === b.dataset.set);
      step(+b.dataset.d);
      refresh(holder);
    };
  });
  block.querySelectorAll('[data-row]').forEach((r) => {
    r.onmouseenter = () => { if (sel !== +r.dataset.row) { sel = +r.dataset.row; uiHover(); block.querySelectorAll('[data-row]').forEach((q) => q.classList.toggle('sel', q === r)); } };
  });
  const reset = block.querySelector('[data-reset]');
  if (reset) reset.onclick = () => { resetSettings(); uiTick(0.5); refresh(holder); };
}

function step(d) {
  const s = SETTINGS[sel];
  changeSetting(s.id, d);
  uiTick(s.value());
}

// Arrow keys on an open settings page. Returns true when the key was used.
export function settingsKey(code, root) {
  const block = root.querySelector('.settings');
  if (!block) return false;
  if (code === 'ArrowDown') sel = (sel + 1) % SETTINGS.length;
  else if (code === 'ArrowUp') sel = (sel + SETTINGS.length - 1) % SETTINGS.length;
  else if (code === 'ArrowLeft' || code === 'ArrowRight') step(code === 'ArrowLeft' ? -1 : 1);
  else return false;
  if (code === 'ArrowDown' || code === 'ArrowUp') uiHover();
  refresh(block.parentElement);
  return true;
}
