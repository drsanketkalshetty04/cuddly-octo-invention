// Shared, deterministic Earth-like terrain. The SAME file runs on the server
// (movement validation, agent perception) and in the browser (rendering), so
// both always agree on where the ground is. 1 unit = 1 metre.

export const SEA_LEVEL = 20;
export const TREE_CELL = 7; // one candidate tree per 7x7 m cell

export function hash2(seed, x, z) {
  let h = (seed | 0) ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Quintic-interpolated value noise: smooth enough for natural slopes.
function noise(seed, x, z) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = x - x0, fz = z - z0;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash2(seed, x0, z0), b = hash2(seed, x0 + 1, z0), c = hash2(seed, x0, z0 + 1), d = hash2(seed, x0 + 1, z0 + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(seed, x, z, oct) {
  let s = 0, a = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    // rotate each octave to hide grid alignment
    const rx = x * 0.8 - z * 0.6, rz = x * 0.6 + z * 0.8; x = rx; z = rz;
    s += a * noise(seed + i * 1013, x * f, z * f); n += a; a *= 0.5; f *= 2.03;
  }
  return s / n;
}

function ridged(seed, x, z, oct) {
  let s = 0, a = 0.5, f = 1, w = 1;
  for (let i = 0; i < oct; i++) {
    let r = 1 - Math.abs(noise(seed + i * 733, x * f, z * f) * 2 - 1);
    r *= r * w; w = Math.min(1, r * 2);
    s += r * a; a *= 0.5; f *= 2.1;
  }
  return s; // ~0..1
}

const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// Ground elevation in metres at world position (x, z).
export function heightAt(seed, x, z) {
  // Gentle domain warp makes coastlines and valleys look eroded, not blobby.
  const wx = x + (fbm(seed + 91, x / 300, z / 300, 2) - 0.5) * 120;
  const wz = z + (fbm(seed + 92, x / 300, z / 300, 2) - 0.5) * 120;
  const continent = fbm(seed, wx / 1100, wz / 1100, 4);
  const land = smooth(0.36, 0.58, continent);
  const hills = fbm(seed + 1, wx / 160, wz / 160, 5);
  const mountMask = smooth(0.5, 0.75, fbm(seed + 3, wx / 1500, wz / 1500, 3));
  const ridge = ridged(seed + 2, wx / 520, wz / 520, 5);
  const detail = fbm(seed + 4, x / 22, z / 22, 3);
  return SEA_LEVEL - 16 + land * 21 + hills * 16 * (0.35 + land) + ridge * ridge * 140 * mountMask * land + (detail - 0.5) * 1.6;
}

export function moistureAt(seed, x, z) { return fbm(seed + 17, x / 600, z / 600, 3); }

// Surface normal y-component (1 = flat, 0 = vertical cliff).
export function flatnessAt(seed, x, z) {
  const e = 1, dx = heightAt(seed, x + e, z) - heightAt(seed, x - e, z), dz = heightAt(seed, x, z + e) - heightAt(seed, x, z - e);
  return 2 * e / Math.hypot(dx, 2 * e, dz);
}

export function biomeAt(seed, x, z) {
  const h = heightAt(seed, x, z);
  if (h < SEA_LEVEL - 0.3) return 'water';
  if (h < SEA_LEVEL + 1.5) return 'beach';
  if (h > 105) return 'snow';
  if (h > 75) return 'mountain';
  return moistureAt(seed, x, z) > 0.52 ? 'forest' : 'grassland';
}

// Deterministic natural tree placement. Returns null or a tree description.
export function treeInCell(seed, cx, cz) {
  const r = hash2(seed ^ 0x7ee5, cx, cz);
  const x = (cx + 0.15 + 0.7 * hash2(seed ^ 0x1111, cx, cz)) * TREE_CELL;
  const z = (cz + 0.15 + 0.7 * hash2(seed ^ 0x2222, cx, cz)) * TREE_CELL;
  const h = heightAt(seed, x, z);
  if (h < SEA_LEVEL + 2 || h > 92) return null;
  const m = moistureAt(seed, x, z);
  const density = m > 0.52 ? 0.55 : 0.07;
  if (r > density) return null;
  if (flatnessAt(seed, x, z) < 0.82) return null;
  const conifer = h > 52 || hash2(seed ^ 0x3333, cx, cz) < (m > 0.6 ? 0.55 : 0.25);
  return { x, z, y: h, type: conifer ? 'conifer' : 'broadleaf', scale: 0.75 + 0.6 * hash2(seed ^ 0x4444, cx, cz), rot: r * 40 };
}

export const TRUNK_RADIUS = 0.35;
