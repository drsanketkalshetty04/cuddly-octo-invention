// Central tunables. Anything security- or balance-relevant lives here so it
// is reviewed in one place.
export const CHUNK = 16;          // structure shard size (metres)
export const HEIGHT = 256;         // build height limit in metres
export { SEA_LEVEL } from "../public/terrain.js";

export const TICK_MS = 100;       // simulation tick (10 Hz)
export const SNAPSHOT_EVERY = 2;  // broadcast entity positions every N ticks (5 Hz)
export const PERSIST_EVERY_MS = 5000;

export const MAX_SPEED = 12;      // blocks/second, server-enforced
export const MAX_STEP = 8;        // max distance accepted in a single move
export const REACH = 7;           // max distance to place/remove a building piece
export const VIEW_RADIUS = 96;    // entities further than this are not sent
export const HEAR_RADIUS = 32;    // chat range
export const MAX_CHAT_LEN = 280;
export const MAX_MEMORY_LEN = 2000;
export const MAX_BODY_BYTES = 16 * 1024;

export const AGENT_ONLINE_MS = 60_000; // REST agents count as present this long after last action

// Per-account action budgets (token bucket: capacity, refill per second)
export const RATE = {
  move: [40, 25],
  chat: [5, 0.5],
  block: [10, 5],
  chunk: [200, 50],
  memory: [20, 2],
};
// Per-IP budget for account creation (capacity, refill per second)
export const REGISTER_RATE = [5, 5 / 3600];
