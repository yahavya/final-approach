// Renders a crowd clapping into a sample buffer. Pure maths, so it can be tested
// without audio hardware. Each clap is a very short burst of high noise; the
// crowd is a couple of hundred of them, thickening fast and then thinning out.

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Clap density over time, from 0 to 1: a quick swell, then a slow fade. */
export const crowdShape = (t) => Math.min(1, t / 0.5) * Math.min(1, Math.max(0, (1 - t) / 0.55)) ** 1.4;

/**
 * strength runs from 0 to 1: a thin polite patter up to a full cabin.
 * Returns a Float32Array of samples between -1 and 1.
 */
export function renderApplause(sampleRate, seconds, strength, seed = 12345) {
  const rnd = seeded(seed);
  const samples = new Float32Array(Math.floor(sampleRate * seconds));
  const clapsPerSecond = 25 + strength * 75;
  const expected = Math.floor(clapsPerSecond * seconds);
  const length = Math.floor(sampleRate * 0.012);

  for (let i = 0; i < expected * 3; i++) {
    const at = rnd() * seconds;
    if (rnd() > crowdShape(at / seconds)) continue;
    const start = Math.floor(at * sampleRate);
    const loudness = (0.25 + rnd() * 0.75) * 0.3;
    const brightness = 0.55 + rnd() * 0.4; // hands differ
    let previous = 0;
    for (let n = 0; n < length && start + n < samples.length; n++) {
      const noise = rnd() * 2 - 1;
      const high = noise - previous * brightness; // keeps the crack of the clap
      previous = noise;
      samples[start + n] += high * loudness * Math.exp(-n / (length * 0.28));
    }
  }

  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const gain = peak > 0 ? (0.45 + strength * 0.5) / peak : 1;
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return samples;
}
