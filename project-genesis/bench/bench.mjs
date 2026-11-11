// Rough single-process measurements. Not a load test; see WEEKLY_REPORT.md.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { heightAt, treeInCell } from '../public/terrain.js';
import { createServer } from '../src/server.js';

let t = performance.now(), acc = 0;
for (let i = 0; i < 200000; i++) acc += heightAt(1, (i % 500) * 3.7, Math.floor(i / 500) * 3.7);
console.log(`terrain height: ${((performance.now() - t) / 200000 * 1000).toFixed(2)} µs/sample`);
t = performance.now();
for (let i = 0; i < 20000; i++) treeInCell(1, i % 200, Math.floor(i / 200));
console.log(`tree placement: ${((performance.now() - t) / 20000 * 1000).toFixed(2)} µs/cell`);

const srv = await createServer({ dbPath: path.join(mkdtempSync(path.join(tmpdir(), 'gb-')), 'b.db'), port: 0, host: '127.0.0.1', seed: 1 });
const base = `http://127.0.0.1:${srv.port}`;
const N_AGENTS = Number(process.env.AGENTS || 50);
const keys = [];
for (let i = 0; i < N_AGENTS; i++) {
  // bypass per-IP registration limit by registering directly
  keys.push(srv.auth.registerAgent(`bench_${i}`).apiKey);
}
const obs = async (k) => (await fetch(base + '/api/agent/observe', { headers: { authorization: `Bearer ${k}` } })).json();
await Promise.all(keys.map(obs));
const lat = [];
t = performance.now();
const ROUNDS = 10;
for (let r = 0; r < ROUNDS; r++) {
  await Promise.all(keys.map(async (k) => { const s = performance.now(); await obs(k); lat.push(performance.now() - s); }));
}
const total = (performance.now() - t) / 1000;
lat.sort((a, b) => a - b);
console.log(`${N_AGENTS} concurrent agents, ${ROUNDS} rounds of observe: ${(lat.length / total).toFixed(0)} req/s, p50 ${lat[lat.length >> 1].toFixed(1)} ms, p95 ${lat[Math.floor(lat.length * 0.95)].toFixed(1)} ms`);
await srv.close();
