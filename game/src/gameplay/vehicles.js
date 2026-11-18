// Vehicles: arcade driving model with handbrake drift, building and car collisions, damage and sirens.
import { CAR_MODELS } from '../core/config.js';
import { makeCar } from '../world/models.js';
import { collideCircle } from '../world/city.js';
import { sparks, smoke, explosion, fx } from '../fx/effects.js';
import { emit } from '../core/state.js';
import { pick } from '../core/rng.js';

const THREE = window.THREE;
export const vehicles = [];
let scene;

export function setupVehicles(sc) { scene = sc; }

export class Vehicle {
  constructor(modelKey, x, z, heading, color) {
    this.model = modelKey;
    this.spec = CAR_MODELS[modelKey];
    this.color = color || pick(this.spec.colors);
    this.mesh = makeCar(modelKey, this.color);
    scene.add(this.mesh);
    this.x = x; this.z = z; this.heading = heading;
    this.vx = 0; this.vz = 0;
    this.yawRate = 0;
    this.controls = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.driver = null;          // 'player' | 'traffic' | 'police' | null
    this.health = 100;
    this.wrecked = false;
    this.police = !!this.spec.police;
    this.siren = false;
    this.stolen = false;
    this.drift = 0;
    this.roll = 0;
    this.pitch = 0;
    this.lastHit = 0;
    this.ai = null;
    vehicles.push(this);
    this.sync();
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get forwardSpeed() { return this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading); }
  get radius() { return this.spec.wid / 2 + 0.15; }

  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  update(dt, t) {
    const c = this.controls, s = this.spec;
    const fx_ = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx_; // left-hand side vector (local +x)
    let vf = this.vx * fx_ + this.vz * fz;
    let vs = this.vx * rx + this.vz * rz;
    if (this.wrecked) { c.throttle = 0; c.brake = 0; c.steer = 0; }

    // Engine and brakes
    const top = s.top * (this.health < 25 ? 0.6 : 1);
    if (c.throttle > 0) vf += s.accel * c.throttle * dt * (1 - Math.max(0, vf) / top);
    if (c.brake > 0) {
      if (vf > 0.5) vf -= 38 * c.brake * dt;
      else vf -= s.accel * 0.6 * c.brake * dt * (1 + vf / 12);
    }
    vf *= 1 - (c.throttle || c.brake ? 0.12 : 0.6) * dt;
    if (c.handbrake) vf *= 1 - 0.9 * dt;

    // Steering: stronger with handbrake, scaled by speed
    const speedK = Math.max(-1, Math.min(1, vf / 7));
    const hiSpeed = 1 - Math.min(0.45, Math.abs(vf) / 120);
    const targetYaw = -c.steer * 2.3 * speedK * hiSpeed * (c.handbrake ? 1.55 : 1);
    this.yawRate += (targetYaw - this.yawRate) * Math.min(1, dt * 8);
    this.heading += this.yawRate * dt;

    // Lateral grip: handbrake lets the rear slide out
    const grip = c.handbrake ? 1.1 : s.grip;
    vs *= Math.exp(-grip * dt);
    if (c.handbrake && Math.abs(vf) > 8) vs += this.yawRate * Math.abs(vf) * 0.09 * dt * 10;
    this.drift = Math.abs(vs);

    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    const nrx = -nfz, nrz = nfx;
    this.vx = nfx * vf + nrx * vs;
    this.vz = nfz * vf + nrz * vs;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    this.collideWorld(t);
    // Body roll / pitch for feel
    this.roll += ((vs * 0.03 + this.yawRate * Math.abs(vf) * 0.004) - this.roll) * Math.min(1, dt * 6);
    this.pitch += ((c.brake > 0 && vf > 2 ? 0.04 : c.throttle > 0 ? -0.025 : 0) - this.pitch) * Math.min(1, dt * 5);
    if (this.drift > 4 && this.speed > 10) smoke(this.x - nfx * 2, 0.3, this.z - nfz * 2, '#e8e8e8');
    if (this.health < 35 && !this.wrecked && Math.random() < 0.3) smoke(this.x + nfx * 1.8, 1.2, this.z + nfz * 1.8, '#555555');
    if (this.health <= 0 && !this.wrecked) this.wreck();
    this.sync(t);
  }

  collideWorld(t) {
    const fx_ = Math.sin(this.heading), fz = Math.cos(this.heading);
    const off = this.spec.len / 2 - this.radius * 0.9;
    for (const sgn of [1, -1]) {
      const cx = this.x + fx_ * off * sgn, cz = this.z + fz * off * sgn;
      const r = collideCircle(cx, cz, this.radius);
      if (!r.hit) continue;
      this.x += r.x - cx; this.z += r.z - cz;
      const vn = this.vx * r.nx + this.vz * r.nz;
      if (vn < 0) {
        this.vx -= r.nx * vn * 1.35; this.vz -= r.nz * vn * 1.35;
        this.vx *= 0.82; this.vz *= 0.82;
        const impact = -vn;
        if (impact > 6 && t - this.lastHit > 0.25) {
          this.lastHit = t;
          this.damage(impact * 0.9);
          sparks(cx - r.nx * this.radius, 0.8, cz - r.nz * this.radius, Math.min(30, impact * 1.5));
          if (this.driver === 'player') { fx.shake = Math.min(1, impact / 25); emit('crash', impact); }
        }
      }
    }
  }

  damage(n) { if (!this.wrecked) this.health -= n; }

  wreck() {
    this.wrecked = true;
    this.health = 0;
    explosion(this.x, 0.5, this.z);
    this.mesh.traverse((o) => { if (o.isMesh && o.material.vertexColors) { o.material = o.material.clone(); o.material.color.set('#3a3a3a'); } });
    emit('explosion', this);
  }

  sync(t = 0) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');
    if (this.police) {
      const [r, b] = this.mesh.userData.lights;
      const on = this.siren;
      const ph = Math.floor(t * 8) % 2;
      // Light bars run hot (above 1) so the bloom pass turns them into flares.
      r.material.color.set(on ? (ph ? '#ff2040' : '#b01030') : '#500010').multiplyScalar(on && ph ? 4 : 1.3);
      b.material.color.set(on ? (ph ? '#2050c0' : '#2a80ff') : '#102050').multiplyScalar(on && !ph ? 4 : 1.3);
      r.userData.glow.visible = b.userData.glow.visible = on;
      r.userData.glow.scale.setScalar(ph ? 4 : 2.2);
      b.userData.glow.scale.setScalar(ph ? 2.2 : 4);
    }
  }

  remove() {
    scene.remove(this.mesh);
    const i = vehicles.indexOf(this);
    if (i >= 0) vehicles.splice(i, 1);
  }
}

// Push overlapping cars apart and trade momentum; bumps against the player's car hurt.
export function collideVehicles(t) {
  for (let i = 0; i < vehicles.length; i++) {
    const a = vehicles[i];
    for (let j = i + 1; j < vehicles.length; j++) {
      const b = vehicles[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      const minD = (a.spec.len + b.spec.len) * 0.36;
      if (d2 > minD * minD || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, push = (minD - d) / 2;
      a.x -= nx * push; a.z -= nz * push;
      b.x += nx * push; b.z += nz * push;
      const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rel < 0) {
        const imp = -rel * 0.6;
        a.vx -= nx * imp; a.vz -= nz * imp;
        b.vx += nx * imp; b.vz += nz * imp;
        if (-rel > 5 && t - a.lastHit > 0.3) {
          a.lastHit = b.lastHit = t;
          a.damage(-rel * 0.6); b.damage(-rel * 0.6);
          sparks(a.x + nx * d / 2, 0.8, a.z + nz * d / 2, 12);
          emit('carHit', { a, b, impact: -rel });
          if (a.driver === 'player' || b.driver === 'player') fx.shake = Math.min(1, -rel / 20);
        }
      }
    }
  }
}

export function updateVehicles(dt, t) {
  for (const v of vehicles) v.update(dt, t);
  collideVehicles(t);
}

export function nearestVehicle(x, z, maxD, filter = () => true) {
  let best = null, bd = maxD;
  for (const v of vehicles) {
    if (!filter(v)) continue;
    const d = Math.hypot(v.x - x, v.z - z);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

export const _vec = new THREE.Vector3();
