// Small vector and quaternion helpers. Vectors are [x, y, z]; quaternions are [w, x, y, z].
//
// World frame (runway frame): origin at the runway 12 threshold, +x down the
// runway, +y up, +z to the right of the landing direction.
// Body frame: +x nose, +y up, +z right wing. Identity attitude = wings level,
// nose pointing down the runway.
//
// Consequences of that right-handed frame, worth remembering:
//   rate about +x > 0 : roll right
//   rate about +y > 0 : yaw LEFT
//   rate about +z > 0 : pitch up

export const DEG = Math.PI / 180;
export const KT = 0.514444; // metres per second in one knot
export const FT = 0.3048; // metres in one foot
export const FPM = 0.00508; // metres per second in one foot per minute

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a) => Math.sqrt(dot(a, a));
export const normalize = (a) => {
  const l = length(a);
  return l > 1e-9 ? scale(a, 1 / l) : [0, 0, 0];
};

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (lo, hi, v) => {
  const t = clamp((v - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
};

export const qMul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];

export const qNormalize = (q) => {
  const l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};

export const qAxis = (axis, angle) => {
  const s = Math.sin(angle / 2);
  return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s];
};

/** Rotate v from body to world. */
export const qRotate = (q, v) => {
  const u = [q[1], q[2], q[3]];
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, q[0])), cross(u, t));
};

/** Rotate v from world to body. */
export const qRotateInv = (q, v) => qRotate([q[0], -q[1], -q[2], -q[3]], v);

/** Pitch (up +), bank (right +) and heading offset (right +), in radians. */
export const eulerFrom = (q) => {
  const nose = qRotate(q, [1, 0, 0]);
  const wing = qRotate(q, [0, 0, 1]);
  const up = qRotate(q, [0, 1, 0]);
  return {
    pitch: Math.asin(clamp(nose[1], -1, 1)),
    bank: Math.asin(clamp(-wing[1], -1, 1)),
    roll: Math.atan2(-wing[1], up[1]), // full circle: +-180 when upside down
    heading: Math.atan2(nose[2], nose[0]),
  };
};
