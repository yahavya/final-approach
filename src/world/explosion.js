// Fireball, smoke and flying debris. Sprites are created once and reused.

import * as THREE from 'three';

const FIRE = 90;
const SMOKE = 70;
const DEBRIS = 80;
const GRAVITY = 9.81;

function softTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.45, inner);
  g.addColorStop(1, outer);
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createExplosion(scene) {
  const fireTex = softTexture('rgba(255,170,70,1)', 'rgba(230,50,0,0)');
  const smokeTex = softTexture('rgba(45,42,40,0.85)', 'rgba(45,42,40,0)');

  const puffs = [];
  const makePuff = (tex, additive) => {
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, fog: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, mat, additive, age: 0, life: 1, delay: 0, vel: [0, 0, 0], size0: 1, size1: 1 };
  };
  for (let i = 0; i < FIRE; i++) puffs.push(makePuff(fireTex, true));
  for (let i = 0; i < SMOKE; i++) puffs.push(makePuff(smokeTex, false));

  const debrisMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.25, 0.7),
    new THREE.MeshLambertMaterial({ color: 0x8a8d90 }),
    DEBRIS,
  );
  debrisMesh.frustumCulled = false;
  debrisMesh.visible = false;
  scene.add(debrisMesh);
  const pieces = [];
  for (let i = 0; i < DEBRIS; i++) pieces.push({ pos: [0, 0, 0], vel: [0, 0, 0], spin: 0, angle: 0, size: 1 });

  const light = new THREE.PointLight(0xffa040, 0, 0, 0.8);
  scene.add(light);

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const axis = new THREE.Vector3(0.6, 0.5, 0.62).normalize();
  const vec = new THREE.Vector3();
  const scale = new THREE.Vector3();
  let active = false;
  let time = 0;

  const rand = (a, b) => a + Math.random() * (b - a);

  return {
    get active() { return active; },

    trigger(pos, vel) {
      active = true;
      time = 0;
      const y = Math.max(pos[1], 2);
      const carry = [vel[0] * 0.25, 0, vel[2] * 0.25];
      puffs.forEach((p) => {
        const a = rand(0, Math.PI * 2);
        const speed = p.additive ? rand(8, 55) : rand(4, 20);
        p.age = 0;
        p.delay = p.additive ? rand(0, 0.5) : rand(0.15, 1.6);
        p.life = p.additive ? rand(0.8, 2) : rand(3.5, 7);
        p.vel = [
          Math.cos(a) * speed + carry[0],
          p.additive ? rand(8, 42) : rand(9, 22),
          Math.sin(a) * speed + carry[2],
        ];
        p.size0 = p.additive ? rand(14, 32) : rand(16, 30);
        p.size1 = p.additive ? rand(30, 62) : rand(60, 120);
        p.sprite.position.set(pos[0] + rand(-14, 14), y + rand(0, 5), pos[2] + rand(-9, 9));
        p.sprite.visible = false;
      });
      pieces.forEach((d) => {
        const a = rand(0, Math.PI * 2);
        const speed = rand(10, 75);
        d.pos = [pos[0], y, pos[2]];
        d.vel = [Math.cos(a) * speed + vel[0] * 0.4, rand(10, 55), Math.sin(a) * speed + vel[2] * 0.4];
        d.spin = rand(-9, 9);
        d.angle = 0;
        d.size = rand(0.6, 3.4);
      });
      debrisMesh.visible = true;
      light.position.set(pos[0], y + 12, pos[2]);
    },

    reset() {
      active = false;
      puffs.forEach((p) => { p.sprite.visible = false; });
      debrisMesh.visible = false;
      light.intensity = 0;
    },

    update(dt) {
      if (!active) return;
      time += dt;
      light.intensity = Math.max(0, 60000 * (1 - time / 1.6) ** 2);

      for (const p of puffs) {
        if (time < p.delay) continue;
        p.age += dt;
        const t = p.age / p.life;
        if (t >= 1) { p.sprite.visible = false; continue; }
        p.sprite.visible = true;
        p.sprite.position.x += p.vel[0] * dt;
        p.sprite.position.y += p.vel[1] * dt;
        p.sprite.position.z += p.vel[2] * dt;
        const drag = Math.exp(-1.4 * dt);
        p.vel[0] *= drag;
        p.vel[2] *= drag;
        const size = p.size0 + (p.size1 - p.size0) * (1 - (1 - t) * (1 - t));
        p.sprite.scale.set(size, size, 1);
        p.mat.opacity = p.additive ? 0.5 * (1 - t) : 0.9 * (1 - t) * Math.min(1, t * 6);
      }

      pieces.forEach((d, i) => {
        if (d.pos[1] > 0.2) {
          d.vel[1] -= GRAVITY * dt;
          d.pos[0] += d.vel[0] * dt;
          d.pos[1] += d.vel[1] * dt;
          d.pos[2] += d.vel[2] * dt;
          d.angle += d.spin * dt;
        }
        quat.setFromAxisAngle(axis, d.angle);
        vec.set(d.pos[0], Math.max(d.pos[1], 0.2), d.pos[2]);
        scale.setScalar(d.size);
        matrix.compose(vec, quat, scale);
        debrisMesh.setMatrixAt(i, matrix);
      });
      debrisMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
