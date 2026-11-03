// A scripted pilot. It proves the approach can be flown and lets the failure
// cases be tested, and `?bot=1` lets you watch it land.

import { clamp, DEG, eulerFrom, FT, KT } from '../sim/math.js?v=e179301';
import { wheelHeight } from '../sim/gear.js?v=e179301';
import { RUNWAY } from './scenario.js?v=e179301';

/** Target pitch in degrees for this wheel height: approach attitude up to flare attitude. */
export function flareSchedule(g, wheels) {
  const approach = g.trim.alpha / DEG - RUNWAY.glideDeg;
  const flare = g.ac.flarePitch - 0.4;
  return flare - (flare - approach) * clamp(wheels / 10, 0, 1);
}

export function createBot(opts = {}) {
  return {
    flareFt: opts.flareFt ?? null,
    noFlare: opts.noFlare ?? false,
    idleAboveFt: opts.idleAboveFt ?? 18,
    aimZ: opts.aimZ ?? 0,
    aimDeg: opts.aimDeg ?? RUNWAY.glideDeg,
    aimPoint: opts.aimPoint ?? RUNWAY.aimPoint,
    overRotate: opts.overRotate ?? false,
    noBrakes: opts.noBrakes ?? false,
    speedI: 0,
    pitchI: 0,
    flaring: false,
  };
}

/** Write control inputs for this step into g.controls. */
export function flyBot(bot, g) {
  const s = g.s;
  const c = g.controls;
  const e = eulerFrom(s.q);
  const wheels = wheelHeight(s, g.ac);
  const feet = wheels / FT;
  const onGround = s.contact.mainL || s.contact.mainR;

  const pitchRate = s.w[2];
  const bank = e.bank;

  if (g.phase === 'rollout' && onGround) {
    c.throttle = 0;
    c.elevator = s.contact.nose ? 0 : clamp(0.1 + (e.pitch - 2 * DEG) * -2, -0.5, 0.2);
    c.trim = 0;
    const grip = Math.min(1, 14 / Math.max(s.V, 1));
    c.rudder = clamp((bot.aimZ - s.pos[2]) * 0.05 - e.heading * 4, -1, 1) * grip;
    c.aileron = clamp(-bank * 2, -1, 1);
    c.brake = bot.noBrakes ? 0 : (s.contact.nose ? 0.7 : 0);
    c.reverse = !bot.noBrakes && s.V > 30 * KT;
    return;
  }

  // Lateral: fly to the centerline by commanding a bank angle.
  const lateralError = bot.aimZ - s.pos[2];
  const track = Math.atan2(s.vel[2], s.vel[0]);
  const wantTrack = clamp(lateralError * 0.0015, -15 * DEG, 15 * DEG);
  const wantBank = clamp((wantTrack - track) * 2.5, -15 * DEG, 15 * DEG);
  c.aileron = clamp((wantBank - bank) * 2 - s.w[0] * 1.5, -1, 1);
  c.rudder = clamp(s.beta * 3, -1, 1);

  // Vertical: hold the glide path, or flare near the ground.
  if (feet < (bot.flareFt ?? g.ac.flareFt) && !bot.noFlare) bot.flaring = true;
  let wantPitch;
  if (bot.flaring) {
    // Raise the nose as the ground approaches, trimming it by the sink rate.
    const targetSink = clamp(wheels * 0.28, 0.5, 3.9);
    const sinkError = -s.vel[1] - targetSink;
    const schedule = flareSchedule(g, wheels);
    wantPitch = (schedule + clamp(sinkError * 0.8, -1.5, 2)) * DEG;
    if (bot.overRotate) wantPitch = 13 * DEG;
  } else {
    const distance = bot.aimPoint - s.pos[0];
    const pathHeight = distance * Math.tan(bot.aimDeg * DEG);
    const pathError = pathHeight - wheels;
    const wantClimb = clamp(pathError * 0.2 / 74, -3 * DEG, 3 * DEG);
    const gamma = Math.asin(clamp(s.vel[1] / Math.max(s.V, 1), -1, 1));
    const wantGamma = -bot.aimDeg * DEG + wantClimb;
    wantPitch = g.trim.alpha + wantGamma + (wantGamma - gamma) * 1.5;
  }
  const pitchError = wantPitch - e.pitch;
  bot.pitchI = clamp(bot.pitchI + pitchError * 3 * (1 / 120), -0.6, 0.6);
  c.elevator = clamp(pitchError * 8 - pitchRate * 4 + bot.pitchI, -1, 1);

  // Speed
  if (feet < bot.idleAboveFt && (!bot.noFlare || bot.overRotate)) {
    c.throttle = 0;
  } else {
    const speedError = g.ac.approachSpeedKt * KT - s.V;
    bot.speedI = clamp(bot.speedI + speedError * 0.002, -0.2, 0.2);
    c.throttle = clamp(g.trim.lever + speedError * 0.04 + bot.speedI, 0, 1);
  }
}
