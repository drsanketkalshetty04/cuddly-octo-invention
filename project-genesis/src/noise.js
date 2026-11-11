// Deterministic, dependency-free 2D value noise. Same seed => same world on
// every server, which is what lets us store only *edits* instead of chunks.

export function hash2(seed, x, z) {
  let h = (seed | 0) ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296; // [0,1)
}

const smooth = (t) => t * t * (3 - 2 * t);

export function valueNoise(seed, x, z) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const tx = smooth(x - x0), tz = smooth(z - z0);
  const a = hash2(seed, x0, z0), b = hash2(seed, x0 + 1, z0);
  const c = hash2(seed, x0, z0 + 1), d = hash2(seed, x0 + 1, z0 + 1);
  const top = a + (b - a) * tx, bot = c + (d - c) * tx;
  return top + (bot - top) * tz;
}

export function fbm(seed, x, z, octaves = 4) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(seed + i * 1013, x * freq, z * freq);
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return sum / norm; // [0,1)
}
