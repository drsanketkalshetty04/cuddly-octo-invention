import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { World } from '../src/world.js';
import { openDb } from '../src/db.js';
import { heightAt, treeInCell, biomeAt, SEA_LEVEL } from '../public/terrain.js';

const tmpDb = () => path.join(mkdtempSync(path.join(tmpdir(), 'genesis-')), 'w.db');

test('terrain is deterministic for a seed and differs between seeds', () => {
  for (const [x, z] of [[0, 0], [123.4, -987.6], [5000, 5000]]) {
    assert.equal(heightAt(42, x, z), heightAt(42, x, z));
  }
  let diff = 0;
  for (let i = 0; i < 50; i++) if (Math.abs(heightAt(1, i * 97, i * 31) - heightAt(2, i * 97, i * 31)) > 0.5) diff++;
  assert.ok(diff > 40);
});

test('terrain is continuous (no voxel steps): neighbouring samples 10 cm apart differ by < 0.25 m', () => {
  let worst = 0;
  for (let i = 0; i < 5000; i++) {
    const x = (i * 7919) % 4000 - 2000, z = (i * 104729) % 4000 - 2000;
    worst = Math.max(worst, Math.abs(heightAt(7, x, z) - heightAt(7, x + 0.1, z)));
  }
  assert.ok(worst < 0.25, `max 10cm delta ${worst}`);
});

test('an Earth-like mix of ocean, beaches, lowlands and mountains exists', () => {
  const seen = new Set();
  let land = 0, n = 0, maxH = -Infinity;
  for (let x = -4000; x < 4000; x += 40) for (let z = -4000; z < 4000; z += 40) {
    const h = heightAt(1234, x, z); n++; if (h > SEA_LEVEL) land++; maxH = Math.max(maxH, h);
    seen.add(biomeAt(1234, x, z));
  }
  for (const b of ['water', 'beach', 'grassland', 'forest', 'mountain']) assert.ok(seen.has(b), `missing biome ${b}`);
  assert.ok(land / n > 0.3 && land / n < 0.85, `land fraction ${land / n}`);
  assert.ok(maxH > 80, `highest peak ${maxH}`);
});

test('trees grow only on dry land and are deterministic', () => {
  let trees = 0;
  for (let cx = -60; cx < 60; cx++) for (let cz = -60; cz < 60; cz++) {
    const t = treeInCell(99, cx, cz);
    if (!t) continue;
    trees++;
    assert.ok(t.y > SEA_LEVEL + 1.9, 'tree in water');
    assert.deepEqual(t, treeInCell(99, cx, cz));
  }
  assert.ok(trees > 100, `only ${trees} trees`);
});

test('structures persist across a world restart', () => {
  const file = tmpDb();
  let db = openDb(file);
  let w = new World(db, 123);
  const y = Math.ceil(w.ground(-20.5, 33.5));
  w.setBlock(-21, y, 33, 4, null);
  assert.equal(w.getBlock(-21, y, 33), 4);
  db.close();
  db = openDb(file);
  w = new World(db, 123);
  assert.equal(w.getBlock(-21, y, 33), 4, 'structure survives reopen');
  assert.deepEqual(w.structuresIn(-2, 2), [[-21, y, 33, 4]]);
  w.setBlock(-21, y, 33, 0, null);
  assert.deepEqual(w.structuresIn(-2, 2), []);
  db.close();
});

test('standing on structures: surfaceY finds roofs, canOccupy rejects walls and underground', () => {
  const db = openDb(tmpDb());
  const w = new World(db, 5);
  const s = w.findSpawn(0, 0);
  const x = Math.floor(s.x), z = Math.floor(s.z), gy = Math.ceil(w.ground(x + 0.5, z + 0.5));
  assert.ok(w.canOccupy(x + 0.5, w.ground(x + 0.5, z + 0.5), z + 0.5));
  assert.ok(!w.canOccupy(x + 0.5, w.ground(x + 0.5, z + 0.5) - 2, z + 0.5), 'underground rejected');
  w.setBlock(x, gy, z, 1, null); w.setBlock(x, gy + 1, z, 1, null);
  assert.ok(!w.canOccupy(x + 0.5, gy, z + 0.5), 'inside wall rejected');
  assert.equal(w.surfaceY(x + 0.5, z + 0.5), gy + 2, 'roof is walkable');
  db.close();
});

test('findSpawn picks dry, flat land away from trees', () => {
  const db = openDb(tmpDb());
  const w = new World(db, 2024);
  for (let i = 0; i < 20; i++) {
    const s = w.findSpawn(i * 300 - 3000, i * 170);
    assert.ok(s.y > SEA_LEVEL + 1.9, `spawn at ${s.y}`);
    assert.ok(!w.treeTrunkAt(s.x, s.z));
    assert.ok(w.canOccupy(s.x, s.y, s.z));
  }
  db.close();
});
