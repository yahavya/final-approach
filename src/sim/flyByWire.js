// Airbus-style normal law. In the air the stick doesn't move the elevators: it
// asks for a pitch or roll rate, and centered it holds the flight path and bank.
// The computers then keep the airplane inside its limits, whatever you ask for.

import { clamp, DEG, eulerFrom, FT } from './math.js';
import { flapValues } from './flightModel.js';
import { wheelHeight } from './gear.js';

const MAX_PITCH_RATE = 4; // degrees per second at full stick
const MAX_ROLL_RATE = 15;
const NEUTRAL_BANK = 33; // released beyond this, it rolls back to here
const MAX_BANK = 67;
const PITCH_UP = 30;
const PITCH_DOWN = -15;
const PROT_MARGIN = 3; // degrees below the stall, where protection starts
const MAX_MARGIN = 1; // degrees below the stall, which can't be exceeded
const FLOOR_MARGIN = 2; // degrees below the stall, where full thrust is forced
const FLOOR_MIN_FT = 100;
const FLARE_FT = 50;

export function createFbw() {
  return { active: false, pitchI: 0, gammaRef: 0, bankRef: 0, pitchRef: 0, flare: false, alphaProt: false, alphaFloor: false };
}

/** The controls that actually reach the surfaces this step. */
export function surfaces(g, dt) {
  const c = g.controls;
  const f = g.fbw;
  if (!f) return c;

  const s = g.s;
  const onGround = s.contact.mainL || s.contact.mainR || s.contact.nose;
  if (onGround || s.V < 40) {
    f.active = false;
    f.alphaProt = false;
    f.alphaFloor = false;
    return c; // ground mode: the stick is connected directly
  }

  const e = eulerFrom(s.q);
  const pitch = e.pitch / DEG;
  const bank = e.bank / DEG;
  const gamma = Math.asin(clamp(s.vel[1] / s.V, -1, 1)) / DEG;
  const alpha = s.alpha / DEG;
  const feet = wheelHeight(s, g.ac) / FT;

  if (!f.active) {
    f.active = true;
    f.pitchI = c.elevator + c.trim;
    f.gammaRef = gamma;
    f.bankRef = bank;
    f.pitchRef = pitch;
    f.flare = false;
  }

  // Pitch
  const stick = c.elevator;
  const neutral = Math.abs(stick) < 0.02;
  let demand;
  if (feet < FLARE_FT && s.vel[1] < 0 && !f.flare) {
    f.flare = true;
    f.pitchRef = pitch;
  }
  if (!neutral) {
    demand = stick * MAX_PITCH_RATE;
    f.gammaRef = gamma;
    f.pitchRef = pitch;
  } else if (f.flare) {
    // Flare law: hold the attitude, then ease the nose down so you must pull.
    if (feet < 30) f.pitchRef -= 0.25 * dt;
    demand = clamp(f.pitchRef - pitch, -1.5, 1.5);
  } else {
    const turn = Math.abs(Math.tan(clamp(bank, -60, 60) * DEG) * Math.sin(bank * DEG)) * ((9.81 / s.V) / DEG);
    demand = clamp((f.gammaRef - gamma) * 1.2, -3, 3) + turn;
  }

  const stall = flapValues(g.ac, s.flap).alphaStall;
  const prot = stall - PROT_MARGIN;
  const alphaMax = stall - MAX_MARGIN;
  const predicted = alpha + (s.w[2] / DEG) * 0.5;
  f.alphaProt = predicted > prot;
  if (f.alphaProt) {
    const limit = neutral ? prot : prot + (alphaMax - prot) * clamp(stick, 0, 1);
    demand = Math.min(demand, (limit - predicted) * 1.5);
  }
  f.alphaFloor = alpha > stall - FLOOR_MARGIN && feet > FLOOR_MIN_FT;

  demand = Math.min(demand, (PITCH_UP - pitch) * 1.2);
  demand = Math.max(demand, (PITCH_DOWN - pitch) * 1.2);

  const scale = Math.min(2, (75 / s.V) ** 2);
  const error = demand - s.w[2] / DEG;
  f.pitchI = clamp(f.pitchI + error * 0.16 * scale * dt, -1.3, 1.3);
  const elevator = clamp(f.pitchI + error * 0.3 * scale, -1.5, 1.5);

  // Roll
  const rollStick = c.aileron;
  let rollDemand;
  if (Math.abs(rollStick) >= 0.02) {
    rollDemand = rollStick * MAX_ROLL_RATE;
    f.bankRef = clamp(bank, -NEUTRAL_BANK, NEUTRAL_BANK);
    if (Math.abs(bank) > MAX_BANK && Math.sign(rollStick) === Math.sign(bank)) rollDemand = 0;
  } else {
    rollDemand = clamp((f.bankRef - bank) * 0.8, -7, 7);
  }
  const rollRate = s.w[0] / DEG;
  const aileron = clamp(rollDemand / 20 + (rollDemand - rollRate) * 0.1, -1, 1);

  return {
    ...c,
    elevator,
    trim: 0,
    aileron,
    rudder: clamp(c.rudder + s.beta * 3, -1, 1),
    throttle: f.alphaFloor ? 1 : c.throttle,
  };
}
