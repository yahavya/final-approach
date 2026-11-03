// Storm visuals: darker sky and lighting, thick haze, rain around the camera
// and lightning flashes. It only changes how things look.

import * as THREE from 'three';

const DROPS = 1400;
const BOX = { x: 70, y: 46, z: 70 };
const FALL = 9; // metres per second

export function createStorm(scene, parts) {
  const { sky, hemi, sun, sea, clouds } = parts;
  const clear = {
    top: sky.material.uniforms.top.value.clone(),
    mid: sky.material.uniforms.mid.value.clone(),
    horizon: sky.material.uniforms.horizon.value.clone(),
    fog: scene.fog.color.clone(),
    density: scene.fog.density,
    hemi: hemi.intensity,
    sun: sun.intensity,
    sea: sea.material.color.clone(),
    cloud: clouds.color.clone(),
  };
  const storm = {
    top: new THREE.Color(0x3a414b),
    mid: new THREE.Color(0x58606a),
    horizon: new THREE.Color(0x767d84),
    fog: new THREE.Color(0x6e757c),
    density: 0.00016,
    hemi: 0.95,
    sun: 0.45,
    sea: new THREE.Color(0x24414f),
    cloud: new THREE.Color(0x5f666e),
  };

  // Rain: short streaks in a box that follows the camera.
  const seeds = new Float32Array(DROPS * 3);
  for (let i = 0; i < DROPS; i++) {
    seeds[i * 3] = (Math.random() - 0.5) * BOX.x;
    seeds[i * 3 + 1] = Math.random() * BOX.y;
    seeds[i * 3 + 2] = (Math.random() - 0.5) * BOX.z;
  }
  const positions = new Float32Array(DROPS * 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const rain = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: 0xc9d3dc, transparent: true, opacity: 0.45, fog: false,
  }));
  rain.frustumCulled = false;
  rain.visible = false;
  scene.add(rain);

  let on = false;
  let flash = 0;
  let fallen = 0;

  function apply() {
    const s = on ? storm : clear;
    sky.material.uniforms.top.value.copy(s.top);
    sky.material.uniforms.mid.value.copy(s.mid);
    sky.material.uniforms.horizon.value.copy(s.horizon);
    scene.fog.color.copy(s.fog);
    scene.fog.density = s.density;
    sea.material.color.copy(s.sea);
    clouds.color.copy(s.cloud);
    rain.visible = on;
  }

  return {
    set(stormy) {
      on = stormy;
      flash = 0;
      apply();
    },

    get on() { return on; },

    /** A lightning strike: the whole sky lights up for a moment. */
    strike() {
      flash = 1;
    },

    /**
     * Moves the rain with the camera. airVelocity is how the air moves past the
     * airplane, so at speed the streaks fly almost straight at you.
     */
    update(dt, cameraPosition, airVelocity) {
      if (!on) return;
      flash = Math.max(0, flash - dt * 3.2);
      const glow = flash > 0.66 || (flash > 0.2 && flash < 0.4) ? flash : flash * 0.3;
      hemi.intensity = storm.hemi + glow * 3;
      sun.intensity = storm.sun + glow * 2;
      sky.material.uniforms.mid.value.copy(storm.mid).lerp(new THREE.Color(0xdfe6ff), glow * 0.8);

      fallen = (fallen + dt * FALL) % BOX.y;
      const stretch = 0.035;
      const [vx, vy, vz] = airVelocity;
      for (let i = 0; i < DROPS; i++) {
        let x = seeds[i * 3] - vx * stretch * 10;
        let y = ((seeds[i * 3 + 1] - fallen) % BOX.y + BOX.y) % BOX.y - BOX.y / 2;
        let z = seeds[i * 3 + 2] - vz * stretch * 10;
        x = ((x + BOX.x / 2) % BOX.x + BOX.x) % BOX.x - BOX.x / 2;
        z = ((z + BOX.z / 2) % BOX.z + BOX.z) % BOX.z - BOX.z / 2;
        const o = i * 6;
        positions[o] = cameraPosition.x + x;
        positions[o + 1] = cameraPosition.y + y;
        positions[o + 2] = cameraPosition.z + z;
        positions[o + 3] = cameraPosition.x + x - vx * stretch;
        positions[o + 4] = cameraPosition.y + y - (vy - FALL) * stretch * 1.5;
        positions[o + 5] = cameraPosition.z + z - vz * stretch;
      }
      geometry.attributes.position.needsUpdate = true;
    },

    hemiBase: () => (on ? storm.hemi : clear.hemi),
  };
}
