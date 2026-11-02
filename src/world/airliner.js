// A simple low-poly narrowbody, modeled in the body frame: +x nose, +y up, +z right.

import * as THREE from 'three';

function wing(material, span, rootChord, tipChord, sweep, thickness) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0, -rootChord);
  shape.lineTo(-sweep - tipChord, -span);
  shape.lineTo(-sweep, -span);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  return new THREE.Mesh(geo, material);
}

function cylinderX(rTop, rBottom, length, material, segments = 20, open = false) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, length, segments, 1, open);
  geo.rotateZ(-Math.PI / 2);
  return new THREE.Mesh(geo, material);
}

export function createAirliner(ac) {
  const root = new THREE.Group();
  const g = new THREE.Group(); // the airframe, drawn at 737 size and then scaled
  const spec = ac.model;
  g.scale.setScalar(spec.scale);
  root.add(g);

  const white = new THREE.MeshLambertMaterial({ color: 0xf1f2f0 });
  const grey = new THREE.MeshLambertMaterial({ color: 0xb9bec4 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x23282e });
  const paint = new THREE.MeshLambertMaterial({ color: spec.fin, side: THREE.DoubleSide });

  const radius = 1.95;
  const body = cylinderX(radius, radius, 27, white, 20, true); // open: you can stand inside
  body.position.x = 1;
  g.add(body);

  const nose = cylinderX(0.3, radius, 5, white, 20, true);
  nose.position.x = 17;
  g.add(nose);
  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), white);
  noseTip.position.x = 19.5;
  g.add(noseTip);

  const tail = cylinderX(radius, 0.4, 8.5, white, 20, true);
  tail.position.x = -16.7;
  tail.position.y = 0.55;
  g.add(tail);

  const windscreen = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 2.3), dark);
  windscreen.position.set(15.9, 1.3, 0);
  g.add(windscreen);

  root.userData.windscreen = windscreen;

  if (spec.hump) {
    const hump = cylinderX(1.25, 1.25, 11, white, 20, true);
    hump.position.set(11, 1.75, 0);
    g.add(hump);
    const humpNose = new THREE.Mesh(new THREE.SphereGeometry(1.25, 14, 10), white);
    humpNose.scale.x = 2;
    humpNose.position.set(16.5, 1.75, 0);
    g.add(humpNose);
    windscreen.position.set(17.1, 2.45, 0);
  }

  for (const side of [-1, 1]) {
    const w = wing(grey, 16, 6.5, 1.5, 7.5, 0.35);
    if (side > 0) w.scale.z = -1;
    w.position.set(2.5, -1.1, side * 1.4);
    g.add(w);

    const stab = wing(grey, 6, 3.5, 1.2, 3.2, 0.2);
    if (side > 0) stab.scale.z = -1;
    stab.position.set(-16, 1.2, side * 0.6);
    g.add(stab);

    for (const z of spec.engines) {
      const place = (z / spec.scale) * side;
      const sweepBack = (Math.abs(place) - 1.4) * 0.45;
      const engine = cylinderX(0.95, 0.75, 3.6, grey);
      engine.position.set(2.9 - sweepBack + 1.5, -2.3, place);
      g.add(engine);
      const intake = cylinderX(0.8, 0.8, 0.1, dark);
      intake.position.set(4.73 - sweepBack + 1.5, -2.3, place);
      g.add(intake);
    }

    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.2, spec.sharklets ? 2.6 : 2.2, 0.12), paint);
    tip.position.set(-6, spec.sharklets ? 0.4 : 0.1, side * 17.4);
    tip.rotation.x = side * (spec.sharklets ? 0.28 : 0);
    g.add(tip);
  }

  // Vertical fin
  const fin = new THREE.Shape();
  fin.moveTo(0, 0);
  fin.lineTo(-7.5, 7.5);
  fin.lineTo(-10.2, 7.5);
  fin.lineTo(-7.2, 0);
  fin.closePath();
  const finMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.3, bevelEnabled: false }), paint);
  finMesh.position.set(-13.5, 1.9, -0.15);
  g.add(finMesh);

  const gearGroup = new THREE.Group();
  root.add(gearGroup);
  root.userData.gear = gearGroup;

  // Gear comes straight from the flight model, so wheels meet the ground for every airplane.
  for (const [name, leg] of Object.entries(ac.gear)) {
    const isNose = name === 'nose';
    const [x, y, z] = leg.pos;
    const strutLength = Math.abs(y) - 1.9 * spec.scale + 0.6;
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, strutLength, 8), grey);
    strut.position.set(x, y + strutLength / 2 + 0.3, z);
    gearGroup.add(strut);
    const size = isNose ? 0.42 : 0.6;
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(size, size, isNose ? 0.5 : 0.9, 16), dark);
    tire.rotation.x = Math.PI / 2;
    tire.position.set(x, y + size, z);
    gearGroup.add(tire);
  }

  return root;
}
