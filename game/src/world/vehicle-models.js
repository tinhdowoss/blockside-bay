// Vehicle meshes by body style. The six classic cars (sports coupes, sedan, cab, van, BBPD) come from
// models.js makeCar(); this adds the BRUISER V8 muscle car, the ZIPPA scooter and the BAY SKIFF
// speedboat. Every mesh faces +z and carries userData { lights, model, body }.
import { CAR_MODELS } from '../core/config.js';
import { makeCar, part } from './models.js';
import { shade } from '../data/cast.js';

const THREE = window.THREE;

export function buildVehicleMesh(key, color) {
  const m = CAR_MODELS[key];
  const body = color || m.colors[0];
  if (m.muscle) return wrap(muscle(m, body), key);
  if (m.bike) return wrap(scooter(m, body), key);
  if (m.boat) return wrap(skiff(m, body), key);
  return makeCar(key, color);
}

function wrap([boxes, glow], key) {
  const g = new THREE.Group();
  g.add(part(boxes, glow));
  g.userData = { lights: [], model: key };
  return g;
}

function wheels(boxes, W, z0, z1, size = 0.76, wide = 0.32) {
  for (const sx of [-1, 1]) for (const z of [z0, z1]) {
    boxes.push([sx * (W / 2 - 0.12), size / 2, z, wide, size, size, '#1a1a1a']);
    boxes.push([sx * (W / 2 - 0.02), size / 2, z, 0.14, size * 0.45, size * 0.45, '#c8c8c8']);
  }
}

// BRUISER V8: long hood with a blower poking through, short fastback cab, twin stripes, fat rear tyres.
function muscle(m, body) {
  const L = m.len, W = m.wid, y = 0.42, dark = shade(body, -0.35), glass = '#1d3f66', stripe = body === '#1a1a1a' ? '#ff7a1a' : '#ffffff';
  const boxes = [], glow = [];
  boxes.push([0, y + 0.33, 0, W, 0.6, L, body]);
  boxes.push([0, y + 0.66, 0.65, W - 0.1, 0.06, L * 0.45, shade(body, 0.08)]);
  boxes.push([0, y + 0.95, -0.55, W - 0.26, 0.5, L * 0.36, body]);
  boxes.push([0, y + 0.95, -0.55 + L * 0.18 + 0.01, W - 0.36, 0.38, 0.04, glass]);
  boxes.push([0, y + 0.9, -0.55 - L * 0.18 - 0.01, W - 0.4, 0.3, 0.04, glass]);
  boxes.push([W / 2 - 0.12, y + 0.95, -0.55, 0.04, 0.36, L * 0.3, glass], [-W / 2 + 0.12, y + 0.95, -0.55, 0.04, 0.36, L * 0.3, glass]);
  // Blower, stripes, ducktail spoiler, side pipes
  boxes.push([0, y + 0.8, 1.0, 0.6, 0.28, 0.7, '#c8c8c8'], [0, y + 0.98, 1.05, 0.66, 0.1, 0.3, '#2a2a2a']);
  boxes.push([0.22, y + 0.645, 0.2, 0.16, 0.02, L - 0.2, stripe], [-0.22, y + 0.645, 0.2, 0.16, 0.02, L - 0.2, stripe]);
  boxes.push([0, y + 0.72, -L / 2 + 0.2, W - 0.2, 0.1, 0.36, dark]);
  boxes.push([W / 2 + 0.04, y + 0.06, -0.1, 0.12, 0.12, L * 0.5, '#d0d0d0'], [-W / 2 - 0.04, y + 0.06, -0.1, 0.12, 0.12, L * 0.5, '#d0d0d0']);
  boxes.push([0, y + 0.1, L / 2 + 0.05, W, 0.2, 0.12, '#d0d0d0'], [0, y + 0.1, -L / 2 - 0.05, W, 0.2, 0.12, '#d0d0d0']);
  boxes.push([0, y + 0.42, L / 2 + 0.02, W - 0.6, 0.18, 0.04, '#202020']);   // grille
  glow.push([W / 2 - 0.28, y + 0.42, L / 2 + 0.02, 0.3, 0.2, 0.06, '#fff6c8'], [-W / 2 + 0.28, y + 0.42, L / 2 + 0.02, 0.3, 0.2, 0.06, '#fff6c8']);
  glow.push([0, y + 0.45, -L / 2 - 0.02, W - 0.3, 0.1, 0.05, '#ff2040']);
  wheels(boxes, W, L / 2 - 0.85, -(L / 2 - 0.9));
  boxes.push([W / 2 - 0.1, 0.42, -(L / 2 - 0.9), 0.4, 0.84, 0.84, '#141414'], [-W / 2 + 0.1, 0.42, -(L / 2 - 0.9), 0.4, 0.84, 0.84, '#141414']);
  return [boxes, glow];
}

// ZIPPA scooter: step-through deck, leg shield, seat, handlebar and two small wheels on the centre line.
function scooter(m, body) {
  const L = m.len, boxes = [], glow = [];
  boxes.push([0, 0.42, -0.05, 0.42, 0.14, L * 0.62, '#2a2a2a']);
  boxes.push([0, 0.62, -0.42, 0.5, 0.36, 0.8, body]);
  boxes.push([0, 0.86, -0.38, 0.4, 0.12, 0.62, '#1a1a1a']);
  boxes.push([0, 0.8, 0.52, 0.5, 0.7, 0.16, body]);
  boxes.push([0, 1.22, 0.58, 0.12, 0.3, 0.12, '#3a3a3a'], [0, 1.36, 0.58, 0.72, 0.07, 0.07, '#3a3a3a']);
  boxes.push([0, 0.54, L / 2 - 0.2, 0.36, 0.18, 0.3, body]);
  glow.push([0, 1.12, 0.62, 0.22, 0.14, 0.05, '#fff6c8'], [0, 0.7, -0.83, 0.26, 0.08, 0.04, '#ff2040']);
  for (const z of [L / 2 - 0.3, -L / 2 + 0.3]) {
    boxes.push([0, 0.26, z, 0.16, 0.52, 0.52, '#1a1a1a'], [0, 0.26, z, 0.18, 0.2, 0.2, '#c8c8c8']);
  }
  return [boxes, glow];
}

// BAY SKIFF: a tapered white hull with a coloured sheer stripe, cockpit, windscreen and outboard motor.
function skiff(m, body) {
  const L = m.len, W = m.wid, boxes = [], glow = [];
  boxes.push([0, 0.15, -0.4, W, 0.7, L - 1.2, '#f4f4f4']);
  boxes.push([0, 0.2, L / 2 - 1.0, W * 0.72, 0.6, 1.0, '#f4f4f4']);
  boxes.push([0, 0.28, L / 2 - 0.3, W * 0.38, 0.44, 0.6, '#f4f4f4']);
  boxes.push([0, 0.42, -0.4, W + 0.04, 0.12, L - 1.2, body], [0, 0.44, L / 2 - 1.0, W * 0.72 + 0.04, 0.1, 1.0, body]);
  boxes.push([0, -0.18, -0.2, W - 0.3, 0.12, L - 1.0, shade(body, -0.3)]);
  boxes.push([0, 0.52, -0.6, W - 0.3, 0.06, 2.0, '#c8a070']);                     // teak deck
  boxes.push([0, 0.78, 0.5, 0.9, 0.5, 0.5, '#e8e8e8'], [0, 1.12, 0.62, 0.86, 0.3, 0.04, '#9fd8ff']);
  boxes.push([0, 0.72, -1.2, W - 0.5, 0.35, 0.7, '#2a2a2a']);                      // bench seat
  boxes.push([0, 0.62, -L / 2 + 0.25, 0.42, 0.85, 0.42, '#1a1a1a'], [0, 1.1, -L / 2 + 0.3, 0.5, 0.3, 0.55, body]);
  glow.push([W / 2 - 0.1, 0.62, L / 2 - 1.3, 0.05, 0.1, 0.18, '#3fff6b'], [-W / 2 + 0.1, 0.62, L / 2 - 1.3, 0.05, 0.1, 0.18, '#ff2040']);
  return [boxes, glow];
}
