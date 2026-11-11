import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { heightAt, treeInCell, TREE_CELL, SEA_LEVEL, moistureAt, hash2, TRUNK_RADIUS, biomeAt } from './terrain.js';
import { groundTextures, materialTextures, waterNormalCanvas } from './textures.js';
import { coniferGeometry, broadleafGeometry, rockGeometry, bladeGeometry, addWind, BLADE_H } from './nature.js';

// ------------------------------------------------------------------ helpers
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
const $ = (id) => document.getElementById(id);
const IS_TOUCH = matchMedia('(hover: none) and (pointer: coarse)').matches;
// Quality presets. ?quality=low|high overrides auto-detection.
const QUALITY = new URLSearchParams(location.search).get('quality') || (IS_TOUCH ? 'low' : 'high');
const Q = QUALITY === 'low' ? { view: 6, trees: 3, grass: 14000, grassR: 16, shadow: 1024, water: 256, pr: 1.25 }
                            : { view: 9, trees: 5, grass: 45000, grassR: 26, shadow: 2048, water: 512, pr: 2 };
// Layer 0: drawn everywhere (main view, shadows, water reflection).
// Layer 1 (DETAIL): main view only — far trees and grass skip the expensive passes.
const DETAIL = 1;

// ------------------------------------------------------------------ constants
const TILE = 64;                       // terrain tile size (m)
const CHUNK = 16;                      // structure shard (m), matches server
const STRUCT_RADIUS = 6;               // structure chunks around player
const GRAVITY = 24, JUMP_V = 7.2, WALK = 4.6, RUN = 8.5;
const PW = 0.3, PH = 1.8, EYE = 1.65, REACH = 7;

// ------------------------------------------------------------------ state
const S = {
  token: store.get('genesis_token'),
  ws: null, world: null, me: null, seed: 0,
  tiles: new Map(), structures: new Map(), structMeshes: new Map(), pending: new Set(),
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: -0.08, onGround: false, swimming: false,
  keys: new Set(), stick: { x: 0, y: 0 }, selected: 1, others: new Map(), thirdPerson: false,
  lastSent: 0, lastSentPos: new THREE.Vector3(), tick: 0, connected: false, chatting: false,
};
window.__genesis = S; // for e2e tests / debugging
const ground = (x, z) => heightAt(S.seed, x, z);
S.ground = ground;

// ------------------------------------------------------------------ renderer / scene
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2('#b9cde0', 0.0019);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 5000);
camera.layers.enable(DETAIL);
const uniforms = { uTime: { value: 0 } };

// Atmosphere: physically based sky + baked image-based lighting from it.
const sky = new Sky(); sky.scale.setScalar(4500); scene.add(sky);
const skyU = sky.material.uniforms;
skyU.turbidity.value = 4.5; skyU.rayleigh.value = 1.4; skyU.mieCoefficient.value = 0.004; skyU.mieDirectionalG.value = 0.82;
const envSky = new Sky(); envSky.scale.setScalar(50);
const envScene = new THREE.Scene(); envScene.add(envSky);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;

const hemi = new THREE.HemisphereLight('#cfe3ff', '#4d5a3a', 0.7); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1dc', 3);
sun.castShadow = true;
sun.shadow.mapSize.set(Q.shadow, Q.shadow);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 500 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);

// Clouds: a high, slowly drifting translucent layer.
const cloudTex = (() => {
  const size = 512, c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size);
  const cells = [8, 16, 32, 64], grids = cells.map((n, i) => { const a = new Float32Array(n * n); for (let j = 0; j < a.length; j++) a[j] = hash2(900 + i, j, i); return a; });
  const smp = (gi, x, y) => { const n = cells[gi], gx = x / size * n, gy = y / size * n, x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
    const at = (a, b) => grids[gi][((b % n + n) % n) * n + ((a % n + n) % n)];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = smp(0, x, y) * 0.5 + smp(1, x, y) * 0.28 + smp(2, x, y) * 0.14 + smp(3, x, y) * 0.08;
    const a = Math.max(0, Math.min(1, (v - 0.52) * 3.2)), i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a * 235;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const clouds = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false }));
clouds.rotation.x = Math.PI / 2; clouds.position.y = 420; clouds.renderOrder = -1; scene.add(clouds);

// Ocean with real-time reflections.
const waterNormals = new THREE.CanvasTexture(waterNormalCanvas());
waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
const water = new Water(new THREE.PlaneGeometry(9000, 9000), {
  textureWidth: Q.water, textureHeight: Q.water, waterNormals,
  sunDirection: new THREE.Vector3(0, 1, 0), sunColor: 0xffffff, waterColor: 0x0b3a4c,
  distortionScale: 2.4, fog: true,
});
water.rotation.x = -Math.PI / 2; water.position.y = SEA_LEVEL - 0.05;
water.material.uniforms.size.value = 6;
scene.add(water);

// ------------------------------------------------------------------ terrain material
const gt = groundTextures();
const tex = (canvas, srgb = true) => {
  const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t;
};
const terrainU = {
  tGrass: { value: tex(gt.grass) }, tDirt: { value: tex(gt.dirt) }, tRock: { value: tex(gt.rock) },
  tSand: { value: tex(gt.sand) }, tSnow: { value: tex(gt.snow) }, tMacro: { value: tex(gt.macro, false) },
  uSea: { value: SEA_LEVEL },
};
const terrainMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
terrainMat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, terrainU);
  sh.vertexShader = 'varying vec3 vWPos; varying vec3 vWNrm;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal);`);
  sh.fragmentShader = `varying vec3 vWPos; varying vec3 vWNrm;
    uniform sampler2D tGrass, tDirt, tRock, tSand, tSnow, tMacro; uniform float uSea;\n` + sh.fragmentShader.replace('#include <map_fragment>', `
    vec2 uvW = vWPos.xz * 0.22;
    float macro = texture2D(tMacro, vWPos.xz * 0.0021).r;
    float macro2 = texture2D(tMacro, vWPos.xz * 0.013 + 0.5).r;
    vec3 grass = mix(texture2D(tGrass, uvW).rgb, texture2D(tGrass, uvW * 0.23 + 0.31).rgb, 0.5);
    vec3 dirt = texture2D(tDirt, uvW).rgb;
    vec3 bw = pow(abs(vWNrm), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
    vec3 rock = texture2D(tRock, vWPos.zy * 0.09).rgb * bw.x + texture2D(tRock, vWPos.xz * 0.09).rgb * bw.y + texture2D(tRock, vWPos.xy * 0.09).rgb * bw.z;
    vec3 sand = texture2D(tSand, uvW * 0.9).rgb;
    vec3 snow = texture2D(tSnow, uvW * 0.5).rgb;
    float slope = 1.0 - vWNrm.y, h = vWPos.y;
    vec3 col = mix(grass, dirt, smoothstep(0.5, 0.78, macro2) * 0.7);
    col *= mix(0.82, 1.15, macro);
    col = mix(col, sand, 1.0 - smoothstep(uSea + 0.7, uSea + 2.6, h + (macro2 - 0.5) * 1.6));
    col = mix(col, rock, smoothstep(0.26, 0.4, slope + (macro2 - 0.5) * 0.12));
    col = mix(col, rock * 0.92, smoothstep(70.0, 90.0, h + macro * 12.0) * 0.85);
    col = mix(col, snow, smoothstep(96.0, 108.0, h + macro * 14.0) * (1.0 - smoothstep(0.38, 0.62, slope)));
    col *= mix(1.0, 0.5, 1.0 - smoothstep(uSea - 2.5, uSea + 0.25, h));
    diffuseColor.rgb *= col;`);
};

function buildTile(tx, tz, step) {
  const n = TILE / step + 1, x0 = tx * TILE, z0 = tz * TILE;
  const H = new Float32Array((n + 2) * (n + 2));
  for (let j = 0; j < n + 2; j++) for (let i = 0; i < n + 2; i++) H[j * (n + 2) + i] = ground(x0 + (i - 1) * step, z0 + (j - 1) * step);
  const h = (i, j) => H[(j + 1) * (n + 2) + (i + 1)];
  const skirt = 4 * n - 4;
  const pos = new Float32Array((n * n + skirt) * 3), nrm = new Float32Array((n * n + skirt) * 3);
  const idx = [];
  const v = new THREE.Vector3();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = (j * n + i) * 3;
    pos[k] = x0 + i * step; pos[k + 1] = h(i, j); pos[k + 2] = z0 + j * step;
    v.set(h(i - 1, j) - h(i + 1, j), 2 * step, h(i, j - 1) - h(i, j + 1)).normalize();
    nrm[k] = v.x; nrm[k + 1] = v.y; nrm[k + 2] = v.z;
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // Skirts hide cracks between tiles of different detail.
  const ring = [];
  for (let i = 0; i < n; i++) ring.push(i);
  for (let j = 1; j < n; j++) ring.push(j * n + n - 1);
  for (let i = n - 2; i >= 0; i--) ring.push((n - 1) * n + i);
  for (let j = n - 2; j >= 1; j--) ring.push(j * n);
  ring.forEach((src, r) => {
    const k = (n * n + r) * 3;
    pos[k] = pos[src * 3]; pos[k + 1] = pos[src * 3 + 1] - step * 1.5 - 1; pos[k + 2] = pos[src * 3 + 2];
    nrm[k] = nrm[src * 3]; nrm[k + 1] = nrm[src * 3 + 1]; nrm[k + 2] = nrm[src * 3 + 2];
  });
  for (let r = 0; r < ring.length; r++) {
    const a = ring[r], b = ring[(r + 1) % ring.length], as = n * n + r, bs = n * n + (r + 1) % ring.length;
    idx.push(a, b, as, b, bs, as, a, as, b, b, as, bs); // both windings: skirt visible from either side
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, terrainMat);
  m.receiveShadow = true; m.castShadow = step === 1;
  m.matrixAutoUpdate = false;
  return m;
}

// ------------------------------------------------------------------ vegetation
const vegMat = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }), uniforms, { strength: 0.03, heightScale: 0.13 });
const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
const GEO = { conifer: [coniferGeometry(0), coniferGeometry(1)], broadleaf: [broadleafGeometry(0), broadleafGeometry(1)], rock: rockGeometry() };
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpC = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);

function buildVegetation(tx, tz, near) {
  const x0 = tx * TILE, z0 = tz * TILE, list = { conifer: [], broadleaf: [] };
  const c0x = Math.floor(x0 / TREE_CELL) - 1, c1x = Math.floor((x0 + TILE) / TREE_CELL) + 1;
  const c0z = Math.floor(z0 / TREE_CELL) - 1, c1z = Math.floor((z0 + TILE) / TREE_CELL) + 1;
  for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
    const t = treeInCell(S.seed, cx, cz);
    if (t && t.x >= x0 && t.x < x0 + TILE && t.z >= z0 && t.z < z0 + TILE) list[t.type].push(t);
  }
  const group = new THREE.Group();
  for (const type of ['conifer', 'broadleaf']) {
    if (!list[type].length) continue;
    const im = new THREE.InstancedMesh(GEO[type][near ? 0 : 1], vegMat, list[type].length);
    list[type].forEach((t, i) => {
      tmpQ.setFromAxisAngle(UP, t.rot);
      tmpS.set(t.scale, t.scale * (0.9 + hash2(7, t.x | 0, t.z | 0) * 0.35), t.scale);
      im.setMatrixAt(i, tmpM.compose(tmpP.set(t.x, t.y - 0.3, t.z), tmpQ, tmpS));
      { const v = 0.8 + hash2(3, t.x | 0, t.z | 0) * 0.4, w = (hash2(9, t.x | 0, t.z | 0) - 0.5) * 0.25; im.setColorAt(i, tmpC.setRGB(v * (1 + w), v, v * (1 - w * 0.5))); }
    });
    im.castShadow = near; im.receiveShadow = true;
    if (!near) im.layers.set(DETAIL);
    group.add(im);
  }
  // Boulders: more on slopes and mountains.
  const rocks = [];
  for (let i = 0; i < 14; i++) {
    const x = x0 + hash2(S.seed ^ 0xb01d, tx * 31 + i, tz) * TILE, z = z0 + hash2(S.seed ^ 0xb01e, tx, tz * 31 + i) * TILE;
    const y = ground(x, z);
    if (y < SEA_LEVEL - 1) continue;
    const steep = Math.abs(ground(x + 2, z) - ground(x - 2, z)) + Math.abs(ground(x, z + 2) - ground(x, z - 2));
    if (hash2(S.seed ^ 0xb01f, tx * 7 + i, tz * 13) > (y > 70 ? 0.9 : steep > 2 ? 0.6 : 0.12)) continue;
    rocks.push([x, y, z, 0.4 + hash2(1, i, tx) * (y > 70 ? 2.6 : 1.4), hash2(2, i, tz) * 6]);
  }
  if (rocks.length) {
    const im = new THREE.InstancedMesh(GEO.rock, rockMat, rocks.length);
    rocks.forEach(([x, y, z, s, r], i) => im.setMatrixAt(i, tmpM.compose(tmpP.set(x, y - s * 0.25, z), tmpQ.setFromAxisAngle(UP, r), tmpS.set(s, s, s))));
    im.castShadow = true; im.receiveShadow = true;
    group.add(im);
  }
  return group;
}

// Wind-swept grass around the player, regenerated as you move.
const grassMat = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), uniforms, { strength: 0.35, heightScale: 1 / BLADE_H });
const grass = new THREE.InstancedMesh(bladeGeometry(), grassMat, Q.grass);
grass.receiveShadow = true; grass.frustumCulled = false; grass.count = 0; grass.layers.set(DETAIL); scene.add(grass);
const grassCenter = new THREE.Vector3(1e9, 0, 1e9);
function rebuildGrass() {
  grassCenter.copy(S.pos);
  const R = Q.grassR, sp = Math.sqrt((Math.PI * R * R) / Q.grass) * 0.92;
  let n = 0;
  const gx0 = Math.floor((S.pos.x - R) / sp), gx1 = Math.ceil((S.pos.x + R) / sp);
  const gz0 = Math.floor((S.pos.z - R) / sp), gz1 = Math.ceil((S.pos.z + R) / sp);
  for (let gz = gz0; gz <= gz1 && n < Q.grass; gz++) for (let gx = gx0; gx <= gx1 && n < Q.grass; gx++) {
    const x = (gx + hash2(41, gx, gz)) * sp, z = (gz + hash2(43, gx, gz)) * sp;
    const d = Math.hypot(x - S.pos.x, z - S.pos.z);
    if (d > R) continue;
    const y = ground(x, z);
    if (y < SEA_LEVEL + 1.3 || y > 72) continue;
    const slope = Math.abs(ground(x + 0.6, z) - y) + Math.abs(ground(x, z + 0.6) - y);
    if (slope > 0.42) continue;
    if (hash2(47, gx, gz) > 0.35 + moistureAt(S.seed, x, z) * 0.9) continue;
    const s = 0.5 + hash2(53, gx, gz) * 0.8;
    grass.setMatrixAt(n, tmpM.compose(tmpP.set(x, y - 0.03, z), tmpQ.setFromAxisAngle(UP, hash2(59, gx, gz) * 6.3), tmpS.set(1, s, 1)));
    { const v = 0.75 + hash2(67, gx, gz) * 0.5, w = (hash2(61, gx, gz) - 0.3) * 0.5; grass.setColorAt(n, tmpC.setRGB(v * (1 + w), v, v * (1 - w * 0.6))); }
    n++;
  }
  grass.count = n;
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
}

// ------------------------------------------------------------------ world streaming
const TK = (x, z) => `${x},${z}`;
function lodFor(d) { return d <= 1 ? 1 : d <= 3 ? 2 : d <= 6 ? 4 : 8; }
function updateTiles(budgetMs = 10) {
  const ptx = Math.floor(S.pos.x / TILE), ptz = Math.floor(S.pos.z / TILE);
  const want = [];
  for (let dz = -Q.view; dz <= Q.view; dz++) for (let dx = -Q.view; dx <= Q.view; dx++) {
    if (dx * dx + dz * dz > (Q.view + 0.5) ** 2) continue;
    const d = Math.max(Math.abs(dx), Math.abs(dz));
    want.push([d, ptx + dx, ptz + dz]);
  }
  want.sort((a, b) => a[0] - b[0]);
  const keep = new Set();
  const t0 = performance.now();
  for (const [d, tx, tz] of want) {
    const k = TK(tx, tz); keep.add(k);
    let t = S.tiles.get(k);
    const step = lodFor(d), needVeg = d <= Q.trees, near = d <= 1;
    if (t && t.step === step && !!t.veg === needVeg && (!t.veg || t.near === near)) continue;
    if (performance.now() - t0 > budgetMs) continue;
    if (!t) { t = { step: 0, mesh: null, veg: null }; S.tiles.set(k, t); }
    if (t.step !== step) {
      const m = buildTile(tx, tz, step);
      if (t.mesh) { scene.remove(t.mesh); t.mesh.geometry.dispose(); }
      t.mesh = m; t.step = step; scene.add(m);
    }
    if (t.veg && t.near !== near) { scene.remove(t.veg); t.veg.children.forEach((c) => c.dispose()); t.veg = null; }
    if (needVeg && !t.veg) { t.veg = buildVegetation(tx, tz, near); t.near = near; scene.add(t.veg); }
    if (!needVeg && t.veg) { scene.remove(t.veg); t.veg.children.forEach((c) => c.dispose()); t.veg = null; }
  }
  for (const [k, t] of S.tiles) if (!keep.has(k)) {
    if (t.mesh) { scene.remove(t.mesh); t.mesh.geometry.dispose(); }
    if (t.veg) { scene.remove(t.veg); t.veg.children.forEach((c) => c.dispose()); }
    S.tiles.delete(k);
  }
}

// ------------------------------------------------------------------ structures
const mt = materialTextures();
const boxGeo = new THREE.BoxGeometry(1, 1, 1); boxGeo.translate(0.5, 0.5, 0.5);
const MATS = {};
for (const [id, c] of Object.entries(mt)) {
  const glass = Number(id) === 5;
  MATS[id] = new THREE.MeshStandardMaterial({
    map: tex(c), roughness: glass ? 0.05 : Number(id) === 7 ? 0.6 : 0.85, metalness: glass ? 0.2 : 0,
    transparent: glass, opacity: glass ? 0.45 : 1, depthWrite: !glass,
  });
}
const cellKey = (x, y, z) => `${x},${y},${z}`;
function structAt(x, y, z) {
  x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
  const c = S.structures.get(TK(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
  return c ? (c.get(cellKey(x, y, z)) ?? 0) : 0;
}
function buildStructChunk(cx, cz) {
  const k = TK(cx, cz), c = S.structures.get(k);
  const old = S.structMeshes.get(k);
  if (old) { scene.remove(old); old.children.forEach((m) => m.dispose()); S.structMeshes.delete(k); }
  if (!c || !c.size) return;
  const byMat = new Map();
  for (const [key, b] of c) { if (!byMat.has(b)) byMat.set(b, []); byMat.get(b).push(key.split(',').map(Number)); }
  const g = new THREE.Group();
  for (const [b, cells] of byMat) {
    const im = new THREE.InstancedMesh(boxGeo, MATS[b] ?? MATS[1], cells.length);
    cells.forEach(([x, y, z], i) => im.setMatrixAt(i, tmpM.makeTranslation(x, y, z)));
    im.castShadow = b !== 5; im.receiveShadow = true;
    g.add(im);
  }
  scene.add(g); S.structMeshes.set(k, g);
}
function requestStructures() {
  if (!S.connected) return;
  const pcx = Math.floor(S.pos.x / CHUNK), pcz = Math.floor(S.pos.z / CHUNK);
  const want = [];
  for (let dz = -STRUCT_RADIUS; dz <= STRUCT_RADIUS; dz++) for (let dx = -STRUCT_RADIUS; dx <= STRUCT_RADIUS; dx++) {
    const k = TK(pcx + dx, pcz + dz);
    if (!S.structures.has(k) && !S.pending.has(k)) want.push([dx * dx + dz * dz, pcx + dx, pcz + dz]);
  }
  want.sort((a, b) => a[0] - b[0]);
  for (const [, cx, cz] of want.slice(0, 24)) { S.pending.add(TK(cx, cz)); send({ t: 'chunk', cx, cz }); }
  for (const k of [...S.structures.keys()]) {
    const [cx, cz] = k.split(',').map(Number);
    if (Math.abs(cx - pcx) > STRUCT_RADIUS + 2 || Math.abs(cz - pcz) > STRUCT_RADIUS + 2) {
      S.structures.delete(k); buildStructChunk(cx, cz);
    }
  }
}
function onChunk(m) {
  const k = TK(m.cx, m.cz); S.pending.delete(k);
  const c = new Map(); for (const [x, y, z, b] of m.blocks) c.set(cellKey(x, y, z), b);
  S.structures.set(k, c); buildStructChunk(m.cx, m.cz);
}
function onBlock({ x, y, z, block }) {
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), c = S.structures.get(TK(cx, cz));
  if (!c) return;
  if (block) c.set(cellKey(x, y, z), block); else c.delete(cellKey(x, y, z));
  buildStructChunk(cx, cz);
}

// ------------------------------------------------------------------ avatars
function makeLabel(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 28px system-ui, sans-serif'; g.textAlign = 'center';
  const w = Math.min(250, g.measureText(text).width + 24);
  g.fillStyle = 'rgba(10,14,24,.55)'; g.beginPath(); g.roundRect(128 - w / 2, 12, w, 40, 20); g.fill();
  g.fillStyle = color; g.fillText(text, 128, 42);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, fog: false }));
  s.scale.set(1.6, 0.4, 1); s.position.y = 2.15; s.renderOrder = 10;
  return s;
}
const SKIN = ['#f1c7a5', '#d9a47c', '#b57a52', '#8a5636', '#5e3a24'];
function makeAvatar(e, label = true) {
  const agent = e.kind === 'agent';
  const hue = (e.id * 0.618034) % 1;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
  const shirt = agent ? std('#e9edf2', { roughness: 0.25, metalness: 0.35 }) : std(new THREE.Color().setHSL(hue, 0.45, 0.4));
  const pants = agent ? std('#2b3138', { roughness: 0.35, metalness: 0.5 }) : std(new THREE.Color().setHSL((hue + 0.55) % 1, 0.3, 0.22));
  const skin = agent ? std('#d6dbe2', { roughness: 0.3, metalness: 0.4 }) : std(SKIN[e.id % SKIN.length], { roughness: 0.6 });
  const shoe = std('#1d1a17');
  const mesh = (geo, m, y = 0) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.castShadow = true; return o; };
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10);
  const limb = (r, l, m, x, y, footM) => {
    const p = new THREE.Group(); p.position.set(x, y, 0);
    p.add(mesh(cap(r, l), m, -(l / 2 + r)));
    if (footM) { const f = mesh(new THREE.BoxGeometry(r * 2.2, 0.08, r * 3.4), footM, -(l + r * 2) + 0.04); f.position.z = -r * 0.6; p.add(f); }
    return p;
  };
  const g = new THREE.Group();
  const legL = limb(0.085, 0.62, pants, -0.11, 0.86, shoe), legR = limb(0.085, 0.62, pants, 0.11, 0.86, shoe);
  const torso = mesh(cap(0.2, 0.36), shirt, 1.16); torso.scale.set(1, 1, 0.68);
  const armL = limb(0.06, 0.5, shirt, -0.27, 1.42), armR = limb(0.06, 0.5, shirt, 0.27, 1.42);
  armL.add(mesh(new THREE.SphereGeometry(0.055, 8, 8), skin, -0.66)); armR.add(mesh(new THREE.SphereGeometry(0.055, 8, 8), skin, -0.66));
  const neck = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), skin, 1.5);
  const head = mesh(new THREE.SphereGeometry(0.13, 18, 14), skin, 1.66); head.scale.set(0.9, 1.08, 1);
  if (agent) {
    const visor = mesh(new THREE.SphereGeometry(0.125, 18, 8, Math.PI * 1.15, Math.PI * 0.7, Math.PI * 0.38, Math.PI * 0.2),
      new THREE.MeshStandardMaterial({ color: '#00e1ff', emissive: '#00d5ff', emissiveIntensity: 3 }), 0);
    visor.castShadow = false; visor.scale.setScalar(1.04); head.add(visor);
  } else {
    const hair = mesh(new THREE.SphereGeometry(0.137, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      std(new THREE.Color().setHSL(0.07, 0.4, 0.08 + (e.id % 4) * 0.08), { roughness: 0.9 }), 0.012);
    hair.rotation.x = 0.25; head.add(hair);
  }
  g.add(legL, legR, torso, armL, armR, neck, head);
  if (label) g.add(makeLabel(e.name + (agent ? '  ◆ AI' : ''), agent ? '#8af0ff' : '#ffffff'));
  return { group: g, legL, legR, armL, armR };
}
function upsertOther(e) {
  if (e.id === S.me?.id) return;
  let o = S.others.get(e.id);
  if (!o) {
    const av = makeAvatar(e);
    av.group.position.set(e.x, e.y, e.z);
    scene.add(av.group);
    o = { ...av, target: new THREE.Vector3(e.x, e.y, e.z), yaw: e.yaw, kind: e.kind, name: e.name, walk: 0 };
    S.others.set(e.id, o);
  }
  o.target.set(e.x, e.y, e.z); o.yaw = e.yaw;
}
function removeOther(id) {
  const o = S.others.get(id); if (!o) return;
  scene.remove(o.group);
  o.group.traverse((n) => { n.geometry?.dispose(); n.material?.map?.dispose(); n.material?.dispose(); });
  S.others.delete(id);
}
let selfAvatar = null;
function animateAvatar(a, speed, dt) {
  a.walk = (a.walk ?? 0) + dt * 8 * Math.min(1, speed / 3);
  const k = Math.min(1, speed / 2), swing = Math.sin(a.walk) * 0.6 * k;
  a.legL.rotation.x = swing; a.legR.rotation.x = -swing;
  a.armL.rotation.x = -swing * 0.8; a.armR.rotation.x = swing * 0.8;
}

// ------------------------------------------------------------------ day / night (shared world clock)
const DAY_TICKS = 12000; // 20 real minutes per day
const sunDir = new THREE.Vector3();
const fogDay = new THREE.Color('#b9cde0'), fogDusk = new THREE.Color('#d8a27c'), fogNight = new THREE.Color('#0a1322');
const cloudDay = new THREE.Color('#ffffff'), cloudNight = new THREE.Color('#2a3344');
let lastEnvElev = 999;
function updateDaylight(tick) {
  const phase = ((tick % DAY_TICKS) + DAY_TICKS) % DAY_TICKS / DAY_TICKS;
  const elev = 70 * Math.sin(phase * Math.PI * 2) + 22;
  const az = 110 + phase * 160;
  sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(az));
  skyU.sunPosition.value.copy(sunDir);
  const eu = envSky.material.uniforms; eu.sunPosition.value.copy(sunDir);
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) eu[k].value = skyU[k].value;
  const day = THREE.MathUtils.smoothstep(elev, -5, 12);
  const dusk = 1 - THREE.MathUtils.smoothstep(Math.abs(elev - 3), 0, 18);
  sun.intensity = 3.4 * day;
  sun.color.setHSL(0.08, 0.15 + 0.75 * dusk, 0.6 + 0.3 * (1 - dusk));
  hemi.intensity = 0.12 + 0.6 * day;
  scene.environmentIntensity = 0.2 + 0.5 * day;
  renderer.toneMappingExposure = 0.42 + 0.16 * day;
  scene.fog.color.copy(fogNight).lerp(fogDay, day).lerp(fogDusk, dusk * 0.5);
  clouds.material.color.copy(cloudNight).lerp(cloudDay, day).lerp(fogDusk, dusk * 0.35);
  water.material.uniforms.sunDirection.value.copy(sunDir);
  water.material.uniforms.sunColor.value.copy(sun.color).multiplyScalar(day);
  if (Math.abs(elev - lastEnvElev) > 1.5) {
    lastEnvElev = elev;
    const next = pmrem.fromScene(envScene, 0, 0.1, 100);
    scene.environment = next.texture; envRT?.dispose(); envRT = next;
  }
  S.timeOfDay = `${String(Math.floor(((phase * 24) + 6) % 24)).padStart(2, '0')}:${String(Math.floor((phase * 24 * 60) % 60)).padStart(2, '0')}`;
}
updateDaylight(0);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ------------------------------------------------------------------ chat
function logChat(nodes, cls) {
  const d = document.createElement('div'); d.className = cls || ''; d.append(...nodes);
  const log = $('chatLog'); log.append(d);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
function chatLine(m) {
  const b = document.createElement('b'); b.textContent = m.name + (m.kind === 'agent' ? ' ◆' : '') + ': ';
  logChat([b, document.createTextNode(m.text)], m.kind);
}
const sys = (t) => logChat([document.createTextNode(t)], 'sys');

// ------------------------------------------------------------------ network
function send(o) { if (S.ws?.readyState === 1) S.ws.send(JSON.stringify(o)); }
function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  S.ws = ws;
  ws.onopen = () => ws.send(JSON.stringify({ t: 'auth', token: S.token }));
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    switch (m.t) {
      case 'welcome': {
        S.me = m.account; S.world = m.world; S.seed = m.world.seed; S.tick = m.world.tick;
        S.pos.set(m.self.x, m.self.y, m.self.z); S.yaw = m.self.yaw || 0; S.lastSentPos.copy(S.pos);
        S.connected = true; S.pending.clear();
        for (const e of m.entities) upsertOther(e);
        $('gate').hidden = true; $('hud').hidden = false; $('banner').hidden = true;
        buildHotbar();
        updateTiles(120); rebuildGrass();
        sys(`Welcome, ${m.account.name}. Humans and AI inhabitants (◆) share this world.`);
        requestStructures();
        break;
      }
      case 'snapshot': {
        S.tick = m.tick;
        const seen = new Set();
        for (const e of m.entities) { seen.add(e.id); upsertOther(e); }
        for (const id of [...S.others.keys()]) if (!seen.has(id)) removeOther(id);
        break;
      }
      case 'join': if (m.entity.id !== S.me?.id) sys(`${m.entity.name}${m.entity.kind === 'agent' ? ' (AI)' : ''} arrived.`); break;
      case 'leave': { const o = S.others.get(m.id); if (o) sys(`${o.name} left.`); removeOther(m.id); break; }
      case 'chat': chatLine(m); break;
      case 'chunk': onChunk(m); break;
      case 'block': onBlock(m); break;
      case 'correct': S.pos.set(m.self.x, m.self.y, m.self.z); S.vel.set(0, 0, 0); S.lastSentPos.copy(S.pos); break;
      case 'error': if (m.req !== 'move') sys(m.error); break;
    }
  };
  ws.onclose = (ev) => {
    S.connected = false;
    if (ev.code === 4003) { store.del('genesis_token'); S.token = null; showGate('Your session expired. Please sign in again.'); return; }
    if (!S.me) { showGate('Could not connect to the world server.'); return; }
    $('banner').textContent = 'Connection lost. Reconnecting…'; $('banner').hidden = false;
    setTimeout(connect, 2000);
  };
}

// ------------------------------------------------------------------ auth UI
let mode = 'login';
function showGate(err = '') { $('gate').hidden = false; $('hud').hidden = true; $('authError').textContent = err; }
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  mode = b.dataset.mode;
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
  $('authSubmit').textContent = mode === 'login' ? 'Enter the world' : 'Create account & enter';
  document.querySelector('[name=password]').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
}));
$('authForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  $('authError').textContent = '';
  try {
    const r = await fetch(mode === 'login' ? '/api/login' : '/api/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: f.get('name'), password: f.get('password') }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'failed');
    S.token = j.token; store.set('genesis_token', j.token);
    connect();
  } catch (e) { $('authError').textContent = e.message; }
});
// Scenic backdrop behind the sign-in panel.
fetch('/api/world').then((r) => r.json()).then((w) => {
  $('worldStats').textContent = `Day ${Math.floor(w.tick / DAY_TICKS) + 1} · online: ${w.online.humans} humans, ${w.online.agents} AI · residents: ${w.registered.humans} humans, ${w.registered.agents} AI`;
  if (!S.connected) {
    S.seed = w.seed; S.tick = w.tick;
    S.pos.set(40, 0, -60); S.pos.y = Math.max(ground(40, -60), SEA_LEVEL) + 14; S.yaw = 0.7; S.pitch = -0.12;
    S.preview = true;
    updateTiles(120); rebuildGrass();
  }
}).catch(() => {});
if (S.token) connect();

// ------------------------------------------------------------------ hotbar
function buildHotbar() {
  const bar = $('hotbar'); bar.textContent = '';
  S.world.blocks.filter((b) => b.solid).forEach((b, i) => {
    const btn = document.createElement('button');
    btn.style.background = `${b.color} center/cover url(${mt[b.id]?.toDataURL() ?? ''})`;
    btn.title = b.name; btn.setAttribute('aria-label', b.name); btn.textContent = String(i + 1);
    btn.onclick = () => { S.selected = b.id; refreshHotbar(); };
    btn.dataset.id = b.id; bar.append(btn);
  });
  refreshHotbar();
}
const refreshHotbar = () => $('hotbar').querySelectorAll('button').forEach((b) => b.classList.toggle('sel', Number(b.dataset.id) === S.selected));

// ------------------------------------------------------------------ input
const chatInput = $('chatInput');
function openChat() { S.chatting = true; S.keys.clear(); document.exitPointerLock?.(); chatInput.focus(); }
$('chatForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const t = chatInput.value.trim();
  if (t) send({ t: 'chat', text: t });
  chatInput.value = ''; chatInput.blur(); S.chatting = false;
  if (!IS_TOUCH) canvas.requestPointerLock?.();
});
chatInput.addEventListener('blur', () => { S.chatting = false; });
const toggleView = () => { S.thirdPerson = !S.thirdPerson; };
addEventListener('keydown', (e) => {
  if (S.chatting || !S.connected) return;
  if (e.key === 'Enter' || e.key === 't') { e.preventDefault(); openChat(); return; }
  if (e.key === 'v' || e.key === 'V') { toggleView(); return; }
  if (/^[1-9]$/.test(e.key)) $('hotbar').children[Number(e.key) - 1]?.click();
  S.keys.add(e.code);
});
addEventListener('keyup', (e) => S.keys.delete(e.code));
addEventListener('blur', () => S.keys.clear());
canvas.addEventListener('click', () => { if (!IS_TOUCH && S.connected && document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  S.yaw -= e.movementX * 0.0022; S.pitch = Math.max(-1.5, Math.min(1.5, S.pitch - e.movementY * 0.0022));
});
canvas.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvas) return;
  if (e.button === 0) act('break'); else if (e.button === 2) act('place');
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

if (IS_TOUCH) {
  const stick = $('stick'), knob = $('knob');
  let stickId = null;
  const setStick = (t) => {
    const r = stick.getBoundingClientRect();
    let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy), max = r.width / 2;
    if (d > max) { dx *= max / d; dy *= max / d; }
    S.stick.x = dx / max; S.stick.y = dy / max;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  stick.addEventListener('touchstart', (e) => { e.preventDefault(); stickId = e.changedTouches[0].identifier; setStick(e.changedTouches[0]); }, { passive: false });
  stick.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === stickId) setStick(t); }, { passive: false });
  const endStick = (e) => { for (const t of e.changedTouches) if (t.identifier === stickId) { stickId = null; S.stick.x = S.stick.y = 0; knob.style.transform = ''; } };
  stick.addEventListener('touchend', endStick); stick.addEventListener('touchcancel', endStick);
  const look = new Map();
  canvas.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) look.set(t.identifier, [t.clientX, t.clientY]); }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const p = look.get(t.identifier); if (!p) continue;
      S.yaw -= (t.clientX - p[0]) * 0.006; S.pitch = Math.max(-1.5, Math.min(1.5, S.pitch - (t.clientY - p[1]) * 0.006));
      look.set(t.identifier, [t.clientX, t.clientY]);
    }
  }, { passive: false });
  const endLook = (e) => { for (const t of e.changedTouches) look.delete(t.identifier); };
  canvas.addEventListener('touchend', endLook); canvas.addEventListener('touchcancel', endLook);
  const jb = $('btnJump');
  jb.addEventListener('touchstart', (e) => { e.preventDefault(); S.keys.add('Space'); }, { passive: false });
  jb.addEventListener('touchend', () => S.keys.delete('Space'));
  $('btnBreak').addEventListener('click', () => act('break'));
  $('btnPlace').addEventListener('click', () => act('place'));
  $('btnChat').addEventListener('click', openChat);
  $('btnView').addEventListener('click', toggleView);
}

// ------------------------------------------------------------------ targeting & building
const eye = new THREE.Vector3(), dir = new THREE.Vector3();
function target() {
  eye.set(S.pos.x, S.pos.y + EYE, S.pos.z);
  dir.set(0, 0, -1).applyEuler(new THREE.Euler(S.pitch, S.yaw, 0, 'YXZ'));
  let prev = null;
  for (let t = 0.3; t <= REACH; t += 0.04) {
    const x = eye.x + dir.x * t, y = eye.y + dir.y * t, z = eye.z + dir.z * t;
    const cell = [Math.floor(x), Math.floor(y), Math.floor(z)];
    if (structAt(...cell)) return { kind: 'structure', cell, prev };
    const g = ground(x, z);
    if (y < g) {
      const cx = Math.floor(x), cz = Math.floor(z), gc = ground(cx + 0.5, cz + 0.5);
      let cy = Math.floor(gc + 0.05); if (cy + 1 <= gc + 0.05) cy++;
      return { kind: 'ground', place: [cx, cy, cz] };
    }
    if (!prev || prev[0] !== cell[0] || prev[1] !== cell[1] || prev[2] !== cell[2]) prev = cell;
  }
  return null;
}
function inBody([x, y, z]) {
  return x === Math.floor(S.pos.x) && z === Math.floor(S.pos.z) && y >= Math.floor(S.pos.y + 0.05) && y <= Math.floor(S.pos.y + 1.75);
}
function act(kind) {
  const t = target(); if (!t) return;
  if (kind === 'break') { if (t.kind === 'structure') send({ t: 'break', x: t.cell[0], y: t.cell[1], z: t.cell[2] }); else sys('Only built pieces can be removed — the land itself is permanent.'); return; }
  const p = t.kind === 'structure' ? t.prev : t.place;
  if (!p || inBody(p)) return;
  send({ t: 'place', x: p[0], y: p[1], z: p[2], block: S.selected });
}
const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01)), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }));
const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, depthWrite: false }));
outline.visible = ghost.visible = false; scene.add(outline, ghost);

// ------------------------------------------------------------------ movement & collision
const nearbyTrees = [];
let treesAt = '';
function refreshNearbyTrees() {
  const cx = Math.floor(S.pos.x / TREE_CELL), cz = Math.floor(S.pos.z / TREE_CELL), k = TK(cx, cz);
  if (k === treesAt) return; treesAt = k; nearbyTrees.length = 0;
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const t = treeInCell(S.seed, cx + dx, cz + dz); if (t) nearbyTrees.push(t); }
}
function blocked(x, y, z) {
  for (const t of nearbyTrees) if (Math.hypot(t.x - x, t.z - z) < TRUNK_RADIUS * t.scale + PW && y < t.y + 4) return true;
  for (let yy = Math.floor(y + 0.05); yy <= Math.floor(y + PH - 0.05); yy++)
    for (let xx = Math.floor(x - PW); xx <= Math.floor(x + PW); xx++)
      for (let zz = Math.floor(z - PW); zz <= Math.floor(z + PW); zz++) if (structAt(xx, yy, zz)) return true;
  return false;
}
function floorAt(x, y, z) {
  let f = ground(x, z);
  for (let xx = Math.floor(x - PW); xx <= Math.floor(x + PW); xx++)
    for (let zz = Math.floor(z - PW); zz <= Math.floor(z + PW); zz++)
      for (let yy = Math.floor(y + 0.6); yy >= Math.floor(f); yy--) if (structAt(xx, yy, zz)) { f = Math.max(f, yy + 1); break; }
  return f;
}
function physics(dt) {
  refreshNearbyTrees();
  let fx = 0, fz = 0;
  if (S.keys.has('KeyW') || S.keys.has('ArrowUp')) fz -= 1;
  if (S.keys.has('KeyS') || S.keys.has('ArrowDown')) fz += 1;
  if (S.keys.has('KeyA') || S.keys.has('ArrowLeft')) fx -= 1;
  if (S.keys.has('KeyD') || S.keys.has('ArrowRight')) fx += 1;
  fx += S.stick.x; fz += S.stick.y;
  const len = Math.hypot(fx, fz); if (len > 1) { fx /= len; fz /= len; }
  const g = ground(S.pos.x, S.pos.z);
  S.swimming = g < SEA_LEVEL - 1.3 && S.pos.y < SEA_LEVEL - 1.25;
  const speed = (S.keys.has('ShiftLeft') || len > 0.95 && IS_TOUCH ? RUN : WALK) * (S.swimming ? 0.45 : 1);
  const sin = Math.sin(S.yaw), cos = Math.cos(S.yaw);
  const vx = (fx * cos + fz * sin) * speed, vz = (-fx * sin + fz * cos) * speed;
  // horizontal, with one-step climbing onto built pieces
  for (const [ax, v] of [['x', vx], ['z', vz]]) {
    const old = S.pos[ax]; S.pos[ax] += v * dt;
    if (blocked(S.pos.x, S.pos.y, S.pos.z)) {
      if (S.onGround && !blocked(S.pos.x, S.pos.y + 1.05, S.pos.z) && floorAt(S.pos.x, S.pos.y + 1.05, S.pos.z) <= S.pos.y + 1.05) S.pos.y += 1.05;
      else S.pos[ax] = old;
    }
  }
  // vertical
  if (S.swimming) {
    S.vel.y += ((SEA_LEVEL - 1.35) - S.pos.y) * 6 * dt - S.vel.y * 2 * dt;
    if (S.keys.has('Space')) S.vel.y = 2.5;
  } else {
    S.vel.y = Math.max(S.vel.y - GRAVITY * dt, -30);
    if (S.keys.has('Space') && S.onGround) S.vel.y = JUMP_V;
  }
  const oy = S.pos.y; S.pos.y += S.vel.y * dt;
  if (S.vel.y > 0 && blocked(S.pos.x, S.pos.y, S.pos.z)) { S.pos.y = oy; S.vel.y = 0; }
  const f = floorAt(S.pos.x, Math.max(oy, S.pos.y), S.pos.z);
  S.onGround = false;
  if (S.pos.y <= f) { S.pos.y = f; if (S.vel.y < 0) S.vel.y = 0; S.onGround = true; }
  else if (S.pos.y - f < 0.35 && S.vel.y <= 0) { S.pos.y = f; S.vel.y = 0; S.onGround = true; } // stick to slopes
  return Math.hypot(vx, vz);
}

// ------------------------------------------------------------------ main loop
let last = performance.now(), frames = 0, fpsT = last, slowT = 0;
const camPos = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  uniforms.uTime.value = now / 1000;
  if (S.seed || S.connected) {
    let speed = 0;
    if (S.connected) {
      speed = physics(dt);
      if (now - S.lastSent > 50 && S.pos.distanceToSquared(S.lastSentPos) > 1e-4) {
        send({ t: 'move', x: S.pos.x, y: S.pos.y, z: S.pos.z, yaw: S.yaw });
        S.lastSent = now; S.lastSentPos.copy(S.pos);
      }
    } else if (S.preview) { S.yaw += dt * 0.03; }
    // camera
    const euler = new THREE.Euler(S.pitch, S.yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
    camPos.set(S.pos.x, S.pos.y + EYE, S.pos.z);
    if (S.thirdPerson && S.connected) {
      const back = new THREE.Vector3(0, 0, 1).applyEuler(euler).multiplyScalar(4.2);
      camPos.add(back).add(new THREE.Vector3(0, 0.6, 0));
      camPos.y = Math.max(camPos.y, ground(camPos.x, camPos.z) + 0.4);
      if (!selfAvatar) { selfAvatar = makeAvatar({ ...S.me, kind: 'human' }, false); scene.add(selfAvatar.group); }
    }
    if (selfAvatar) {
      selfAvatar.group.visible = S.thirdPerson;
      selfAvatar.group.position.copy(S.pos); selfAvatar.group.rotation.y = S.yaw;
      animateAvatar(selfAvatar, speed, dt);
    }
    camera.position.copy(camPos);
    const under = camPos.y < SEA_LEVEL - 0.05 && ground(camPos.x, camPos.z) < SEA_LEVEL;
    scene.fog.density = under ? 0.09 : 0.0019;
    if (under) scene.fog.color.set('#0d3a4e');

    // streaming
    if (now - slowT > 400) {
      slowT = now; updateTiles(IS_TOUCH ? 6 : 10); requestStructures();
      if (S.pos.distanceTo(grassCenter) > 5) rebuildGrass();
    }
    // others
    for (const o of S.others.values()) {
      const gap = Math.hypot(o.target.x - o.group.position.x, o.target.z - o.group.position.z);
      o.group.position.lerp(o.target, Math.min(1, dt * 8));
      o.group.rotation.y = o.yaw;
      animateAvatar(o, gap * 8, dt);
    }
    // world clock advances smoothly between server snapshots
    S.clientTick = (S.clientTick ?? S.tick) + dt * 10;
    if (Math.abs(S.clientTick - S.tick) > 20) S.clientTick = S.tick;
    if (!under) updateDaylight(S.clientTick);
    sky.position.copy(camera.position);
    clouds.position.x = camera.position.x; clouds.position.z = camera.position.z;
    cloudTex.offset.set(now * 0.0000035, now * 0.000002);
    water.position.x = Math.round(camera.position.x / 32) * 32; water.position.z = Math.round(camera.position.z / 32) * 32;
    water.material.uniforms.time.value = now / 1000 * 0.55;
    sun.target.position.set(Math.round(S.pos.x / 4) * 4, S.pos.y, Math.round(S.pos.z / 4) * 4);
    sun.position.copy(sun.target.position).addScaledVector(sunDir.y > 0.03 ? sunDir : UP, 250);

    // building target
    const t = S.connected ? target() : null;
    outline.visible = ghost.visible = false;
    if (t?.kind === 'structure') { outline.visible = true; outline.position.set(t.cell[0] + 0.5, t.cell[1] + 0.5, t.cell[2] + 0.5); }
    else if (t?.kind === 'ground') { ghost.visible = true; ghost.position.set(t.place[0] + 0.5, t.place[1] + 0.5, t.place[2] + 0.5); }

    frames++;
    if (now - fpsT > 1000 && S.connected) {
      S.fps = frames; frames = 0; fpsT = now;
      let humans = 1, agents = 0; for (const o of S.others.values()) o.kind === 'agent' ? agents++ : humans++;
      const alt = S.pos.y - SEA_LEVEL;
      $('status').textContent = `${S.me.name} · ${S.fps} fps · ${S.timeOfDay}\n${biomeAt(S.seed, S.pos.x, S.pos.z)} · ${alt.toFixed(0)} m above sea\nnearby: ${humans} humans, ${agents} AI`;
    }
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Test/debug hook: render now and return the frame as an image (used by e2e screenshots).
S.snapshot = (type = 'image/jpeg', q = 0.9) => { renderer.render(scene, camera); return canvas.toDataURL(type, q); };
