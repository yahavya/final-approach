// Wires the simulation to the screen: fixed-step physics, then one render per frame.

import { AIRCRAFT, findAircraft } from './sim/aircraft/index.js';
import { DT } from './sim/flightModel.js';
import { beginArrival, createGame, tick } from './game/scenario.js';
import { createBot } from './game/bot.js';
import { canLeaveSeat, flyAuto, handBack, mustReturn, nearLanding } from './game/autopilot.js';
import { createWalker, rowOf, stepWalker, walkerPose } from './game/walk.js';
import { mood } from './game/passengers.js';
import { createCoach } from './game/coach.js';
import { createConditions } from './game/conditions.js';
import { createHijack, emergencyActive, fallProgress, fightLeft, fightPose, mash, planEmergency } from './game/emergency.js';
import { chatterLine, chatterTopic, nearestPassenger, seatName } from './game/chatter.js';
import { EXPLOSIVE } from './game/scoring.js';
import { createWorld } from './world/scene.js';
import { createHud } from './ui/hud.js';
import { createAudio } from './ui/audio.js';
import { createInput } from './ui/input.js';
import { createAnalytics } from './ui/analytics.js?v=3';

const params = new URLSearchParams(location.search);
const botMode = params.has('bot');
const distance = params.has('distance') ? Number(params.get('distance')) : undefined;

const view = document.getElementById('view');
const AIRCRAFT_KEY = 'final-approach-aircraft';
const readAircraft = () => {
  try { return findAircraft(params.get('aircraft') ?? localStorage.getItem(AIRCRAFT_KEY)); } catch { return findAircraft(null); }
};
let aircraft = readAircraft();

const world = createWorld(view, aircraft);
const hud = createHud(document.getElementById('hud'));
const audio = createAudio();
const input = createInput();
// Analytics must never be able to stop the game from starting.
let analytics = { event() {} };
try {
  analytics = createAnalytics();
} catch (error) {
  console.warn('Analytics unavailable', error);
}

const el = (id) => document.getElementById(id);

const bestKey = (m, ac) => `final-approach-best-${m}-${ac.id}`;
const COACH_KEY = 'final-approach-coach';
const readBest = (m) => {
  try { return Number(localStorage.getItem(bestKey(m, aircraft))) || 0; } catch { return 0; }
};
const writeBest = (m, v) => {
  try { localStorage.setItem(bestKey(m, aircraft), String(v)); } catch { /* best score is only a convenience */ }
};

function readCoachSetting() {
  try { return localStorage.getItem(COACH_KEY) !== 'off'; } catch { return true; }
}
function writeCoachSetting(on) {
  try { localStorage.setItem(COACH_KEY, on ? 'on' : 'off'); } catch { /* a convenience only */ }
}

let coachOn = readCoachSetting();
let coach = createCoach();
let mode = ['full', 'athens'].includes(params.get('mode')) ? params.get('mode') : 'landing';
let game = createGame(aircraft, { distance, mode });
let bot = botMode ? createBot() : null;
let screen = 'title'; // title, flying, paused, result
let accumulator = 0;
let emergencyBot = null;
let talks = 0;
let talk = null; // what a passenger is saying to you
const TALK_MS = 4500;
let ignoreSwitchesUntil = 0;
let cruiseLeft = 0;
const CRUISE_SECONDS = 12;
let walker = null;
let walkerBot = null;
let seatMessage = '';
let seatMessageUntil = 0;
let resultTimer = 0;
let shake = 0;

function selectAircraft(next) {
  aircraft = next;
  try { localStorage.setItem(AIRCRAFT_KEY, next.id); } catch { /* a convenience only */ }
  world.setAircraft(next);
  game = createGame(aircraft, { distance, mode });
  showAircraft();
  showBest();
}

function showAircraft() {
  document.querySelectorAll('.plane').forEach((b) => b.classList.toggle('on', b.dataset.id === aircraft.id));
  el('plane-blurb').textContent = aircraft.blurb;
}

function showCoachState() {
  const label = el('coach-state');
  label.textContent = coachOn ? 'Coach on' : 'Coach off';
  label.classList.toggle('on', coachOn);
}

function setCoach(on) {
  coachOn = on;
  writeCoachSetting(on);
  showCoachState();
}

function showBest() {
  for (const m of ['landing', 'full', 'athens']) {
    const best = readBest(m);
    el(`best-${m}`).textContent = best ? `Best ${best}` : '';
  }
}

/** Talks to whoever is nearest. Pressing again moves the conversation on. */
function talkToPassenger() {
  const near = nearestPassenger(walker);
  if (!near) return;
  const topic = chatterTopic(game, mood(game.passengers, game.time));
  talk = {
    who: seatName(walker.l, near.seat),
    line: chatterLine(topic, near.seat, talks),
    until: performance.now() + TALK_MS,
    index: near.index,
  };
  talks += 1;
}

function start(nextMode = mode) {
  mode = nextMode;
  talk = null;
  world.setAttacker(null);
  if (walker) { walker = null; world.setWalker(null); }
  // ?calm=1 keeps still air, for practicing the flare on its own.
  const conditions = params.has('calm') ? undefined : createConditions(Date.now() % 2147483646);
  // ?hijack=1 starts one a few seconds in, for testing it.
  const emergency = botMode ? null : params.has('hijack') ? createHijack(4) : planEmergency();
  game = createGame(aircraft, { distance, mode, conditions, emergency });
  emergencyBot = createBot();
  world.setAirport('tlv');
  el('cruise').classList.remove('show');
  cruiseLeft = 0;
  world.resetCrash();
  hud.clear();
  bot = botMode ? createBot() : null;
  coach = createCoach();
  input.reset();
  accumulator = 0;
  resultTimer = 0;
  shake = 0;
  screen = 'flying';
  el('title').classList.remove('show');
  el('keybar').classList.add('show');
  el('result').classList.remove('show');
  el('pause').classList.remove('show');
  if (!bot) analytics.event('flight_start', { game_mode: mode, aircraft: aircraft.shortName });
  audio.unlock();
  audio.stopApplause();
  // ?arrive=1 skips straight to the Athens arrival, for testing it.
  if (mode === 'athens' && params.has('arrive')) finishCruise();
  audio.setRunning(true);
}

function showCruise(progress) {
  const start = { x: 372, y: 262 };
  const end = { x: 128, y: 92 };
  const plane = el('map-plane');
  plane.setAttribute('cx', start.x + (end.x - start.x) * progress);
  plane.setAttribute('cy', start.y + (end.y - start.y) * progress);
  const trail = el('map-trail');
  trail.setAttribute('x2', plane.getAttribute('cx'));
  trail.setAttribute('y2', plane.getAttribute('cy'));
  const minutes = Math.ceil((1 - progress) * 80);
  el('cruise-eta').textContent = minutes > 1 ? `Athens in ${minutes} minutes` : 'Beginning descent';
}

function finishCruise() {
  cruiseLeft = 0;
  beginArrival(game);
  world.setAirport('ath');
  el('cruise').classList.remove('show');
  el('cruise-eta').textContent = '';
}

function backToTitle() {
  screen = 'title';
  el('cruise').classList.remove('show');
  if (walker) { walker = null; world.setWalker(null); }
  audio.stopApplause();
  audio.setRunning(false);
  world.resetCrash();
  game = createGame(aircraft, { distance, mode });
  hud.clear();
  el('result').classList.remove('show');
  el('pause').classList.remove('show');
  el('keybar').classList.remove('show');
  el('title').classList.add('show');
  showBest();
}

function setPaused(paused) {
  screen = paused ? 'paused' : 'flying';
  el('pause').classList.toggle('show', paused);
  audio.setRunning(!paused);
}

function showResult(r) {
  screen = 'result';
  audio.stopEngines();
  el('res-head').textContent = r.headline;
  el('res-score').textContent = r.missed ? '' : String(r.score);
  const best = readBest(mode);
  let sub = r.missed ? 'No landing, no score. Going around was the safe call.' : `Grade ${r.grade}`;
  if (coachOn) sub += ' · Coach on';
  if (mode !== 'landing') {
    const minutes = Math.floor(game.time / 60);
    sub += ` · ${minutes}:${String(Math.floor(game.time % 60)).padStart(2, '0')} flight`;
  }
  if (!botMode && !r.missed && !r.failure && r.score > best) {
    writeBest(mode, r.score);
    sub += ' · New best';
  } else if (best) {
    sub += ` · Best ${best}`;
  }
  el('res-sub').textContent = sub;
  el('res-rows').replaceChildren(...r.parts.map((p) => {
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('span');
    name.textContent = p.name;
    const pts = document.createElement('span');
    pts.textContent = p.note ?? (p.of ? `${Math.round(p.points)} / ${p.of}` : String(Math.round(p.points)));
    row.append(name, pts);
    return row;
  }));
  el('result').classList.add('show');
}

function handleEvents() {
  for (const e of game.events) {
    audio.handle(e);
    if (e.type === 'emergency') {
      if (walker) backInSeat();
      audio.handle({ type: 'alarm' });
      bangAt = performance.now();
    }
    if (e.type === 'doorbreak') {
      audio.handle({ type: 'bang' });
      shake = 1;
    }
    if (e.type === 'subdued') {
      audio.handle({ type: 'applause', score: e.score });
    }
    if (e.type === 'settled') {
      endFight();
      seatMessage = 'Cabin secure. Press V to go and check on the passengers.';
      seatMessageUntil = performance.now() + 6000;
    }
    if (e.type === 'cruise') {
      if (walker) backInSeat();
      cruiseLeft = CRUISE_SECONDS;
      showCruise(0);
      el('cruise').classList.add('show');
    }
    if (e.type === 'touchdown') shake = Math.min(1, e.sinkFpm / 500);
    if (e.type === 'tailstrike') shake = 1;
    if (e.type === 'finished') {
      resultTimer = 1.6;
      if (e.result.failure === 'hijacked') {
        endFight();
        world.setAttacker(null);
      }
      if (!bot) {
        const r = e.result;
        const about = { game_mode: mode, aircraft: aircraft.shortName };
        if (game.emergency && game.emergency.stage === 'over') analytics.event('hijack', { ...about, won: game.emergency.won });
        if (r.missed) analytics.event('go_around', about);
        else if (r.failure) analytics.event('crash', { ...about, reason: r.failure });
        else analytics.event('landing', { ...about, score: r.score, coach: coachOn });
      }
      if (!e.result.failure && !e.result.missed) audio.handle({ type: 'applause', score: e.result.score });
      if (EXPLOSIVE.has(e.result.failure)) {
        resultTimer = 4.2;
        shake = 1;
        world.explode(game.s);
        audio.handle({ type: 'explode' });
        const flash = el('flash');
        flash.classList.remove('go');
        void flash.offsetWidth; // restart the animation
        flash.classList.add('go');
      }
    }
  }
  game.events.length = 0;
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Enter') {
    start();
  } else if (screen === 'title' && e.code === 'KeyA') {
    const index = AIRCRAFT.indexOf(aircraft);
    selectAircraft(AIRCRAFT[(index + 1) % AIRCRAFT.length]);
  } else if (e.code === 'KeyM' && screen !== 'flying') {
    backToTitle();
  } else if (screen === 'title' && e.code === 'Digit1') {
    start('landing');
  } else if (screen === 'title' && e.code === 'Digit2') {
    start('full');
  } else if (screen === 'title' && e.code === 'Digit3') {
    start('athens');
  } else if (e.code === 'Space' && game.phase === 'cruise') {
    finishCruise();
  } else if (e.code === 'Escape') {
    if (screen === 'flying') setPaused(true);
    else if (screen === 'paused') setPaused(false);
  } else if (e.code === 'KeyC') {
    world.toggleView();
  } else if (e.code === 'KeyH') {
    setCoach(!coachOn);
  } else if (e.code === 'KeyX' && emergencyActive(game.emergency)) {
    mash(game.emergency);
    if (game.emergency.stage === 'fight') audio.handle({ type: 'hit' });
  } else if (e.code === 'KeyE' && walker && !walker.rising) {
    talkToPassenger();
  } else if (e.code === 'KeyV' && (screen === 'flying' || screen === 'result')) {
    if (walker) backInSeat();
    else leaveSeat();
  } else if (e.code === 'KeyT' && screen === 'flying') {
    const c = game.s.contact;
    if (c.mainL || c.mainR) game.controls.reverse = !game.controls.reverse;
  }
});
document.querySelectorAll('.plane').forEach((b) => {
  b.addEventListener('click', () => selectAircraft(findAircraft(b.dataset.id)));
});
el('mode-landing').addEventListener('click', () => start('landing'));
el('mode-full').addEventListener('click', () => start('full'));
el('mode-athens').addEventListener('click', () => start('athens'));

function autopilot() {
  const c = game.s.contact;
  if (c.mainL || c.mainR || c.nose) {
    game.controls.throttle = 0;
    game.controls.brake = 1;
  } else {
    flyAuto(walkerBot, game);
  }
}

function leaveSeat() {
  if (bot || game.result?.missed) return;
  if (!canLeaveSeat(game)) {
    if (game.s.contact.mainL) seatMessage = 'Stop first, then you can get up';
    else if (nearLanding(game)) seatMessage = 'Landing soon: stay in your seat';
    else seatMessage = 'Too low to leave the seat: the autopilot needs 1,500 ft';
    seatMessageUntil = performance.now() + 2500;
    return;
  }
  walker = createWalker(game.ac);
  walkerBot = createBot();
  input.reset();
  el('result').classList.remove('show');
}

let bangAt = 0;

function endFight() {
  ignoreSwitchesUntil = performance.now() + 1500;
  world.setWalker(null);
  handBack(game);
  input.reset();
  input.discardSwitches();
}

function backInSeat() {
  walker = null;
  world.setWalker(null);
  handBack(game);
  input.reset();
  if (screen === 'result') el('result').classList.add('show');
}

function advance(frameTime) {
  if (screen !== 'flying') return;
  const fighting = emergencyActive(game.emergency);
  if (walker && mustReturn(game)) {
    backInSeat();
    seatMessage = 'Captain to the flight deck: landing soon';
    seatMessageUntil = performance.now() + 4000;
  }
  if (game.phase === 'cruise') {
    cruiseLeft -= frameTime;
    showCruise(1 - Math.max(0, cruiseLeft) / CRUISE_SECONDS);
    if (cruiseLeft <= 0) finishCruise();
    return;
  }
  // People keep hammering for a moment after they win, so X stays dead briefly.
  if (fighting || performance.now() < ignoreSwitchesUntil) input.discardSwitches();
  if (fighting) {
    // the autopilot is flying, below
  } else if (!bot && !walker) input.apply(game, frameTime);
  accumulator += Math.min(frameTime, 0.1);
  while (accumulator >= DT) {
    if (bot) flyAuto(bot, game);
    else if (emergencyActive(game.emergency)) flyAuto(emergencyBot, game);
    else if (walker) autopilot();
    tick(game);
    accumulator -= DT;
  }
  handleEvents();
  if (game.phase === 'finished') {
    resultTimer -= frameTime;
    if (resultTimer <= 0) showResult(game.result);
  }
}

let last = performance.now();
const stats = { frames: 0, since: last, fps: 0 };

function frame(now) {
  const frameTime = (now - last) / 1000;
  last = now;

  advance(frameTime);
  if (talk && (now > talk.until || !walker)) {
    talk = null;
    world.setSpeaker(-1);
  }
  if (talk) world.setSpeaker(talk.index);
  if (walker) {
    stepWalker(walker, input.walkKeys(), Math.min(frameTime, 0.05));
    world.setWalker(walkerPose(walker), mood(game.passengers, game.time));
  }

  shake = Math.max(0, shake - frameTime * 2.2);
  const buffet = game.s.stall > 0 || game.s.alpha > (game.ac.alphaStall - 2) * (Math.PI / 180) ? 0.25 : 0;
  world.update(game, Math.max(shake, buffet), now / 1000);
  const em = game.emergency;
  if (emergencyActive(em) && em.stage === 'aftermath') {
    world.setWalker(fightPose(em, game.ac), 'clapping');
    world.setAttackerDown(fallProgress(em));
    world.update(game, shake, now / 1000);
    hud.drawAftermath();
  } else if (emergencyActive(em) && em.stage === 'fight') {
    world.setWalker(fightPose(em, game.ac), 'scared');
    world.setAttacker(1 - em.meter / 100, now / 1000);
    world.update(game, Math.max(shake, 0.12), now / 1000);
    hud.drawFight(em, fightLeft(em));
  } else if ((game.result && EXPLOSIVE.has(game.result.failure)) || game.phase === 'cruise') {
    hud.clear();
  } else if (walker) {
    const flying = !(game.s.contact.mainL || game.s.contact.mainR || game.s.contact.nose);
    hud.drawWalk(game, rowOf(walker), mood(game.passengers, game.time), flying, '', !!nearestPassenger(walker), talk);
  } else if (screen !== 'title') {
    const showCoach = coachOn && !bot && (screen === 'flying' || screen === 'paused');
    const warning = emergencyActive(em);
    hud.draw(game, world, input.stick(game), showCoach && !warning ? coach.advise(game) : null);
    if (warning) {
      hud.drawWarning();
      if (now - bangAt > 650) {
        bangAt = now;
        audio.handle({ type: 'bang' });
      }
    }
    if (now < seatMessageUntil) hud.banner(seatMessage);
  }
  if (screen === 'flying') audio.update(game);

  stats.frames++;
  if (now - stats.since > 1000) {
    stats.fps = (stats.frames * 1000) / (now - stats.since);
    stats.frames = 0;
    stats.since = now;
  }
  requestAnimationFrame(frame);
}

// Read-only window for the browser checks.
window.__fa = { get game() { return game; }, stats, world };

showAircraft();
showBest();
showCoachState();
if (botMode) start();
requestAnimationFrame(frame);
