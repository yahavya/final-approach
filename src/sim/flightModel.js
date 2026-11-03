// Rigid-body flight model. No graphics in here: state goes in, state comes out.

import {
  add, clamp, cross, sub, DEG, dot, length, lerp, normalize, qMul, qNormalize, qRotate,
  qRotateInv, scale, smoothstep,
} from './math.js';
import { gearForces } from './gear.js';

export const GRAVITY = 9.81;
export const RHO = 1.2; // sea-level air density, close enough for an approach
export const DT = 1 / 120;
export const SPEED_OF_SOUND = 340; // m/s at sea level

/** Values that depend on flap position, from 0 (up) to 1 (flaps 30). */
export function flapValues(ac, flap) {
  return {
    CL0: lerp(ac.clean.CL0, ac.CL0, flap),
    Cm0: lerp(ac.clean.Cm0, ac.Cm0, flap),
    alphaStall: lerp(ac.clean.alphaStall, ac.alphaStall, flap),
    // ac.CD0 includes the gear, so the clean figure is blended against that.
    CD0: lerp(ac.clean.CD0, ac.CD0 - ac.gearCD, flap),
  };
}

/** Lift coefficient for angle of attack alpha (radians), with a real stall break. */
export function liftCoefficient(ac, alpha, flap = 1) {
  const f = flapValues(ac, flap);
  const stall = f.alphaStall * DEG;
  const clMax = f.CL0 + ac.CLalpha * stall;
  if (alpha <= stall - 2 * DEG) return f.CL0 + ac.CLalpha * alpha;
  if (alpha <= stall) {
    // Round off the last two degrees so the peak isn't a sharp corner.
    const t = (alpha - (stall - 2 * DEG)) / (2 * DEG);
    const start = f.CL0 + ac.CLalpha * (stall - 2 * DEG);
    return lerp(start, clMax, t * (2 - t));
  }
  const drop = smoothstep(stall, stall + 10 * DEG, alpha);
  const post = clMax * (1 - ac.stallCLDrop * drop);
  return alpha < 45 * DEG ? post : post * Math.max(0, Math.cos(2 * (alpha - 45 * DEG)));
}

export const stallSpeed = (ac, flap = 1) => {
  const f = flapValues(ac, flap);
  const clMax = f.CL0 + ac.CLalpha * f.alphaStall * DEG;
  return Math.sqrt((2 * ac.mass * GRAVITY) / (RHO * ac.wingArea * clMax));
};

export function thrustAvailable(ac, V) {
  return ac.thrustMax * (1 - ac.thrustLapse * V);
}

function netThrust(s, ac, V) {
  const t = ac.thrustIdle + (thrustAvailable(ac, V) - ac.thrustIdle) * s.spool;
  return t * (1 - ac.reverseEffect * s.rev);
}

/** Aerodynamic and engine force and moment in the body frame, plus useful readings. */
export function aeroForces(s, ac, c) {
  const vb = qRotateInv(s.q, sub(s.vel, s.wind)); // the wings only feel the moving air
  const V = length(vb);
  const out = { force: [0, 0, 0], moment: [0, 0, 0], V, alpha: 0, beta: 0, cl: 0, stall: 0 };
  const thrust = netThrust(s, ac, V);
  out.force[0] = thrust;
  out.moment[2] = thrust * -ac.engineY;
  if (V < 1) return out;

  const alpha = Math.atan2(-vb[1], vb[0]);
  const beta = Math.atan2(vb[2], vb[0]);
  const dyn = 0.5 * RHO * V * V;
  const qS = dyn * ac.wingArea;

  const h = Math.max(0, s.pos[1] - ac.gearHeight);
  const ground = Math.exp(-h / (0.35 * ac.span));

  const flaps = flapValues(ac, s.flap);
  const past = Math.max(0, alpha - flaps.alphaStall * DEG);
  let cl = liftCoefficient(ac, alpha, s.flap) * (1 + 0.08 * ground) - ac.spoilerCL * s.spoilers;
  cl = Math.max(cl, -1);
  // Near the speed of sound, drag climbs steeply. Only the fighter gets there.
  const mach = V / SPEED_OF_SOUND;
  const wave = mach > 0.9 ? 6 * (mach - 0.9) ** 2 : 0;
  const cd = flaps.CD0 + wave + ac.gearCD * s.gearDown + ac.inducedK * cl * cl * (1 - 0.5 * ground)
    + ac.spoilerCD * s.spoilers + 0.6 * past;

  const vHat = scale(vb, 1 / V);
  const liftDir = normalize(cross([0, 0, 1], vHat));
  const force = add(scale(liftDir, cl * qS), scale(vHat, -cd * qS));
  force[2] += qS * ac.CYBeta * beta;
  force[0] += thrust;

  const [roll, yaw, pitch] = s.w;
  const rollHat = (roll * ac.span) / (2 * V);
  const yawHat = (yaw * ac.span) / (2 * V);
  const pitchHat = (pitch * ac.chord) / (2 * V);

  // A wing drops at the stall. It alternates slowly, so it is a handful, not a coin flip.
  const wingDrop = past > 0 ? clamp(past / (5 * DEG), 0, 1) * 0.02 * Math.sin(s.t * 0.9 + 1) : 0;

  const cm = flaps.Cm0 + ac.CmAlpha * alpha + ac.CmQ * pitchHat
    + ac.CmStick * (c.elevator + c.trim) + ac.CmStall * past + ac.CmGround * ground;
  const clRoll = ac.ClAileron * c.aileron + ac.ClRoll * rollHat + ac.ClBeta * beta + wingDrop;
  // Moment about +y yaws the nose left, so the stabilizing terms are negative of the usual.
  const cn = -ac.CnBeta * beta + ac.CnYaw * yawHat - ac.CnRudder * c.rudder;

  out.force = force;
  out.moment = [qS * ac.span * clRoll, qS * ac.span * cn, qS * ac.chord * cm + thrust * -ac.engineY];
  out.alpha = alpha;
  out.beta = beta;
  out.cl = cl;
  out.stall = past;
  return out;
}

export function createState(pos, vel, q, spool) {
  return {
    pos: [...pos], vel: [...vel], q: [...q], w: [0, 0, 0],
    spool, rev: 0, spoilers: 0, t: 0,
    flap: 1, gearDown: 1, wind: [0, 0, 0],
    alpha: 0, beta: 0, V: length(vel), stall: 0,
    contact: { mainL: false, mainR: false, nose: false, load: 0 },
  };
}

function updateEngine(s, ac, c, dt) {
  const target = s.rev > 0.05 || c.reverse ? ac.reverseSpool : c.throttle;
  let tau = ac.spoolDown;
  if (target > s.spool) tau = s.spool < ac.spoolKnee ? ac.spoolUpSlow : ac.spoolUpFast;
  s.spool += (target - s.spool) * (1 - Math.exp(-dt / tau));
  const revTarget = c.reverse ? 1 : 0;
  s.rev = clamp(s.rev + Math.sign(revTarget - s.rev) * dt * 0.5, 0, 1);
}

/** Advance the airplane one fixed step. */
export function step(s, ac, c, dt = DT) {
  updateEngine(s, ac, c, dt);
  s.spoilers = clamp(s.spoilers + (c.spoilers ? 1 : -1) * dt * 1.2, 0, 1);
  const flapStep = 0.2 * dt;
  s.flap += clamp(c.flap - s.flap, -flapStep, flapStep);
  s.gearDown = clamp(s.gearDown + (c.gearDown ? 1 : -1) * dt * 0.16, 0, 1);

  const a = aeroForces(s, ac, c);
  const g = gearForces(s, ac, c);

  const worldForce = add(add(qRotate(s.q, a.force), g.force), [0, -ac.mass * GRAVITY, 0]);
  s.vel = add(s.vel, scale(worldForce, dt / ac.mass));
  s.pos = add(s.pos, scale(s.vel, dt));

  const I = ac.inertia;
  const M = add(a.moment, g.moment);
  const Iw = [I[0] * s.w[0], I[1] * s.w[1], I[2] * s.w[2]];
  const gyro = cross(s.w, Iw);
  s.w = [
    s.w[0] + ((M[0] - gyro[0]) / I[0]) * dt,
    s.w[1] + ((M[1] - gyro[1]) / I[1]) * dt,
    s.w[2] + ((M[2] - gyro[2]) / I[2]) * dt,
  ];
  s.q = qNormalize(add4(s.q, scale4(qMul(s.q, [0, ...s.w]), dt / 2)));

  s.t += dt;
  s.V = a.V;
  s.alpha = a.alpha;
  s.beta = a.beta;
  s.stall = a.stall;
  s.contact = g.contact;
}

const add4 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
const scale4 = (a, k) => [a[0] * k, a[1] * k, a[2] * k, a[3] * k];

/**
 * Steady flight at speed V (m/s) on flight-path angle gamma (radians).
 * Returns the angle of attack, the thrust lever setting and the stick trim
 * that make every force and moment balance.
 */
export function solveTrim(ac, V, gamma, flap = 1, gearDown = 1) {
  const f = flapValues(ac, flap);
  const W = ac.mass * GRAVITY;
  const qS = 0.5 * RHO * V * V * ac.wingArea;
  let alpha = 5 * DEG;
  let T = 50000;
  for (let i = 0; i < 12; i++) {
    const cl = (W * Math.cos(gamma) - T * Math.sin(alpha)) / qS;
    alpha = (cl - f.CL0) / ac.CLalpha;
    const cd = f.CD0 + ac.gearCD * gearDown + ac.inducedK * cl * cl;
    T = (cd * qS + W * Math.sin(gamma)) / Math.cos(alpha);
  }
  const lever = (T - ac.thrustIdle) / (thrustAvailable(ac, V) - ac.thrustIdle);
  const qSc = qS * ac.chord;
  const trim = -(f.Cm0 + ac.CmAlpha * alpha + (T * -ac.engineY) / qSc) / ac.CmStick;
  return { alpha, lever: clamp(lever, 0, 1), trim, thrust: T };
}

export { dot };
