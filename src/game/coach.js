// Real-time instructions for the easier mode. The landing bot works out what it
// would do right now, and the coach turns the difference into keys to press.
// Thresholds have two levels so an instruction doesn't flicker on and off.

import { clamp, DEG, eulerFrom, FT, KT } from '../sim/math.js';
import { wheelHeight } from '../sim/gear.js';
import { createBot, flareSchedule, flyBot } from './bot.js';
import { guidance } from './route.js';
import { RUNWAY } from './scenario.js';

const LOOK_EVERY = 0.1; // seconds between fresh instructions
const MIN_HOLD = 0.2; // seconds an instruction stays up, unless it's the flare
const FLARE_FT = 32;
const FLARE_EARLY = 10; // feet: the coach calls it early, because people react late
const LOOK_AHEAD = 0.8; // seconds, in the flare
const ROLL_LOOK_AHEAD = 0.9; // seconds
const APPROACH_LOOK_AHEAD = 1.6; // seconds, when there's more time to be smooth

const ACTIONS = {
  pull: { key: '↓', code: 'ArrowDown', text: 'Pull back' },
  push: { key: '↑', code: 'ArrowUp', text: 'Push forward' },
  right: { key: '→', code: 'ArrowRight', text: 'Roll right' },
  left: { key: '←', code: 'ArrowLeft', text: 'Roll left' },
  more: { key: 'R', code: 'KeyR', text: 'More thrust' },
  less: { key: 'F', code: 'KeyF', text: 'Less thrust' },
  idle: { key: 'F', code: 'KeyF', text: 'Thrust to idle' },
  brake: { key: 'Space', code: 'Space', text: 'Hold the brakes' },
  reverseOn: { key: 'T', code: 'KeyT', text: 'Reverse thrust on' },
  reverseOff: { key: 'T', code: 'KeyT', text: 'Reverse thrust off' },
  steerRight: { key: 'E', code: 'KeyE', text: 'Steer right' },
  steerLeft: { key: 'Q', code: 'KeyQ', text: 'Steer left' },
  fullThrust: { key: 'R', code: 'KeyR', text: 'Hold for full thrust' },
  gearUp: { key: 'G', code: 'KeyG', text: 'Gear up' },
  gearDown: { key: 'G', code: 'KeyG', text: 'Gear down' },
  flapsUp: { key: 'Z', code: 'KeyZ', text: 'Flaps up' },
  flapsDown: { key: 'X', code: 'KeyX', text: 'Flaps down' },
};

export function createCoach() {
  const bot = createBot(); // retuned per airplane on first use
  const axes = {
    pitch: { state: 0, since: -9 },
    roll: { state: 0, since: -9 },
    thrust: { state: 0, since: -9 },
    steer: { state: 0, since: -9 },
  };
  let nextLook = 0;
  let advice = null;

  /** Updates one axis to -1, 0 or +1, with separate on and off thresholds. */
  function axis(name, value, on, off, time, urgent = false) {
    const a = axes[name];
    let next = 0;
    if (value > on || (a.state > 0 && value > off)) next = 1;
    else if (value < -on || (a.state < 0 && value < -off)) next = -1;
    if (next !== a.state && (urgent || time - a.since >= MIN_HOLD)) {
      a.state = next;
      a.since = time;
    }
    return a.state;
  }

  function flightStage(g, feet) {
    const s = g.s;
    if (feet <= g.ac.flareFt + FLARE_EARLY) return 'Flare: ease the nose up';
    if (feet <= 70) return 'Get ready to flare at 30 ft';

    const distance = RUNWAY.aimPoint - s.pos[0];
    const angle = Math.atan2(s.pos[1] - g.ac.gearHeight, Math.max(distance, 1)) / DEG;
    const notes = [];
    if (angle > RUNWAY.glideDeg + 0.3) notes.push('Above the glide path');
    else if (angle < RUNWAY.glideDeg - 0.3) notes.push('Below the glide path');
    if (s.pos[2] > 12) notes.push('right of centerline');
    else if (s.pos[2] < -12) notes.push('left of centerline');
    const kt = s.V / KT;
    if (kt < g.ac.approachSpeedKt - 6) notes.push('slow');
    else if (kt > g.ac.approachSpeedKt + 6) notes.push('fast');
    if (!notes.length) return 'On the path';
    const joined = notes.join(', ');
    return joined[0].toUpperCase() + joined.slice(1);
  }

  /**
   * A held key keeps moving the stick and people react late, so the flare looks
   * ahead: release while the nose is still rising, not once it has arrived.
   */
  function flarePitch(g) {
    const s = g.s;
    const wheels = wheelHeight(s, g.ac);
    const targetSink = clamp(wheels * 0.28, 0.5, 3.9);
    const sinkError = -s.vel[1] - targetSink;
    const target = flareSchedule(g, wheels) + clamp(sinkError * 0.8, -1.5, 2);
    const pitch = eulerFrom(s.q).pitch / DEG;
    const predicted = pitch + (s.w[2] / DEG) * LOOK_AHEAD;
    if (predicted < target - 0.2) return 1;
    if (predicted > target + 2.5) return -1;
    return 0;
  }

  /**
   * Degrees between where the nose should be and where it's heading. Looking
   * ahead stops the classic pilot-induced oscillation: without it, instructions
   * lag the airplane and each correction overshoots the last.
   */
  function approachPitchError(g) {
    const s = g.s;
    const distance = RUNWAY.aimPoint - s.pos[0];
    const pathHeight = distance * Math.tan(RUNWAY.glideDeg * DEG);
    const pathError = pathHeight - wheelHeight(s, g.ac);
    const correction = clamp((pathError * 0.2) / 74, -3 * DEG, 3 * DEG);
    const gamma = Math.asin(clamp(s.vel[1] / Math.max(s.V, 1), -1, 1));
    const wantGamma = -RUNWAY.glideDeg * DEG + correction;
    const target = (g.trim.alpha + wantGamma + clamp((wantGamma - gamma) * 0.7, -2 * DEG, 2 * DEG)) / DEG;
    const pitch = eulerFrom(s.q).pitch / DEG;
    return target - (pitch + (s.w[2] / DEG) * APPROACH_LOOK_AHEAD);
  }

  /** Degrees of bank to add, looking ahead. Wings level close to the ground. */
  function rollError(g, feet) {
    const s = g.s;
    const track = Math.atan2(s.vel[2], s.vel[0]);
    const wantTrack = clamp(-s.pos[2] * 0.0015, -15 * DEG, 15 * DEG);
    const limit = feet < 100 ? 3 : 15;
    const wantBank = clamp(((wantTrack - track) * 2.5) / DEG, -limit, limit);
    const bank = eulerFrom(s.q).bank / DEG;
    return wantBank - (bank + (s.w[0] / DEG) * ROLL_LOOK_AHEAD);
  }

  /** In Easy mode the airplane handles roll and thrust, so leave those out. */
  const easyFilter = (g, advice) => {
    if (!g.easy || !advice) return advice;
    // Closing the thrust in the flare stays with the player.
    const keep = advice.actions.filter((a) => a === ACTIONS.idle
      || !['ArrowLeft', 'ArrowRight', 'KeyR', 'KeyF', 'KeyQ', 'KeyE', 'KeyT', 'Space'].includes(a.code));
    return { ...advice, actions: keep };
  };

  function inFlight(g, want, feet) {
    const s = g.s;
    const urgent = feet <= g.ac.flareFt + FLARE_EARLY;
    const actions = [];

    if (!g.ac.fbw && s.alpha > (g.ac.alphaStall - 2) * DEG && feet > 40) {
      return { stage: 'Too slow, about to stall', actions: [ACTIONS.push, ACTIONS.more], tone: 'urgent' };
    }

    const pitch = urgent
      ? flarePitch(g)
      : axis('pitch', approachPitchError(g), 0.6, 0.15, g.time);
    if (pitch > 0) actions.push(ACTIONS.pull);
    if (pitch < 0) actions.push(ACTIONS.push);

    const roll = axis('roll', rollError(g, feet), 2, 0.6, g.time);
    if (roll > 0) actions.push(ACTIONS.right);
    if (roll < 0) actions.push(ACTIONS.left);

    if (want.throttle === 0 && g.controls.throttle > 0) {
      actions.push(ACTIONS.idle);
    } else {
      const thrust = axis('thrust', want.throttle - g.controls.throttle, 0.05, 0.02, g.time);
      if (thrust > 0) actions.push(ACTIONS.more);
      if (thrust < 0) actions.push(ACTIONS.less);
    }

    let stage = flightStage(g, feet);
    if (stage === 'On the path' && actions.length) stage = 'Small correction';
    const tone = urgent ? 'flare' : actions.length ? 'fix' : 'ok';
    return { stage: actions.length || feet <= 70 ? stage : `${stage}: hold steady`, actions, tone };
  }

  /** Instructions for everything before the final approach in Full Flight. */
  function onRoute(g) {
    const s = g.s;
    const c = g.controls;
    const want = guidance(g);
    const actions = [];

    if (want.roll) {
      if (c.throttle < 0.98) actions.push(ACTIONS.fullThrust);
    } else {
      const pitch = eulerFrom(s.q);
      const error = want.pitch - (pitch.pitch / DEG + (s.w[2] / DEG) * APPROACH_LOOK_AHEAD);
      const p = axis('pitch', error, 0.7, 0.2, g.time);
      if (p > 0) actions.push(ACTIONS.pull);
      if (p < 0) actions.push(ACTIONS.push);

      const bankError = want.bank - (pitch.bank / DEG + (s.w[0] / DEG) * ROLL_LOOK_AHEAD);
      const r = axis('roll', bankError, 2.5, 0.8, g.time);
      if (r > 0) actions.push(ACTIONS.right);
      if (r < 0) actions.push(ACTIONS.left);

      const thrust = axis('thrust', want.throttle - c.throttle, 0.08, 0.03, g.time);
      if (thrust > 0) actions.push(ACTIONS.more);
      if (thrust < 0) actions.push(ACTIONS.less);
    }

    if (want.rudder != null && (s.contact.mainL || s.contact.nose)) {
      const steer = axis('steer', want.rudder, 0.1, 0.03, g.time);
      if (steer > 0) actions.push(ACTIONS.steerRight);
      if (steer < 0) actions.push(ACTIONS.steerLeft);
    }

    if (want.gear !== c.gearDown) actions.push(want.gear ? ACTIONS.gearDown : ACTIONS.gearUp);
    if (want.flap > c.flap + 0.01) actions.push(ACTIONS.flapsDown);
    if (want.flap < c.flap - 0.01) actions.push(ACTIONS.flapsUp);

    return { stage: want.stage, actions, tone: actions.length ? 'fix' : 'ok' };
  }

  function onGround(g, want) {
    const c = g.controls;
    const actions = [];
    if (c.throttle > 0.01 && !c.reverse) actions.push(ACTIONS.idle);
    if (want.reverse && !c.reverse) actions.push(ACTIONS.reverseOn);
    if (!want.reverse && c.reverse) actions.push(ACTIONS.reverseOff);
    if (want.brake > 0) actions.push(ACTIONS.brake);
    // Judged before the speed limit on steering, or the advice comes too late.
    const heading = eulerFrom(g.s.q).heading;
    const steerWant = clamp(-g.s.pos[2] * 0.05 - heading * 4, -1, 1);
    const steer = axis('steer', steerWant, 0.12, 0.04, g.time);
    if (steer > 0) actions.push(ACTIONS.steerRight);
    if (steer < 0) actions.push(ACTIONS.steerLeft);
    return { stage: 'Slow down and stay on the centerline', actions, tone: 'fix' };
  }

  return {
    /** Returns { stage, actions, tone }, or null once the flight is over. */
    advise(g) {
      return easyFilter(g, adviseAll(g));
    },
  };

  function adviseAll(g) {
    {
      if (g.phase === 'finished') return null;
      if (g.time < nextLook && advice) return advice;
      nextLook = g.time + LOOK_EVERY;

      if (g.mode === 'airshow' && g.phase === 'approach' && !(g.s.pos[0] > -12000 && g.s.pos[0] < 0 && Math.abs(g.s.pos[2]) < 1500 && g.s.vel[0] > 0)) {
        advice = { stage: 'Air show: fly tricks, then line up with runway 12 to land', actions: [], tone: 'ok' };
        return advice;
      }

      if (g.route && !g.route.final && g.phase !== 'rollout') {
        advice = onRoute(g);
        return advice;
      }

      bot.flareFt = g.ac.flareFt;
      const shadow = { ...g, controls: { ...g.controls } };
      flyBot(bot, shadow);
      const want = shadow.controls;
      const feet = wheelHeight(g.s, g.ac) / FT;
      const down = g.s.contact.mainL || g.s.contact.mainR;

      advice = g.phase === 'rollout' && down ? onGround(g, want) : inFlight(g, want, feet);
      return advice;
    }
  }
}
