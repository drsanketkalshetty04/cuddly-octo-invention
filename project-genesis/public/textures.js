// Procedural, tileable textures painted at startup (no image assets needed):
// natural ground (grass, rock, sand, snow, dirt), building materials, water.

function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0) / 4294967296); }
function noiseGrid(size, cells, seed) {
  const r = rng(seed), g = Array.from({ length: cells * cells }, r);
  const at = (x, y) => g[(((y % cells) + cells) % cells) * cells + (((x % cells) + cells) % cells)];
  return (x, y) => {
    const fx = (x / size) * cells, fy = (y / size) * cells, x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    const top = a + (b - a) * sx; return top + (c + (d - c) * sx - top) * sy;
  };
}
function fbm(size, seed, oct = 5, base = 4) {
  const ns = Array.from({ length: oct }, (_, i) => noiseGrid(size, base << i, seed + i * 977));
  return (x, y) => { let v = 0, a = 0.5, n = 0; for (const f of ns) { v += f(x, y) * a; n += a; a *= 0.55; } return v / n; };
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * Math.max(0, Math.min(1, t)));

function paint(size, fn) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, gg, b] = fn(x, y), i = (y * size + x) * 4;
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---- natural ground -------------------------------------------------------
export function groundTextures(size = 256) {
  const grain = rng(7);
  const n1 = fbm(size, 11), n2 = fbm(size, 23, 4, 8), n3 = fbm(size, 37, 3, 16);
  const grass = paint(size, (x, y) => {
    const v = n1(x, y), w = n2(x, y), g = grain();
    let c = mix(hex('#34501f'), hex('#5f7a34'), v * 1.1 + (g - 0.5) * 0.45);
    if (w > 0.6) c = mix(c, hex('#8a9a4a'), (w - 0.6) * 2);       // dry patches
    if (n3(x, y) < 0.32) c = mix(c, hex('#2c4a1c'), 0.45);          // clumps
    return c;
  });
  const dirt = paint(size, (x, y) => {
    const v = n1(x + 50, y), g = grain();
    let c = mix(hex('#4a3826'), hex('#7a5f43'), v + (g - 0.5) * 0.5);
    if (g > 0.985) c = hex('#a39a8c');                               // pebbles
    return c;
  });
  const rockN = fbm(size, 51, 6, 4), strata = fbm(size, 61, 3, 2);
  const rock = paint(size, (x, y) => {
    const v = rockN(x, y), s = Math.sin((y + strata(x, y) * 60) * 0.18) * 0.5 + 0.5, g = grain();
    let c = mix(hex('#5d5953'), hex('#9b958a'), v * 0.9 + s * 0.25 + (g - 0.5) * 0.18);
    if (Math.abs(n2(x, y) - 0.5) < 0.012) c = mix(c, hex('#2f2c29'), 0.7);    // cracks
    if (n3(x, y) > 0.7) c = mix(c, hex('#5e6b4a'), 0.3);                         // lichen
    return c;
  });
  const sand = paint(size, (x, y) => {
    const v = n2(x, y), g = grain(), ripple = Math.sin((x * 0.7 + n1(x, y) * 30) * 0.5) * 0.5 + 0.5;
    return mix(hex('#b9a274'), hex('#e3d3a3'), v * 0.6 + ripple * 0.15 + g * 0.3);
  });
  const snow = paint(size, (x, y) => {
    const v = n1(x, y), g = grain();
    return mix(hex('#cfd9e6'), hex('#ffffff'), v * 0.7 + g * 0.35);
  });
  const macroN = fbm(512, 99, 4, 2);
  const macro = paint(512, (x, y) => { const v = macroN(x, y) * 255; return [v, v, v]; });
  return { grass, dirt, rock, sand, snow, macro };
}

// ---- building materials (ids match src/blocks.js) ---------------------------
export function materialTextures(size = 128) {
  const grain = rng(1234);
  const n = fbm(size, 5), m = fbm(size, 9, 4, 8);
  const out = {};
  out[1] = paint(size, (x, y) => { // cut stone blocks
    const row = Math.floor(y / 32), off = row % 2 ? 24 : 0, joint = y % 32 < 2 || (x + off) % 48 < 2;
    return joint ? mix(hex('#5d5a55'), hex('#77736c'), grain()) : mix(hex('#86827a'), hex('#b2ada2'), n(x, y) + (grain() - 0.5) * 0.25);
  });
  out[2] = paint(size, (x, y) => { // timber / log bark
    const s = Math.sin(x * 0.55 + m(x, y) * 9) * 0.5 + 0.5;
    return mix(hex('#3a2817'), hex('#7a5532'), s * 0.6 + n(x, y) * 0.4 + (grain() - 0.5) * 0.15);
  });
  out[3] = paint(size, (x, y) => { // planks
    const row = Math.floor(y / 21), seam = y % 21 === 0 || (x + row * 37) % 128 === 0;
    const c = mix(hex('#8f6538'), hex('#c89d61'), (Math.sin((x + row * 17) * 0.22 + m(x, y) * 6) * 0.5 + 0.5) * 0.55 + n(x, y) * 0.35 + grain() * 0.1);
    return seam ? mix(c, hex('#3d2a15'), 0.75) : c;
  });
  out[4] = paint(size, (x, y) => { // brick
    const row = Math.floor(y / 16), off = row % 2 ? 16 : 0, mortar = y % 16 < 2 || (x + off) % 32 < 2;
    return mortar ? mix(hex('#bfb8aa'), hex('#ddd6c8'), grain()) : mix(hex('#7a2f20'), hex('#b8573c'), n(x, y) * 0.8 + grain() * 0.3);
  });
  out[5] = paint(size, (x, y) => { // glass with frame
    const frame = x < 5 || y < 5 || x > size - 6 || y > size - 6;
    if (frame) return hex('#e9ece8');
    const streak = Math.abs(x - y - 20) < 3 || Math.abs(x - y + 30) < 2;
    return streak ? hex('#ffffff') : mix(hex('#9cc8da'), hex('#d8eef6'), (x + y) / (2 * size));
  });
  out[6] = paint(size, (x, y) => mix(hex('#cfc7b5'), hex('#efe9dc'), n(x, y) * 0.7 + grain() * 0.3)); // plaster
  out[7] = paint(size, (x, y) => { // slate roof tiles
    const row = Math.floor(y / 16), off = row % 2 ? 12 : 0, edge = y % 16 > 13 || (x + off) % 24 < 1;
    return edge ? hex('#1f242b') : mix(hex('#3a414b'), hex('#5a6370'), n(x, y) * 0.7 + grain() * 0.2);
  });
  return out;
}

// ---- water ripples (tileable normal map) -------------------------------------
export function waterNormalCanvas(size = 256) {
  const a = noiseGrid(size, 8, 4242), b = noiseGrid(size, 16, 777), c = noiseGrid(size, 32, 99);
  const h = (x, y) => a(x, y) * 0.55 + b(x, y) * 0.3 + c(x, y) * 0.15;
  return paint(size, (x, y) => {
    const dx = (h(x + 1, y) - h(x - 1, y)) * 6, dy = (h(x, y + 1) - h(x, y - 1)) * 6, l = Math.hypot(dx, dy, 1);
    return [(-dx / l * 0.5 + 0.5) * 255, (-dy / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255];
  });
}
