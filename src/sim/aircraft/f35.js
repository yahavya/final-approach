// Lockheed Martin F-35A. Published: wing area 42.7 m2, span 10.7 m, one F135
// engine, about 191 kN with afterburner. Everything else is an engineering
// estimate for a game: it feels like a fighter, not a certified model.
// Its fly-by-wire lets the nose go anywhere, so loops and rolls are allowed.

export const f35 = {
  id: 'f35',
  name: 'Lockheed Martin F-35A',
  shortName: 'F-35',
  blurb: 'A fighter. Afterburner, a 200°/s roll, loops. Fly it in the Air Show.',
  fbw: true,
  fighter: true,
  passengers: false,
  fbwLaw: { maxPitchRate: 30, maxRollRate: 200, maxG: 9, free: true },
  mass: 20000,
  inertia: [3.5e4, 2.3e5, 2.0e5],

  wingArea: 42.7,
  span: 10.7,
  chord: 4.6,

  CL0: 0.35,
  CLalpha: 4.5,
  alphaStall: 30,
  stallCLDrop: 0.25,

  clean: { CL0: 0.08, CD0: 0.018, Cm0: 0.08, alphaStall: 30 },
  gearCD: 0.015,
  flapDetents: [0, 0.45, 1],
  flapNames: ['UP', 'HALF', 'FULL'],
  rotateKt: 150,
  takeoffTrim: 0,
  rotatePitch: 12,
  flarePitch: 9.5,
  flareFt: 20,

  CD0: 0.045,
  inducedK: 0.14,

  Cm0: 0.34,
  CmAlpha: -1.5,
  CmQ: -18,
  CmStick: 0.38,
  CmStall: -1.0,
  CmGround: -0.03,

  ClAileron: 0.12,
  ClRoll: -0.3,
  ClBeta: -0.06,

  CnBeta: 0.12,
  CnYaw: -0.3,
  CnRudder: 0.06,
  CYBeta: -0.6,

  thrustMax: 191000,
  thrustIdle: 4000,
  thrustLapse: 0.0004,
  engineY: 0,
  spoolUpSlow: 1.4,
  spoolUpFast: 0.6,
  spoolDown: 0.8,
  spoolKnee: 0.25,
  reverseEffect: 0, // no thrust reversers
  reverseSpool: 0,

  spoilerCL: 0.2,
  spoilerCD: 0.06,

  gearHeight: 2.0,
  gear: {
    mainL: { pos: [-1.0, -2.0, -1.8], k: 4.5e5, c: 3.2e4 },
    mainR: { pos: [-1.0, -2.0, 1.8], k: 4.5e5, c: 3.2e4 },
    nose: { pos: [5.5, -2.0, 0], k: 1.6e5, c: 1.4e4, steer: 9 },
  },
  rollingMu: 0.015,
  brakeMu: 0.45,
  lateralMu: 0.8,
  bottomOut: 0.4,

  strikePoints: {
    tail: [-7.6, -0.05, 0],
    leftTip: [-3.5, -0.3, -5.35],
    rightTip: [-3.5, -0.3, 5.35],
    leftEngine: [-7, -0.42, -0.4], // the nozzle: about 15° of clearance on the main wheels
    rightEngine: [-7, -0.42, 0.4],
  },

  eye: [5.4, 1.15, 0],

  approachSpeedKt: 150,
  callouts: [1000, 500, 100, 50, 40, 30, 20, 10],

  model: { kind: 'fighter', scale: 1, fin: 0x5f666e, engines: [] },
};
