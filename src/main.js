// Wires the simulation to the screen: fixed-step physics, then one render per frame.

import { AIRCRAFT, findAircraft } from './sim/aircraft/index.js';
import { DT } from './sim/flightModel.js';
import { createGame, tick } from './game/scenario.js';
import { createBot } from './game/bot.js';
import { canLeaveSeat, flyAuto, handBack, mustReturn } from './game/autopilot.js';
import { createWalker, rowOf, stepWalker, walkerPose } from './game/walk.js';
import { mood } from './game/passengers.js';
import { createCoach } from './game/coach.js';
import { createConditions } from './game/conditions.js';
import { EXPLOSIVE } from './game/scoring.js';
import { createWorld } from './world/scene.js';
import { createHud } from './ui/hud.js';
import { createAudio } from './ui/audio.js';
import { createInput } from './ui/input.js';
import { createAnalytics } from './ui/analytics.js';

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
const analytics = createAnalytics();

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
let mode = params.get('mode') === 'full' ? 'full' : 'landing';
let game = createGame(aircraft, { distance, mode });
let bot = botMode ? createBot() : null;
let screen = 'title'; // title, flying, paused, result
let accumulator = 0;
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
  const landing = readBest('landing');
  const full = readBest('full');
  el('best-landing').textContent = landing ? `Best ${landing}` : '';
  el('best-full').textContent = full ? `Best ${full}` : '';
}

function start(nextMode = mode) {
  mode = nextMode;
  if (walker) { walker = null; world.setWalker(null); }
  // ?calm=1 keeps still air, for practicing the flare on its own.
  const conditions = params.has('calm') ? undefined : createConditions(Date.now() % 2147483646);
  game = createGame(aircraft, { distance, mode, conditions });
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
  analytics.setOnTitle(false);
  el('keybar').classList.add('show');
  el('result').classList.remove('show');
  el('pause').classList.remove('show');
  if (!bot) analytics.event('flight_start', { game_mode: mode, aircraft: aircraft.shortName });
  audio.unlock();
  audio.stopApplause();
  audio.setRunning(true);
}

function backToTitle() {
  screen = 'title';
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
  analytics.setOnTitle(true);
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
  if (mode === 'full') {
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
    if (e.type === 'touchdown') shake = Math.min(1, e.sinkFpm / 500);
    if (e.type === 'tailstrike') shake = 1;
    if (e.type === 'finished') {
      resultTimer = 1.6;
      if (!bot) {
        const r = e.result;
        const about = { game_mode: mode, aircraft: aircraft.shortName };
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
  } else if (e.code === 'Escape') {
    if (screen === 'flying') setPaused(true);
    else if (screen === 'paused') setPaused(false);
  } else if (e.code === 'KeyC') {
    world.toggleView();
  } else if (e.code === 'KeyH') {
    setCoach(!coachOn);
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
    seatMessage = game.s.contact.mainL ? 'Stop first, then you can get up' : 'Too low to leave the seat: the autopilot needs 1,500 ft';
    seatMessageUntil = performance.now() + 2500;
    return;
  }
  walker = createWalker(game.ac);
  walkerBot = createBot();
  input.reset();
  el('result').classList.remove('show');
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
  if (walker && mustReturn(game)) {
    backInSeat();
    seatMessage = 'Captain to the flight deck: landing soon';
    seatMessageUntil = performance.now() + 4000;
  }
  if (!bot && !walker) input.apply(game, frameTime);
  accumulator += Math.min(frameTime, 0.1);
  while (accumulator >= DT) {
    if (bot) flyAuto(bot, game);
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
  if (walker) {
    stepWalker(walker, input.walkKeys(), Math.min(frameTime, 0.05));
    world.setWalker(walkerPose(walker), mood(game.passengers, game.time));
  }

  shake = Math.max(0, shake - frameTime * 2.2);
  const buffet = game.s.stall > 0 || game.s.alpha > (game.ac.alphaStall - 2) * (Math.PI / 180) ? 0.25 : 0;
  world.update(game, Math.max(shake, buffet), now / 1000);
  if (game.result && EXPLOSIVE.has(game.result.failure)) {
    hud.clear();
  } else if (walker) {
    const flying = !(game.s.contact.mainL || game.s.contact.mainR || game.s.contact.nose);
    hud.drawWalk(game, rowOf(walker), mood(game.passengers, game.time), flying, '');
  } else if (screen !== 'title') {
    const showCoach = coachOn && !bot && (screen === 'flying' || screen === 'paused');
    hud.draw(game, world, input.stick(game), showCoach ? coach.advise(game) : null);
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
