// Who's flying when you aren't. Also the rules for leaving the seat.

import { FT } from '../sim/math.js';
import { wheelHeight } from '../sim/gear.js';
import { flyBot } from './bot.js';
import { flyRoute } from './route.js';

const LEAVE_SEAT_FT = 1500;
const RETURN_FT = 1250;

const onGround = (g) => g.s.contact.mainL || g.s.contact.mainR || g.s.contact.nose;
const groundSpeed = (g) => Math.hypot(g.s.vel[0], g.s.vel[2]);

/** You can get up when parked, or high enough for the autopilot to have it. */
export function canLeaveSeat(g) {
  if (g.phase === 'finished') return true;
  if (onGround(g)) return groundSpeed(g) < 0.7;
  return g.phase === 'approach' && wheelHeight(g.s, g.ac) / FT > LEAVE_SEAT_FT && !nearLanding(g);
}

const nearLanding = (g) => (g.route ? g.route.final || g.route.leg >= g.route.legs.length - 1 : false);

/** The autopilot won't land for you: it calls you back to the cockpit first. */
export function mustReturn(g) {
  if (g.phase !== 'approach') return false;
  return wheelHeight(g.s, g.ac) / FT < RETURN_FT || nearLanding(g);
}

/** One step of the autopilot, in any phase of flight. */
export function flyAuto(bot, g) {
  if (g.route && !g.route.final && g.phase !== 'rollout') return flyRoute(bot, g);
  return flyBot(bot, g);
}

/** Back in the seat: the stick is centered, so its last position goes into trim. */
export function handBack(g) {
  const c = g.controls;
  c.trim += c.elevator;
  c.elevator = 0;
  c.aileron = 0;
  c.rudder = 0;
  c.brake = 0;
}
