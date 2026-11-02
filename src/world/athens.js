// Stylized Attica around Athens airport, in the airport's own frame: +x runs up
// runway 03R (032° true), so +z is east-southeast toward the Aegean and -z is
// west toward Mount Hymettus. Mountains are scenery only, and the route avoids them.

import * as THREE from 'three';

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** The east coast, a few kilometers from the runway. */
const coastZ = (x) => 6200 + x * 0.12 + Math.sin(x / 2600) * 700 + Math.sin(x / 830) * 220;

function land(material, offset, y) {
  const shape = new THREE.Shape();
  const far = 70000;
  shape.moveTo(-far, far); // shape y becomes -z when laid flat
  for (let x = -far; x <= far; x += 300) shape.lineTo(x, -(coastZ(x) + offset));
  shape.lineTo(far, far);
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y;
  return mesh;
}

function mountains(group, list, color) {
  const material = new THREE.MeshLambertMaterial({ color, flatShading: true });
  for (const m of list) {
    const geo = new THREE.ConeGeometry(m.r, m.h, 9, 3);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(m.x, m.h / 2 - 1, m.z);
    mesh.scale.set(m.stretch ?? 1, 1, 1);
    mesh.rotation.y = m.turn ?? 0;
    group.add(mesh);
  }
}

function fields(group) {
  const rnd = seeded(31);
  const count = 3200;
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), count);
  const palette = [0x8c8a58, 0x7d8450, 0xa89a6a, 0x6f7a48, 0xb7a97c].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  let i = 0;
  while (i < count) {
    const x = -26000 + rnd() * 46000;
    const z = -14000 + rnd() * 24000;
    if (z > coastZ(x) - 200) continue;
    if (x > -400 && x < 4400 && z > -2400 && z < 300) continue;
    q.setFromAxisAngle(up, 0.5 + rnd() * 0.7);
    p.set(x, -0.3, z);
    s.set(120 + rnd() * 360, 1, 100 + rnd() * 300);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, palette[Math.floor(rnd() * palette.length)]);
    i++;
  }
  mesh.frustumCulled = false;
  group.add(mesh);
}

function towns(group) {
  const rnd = seeded(47);
  const centers = [
    { x: -9000, z: 2600, r: 1700 }, // Markopoulo direction
    { x: 7000, z: 3600, r: 2100 }, // Artemida, on the coast
    { x: 4500, z: -6000, r: 2000 }, // Paiania and Koropi
    { x: -17000, z: 1500, r: 1600 },
  ];
  const count = 5200;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), count);
  const palette = [0xf2eee4, 0xe9e2d3, 0xf7f3ea, 0xddd5c4].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  let i = 0;
  while (i < count) {
    const c = centers[Math.floor(rnd() * centers.length)];
    const a = rnd() * 6.28;
    const d = Math.sqrt(rnd()) * c.r;
    const x = c.x + Math.cos(a) * d;
    const z = c.z + Math.sin(a) * d;
    if (z > coastZ(x) - 40) continue;
    const w = 12 + rnd() * 18;
    p.set(x, 0, z);
    q.setFromAxisAngle(up, 0.6 + (rnd() < 0.5 ? 0 : 1.57));
    s.set(w, 6 + rnd() * 12, w * 0.8);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, palette[Math.floor(rnd() * palette.length)]);
    i++;
  }
  mesh.frustumCulled = false;
  group.add(mesh);
}

function airport(group) {
  const concrete = new THREE.MeshLambertMaterial({ color: 0xe2ded2 });
  const pavement = new THREE.MeshLambertMaterial({ color: 0x8c8d88 });
  const asphalt = new THREE.MeshLambertMaterial({ color: 0x45474a });

  const flat = (w, d, x, z, y, material) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
  };

  flat(3800, 45, 1900, -1400, -0.12, asphalt); // the parallel runway, 03L/21R
  flat(1900, 620, 1700, -700, -0.2, pavement);
  for (const x of [900, 1700, 2500]) flat(24, 1400, x, -700, -0.15, asphalt);

  const terminal = new THREE.Mesh(new THREE.BoxGeometry(900, 22, 80), concrete);
  terminal.position.set(1700, 11, -820);
  group.add(terminal);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(5, 8, 62, 12), concrete);
  tower.position.set(2400, 31, -620);
  group.add(tower);
}

export function createAthens(groundMaterial) {
  const group = new THREE.Group();
  group.add(land(new THREE.MeshLambertMaterial({ color: 0xe0cda2 }), 70, -1.2));
  group.add(land(groundMaterial, 0, -0.6));
  fields(group);
  towns(group);
  airport(group);

  // Hymettus to the west, Penteli to the north, Lavreotiki to the south
  mountains(group, [
    { x: -5000, z: -13000, r: 5200, h: 1000, stretch: 2.3 },
    { x: 7000, z: -14500, r: 4600, h: 930, stretch: 1.9 },
    { x: 26000, z: -9000, r: 7000, h: 1100, stretch: 1.7 },
    { x: -30000, z: -7000, r: 6000, h: 620, stretch: 1.6 },
    { x: 24000, z: -24000, r: 8000, h: 1300, stretch: 1.5 },
    { x: -4000, z: -26000, r: 7000, h: 1000, stretch: 2 },
  ], 0x8d8468);

  // Islands out in the Aegean
  mountains(group, [
    { x: -9000, z: 30000, r: 5200, h: 520, stretch: 2.4 }, // Kea
    { x: 22000, z: 36000, r: 7000, h: 800, stretch: 3 }, // Evia, far off
    { x: -30000, z: 19000, r: 2200, h: 300, stretch: 2 }, // Makronisos
  ], 0x7c8560);

  return group;
}
