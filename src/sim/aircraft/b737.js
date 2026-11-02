// Boeing 737-800 at a typical landing weight, flaps 30, gear down.
//
// Published figures: wing area 124.6 m2, span 35.8 m with winglets, two
// CFM56-7B engines, maximum landing weight about 65.3 t.
// Everything else (aerodynamic derivatives, inertias, gear stiffness) is an
// engineering estimate chosen to reproduce known behavior: Vref near 140 kt,
// about 3 degrees of deck angle on approach, roughly 11 degrees to a tail strike.

export const b737 = {
  id: 'b737',
  name: 'Boeing 737-800',
  shortName: '737',
  blurb: 'Conventional controls. It does what you ask, including stalling.',
  fbw: false,
  mass: 60000, // kg
  inertia: [2.2e6, 5.5e6, 3.4e6], // roll, yaw, pitch; kg m2

  wingArea: 124.6, // m2
  span: 35.8, // m
  chord: 3.96, // m, mean aerodynamic chord

  // Lift, landing configuration
  CL0: 0.89,
  CLalpha: 5.45, // per radian
  alphaStall: 15, // degrees
  stallCLDrop: 0.3, // fraction of CLmax lost well past the stall

  // Flaps change lift, drag and trim. These are the flaps-up values; the fields
  // above and below describe flaps 30. In between is a straight blend.
  clean: { CL0: 0.2, CD0: 0.024, Cm0: 0.075, alphaStall: 14 },
  gearCD: 0.02, // drag from the gear being down
  flapDetents: [0, 0.45, 1], // up, flaps 5, flaps 30
  flapNames: ['UP', '5', '30'],
  rotateKt: 150,
  takeoffTrim: -0.5,
  rotatePitch: 8.5,
  flarePitch: 6.2,
  flareFt: 32,

  // Drag
  CD0: 0.1,
  inducedK: 0.045,

  // Pitch
  Cm0: 0.144,
  CmAlpha: -1.5,
  CmQ: -25,
  CmStick: 0.38, // pitching-moment coefficient per unit of full stick
  CmStall: -1.0, // extra nose-down per radian past the stall
  CmGround: -0.04, // nose-down in ground effect

  // Roll
  ClAileron: 0.042,
  ClRoll: -0.45,
  ClBeta: -0.1,

  // Yaw
  CnBeta: 0.15,
  CnYaw: -0.22,
  CnRudder: 0.08,
  CYBeta: -0.8,

  // Engines: combined figures for both
  thrustMax: 214000, // N, static
  thrustIdle: 6000, // N
  thrustLapse: 0.001, // fractional loss per m/s
  engineY: -2.5, // m below the centre of gravity
  spoolUpSlow: 3.0, // s, slow from near idle
  spoolUpFast: 1.2, // s, once above spoolKnee
  spoolDown: 1.5, // s
  spoolKnee: 0.3,
  reverseEffect: 1.4,
  reverseSpool: 0.55,

  // Spoilers
  spoilerCL: 0.7,
  spoilerCD: 0.1,

  // Gear: body positions relative to the centre of gravity
  gearHeight: 3.7,
  gear: {
    mainL: { pos: [-1.2, -3.7, -2.85], k: 1.1e6, c: 6.5e4 },
    mainR: { pos: [-1.2, -3.7, 2.85], k: 1.1e6, c: 6.5e4 },
    nose: { pos: [14.4, -3.7, 0], k: 3.2e5, c: 3.5e4, steer: 7 },
  },
  rollingMu: 0.015,
  brakeMu: 0.42,
  lateralMu: 0.8,
  bottomOut: 0.55, // m of compression before the strut bottoms out

  // Parts of the airplane that must not touch the ground
  strikePoints: {
    tail: [-19, -0.2, 0],
    leftTip: [-4, 0.8, -17.9],
    rightTip: [-4, 0.8, 17.9],
    leftEngine: [2, -2.95, -5.5],
    rightEngine: [2, -2.95, 5.5],
  },

  eye: [15.6, 1.45, -0.5], // pilot's eye

  // Approach
  approachSpeedKt: 145,
  // Boeing calls out radio altitudes only. "RETARD" is an Airbus callout, so
  // it belongs to the A320 data, not this file.
  callouts: [1000, 500, 100, 50, 40, 30, 20, 10],

  model: { scale: 1, fin: 0x1d4e89, engines: [5.5] },
};
