// Browser end-to-end check: boots a real server, signs up in Chromium,
// verifies the voxel world renders, the player can move and build, and an
// AI agent (REST) and the human see each other. Also runs a phone viewport.
// Usage: npm run test:e2e   (needs Playwright + Chromium available)
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(require.resolve('playwright', { paths: ['/usr/lib/node_modules', '/usr/local/lib/node_modules', process.cwd()] })); }
const { chromium, devices } = playwright;

const shots = process.env.E2E_SHOTS || path.join(process.cwd(), 'e2e', 'screenshots');
mkdirSync(shots, { recursive: true });
const dbPath = path.join(mkdtempSync(path.join(tmpdir(), 'genesis-e2e-')), 'e2e.db');
const srv = await createServer({ dbPath, port: 0, host: '127.0.0.1', seed: 2024 });
const base = `http://127.0.0.1:${srv.port}`;
const results = [];
const check = async (name, fn) => {
  const t = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t }); console.log(`ok   ${name}`); }
  catch (e) { results.push({ name, ok: false, error: e.message }); console.log(`FAIL ${name}: ${e.message}`); }
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  // ---------------- desktop ----------------
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base);

  await check('sign-up form creates an account and enters the world', async () => {
    await page.click('.tabs button[data-mode=register]', { timeout: 60000 });
    await page.fill('input[name=name]', 'Explorer', { timeout: 60000 });
    await page.fill('input[name=password]', 'a-good-password', { timeout: 60000 });
    await page.click('#authSubmit', { timeout: 60000 });
    await page.waitForFunction(() => window.__genesis?.connected === true, null, { timeout: 60000, polling: 500 });
  });

  await check('natural terrain tiles and vegetation stream in', async () => {
    await page.waitForFunction(() => window.__genesis.tiles.size >= 60, null, { timeout: 60000, polling: 500 });
    const veg = await page.evaluate(() => [...window.__genesis.tiles.values()].filter((t) => t.veg).length);
    assert.ok(veg >= 9, `tiles with vegetation: ${veg}`);
  });

  await check('WebGL frame shows a rich rendered landscape (not a blank sky)', async () => {
    await page.waitForTimeout(1500);
    const stats = await page.evaluate(async () => {
      const url = window.__genesis.snapshot('image/png');
      const img = new Image(); img.src = url; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const colors = new Set(); let greenish = 0, n = 0;
      for (let i = 0; i < d.length; i += 4 * 97) { n++; colors.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4)); if (d[i + 1] > d[i] && d[i + 1] > d[i + 2]) greenish++; }
      return { colors: colors.size, greenish: greenish / n, url };
    });
    writeFileSync(path.join(shots, 'desktop.png'), Buffer.from(stats.url.split(',')[1], 'base64'));
    assert.ok(stats.colors > 60 && stats.greenish > 0.15, JSON.stringify({ colors: stats.colors, greenish: stats.greenish }));
  });

  await check('player moves with keyboard and server accepts the position', async () => {
    const before = await page.evaluate(() => ({ ...window.__genesis.pos }));
    await page.keyboard.down('KeyW'); await page.waitForTimeout(1200); await page.keyboard.up('KeyW');
    const after = await page.evaluate(() => ({ ...window.__genesis.pos }));
    const moved = Math.hypot(after.x - before.x, after.z - before.z);
    assert.ok(moved > 1, `moved ${moved.toFixed(2)}`);
    await page.waitForTimeout(300);
    const id = await page.evaluate(() => window.__genesis.me.id);
    const e = srv.game.entities.get(id);
    assert.ok(Math.hypot(e.x - after.x, e.z - after.z) < 1.5, 'server position tracks client');
  });

  let agentKey, agentId;
  await check('an AI agent joins and appears in the human\'s view', async () => {
    const r = await fetch(base + '/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Mira', persona: 'Friendly AI gardener' }) });
    const j = await r.json(); agentKey = j.apiKey; agentId = j.account.id;
    await fetch(base + '/api/agent/observe', { headers: { authorization: `Bearer ${agentKey}` } });
    await page.waitForFunction((id) => window.__genesis.others.has(id), agentId, { timeout: 30000, polling: 250 });
  });

  await check('human builds and removes a stone piece via the real client', async () => {
    const r = await page.evaluate(() => {
      const S = window.__genesis;
      const x = Math.floor(S.pos.x) + 2, z = Math.floor(S.pos.z);
      return { x, y: Math.ceil(S.ground(x + 0.5, z + 0.5)), z };
    });
    let ok = false;
    for (let dz = 0; dz < 6 && !ok; dz++) {
      const p = { ...r, z: r.z + dz };
      p.y = await page.evaluate((q) => Math.ceil(window.__genesis.ground(q.x + 0.5, q.z + 0.5)), p);
      await page.evaluate((q) => window.__genesis.ws.send(JSON.stringify({ t: 'place', ...q, block: 1 })), p);
      await page.waitForTimeout(400);
      if (srv.world.getBlock(p.x, p.y, p.z) === 1) { ok = true; r.z = p.z; r.y = p.y; }
    }
    assert.ok(ok, 'server accepted a placement');
    await page.waitForFunction((p) => window.__genesis.structures.get(`${Math.floor(p.x / 16)},${Math.floor(p.z / 16)}`)?.get(`${p.x},${p.y},${p.z}`) === 1, r, { timeout: 10000, polling: 200 });
    await page.evaluate((p) => window.__genesis.ws.send(JSON.stringify({ t: 'break', ...p })), r);
    await page.waitForTimeout(500);
    assert.equal(srv.world.getBlock(r.x, r.y, r.z), 0);
  });

  await check('chat from the human UI reaches the AI; AI reply shows in UI', async () => {
    // bring the agent next to the human (walk in steps, as the server enforces speed)
    const me = await page.evaluate(() => ({ ...window.__genesis.pos }));
    for (let i = 0; i < 60; i++) {
      const o = await (await fetch(base + '/api/agent/observe', { headers: { authorization: `Bearer ${agentKey}` } })).json();
      const s = o.self, dx = me.x - s.x, dz = me.z - s.z, d = Math.hypot(dx, dz);
      if (d < 3) break;
      const st = Math.min(1, d), nx = s.x + dx / d * st, nz = s.z + dz / d * st;
      await fetch(base + '/api/agent/act', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${agentKey}` }, body: JSON.stringify({ type: 'move', x: nx, z: nz }) });
      await new Promise((r) => setTimeout(r, 40));
    }
    await page.keyboard.press('Enter');
    await page.fill('#chatInput', 'Hello Mira!', { timeout: 60000 });
    await page.keyboard.press('Enter');
    let heard = false;
    for (let i = 0; i < 20 && !heard; i++) {
      const o = await (await fetch(base + '/api/agent/observe', { headers: { authorization: `Bearer ${agentKey}` } })).json();
      heard = o.heard.some((m) => m.text === 'Hello Mira!');
      if (!heard) await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(heard, 'agent heard human');
    await fetch(base + '/api/agent/act', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${agentKey}` }, body: JSON.stringify({ type: 'chat', text: 'Hi Explorer, welcome!' }) });
    await page.waitForSelector('#chatLog >> text=Hi Explorer, welcome!', { timeout: 30000 });
  });

  await check('frame rate measured in headless software rendering', async () => {
    const fps = await page.evaluate(() => new Promise((res) => {
      let n = 0; const t0 = performance.now();
      const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); };
      requestAnimationFrame(f);
    }));
    results.push({ name: `measured fps (headless SwiftShader CPU renderer, 1280x720, high quality): ${fps.toFixed(1)}`, ok: true, info: true });
    console.log(`info measured fps ${fps.toFixed(1)}`);
  });

  await check('no uncaught page errors on desktop', async () => { assert.deepEqual(errors, []); });
  await check('returning visitor is signed in automatically (token persisted)', async () => {
    // A returning visitor opens the game in a new tab of the same browser profile.
    await page.close();
    const again = await ctx.newPage();
    await again.goto(base + '/?quality=low');
    await again.waitForFunction(() => window.__genesis?.connected === true, null, { timeout: 60000, polling: 500 });
    assert.equal(await again.evaluate(() => window.__genesis.me.name), 'Explorer');
    await again.close();
  });

  await ctx.close();

  // ---------------- phone ----------------
  const phone = await browser.newContext({ ...devices['Pixel 7'] });
  phone.setDefaultTimeout(60000);
  const p2 = await phone.newPage();
  const errors2 = [];
  p2.on('pageerror', (e) => errors2.push(e.message));
  await p2.goto(base);
  await check('phone: sign-in panel fits the screen without horizontal scroll', async () => {
    const w = await p2.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.ok(w[0] <= w[1], JSON.stringify(w));

  });
  await check('phone: register and enter, touch controls visible', async () => {
    await p2.click('.tabs button[data-mode=register]', { timeout: 60000 });
    await p2.fill('input[name=name]', 'PhoneUser', { timeout: 60000 });
    await p2.fill('input[name=password]', 'another-password', { timeout: 60000 });
    await p2.click('#authSubmit', { timeout: 60000 });
    await p2.waitForFunction(() => window.__genesis?.connected && window.__genesis.tiles.size >= 30, null, { timeout: 60000, polling: 500 });
    assert.ok(await p2.isVisible('#stick'));
    assert.ok(await p2.isVisible('#btnJump'));
    assert.ok(!(await p2.isVisible('#help')));
  });
  await check('phone: joystick drag moves the player', async () => {
    const before = await p2.evaluate(() => ({ ...window.__genesis.pos }));
    const box = await p2.locator('#stick').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const cdp = await phone.newCDPSession(p2);
    const tp = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: cx, y, id: 1 }] });
    await tp('touchStart', cy); await tp('touchMove', cy - 50);
    await p2.waitForTimeout(1200);
    await tp('touchEnd', cy - 50);
    const after = await p2.evaluate(() => ({ ...window.__genesis.pos }));
    const moved = Math.hypot(after.x - before.x, after.z - before.z);
    assert.ok(moved > 1, `moved ${moved.toFixed(2)}`);
    const url = await p2.evaluate(() => window.__genesis.snapshot());
    writeFileSync(path.join(shots, 'phone-world.jpg'), Buffer.from(url.split(',')[1], 'base64'));
  });
  await check('no uncaught page errors on phone', async () => { assert.deepEqual(errors2, []); });
  await phone.close();
} finally {
  await browser.close();
  await srv.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.filter((r) => r.ok && !r.info).length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
