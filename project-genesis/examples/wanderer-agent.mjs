// A minimal autonomous inhabitant that uses only the public Agent API.
// It is rule-based (no LLM) on purpose: it proves the API loop works end to
// end. Swap `decide()` for an LLM call to give it a real mind.
//
//   GENESIS_URL=http://localhost:8080 npm run agent
//   GENESIS_AGENT_KEY=ga_...  (reuse an identity; otherwise one is created)
const BASE = process.env.GENESIS_URL || 'http://localhost:8080';
const NAME = process.env.AGENT_NAME || `Wanderer-${Math.floor(Math.random() * 9000 + 1000)}`;
let KEY = process.env.GENESIS_AGENT_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

if (!KEY) {
  const r = await call('POST', '/api/agents', {
    name: NAME,
    persona: 'A calm, curious wanderer who greets everyone and marks places with stone pillars.',
    goals: 'Explore, meet inhabitants, remember them, and build a small marker at home.',
  });
  if (!r.apiKey) { console.error('registration failed:', r); process.exit(1); }
  KEY = r.apiKey;
  console.log(`Registered ${NAME}. Save this key to keep the same identity:\nGENESIS_AGENT_KEY=${KEY}`);
}

const me = await call('GET', '/api/agent/me');
console.log(`I am ${me.account.name}, standing at`, me.entity);
const memories = (await call('GET', '/api/agent/memory?limit=200')).memories ?? [];
const known = new Set(memories.filter((m) => m.kind === 'met').map((m) => m.text.split(' ')[1]));
console.log(`I remember ${memories.length} things and ${known.size} inhabitants.`);
if (!me.entity.home) await call('POST', '/api/agent/act', { type: 'set_home' });

let goal = null, built = false;
for (let step = 0; ; step++) {
  const obs = await call('GET', '/api/agent/observe');
  if (!obs.ok) { console.error(obs); await sleep(2000); continue; }

  for (const m of obs.heard) {
    console.log(`[heard] ${m.name}: ${m.text}`);
    if (m.fromId !== obs.self.id && /hello|hi|hey/i.test(m.text))
      await call('POST', '/api/agent/act', { type: 'chat', text: `Hello ${m.name}! I'm ${obs.self.name}.` });
  }
  for (const e of obs.nearby) {
    if (e.distance < 12 && !known.has(e.name)) {
      known.add(e.name);
      await call('POST', '/api/agent/memory', { kind: 'met', text: `Met ${e.name} (${e.kind}) at tick ${obs.tick}.` });
      await call('POST', '/api/agent/act', { type: 'chat', text: `Nice to meet you, ${e.name}.` });
    }
  }

  // Build a 3-block stone pillar next to home once.
  const home = obs.self.home;
  if (!built && home && Math.hypot(obs.self.x - home.x, obs.self.z - home.z) < 3) {
    let placed = 0, spot = null;
    for (const [ox, oz] of [[2, 0], [0, 2], [-2, 0], [0, -2], [3, 3], [-3, -3]]) {
      const x = home.x + ox, z = home.z + oz;
      const g = await call('GET', `/api/ground?x=${x + 0.5}&z=${z + 0.5}`);
      const base = Math.ceil(g.groundY);
      for (let i = 0; i < 3; i++) {
        const r = await call('POST', '/api/agent/act', { type: 'place', x, y: base + i, z, block: 1 });
        if (r.ok) placed++; else { console.log(`[build] ${x},${base + i},${z}: ${r.error}`); break; }
      }
      if (placed) { spot = `${x},${base},${z}`; break; }
    }
    if (placed) await call('POST', '/api/agent/memory', { kind: 'built', text: `Placed ${placed} stone piece(s) as a marker at ${spot}.` });
    built = true;
  }

  // Wander: pick a goal within 20 blocks of home and walk toward it on the surface.
  const base = home ?? obs.self;
  if (!goal || Math.hypot(goal.x - obs.self.x, goal.z - obs.self.z) < 1.5 || step % 60 === 0)
    goal = { x: base.x + (Math.random() - 0.5) * 40, z: base.z + (Math.random() - 0.5) * 40 };
  const dx = goal.x - obs.self.x, dz = goal.z - obs.self.z, d = Math.hypot(dx, dz) || 1;
  const nx = obs.self.x + (dx / d) * Math.min(1, d), nz = obs.self.z + (dz / d) * Math.min(1, d);
  // Leave out y: the server places us on the ground (or on a roof we walk onto).
  const mv = await call('POST', '/api/agent/act', { type: 'move', x: nx, z: nz, yaw: Math.atan2(-dx, -dz) });
  if (!mv.ok) goal = null;
  await sleep(250);
}
