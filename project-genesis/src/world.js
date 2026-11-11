// The world = deterministic natural terrain (shared with the client) +
// persisted structures that inhabitants build on a 1 m grid.
import { CHUNK, HEIGHT } from './config.js';
import { AIR, isSolid } from './blocks.js';
import { heightAt, biomeAt, flatnessAt, treeInCell, TREE_CELL, TRUNK_RADIUS, SEA_LEVEL } from '../public/terrain.js';

const key = (x, y, z) => `${x},${y},${z}`;

export class World {
  constructor(db, seed) {
    this.db = db;
    this.seed = seed;
    this.chunks = new Map(); // "cx,cz" -> Map("x,y,z" -> block)
    this.qChunk = db.prepare('SELECT x, y, z, block FROM block_edits WHERE cx = ? AND cz = ? AND block != 0');
    this.qUpsert = db.prepare(`INSERT INTO block_edits(cx, cz, x, y, z, block, by_account, at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(x, y, z) DO UPDATE SET block = excluded.block, by_account = excluded.by_account, at = excluded.at`);
  }

  ground(x, z) { return heightAt(this.seed, x, z); }
  biome(x, z) { return biomeAt(this.seed, x, z); }
  flatness(x, z) { return flatnessAt(this.seed, x, z); }

  // Structures in one 16x16 m column, loaded lazily from the database.
  chunk(cx, cz) {
    const k = `${cx},${cz}`;
    let c = this.chunks.get(k);
    if (!c) {
      c = new Map();
      for (const r of this.qChunk.all(cx, cz)) c.set(key(r.x, r.y, r.z), r.block);
      if (this.chunks.size > 8192) this.chunks.delete(this.chunks.keys().next().value);
      this.chunks.set(k, c);
    }
    return c;
  }

  structuresIn(cx, cz) {
    return [...this.chunk(cx, cz)].map(([k, b]) => [...k.split(',').map(Number), b]);
  }

  getBlock(x, y, z) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    return this.chunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK)).get(key(x, y, z)) ?? AIR;
  }

  setBlock(x, y, z, block, byAccount) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunk(cx, cz);
    if (block === AIR) c.delete(key(x, y, z)); else c.set(key(x, y, z), block);
    this.qUpsert.run(cx, cz, x, y, z, block, byAccount ?? null, Date.now());
  }

  // Lowest point of a 1x1 cell's ground (a structure piece must poke above it).
  cellGroundMax(x, z) {
    return Math.max(this.ground(x, z), this.ground(x + 1, z), this.ground(x, z + 1), this.ground(x + 1, z + 1), this.ground(x + 0.5, z + 0.5));
  }

  // Top walkable surface at (x, z) at or below `fromY`: terrain or a structure roof.
  surfaceY(x, z, fromY = HEIGHT) {
    let top = this.ground(x, z);
    const bx = Math.floor(x), bz = Math.floor(z);
    for (let y = Math.min(HEIGHT - 1, Math.floor(fromY)); y >= Math.floor(top); y--) {
      if (isSolid(this.getBlock(bx, y, bz))) { top = Math.max(top, y + 1); break; }
    }
    return top;
  }

  treeTrunkAt(x, z) {
    const cx = Math.floor(x / TREE_CELL), cz = Math.floor(z / TREE_CELL);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const t = treeInCell(this.seed, cx + dx, cz + dz);
      if (t && Math.hypot(t.x - x, t.z - z) < TRUNK_RADIUS * t.scale + 0.25) return t;
    }
    return null;
  }

  // Can an upright body (feet at y, 1.8 m tall) stand here?
  canOccupy(x, y, z) {
    if (!Number.isFinite(y) || y > HEIGHT + 10) return false;
    if (y < this.ground(x, z) - 0.6) return false; // underground
    const bx = Math.floor(x), bz = Math.floor(z);
    for (let yy = Math.floor(y + 0.05); yy <= Math.floor(y + 1.75); yy++) if (isSolid(this.getBlock(bx, yy, bz))) return false;
    return true;
  }

  // A pleasant spawn: dry, fairly flat land near (x, z), not inside a tree.
  findSpawn(x, z) {
    for (let r = 0; r < 400; r += 4)
      for (let a = 0; a < (r ? 16 : 1); a++) {
        const px = x + Math.cos(a / 16 * Math.PI * 2) * r * 4, pz = z + Math.sin(a / 16 * Math.PI * 2) * r * 4;
        const h = this.ground(px, pz);
        if (h > SEA_LEVEL + 2 && h < 60 && this.flatness(px, pz) > 0.93 && !this.treeTrunkAt(px, pz) && this.canOccupy(px, h, pz))
          return { x: px, y: h, z: pz };
      }
    return { x, y: Math.max(this.ground(x, z), SEA_LEVEL), z };
  }
}
