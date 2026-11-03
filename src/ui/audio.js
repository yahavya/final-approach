// Engine and wind are synthesized; callouts are short recordings played through
// a telephone-band filter so they sound like a cockpit speaker. All of this is
// optional: if audio can't start, the game runs silently.

import { renderApplause } from './applause.js';

const CALLOUTS = ['retard', '1000', '500', '100', '50', '40', '30', '20', '10', 'sinkrate', 'pullup'];

export function createAudio() {
  let ctx = null;
  let master = null;
  let speaker = null;
  const clips = {};
  const nodes = {};
  let current = null;
  let wantRunning = false;

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function loopedNoise(type, frequency, q) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(2);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(master);
    src.start();
    return { filter, gain };
  }

  function buildGraph() {
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);

    const low = ctx.createBiquadFilter();
    low.type = 'highpass';
    low.frequency.value = 320;
    const high = ctx.createBiquadFilter();
    high.type = 'lowpass';
    high.frequency.value = 3400;
    speaker = ctx.createGain();
    speaker.gain.value = 1.3;
    low.connect(high).connect(speaker).connect(master);
    speaker.input = low;

    nodes.engine = loopedNoise('lowpass', 500, 0.6);
    nodes.wind = loopedNoise('bandpass', 900, 0.5);

    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 90;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 900;
    nodes.humGain = ctx.createGain();
    nodes.humGain.gain.value = 0;
    nodes.hum = hum;
    hum.connect(humFilter).connect(nodes.humGain).connect(master);
    hum.start();

    const shaker = ctx.createOscillator();
    shaker.type = 'square';
    shaker.frequency.value = 26;
    nodes.shakerGain = ctx.createGain();
    nodes.shakerGain.gain.value = 0;
    shaker.connect(nodes.shakerGain).connect(master);
    shaker.start();
  }

  async function loadClips() {
    await Promise.all(CALLOUTS.map(async (name) => {
      try {
        const res = await fetch(`assets/audio/${name}.wav`);
        clips[name] = await ctx.decodeAudioData(await res.arrayBuffer());
      } catch { /* a missing clip just stays silent */ }
    }));
  }

  function playClip(name) {
    const buffer = clips[name];
    if (!ctx || !buffer) return;
    if (current) { try { current.stop(); } catch { /* already ended */ } }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(speaker.input);
    src.start();
    current = src;
  }

  function thump(strength) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.5);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.4 + strength * 1.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(filter).connect(gain).connect(master);
    src.start();

    const chirp = ctx.createOscillator();
    chirp.frequency.setValueAtTime(1500, t);
    chirp.frequency.exponentialRampToValueAtTime(600, t + 0.16);
    const chirpGain = ctx.createGain();
    chirpGain.gain.setValueAtTime(0.03, t);
    chirpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    chirp.connect(chirpGain).connect(master);
    chirp.start();
    chirp.stop(t + 0.18);
  }

  let applause = null;

  function stopApplause() {
    if (applause) { try { applause.stop(); } catch { /* already ended */ } }
    applause = null;
  }

  function whistle(at) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(1500, at);
    osc.frequency.exponentialRampToValueAtTime(2700, at + 0.28);
    osc.frequency.exponentialRampToValueAtTime(1900, at + 0.55);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.09, at + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + 0.6);
  }

  /** The cabin claps. A better landing gets a louder, longer round. */
  function clap(score) {
    if (!ctx) return;
    stopApplause();
    const strength = Math.min(1, Math.max(0, score / 100));
    const seconds = 3.5 + strength * 3;
    const samples = renderApplause(ctx.sampleRate, seconds, strength);
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.copyToChannel(samples, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const room = ctx.createBiquadFilter();
    room.type = 'lowpass';
    room.frequency.value = 7000; // heard from inside a cabin
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    src.connect(room).connect(gain).connect(master);
    src.start();
    applause = src;
    if (score >= 90) {
      whistle(ctx.currentTime + 0.7);
      whistle(ctx.currentTime + 1.9);
    }
  }

  /** Two falling tones, repeated: something is very wrong. */
  function alarm() {
    if (!ctx) return;
    for (let i = 0; i < 4; i++) {
      const at = ctx.currentTime + i * 0.3;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(i % 2 ? 620 : 880, at);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.1, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.26);
      osc.connect(gain).connect(master);
      osc.start(at);
      osc.stop(at + 0.28);
    }
  }

  /** A short hiss, repeated while the extinguisher is going. */
  function spray() {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.3);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2400;
    const gain = ctx.createGain();
    gain.gain.value = 0.12;
    src.connect(filter).connect(gain).connect(master);
    src.start();
  }

  /** Distant thunder: a long low rumble. */
  function thunder(strength) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(4);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, t);
    filter.frequency.exponentialRampToValueAtTime(60, t + 3.5);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.9 * strength, t + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 3.8);
    src.connect(filter).connect(gain).connect(master);
    src.start();
  }

  /** Steady rain on the fuselage. */
  let rainGain = null;
  function rainOn(on) {
    if (!ctx) return;
    if (!rainGain) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(2);
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 3200;
      filter.Q.value = 0.4;
      rainGain = ctx.createGain();
      rainGain.gain.value = 0;
      src.connect(filter).connect(rainGain).connect(master);
      src.start();
    }
    rainGain.gain.setTargetAtTime(on ? 0.05 : 0, ctx.currentTime, 0.4);
  }

  function boom() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(4);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, t);
    filter.frequency.exponentialRampToValueAtTime(90, t + 2.6);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(2.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 3.8);
    src.connect(filter).connect(gain).connect(master);
    src.start();

    const low = ctx.createOscillator();
    low.frequency.setValueAtTime(70, t);
    low.frequency.exponentialRampToValueAtTime(24, t + 1.4);
    const lowGain = ctx.createGain();
    lowGain.gain.setValueAtTime(1, t);
    lowGain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    low.connect(lowGain).connect(master);
    low.start();
    low.stop(t + 1.9);

    stopEngines();
  }

  function stopEngines() {
    if (!ctx) return;
    smooth(nodes.engine.gain.gain, 0);
    smooth(nodes.wind.gain.gain, 0);
    smooth(nodes.humGain.gain, 0);
    smooth(nodes.shakerGain.gain, 0);
  }

  const smooth = (param, value) => param.setTargetAtTime(value, ctx.currentTime, 0.08);

  return {
    unlock() {
      try {
        if (!ctx) {
          ctx = new AudioContext();
          buildGraph();
          loadClips();
        }
        ctx.resume();
      } catch {
        ctx = null;
      }
    },

    /** Engines off, but the cabin can still be heard. */
    stopEngines() {
      wantRunning = false;
      stopEngines();
    },

    stopApplause,

    rain(on) {
      rainOn(on);
    },

    setRunning(on) {
      wantRunning = on;
      if (!ctx) return;
      smooth(master.gain, on ? 0.8 : 0.0001);
    },

    handle(e) {
      if (e.type === 'callout') playClip(String(e.value));
      if (e.type === 'gpws') playClip(e.value);
      if (e.type === 'touchdown') thump(Math.min(1, e.sinkFpm / 600));
      if (e.type === 'bounce') thump(0.4);
      if (e.type === 'tailstrike') thump(1);
      if (e.type === 'explode') { wantRunning = false; boom(); }
      if (e.type === 'applause') clap(e.score);
      if (e.type === 'bang') thump(0.8);
      if (e.type === 'hit') thump(0.35);
      if (e.type === 'alarm') alarm();
      if (e.type === 'spray') spray();
      if (e.type === 'thunder') thunder(e.strength ?? 1);
    },

    update(g) {
      if (!ctx || !wantRunning) return;
      const s = g.s;
      const spool = s.spool;
      smooth(nodes.engine.gain.gain, 0.05 + spool * 0.22);
      smooth(nodes.engine.filter.frequency, 280 + spool * 900);
      smooth(nodes.hum.frequency, 70 + spool * 150);
      smooth(nodes.humGain.gain, 0.008 + spool * 0.02);
      smooth(nodes.wind.gain.gain, Math.min(0.1, (s.V / 80) ** 2 * 0.07));
      const shaking = !g.ac.fbw && s.alpha > (g.ac.alphaStall - 1.5) * (Math.PI / 180) && !s.contact.mainL && !s.contact.mainR;
      smooth(nodes.shakerGain.gain, shaking ? 0.11 : 0);
    },
  };
}
