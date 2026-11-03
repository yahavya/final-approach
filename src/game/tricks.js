// Spots aerobatic maneuvers and scores them. Works for any airplane: a 747
// can earn a barrel roll too, if you're brave. Pure logic, so tests can fly them.

import { DEG, eulerFrom, FT, KT } from '../sim/math.js';
import { wheelHeight } from '../sim/gear.js';

const TRICKS = {
  roll: { name: 'Aileron roll', points: 300 },
  loop: { name: 'Loop', points: 800 },
  inverted: { name: 'Inverted flight', points: 500 },
  knife: { name: 'Knife edge', points: 400 },
  highG: { name: 'High-g turn', points: 400 },
  lowPass: { name: 'Low pass', points: 600 },
  vertical: { name: 'Vertical climb', points: 450 },
};

const COMBO_SECONDS = 8;

export function createTricks() {
  return {
    total: 0, list: [], combo: 1, lastAt: -99,
    roll: 0, rollStart: 0, pitch: 0, pitchStart: 0,
    invertedFor: 0, knifeFor: 0, highGFor: 0, verticalFor: 0,
    lowPassDone: false, felt: 1, lastVel: null,
  };
}

function award(t, key, time, events) {
  const trick = TRICKS[key];
  t.combo = time - t.lastAt < COMBO_SECONDS ? Math.min(4, t.combo + 1) : 1;
  t.lastAt = time;
  const points = trick.points * t.combo;
  t.total += points;
  t.list.push({ key, name: trick.name, points, combo: t.combo });
  events.push({ type: 'trick', name: trick.name, points, combo: t.combo });
}

/** Called every step while flying. */
export function updateTricks(g, dt) {
  const t = g.tricks;
  const s = g.s;
  const airborne = !(s.contact.mainL || s.contact.mainR || s.contact.nose);
  if (!airborne) {
    t.roll = 0;
    t.pitch = 0;
    t.lastVel = null;
    return;
  }
  const e = eulerFrom(s.q);
  const roll = e.roll / DEG;
  const feet = wheelHeight(s, g.ac) / FT;

  if (t.lastVel) {
    const a = [(s.vel[0] - t.lastVel[0]) / dt, (s.vel[1] - t.lastVel[1]) / dt + 9.81, (s.vel[2] - t.lastVel[2]) / dt];
    t.felt += (Math.hypot(...a) / 9.81 - t.felt) * Math.min(1, dt * 3);
  }
  t.lastVel = [...s.vel];

  // A full roll: 360° of rolling within a few seconds, the same way round.
  t.roll += (s.w[0] / DEG) * dt;
  if (g.time - t.rollStart > 6) { t.roll = 0; t.rollStart = g.time; }
  if (Math.abs(t.roll) >= 360) { award(t, 'roll', g.time, g.events); t.roll = 0; t.rollStart = g.time; }

  // A loop: the nose comes all the way round, within 20 seconds.
  t.pitch += (s.w[2] / DEG) * dt;
  if (g.time - t.pitchStart > 20) { t.pitch = 0; t.pitchStart = g.time; }
  if (t.pitch >= 340) { award(t, 'loop', g.time, g.events); t.pitch = 0; t.pitchStart = g.time; }

  // Held maneuvers
  const hold = (key, field, condition, seconds) => {
    t[field] = condition ? t[field] + dt : 0;
    if (t[field] >= seconds) { award(t, key, g.time, g.events); t[field] = -6; }
  };
  hold('inverted', 'invertedFor', Math.abs(roll) > 150 && Math.abs(e.pitch / DEG) < 30, 3);
  hold('knife', 'knifeFor', Math.abs(Math.abs(roll) - 90) < 15 && Math.abs(e.pitch / DEG) < 20, 2.5);
  hold('highG', 'highGFor', t.felt > 5, 2);
  hold('vertical', 'verticalFor', e.pitch / DEG > 75, 2);

  if (!t.lowPassDone && feet < 150 && feet > 15 && s.V / KT > 350
      && s.pos[0] > 0 && s.pos[0] < 3112 && Math.abs(s.pos[2]) < 100) {
    t.lowPassDone = true;
    award(t, 'lowPass', g.time, g.events);
  }
}

export { TRICKS };
