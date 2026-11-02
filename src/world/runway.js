// Runway 12/30 and its lights. Markings follow the standard ICAO layout.

import * as THREE from 'three';
import { RUNWAY } from '../game/scenario.js';

const WHITE = 0xeeeeea;

/** A flat rectangle on the ground, from x0 to x1 along the runway and z0 to z1 across it. */
function flat(x0, x1, z0, z1, y, material) {
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, material);
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  return m;
}

function asphaltTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#3b3d40';
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const v = 45 + Math.random() * 28;
    x.fillStyle = `rgba(${v},${v},${v + 2},0.5)`;
    x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  // Rubber deposits run lengthwise
  for (let i = 0; i < 70; i++) {
    x.fillStyle = 'rgba(20,20,22,0.13)';
    x.fillRect(Math.random() * 512, Math.random() * 512, 120 + Math.random() * 200, 1 + Math.random() * 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(RUNWAY.length / 120, 1);
  t.anisotropy = 16;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function numberDecal(label) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 256, 512);
  x.fillStyle = '#efefea';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = '700 300px "Helvetica Neue", Arial, sans-serif';
  x.save();
  x.translate(128, 256);
  x.scale(0.8, 1.45);
  x.fillText(label, 0, 0);
  x.restore();
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 16;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function decal(label, xCenter, facing) {
  // Plane lies flat with the top of the digits pointing down the runway.
  const geo = new THREE.PlaneGeometry(16, 30);
  geo.rotateX(-Math.PI / 2);
  geo.rotateY(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: numberDecal(label), transparent: true, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(xCenter, 0.02, 0);
  if (facing < 0) m.rotation.y = Math.PI;
  return m;
}

function bars(positions, material) {
  // positions: [x0, x1, z0, z1]; merged into one instanced mesh of unit quads
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, material, positions.length);
  const m = new THREE.Matrix4();
  positions.forEach((p, i) => {
    m.makeScale(p[1] - p[0], 1, p[3] - p[2]);
    m.setPosition((p[0] + p[1]) / 2, 0, (p[2] + p[3]) / 2);
    mesh.setMatrixAt(i, m);
  });
  mesh.position.y = 0;
  return mesh;
}

function lightPoints(positions, colors, size) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size, sizeAttenuation: false, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

function runwayLights(group) {
  const L = RUNWAY.length;
  const half = RUNWAY.width / 2 + 1.5;
  const pos = [];
  const col = [];
  const put = (x, z, r, g, b) => { pos.push(x, 0.5, z); col.push(r, g, b); };

  for (let x = 60; x < L; x += 60) {
    put(x, -half, 1, 0.95, 0.8);
    put(x, half, 1, 0.95, 0.8);
  }
  for (let z = -half; z <= half; z += 4) {
    put(-2, z, 0.2, 1, 0.45); // threshold, green
    put(L + 2, z, 1, 0.15, 0.1); // end, red
  }
  // Approach lights, leading in from the sea side
  for (let x = -30; x >= -900; x -= 30) {
    for (let z = -2; z <= 2; z += 2) put(x, z, 1, 0.97, 0.88);
  }
  for (let z = -15; z <= 15; z += 2.5) put(-300, z, 1, 0.97, 0.88);
  for (let z = -8; z <= 8; z += 2.5) put(-600, z, 1, 0.97, 0.88);
  group.add(lightPoints(pos, col, 3));
}

const PAPI_X = 420; // sited for the pilot's eye so wheels end up at the aim point
const PAPI_Z = [-62, -53, -44, -35]; // outermost first, on the left
const PAPI_ANGLE = [2.5, 2.83, 3.17, 3.5];

export function createRunway(scene, numbers = ['12', '30']) {
  const group = new THREE.Group();
  scene.add(group);
  const L = RUNWAY.length;
  const W = RUNWAY.width;

  const shoulder = new THREE.MeshLambertMaterial({ color: 0x52544f });
  group.add(flat(-70, L + 70, -W / 2 - 8, W / 2 + 8, -0.12, shoulder));

  const asphalt = new THREE.MeshLambertMaterial({ map: asphaltTexture() });
  group.add(flat(0, L, -W / 2, W / 2, -0.06, asphalt));

  const paint = new THREE.MeshBasicMaterial({ color: WHITE });
  const list = [];

  // Edge lines
  list.push([0, L, -W / 2 + 0.3, -W / 2 + 1.2], [0, L, W / 2 - 1.2, W / 2 - 0.3]);
  // Threshold piano keys, both ends
  for (let i = 0; i < 6; i++) {
    const z0 = 2.4 + i * 3.4;
    for (const sign of [-1, 1]) {
      const a = sign * z0;
      const b = sign * (z0 + 1.8);
      list.push([6, 36, Math.min(a, b), Math.max(a, b)]);
      list.push([L - 36, L - 6, Math.min(a, b), Math.max(a, b)]);
    }
  }
  // Centerline dashes
  for (let x = 90; x < L - 90; x += 50) list.push([x, x + 30, -0.45, 0.45]);
  // Aiming point and touchdown zone
  for (const sign of [-1, 1]) {
    const aim = [sign * 6, sign * 16];
    list.push([305, 365, Math.min(...aim), Math.max(...aim)]);
    list.push([L - 365, L - 305, Math.min(...aim), Math.max(...aim)]);
    for (const x of [150, 450, 600, 750, 900]) {
      for (const inner of [6, 9.5, 13]) {
        const zs = [sign * inner, sign * (inner + 2)];
        list.push([x, x + 22, Math.min(...zs), Math.max(...zs)]);
        list.push([L - x - 22, L - x, Math.min(...zs), Math.max(...zs)]);
      }
    }
  }
  const painted = bars(list, paint);
  painted.position.y = 0;
  group.add(painted);

  group.add(decal(numbers[0], 58, 1));
  group.add(decal(numbers[1], L - 58, -1));

  runwayLights(group);

  // PAPI: colors change with the pilot's eye angle
  const papiPos = [];
  const papiCol = [];
  PAPI_Z.forEach((z) => { papiPos.push(PAPI_X, 1.2, z); papiCol.push(1, 1, 1); });
  const papi = lightPoints(papiPos, papiCol, 6);
  group.add(papi);
  const papiColors = papi.geometry.getAttribute('color');

  return {
    updatePapi(eye) {
      const angle = (Math.atan2(eye[1] - 1.2, PAPI_X - eye[0]) * 180) / Math.PI;
      const behind = eye[0] > PAPI_X;
      PAPI_Z.forEach((_, i) => {
        const white = angle > PAPI_ANGLE[i];
        if (behind) papiColors.setXYZ(i, 0, 0, 0);
        else if (white) papiColors.setXYZ(i, 1, 1, 1);
        else papiColors.setXYZ(i, 1, 0.08, 0.05);
      });
      papiColors.needsUpdate = true;
    },
  };
}
