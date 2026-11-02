// The 3D world. It reads simulation state and never changes it.

import * as THREE from 'three';
import { DEG, qRotate } from '../sim/math.js';
import { RUNWAY } from '../game/scenario.js';
import { createRunway } from './runway.js';
import { createAirliner } from './airliner.js';
import { createExplosion } from './explosion.js';
import { createCabin } from './cabin.js';
import { createAthens } from './athens.js';
import { b737 } from '../sim/aircraft/b737.js';

const COCKPIT_FOV = 58;
const CHASE_FOV = 52;
const COCKPIT_TILT = 4.5 * DEG; // the pilot looks a little below the nose
const SKY_HORIZON = 0xf6dcbc;
const SKY_MID = 0xbcd6e8;
const SKY_TOP = 0x5b94cf;

// Threshold of runway 12, from published coordinates.
const THRESHOLD = { lat: 32.0147, lon: 34.8658 };

/** Converts a real latitude and longitude into runway coordinates, in metres. */
function fromLatLon(lat, lon) {
  const north = (lat - THRESHOLD.lat) * 110950;
  const east = (lon - THRESHOLD.lon) * 94400;
  const h = RUNWAY.headingTrue * DEG;
  return {
    x: east * Math.sin(h) + north * Math.cos(h),
    z: east * Math.cos(h) - north * Math.sin(h),
  };
}

/** Repeatable random numbers, so the city is the same on every flight. */
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const x = c.getContext('2d');
  const rnd = seeded(7);
  x.fillStyle = '#8b8a5e';
  x.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 26000; i++) {
    const v = rnd();
    x.fillStyle = v < 0.5 ? 'rgba(92,102,62,0.22)' : v < 0.8 ? 'rgba(160,142,98,0.2)' : 'rgba(58,74,48,0.25)';
    const s = 1 + rnd() * 7;
    x.fillRect(rnd() * 1024, rnd() * 1024, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 900, 1 / 900); // shape coordinates are metres
  t.anisotropy = 16;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The coast runs roughly north-northeast and crosses the extended centerline
// a little behind the starting point.
const COAST = { x: -11900, dx: -0.19, dz: -0.98 };

function coastX(z) {
  return COAST.x + (z * COAST.dx) / COAST.dz + Math.sin(z / 2300) * 170 + Math.sin(z / 640) * 45;
}

function landMesh(material, seaward, y) {
  const shape = new THREE.Shape();
  const far = 70000;
  shape.moveTo(far, far);
  for (let z = far; z >= -far; z -= 300) shape.lineTo(coastX(z) - seaward, -z);
  shape.lineTo(far, far);
  // Shape y becomes -z when laid flat
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, material);
  m.position.y = y;
  return m;
}

function addSky(scene) {
  const geo = new THREE.SphereGeometry(100000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(SKY_TOP) },
      mid: { value: new THREE.Color(SKY_MID) },
      horizon: { value: new THREE.Color(SKY_HORIZON) },
    },
    vertexShader: `varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; varying vec3 vDir;
      void main() {
        float h = clamp(normalize(vDir).y, 0.0, 1.0);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.14, h));
        c = mix(c, top, smoothstep(0.1, 0.6, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);
  return sky;
}

/** True in the built-up Gush Dan area. */
function inCity(x, z) {
  return x > coastX(z) && x < -3800 && z > -10000 && z < 7000;
}

function addFields(scene) {
  const rnd = seeded(11);
  const count = 5200;
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const palette = [0x74824e, 0x8d9460, 0xa79a68, 0x5f7445, 0xb4a577, 0x6e7c52].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const size = new THREE.Vector3();
  let i = 0;
  while (i < count) {
    const x = -11000 + rnd() * 36000;
    const z = -22000 + rnd() * 44000;
    if (x < coastX(z) + 300 || inCity(x, z)) continue;
    if (Math.abs(z) < 260 && x > -200 && x < RUNWAY.length + 300) continue;
    q.setFromAxisAngle(up, (rnd() < 0.5 ? 0.3 : 1.2) + rnd() * 0.15);
    pos.set(x, -0.3, z);
    size.set(140 + rnd() * 480, 1, 120 + rnd() * 380);
    m.compose(pos, q, size);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, palette[Math.floor(rnd() * palette.length)]);
    i++;
  }
  scene.add(mesh);
}

function addCity(scene) {
  const rnd = seeded(23);

  // Urban ground, laid out as blocks so the buildings sit on something.
  const blockCount = 3800;
  const blockGeo = new THREE.PlaneGeometry(1, 1);
  blockGeo.rotateX(-Math.PI / 2);
  const blocks = new THREE.InstancedMesh(blockGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), blockCount);
  const blockColors = [0x9d9a8c, 0xa9a596, 0x8f8e80, 0xb3ae9e, 0x7d8a64].map((c) => new THREE.Color(c));
  const bm = new THREE.Matrix4();
  const bq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);
  const bp = new THREE.Vector3();
  const bs = new THREE.Vector3();
  let b = 0;
  while (b < blockCount) {
    const x = -12600 + rnd() * 8900;
    const z = -10000 + rnd() * 17000;
    if (!inCity(x - 80, z)) continue;
    bp.set(x, -0.25, z);
    bs.set(190 + rnd() * 260, 1, 150 + rnd() * 240);
    bm.compose(bp, bq, bs);
    blocks.setMatrixAt(b, bm);
    blocks.setColorAt(b, blockColors[Math.floor(rnd() * blockColors.length)]);
    b++;
  }
  blocks.frustumCulled = false;
  scene.add(blocks);

  const towers = [
    fromLatLon(32.074, 34.792), // Azrieli area
    fromLatLon(32.083, 34.802), // Ramat Gan diamond district
    fromLatLon(32.067, 34.771), // Rothschild
  ];
  const count = 24000;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const palette = [0xd8d2c4, 0xcdc6b6, 0xbfb9ad, 0xe6e0d2, 0xa8a59e].map((c) => new THREE.Color(c));
  const glass = new THREE.Color(0x7f93a3);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const size = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let i = 0;
  while (i < count) {
    const tower = rnd() < 0.09;
    let x;
    let z;
    if (tower) {
      const c = towers[Math.floor(rnd() * towers.length)];
      x = c.x + (rnd() - 0.5) * 1800;
      z = c.z + (rnd() - 0.5) * 1800;
    } else {
      x = -12600 + rnd() * 8900;
      z = -10000 + rnd() * 17000;
    }
    if (x < coastX(z) + 60) continue;
    // Thin out toward the airport
    if (!inCity(x, z)) continue;
    if (x > -6000 && rnd() < (x + 6000) / 2400) continue;
    const height = tower ? 40 + rnd() * rnd() * 190 : 7 + rnd() * rnd() * 34;
    const w = tower ? 22 + rnd() * 22 : 16 + rnd() * 26;
    pos.set(x, 0, z);
    q.setFromAxisAngle(up, 0.5 + (rnd() < 0.5 ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.15);
    size.set(w, height, w * (0.7 + rnd() * 0.6));
    m.compose(pos, q, size);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, tower ? glass : palette[Math.floor(rnd() * palette.length)]);
    i++;
  }
  mesh.frustumCulled = false;
  scene.add(mesh);
}

function addAirport(scene) {
  // Terminal 3 sits about here relative to the runway.
  const terminal = fromLatLon(32.0005, 34.8708);
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 720).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x8c8d88 }),
  );
  apron.position.set(terminal.x, -0.2, terminal.z - 180);
  scene.add(apron);

  const concrete = new THREE.MeshLambertMaterial({ color: 0xd9d6cc });
  const building = new THREE.Mesh(new THREE.BoxGeometry(620, 24, 90), concrete);
  building.position.set(terminal.x, 12, terminal.z + 110);
  scene.add(building);

  for (let i = 0; i < 4; i++) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(28, 14, 280), concrete);
    pier.position.set(terminal.x - 270 + i * 180, 7, terminal.z - 70);
    scene.add(pier);
  }

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(5, 8, 62, 12), concrete);
  tower.position.set(terminal.x + 480, 31, terminal.z - 140);
  scene.add(tower);

  const parked = createAirliner(b737);
  for (let i = 0; i < 9; i++) {
    const a = parked.clone();
    a.position.set(terminal.x - 450 + i * 105, 3.9, terminal.z - 260 - (i % 2) * 90);
    a.rotation.y = Math.PI / 2;
    scene.add(a);
  }

  // Taxiways, as scenery
  const link = new THREE.MeshLambertMaterial({ color: 0x4d4f50 });
  for (const x of [700, 1700, 2300]) {
    const taxi = new THREE.Mesh(new THREE.PlaneGeometry(24, 640).rotateX(-Math.PI / 2), link);
    taxi.position.set(x, -0.15, 320);
    scene.add(taxi);
  }
  const parallel = new THREE.Mesh(new THREE.PlaneGeometry(2400, 24).rotateX(-Math.PI / 2), link);
  parallel.position.set(1500, -0.15, 200);
  scene.add(parallel);
}

function addClouds(scene) {
  const rnd = seeded(5);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const puffs = 30;
  for (let i = 0; i < puffs; i++) {
    const r = 18 + rnd() * 34;
    const px = 60 + rnd() * 136;
    const py = 84 + rnd() * 88;
    const grad = x.createRadialGradient(px, py, 0, px, py, r);
    grad.addColorStop(0, 'rgba(255,245,235,0.5)');
    grad.addColorStop(1, 'rgba(255,245,235,0)');
    x.fillStyle = grad;
    x.beginPath();
    x.arc(px, py, r, 0, Math.PI * 2);
    x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.8 });
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Sprite(mat);
    s.position.set(-18000 + rnd() * 70000, 1500 + rnd() * 900, -38000 + rnd() * 76000);
    const size = 3500 + rnd() * 6000;
    s.scale.set(size, size * 0.34, 1);
    scene.add(s);
  }
}

export function createWorld(canvas, initialAircraft) {
  let ac = initialAircraft;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(SKY_HORIZON, 0.000048);

  const camera = new THREE.PerspectiveCamera(COCKPIT_FOV, 1, 0.12, 200000);

  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x7c7458, 1.5));
  const sun = new THREE.DirectionalLight(0xffe2bd, 2.3);
  sun.position.set(-0.5, 0.42, 0.62);
  scene.add(sun);

  const sky = addSky(scene);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(320000, 320000).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x2f6f8f }),
  );
  sea.position.set(-40000, -2, 0);
  scene.add(sea);

  // Each airport has its own world, in its own frame.
  const groundMaterial = new THREE.MeshLambertMaterial({ map: groundTexture() });
  const telAviv = new THREE.Group();
  scene.add(telAviv);
  telAviv.add(landMesh(new THREE.MeshLambertMaterial({ color: 0xd9c49a }), 70, -1.2));
  telAviv.add(landMesh(groundMaterial, 0, -0.6));
  addFields(telAviv);
  addCity(telAviv);
  addAirport(telAviv);
  addClouds(scene);

  const athens = createAthens(groundMaterial);
  athens.visible = false;
  scene.add(athens);

  const runways = { tlv: createRunway(telAviv), ath: createRunway(athens, ['03', '21']) };
  let runway = runways.tlv;

  let airliner = createAirliner(ac);
  scene.add(airliner);

  const explosion = createExplosion(scene);
  let crashSite = null;
  let lastTime = 0;
  let cabin = createCabin(ac);
  scene.add(cabin.group);
  let pose = null; // set while you're out of your seat
  let peopleClock = 0;

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  const fitShadow = () => shadow.scale.set(21 * ac.model.scale, 1, 8 * ac.model.scale);
  fitShadow();
  shadow.position.y = 0.05;
  scene.add(shadow);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let cockpit = true;
  let cabinMood = 'calm';
  const yawQ = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const chasePos = new THREE.Vector3();
  let chaseReady = false;

  // The camera looks along its own -z; the airplane's nose is +x.
  const toCamera = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
  const tiltDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -COCKPIT_TILT);
  const bodyQ = new THREE.Quaternion();

  return {
    isCockpit: () => cockpit && !crashSite && !pose,

    /** Shows the world around one airport. */
    setAirport(id) {
      telAviv.visible = id === 'tlv';
      athens.visible = id === 'ath';
      runway = runways[id];
    },

    /** Swaps in a different airplane. */
    setAircraft(next) {
      ac = next;
      scene.remove(airliner);
      airliner = createAirliner(ac);
      scene.add(airliner);
      scene.remove(cabin.group);
      cabin = createCabin(ac);
      scene.add(cabin.group);
      fitShadow();
    },

    /** Camera pose in the body frame while walking, or null when seated. */
    setWalker(next, moodName = 'calm') {
      pose = next;
      cabin.group.visible = !!next;
      if (next) cabinMood = moodName;
    },

    /** Blows up the airplane and moves the camera outside to watch. */
    explode(s) {
      crashSite = [...s.pos];
      explosion.trigger(s.pos, s.vel);
    },

    /** Clears the wreck for a new flight. */
    resetCrash() {
      crashSite = null;
      explosion.reset();
    },

    /** Screen position of a world point, or null if it's behind the camera. */
    project(pos) {
      const v = new THREE.Vector3(pos[0], pos[1], pos[2]).project(camera);
      return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight, behind: v.z > 1 };
    },

    tilt: () => COCKPIT_TILT,
    fov: () => camera.fov,

    toggleView() {
      cockpit = !cockpit;
      chaseReady = false;
      camera.fov = cockpit ? COCKPIT_FOV : CHASE_FOV;
      camera.updateProjectionMatrix();
    },

    update(g, shake, time) {
      const s = g.s;
      bodyQ.set(s.q[1], s.q[2], s.q[3], s.q[0]);
      airliner.position.set(s.pos[0], s.pos[1], s.pos[2]);
      airliner.quaternion.copy(bodyQ);
      // From inside, the hull's back faces don't draw, so the wing still shows out the window.
      airliner.visible = (!cockpit || !!pose) && !crashSite;
      airliner.userData.windscreen.visible = !pose;
      airliner.userData.gear.visible = s.gearDown > 0.5;
      const dt = Math.min(0.1, Math.max(0, time - lastTime));
      lastTime = time;
      explosion.update(dt);

      shadow.position.x = s.pos[0];
      shadow.position.z = s.pos[2];
      shadow.visible = s.pos[1] < 400 && !crashSite;

      const eyeOffset = qRotate(s.q, ac.eye);
      const eye = [s.pos[0] + eyeOffset[0], s.pos[1] + eyeOffset[1], s.pos[2] + eyeOffset[2]];
      runway.updatePapi(eye);

      cabin.group.position.copy(airliner.position);
      cabin.group.quaternion.copy(bodyQ);

      if (pose && !crashSite) {
        const local = qRotate(s.q, [pose.x, pose.y, pose.z]);
        camera.position.set(s.pos[0] + local[0], s.pos[1] + local[1], s.pos[2] + local[2]);
        yawQ.setFromAxisAngle(up, pose.yaw);
        camera.quaternion.copy(bodyQ).multiply(yawQ).multiply(toCamera);
        if (time - peopleClock > 0.06) {
          peopleClock = time;
          cabin.pose(cabinMood, time, pose.x, pose.z);
        }
      } else if (crashSite) {
        const a = time * 0.22;
        camera.position.set(crashSite[0] + Math.cos(a) * 190, Math.max(crashSite[1], 0) + 46, crashSite[2] + Math.sin(a) * 190);
        camera.up.set(0, 1, 0);
        camera.lookAt(crashSite[0], Math.max(crashSite[1], 0) + 26, crashSite[2]);
      } else if (cockpit) {
        camera.position.set(eye[0], eye[1], eye[2]);
        camera.quaternion.copy(bodyQ).multiply(toCamera).multiply(tiltDown);
      } else {
        const behind = qRotate(s.q, [-56 * ac.model.scale, 11 * ac.model.scale, 0]);
        const target = new THREE.Vector3(s.pos[0] + behind[0], s.pos[1] + Math.max(behind[1], 11 * ac.model.scale), s.pos[2] + behind[2]);
        if (!chaseReady) { chasePos.copy(target); chaseReady = true; }
        chasePos.lerp(target, 0.12);
        camera.position.copy(chasePos);
        camera.up.set(0, 1, 0);
        camera.lookAt(s.pos[0] + s.vel[0] * 0.25, s.pos[1] + 1, s.pos[2] + s.vel[2] * 0.25);
      }

      if (shake > 0.01) {
        const a = 0.006 * shake;
        camera.rotateX(Math.sin(time * 61) * a);
        camera.rotateZ(Math.sin(time * 47) * a * 0.7);
      }

      sky.position.copy(camera.position);
      renderer.render(scene, camera);
    },
  };
}
