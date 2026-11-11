// Procedural vegetation and rock geometry, built once and drawn with GPU
// instancing so thousands of trees and tens of thousands of grass blades stay cheap.
import * as THREE from 'three';

function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0) / 4294967296); }

// Merge non-indexed geometries that each carry position/normal/color.
function merge(parts) {
  const geos = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const arrays = geos.map((g) => g.getAttribute(name).array);
    const total = arrays.reduce((n, a) => n + a.length, 0);
    const merged = new Float32Array(total);
    let o = 0; for (const a of arrays) { merged.set(a, o); o += a.length; }
    out.setAttribute(name, new THREE.BufferAttribute(merged, 3));
  }
  out.computeBoundingSphere();
  return out;
}

// Displace vertices with smooth-ish noise (shared positions move together).
// normals: 'flat' (faceted, good for rock), 'sphere' (soft canopy), 'cone' (soft conifer layer)
function lumpy(geo, amount, seed, normals = 'flat') {
  const r = rng(seed), pos = geo.getAttribute('position'), cache = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let d = cache.get(k); if (d === undefined) cache.set(k, d = 1 + (r() - 0.5) * 2 * amount);
    pos.setXYZ(i, pos.getX(i) * d, pos.getY(i) * (1 + (d - 1) * 0.6), pos.getZ(i) * d);
  }
  if (normals === 'flat') { geo.computeVertexNormals(); return geo; }
  const n = new Float32Array(pos.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (normals === 'sphere') v.set(x, y, z); else v.set(x, 0.55 * Math.hypot(x, z) + 0.35, z);
    v.normalize(); n[i * 3] = v.x; n[i * 3 + 1] = v.y; n[i * 3 + 2] = v.z;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return geo;
}

function paintColors(geo, fn) {
  const pos = geo.getAttribute('position'), nrm = geo.getAttribute('normal');
  const col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    fn(c, pos.getX(i), pos.getY(i), pos.getZ(i), nrm.getY(i));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

const bark = (geo, seed) => { const r = rng(seed); return paintColors(geo.toNonIndexed(), (c, x, y) => c.setRGB(0.09 + r() * 0.03, 0.065 + r() * 0.02, 0.045)); };

export function coniferGeometry(lod = 0) {
  if (lod) return coniferLow();
  const r = rng(11);
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.34, 4, 8); trunk.translate(0, 2, 0); parts.push(bark(trunk, 1));
  const layers = 6;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const rad = 2.6 * (1 - t * 0.78), h = 3.2 - t * 1.1;
    let cone = new THREE.ConeGeometry(rad, h, 9, 2, true);
    cone = lumpy(cone.toNonIndexed(), 0.13, 100 + i, 'cone');
    cone.translate(0, 2.4 + i * 1.45 + h / 2, 0);
    const base = 2.4 + i * 1.45;
    parts.push(paintColors(cone, (c, x, y, z, ny) => {
      const k = (y - base) / h; // darker inside/bottom of each layer = fake occlusion
      c.setRGB(0.03 + 0.04 * k + r() * 0.015, 0.075 + 0.075 * k + r() * 0.025, 0.045 + 0.035 * k);
    }));
  }
  return merge(parts);
}

export function broadleafGeometry(lod = 0) {
  if (lod) return broadleafLow();
  const r = rng(29);
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.2, 0.4, 4.6, 8); trunk.translate(0, 2.3, 0); parts.push(bark(trunk, 2));
  for (const [ax, az, len] of [[0.6, 0.2, 2.2], [-0.5, -0.4, 2], [0.1, -0.7, 1.8]]) {
    const b = new THREE.CylinderGeometry(0.08, 0.16, len, 5); b.translate(0, len / 2, 0);
    b.rotateZ(-ax); b.rotateX(az); b.translate(0, 3.6, 0); parts.push(bark(b, 3));
  }
  const blobs = [];
  for (let i = 0; i < 14; i++) { // many small irregular clumps read as foliage, few big ones read as balloons
    const a = i * 2.4, rr = i === 0 ? 0 : 0.8 + r() * 1.5;
    blobs.push([Math.cos(a) * rr, 5.2 + r() * 2.6 - rr * 0.25, Math.sin(a) * rr, 1.05 + r() * 0.7]);
  }
  blobs.forEach(([x, y, z, rad], i) => {
    let g = new THREE.IcosahedronGeometry(rad, 1);
    g = lumpy(g, 0.3, 200 + i, 'sphere');
    g.scale(1, 0.82, 1); g.translate(x, y, z);
    parts.push(paintColors(g, (c, px, py, pz, ny) => {
      const light = 0.55 + 0.45 * Math.max(0, ny) + (py - 5) * 0.05;
      c.setRGB((0.05 + r() * 0.025) * light, (0.12 + r() * 0.04) * light, (0.035 + r() * 0.015) * light);
    }));
  });
  return merge(parts);
}

// Distant-tree stand-ins: ~10% of the triangles, same silhouette and colours.
function coniferLow() {
  const trunk = new THREE.CylinderGeometry(0.2, 0.34, 4, 5); trunk.translate(0, 2, 0);
  const parts = [bark(trunk, 1)];
  [[2.5, 4.6, 2.4], [1.7, 4, 5.6], [0.9, 3, 8.4]].forEach(([r, h, y], i) => {
    const c = new THREE.ConeGeometry(r, h, 7, 1, true); c.translate(0, y + h / 2, 0);
    parts.push(paintColors(lumpy(c.toNonIndexed(), 0.0, 1, 'cone'), (col, x, py) => col.setRGB(0.04 + 0.006 * i, 0.1 + 0.015 * i, 0.055)));
  });
  return merge(parts);
}
function broadleafLow() {
  const trunk = new THREE.CylinderGeometry(0.22, 0.4, 4.6, 5); trunk.translate(0, 2.3, 0);
  const parts = [bark(trunk, 2)];
  [[0, 6.1, 0, 3.1], [0.9, 5.4, -0.7, 2.2]].forEach(([x, y, z, r]) => {
    const g = new THREE.IcosahedronGeometry(r, 0); g.scale(1, 0.8, 1); g.translate(x, y, z);
    parts.push(paintColors(g, (col, px, py, pz, ny) => { const l = 0.6 + 0.4 * Math.max(0, ny); col.setRGB(0.055 * l, 0.13 * l, 0.04 * l); }));
  });
  return merge(parts);
}

export function rockGeometry() {
  let g = new THREE.IcosahedronGeometry(1, 2);
  g = lumpy(g, 0.28, 77); g.scale(1.2, 0.65, 1);
  const r = rng(5);
  return merge([paintColors(g, (c, x, y, z, ny) => { const v = 0.12 + r() * 0.05 + Math.max(0, ny) * 0.05; c.setRGB(v, v * 0.96, v * 0.9); })]);
}

// A single tapered grass blade (3 segments) with a base->tip colour gradient.
export const BLADE_H = 0.45;
export function bladeGeometry() {
  const pos = [], col = [], nrm = [];
  const seg = 3, w = 0.04;
  const P = (i) => { const t = i / seg; return [w * (1 - t) * 0.5, t * BLADE_H, t * t * 0.08]; };
  for (let i = 0; i < seg; i++) {
    const [a, ay, az] = P(i), [b, by, bz] = P(i + 1);
    const quad = [[-a, ay, az], [a, ay, az], [b, by, bz], [-a, ay, az], [b, by, bz], [-b, by, bz]];
    for (const v of quad) {
      pos.push(...v); nrm.push(0, 0.6, -0.8);
      const t = v[1] / BLADE_H; col.push(0.05 + 0.16 * t, 0.09 + 0.2 * t, 0.025 + 0.05 * t);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// Adds wind sway to an instanced vegetation material. `strength` scales by height.
export function addWind(material, uniforms, { strength = 0.25, heightScale = 1 } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 ip = instanceMatrix[3].xz;
      #else
        vec2 ip = vec2(0.0);
      #endif
      float hk = max(0.0, position.y) * ${heightScale.toFixed(4)};
      float sway = sin(uTime * 1.7 + ip.x * 0.35 + ip.y * 0.27) * 0.6 + sin(uTime * 3.1 + ip.x * 0.9) * 0.25;
      transformed.x += sway * ${strength.toFixed(4)} * hk * hk;
      transformed.z += cos(uTime * 1.3 + ip.y * 0.4) * ${(strength * 0.5).toFixed(4)} * hk * hk;
    `);
  };
  material.customProgramCacheKey = () => `wind-${strength}-${heightScale}`;
  return material;
}
