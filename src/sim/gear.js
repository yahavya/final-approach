// Landing gear: spring-damper struts plus rolling, braking and sideways tire friction.

import { add, clamp, cross, DEG, qRotate, qRotateInv, scale } from './math.js';

const sat = (v, band = 0.5) => clamp(v / band, -1, 1);

/** Gear forces, as a world-frame force and a body-frame moment. */
export function gearForces(s, ac, c) {
  let force = [0, 0, 0];
  let moment = [0, 0, 0];
  const contact = { mainL: false, mainR: false, nose: false, load: 0 };

  if (s.gearDown < 0.95) return { force, moment, contact }; // retracted or in transit

  const nose = qRotate(s.q, [1, 0, 0]);
  const headingLen = Math.hypot(nose[0], nose[2]) || 1;
  const fwd = [nose[0] / headingLen, 0, nose[2] / headingLen];
  const right = [-fwd[2], 0, fwd[0]];

  for (const [name, g] of Object.entries(ac.gear)) {
    const r = qRotate(s.q, g.pos);
    const y = s.pos[1] + r[1];
    if (y >= 0) continue;

    const worldRate = qRotate(s.q, s.w);
    const v = add(s.vel, cross(worldRate, r));
    const depth = -y;

    let N = g.k * depth - g.c * v[1];
    if (depth > ac.bottomOut) N += 12 * g.k * (depth - ac.bottomOut);
    N = Math.max(0, N);
    contact[name] = true;
    contact.load += N;

    // Wheel axes. The nose wheel steers with the pedals.
    let wf = fwd;
    let wr = right;
    if (g.steer) {
      // Steering authority fades with speed, as on the real thing.
      const authority = Math.min(1, 12 / Math.max(Math.hypot(s.vel[0], s.vel[2]), 1));
      const a = -c.rudder * g.steer * DEG * authority;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      wf = [fwd[0] * ca - right[0] * sa, 0, fwd[2] * ca - right[2] * sa];
      wr = [-wf[2], 0, wf[0]];
    }
    const vLong = v[0] * wf[0] + v[2] * wf[2];
    const vLat = v[0] * wr[0] + v[2] * wr[2];

    const brake = g.steer ? 0 : c.brake;
    const fLong = -(ac.rollingMu + brake * ac.brakeMu) * N * sat(vLong);
    // Tires build side force with slip angle, and much less of it at speed.
    // Without this, touching down crabbed in a crosswind flips the airplane.
    const speed = Math.hypot(v[0], v[2]);
    const sideGrip = ac.lateralMu * clamp(18 / Math.max(speed, 1), 0.3, 1);
    const fLat = -sideGrip * N * sat(vLat, Math.max(0.5, speed * 0.14));

    const f = [
      wf[0] * fLong + wr[0] * fLat,
      N,
      wf[2] * fLong + wr[2] * fLat,
    ];
    force = add(force, f);

    const pivot = [r[0], -s.pos[1], r[2]]; // the tire patch, at ground level
    moment = add(moment, qRotateInv(s.q, cross(pivot, f)));
  }
  return { force, moment, contact };
}

/** Names of the structural parts currently below ground level. */
export function strikes(s, ac) {
  const hits = [];
  for (const [name, p] of Object.entries(ac.strikePoints)) {
    const y = s.pos[1] + qRotate(s.q, p)[1];
    if (y < 0) hits.push(name);
  }
  return hits;
}

/** Height of the lowest main wheel above the ground, in metres. */
export function wheelHeight(s, ac) {
  const l = s.pos[1] + qRotate(s.q, ac.gear.mainL.pos)[1];
  const r = s.pos[1] + qRotate(s.q, ac.gear.mainR.pos)[1];
  return Math.min(l, r);
}

export { scale };
