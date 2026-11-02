// Weather and the imperfect start for each flight. Without this the airplane
// begins perfectly trimmed in still air and lands itself. The start offset is
// always on the side the wind pushes toward, so doing nothing can never drift
// back onto the runway: every landing has to be flown.

import { KT } from '../sim/math.js';

function seeded(seed) {
  let s = (Math.floor(seed) % 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function createConditions(seed) {
  const rnd = seeded(seed);
  rnd();
  const side = rnd() < 0.5 ? -1 : 1;
  const crossKt = 7 + rnd() * 9;
  const headKt = rnd() * 10;
  const gustKt = 3 + rnd() * 4;
  return {
    seed,
    wind: [-headKt * KT, 0, side * crossKt * KT], // the way the air is moving
    gust: gustKt * KT,
    phases: [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28],
    offsetZ: side * (60 + rnd() * 140),
    offsetY: (rnd() - 0.5) * 40,
  };
}

/** Wind at time t and height y. Gusts come from overlapping slow waves. */
export function windAt(c, t, y) {
  const [a, b, d] = c.phases;
  const gust = c.gust * (0.6 * Math.sin(t * 0.37 + a) + 0.3 * Math.sin(t * 0.91 + b) + 0.25 * Math.sin(t * 2.1 + d));
  const near = 0.7 + 0.3 * Math.min(1, y / 100); // slower close to the ground
  const speed = Math.hypot(c.wind[0], c.wind[2]) || 1;
  const k = near * (1 + gust / speed);
  return [c.wind[0] * k, 0, c.wind[2] * k];
}
