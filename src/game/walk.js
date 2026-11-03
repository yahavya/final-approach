// Getting out of the seat and walking through the airplane. Pure logic: it reads
// which keys are down and produces a camera pose in the body frame.

import { clamp, lerp, smoothstep } from '../sim/math.js?v=e179301';
import { cabinLayout, floorAt } from './cabinLayout.js?v=e179301';

const RISE_SECONDS = 1.7;
const EYE_HEIGHT = 1.6;
const WALK_SPEED = 2.2; // metres per second
const TURN_SPEED = 2.1; // radians per second

export function createWalker(ac) {
  const l = cabinLayout(ac);
  return { l, t: 0, rising: true, x: ac.eye[0] - 1.3, z: 0, yaw: Math.PI, eye: ac.eye };
}

/** Moves the walker. keys has forward, back, left and right as booleans. */
export function stepWalker(w, keys, dt) {
  const l = w.l;
  if (w.rising) {
    w.t += dt / RISE_SECONDS;
    if (w.t >= 1) w.rising = false;
    return;
  }
  w.yaw += ((keys.left ? 1 : 0) - (keys.right ? 1 : 0)) * TURN_SPEED * dt;
  const step = ((keys.forward ? 1 : 0) - (keys.back ? 1 : 0)) * WALK_SPEED * dt;
  let x = w.x + Math.cos(w.yaw) * step;
  let z = w.z - Math.sin(w.yaw) * step;

  x = clamp(x, l.rearX + 0.5, w.eye[0] - 0.9);
  const inRows = x < l.frontRowX + 0.4;
  const onAisle = Math.abs(w.z - l.aisle) < 0.3;
  if (inRows && !onAisle) x = Math.max(x, w.x); // seats in the way: find the aisle
  z = inRows ? clamp(z, l.aisle - 0.26, l.aisle + 0.26) : clamp(z, -l.halfWidth * 0.5, l.halfWidth * 0.5);
  w.x = x;
  w.z = z;
}

/** Camera pose in the body frame: position, yaw and a little head bob. */
export function walkerPose(w) {
  const l = w.l;
  const standY = floorAt(l, w.x) + EYE_HEIGHT;
  if (w.rising) {
    const up = smoothstep(0, 0.45, w.t);
    const turn = smoothstep(0.25, 1, w.t);
    return {
      x: lerp(w.eye[0], w.x, smoothstep(0.2, 1, w.t)),
      y: lerp(w.eye[1], standY, up),
      z: lerp(w.eye[2], w.z, turn),
      yaw: lerp(0, w.yaw, turn),
    };
  }
  return { x: w.x, y: standY, z: w.z, yaw: w.yaw };
}

/** The row you're standing beside, or null at the front or back. */
export function rowOf(w) {
  const r = Math.round((w.l.frontRowX - w.x) / w.l.rowPitch);
  return r >= 0 && r < w.l.rows ? r + 1 : null;
}
