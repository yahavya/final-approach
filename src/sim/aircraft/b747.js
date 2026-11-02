// Boeing 747-400 at a typical landing weight. Published: wing area 525 m2,
// span 64.4 m, four engines. The rest are engineering estimates tuned to known
// behavior. Conventional controls, like the 737, but four times the mass, so
// everything happens slowly and must be started early.

export const b747 = {
  id: 'b747',
  name: 'Boeing 747-400',
  shortName: '747',
  blurb: 'The Queen. 250 tonnes, a cockpit three stories up, and slow to answer.',
  fbw: false,
  mass: 250000,
  inertia: [1.8e7, 5.0e7, 3.3e7],

  wingArea: 525,
  span: 64.4,
  chord: 8.3,

  CL0: 0.7,
  CLalpha: 5.45,
  alphaStall: 15,
  stallCLDrop: 0.3,

  clean: { CL0: 0.2, CD0: 0.022, Cm0: 0.075, alphaStall: 14 },
  gearCD: 0.02,
  flapDetents: [0, 0.45, 1],
  flapNames: ['UP', '10', '30'],
  rotateKt: 160,
  takeoffTrim: -0.5,
  rotatePitch: 9,
  flarePitch: 5.6,
  flareFt: 46,

  CD0: 0.095,
  inducedK: 0.04,

  Cm0: 0.144,
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

  thrustMax: 1000000,
  thrustIdle: 24000,
  thrustLapse: 0.001,
  engineY: -3.2,
  spoolUpSlow: 3.5,
  spoolUpFast: 1.5,
  spoolDown: 1.8,
  spoolKnee: 0.3,
  reverseEffect: 1.4,
  reverseSpool: 0.55,

  spoilerCL: 0.7,
  spoilerCD: 0.1,

  gearHeight: 5.4,
  gear: {
    mainL: { pos: [-1.6, -5.4, -5.5], k: 4.6e6, c: 2.7e5 },
    mainR: { pos: [-1.6, -5.4, 5.5], k: 4.6e6, c: 2.7e5 },
    nose: { pos: [24.5, -5.4, 0], k: 1.3e6, c: 1.4e5, steer: 7 },
  },
  rollingMu: 0.015,
  brakeMu: 0.42,
  lateralMu: 0.8,
  bottomOut: 0.65,

  strikePoints: {
    tail: [-38, 2.7, 0],
    leftTip: [-9, 1.8, -32.2],
    rightTip: [-9, 1.8, 32.2],
    leftEngine: [4, -4.0, -11.7],
    rightEngine: [4, -4.0, 11.7],
  },

  eye: [31, 3.5, -0.6],

  approachSpeedKt: 155,
  callouts: [1000, 500, 100, 50, 40, 30, 20, 10],

  model: { scale: 1.8, fin: 0x1d3f6e, hump: true, engines: [6.5, 11.7] },
};
