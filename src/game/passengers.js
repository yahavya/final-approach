// The people on board. Comfort falls with rough flying and sets their mood.
// Who sits where comes from the cabin layout, so it's the same on every flight.

import { clamp, DEG, length, sub } from '../sim/math.js';
import { GRAVITY } from '../sim/flightModel.js';

export function createPassengers(count) {
  return { count, comfort: 100, clapUntil: 0, scaredUntil: 0, lastVel: null, load: 1 };
}

export function mood(p, time) {
  if (time < p.clapUntil) return 'clapping';
  if (time < p.scaredUntil || p.comfort < 40) return 'scared';
  if (p.comfort < 70) return 'nervous';
  return 'calm';
}

/** Called every step. Passengers feel acceleration, so it's measured directly. */
export function updatePassengers(g, dt) {
  const p = g.passengers;
  const s = g.s;
  const airborne = !(s.contact.mainL || s.contact.mainR || s.contact.nose);
  if (p.lastVel && airborne) {
    const accel = sub(s.vel, p.lastVel).map((v) => v / dt);
    accel[1] += GRAVITY;
    const felt = length(accel) / GRAVITY;
    p.load += (felt - p.load) * clamp(dt * 2, 0, 1); // smoothed: bumps, not noise
    const rough = Math.max(0, Math.abs(p.load - 1) - 0.2);
    p.comfort -= rough * 16 * dt;
    if (rough === 0) p.comfort += 0.12 * dt; // people settle down in smooth air
  }
  p.lastVel = [...s.vel];

  if (airborne) {
    const bank = Math.abs(s.q ? bankOf(s) : 0);
    p.comfort -= Math.max(0, bank - 32) * 0.12 * dt;
    if (s.stall > 0) {
      p.comfort -= 6 * dt;
      p.scaredUntil = g.time + 3;
    }
  }
  p.comfort = clamp(p.comfort, 0, 100);
}

function bankOf(s) {
  const q = s.q;
  const y = -2 * (q[2] * q[3] - q[0] * q[1]) * -1;
  return Math.asin(clamp(y, -1, 1)) / DEG;
}

export function touchdown(g, sinkFpm) {
  const p = g.passengers;
  p.comfort = clamp(p.comfort - Math.max(0, sinkFpm - 240) / 14, 0, 100);
  if (sinkFpm > 500) p.scaredUntil = g.time + 6;
}

export function jolt(g, amount) {
  const p = g.passengers;
  p.comfort = clamp(p.comfort - amount, 0, 100);
  p.scaredUntil = g.time + 5;
}

export function applaud(g, seconds = 7) {
  g.passengers.clapUntil = g.time + seconds;
}
