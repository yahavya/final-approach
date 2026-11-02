// The inside of the airplane: flight deck, cabin and passengers, built in the
// body frame. The windows are real gaps in the walls, so the world, and your
// own wing, are outside them.

import * as THREE from 'three';
import { cabinLayout } from '../game/cabinLayout.js';

const lit = (color, glow = 0.6) => new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: glow, side: THREE.DoubleSide });

function box(parent, material, x0, x1, y0, y1, z0, z1) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), material);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  parent.add(m);
  return m;
}

function displayTexture(colors) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#05080c';
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = colors[0];
  x.fillRect(20, 20, 216, 108);
  x.fillStyle = colors[1];
  x.fillRect(20, 128, 216, 108);
  x.strokeStyle = '#7dffa0';
  x.lineWidth = 3;
  x.strokeRect(70, 120, 116, 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildFlightDeck(g, ac, l) {
  const panel = lit(0x2a2f36, 0.5);
  const dark = lit(0x171a1f, 0.5);
  const seat = lit(0x39414d, 0.5);
  const [ex, ey] = ac.eye;
  const w = 1.5;
  const front = ex + 1.25;

  box(g, lit(0x3a3f47, 0.45), l.doorX, front, l.deckFloor - 0.05, l.deckFloor, -w, w);
  box(g, panel, front - 0.5, front, l.deckFloor, ey - 0.36, -w, w); // instrument panel
  box(g, dark, front - 0.72, front - 0.5, ey - 0.42, ey - 0.3, -w, w); // glareshield
  box(g, dark, ex - 0.3, front - 0.5, l.deckFloor, l.deckFloor + 0.75, -0.2, 0.2); // pedestal
  box(g, lit(0x4b5159, 0.55), l.doorX, front, ey + 0.72, ey + 0.8, -w, w); // ceiling
  for (const side of [-1, 1]) {
    box(g, panel, l.doorX, front, l.deckFloor, ey - 0.25, side * w, side * (w + 0.06));
    box(g, panel, l.doorX, front, ey + 0.45, ey + 0.72, side * w, side * (w + 0.06));
    box(g, dark, l.doorX + 0.6, l.doorX + 0.74, ey - 0.25, ey + 0.45, side * w, side * (w + 0.06));
    box(g, dark, front - 0.24, front, ey - 0.3, ey + 0.72, side * 0.9, side * 1.0); // window post

    const seatZ = side * 0.55;
    box(g, seat, ex - 0.3, ex + 0.2, l.deckFloor + 0.42, l.deckFloor + 0.56, seatZ - 0.26, seatZ + 0.26);
    box(g, seat, ex - 0.4, ex - 0.28, l.deckFloor + 0.5, l.deckFloor + 1.34, seatZ - 0.26, seatZ + 0.26);

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.34),
      new THREE.MeshBasicMaterial({ map: displayTexture(['#1e6fd0', '#7a4a22']), side: THREE.DoubleSide }),
    );
    screen.rotation.y = -Math.PI / 2;
    screen.position.set(front - 0.51, ey - 0.62, seatZ);
    g.add(screen);
  }
}

function buildCabinShell(g, l) {
  const wall = lit(0xe4dfd2, 0.68);
  const bin = lit(0xf0ece2, 0.62);
  const carpet = lit(0x47505e, 0.55);
  const ceiling = lit(0xf6f2e8, 0.75);
  const w = l.halfWidth;
  const f = l.cabinFloor;
  const top = l.ceiling;
  const x0 = l.rearX - 0.4;
  const x1 = l.doorX;
  const sill = f + 0.95;
  const head = f + 1.42;

  box(g, carpet, x0, x1, f - 0.06, f, -w, w);
  // Steps up to the flight deck
  const rise = l.deckFloor - f;
  for (let i = 0; i < 3; i++) {
    box(g, carpet, x1 - 1 + i * 0.34, x1, f, f + (rise * (i + 1)) / 3, -0.5, 0.5);
  }
  box(g, ceiling, x0, x1, top, top + 0.06, -w, w);
  box(g, wall, x0 - 0.08, x0, f, top, -w, w); // rear wall

  // Bulkhead with the flight deck door
  const door = 0.5;
  const dz = 0;
  box(g, wall, x1, x1 + 0.08, f, top + 0.9, -w, dz - door);
  box(g, wall, x1, x1 + 0.08, f, top + 0.9, dz + door, w);
  box(g, wall, x1, x1 + 0.08, l.deckFloor + 2.05, top + 0.9, dz - door, dz + door);
  box(g, wall, x1 - 0.1, x1 - 0.02, top, top + 0.9, -w, w); // seals the gap above the cabin ceiling

  for (const side of [-1, 1]) {
    box(g, wall, x0, x1, f, sill, side * w, side * (w + 0.06));
    box(g, wall, x0, x1, head, top, side * w, side * (w + 0.06));
    box(g, bin, x0, x1 - 1.6, top - 0.46, top, side * (w - 0.62), side * w);
    box(g, lit(0xffe9c0, 1.2), x0, x1 - 1.6, top - 0.5, top - 0.46, side * (w - 0.08), side * (w - 0.02)); // light strip
  }
  if (l.wide) {
    box(g, bin, x0, x1 - 1.6, top - 0.42, top, -0.95, 0.95);
  }

  // Pillars between windows
  const spacing = 0.72;
  const count = Math.floor((x1 - x0) / spacing);
  const pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, head - sill, 0.06), wall, count * 2);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const x = x0 + (i + 0.5) * spacing;
    m.makeTranslation(x, (sill + head) / 2, -w - 0.03);
    pillars.setMatrixAt(i * 2, m);
    m.makeTranslation(x, (sill + head) / 2, w + 0.03);
    pillars.setMatrixAt(i * 2 + 1, m);
  }
  pillars.frustumCulled = false;
  g.add(pillars);
}

const SKIN = [0xf1c9a5, 0xe0ac7e, 0xc68642, 0x8d5524, 0x5c3a21, 0xffdbac].map((c) => new THREE.Color(c));
const HAIR = [0x1b1208, 0x4a2e12, 0x8a5a2b, 0xb8a38a, 0x20140c, 0xd9c28a].map((c) => new THREE.Color(c));
const SHIRT = [0x3d5a80, 0xa23b3b, 0x4f7d5a, 0xe2c044, 0x6b4c9a, 0xd8d8d8, 0x2b2b2b, 0xe08a4f].map((c) => new THREE.Color(c));

function buildSeats(g, l) {
  const f = l.cabinFloor;
  const fabric = lit(0x2c4a72, 0.55);
  const cushion = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), fabric, l.seats.length);
  const back = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.72, 0.46), fabric, l.seats.length);
  const m = new THREE.Matrix4();
  l.seats.forEach((s, i) => {
    m.makeTranslation(s.x, f + 0.46, s.z);
    cushion.setMatrixAt(i, m);
    m.makeTranslation(s.x - 0.25, f + 0.86, s.z);
    back.setMatrixAt(i, m);
  });
  cushion.frustumCulled = false;
  back.frustumCulled = false;
  g.add(cushion, back);
}

function buildPeople(g, l) {
  const people = l.seats.filter((s) => s.taken);
  const n = people.length;
  const material = () => new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x555555, emissiveIntensity: 0.55 });
  const torso = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.2, 0.62, 8), material(), n);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.115, 10, 8), material(), n);
  const hair = new THREE.InstancedMesh(new THREE.SphereGeometry(0.122, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), material(), n);
  const hands = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 5), material(), n * 2);
  const eyes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 6, 5), new THREE.MeshBasicMaterial({ color: 0x15110d }), n * 2);
  const mouths = new THREE.InstancedMesh(new THREE.BoxGeometry(0.01, 0.012, 0.06), new THREE.MeshBasicMaterial({ color: 0x5a2a22 }), n);
  for (const mesh of [torso, head, hair, hands, eyes, mouths]) mesh.frustumCulled = false;

  people.forEach((p, i) => {
    const skin = SKIN[Math.floor(p.shade * SKIN.length)];
    torso.setColorAt(i, SHIRT[Math.floor(p.phase * 7) % SHIRT.length]);
    head.setColorAt(i, skin);
    hair.setColorAt(i, HAIR[Math.floor(p.hair * HAIR.length)]);
    hands.setColorAt(i * 2, skin);
    hands.setColorAt(i * 2 + 1, skin);
  });
  g.add(torso, head, hair, hands, eyes, mouths);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const big = new THREE.Vector3(1, 1, 1);
  const f = l.cabinFloor;

  /** Poses everyone for a mood. Runs a few times a second, only while you're inside. */
  return function pose(moodName, time, walkerX, walkerZ) {
    people.forEach((p, i) => {
      const t = time + p.phase;
      const x = p.x - 0.02;
      const sway = moodName === 'scared' ? Math.sin(t * 7) * 0.02 : Math.sin(t * 0.4) * 0.008;
      const y = f + 0.84;
      v.set(x, y, p.z + sway);
      m.compose(v, q.identity(), one);
      torso.setMatrixAt(i, m);

      // Nearby heads turn to look at you
      const near = Math.abs(walkerX - x) < 2.6;
      const look = near ? Math.atan2(walkerZ - p.z, Math.max(0.5, Math.abs(walkerX - x))) * 0.7 : Math.sin(t * 0.3) * 0.25;
      v.set(x + 0.02, f + 1.27, p.z + sway);
      m.compose(v, q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -look), one);
      head.setMatrixAt(i, m);
      m.compose(v, q, one);
      hair.setMatrixAt(i, m);

      // The face turns with the head
      const hx0 = v.x;
      const hy0 = v.y;
      const hz0 = v.z;
      const fx = Math.cos(look);
      const fz = Math.sin(look);
      const scaredEyes = moodName === 'scared' ? 1.7 : 1;
      big.setScalar(scaredEyes);
      for (const [index, side] of [[i * 2, -1], [i * 2 + 1, 1]]) {
        v.set(hx0 + fx * 0.108 - fz * side * 0.042, hy0 + 0.02, hz0 + fz * 0.108 + fx * side * 0.042);
        m.compose(v, q.identity(), big);
        eyes.setMatrixAt(index, m);
      }
      v.set(hx0 + fx * 0.112, hy0 - 0.05, hz0 + fz * 0.112);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -look);
      big.set(1, moodName === 'scared' ? 3 : moodName === 'clapping' ? 2.2 : 1, 1);
      m.compose(v, q, big);
      mouths.setMatrixAt(i, m);

      // Hands
      let hx = x + 0.3;
      let hy = f + 0.72;
      let gap = 0.13;
      if (moodName === 'clapping') {
        hx = x + 0.3;
        hy = f + 1.0;
        gap = 0.02 + Math.abs(Math.sin(t * 11)) * 0.13;
      } else if (moodName === 'scared') {
        hx = x + 0.2;
        hy = f + 1.42;
        gap = 0.2 + Math.sin(t * 9) * 0.02;
      } else if (moodName === 'nervous') {
        hy = f + 0.86;
        hx = x + 0.2;
        gap = 0.2;
      }
      q.identity();
      v.set(hx, hy, p.z - gap);
      m.compose(v, q, one);
      hands.setMatrixAt(i * 2, m);
      v.set(hx, hy, p.z + gap);
      m.compose(v, q, one);
      hands.setMatrixAt(i * 2 + 1, m);
    });
    for (const mesh of [torso, head, hair, hands, eyes, mouths]) mesh.instanceMatrix.needsUpdate = true;
  };
}

/** The attacker: a plain, faceless figure in dark clothes. */
function buildAttacker(g, ac, l) {
  const cloth = lit(0x20232a, 0.5);
  const skin = lit(0x9a8d80, 0.45);
  const figure = new THREE.Group();

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.75, 10), cloth);
  torso.position.y = 1.15;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.34), cloth);
  legs.position.y = 0.4;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), cloth);
  hood.position.y = 1.68;
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.7, 8), cloth);
  const armR = armL.clone();
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), skin);
  const handR = handL.clone();
  armL.add(handL);
  armR.add(handR);
  handL.position.y = -0.38;
  handR.position.y = -0.38;
  figure.add(torso, legs, hood, armL, armR);
  figure.visible = false;
  g.add(figure);

  return {
    /** closest runs from 0 at the door to 1 right at your seat. */
    show(closest, time) {
      figure.visible = true;
      const x = l.doorX + 0.3 + (ac.eye[0] - 1.25 - l.doorX - 0.3) * closest;
      figure.position.set(x + Math.sin(time * 13) * 0.04, l.deckFloor, Math.sin(time * 7) * 0.08);
      const swing = Math.sin(time * 15);
      armL.position.set(0.22, 1.42, -0.24);
      armR.position.set(0.22, 1.42, 0.24);
      armL.rotation.z = 1.5 + swing * 0.5;
      armR.rotation.z = 1.5 - swing * 0.5;
    },
    hide() {
      figure.visible = false;
    },
  };
}

export function createCabin(ac) {
  const l = cabinLayout(ac);
  const group = new THREE.Group();
  buildFlightDeck(group, ac, l);
  buildCabinShell(group, l);
  buildSeats(group, l);
  const pose = buildPeople(group, l);
  const attacker = buildAttacker(group, ac, l);
  group.visible = false;
  pose('calm', 0, 0, 0);
  return { group, pose, attacker };
}
