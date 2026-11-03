// Easy mode: the airplane holds its wings, centerline and speed, so the player
// flies only the glide path and the flare. Touching the roll or thrust keys
// takes over; the help comes back a few seconds after you let go.

import { createBot } from './bot.js?v=e179301';
import { flyAuto } from './autopilot.js?v=e179301';
import { FT } from '../sim/math.js?v=e179301';
import { wheelHeight } from '../sim/gear.js?v=e179301';

export const EASY_CRASH_FPM = 1300;
const HAND_BACK_SECONDS = 3;
const THRUST_HANDOFF_FT = 50;

export function createAssist() {
  return { bot: createBot(), rollAt: -99, thrustAt: -99 };
}

/**
 * Runs after the player's inputs each step. touched says which controls the
 * player is using right now.
 */
export function applyAssist(a, g, touched) {
  if (g.phase === 'finished') return;
  // In the Air Show you're free until the gear comes down to land.
  if (g.mode === 'airshow' && !g.controls.gearDown) return;
  const c = g.controls;
  if (touched.roll) a.rollAt = g.time;
  if (touched.thrust) a.thrustAt = g.time;

  // What the autopilot would do, without touching the real controls.
  const shadow = { ...g, controls: { ...c } };
  flyAuto(a.bot, shadow);
  const want = shadow.controls;

  if (g.time - a.rollAt > HAND_BACK_SECONDS) {
    c.aileron = want.aileron;
    c.rudder = want.rudder;
  }
  // Below 50 ft the thrust is yours: closing it is part of landing.
  const low = g.phase === 'approach' && wheelHeight(g.s, g.ac) / FT < THRUST_HANDOFF_FT;
  if (!low && g.time - a.thrustAt > HAND_BACK_SECONDS) {
    c.throttle = want.throttle;
    c.reverse = want.reverse;
  }
  const onGround = g.s.contact.mainL || g.s.contact.mainR;
  if (onGround && g.phase === 'rollout') c.brake = Math.max(c.brake, want.brake); // autobrake
}
