// Who's flying when you aren't. Also the rules for leaving the seat.

import { FT } from '../sim/math.js?v=e179301';
import { wheelHeight } from '../sim/gear.js?v=e179301';
import { flyBot } from './bot.js?v=e179301';
import { flyRoute } from './route.js?v=e179301';

import { emergencyActive } from './emergency.js?v=e179301';

const LEAVE_SEAT_FT = 1500;
const RETURN_FT = 1250;

const onGround = (g) => g.s.contact.mainL || g.s.contact.mainR || g.s.contact.nose;
const groundSpeed = (g) => Math.hypot(g.s.vel[0], g.s.vel[2]);

/** You can get up when parked, or high enough for the autopilot to have it. */
export function canLeaveSeat(g) {
  if (emergencyActive(g.emergency)) return false;
  if (!g.passengers.count) return false; // a fighter has no cabin to walk
  if (g.phase === 'finished') return true;
  if (onGround(g)) return groundSpeed(g) < 0.7;
  return g.phase === 'approach' && wheelHeight(g.s, g.ac) / FT > LEAVE_SEAT_FT && !nearLanding(g);
}

/** True on the leg that ends in a landing, not just the last leg of any route. */
export const nearLanding = (g) => (g.route ? g.route.final || !!g.route.legs[g.route.leg].path : false);

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
