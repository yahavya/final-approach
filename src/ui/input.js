// Keyboard to flight controls. Keys are on or off, so each axis ramps up while
// held and springs back when released, which makes tapping feel like small
// movements of a real control. Small movements are also softened by an expo curve.

import { clamp, DEG, eulerFrom, FT } from '../sim/math.js';
import { wheelHeight } from '../sim/gear.js';

const RAMP = { elevator: 1.1, aileron: 1.8, rudder: 1.6 };
const RETURN = 4.5;
const THRUST_RATE = 0.4; // lever per second
const TRIM_RATE = 0.16; // how quickly held pitch input is trimmed away
const TRIM_FLOOR_FT = 60; // hand flying only below this
const HOLD_TRIM = 0.05; // with the stick centered, trim stops the nose drifting
const GROUND_RUDDER_MS = 14; // metres per second, about 27 kt
const TAKEOFF_RUDDER_MS = 34; // more on the takeoff roll, to hold the centerline
const FEEL_KT_MS = 80; // above this speed the controls get heavier

// A key is all or nothing, and full stick is far too much for a flare. So close
// to the ground, holding the pull key means "ease the nose up to the landing
// attitude", and the nose stays there however long you hold, or after you let go.
const FLARE_ASSIST_FT = 200;
const FLARE_RATE = 3.2; // degrees per second
const ROTATE_ASSIST_MS = 57; // about 110 kt

const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

const SWITCHES = new Set(['KeyG', 'KeyZ', 'KeyX']);

const expo = (v, power) => Math.sign(v) * Math.abs(v) ** power;

export function createInput(target = window) {
  const down = new Set();
  const axis = { elevator: 0, aileron: 0, rudder: 0 };

  const presses = [];

  target.addEventListener('keydown', (e) => {
    down.add(e.code);
    if (!e.repeat && SWITCHES.has(e.code)) presses.push(e.code);
    if (GAME_KEYS.has(e.code)) e.preventDefault();
  });
  target.addEventListener('keyup', (e) => down.delete(e.code));
  target.addEventListener('blur', () => down.clear());

  const pair = (positive, negative) => (down.has(positive) ? 1 : 0) - (down.has(negative) ? 1 : 0);

  const move = (name, target, dt) => {
    const v = axis[name];
    const rate = target === 0 || Math.sign(target) !== Math.sign(v) ? RETURN : RAMP[name];
    const step = rate * dt;
    axis[name] = Math.abs(target - v) <= step ? target : v + Math.sign(target - v) * step;
  };

  const flare = { active: false, target: 0, integral: 0 };

  function flareAssist(g, dt) {
    const s = g.s;
    const takeoff = g.phase === 'takeoff';
    const onGround = (s.contact.mainL || s.contact.mainR) && !(takeoff && s.V > ROTATE_ASSIST_MS);
    const near = wheelHeight(s, g.ac) / FT < (g.ac.flareAssistFt ?? FLARE_ASSIST_FT);
    const pulling = down.has('ArrowDown');
    const landing = takeoff || s.vel[1] < 0 || flare.active;
    if (!near || !landing || onGround || down.has('ArrowUp') || (!pulling && !flare.active)) {
      flare.active = false;
      return;
    }
    const pitch = eulerFrom(s.q).pitch / DEG;
    if (!flare.active) {
      flare.active = true;
      flare.target = pitch;
      flare.integral = 0;
    }
    // Letting go holds the nose where it is, so an early release can't drop it.
    const limit = takeoff ? g.ac.rotatePitch : g.ac.flarePitch;
    if (pulling && flare.target < limit) {
      flare.target = Math.min(limit, flare.target + FLARE_RATE * dt);
    }
    const error = flare.target - pitch;
    flare.integral = clamp(flare.integral + error * 0.05 * dt, -0.2, 0.4);
    if (g.ac.fbw && !onGround) {
      // Fly-by-wire: the stick asks for a pitch rate, and the computers do the rest.
      g.controls.elevator = clamp(error * 0.4, -0.5, 0.8);
      return;
    }
    const pull = error * (takeoff ? 0.5 : 0.14) - (s.w[2] / DEG) * 0.09 + flare.integral;
    g.controls.elevator = clamp(pull, -0.3, takeoff ? 1 : 0.8);
  }

  return {
    reset() {
      axis.elevator = axis.aileron = axis.rudder = 0;
      flare.active = false;
    },

    apply(g, dt) {
      const c = g.controls;
      move('elevator', pair('ArrowDown', 'ArrowUp'), dt);
      move('aileron', pair('ArrowRight', 'ArrowLeft'), dt);
      move('rudder', pair('KeyE', 'KeyQ'), dt);

      // Controls bite harder with speed, so give the same feel at any speed.
      const feel = g.ac.fbw ? 1 : Math.min(1, FEEL_KT_MS / Math.max(g.s.V, 1));
      c.elevator = expo(axis.elevator, 1.7) * feel * feel;
      flareAssist(g, dt);
      c.aileron = expo(axis.aileron, 1.4) * feel;
      // Full rudder at 120 kt on the ground would fishtail the airplane.
      const rolling = g.s.contact.mainL || g.s.contact.mainR;
      const limit = g.phase === 'takeoff' ? TAKEOFF_RUDDER_MS : GROUND_RUDDER_MS;
      const grip = rolling ? Math.min(1, limit / Math.max(g.s.V, 1)) : 1;
      c.rudder = expo(axis.rudder, 1.3) * grip;
      c.throttle = clamp(c.throttle + pair('KeyR', 'KeyF') * THRUST_RATE * dt, 0, 1);
      c.brake = down.has('Space') ? 1 : 0;

      // On a keyboard you can't hold a little back pressure for a minute, so
      // sustained pitch input is slowly trimmed away. Never in the flare.
      if (!g.ac.fbw && wheelHeight(g.s, g.ac) / FT > TRIM_FLOOR_FT) {
        const hold = axis.elevator === 0 ? -(g.s.w[2] / DEG) * HOLD_TRIM : 0;
        c.trim = clamp(c.trim + (c.elevator * TRIM_RATE + hold) * dt, -1, 1);
      }

      for (const code of presses.splice(0)) {
        if (code === 'KeyG') c.gearDown = !c.gearDown;
        const detents = g.ac.flapDetents;
        const index = detents.indexOf(c.flap);
        if (code === 'KeyX') c.flap = detents[Math.min(detents.length - 1, index + 1)];
        if (code === 'KeyZ') c.flap = detents[Math.max(0, index - 1)];
      }
    },

    /** Drops queued switch presses, so hammering X in a fight can't move the flaps. */
    discardSwitches() {
      presses.length = 0;
    },

    /** Walking uses the same keys. */
    walkKeys() {
      return {
        forward: down.has('ArrowUp') || down.has('KeyW'),
        back: down.has('ArrowDown') || down.has('KeyS'),
        left: down.has('ArrowLeft') || down.has('KeyA'),
        right: down.has('ArrowRight') || down.has('KeyD'),
        use: down.has('KeyE'),
      };
    },

    stick(g) {
      return { x: g.controls.aileron, y: g.controls.elevator };
    },
  };
}
