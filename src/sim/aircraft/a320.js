// Airbus A320-200 at a typical landing weight. Published: wing area 122.6 m2,
// span 35.8 m with sharklets, two CFM56-5B or V2500 engines. The rest are
// engineering estimates tuned to known behavior. What really sets it apart
// from the 737 is `fbw`: the sidestick asks the computers for a maneuver,
// instead of moving the elevators.

export const a320 = {
  id: 'a320',
  name: 'Airbus A320-200',
  shortName: 'A320',
  blurb: 'Fly-by-wire. The computers hold your attitude and refuse to let you stall.',
  fbw: true,
  mass: 60000,
  inertia: [2.1e6, 5.2e6, 3.2e6],

  wingArea: 122.6,
  span: 35.8,
  chord: 4.19,

  CL0: 0.95,
  CLalpha: 5.45,
  alphaStall: 15,
  stallCLDrop: 0.3,

  clean: { CL0: 0.2, CD0: 0.024, Cm0: 0.08, alphaStall: 14 },
  gearCD: 0.02,
  flapDetents: [0, 0.45, 1],
  flapNames: ['UP', '1+F', 'FULL'],
  rotateKt: 145,
  takeoffTrim: -0.5,
  rotatePitch: 8.5,
  flarePitch: 6.6,
  flareFt: 32,

  CD0: 0.1,
  inducedK: 0.045,

  Cm0: 0.16,
  CmAlpha: -1.5,
  CmQ: -25,
  CmStick: 0.38,
  CmStall: -1.0,
  CmGround: -0.04,

  ClAileron: 0.042,
  ClRoll: -0.45,
  ClBeta: -0.1,

  CnBeta: 0.15,
  CnYaw: -0.22,
  CnRudder: 0.08,
  CYBeta: -0.8,

  thrustMax: 236000,
  thrustIdle: 6000,
  thrustLapse: 0.001,
  engineY: -2.4,
  spoolUpSlow: 3.0,
  spoolUpFast: 1.2,
  spoolDown: 1.5,
  spoolKnee: 0.3,
  reverseEffect: 1.4,
  reverseSpool: 0.55,

  spoilerCL: 0.7,
  spoilerCD: 0.1,

  gearHeight: 3.65,
  gear: {
    mainL: { pos: [-1.1, -3.65, -3.8], k: 1.1e6, c: 6.5e4 },
    mainR: { pos: [-1.1, -3.65, 3.8], k: 1.1e6, c: 6.5e4 },
    nose: { pos: [11.5, -3.65, 0], k: 3.2e5, c: 3.5e4, steer: 7 },
  },
  rollingMu: 0.015,
  brakeMu: 0.42,
  lateralMu: 0.8,
  bottomOut: 0.55,

  strikePoints: {
    tail: [-18.5, -0.1, 0],
    leftTip: [-4, 0.9, -17.9],
    rightTip: [-4, 0.9, 17.9],
    leftEngine: [2, -2.8, -5.75],
    rightEngine: [2, -2.8, 5.75],
  },

  eye: [14.2, 1.35, -0.5],

  approachSpeedKt: 140,
  // Airbus tells you when to close the thrust levers, and keeps telling you.
  callouts: [1000, 500, 100, 50, 40, 30, 20, 10],
  retardFt: 20,

  model: { scale: 0.96, fin: 0x9e2b25, sharklets: true, engines: [5.75] },
};
