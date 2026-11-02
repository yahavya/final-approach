// In-flight emergencies. So far, one: someone forces the cockpit door and you
// have to fight them off by hammering X. Pure logic, so tests can play it.

import { lerp, smoothstep } from '../sim/math.js';

const WARNING_SECONDS = 3.2;
const TURN_SECONDS = 0.5;
const FIGHT_SECONDS = 12;
const START_METER = 45;
const PER_PRESS = 7.5;
const DRAIN = 24; // per second: about 3 presses a second just holds your ground
const MIN_FEET = 3000;
const CHANCE = 0.65;

/** Decides whether this flight has an emergency, and when. */
export function planEmergency(random = Math.random) {
  if (random() > CHANCE) return null;
  return createHijack(90 + random() * 200);
}

export function createHijack(at) {
  return { type: 'hijack', at, stage: 'waiting', time: 0, meter: START_METER, presses: 0, won: false };
}

export const emergencyActive = (e) => !!e && (e.stage === 'warning' || e.stage === 'fight');

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

/** Advances the emergency. Returns 'fight', 'won' or 'lost' on the step that happens. */
export function updateEmergency(e, dt) {
  if (!emergencyActive(e)) return null;
  e.time += dt;
  if (e.stage === 'warning') {
    if (e.time < WARNING_SECONDS) return null;
    e.stage = 'fight';
    e.time = 0;
    return 'fight';
  }
  if (e.meter >= 100) {
    e.stage = 'over';
    e.won = true;
    return 'won';
  }
  e.meter -= DRAIN * dt;
  if (e.meter <= 0 || e.time >= FIGHT_SECONDS) {
    e.stage = 'over';
    return 'lost';
  }
  return null;
}

/** Seconds of fight left, for the screen. */
export const fightLeft = (e) => Math.max(0, FIGHT_SECONDS - e.time);

/** Camera pose in the body frame: you twist around in your seat to face the door. */
export function fightPose(e, ac) {
  const turn = e.stage === 'fight' ? smoothstep(0, TURN_SECONDS, e.time) : 0;
  return {
    x: ac.eye[0] - turn * 0.35,
    y: ac.eye[1] + turn * 0.2,
    z: lerp(ac.eye[2], 0, turn),
    yaw: turn * Math.PI,
  };
}
