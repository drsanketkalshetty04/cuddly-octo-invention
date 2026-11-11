// The authoritative simulation. Humans (WebSocket) and AI agents (REST or
// WebSocket) go through exactly the same action functions, so both kinds of
// inhabitant obey identical rules in one shared world.
import {
  CHUNK, HEIGHT, MAX_SPEED, MAX_STEP, REACH, VIEW_RADIUS, HEAR_RADIUS, MAX_CHAT_LEN,
  MAX_MEMORY_LEN, RATE, AGENT_ONLINE_MS, TICK_MS, SNAPSHOT_EVERY, PERSIST_EVERY_MS,
} from './config.js';
import { PLACEABLE, AIR } from './blocks.js';
import { SEA_LEVEL } from '../public/terrain.js';
import { getMeta, setMeta } from './db.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const finite = (...v) => v.every((n) => typeof n === 'number' && Number.isFinite(n));

class Bucket {
  constructor([cap, refill]) { this.cap = cap; this.refill = refill; this.tokens = cap; this.t = Date.now(); }
  take() {
    const now = Date.now();
    this.tokens = Math.min(this.cap, this.tokens + ((now - this.t) / 1000) * this.refill);
    this.t = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1; return true;
  }
}

export class Game {
  constructor(db, world) {
    this.db = db;
    this.world = world;
    this.entities = new Map(); // accountId -> live entity
    this.tick = Number(getMeta(db, 'world_tick', '0'));
    this.listeners = new Set(); // (event) => void, used by the network layer
    this.q = {
      getEnt: db.prepare('SELECT * FROM entities WHERE account_id = ?'),
      saveEnt: db.prepare(`INSERT INTO entities(account_id, x, y, z, yaw, updated_at) VALUES(?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET x = excluded.x, y = excluded.y, z = excluded.z, yaw = excluded.yaw, updated_at = excluded.updated_at`),
      setHome: db.prepare('UPDATE entities SET home_x = ?, home_y = ?, home_z = ? WHERE account_id = ?'),
      chat: db.prepare('INSERT INTO messages(account_id, text, x, y, z, world_tick, at) VALUES(?, ?, ?, ?, ?, ?, ?)'),
      heard: db.prepare(`SELECT m.id, m.text, m.x, m.y, m.z, m.world_tick AS tick, m.at, a.name, a.kind, a.id AS fromId
        FROM messages m JOIN accounts a ON a.id = m.account_id WHERE m.id > ? ORDER BY m.id DESC LIMIT 200`),
      lastMsgId: db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM messages'),
      addMem: db.prepare('INSERT INTO memories(account_id, kind, text, world_tick, at) VALUES(?, ?, ?, ?, ?)'),
      listMem: db.prepare('SELECT id, kind, text, world_tick AS tick, at FROM memories WHERE account_id = ? AND id > ? ORDER BY id DESC LIMIT ?'),
      countAccounts: db.prepare('SELECT kind, COUNT(*) AS n FROM accounts GROUP BY kind'),
    };
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(ev) { for (const fn of this.listeners) fn(ev); }

  // ---- presence ---------------------------------------------------------
  enter(account, via) {
    let e = this.entities.get(account.id);
    if (!e) {
      let row = this.q.getEnt.get(account.id);
      if (!row) {
        // Spawn near the origin, spread out so newcomers don't stack.
        const sx = ((account.id * 7) % 24) - 12, sz = ((account.id * 13) % 24) - 12;
        row = { ...this.world.findSpawn(sx, sz), yaw: 0 };
        this.q.saveEnt.run(account.id, row.x, row.y, row.z, 0, Date.now());
        row = this.q.getEnt.get(account.id);
      }
      e = {
        id: account.id, name: account.name, kind: account.kind,
        x: row.x, y: row.y, z: row.z, yaw: row.yaw,
        home: row.home_x == null ? null : { x: row.home_x, y: row.home_y, z: row.home_z },
        lastMoveAt: Date.now(), lastSeen: Date.now(), dirty: false, sockets: 0,
        lastHeardId: this.q.lastMsgId.get().id,
        buckets: Object.fromEntries(Object.entries(RATE).map(([k, v]) => [k, new Bucket(v)])),
      };
      this.entities.set(account.id, e);
      this.emit({ type: 'join', entity: this.publicEntity(e) });
    }
    if (via === 'ws') e.sockets++;
    e.lastSeen = Date.now();
    return e;
  }

  leave(id, via) {
    const e = this.entities.get(id);
    if (!e) return;
    if (via === 'ws') e.sockets = Math.max(0, e.sockets - 1);
    if (e.sockets > 0) return;
    if (via === 'ws' && e.kind === 'agent' && Date.now() - e.lastSeen < AGENT_ONLINE_MS) return;
    this.#persist(e);
    this.entities.delete(id);
    this.emit({ type: 'leave', id });
  }

  publicEntity(e) {
    return { id: e.id, name: e.name, kind: e.kind, x: +e.x.toFixed(2), y: +e.y.toFixed(2), z: +e.z.toFixed(2), yaw: +e.yaw.toFixed(3) };
  }

  #limit(e, kind) {
    if (!e.buckets[kind].take()) return { ok: false, error: `rate limited: ${kind}` };
    return null;
  }

  // ---- actions (shared by humans and agents) ------------------------------
  move(e, { x, y, z, yaw }) {
    if (!finite(x, z)) return { ok: false, error: 'x and z must be finite numbers' };
    // y is optional: omit it to walk on the surface (terrain or a structure roof).
    if (y === undefined || y === null) y = this.world.surfaceY(x, z, e.y + 1.2);
    if (!finite(y)) return { ok: false, error: 'y must be a finite number' };
    const lim = this.#limit(e, 'move'); if (lim) return lim;
    const now = Date.now();
    const dt = Math.max(0.05, (now - e.lastMoveAt) / 1000);
    const allowed = Math.min(MAX_STEP, MAX_SPEED * dt + 1.5);
    const d = dist(e, { x, y, z });
    if (d > allowed) return { ok: false, error: `moved too far (${d.toFixed(1)} > ${allowed.toFixed(1)})`, correct: this.publicEntity(e) };
    if (!this.world.canOccupy(x, y, z)) return { ok: false, error: 'position is blocked', correct: this.publicEntity(e) };
    e.x = x; e.y = y; e.z = z;
    if (finite(yaw)) e.yaw = yaw;
    e.lastMoveAt = now; e.lastSeen = now; e.dirty = true;
    return { ok: true, position: this.publicEntity(e) };
  }

  chat(e, { text }) {
    if (typeof text !== 'string') return { ok: false, error: 'text must be a string' };
    text = text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_CHAT_LEN);
    if (!text) return { ok: false, error: 'empty message' };
    const lim = this.#limit(e, 'chat'); if (lim) return lim;
    const r = this.q.chat.run(e.id, text, e.x, e.y, e.z, this.tick, Date.now());
    e.lastSeen = Date.now();
    const msg = { id: Number(r.lastInsertRowid), fromId: e.id, name: e.name, kind: e.kind, text, x: e.x, y: e.y, z: e.z, tick: this.tick };
    this.emit({ type: 'chat', msg });
    return { ok: true, message: msg };
  }

  #editCheck(e, x, y, z) {
    if (![x, y, z].every(Number.isInteger)) return 'x, y, z must be integers';
    if (y < 0 || y >= HEIGHT) return 'y out of range';
    if (dist(e, { x: x + 0.5, y: y + 0.5, z: z + 0.5 }) > REACH + 1) return 'out of reach';
    return null;
  }

  placeBlock(e, { x, y, z, block }) {
    const err = this.#editCheck(e, x, y, z); if (err) return { ok: false, error: err };
    if (!PLACEABLE.has(block)) return { ok: false, error: 'block type not placeable' };
    if (this.world.getBlock(x, y, z) !== AIR) return { ok: false, error: 'space occupied' };
    if (y + 1 <= this.world.ground(x + 0.5, z + 0.5) + 0.05) return { ok: false, error: 'that space is underground' };
    if (this.world.treeTrunkAt(x + 0.5, z + 0.5)) return { ok: false, error: 'a tree is in the way' };
    for (const o of this.entities.values()) {
      if (Math.floor(o.x) === x && Math.floor(o.z) === z && y >= Math.floor(o.y + 0.05) && y <= Math.floor(o.y + 1.75))
        return { ok: false, error: 'an inhabitant is standing there' };
    }
    const lim = this.#limit(e, 'block'); if (lim) return lim;
    this.world.setBlock(x, y, z, block, e.id);
    e.lastSeen = Date.now();
    this.emit({ type: 'block', x, y, z, block, by: e.id });
    return { ok: true };
  }

  breakBlock(e, { x, y, z }) {
    const err = this.#editCheck(e, x, y, z); if (err) return { ok: false, error: err };
    if (this.world.getBlock(x, y, z) === AIR) return { ok: false, error: 'no building piece there (natural terrain cannot be removed)' };
    const lim = this.#limit(e, 'block'); if (lim) return lim;
    this.world.setBlock(x, y, z, AIR, e.id);
    e.lastSeen = Date.now();
    this.emit({ type: 'block', x, y, z, block: AIR, by: e.id });
    return { ok: true };
  }

  setHome(e) {
    e.home = { x: Math.floor(e.x), y: Math.floor(e.y), z: Math.floor(e.z) };
    this.#persist(e);
    this.q.setHome.run(e.home.x, e.home.y, e.home.z, e.id);
    return { ok: true, home: e.home };
  }

  remember(e, { text, kind = 'note' }) {
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_MEMORY_LEN)
      return { ok: false, error: `text must be 1-${MAX_MEMORY_LEN} chars` };
    if (typeof kind !== 'string' || !/^[a-z_]{1,24}$/.test(kind)) return { ok: false, error: 'kind must match [a-z_]{1,24}' };
    const lim = this.#limit(e, 'memory'); if (lim) return lim;
    const r = this.q.addMem.run(e.id, kind, text.trim(), this.tick, Date.now());
    return { ok: true, id: Number(r.lastInsertRowid) };
  }

  recall(accountId, { after = 0, limit = 50 } = {}) {
    limit = Math.max(1, Math.min(200, Number(limit) || 50));
    return this.q.listMem.all(accountId, Number(after) || 0, limit).reverse();
  }

  getChunk(e, cx, cz) {
    if (!Number.isInteger(cx) || !Number.isInteger(cz) || Math.abs(cx) > 1e6 || Math.abs(cz) > 1e6) return { ok: false, error: 'bad chunk coords' };
    const lim = this.#limit(e, 'chunk'); if (lim) return lim;
    return { ok: true, cx, cz, blocks: this.world.structuresIn(cx, cz) };
  }

  // What an inhabitant can perceive right now. Used by the agent API.
  observe(e, { radius = 4 } = {}) {
    radius = Math.max(1, Math.min(8, Math.floor(Number(radius) || 4)));
    e.lastSeen = Date.now();
    const nearby = [];
    for (const o of this.entities.values()) {
      if (o.id !== e.id && dist(e, o) <= VIEW_RADIUS) nearby.push({ ...this.publicEntity(o), distance: +dist(e, o).toFixed(1) });
    }
    nearby.sort((a, b) => a.distance - b.distance);
    const heard = this.q.heard.all(e.lastHeardId)
      .filter((m) => dist(e, m) <= HEAR_RADIUS)
      .reverse();
    const all = this.q.lastMsgId.get().id;
    e.lastHeardId = all;
    // Built structures within `radius` metres: [x, y, z, material].
    const structures = [];
    const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
    for (let y = by - 3; y <= by + 4; y++)
      for (let z = bz - radius; z <= bz + radius; z++)
        for (let x = bx - radius; x <= bx + radius; x++) {
          if (y < 0 || y >= HEIGHT) continue;
          const b = this.world.getBlock(x, y, z);
          if (b !== AIR) structures.push([x, y, z, b]);
        }
    const g = this.world.ground(e.x, e.z);
    // Ground heights on a 3 m grid around you (5x5), so you can plan a path.
    const heights = [];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++)
      heights.push(+this.world.ground(e.x + dx * 3, e.z + dz * 3).toFixed(2));
    return {
      ok: true,
      tick: this.tick,
      self: { ...this.publicEntity(e), home: e.home },
      nearby,
      heard: heard.map(({ fromId, name, kind, text, tick }) => ({ fromId, name, kind, text, tick })),
      structures,
      terrain: {
        groundY: +g.toFixed(2), biome: this.world.biome(e.x, e.z), seaLevel: SEA_LEVEL,
        inWater: g < SEA_LEVEL && e.y < SEA_LEVEL, flatness: +this.world.flatness(e.x, e.z).toFixed(2),
        heightGrid: { spacing: 3, size: 5, values: heights },
      },
    };
  }

  stats() {
    const counts = Object.fromEntries(this.q.countAccounts.all().map((r) => [r.kind, r.n]));
    let humans = 0, agents = 0;
    for (const e of this.entities.values()) e.kind === 'agent' ? agents++ : humans++;
    return { tick: this.tick, online: { humans, agents }, registered: { humans: counts.human ?? 0, agents: counts.agent ?? 0 } };
  }

  // ---- world clock ------------------------------------------------------
  #persist(e) {
    this.q.saveEnt.run(e.id, e.x, e.y, e.z, e.yaw, Date.now());
    e.dirty = false;
  }

  step() {
    this.tick++;
    const now = Date.now();
    for (const e of this.entities.values()) {
      if (e.sockets === 0 && now - e.lastSeen > AGENT_ONLINE_MS) this.leave(e.id, 'timeout');
    }
    if (this.tick % SNAPSHOT_EVERY === 0) this.emit({ type: 'tick', tick: this.tick });
  }

  flush() {
    for (const e of this.entities.values()) if (e.dirty) this.#persist(e);
    setMeta(this.db, 'world_tick', this.tick);
  }

  start() {
    this.tickTimer = setInterval(() => this.step(), TICK_MS);
    this.flushTimer = setInterval(() => this.flush(), PERSIST_EVERY_MS);
  }

  stop() {
    clearInterval(this.tickTimer); clearInterval(this.flushTimer);
    this.flush();
  }

  entitiesNear(e) {
    const out = [];
    for (const o of this.entities.values()) if (dist(e, o) <= VIEW_RADIUS) out.push(this.publicEntity(o));
    return out;
  }
}

export { CHUNK };
