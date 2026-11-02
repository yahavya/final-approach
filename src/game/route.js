// The Full Flight route: off runway 30, over Tel Aviv and out to sea, a turn
// back, then down the glide path to runway 12. Leg positions are in runway
// coordinates, so x = -11900 is the coastline on the extended centerline.

import { clamp, DEG, eulerFrom, FT, KT } from '../sim/math.js';
import { wheelHeight } from '../sim/gear.js';
import { RUNWAY } from './scenario.js';

export const LEGS = [
  { name: 'Climb out over the city', x: -5000, z: 0, altFt: 2500, kt: 175, flap: 0.45 },
  { name: 'Cross the coast', x: -13000, z: 0, altFt: 4000, kt: 210, flap: 0 },
  { name: 'Head out over the sea', x: -17000, z: 5000, altFt: 4000, kt: 210, flap: 0 },
  { name: 'Keep going', x: -21000, z: 5000, altFt: 4000, kt: 210, flap: 0 },
  { name: 'Turn back toward Israel', x: -23800, z: 2500, altFt: 4000, kt: 200, flap: 0 },
  { name: 'Line up with the runway', x: -21000, z: 0, altFt: 3600, kt: 190, flap: 0 },
  { name: 'Slow down, first flaps', x: -15000, z: 0, altFt: 2700, kt: 170, flap: 0.45 },
  { name: 'Gear down, flaps 30', x: -7000, z: 0, path: true, kt: 145, flap: 1, gear: true },
];

const CAPTURE = 1300; // metres
const MAX_BANK = 25; // degrees
const CLIMB_PITCH = 11; // degrees, right after takeoff
const ROTATE_MARGIN = 1; // degrees short of the rotation limit, near the ground

// To Athens: off runway 30, which points almost straight at it, and up to the
// point where the cruise takes over.
export const ATHENS_DEPARTURE = [
  LEGS[0],
  LEGS[1],
  { name: 'Set course for Athens', x: -30000, z: -1200, altFt: 8000, kt: 250, flap: 0, cruise: true },
];

// In Athens' own frame, coming in from the Aegean to the east.
export const ATHENS_ARRIVAL = [
  { name: 'Descend over the Aegean', x: -21000, z: 15000, altFt: 6000, kt: 220, flap: 0 },
  { name: 'Turn toward the runway', x: -23000, z: 3500, altFt: 4200, kt: 190, flap: 0 },
  { name: 'Slow down, first flaps', x: -15000, z: 0, altFt: 2700, kt: 170, flap: 0.45 },
  { name: 'Gear down, flaps 30', x: -7000, z: 0, path: true, kt: 145, flap: 1, gear: true },
];

export function createRoute(legs = LEGS, departing = true) {
  return { legs, leg: 0, departing, final: false, cruise: false, calloutsArmed: false };
}

/** Degrees to turn from the current ground track to reach a point; right is positive. */
export function turnTo(s, x, z) {
  const track = Math.atan2(s.vel[2], s.vel[0]);
  return (wrap(Math.atan2(z - s.pos[2], x - s.pos[0]) - track)) / DEG;
}

/** A plain instruction for that turn. */
export function turnText(degrees) {
  const amount = Math.round(Math.abs(degrees) / 5) * 5;
  if (amount < 5) return 'Straight ahead';
  return `Turn ${degrees > 0 ? 'right' : 'left'} ${amount}°`;
}

/** Leg speeds are written for a 145 kt approach and shift with the airplane. */
export const legSpeed = (leg, ac) => leg.kt + ac.approachSpeedKt - 145;

export const currentLeg = (g) => (g.route.final ? null : g.route.legs[g.route.leg]);

export function updateRoute(g) {
  const r = g.route;
  if (r.final) return;
  const leg = r.legs[r.leg];
  const dist = Math.hypot(leg.x - g.s.pos[0], leg.z - g.s.pos[2]);
  // A big airplane turns wider, so it has to start the next leg sooner.
  const turnRadius = (g.s.V * g.s.V) / (9.81 * Math.tan(MAX_BANK * DEG));
  if (dist < Math.max(CAPTURE, turnRadius * 0.9)) {
    r.leg += 1;
    if (r.leg >= r.legs.length) {
      r.leg = r.legs.length - 1;
      if (leg.cruise) r.cruise = true;
      else r.final = true;
    }
    g.events.push({ type: 'leg' });
  }
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function pathAltFt(x) {
  return ((RUNWAY.aimPoint - x) * Math.tan(RUNWAY.glideDeg * DEG)) / FT;
}

/**
 * What a good pilot would be doing right now, for everything before the final
 * approach. Returns target pitch and bank in degrees, plus thrust lever, gear,
 * flaps and rudder. The bot flies it directly; the coach turns it into keys.
 */
export function guidance(g) {
  const s = g.s;
  const ac = g.ac;
  const kt = s.V / KT;
  const feet = wheelHeight(s, ac) / FT;
  const onGround = s.contact.mainL || s.contact.mainR;

  if (g.phase === 'takeoff') {
    // Heading error is measured against the reversed runway direction.
    const headingError = wrap(Math.PI - Math.atan2(qNoseZ(s), qNoseX(s)));
    const rudder = clamp((headingError + s.w[1] * 1.1) * 6 + s.pos[2] * 0.03, -1, 1);
    if (onGround && kt < ac.rotateKt) {
      return { stage: `Full thrust, rotate at ${ac.rotateKt} kt`, throttle: 1, rudder, roll: true, gear: true, flap: ac.flapDetents[1] };
    }
    // Rotate gently until the wheels are clear, or the tail hits the runway.
    return {
      stage: 'Rotate: ease the nose up',
      pitch: feet < 12 ? ac.rotatePitch - ROTATE_MARGIN : CLIMB_PITCH,
      bank: 0,
      throttle: 1,
      rudder,
      gear: true,
      flap: ac.flapDetents[1],
    };
  }

  const leg = g.route.legs[g.route.leg];
  const climbing = s.vel[1] > 1.5 && feet > 40;
  const dx = leg.x - s.pos[0];
  const dz = leg.z - s.pos[2];
  const track = Math.atan2(s.vel[2], s.vel[0]);
  const trackError = wrap(Math.atan2(dz, dx) - track);
  const bank = clamp((trackError * 2.5) / DEG, -MAX_BANK, MAX_BANK);

  const altFt = (s.pos[1] - ac.gearHeight) / FT;
  const targetAlt = leg.path ? pathAltFt(s.pos[0]) : leg.altFt;
  const gammaBase = leg.path ? -RUNWAY.glideDeg : 0;
  const gammaWant = gammaBase + clamp((targetAlt - altFt) / 90, -4, 7);
  const pitch = s.alpha / DEG + gammaWant;

  const speedError = legSpeed(leg, ac) - kt;
  const throttle = clamp(0.3 + speedError * 0.03 + (gammaWant > 2 ? 0.35 : 0) - (gammaWant < -1 ? 0.15 : 0), 0, 1);

  return {
    stage: leg.name,
    pitch: g.route.departing && g.route.leg === 0 && feet < 800 ? Math.max(Math.min(pitch, CLIMB_PITCH), 7) : clamp(pitch, -6, 12),
    bank,
    throttle,
    rudder: clamp(s.beta * 3, -1, 1),
    gear: leg.gear ? true : g.route.departing && !(climbing || g.route.leg > 0),
    flap: leg.flap,
    targetAlt,
    targetKt: legSpeed(leg, ac),
  };
}

const qNoseX = (s) => 1 - 2 * (s.q[2] * s.q[2] + s.q[3] * s.q[3]);
const qNoseZ = (s) => 2 * (s.q[1] * s.q[3] - s.q[0] * s.q[2]);

/** Flies the route directly. Used to prove the whole flight is possible. */
export function flyRoute(bot, g) {
  const c = g.controls;
  const s = g.s;
  const want = guidance(g);
  c.throttle = want.throttle;
  c.flap = want.flap;
  c.gearDown = want.gear;
  c.rudder = want.rudder;

  if (want.roll) {
    c.elevator = 0;
    c.aileron = 0;
    return;
  }
  const e = eulerFrom(s.q);
  const pitchError = want.pitch - e.pitch / DEG;
  bot.pitchI = clamp(bot.pitchI + pitchError * DEG * 3 * (1 / 120), -0.6, 0.6);
  c.elevator = clamp(pitchError * DEG * 8 - s.w[2] * 4 + bot.pitchI, -1, 1);
  c.aileron = clamp((want.bank - e.bank / DEG) * DEG * 2 - s.w[0] * 1.5, -1, 1);
}
