// The game itself: starting position, phases, touchdown detection and results.
// Knows nothing about graphics or the keyboard, so tests can drive it directly.

import { DEG, eulerFrom, FT, KT, qAxis, qMul } from '../sim/math.js';
import { ATHENS_ARRIVAL, ATHENS_DEPARTURE, createRoute, LEGS, updateRoute } from './route.js';
import { windAt } from './conditions.js';
import { canStart, emergencyActive, startEmergency, updateEmergency } from './emergency.js';
import { createTricks, updateTricks } from './tricks.js';
import { nearLanding } from './autopilot.js';
import { burning, canIgnite, ignite, updateFire } from './fire.js';
import { applaud, createPassengers, jolt, touchdown, updatePassengers } from './passengers.js';
import { cabinLayout } from './cabinLayout.js';
import { createState, DT, solveTrim, step } from '../sim/flightModel.js';
import { createFbw, surfaces } from '../sim/flyByWire.js';
import { strikes, wheelHeight } from '../sim/gear.js';
import { CRASH_FPM, scoreLanding } from './scoring.js';
import { EASY_CRASH_FPM } from './assist.js';

export const RUNWAY = {
  name: '12',
  length: 3112, // m
  width: 45, // m
  headingTrue: 121, // degrees
  thresholdElevationFt: 112,
  aimPoint: 305, // m past the threshold, where the 3 degree path meets the ground
  glideDeg: 3,
};

export const AIRPORTS = {
  tlv: { id: 'tlv', name: 'Tel Aviv', headingTrue: 121, thresholdElevationFt: 112 },
  ath: { id: 'ath', name: 'Athens', headingTrue: 32, thresholdElevationFt: 271 },
};

const ARRIVAL_KT = 230;
const EMERGENCY_FIRST_LEG = 2;

export const START_DISTANCE = 10000; // m before the threshold

function createFullFlight(ac, base, toAthens) {
  // Lined up at the far end of the runway, facing the sea: this is runway 30.
  const s = createState(
    [RUNWAY.length - 45, ac.gearHeight - 0.28, 0],
    [0, 0, 0],
    qAxis([0, 1, 0], Math.PI),
    0,
  );
  s.flap = ac.flapDetents[1];
  return {
    ...base,
    mode: toAthens ? 'athens' : 'full',
    s,
    phase: 'takeoff',
    route: toAthens ? createRoute(ATHENS_DEPARTURE) : createRoute(),
    calloutsLeft: [],
    controls: {
      ...base.controls,
      flap: ac.flapDetents[1],
      throttle: 0,
      trim: ac.takeoffTrim, // holds the nose down against the engines until you rotate
    },
  };
}

/** Sets the airplane flying clean and level. heading is its attitude at zero pitch. */
function placeInFlight(g, pos, heading, speed, direction) {
  const { ac, s, controls: c } = g;
  const level = solveTrim(ac, speed, 0, 0, 0);
  const wind = g.conditions ? windAt(g.conditions, g.time, pos[1]) : [0, 0, 0];
  s.pos = pos;
  s.vel = [direction[0] * speed + wind[0], 0, direction[1] * speed + wind[2]];
  s.q = qMul(heading, qAxis([0, 0, 1], level.alpha));
  s.w = [0, 0, 0];
  s.flap = 0;
  s.gearDown = 0;
  s.spool = level.lever;
  s.rev = 0;
  s.spoilers = 0;
  c.flap = 0;
  c.gearDown = false;
  c.throttle = level.lever;
  c.trim = level.trim;
  c.elevator = 0;
  c.aileron = 0;
  c.rudder = 0;
  g.calloutsLeft = [];
  if (g.fbw) g.fbw.active = false;
  g.passengers.lastVel = null; // being placed is not a jolt
  g.phase = 'approach';
}

/** Mode 4: already in the air off the coast, on the way back to Ben Gurion. */
function createEmergencyFlight(ac, base) {
  const g = { ...base, mode: 'emergency', route: createRoute(LEGS, false) };
  g.route.leg = EMERGENCY_FIRST_LEG;
  placeInFlight(g, [-13000, 4000 * FT + ac.gearHeight, 0], qAxis([0, 1, 0], Math.PI), 210 * KT + (ac.approachSpeedKt - 145) * KT, [-1, 0]);
  return g;
}

/** Mode 5: in the air over the coast, no route. Fly tricks, then land on 12. */
function createAirShow(ac, base) {
  const g = { ...base, mode: 'airshow' };
  const speed = (ac.fighter ? 320 : 230) * KT;
  placeInFlight(g, [-9000, 3500 * FT + ac.gearHeight, 0], qAxis([0, 1, 0], Math.PI), speed, [-1, 0]);
  return g;
}

export function createGame(ac, opts = {}) {
  const V = (opts.speedKt ?? ac.approachSpeedKt) * KT;
  const gamma = -RUNWAY.glideDeg * DEG;
  const trim = solveTrim(ac, V, gamma);
  const pitch = trim.alpha + gamma;
  const distance = opts.distance ?? START_DISTANCE;
  const height = (distance + RUNWAY.aimPoint) * Math.tan(-gamma) + ac.gearHeight;

  const weather = opts.conditions ?? null;
  const wind = weather ? windAt(weather, 0, height) : [0, 0, 0];
  const s = createState(
    [-distance, height + (weather ? weather.offsetY : 0), (opts.offsetZ ?? 0) + (weather ? weather.offsetZ : 0)],
    [V * Math.cos(gamma) + wind[0], V * Math.sin(gamma), wind[2]],
    qAxis([0, 0, 1], pitch),
    trim.lever,
  );

  const game = {
    mode: 'landing',
    ac,
    s,
    trim,
    controls: {
      elevator: 0, aileron: 0, rudder: 0,
      trim: trim.trim, throttle: trim.lever,
      brake: 0, reverse: false, spoilers: false,
      flap: 1, gearDown: true,
    },
    airport: AIRPORTS.tlv,
    route: null,
    passengers: createPassengers(ac.passengers === false ? 0 : cabinLayout(ac).passengers),
    conditions: weather,
    emergency: opts.emergency ?? null,
    fire: opts.fire ?? null,
    tricks: createTricks(),
    easy: !!opts.easy,
    extinguishing: false, // set by the player while spraying
    fbw: ac.fbw ? createFbw() : null,
    retardNext: 0,
    phase: 'approach', // takeoff -> approach -> rollout -> finished
    time: 0,
    record: null, // filled at first touchdown
    airborneAgain: false,
    tailStruck: false,
    result: null,
    events: [],
    calloutsLeft: [...ac.callouts],
    wasStalling: 0,
    sinkWarned: 0,
  };
  if (opts.mode === 'emergency') return createEmergencyFlight(ac, game);
  if (opts.mode === 'airshow') return createAirShow(ac, game);
  return opts.mode === 'full' || opts.mode === 'athens' ? createFullFlight(ac, game, opts.mode === 'athens') : game;
}

function bankDeg(s) {
  return eulerFrom(s.q).bank / DEG;
}

function finish(g, failure, stopped = false) {
  if (g.phase === 'finished') return;
  g.phase = 'finished';
  const r = g.record ?? {};
  g.result = scoreLanding({ ...r, failure, stopped });
  g.result.record = r;
  if (g.passengers.count) g.result.parts.push({ name: `${g.passengers.count} passengers`, note: `comfort ${Math.round(g.passengers.comfort)}%` });
  if (g.tricks.list.length) g.result.parts.push({ name: `${g.tricks.list.length} tricks`, note: g.tricks.total.toLocaleString() });
  if (g.mode === 'airshow') {
    // The show is scored on tricks, plus a bonus for getting it back down safely.
    const landed = !failure && g.result.record && g.result.record.sinkFpm != null;
    g.result.showScore = landed ? g.tricks.total + g.result.score * 10 : 0; // crash and the tricks are lost
  }
  g.events.push({ type: 'finished', result: g.result });
}

function missed(g) {
  if (g.phase === 'finished') return;
  g.phase = 'finished';
  g.result = { score: 0, grade: '-', headline: 'Go-around', parts: [], failure: null, missed: true };
  g.events.push({ type: 'finished', result: g.result });
}

const anyMain = (c) => c.mainL || c.mainR;
const onRunway = (s) => s.pos[0] >= 0 && s.pos[0] <= RUNWAY.length
  && Math.abs(s.pos[2]) <= RUNWAY.width / 2;

function radioCallouts(g, feet) {
  const s = g.s;
  while (g.calloutsLeft.length && feet <= g.calloutsLeft[0]) {
    const value = g.calloutsLeft.shift();
    if (feet > value - 15 && s.vel[1] < 0) g.events.push({ type: 'callout', value });
  }
  if (g.ac.retardFt && g.phase === 'approach' && feet <= g.ac.retardFt && s.vel[1] < 0
    && g.controls.throttle > 0.02 && g.time >= g.retardNext) {
    g.events.push({ type: 'callout', value: 'retard' });
    g.retardNext = g.time + 1.2;
  }
  if (g.phase === 'approach' && feet < 1000 && feet > 30 && g.time > g.sinkWarned) {
    const fpm = -s.vel[1] / 0.00508;
    if (fpm > 1500) {
      g.events.push({ type: 'gpws', value: fpm > 2200 && feet < 600 ? 'pullup' : 'sinkrate' });
      g.sinkWarned = g.time + 2.5;
    }
  }
}

const nearAirport = (s) => s.pos[0] > -800 && s.pos[0] < RUNWAY.length + 800 && Math.abs(s.pos[2]) < 300;

function runEmergency(g) {
  const e = g.emergency;
  if (g.phase === 'approach' && canStart(e, g.time, wheelHeight(g.s, g.ac) / FT, nearLanding(g))) {
    startEmergency(e);
    g.events.push({ type: 'emergency' });
  }
  if (!emergencyActive(e)) return;
  g.passengers.scaredUntil = g.time + 1;
  const outcome = updateEmergency(e, DT);
  if (outcome === 'fight') g.events.push({ type: 'doorbreak' });
  if (outcome === 'won') {
    applaud(g, 6);
    g.events.push({ type: 'subdued', score: 90 });
  }
  if (outcome === 'settled') g.events.push({ type: 'settled' });
  if (outcome === 'lost') finish(g, 'hijacked');
}

function runFire(g) {
  const f = g.fire;
  const busy = emergencyActive(g.emergency);
  if (g.phase === 'approach' && canIgnite(f, g.time, wheelHeight(g.s, g.ac) / FT, nearLanding(g), busy)) {
    ignite(f);
    g.events.push({ type: 'fire' });
  }
  if (!burning(f)) return;
  g.passengers.scaredUntil = g.time + 1;
  g.passengers.comfort = Math.max(0, g.passengers.comfort - 0.4 * DT);
  const outcome = updateFire(f, DT, g.extinguishing);
  if (outcome === 'out') {
    applaud(g, 6);
    g.events.push({ type: 'fireout', score: 90 });
  }
  if (outcome === 'lost') finish(g, 'fire');
}

const crashLimit = (g) => (g.easy ? EASY_CRASH_FPM : CRASH_FPM);

function firstTouchdown(g) {
  const s = g.s;
  const sinkFpm = -s.vel[1] / 0.00508;
  g.record = {
    sinkFpm,
    // Distance past the threshold, whichever end of the runway you came in on.
    x: s.vel[0] >= 0 ? s.pos[0] : RUNWAY.length - s.pos[0],
    z: s.pos[2],
    bankDeg: bankDeg(s),
    bounces: 0,
    noseFirst: s.contact.nose && !anyMain(s.contact),
    alphaDeg: s.alpha / DEG,
  };
  g.phase = 'rollout';
  g.events.push({ type: 'touchdown', sinkFpm });
  touchdown(g, sinkFpm);

  if (sinkFpm >= crashLimit(g)) return finish(g, g.time - g.wasStalling < 3 ? 'stall' : 'crash');
  if (g.route && !nearAirport(s)) return finish(g, 'terrain');
  if (g.record.x < 0 || Math.abs(s.pos[2]) > RUNWAY.width / 2) return finish(g, g.record.x < 0 ? 'short' : 'offRunway');
}

function checkStrikes(g) {
  const hits = strikes(g.s, g.ac);
  if (!hits.length) return;
  if (hits.includes('tail')) {
    if (!g.tailStruck) { g.events.push({ type: 'tailstrike' }); jolt(g, 15); }
    g.tailStruck = true;
  }
  if (hits.some((h) => h !== 'tail')) {
    finish(g, g.s.gearDown < 0.95 ? 'gearUp' : 'wing');
  }
}

/**
 * End of the cruise: the airplane arrives over the Aegean, and the world becomes
 * Athens' frame, so runway 03R is at the origin and all the landing logic just works.
 */
export function beginArrival(g) {
  const { ac } = g;
  const V = ARRIVAL_KT * KT + (ac.approachSpeedKt - 145) * KT;
  // Heading west across the Aegean, along -z.
  placeInFlight(g, [-21000, 7000 * FT + ac.gearHeight, 34000], qAxis([0, 1, 0], Math.PI / 2), V, [0, -1]);
  g.airport = AIRPORTS.ath;
  g.route = createRoute(ATHENS_ARRIVAL, false);
  g.events.push({ type: 'arrival' });
}

/** Advance the game one fixed step. Controls are read from g.controls. */
export function tick(g) {
  if (g.phase === 'finished' || g.phase === 'cruise') return;
  const s = g.s;
  const c = g.controls;

  if (g.conditions) s.wind = windAt(g.conditions, g.time, s.pos[1]);
  if (g.phase === 'approach') updateTricks(g, DT);
  if (g.emergency) runEmergency(g);
  if (g.fire) runFire(g);
  if (g.phase === 'finished') return;
  updatePassengers(g, DT);

  // Spoilers rise on their own once the main wheels are down with thrust at idle.
  if (g.phase === 'rollout' && anyMain(s.contact) && c.throttle < 0.15) c.spoilers = true;
  if (c.throttle > 0.5) c.spoilers = false;

  step(s, g.ac, surfaces(g, DT), DT);
  g.time += DT;
  if (s.stall > 0) g.wasStalling = g.time;

  const wheels = wheelHeight(s, g.ac);
  radioCallouts(g, wheels / FT);

  const touching = anyMain(s.contact) || s.contact.nose;

  if (g.phase === 'takeoff') {
    checkStrikes(g);
    if (touching && !onRunway(s)) return finish(g, 'offRunway');
    if (!touching && wheels / FT > 35) {
      g.phase = 'approach';
      g.events.push({ type: 'airborne' });
    }
    return;
  }

  if (g.phase === 'approach') {
    if (g.route) {
      updateRoute(g);
      if (g.route.cruise) {
        g.phase = 'cruise';
        g.events.push({ type: 'cruise' });
        return;
      }
      if (wheels / FT > 1500 && !g.route.calloutsArmed) {
        g.route.calloutsArmed = true;
        g.calloutsLeft = [...g.ac.callouts];
      }
    }
    checkStrikes(g);
    if (g.phase === 'finished') return;
    if (touching) firstTouchdown(g);
    else if (g.mode !== 'airshow' && (g.route ? g.route.final && s.pos[0] > RUNWAY.length + 1500 : s.pos[0] > RUNWAY.length + 100)) missed(g);
    if (s.pos[1] < 2.5 && s.gearDown < 0.95) return finish(g, 'gearUp');
    if (s.pos[1] < 0.5) finish(g, 'terrain');
    return;
  }

  // Rollout
  checkStrikes(g);
  if (g.phase === 'finished') return;
  if (g.record && touching && !onRunway(s)) return finish(g, 'offRunway');

  if (!touching && wheels > 0.3) g.airborneAgain = true;
  if (touching && g.airborneAgain) {
    g.airborneAgain = false;
    g.record.bounces += 1;
    g.events.push({ type: 'bounce' });
    const fpm = -s.vel[1] / 0.00508;
    if (fpm >= crashLimit(g)) return finish(g, 'crash');
  }
  // Took off again and kept going: a touch and go, not a landing.
  if (!touching && wheels > 15) return missed(g);

  const rolling = Math.hypot(s.vel[0], s.vel[2]);
  if (rolling < 1 && touching) {
    applaud(g);
    finish(g, g.tailStruck ? 'tail' : null, true);
  }
}
