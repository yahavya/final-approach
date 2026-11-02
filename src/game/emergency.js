// The cockpit break-in: someone forces the door and you have to fight them off
// by hammering X. Pure logic, so tests can play it.

import { lerp, smoothstep } from '../sim/math.js';

const WARNING_SECONDS = 3.2;
const TURN_SECONDS = 0.5;
const FIGHT_SECONDS = 12;
const START_METER = 40;
const GRACE_SECONDS = 1.5; // time to spin around and start hitting keys
const PER_PRESS = 6;
const DRAIN = 22; // per second: nearly 4 presses a second just holds your ground
const AFTERMATH_SECONDS = 3.5;
const MIN_FEET = 3000;

export function createHijack(at) {
  return { type: 'hijack', at, stage: 'waiting', time: 0, meter: START_METER, presses: 0, won: false };
}

export const emergencyActive = (e) => !!e && ['warning', 'fight', 'aftermath'].includes(e.stage);

export const canStart = (e, flightTime, feet, nearLanding) => e.stage === 'waiting' && flightTime >= e.at
  && feet > MIN_FEET && !nearLanding;

export function startEmergency(e) {
  e.stage = 'warning';
  e.time = 0;
}

/** A press of X. Only counts during the fight itself. */
export function mash(e) {
  if (e.stage !== 'fight') return;
  e.presses += 1;
  e.meter = Math.min(100, e.meter + PER_PRESS);
}

/** Advances the emergency. Returns 'fight', 'won', 'lost' or 'settled' on the step that happens. */
export function updateEmergency(e, dt) {
  if (!emergencyActive(e)) return null;
  e.time += dt;
  if (e.stage === 'warning') {
    if (e.time < WARNING_SECONDS) return null;
    e.stage = 'fight';
    e.time = 0;
    return 'fight';
  }
  if (e.stage === 'aftermath') {
    if (e.time < AFTERMATH_SECONDS) return null;
    e.stage = 'over';
    return 'settled';
  }
  if (e.meter >= 100) {
    e.stage = 'aftermath';
    e.time = 0;
    e.won = true;
    return 'won';
  }
  if (e.time > GRACE_SECONDS) e.meter -= DRAIN * dt;
  if (e.meter <= 0 || e.time >= FIGHT_SECONDS) {
    e.stage = 'over';
    return 'lost';
  }
  return null;
}

/** Seconds of fight left, for the screen. */
export const fightLeft = (e) => Math.max(0, FIGHT_SECONDS - e.time);

/** Camera pose in the body frame: you jump up behind the seats to face the door. */
export function fightPose(e, ac) {
  const turn = e.stage === 'aftermath' ? 1 : e.stage === 'fight' ? smoothstep(0, TURN_SECONDS, e.time) : 0;
  return {
    x: ac.eye[0] - turn * 0.95, // clear of the seats, or the seat back fills the view
    y: ac.eye[1] + turn * 0.2,
    z: lerp(ac.eye[2], 0, turn),
    yaw: turn * Math.PI,
    pitch: e.stage === 'aftermath' ? -0.62 * smoothstep(0.2, 1.1, e.time) : 0, // looking down at them
  };
}

/** How far through falling over the attacker is, from 0 to 1. */
export const fallProgress = (e) => smoothstep(0, 0.9, e.time);
