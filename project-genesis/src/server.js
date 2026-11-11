// HTTP (REST agent API + static client) and WebSocket (real-time play).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { openDb, getMeta, setMeta } from './db.js';
import { World } from './world.js';
import { Game } from './game.js';
import { Auth, AuthError } from './auth.js';
import { BLOCKS } from './blocks.js';
import { CHUNK, HEIGHT, MAX_BODY_BYTES, VIEW_RADIUS, HEAR_RADIUS, REGISTER_RATE } from './config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = {
  '/': ['public/index.html', 'text/html; charset=utf-8'],
  '/client.js': ['public/client.js', 'text/javascript; charset=utf-8'],
  '/terrain.js': ['public/terrain.js', 'text/javascript; charset=utf-8'],
  '/textures.js': ['public/textures.js', 'text/javascript; charset=utf-8'],
  '/nature.js': ['public/nature.js', 'text/javascript; charset=utf-8'],
  '/vendor/addons/objects/Sky.js': ['node_modules/three/examples/jsm/objects/Sky.js', 'text/javascript; charset=utf-8'],
  '/vendor/addons/objects/Water.js': ['node_modules/three/examples/jsm/objects/Water.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['public/style.css', 'text/css; charset=utf-8'],
  '/vendor/three.module.js': ['node_modules/three/build/three.module.js', 'text/javascript; charset=utf-8'],
  '/agent-api.md': ['docs/AGENT_API.md', 'text/markdown; charset=utf-8'],
};
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      // Drain (without buffering) so the client gets a clean 413; hard-cut abusive uploads.
      if (size > 64 * MAX_BODY_BYTES) { req.destroy(); return; }
      if (size <= MAX_BODY_BYTES) chunks.push(c);
    });
    req.on('end', () => {
      if (size > MAX_BODY_BYTES) return reject(new HttpError(413, 'body too large'));
      if (!chunks.length) return resolve({});
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error();
        resolve(v);
      } catch { reject(new HttpError(400, 'invalid JSON object')); }
    });
    req.on('error', reject);
  });
}

export async function createServer({ dbPath = 'genesis.db', port = 8080, host = '0.0.0.0', seed } = {}) {
  const db = openDb(dbPath);
  let worldSeed = getMeta(db, 'seed');
  if (worldSeed == null) { worldSeed = String(seed ?? (Math.random() * 2 ** 31) | 0); setMeta(db, 'seed', worldSeed); }
  const world = new World(db, Number(worldSeed));
  const game = new Game(db, world);
  const auth = new Auth(db);
  const regBuckets = new Map(); // ip -> {tokens, t}

  const takeRegister = (ip) => {
    const [cap, refill] = REGISTER_RATE; const now = Date.now();
    const b = regBuckets.get(ip) ?? { tokens: cap, t: now };
    b.tokens = Math.min(cap, b.tokens + ((now - b.t) / 1000) * refill); b.t = now;
    regBuckets.set(ip, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1; return true;
  };

  // Behind a reverse proxy (Caddy/nginx/Render/Fly), set TRUST_PROXY=1 so rate
  // limits use the real client address instead of the proxy's.
  const trustProxy = process.env.TRUST_PROXY === '1';
  const clientIp = (req) => {
    const xff = trustProxy && req.headers['x-forwarded-for'];
    return xff ? String(xff).split(',')[0].trim() : req.socket.remoteAddress;
  };

  const bearer = (req) => {
    const h = req.headers.authorization || '';
    return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  };
  const requireAgent = (req) => {
    const acc = auth.resolve(bearer(req));
    if (!acc) throw new HttpError(401, 'missing or invalid API key');
    if (acc.kind !== 'agent') throw new HttpError(403, 'agent API key required');
    return acc;
  };

  const routes = {
    'GET /healthz': () => ({ ok: true, tick: game.tick }),
    'GET /api/ground': (_req, _b, url) => {
      const x = Number(url.searchParams.get('x')), z = Number(url.searchParams.get('z'));
      if (!Number.isFinite(x) || !Number.isFinite(z)) throw new HttpError(400, 'x and z required');
      return { ok: true, x, z, groundY: +world.ground(x, z).toFixed(3), surfaceY: +world.surfaceY(x, z).toFixed(3), biome: world.biome(x, z) };
    },
    'GET /api/world': () => ({ seed: Number(worldSeed), chunk: CHUNK, height: HEIGHT, blocks: BLOCKS, viewRadius: VIEW_RADIUS, hearRadius: HEAR_RADIUS, ...game.stats() }),
    'POST /api/register': async (req, body) => {
      if (!takeRegister(clientIp(req))) throw new HttpError(429, 'too many registrations from this address');
      return auth.registerHuman(body.name, body.password);
    },
    'POST /api/login': async (req, body) => auth.login(body.name, body.password),
    'POST /api/agents': async (req, body) => {
      if (!takeRegister(clientIp(req))) throw new HttpError(429, 'too many registrations from this address');
      return auth.registerAgent(body.name, body.persona ?? '', body.goals ?? '');
    },
    'GET /api/agent/me': async (req) => {
      const acc = requireAgent(req);
      const e = game.enter(acc, 'rest');
      return { account: auth.publicAccount(acc), entity: { ...game.publicEntity(e), home: e.home } };
    },
    'GET /api/agent/observe': async (req, _b, url) => {
      const acc = requireAgent(req);
      return game.observe(game.enter(acc, 'rest'), { radius: url.searchParams.get('radius') });
    },
    'POST /api/agent/act': async (req, body) => {
      const acc = requireAgent(req);
      const e = game.enter(acc, 'rest');
      switch (body.type) {
        case 'move': return game.move(e, body);
        case 'chat': return game.chat(e, body);
        case 'place': return game.placeBlock(e, body);
        case 'break': return game.breakBlock(e, body);
        case 'set_home': return game.setHome(e);
        default: throw new HttpError(400, 'type must be one of move, chat, place, break, set_home');
      }
    },
    'GET /api/agent/memory': async (req, _b, url) => {
      const acc = requireAgent(req);
      return { ok: true, memories: game.recall(acc.id, { after: url.searchParams.get('after'), limit: url.searchParams.get('limit') }) };
    },
    'POST /api/agent/memory': async (req, body) => {
      const acc = requireAgent(req);
      return game.remember(game.enter(acc, 'rest'), body);
    },
    'POST /api/agent/leave': async (req) => {
      const acc = requireAgent(req);
      game.leave(acc.id, 'rest');
      return { ok: true };
    },
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    const send = (status, obj) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS });
      res.end(JSON.stringify(obj));
    };
    try {
      const route = routes[`${req.method} ${url.pathname}`];
      if (route) {
        const body = req.method === 'POST' ? await readJson(req) : {};
        const out = await route(req, body, url);
        return send(out && out.ok === false ? 422 : 200, out);
      }
      const file = req.method === 'GET' && STATIC[url.pathname];
      if (file) {
        const data = await readFile(path.join(ROOT, file[0]));
        res.writeHead(200, { 'content-type': file[1], ...SECURITY_HEADERS });
        return res.end(data);
      }
      send(404, { ok: false, error: 'not found' });
    } catch (err) {
      if (err instanceof HttpError || err instanceof AuthError) return send(err.status, { ok: false, error: err.message });
      if (err?.code === 'ENOENT') return send(404, { ok: false, error: 'not found' });
      console.error(err);
      send(500, { ok: false, error: 'internal error' });
    }
  });

  // ---- WebSocket: first message must be {t:'auth', token} ----------------
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_BODY_BYTES });
  const clients = new Set();

  wss.on('connection', (ws) => {
    const c = { ws, entity: null, chunks: new Set() };
    const sendJ = (o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
    const authTimer = setTimeout(() => ws.close(4001, 'auth timeout'), 5000);

    ws.on('message', (raw, isBinary) => {
      let m;
      try { m = JSON.parse(raw.toString('utf8')); } catch { return sendJ({ t: 'error', error: 'bad json' }); }
      if (!m || typeof m !== 'object') return;
      if (!c.entity) {
        if (m.t !== 'auth') return ws.close(4001, 'auth required');
        const acc = auth.resolve(m.token);
        if (!acc) return ws.close(4003, 'invalid token');
        clearTimeout(authTimer);
        c.entity = game.enter(acc, 'ws');
        clients.add(c);
        return sendJ({
          t: 'welcome', self: game.publicEntity(c.entity), account: auth.publicAccount(acc),
          world: { seed: Number(worldSeed), chunk: CHUNK, height: HEIGHT, blocks: BLOCKS, tick: game.tick },
          entities: game.entitiesNear(c.entity),
        });
      }
      const e = c.entity;
      let r;
      switch (m.t) {
        case 'move': r = game.move(e, m); if (!r.ok && r.correct) sendJ({ t: 'correct', self: r.correct, error: r.error }); return;
        case 'chat': r = game.chat(e, m); break;
        case 'place': r = game.placeBlock(e, m); break;
        case 'break': r = game.breakBlock(e, m); break;
        case 'chunk': {
          r = game.getChunk(e, m.cx, m.cz);
          if (r.ok) {
            c.chunks.add(`${m.cx},${m.cz}`);
            return sendJ({ t: 'chunk', cx: r.cx, cz: r.cz, blocks: r.blocks });
          }
          break;
        }
        case 'ping': return sendJ({ t: 'pong', id: m.id, tick: game.tick });
        default: r = { ok: false, error: 'unknown message type' };
      }
      if (!r.ok) sendJ({ t: 'error', req: m.t, error: r.error });
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      clients.delete(c);
      if (c.entity) game.leave(c.entity.id, 'ws');
    });
    ws.on('error', () => {});
  });

  game.on((ev) => {
    for (const c of clients) {
      const sendJ = (o) => c.ws.readyState === 1 && c.ws.send(JSON.stringify(o));
      switch (ev.type) {
        case 'tick': sendJ({ t: 'snapshot', tick: ev.tick, entities: game.entitiesNear(c.entity) }); break;
        case 'chat': if (dist(c.entity, ev.msg) <= HEAR_RADIUS) sendJ({ t: 'chat', ...ev.msg }); break;
        case 'block': {
          const key = `${Math.floor(ev.x / CHUNK)},${Math.floor(ev.z / CHUNK)}`;
          if (c.chunks.has(key)) sendJ({ t: 'block', x: ev.x, y: ev.y, z: ev.z, block: ev.block, by: ev.by });
          break;
        }
        case 'join': sendJ({ t: 'join', entity: ev.entity }); break;
        case 'leave': sendJ({ t: 'leave', id: ev.id }); break;
      }
    }
  });

  game.start();
  await new Promise((r) => server.listen(port, host, r));
  const actualPort = server.address().port;

  return {
    port: actualPort, game, world, auth, db,
    async close() {
      game.stop();
      for (const c of clients) c.ws.terminate();
      await new Promise((r) => wss.close(r));
      await new Promise((r) => server.close(r));
      db.close();
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await createServer({
    dbPath: process.env.GENESIS_DB || 'genesis.db',
    port: Number(process.env.PORT || 8080),
    seed: process.env.GENESIS_SEED,
  });
  console.log(`Project Genesis world server on http://localhost:${s.port} (tick ${s.game.tick})`);
  const shutdown = async () => { await s.close(); process.exit(0); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
