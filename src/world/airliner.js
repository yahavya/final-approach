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

/** A low-poly F-35: blended body, trapezoid wings, twin canted tails, canopy. */
export function createFighter(ac) {
  const root = new THREE.Group();
  const grey = new THREE.MeshLambertMaterial({ color: 0x6f777f });
  const dark = new THREE.MeshLambertMaterial({ color: 0x3c4249 });
  const canopy = new THREE.MeshLambertMaterial({ color: 0xa58b4c, emissive: 0x2a2010 });

  const body = cylinderX(0.75, 0.95, 9.5, grey, 8);
  body.scale.set(1, 0.8, 1.35);
  root.add(body);
  const nose = cylinderX(0.05, 0.75, 4, grey, 8);
  nose.scale.set(1, 0.8, 1.35);
  nose.position.x = 6.75;
  root.add(nose);
  const nozzle = cylinderX(0.62, 0.5, 1.4, dark, 12);
  nozzle.position.x = -5.4;
  root.add(nozzle);

  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), canopy);
  glass.scale.set(2.2, 0.75, 0.85);
  glass.position.set(4.2, 0.55, 0);
  root.add(glass);

  for (const side of [-1, 1]) {
    const w = new THREE.Shape();
    w.moveTo(2.2, 0);
    w.lineTo(-1.6, 5.35);
    w.lineTo(-3.4, 5.35);
    w.lineTo(-3.8, 0);
    w.closePath();
    const wing = new THREE.Mesh(new THREE.ExtrudeGeometry(w, { depth: 0.18, bevelEnabled: false }), grey);
    wing.rotation.x = side * Math.PI / 2;
    wing.position.set(0, side < 0 ? 0.09 : -0.09, 0);
    if (side > 0) wing.scale.z = -1;
    root.add(wing);

    const h = new THREE.Shape();
    h.moveTo(-4.6, 0);
    h.lineTo(-6.4, 2.6);
    h.lineTo(-7.3, 2.6);
    h.lineTo(-7.0, 0);
    h.closePath();
    const stab = new THREE.Mesh(new THREE.ExtrudeGeometry(h, { depth: 0.12, bevelEnabled: false }), grey);
    stab.rotation.x = side * Math.PI / 2;
    stab.position.set(0, 0, side * 0.6);
    root.add(stab);

    const f = new THREE.Shape();
    f.moveTo(-3.8, 0);
    f.lineTo(-5.7, 2.2);
    f.lineTo(-6.6, 2.2);
    f.lineTo(-6.3, 0);
    f.closePath();
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(f, { depth: 0.1, bevelEnabled: false }), grey);
    fin.position.set(0, 0.45, side * 0.9);
    fin.rotation.x = side * -0.42; // canted outward
    root.add(fin);

    const intake = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.5), grey);
    intake.position.set(2.2, 0.05, side * 1.05);
    root.add(intake);
  }

  // Afterburner: shown when the throttle is all the way up.
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.2, 14, 1, true), flameMat);
  flame.rotation.z = Math.PI / 2;
  flame.position.x = -7.6;
  flame.visible = false;
  root.add(flame);
  root.userData.afterburner = flame;

  const gearGroup = new THREE.Group();
  root.add(gearGroup);
  root.userData.gear = gearGroup;
  for (const [name, leg] of Object.entries(ac.gear)) {
    const [x, y, z] = leg.pos;
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, Math.abs(y) - 0.5, 8), dark);
    strut.position.set(x, y / 2 - 0.1, z);
    gearGroup.add(strut);
    const size = name === 'nose' ? 0.3 : 0.4;
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(size, size, 0.3, 14), dark);
    tire.rotation.x = Math.PI / 2;
    tire.position.set(x, y + size, z);
    gearGroup.add(tire);
  }
  root.userData.windscreen = glass;
  return root;
}

export function createAirliner(ac) {
  if (ac.model.kind === 'fighter') return createFighter(ac);
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
