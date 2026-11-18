// Where the player is: district and street above the minimap, and a NOW ENTERING card that slides in
// whenever the player crosses into another district (and once when play starts).
import { districtAt } from '../world/city.js';
import { streetAt } from '../world/streets.js';
import { player } from '../gameplay/player.js';

let label, card, lastKey = '', lastDistrict = null, cardT = 0;

export function setupLocation(hudRoot) {
  label = document.getElementById('district');
  card = document.createElement('div');
  card.id = 'loccard';
  card.className = 'outl';
  hudRoot.appendChild(card);
}

// New game / load / respawn: the next frame announces the district the player is standing in.
export function resetLocation() { lastDistrict = null; }

export function updateLocation(dt) {
  const d = districtAt(player.x, player.z), s = streetAt(player.x, player.z);
  const key = d.name + s;
  if (key !== lastKey) {
    lastKey = key;
    label.innerHTML = `<b style="color:${d.color}">${d.name}</b><small>${s}</small>`;
  }
  if (d.id !== lastDistrict) {
    card.innerHTML = `<small>${lastDistrict ? 'NOW ENTERING' : 'YOU ARE IN'}</small><b style="color:${d.color}">${d.name}</b><em>${s}</em>`;
    card.style.borderLeftColor = d.color;
    card.classList.add('show');
    lastDistrict = d.id;
    cardT = 3.2;
  }
  if (cardT > 0) { cardT -= dt; if (cardT <= 0) card.classList.remove('show'); }
}

export const currentPlace = () => ({ district: districtAt(player.x, player.z).name, street: streetAt(player.x, player.z) });
