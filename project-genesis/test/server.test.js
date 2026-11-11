// End-to-end tests against a real server instance: real HTTP, real
// WebSocket, real SQLite file. Humans and agents share one world.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createServer } from '../src/server.js';
import { CHUNK } from '../src/config.js';

const dbPath = path.join(mkdtempSync(path.join(tmpdir(), 'genesis-')), 'srv.db');
let srv, base;

const api = async (method, p, body, token) => {
  const res = await fetch(base + p, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

function connect(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
    const inbox = [];
    const waiters = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      inbox.push(msg);
      for (const w of [...waiters]) if (w.pred(msg)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
    });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', token })));
    ws.on('error', reject);
    const client = {
      ws, inbox,
      send: (o) => ws.send(JSON.stringify(o)),
      wait(pred, ms = 3000) {
        const hit = inbox.find(pred);
        if (hit) { inbox.splice(inbox.indexOf(hit), 1); return Promise.resolve(hit); }
        return new Promise((res, rej) => {
          const w = { pred, resolve: (m) => { clearTimeout(t); inbox.splice(inbox.indexOf(m), 1); res(m); } };
          const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); rej(new Error('timeout waiting for message')); }, ms);
          waiters.push(w);
        });
      },
      close: () => new Promise((r) => { ws.once('close', r); ws.close(); }),
    };
    client.wait((m) => m.t === 'welcome').then(() => resolve(client), reject);
    ws.on('close', (code, reason) => client.closed = { code, reason: reason.toString() });
  });
}

before(async () => {
  srv = await createServer({ dbPath, port: 0, host: '127.0.0.1', seed: 1234 });
  base = `http://127.0.0.1:${srv.port}`;
});
after(async () => { await srv?.close(); });

let human, agent;

test('ground height lookup is public and matches the shared terrain', async () => {
  const r = await api('GET', '/api/ground?x=10.5&z=-3.25');
  assert.equal(r.status, 200);
  assert.equal(r.body.groundY, +srv.world.ground(10.5, -3.25).toFixed(3));
  assert.equal((await api('GET', '/api/ground?x=abc&z=1')).status, 400);
});

test('world info is public and describes the world', async () => {
  const r = await api('GET', '/api/world');
  assert.equal(r.status, 200);
  assert.equal(r.body.seed, 1234);
  assert.equal(r.body.chunk, CHUNK);
  assert.ok(r.body.blocks.length > 5);
});

test('human registration, duplicate rejection and login', async () => {
  const r = await api('POST', '/api/register', { name: 'Ada', password: 'correct horse' });
  assert.equal(r.status, 200);
  assert.match(r.body.token, /^gh_/);
  assert.equal(r.body.account.kind, 'human');
  human = r.body;

  assert.equal((await api('POST', '/api/register', { name: 'ada', password: 'whatever123' })).status, 409);
  assert.equal((await api('POST', '/api/register', { name: 'x', password: 'whatever123' })).status, 400);
  assert.equal((await api('POST', '/api/register', { name: 'Bob', password: 'short' })).status, 400);
  assert.equal((await api('POST', '/api/login', { name: 'Ada', password: 'wrong password' })).status, 401);
  const ok = await api('POST', '/api/login', { name: 'ADA', password: 'correct horse' });
  assert.equal(ok.status, 200);
  assert.notEqual(ok.body.token, human.token);
});

test('passwords and tokens are never stored in plaintext', () => {
  const row = srv.db.prepare("SELECT pass_hash FROM accounts WHERE name = 'Ada'").get();
  assert.match(row.pass_hash, /^scrypt\$/);
  assert.ok(!row.pass_hash.includes('correct horse'));
  const tokens = srv.db.prepare('SELECT token_hash FROM tokens').all().map((t) => t.token_hash);
  assert.ok(!tokens.includes(human.token));
});

test('AI agent self-registers with identity and gets an API key', async () => {
  const r = await api('POST', '/api/agents', { name: 'Unit-7', persona: 'A curious builder.', goals: 'Build a house near the lake.' });
  assert.equal(r.status, 200);
  assert.match(r.body.apiKey, /^ga_/);
  assert.equal(r.body.account.kind, 'agent');
  assert.equal(r.body.account.persona, 'A curious builder.');
  agent = r.body;
  const me = await api('GET', '/api/agent/me', undefined, agent.apiKey);
  assert.equal(me.status, 200);
  assert.equal(me.body.account.goals, 'Build a house near the lake.');
});

test('agent API rejects missing keys and human tokens', async () => {
  assert.equal((await api('GET', '/api/agent/observe')).status, 401);
  assert.equal((await api('GET', '/api/agent/observe', undefined, 'ga_notarealkey123')).status, 401);
  assert.equal((await api('GET', '/api/agent/observe', undefined, human.token)).status, 403);
});

test('websocket requires valid auth', async () => {
  const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'auth', token: 'gh_bogus_token_value' }));
  const code = await new Promise((r) => ws.on('close', (c) => r(c)));
  assert.equal(code, 4003);
});

test('human and AI share one world: presence, chat, block edits', async () => {
  const h = await connect(human.token);
  // Agent observes and sees the human
  const obs = await api('GET', '/api/agent/observe', undefined, agent.apiKey);
  assert.equal(obs.status, 200);
  assert.ok(obs.body.nearby.some((e) => e.name === 'Ada' && e.kind === 'human'), 'agent sees human');
  assert.ok(obs.body.terrain.groundY > 0 && obs.body.terrain.heightGrid.values.length === 25, 'agent perceives terrain');
  assert.ok(Array.isArray(obs.body.structures));

  // Human sees the agent in a snapshot
  const snap = await h.wait((m) => m.t === 'snapshot' && m.entities.some((e) => e.name === 'Unit-7'));
  assert.equal(snap.entities.find((e) => e.name === 'Unit-7').kind, 'agent');

  // Move the agent next to the human so chat is in range
  const self = obs.body.self;
  const target = snap.entities.find((e) => e.name === 'Ada');
  let pos = { x: self.x, y: self.y, z: self.z };
  // Walk step by step (server enforces max step size), floating is allowed in MVP
  for (let i = 0; i < 40 && Math.hypot(pos.x - target.x, pos.z - target.z) > 3; i++) {
    const dx = target.x - pos.x, dz = target.z - pos.z, d = Math.hypot(dx, dz);
    const s = Math.min(1, d);
    const nx = pos.x + (dx / d) * s, nz = pos.z + (dz / d) * s;
    // y omitted: the server puts the agent on the ground surface
    const r = await api('POST', '/api/agent/act', { type: 'move', x: nx, z: nz }, agent.apiKey);
    if (r.body.ok) pos = r.body.position;
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.ok(Math.hypot(pos.x - target.x, pos.z - target.z) <= 3.5, 'agent walked to the human');

  // Agent speaks; human hears it over the socket
  const said = await api('POST', '/api/agent/act', { type: 'chat', text: 'Hello Ada, I am Unit-7.' }, agent.apiKey);
  assert.equal(said.status, 200);
  const heard = await h.wait((m) => m.t === 'chat' && m.name === 'Unit-7');
  assert.equal(heard.text, 'Hello Ada, I am Unit-7.');
  assert.equal(heard.kind, 'agent');

  // Human replies; agent hears it on next observe
  h.send({ t: 'chat', text: 'Welcome, neighbour!' });
  await h.wait((m) => m.t === 'chat' && m.name === 'Ada');
  const obs2 = await api('GET', '/api/agent/observe', undefined, agent.apiKey);
  assert.ok(obs2.body.heard.some((m) => m.name === 'Ada' && m.text === 'Welcome, neighbour!'), 'agent heard human');

  // Human loads the chunk the agent stands in, then the agent builds
  const cx = Math.floor(pos.x / CHUNK), cz = Math.floor(pos.z / CHUNK);
  h.send({ t: 'chunk', cx, cz });
  const chunk = await h.wait((m) => m.t === 'chunk' && m.cx === cx && m.cz === cz);
  assert.ok(Array.isArray(chunk.blocks));
  let bx = Math.floor(pos.x) + 2, bz = Math.floor(pos.z);
  for (let i = 0; i < 6 && srv.world.treeTrunkAt(bx + 0.5, bz + 0.5); i++) bz++;
  const by = Math.ceil(srv.world.ground(bx + 0.5, bz + 0.5));
  const under = await api('POST', '/api/agent/act', { type: 'place', x: bx, y: by - 3, z: bz, block: 4 }, agent.apiKey);
  assert.match(under.body.error, /underground/);
  const placed = await api('POST', '/api/agent/act', { type: 'place', x: bx, y: by, z: bz, block: 4 }, agent.apiKey);
  assert.equal(placed.status, 200, JSON.stringify(placed.body));
  const upd = await h.wait((m) => m.t === 'block' && m.x === bx && m.y === by && m.z === bz);
  assert.equal(upd.block, 4);
  assert.equal(srv.world.getBlock(bx, by, bz), 4);

  // Human breaks it again
  const hp = (await h.wait((m) => m.t === 'snapshot')).entities.find((e) => e.name === 'Ada');
  const reach = Math.hypot(hp.x - bx - 0.5, hp.y - by - 0.5, hp.z - bz - 0.5);
  if (reach <= 7) {
    h.send({ t: 'break', x: bx, y: by, z: bz });
    const brk = await h.wait((m) => m.t === 'block' && m.x === bx && m.block === 0);
    assert.equal(brk.by, human.account.id);
  }
  await h.close();
});

test('server rejects cheating and malformed actions', async () => {
  const obs = await api('GET', '/api/agent/observe', undefined, agent.apiKey);
  const s = obs.body.self;
  const tp = await api('POST', '/api/agent/act', { type: 'move', x: s.x + 500, y: s.y, z: s.z }, agent.apiKey);
  assert.equal(tp.status, 422);
  assert.match(tp.body.error, /too far/);
  const nan = await api('POST', '/api/agent/act', { type: 'move', x: 'a', y: 1, z: 1 }, agent.apiKey);
  assert.equal(nan.status, 422);
  const far = await api('POST', '/api/agent/act', { type: 'place', x: Math.floor(s.x) + 50, y: 30, z: Math.floor(s.z), block: 3 }, agent.apiKey);
  assert.match(far.body.error, /reach/);
  const bogus = await api('POST', '/api/agent/act', { type: 'place', x: Math.floor(s.x) + 1, y: Math.floor(s.y) + 2, z: Math.floor(s.z), block: 99 }, agent.apiKey);
  assert.match(bogus.body.error, /not placeable/);
  const dig = await api('POST', '/api/agent/act', { type: 'break', x: Math.floor(s.x), y: Math.floor(s.y) - 1, z: Math.floor(s.z) }, agent.apiKey);
  assert.match(dig.body.error, /natural terrain/);
  await new Promise((r) => setTimeout(r, 300));
  const g = srv.world.ground(s.x, s.z);
  const sink = await api('POST', '/api/agent/act', { type: 'move', x: s.x, y: g - 1.5, z: s.z }, agent.apiKey);
  assert.match(sink.body.error, /blocked/);
  const bad = await api('POST', '/api/agent/act', { type: 'explode' }, agent.apiKey);
  assert.equal(bad.status, 400);
  const json = await api('POST', '/api/agent/act', '{not json', agent.apiKey);
  assert.equal(json.status, 400);
  const big = await api('POST', '/api/agent/memory', { text: 'x'.repeat(20000) }, agent.apiKey);
  assert.equal(big.status, 413);
});

test('chat is rate limited', async () => {
  let limited = false;
  for (let i = 0; i < 10; i++) {
    const r = await api('POST', '/api/agent/act', { type: 'chat', text: `spam ${i}` }, agent.apiKey);
    if (r.status === 422 && /rate limited/.test(r.body.error)) { limited = true; break; }
  }
  assert.ok(limited);
});

test('agent memory and home persist', async () => {
  const m1 = await api('POST', '/api/agent/memory', { kind: 'relationship', text: 'Met Ada; she welcomed me.' }, agent.apiKey);
  assert.equal(m1.status, 200);
  const home = await api('POST', '/api/agent/act', { type: 'set_home' }, agent.apiKey);
  assert.equal(home.status, 200);
  agent.home = home.body.home;
  const list = await api('GET', '/api/agent/memory', undefined, agent.apiKey);
  assert.ok(list.body.memories.some((m) => m.kind === 'relationship' && m.text.includes('Ada')));
});

test('world persists and keeps running across a server restart', async () => {
  const tickBefore = srv.game.tick;
  await new Promise((r) => setTimeout(r, 350));
  assert.ok(srv.game.tick > tickBefore, 'world ticks with no human connected');
  const blockCount = srv.db.prepare('SELECT COUNT(*) AS n FROM block_edits').get().n;
  const lastTick = srv.game.tick;
  await srv.close();

  srv = await createServer({ dbPath, port: 0, host: '127.0.0.1', seed: 999 /* ignored: stored seed wins */ });
  base = `http://127.0.0.1:${srv.port}`;
  const info = await api('GET', '/api/world');
  assert.equal(info.body.seed, 1234, 'seed persisted');
  assert.ok(info.body.tick >= lastTick, 'world clock resumed, not reset');
  assert.equal(info.body.registered.agents, 1);
  assert.equal(srv.db.prepare('SELECT COUNT(*) AS n FROM block_edits').get().n, blockCount);

  const me = await api('GET', '/api/agent/me', undefined, agent.apiKey);
  assert.equal(me.status, 200, 'API key still valid after restart');
  assert.deepEqual(me.body.entity.home, agent.home);
  const mem = await api('GET', '/api/agent/memory', undefined, agent.apiKey);
  assert.ok(mem.body.memories.some((m) => m.text.includes('Ada')), 'memory survived restart');
  const login = await api('POST', '/api/login', { name: 'Ada', password: 'correct horse' });
  assert.equal(login.status, 200);
});
