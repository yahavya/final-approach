// A cabin fire. You leave the seat, run to the row and hold E to put it out
// before it spreads. Pure logic, like the hijacking.

const BURN_SECONDS = 75; // until it's out of control
const SPRAY_SECONDS = 3; // of holding E to put it out
const REACH = 2.4; // metres
const MIN_FEET = 2000;

export function createFire(at, row) {
  return { at, row, stage: 'waiting', time: 0, sprayed: 0, spraying: false };
}

export const burning = (f) => !!f && f.stage === 'burning';

export const canIgnite = (f, flightTime, feet, nearLanding, busy) => f.stage === 'waiting' && flightTime >= f.at
  && feet > MIN_FEET && !nearLanding && !busy;

export function ignite(f) {
  f.stage = 'burning';
  f.time = 0;
}

/** Seconds until it's out of control. */
export const fireLeft = (f) => Math.max(0, BURN_SECONDS - f.time);

/** 0 when fully ablaze, 1 when it's out. */
export const fireOut = (f) => Math.min(1, f.sprayed / SPRAY_SECONDS);

/** Whether someone standing at position x along the airplane can reach it. */
export const fireInReach = (f, x, fireX) => burning(f) && Math.abs(x - fireX) < REACH;

/** One step of burning. spraying is true while E is held in reach. Returns 'out' or 'lost'. */
export function updateFire(f, dt, spraying) {
  if (!burning(f)) return null;
  f.time += dt;
  f.spraying = spraying;
  if (spraying) f.sprayed += dt;
  if (fireOut(f) >= 1) {
    f.stage = 'out';
    return 'out';
  }
  if (f.time >= BURN_SECONDS) {
    f.stage = 'lost';
    return 'lost';
  }
  return null;
}
