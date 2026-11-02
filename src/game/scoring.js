// Turns a touchdown record into a landing grade. Pure function, no game state.

import { clamp, lerp } from '../sim/math.js';

export const CRASH_FPM = 1000;

export const SINK_BANDS = [
  { max: 100, label: 'Butter' },
  { max: 240, label: 'Good' },
  { max: 360, label: 'Firm' },
  { max: CRASH_FPM, label: 'Hard' },
  { max: Infinity, label: 'Crash' },
];

/** Failures big enough to blow the airplane up. */
export const EXPLOSIVE = new Set(['crash', 'stall', 'terrain', 'wing', 'gearUp']);

export const sinkLabel = (fpm) => SINK_BANDS.find((b) => fpm < b.max).label;

const FAILURES = {
  crash: 'Hit the ground too hard',
  stall: 'Stalled onto the ground',
  short: 'Landed short of the runway',
  tail: 'Tail strike',
  wing: 'Wing or engine strike',
  offRunway: 'Left the runway',
  terrain: 'Flew into the ground',
  gearUp: 'Forgot the landing gear',
};

/** Linear score: full marks at or under `best`, zero at or beyond `worst`. */
const falloff = (v, best, worst) => clamp((worst - v) / (worst - best), 0, 1);

function sinkPoints(fpm) {
  if (fpm <= 100) return 50;
  if (fpm <= 240) return lerp(50, 42, (fpm - 100) / 140);
  if (fpm <= 360) return lerp(42, 30, (fpm - 240) / 120);
  if (fpm <= CRASH_FPM) return lerp(30, 4, (fpm - 360) / (CRASH_FPM - 360));
  return 0;
}

function zonePoints(x) {
  if (x < 0) return 0;
  if (x < 150) return lerp(10, 25, x / 150);
  if (x <= 600) return 25;
  return lerp(25, 0, clamp((x - 600) / 800, 0, 1));
}

/**
 * record: { sinkFpm, x, z, bankDeg, bounces, noseFirst, failure, stopped }
 * x is touchdown distance past the threshold, z the offset from the centerline.
 */
export function scoreLanding(r) {
  const parts = [];
  const fail = r.failure ? FAILURES[r.failure] : null;

  if (r.sinkFpm != null) {
    parts.push({ name: `Touchdown ${Math.round(r.sinkFpm)} fpm`, points: sinkPoints(r.sinkFpm), of: 50 });
    parts.push({ name: `${Math.round(r.x)} m past the threshold`, points: zonePoints(r.x), of: 25 });
    parts.push({ name: `${Math.abs(r.z).toFixed(1)} m off centerline`, points: 15 * falloff(Math.abs(r.z), 1.5, 15), of: 15 });
    parts.push({ name: `${Math.abs(r.bankDeg).toFixed(1)}° of bank`, points: 5 * falloff(Math.abs(r.bankDeg), 1, 6), of: 5 });
    parts.push({ name: r.stopped ? 'Stopped on the runway' : 'Did not stop', points: r.stopped ? 5 : 0, of: 5 });
  }

  let total = parts.reduce((sum, p) => sum + p.points, 0);
  if (r.bounces > 0) {
    const penalty = Math.min(15, r.bounces * 5);
    total -= penalty;
    parts.push({ name: r.bounces === 1 ? 'Bounced once' : `Bounced ${r.bounces} times`, points: -penalty, of: 0 });
  }
  if (r.noseFirst) {
    total -= 10;
    parts.push({ name: 'Nose wheel first', points: -10, of: 0 });
  }

  const score = fail ? 0 : Math.max(0, Math.round(total));
  const headline = fail ?? sinkLabel(r.sinkFpm);
  const grade = fail ? 'F'
    : score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'E';
  return { score, grade, headline, parts, failure: r.failure ?? null };
}
