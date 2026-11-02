// Flight-model and game checks. Runs both in the browser (sim-tests.html) and
// from the terminal with macOS's built-in JavaScript engine (./tests/run.sh).

import { b737 } from '../src/sim/aircraft/b737.js';
import { DT, GRAVITY, solveTrim, stallSpeed, step } from '../src/sim/flightModel.js';
import { DEG, eulerFrom, FPM, KT, qAxis } from '../src/sim/math.js';
import { beginArrival, createGame, RUNWAY, tick } from '../src/game/scenario.js';
import { createBot, flyBot } from '../src/game/bot.js';
import { EXPLOSIVE, scoreLanding, sinkLabel } from '../src/game/scoring.js';
import { createInput } from '../src/ui/input.js';
import { createCoach } from '../src/game/coach.js';
import { flyRoute, turnText, turnTo } from '../src/game/route.js';
import { createHijack, emergencyActive, mash, planEmergency } from '../src/game/emergency.js';
import { chatterLine, chatterTopic, nearestPassenger, seatName, topics } from '../src/game/chatter.js';
import { canLeaveSeat, flyAuto, handBack, mustReturn } from '../src/game/autopilot.js';
import { createWalker, rowOf, stepWalker, walkerPose } from '../src/game/walk.js';
import { cabinLayout } from '../src/game/cabinLayout.js';
import { mood } from '../src/game/passengers.js';
import { createConditions } from '../src/game/conditions.js';
import { crowdShape, renderApplause } from '../src/ui/applause.js';
import { a320 } from '../src/sim/aircraft/a320.js';
import { b747 } from '../src/sim/aircraft/b747.js';

/**
 * A pilot with a keyboard: looks at what the bot would do, but can only hold a
 * key or not, and only changes its mind every `reactionMs`. Runs through the
 * same input code the game uses, at 60 frames per second.
 */
function keyboardPilot(reactionMs, stickThreshold) {
  const handlers = {};
  const target = { addEventListener: (type, fn) => { handlers[type] = fn; } };
  const input = createInput(target);
  const keys = new Set();
  const preventDefault = () => {};
  const setKey = (code, on) => {
    if (on === keys.has(code)) return;
    if (on) keys.add(code); else keys.delete(code);
    handlers[on ? 'keydown' : 'keyup']({ code, preventDefault });
  };

  const g = createGame(b737);
  const bot = createBot();
  const shadow = { ...g, controls: { ...g.controls } };
  let sinceLook = 0;
  const frame = 1 / 60;
  const ticksPerFrame = 2;
  const end = 240 / frame;

  for (let f = 0; f < end && g.phase !== 'finished'; f++) {
    sinceLook += frame * 1000;
    if (sinceLook >= reactionMs) {
      sinceLook = 0;
      shadow.controls = { ...g.controls };
      shadow.s = g.s;
      shadow.phase = g.phase;
      flyBot(bot, shadow);
      const w = shadow.controls;
      setKey('ArrowDown', w.elevator > stickThreshold);
      setKey('ArrowUp', w.elevator < -stickThreshold);
      setKey('ArrowRight', w.aileron > 0.15);
      setKey('ArrowLeft', w.aileron < -0.15);
      setKey('KeyR', w.throttle > g.controls.throttle + 0.04);
      setKey('KeyF', w.throttle < g.controls.throttle - 0.04);
      setKey('Space', w.brake > 0);
      g.controls.reverse = w.reverse;
    }
    input.apply(g, frame);
    for (let i = 0; i < ticksPerFrame; i++) tick(g);
  }
  return g;
}

function runSteps(g, seconds, each) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n && g.phase !== 'finished'; i++) {
    if (each) each(g, i);
    tick(g);
  }
}

const land = (botOpts = {}, gameOpts = {}, seconds = 240, ac = b737) => {
  const g = createGame(ac, gameOpts);
  const bot = createBot(botOpts);
  runSteps(g, seconds, () => flyBot(bot, g));
  return g;
};

/**
 * A pilot who knows nothing except the coach's instructions: it presses exactly
 * the keys shown on screen, checking them every `reactionMs`.
 */
export function coachedPilot(reactionMs, gameOpts = {}, onFrame = null, ac = b737) {
  const handlers = {};
  const input = createInput({ addEventListener: (type, fn) => { handlers[type] = fn; } });
  const keys = new Set();
  const preventDefault = () => {};
  const g = createGame(ac, gameOpts);
  const coach = createCoach();
  const frame = 1 / 60;
  let sinceLook = reactionMs;
  let seen = 0;

  const limit = (gameOpts.mode ? 1500 : 240) / frame;
  for (let f = 0; f < limit && g.phase !== 'finished'; f++) {
    if (g.phase === 'cruise') beginArrival(g);
    sinceLook += frame * 1000;
    if (sinceLook >= reactionMs) {
      sinceLook = 0;
      const advice = coach.advise(g);
      const wanted = new Set(advice ? advice.actions.map((a) => a.code) : []);
      seen += wanted.size;
      for (const code of ['KeyG', 'KeyZ', 'KeyX']) {
        // Tapped once and let go: leaving the key listed must not press it twice.
        if (wanted.has(code) && !keys.has(code)) {
          handlers.keydown({ code, preventDefault });
          handlers.keyup({ code, preventDefault });
        }
        wanted.delete(code);
      }
      if (wanted.has('KeyT')) {
        g.controls.reverse = !g.controls.reverse;
        wanted.delete('KeyT');
      }
      for (const code of [...keys]) {
        if (!wanted.has(code)) { keys.delete(code); handlers.keyup({ code, preventDefault }); }
      }
      for (const code of wanted) {
        if (!keys.has(code)) { keys.add(code); handlers.keydown({ code, preventDefault }); }
      }
    }
    input.apply(g, frame);
    tick(g);
    tick(g);
    if (onFrame) onFrame(g, coach);
  }
  g.instructions = seen;
  return g;
}

export function allTests() {
  const out = [];
  const check = (name, pass, detail = '') => out.push({ name, pass: !!pass, detail });

  // Trim
  {
    const g = createGame(b737);
    const pitch0 = eulerFrom(g.s.q).pitch;
    let maxPitchDrift = 0;
    let maxSpeedDrift = 0;
    const V0 = g.s.V || 145 * KT;
    runSteps(g, 60, (gm) => {
      if (gm.time < 1) return;
      maxPitchDrift = Math.max(maxPitchDrift, Math.abs(eulerFrom(gm.s.q).pitch - pitch0) / DEG);
      maxSpeedDrift = Math.max(maxSpeedDrift, Math.abs(gm.s.V - V0) / KT);
    });
    check('Hands-off trim holds pitch for 60 s', maxPitchDrift < 0.5, `max drift ${maxPitchDrift.toFixed(2)}°`);
    check('Hands-off trim holds speed for 60 s', maxSpeedDrift < 2, `max drift ${maxSpeedDrift.toFixed(2)} kt`);
    const fpm = -g.s.vel[1] / FPM;
    check('3° approach at 145 kt descends 750-800 fpm', fpm > 750 && fpm < 800, `${fpm.toFixed(0)} fpm`);
  }

  // Believable approach numbers
  {
    const t = solveTrim(b737, 145 * KT, -3 * DEG);
    const deck = (t.alpha / DEG) - 3;
    check('Approach deck angle is about 2-3°', deck > 1.5 && deck < 3.5, `${deck.toFixed(2)}°`);
    check('Approach thrust is a plausible fraction', t.lever > 0.12 && t.lever < 0.4, `lever ${(t.lever * 100).toFixed(0)}%`);
    const vs = stallSpeed(b737) / KT;
    check('Stall speed near 114 kt', vs > 108 && vs < 120, `${vs.toFixed(1)} kt`);
  }

  // Stall: idle thrust, hold the nose up until the wing quits
  {
    const g = createGame(b737);
    g.controls.throttle = 0;
    let stallKt = null;
    let holdI = 0;
    let dropped = false;
    let peakPitch = -9;
    runSteps(g, 45, (gm) => {
      const p = eulerFrom(gm.s.q).pitch;
      peakPitch = Math.max(peakPitch, p);
      if (stallKt == null) {
        // Hold the nose at 8 degrees and let the speed bleed off, as in a real 1 g stall.
        holdI += (8 * DEG - p) * DT * 1.5;
        gm.controls.elevator = (8 * DEG - p) * 8 - gm.s.w[2] * 4 + holdI;
        if (gm.s.stall > 0) stallKt = gm.s.V / KT;
      } else {
        gm.controls.elevator = 0.5;
        if (p < peakPitch - 5 * DEG) dropped = true;
      }
    });
    check('Stalls near the expected speed', stallKt && stallKt > 105 && stallKt < 125, `${stallKt && stallKt.toFixed(1)} kt`);
    check('Nose drops in the stall', dropped);
  }

  // Thrust cut: speed decays on a believable timescale
  {
    const g = createGame(b737);
    const V0 = g.s.V;
    g.controls.throttle = 0;
    runSteps(g, 10, (gm) => {
      const p = eulerFrom(gm.s.q).pitch;
      gm.controls.elevator = (g.trim.alpha - 3 * DEG - p) * 10 - gm.s.w[2] * 4;
    });
    const lost = (V0 - g.s.V) / KT;
    check('Idle thrust loses 5-20 kt in 10 s on the path', lost > 5 && lost < 20, `${lost.toFixed(1)} kt`);
  }

  // Thrust raises the nose (underslung engines)
  {
    const g = createGame(b737);
    const p0 = eulerFrom(g.s.q).pitch;
    g.controls.throttle = 1;
    runSteps(g, 8);
    check('Adding thrust pitches the nose up', eulerFrom(g.s.q).pitch > p0);
  }

  // Roll
  {
    const g = createGame(b737);
    g.controls.aileron = 1;
    runSteps(g, 3);
    const bank = eulerFrom(g.s.q).bank / DEG;
    check('Right aileron banks right at 10-20°/s', bank > 20 && bank < 60, `${bank.toFixed(1)}° in 3 s`);
  }

  // Turn: bank right and the track moves right
  {
    const g = createGame(b737);
    runSteps(g, 25, (gm) => {
      const b = eulerFrom(gm.s.q).bank;
      gm.controls.aileron = (15 * DEG - b) * 2 - gm.s.w[0];
      gm.controls.elevator = 0.05;
    });
    check('A right bank turns right', g.s.vel[2] > 5, `lateral speed ${g.s.vel[2].toFixed(1)} m/s`);
  }

  // Static on the ground
  {
    const g = createGame(b737);
    const s = g.s;
    s.pos = [500, 3.75, 0];
    s.vel = [0, 0, 0];
    s.q = qAxis([0, 0, 1], 0);
    s.spool = 0;
    const c = { ...g.controls, throttle: 0, trim: 0, brake: 1 };
    for (let i = 0; i < 600; i++) step(s, b737, c, DT);
    const noseLoadOk = s.contact.nose && s.contact.mainL && s.contact.mainR;
    const loadErr = Math.abs(s.contact.load - b737.mass * GRAVITY) / (b737.mass * GRAVITY);
    check('Sits at rest on all three wheels', noseLoadOk && s.V < 0.1, `speed ${s.V.toFixed(3)}`);
    check('Gear carries the weight', loadErr < 0.02, `${(loadErr * 100).toFixed(2)}% off`);
  }

  // Landing bot
  {
    const g = land();
    const r = g.result;
    const rec = r && r.record;
    check('Bot flies the approach and stops on the runway', r && !r.failure && !r.missed && rec,
      r ? `${r.headline}, score ${r.score}, ${rec && rec.sinkFpm.toFixed(0)} fpm at ${rec && rec.x.toFixed(0)} m` : 'no result');
    check('Bot lands inside the touchdown zone', rec && rec.x > 100 && rec.x < 900, rec && `${rec.x.toFixed(0)} m`);
    check('Bot lands on the centerline', rec && Math.abs(rec.z) < 3, rec && `${rec.z.toFixed(2)} m`);
    check('Bot scores well', r && r.score >= 75, r && `${r.score}`);
    check('Bot stops with runway left', g.s.pos[0] < RUNWAY.length - 100, `${g.s.pos[0].toFixed(0)} m`);
  }

  // An offset start is recoverable
  {
    const g = land({}, { offsetZ: 120 });
    check('Bot recovers a 120 m offset start', g.result && !g.result.failure && !g.result.missed, g.result && g.result.headline);
  }

  // What a person does: fly the path, pull back at 30 ft, close the thrust.
  for (const stick of [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5]) {
    const g = createGame(b737);
    const bot = createBot({ noFlare: true });
    let held = false;
    runSteps(g, 240, (gm) => {
      flyBot(bot, gm);
      const ft = (gm.s.pos[1] - 3.7) / 0.3048;
      if (ft < 30 && gm.phase === 'approach') held = true;
      if (held && gm.phase === 'approach') {
        gm.controls.throttle = 0;
        gm.controls.elevator = stick;
      }
    });
    const rec = g.result && g.result.record;
    out.push({ name: `INFO constant ${stick} stick flare`, pass: true,
      detail: rec ? `${g.result.headline}: ${rec.sinkFpm && rec.sinkFpm.toFixed(0)} fpm at ${rec.x && rec.x.toFixed(0)} m` : g.result && g.result.headline });
  }

  // Keyboard-only pilots, with human reaction times
  for (const [ms, threshold] of [[150, 0.1], [250, 0.12], [350, 0.15]]) {
    const g = keyboardPilot(ms, threshold);
    const r = g.result;
    const rec = r && r.record;
    check(`Keyboard pilot lands, reacting every ${ms} ms`, r && !r.failure && !r.missed,
      r ? `${r.headline}, score ${r.score}${rec && rec.sinkFpm ? `, ${rec.sinkFpm.toFixed(0)} fpm at ${rec.x.toFixed(0)} m, ${rec.bounces} bounces` : ''}` : 'no result');
  }

  // Doing only what the coach says
  for (const [name, ms, opts] of [
    ['from the normal start', 250, {}],
    ['with a slower reaction', 400, {}],
    ['from 100 m off the centerline', 250, { offsetZ: 100 }],
    ['from 150 kt', 250, { speedKt: 150 }],
    ['from 300 m off the centerline', 300, { offsetZ: -300 }],
    ['from close in and offset', 300, { distance: 4000, offsetZ: 60 }],
  ]) {
    const g = coachedPilot(ms, opts);
    const r = g.result;
    const rec = r && r.record;
    check(`Following the coach lands ${name}`, r && !r.failure && !r.missed && r.score >= 60,
      r ? `${r.headline}, score ${r.score}${rec && rec.sinkFpm ? `, ${rec.sinkFpm.toFixed(0)} fpm at ${rec.x.toFixed(0)} m` : ''}` : 'no result');
  }
  {
    const g = createGame(b737);
    const coach = createCoach();
    const first = coach.advise(g);
    check('Coach says nothing needs fixing on a perfect start', first.actions.length === 0, first.stage);
    g.s.pos[1] += 90;
    const high = createCoach().advise(g);
    check('Coach notices being above the path', high.stage.startsWith('Above'), high.stage);
  }

  // Full flight
  {
    const g = createGame(b737, { mode: 'full' });
    const bot = createBot();
    let peakAlt = 0;
    let liftoff = null;
    let minX = 0;
    runSteps(g, 1500, () => {
      flyAuto(bot, g);
      peakAlt = Math.max(peakAlt, g.s.pos[1]);
      minX = Math.min(minX, g.s.pos[0]);
      if (liftoff == null && g.phase !== 'takeoff') liftoff = RUNWAY.length - g.s.pos[0];
    });
    const r = g.result;
    check('Bot takes off within the runway', liftoff && liftoff < 2800, `${liftoff && liftoff.toFixed(0)} m`);
    check('Bot reaches 4,000 ft and the sea', peakAlt * 3.28 > 3700 && minX < -22000, `${(peakAlt * 3.28).toFixed(0)} ft, ${minX.toFixed(0)} m`);
    check('Bot flies the whole route and lands', r && !r.failure && !r.missed, r ? `${r.headline}, score ${r.score}, ${(g.time / 60).toFixed(1)} min, leg ${g.route.leg}` : `no result, leg ${g.route.leg}, x ${g.s.pos[0].toFixed(0)}, y ${g.s.pos[1].toFixed(0)}, phase ${g.phase}`);
  }

  for (const ms of [250, 400]) {
    const g = coachedPilot(ms, { mode: 'full' });
    const r = g.result;
    check(`Following the coach flies the whole flight, reacting every ${ms} ms`, r && !r.failure && !r.missed,
      r ? `${r.headline}, score ${r.score}, ${(g.time / 60).toFixed(1)} min` : `no result, leg ${g.route.leg}, phase ${g.phase}`);
  }
  {
    const g = createGame(b737, { mode: 'full' });
    g.s.pos = [1000, 12, 0];
    g.s.vel = [70, -2, 0];
    g.s.q = qAxis([0, 0, 1], 4 * DEG);
    g.s.flap = 1;
    g.s.gearDown = 0;
    g.controls.gearDown = false;
    g.phase = 'approach';
    g.route.final = true;
    runSteps(g, 20);
    check('Landing with the gear up is a crash', g.result && g.result.failure === 'gearUp', g.result && g.result.headline);
  }

  // A person who holds the pull key far too long on takeoff
  {
    const h = {};
    const input = createInput({ addEventListener: (type, fn) => { h[type] = fn; } });
    const preventDefault = () => {};
    const g = createGame(b737, { mode: 'full' });
    h.keydown({ code: 'KeyR', preventDefault });
    let held = false;
    let flown = false;
    for (let f = 0; f < 60 * 45 && g.phase !== 'finished'; f++) {
      if (!held && g.s.V / KT > 140) { held = true; h.keydown({ code: 'ArrowDown', preventDefault }); }
      input.apply(g, 1 / 60);
      tick(g);
      tick(g);
      if (g.phase === 'approach') flown = true;
    }
    check('Holding the pull key through rotation takes off without a tail strike', flown && !g.tailStruck, `flown ${flown}, tail ${g.tailStruck}`);
  }
  {
    const g = createGame(b737, { mode: 'full' });
    g.controls.throttle = 1;
    runSteps(g, 30, (gm) => {
      if (gm.s.V / KT > 170) gm.controls.throttle = 0;
      gm.controls.rudder = 0;
    });
    check('The nose stays down at full thrust until you rotate', g.phase === 'takeoff' && !g.tailStruck, `${g.phase}, ${(g.s.V / KT).toFixed(0)} kt`);
  }

  // Failure cases
  {
    const g = land({ noFlare: true });
    const r = g.result;
    check('No flare at all is a hard landing with a poor score', r && r.record.sinkFpm > 600 && r.score < 75, r && `${r.headline}, score ${r.score}`);
    const steep = land({ noFlare: true, aimDeg: 6 });
    const rs = steep.result;
    check('A steep unflared arrival is a crash', rs && rs.failure === 'crash', rs && `${rs.failure}, ${rs.record.sinkFpm && rs.record.sinkFpm.toFixed(0)} fpm`);
  }
  {
    // Set up the moment directly: nose far too high, tail nearly on the runway.
    const g = createGame(b737);
    g.s.pos = [500, 4.3, 0];
    g.s.vel = [68, -1.2, 0];
    g.s.q = qAxis([0, 0, 1], 13 * DEG);
    g.s.spool = 0;
    g.controls.throttle = 0;
    const bot = createBot();
    runSteps(g, 90, () => flyBot(bot, g));
    const r = g.result;
    check('Over-rotating strikes the tail', g.tailStruck && r && r.failure === 'tail', r && `${r.headline}`);
  }
  {
    const g = land({ aimZ: 18, noBrakes: false }, {}, 240);
    const r = g.result;
    check('Bot on a 18 m offset still touches runway', r && r.record && r.record.z > 10, r && r.headline);
  }
  {
    const g = land({ aimZ: 40 });
    const r = g.result;
    check('Landing beside the runway fails', r && r.failure === 'offRunway', r && `${r.failure}`);
  }
  {
    const g = land({ aimPoint: -400 });
    const r = g.result;
    check('Landing short fails', r && r.failure === 'short', r && `${r.failure}`);
  }
  {
    const g = land({ noBrakes: true, aimPoint: 1800 }, {}, 400);
    const r = g.result;
    check('Long landing with no brakes runs off the end', r && r.failure === 'offRunway', r && `${r.failure}`);
  }
  {
    const g = createGame(b737);
    runSteps(g, 240, (gm) => {
      gm.controls.throttle = 1;
      gm.controls.elevator = (10 * DEG - eulerFrom(gm.s.q).pitch) * 3 - gm.s.w[2] * 2;
    });
    check('Flying past the runway is a go-around', g.result && g.result.missed, g.result && g.result.headline);
  }

  // Scoring
  {
    check('Sink bands', sinkLabel(90) === 'Butter' && sinkLabel(200) === 'Good' && sinkLabel(300) === 'Firm'
      && sinkLabel(500) === 'Hard' && sinkLabel(1100) === 'Crash');
    const perfect = scoreLanding({ sinkFpm: 80, x: 305, z: 0, bankDeg: 0, bounces: 0, stopped: true });
    check('A perfect landing scores 100', perfect.score === 100, `${perfect.score}`);
    const fail = scoreLanding({ sinkFpm: 80, x: 305, z: 0, bankDeg: 0, bounces: 0, failure: 'tail' });
    check('A failure scores 0', fail.score === 0 && fail.grade === 'F');
  }

  // Every airplane must do the basics
  for (const ac of [a320, b747]) {
    const name = ac.shortName;
    const t = solveTrim(ac, ac.approachSpeedKt * KT, -3 * DEG);
    const deck = t.alpha / DEG - 3;
    check(`${name}: approach deck angle is believable`, deck > 1 && deck < 4.5, `${deck.toFixed(2)}°, lever ${(t.lever * 100).toFixed(0)}%`);

    const trimmed = createGame(ac);
    const p0 = eulerFrom(trimmed.s.q).pitch;
    runSteps(trimmed, 60);
    const drift = Math.abs(eulerFrom(trimmed.s.q).pitch - p0) / DEG;
    check(`${name}: hands-off approach holds for 60 s`, drift < 1, `${drift.toFixed(2)}°`);

    const g = land({}, {}, 240, ac);
    const r = g.result;
    check(`${name}: bot lands`, r && !r.failure && !r.missed && r.score >= 60,
      r ? `${r.headline}, score ${r.score}, ${r.record.sinkFpm && r.record.sinkFpm.toFixed(0)} fpm at ${r.record.x && r.record.x.toFixed(0)} m` : 'no result');

    for (const ms of [250, 400]) {
      const c = coachedPilot(ms, {}, null, ac);
      const cr = c.result;
      check(`${name}: following the coach lands, reacting every ${ms} ms`, cr && !cr.failure && !cr.missed,
        cr ? `${cr.headline}, score ${cr.score}` : 'no result');
    }

    const full = createGame(ac, { mode: 'full' });
    const bot = createBot();
    runSteps(full, 1500, () => {
      flyAuto(bot, full);
    });
    const fr = full.result;
    check(`${name}: bot flies the whole route`, fr && !fr.failure && !fr.missed, fr ? `${fr.headline}, score ${fr.score}, ${(full.time / 60).toFixed(1)} min` : `no result, leg ${full.route.leg}, ${full.phase}`);

    const coached = coachedPilot(300, { mode: 'full' }, null, ac);
    const qr = coached.result;
    check(`${name}: following the coach flies the whole flight`, qr && !qr.failure && !qr.missed, qr ? `${qr.headline}, score ${qr.score}` : `no result, leg ${coached.route.leg}`);
  }

  // Doing nothing must never work, and flying must always be possible
  for (const ac of [b737, a320, b747]) {
    const name = ac.shortName;
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    let landedAlone = 0;
    let closest = 1e9;
    for (const seed of seeds) {
      const g = createGame(ac, { conditions: createConditions(seed) });
      runSteps(g, 240);
      const r = g.result;
      if (r && !r.failure && !r.missed) landedAlone += 1;
      if (g.record && g.record.z != null) closest = Math.min(closest, Math.abs(g.record.z));
    }
    check(`${name}: hands-off never lands, across ${seeds.length} windy flights`, landedAlone === 0 && closest > RUNWAY.width / 2,
      `${landedAlone} landed, closest touchdown ${closest.toFixed(0)} m off centerline`);

    let botOk = 0;
    let botSum = 0;
    for (const seed of seeds) {
      const g = land({}, { conditions: createConditions(seed) }, 240, ac);
      if (g.result && !g.result.failure && !g.result.missed) { botOk += 1; botSum += g.result.score; }
    }
    check(`${name}: bot lands in all windy flights`, botOk === seeds.length, `${botOk}/${seeds.length}, average score ${(botSum / Math.max(botOk, 1)).toFixed(0)}`);

    let coachOk = 0;
    const fails = [];
    for (const seed of seeds.slice(0, 8)) {
      const g = coachedPilot(300, { conditions: createConditions(seed) }, null, ac);
      if (g.result && !g.result.failure && !g.result.missed) coachOk += 1;
      else fails.push(`${seed}:${g.result ? g.result.headline : 'none'}`);
    }
    check(`${name}: following the coach lands in windy flights`, coachOk >= 7, `${coachOk}/8 ${fails.join(', ')}`);

    const full = coachedPilot(300, { mode: 'full', conditions: createConditions(5) }, null, ac);
    const fr = full.result;
    check(`${name}: following the coach flies the whole flight in wind`, fr && !fr.failure && !fr.missed, fr ? `${fr.headline}, score ${fr.score}` : `no result, leg ${full.route.leg}`);
  }

  // Applause
  {
    const loud = renderApplause(22050, 4, 1);
    const polite = renderApplause(22050, 4, 0.2);
    const energy = (a, from, to) => {
      let e = 0;
      for (let i = Math.floor(from * a.length); i < to * a.length; i++) e += a[i] * a[i];
      return e;
    };
    const peak = loud.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    check('Applause stays within full scale', peak > 0.5 && peak <= 1.0001, `peak ${peak.toFixed(2)}`);
    check('Applause swells and then fades', energy(loud, 0.2, 0.5) > energy(loud, 0.9, 1) * 3 && crowdShape(1) === 0, '');
    check('A better landing gets more applause', energy(loud, 0, 1) > energy(polite, 0, 1) * 1.5, `${(energy(loud, 0, 1) / energy(polite, 0, 1)).toFixed(1)}x`);
  }

  // Getting up
  for (const ac of [b737, a320, b747]) {
    const name = ac.shortName;
    const l = cabinLayout(ac);
    const w = createWalker(ac);
    for (let i = 0; i < 300; i++) stepWalker(w, { forward: true }, 1 / 60);
    check(`${name}: standing up ends facing the cabin`, !w.rising, `at x ${w.x.toFixed(1)}`);
    for (let i = 0; i < 2400; i++) stepWalker(w, { forward: true }, 1 / 60);
    check(`${name}: you can walk to the back of the cabin`, w.x < l.rearX + 1, `x ${w.x.toFixed(1)}, row ${rowOf(w)}, of ${l.rows}`);
    check(`${name}: the walk stays in the aisle`, Math.abs(w.z - l.aisle) < 0.3, `z ${w.z.toFixed(2)}`);
    const seated = walkerPose(createWalker(ac));
    check(`${name}: getting up starts at the pilot's eye`, Math.abs(seated.x - ac.eye[0]) < 0.01 && Math.abs(seated.y - ac.eye[1]) < 0.01);
    check(`${name}: believable passenger count`, l.passengers > 100 && l.passengers < 520, `${l.passengers} passengers, ${l.rows} rows`);
  }
  {
    const g = createGame(b737);
    check('You can get up at cruise height', canLeaveSeat(g) || g.s.pos[1] < 460, '');
    g.s.pos[1] = 300;
    check('You can\'t get up near the ground', !canLeaveSeat(g) && mustReturn(g));
    const parked = createGame(b737, { mode: 'full' });
    runSteps(parked, 2);
    check('You can get up before takeoff', canLeaveSeat(parked));

    const a = createGame(b737, { mode: 'full' });
    const bot = createBot();
    runSteps(a, 1600, () => flyAuto(bot, a));
    check('The cabin is happy after a smooth flight', a.passengers.comfort > 80, `comfort ${a.passengers.comfort.toFixed(0)}%`);

    const rough = createGame(b737, { conditions: createConditions(3) });
    runSteps(rough, 40, (gm) => { gm.controls.elevator = Math.sin(gm.time * 1.6); gm.controls.aileron = Math.sin(gm.time * 0.9); });
    check('Throwing the airplane around scares the cabin', rough.passengers.comfort < 70, `comfort ${rough.passengers.comfort.toFixed(0)}%, ${mood(rough.passengers, rough.time)}`);

    const climbing = createGame(b737, { mode: 'athens' });
    climbing.phase = 'approach';
    climbing.route.leg = 2;
    climbing.s.pos = [-20000, 1750, 0];
    climbing.s.vel = [-120, 2, 0];
    climbing.s.contact = { mainL: false, mainR: false, nose: false, load: 0 };
    check('You can get up on the climb toward Athens', canLeaveSeat(climbing) && !mustReturn(climbing));

    const arriving = createGame(b737, { mode: 'athens' });
    beginArrival(arriving);
    check('You can get up at the start of the Athens arrival', canLeaveSeat(arriving));
    arriving.route.leg = arriving.route.legs.length - 1;
    check('You can\'t get up on the leg that ends in a landing', !canLeaveSeat(arriving) && mustReturn(arriving));

    const hb = createGame(a320);
    hb.controls.elevator = 0.2;
    handBack(hb);
    check('Handing back centers the stick', hb.controls.elevator === 0);
  }

  // Hijacking
  {
    const fight = (pressesPerSecond, ac = b737) => {
      const g = createGame(ac, { mode: 'athens', emergency: createHijack(1) });
      beginArrival(g);
      const bot = createBot();
      let nextPress = 0;
      let triggered = false;
      runSteps(g, 40, (gm) => {
        flyAuto(bot, gm);
        const e = gm.emergency;
        if (e.stage !== 'waiting') triggered = true;
        if (e.stage === 'fight' && pressesPerSecond > 0 && e.time >= nextPress) {
          mash(e);
          nextPress = e.time + 1 / pressesPerSecond;
        }
        if (e.stage === 'over') gm.done = true;
      });
      return { g, triggered };
    };
    const fast = fight(7);
    check('Hammering X at 7 a second wins the fight', fast.g.emergency.won && !fast.g.result, `meter ${fast.g.emergency.meter.toFixed(0)}, ${fast.g.emergency.presses} presses`);
    const steady = fight(5);
    check('5 a second is still enough', steady.g.emergency.won, `${steady.g.emergency.presses} presses in ${steady.g.emergency.time.toFixed(1)} s`);
    const slow = fight(2);
    check('2 a second loses the cockpit', slow.g.result && slow.g.result.failure === 'hijacked', slow.g.result && slow.g.result.headline);
    const none = fight(0);
    check('Doing nothing still gives you time to react', none.g.emergency.time > 3, `${none.g.emergency.time.toFixed(1)} s`);
    check('Doing nothing loses the cockpit, without an explosion', none.g.result && none.g.result.failure === 'hijacked' && !EXPLOSIVE.has('hijacked'), none.g.result && none.g.result.headline);
    check('The passengers are frightened during it', fast.triggered && fast.g.passengers.scaredUntil > 0);
    check('The flight carries on after you win', fast.g.phase === 'approach', fast.g.phase);

    const blocked = createGame(b737, { mode: 'athens', emergency: createHijack(0) });
    runSteps(blocked, 5);
    check('It never starts on the ground', blocked.emergency.stage === 'waiting');
    const seat = createGame(b737, { mode: 'athens', emergency: createHijack(0) });
    beginArrival(seat);
    runSteps(seat, 1);
    check('You can\'t get up mid-fight', emergencyActive(seat.emergency) && !canLeaveSeat(seat), seat.emergency.stage);

    const low = createGame(b737, { emergency: createHijack(0) });
    runSteps(low, 5);
    check('It never starts low on a landing approach', low.emergency.stage === 'waiting');

    let some = 0;
    let n = 0;
    const rnd = () => { n = (n * 9301 + 49297) % 233280; return n / 233280; };
    for (let i = 0; i < 400; i++) if (planEmergency(rnd)) some += 1;
    check('Only some flights have an emergency', some > 200 && some < 340, `${some} of 400`);

    const h = {};
    const input = createInput({ addEventListener: (t, f) => { h[t] = f; } });
    const flaps = createGame(b737, { mode: 'full' });
    flaps.controls.flap = 0;
    for (let i = 0; i < 5; i++) h.keydown({ code: 'KeyX', preventDefault() {} });
    input.discardSwitches();
    input.apply(flaps, 1 / 60);
    check('Hammering X in a fight doesn\'t move the flaps', flaps.controls.flap === 0);
  }

  // After the fight
  {
    const g = createGame(b737, { mode: 'athens', emergency: createHijack(1) });
    beginArrival(g);
    const bot = createBot();
    const stages = new Set();
    let next = 0;
    runSteps(g, 30, (gm) => {
      flyAuto(bot, gm);
      const e = gm.emergency;
      stages.add(e.stage);
      if (e.stage === 'fight' && e.time >= next) { mash(e); next = e.time + 1 / 7; }
    });
    check('Winning goes through the aftermath, then you fly on', stages.has('aftermath') && g.emergency.stage === 'over' && g.phase === 'approach', [...stages].join(', '));
    check('You can\'t get up until it\'s over, then you can', canLeaveSeat(g), g.emergency.stage);
    check('After the fight, passengers talk about it', chatterTopic(g, 'calm') === 'afterFight', chatterTopic(g, 'calm'));
  }

  // Talking to passengers
  for (const ac of [b737, a320, b747]) {
    const w = createWalker(ac);
    const l = w.l;
    check(`${ac.shortName}: nobody to talk to on the flight deck`, nearestPassenger(w) === null);
    w.rising = false;
    w.x = l.frontRowX - 4;
    w.z = l.aisle;
    const near = nearestPassenger(w);
    check(`${ac.shortName}: someone to talk to in the aisle`, !!near, near ? seatName(l, near.seat) : 'none');
    const seats = l.seats.filter((s) => s.taken);
    check(`${ac.shortName}: seat names look right`, /^[0-9]+[A-K]$/.test(seatName(l, seats[0])), seatName(l, seats[0]));
  }
  {
    const seat = { phase: 2.5 };
    let filled = true;
    for (const topic of topics) for (let i = 0; i < 12; i++) if (typeof chatterLine(topic, seat, i) !== 'string') filled = false;
    check('Every topic always has a line', filled, `${topics.length} topics`);
    check('Asking again gets a different line', chatterLine('cruise', seat, 0) !== chatterLine('cruise', seat, 1));
    check('Different passengers say different things', chatterLine('cruise', { phase: 0.4 }, 0) !== chatterLine('cruise', { phase: 3.3 }, 0));

    const parked = createGame(b737, { mode: 'full' });
    runSteps(parked, 2);
    check('On the runway they ask why we aren\'t moving', chatterTopic(parked, 'calm') === 'parked', chatterTopic(parked, 'calm'));
    const up = createGame(b737);
    check('In the air they make small talk', chatterTopic(up, 'calm') === 'cruise', chatterTopic(up, 'calm'));
    check('In rough air they worry', chatterTopic(up, 'scared') === 'scared');
    const arrived = createGame(b737, { mode: 'athens' });
    beginArrival(arrived);
    check('Over Greece they talk about Athens', chatterTopic(arrived, 'calm') === 'athens', chatterTopic(arrived, 'calm'));
    const landed = land();
    check('After a good landing they\'re happy', chatterTopic(landed, 'calm') === 'landed', chatterTopic(landed, 'calm'));
  }

  // Directions
  {
    const s = { pos: [0, 0, 0], vel: [100, 0, 0] };
    check('A target to the right says turn right', turnTo(s, 0, 1000) > 85 && turnText(turnTo(s, 0, 1000)) === 'Turn right 90°', turnText(turnTo(s, 0, 1000)));
    check('A target to the left says turn left', turnText(turnTo(s, 1000, -1000)) === 'Turn left 45°', turnText(turnTo(s, 1000, -1000)));
    check('A target dead ahead says straight ahead', turnText(turnTo(s, 1000, 10)) === 'Straight ahead');
    s.vel = [0, 0, -100];
    check('Directions follow where you are going', turnText(turnTo(s, 1000, 0)) === 'Turn right 90°', turnText(turnTo(s, 1000, 0)));
  }

  // Tel Aviv to Athens
  for (const ac of [b737, a320, b747]) {
    const name = ac.shortName;
    const g = createGame(ac, { mode: 'athens' });
    const bot = createBot();
    let cruised = false;
    let arrivalDrop = 0;
    let arrivalStart = null;
    runSteps(g, 1500, () => {
      if (g.phase === 'cruise') { cruised = true; beginArrival(g); arrivalStart = g.s.pos[1]; }
      if (arrivalStart != null && g.time) arrivalDrop = Math.max(arrivalDrop, arrivalStart - g.s.pos[1]);
      flyAuto(bot, g);
    });
    const r = g.result;
    check(`${name}: reaches the cruise and arrives at Athens`, cruised && g.airport.id === 'ath', `${g.airport.id}, ${g.phase}`);
    check(`${name}: bot lands at Athens`, r && !r.failure && !r.missed, r ? `${r.headline}, score ${r.score}, ${(g.time / 60).toFixed(1)} min` : `no result, leg ${g.route.leg}, ${g.phase}, x ${g.s.pos[0].toFixed(0)}, z ${g.s.pos[2].toFixed(0)}, ${(g.s.pos[1] * 3.28).toFixed(0)} ft`);

    const start = createGame(ac, { mode: 'athens' });
    beginArrival(start);
    const p0 = eulerFrom(start.s.q).pitch;
    runSteps(start, 15);
    const drift = Math.abs(eulerFrom(start.s.q).pitch - p0) / DEG;
    check(`${name}: the arrival starts trimmed`, drift < 3 && start.phase === 'approach', `${drift.toFixed(2)}°`);
    check(`${name}: arriving doesn't jolt the passengers`, start.passengers.comfort > 95, `comfort ${start.passengers.comfort.toFixed(0)}%`);

    for (const seed of [2, 5]) {
      const c = coachedPilot(300, { mode: 'athens', conditions: createConditions(seed) }, null, ac);
      const cr = c.result;
      check(`${name}: following the coach reaches Athens, wind ${seed}`, cr && !cr.failure && !cr.missed && c.airport.id === 'ath',
        cr ? `${cr.headline}, score ${cr.score}, ${(c.time / 60).toFixed(1)} min` : `no result, leg ${c.route.leg}, ${c.phase}`);
    }
  }

  // The reason the A320 is here: same abuse, different outcome
  {
    const abuse = (ac) => {
      const g = createGame(ac);
      g.controls.throttle = 0;
      let maxAlpha = 0;
      runSteps(g, 25, (gm) => {
        gm.controls.throttle = 0;
        gm.controls.elevator = 1;
        maxAlpha = Math.max(maxAlpha, gm.s.alpha / DEG);
      });
      return { g, maxAlpha };
    };
    const boeing = abuse(b737);
    const airbus = abuse(a320);
    check('Full back stick at idle stalls the 737', boeing.maxAlpha > b737.alphaStall, `peak alpha ${boeing.maxAlpha.toFixed(1)}°`);
    check('Full back stick at idle cannot stall the A320', airbus.maxAlpha < a320.alphaStall, `peak alpha ${airbus.maxAlpha.toFixed(1)}°`);

    const g = createGame(a320);
    g.controls.throttle = 0.2;
    runSteps(g, 12, (gm) => { gm.controls.aileron = gm.time < 6 ? 1 : 0; });
    const bank = Math.abs(eulerFrom(g.s.q).bank / DEG);
    check('A320: released past 33° of bank, it rolls back', bank < 36, `${bank.toFixed(1)}°`);

    const n = createGame(a320);
    runSteps(n, 3, (gm) => { gm.controls.elevator = gm.time < 2 ? 0.5 : 0; });
    const pitchAfter = eulerFrom(n.s.q).pitch;
    runSteps(n, 10, (gm) => { gm.controls.elevator = 0; });
    const held = Math.abs(eulerFrom(n.s.q).pitch - pitchAfter) / DEG;
    check('A320: a centered stick holds the attitude you left', held < 2.5, `moved ${held.toFixed(2)}°`);

    const retard = land({}, {}, 240, a320);
    check('Bot lands the A320 without a stall warning', retard.result && !retard.result.failure);
  }

  return out;
}
