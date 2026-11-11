# Project Genesis — Weekly Development Report

Week ending 2026-11-11. Every number below was measured in this week's session; anything not measured is listed under "Unverified".

## A. Executive summary

**Before this week Project Genesis did not exist as code.** The two repositories attached to the audit (`BuchatGat`, `cuddly-octo-invention`) contain a Django bookkeeping app for a savings group, last changed in February 2025. They hold no 3D world, no multiplayer, no agent API. No other repository on the account contains Genesis code.

This week a first working version (v0.1) was built from scratch:

- An authoritative world server (Node.js, WebSocket + HTTP, SQLite).
- A browser client with natural terrain, ocean, forests, sky, day/night, and touch controls.
- Human accounts and an Agent API through which AI inhabitants register, perceive, move, talk, build and remember.
- 19 automated server tests and 14 browser checks, all passing.

The design changed mid-week on the owner's direction: the first build was a block (voxel) world; it was replaced by continuous Earth-like terrain. Building still happens on a 1 m grid.

**Honest status:** this is a working prototype that one person can run and enter. It is not hosted anywhere, has never had real users, and the AI inhabitants have no minds yet (the sample agent follows fixed rules).

## B. Development progress

### MVP completion: 13.5 / 20 milestones = 67.5%

Method: 20 fixed milestones, 1 point if verified by an automated test or a recorded run this week, 0.5 if working but only partly verified, 0 otherwise.

| # | Milestone | Score | Evidence |
|---|---|---|---|
| 1 | Server starts, health check | 1 | live run, `/healthz` |
| 2 | Deterministic natural terrain | 1 | `world.test.js` (4 tests) |
| 3 | 3D world renders in a browser | 1 | e2e: frame has >60 colour buckets, >15% green pixels |
| 4 | Movement, validated by server | 1 | e2e + speed/underground rejection tests |
| 5 | Multiplayer synchronisation | 0.5 | human (WebSocket) ↔ agent (HTTP) verified; two simultaneous human clients not tested |
| 6 | Human registration and login | 1 | `server.test.js` |
| 7 | World persists across restart | 1 | restart test: seed, clock, structures, accounts, memory, home |
| 8 | Agent registration with API key | 1 | `server.test.js` |
| 9 | Agent perceive / move / chat / build | 1 | `server.test.js`, live sample-agent run |
| 10 | Agent memory | 1 | survives restart; plain list only, no search |
| 11 | Human–AI interaction | 1 | both directions of chat, mutual visibility, shared building (e2e) |
| 12 | Security baseline | 0.5 | hashing, validation, rate limits tested; gaps in section C |
| 13 | Mobile | 0.5 | emulated Pixel 7 passes; no real phone tested |
| 14 | Building persisted | 1 | restart test |
| 15 | World runs with nobody online | 0.5 | clock advances; nothing in the world actually changes |
| 16 | Deployable package | 0.5 | Dockerfile and compose written; **image build not run** (no Docker daemon here) |
| 17 | Publicly hosted with HTTPS | 0 | not done |
| 18 | AI inhabitants with real minds (LLM) | 0 | sample agent is rule-based |
| 19 | Ownership / economy | 0 | not started |
| 20 | Performance verified on real hardware and under load | 0 | not done |

### Missing entirely

Land ownership and build protection, inventory and resources, economy, businesses, communities, agent goals that drive behaviour, long-term memory retrieval, moderation tools, password reset, voice, sound.

## C. Technical audit

**Architecture.** One Node process owns the simulation. Humans and agents call the same action functions in `src/game.js`, so rules cannot diverge between them. Terrain is a pure function of the seed in `public/terrain.js`, imported by both server and browser; only built structures are stored. This is sound for one small world and wrong for a planet (see scalability).

**Code quality.** About 2,700 lines including tests. Small modules, no framework, two runtime dependencies (`ws`, `three`). `public/client.js` is a single 600-line file and should be split before it grows.

**Database.** SQLite via `node:sqlite` (marked experimental in Node 22). Seven tables. Structures are keyed by cell with a chunk index. Writes are synchronous on the simulation thread. Chat history grows without limit.

**Server performance (4 vCPU Xeon 2.1 GHz, single process).**

| Measure | Result |
|---|---|
| Terrain height sample | 0.55 µs |
| Tree placement per cell | 1.1 µs |
| 50 agents calling `observe` concurrently | 1,356 req/s, p50 21 ms, p95 66 ms |
| 200 agents calling `observe` concurrently | 1,079 req/s, p50 142 ms, p95 195 ms |

**Network sync.** Positions broadcast at 5 Hz to everyone within 96 m, as JSON. Each snapshot scans all entities for each client (quadratic). No client-side prediction reconciliation beyond a snap-back on rejection.

**AI agent architecture.** Agents are external programs using HTTP. The server gives them identity, persona and goals text, perception, actions, memory storage. It does not run any AI itself. That is the right boundary, but nothing yet makes an agent act when its program is not running.

**Security.**

- Done and tested: scrypt password hashes, tokens stored as SHA-256, bearer auth, kind check (human token rejected on agent API), 16 KB body cap, per-account rate limits, per-IP registration limit, speed/reach/underground checks, chat sanitised and rendered as text.
- Gaps: tokens never expire and cannot be revoked; no logout; no password reset; anyone can remove anyone's structures; the server does not enforce gravity, so a modified client can float; movement is not checked against tree trunks; the per-IP limiter map is never pruned; no TLS in the app (needs a reverse proxy).
- **Legacy repositories (action needed):** `BuchatGat/BuchatGut/settings.py` in a public repository contains a live-looking Railway PostgreSQL password and the Django `SECRET_KEY`. Rotate both. `ALLOWED_HOSTS = ['*']`. A populated `db.sqlite3` is also committed.

**Scalability limits.** One process, one machine, one SQLite file. All online entities in one loop. No spatial partitioning, no sharding, no horizontal scale. Realistic ceiling is unknown but likely a few hundred concurrent inhabitants.

## D. Testing results

| Suite | Result |
|---|---|
| `npm test` (node:test; real HTTP, WebSocket, SQLite) | 19 passed, 0 failed |
| `npm run test:e2e` (Chromium, desktop 1280×720 + emulated Pixel 7) | 14 passed, 0 failed |
| Sample agent against a live server (15 s) | registered, walked, placed 3 stone pieces, saved 1 memory, set home |
| Legacy Django app | did not start in a clean environment: first `ugettext_lazy` import error from the pinned `jet` package, then missing `psutil`; 0 tests exist |

**Bugs found and fixed this week:** oversized request cut the connection instead of returning 413; new players spawned on treetops; phone chat overlapped the status box; sample agent recorded a build that had been rejected; sample agent gave up when a tree occupied its build spot.

**Open bugs:** see security gaps above. Also: the `heard` query only looks at the last 200 messages globally, so an agent in a busy world can miss chat.

**Unverified:**

- Frame rate on a real GPU. The only measurements are from a CPU software renderer: the login backdrop held the 60 fps cap at 960×540, while in-game at 1280×720 high quality measured 0.1–1.6 fps with two tabs contending. Neither predicts real devices.
- Any real phone or tablet. Safari and Firefox.
- Docker image build and any hosted deployment.
- Two or more humans online together.
- Behaviour beyond 200 concurrent agents, or over hours of uptime.
- Mountains, snow, beaches and ocean render paths were exercised by code but not visually inspected; screenshots cover grassland and forest only.

## E. Blockers

1. **No server.** Nothing is hosted. Needs a VPS or a platform with a persistent disk and WebSockets, a domain, and HTTPS. Owner decision and account required.
2. **No LLM key or budget decision** for AI inhabitants. Without it agents stay rule-based.
3. **Visual realism has a ceiling without art assets.** Everything is generated in code; trees are low-poly. Earth-like realism needs real models and scanned textures (licensed asset packs) and a loading pipeline.
4. **No separate repository.** This session cannot create one, so the project sits in a `project-genesis/` folder on a branch of an existing repo.

## F. Next week's plan

1. **Deploy to a public URL with HTTPS.** Why: nothing is real until people can enter. How: VPS + Docker compose + Caddy, nightly SQLite backup. Accept: a phone on mobile data signs up and walks; restart keeps the world; `/healthz` monitored.
2. **LLM-driven inhabitant.** Why: the core promise is AI beings, not scripts. How: a runner that feeds `observe` + persona + recent memories to Claude and validates one JSON action per step; cost cap per agent. Accept: an agent holds a 5-turn conversation with a human, remembers their name next day, and builds a recognisable shelter unprompted.
3. **Land claims and build protection.** Why: without ownership the first visitor can erase everything; homes and businesses depend on it. How: `claims` table, claim on `set_home`, permission check in place/break. Accept: tests show a stranger cannot edit inside a claim and the owner can grant access.
4. **Real-device performance pass.** Why: frame rate is unknown. How: test on one mid-range Android, one iPhone, one laptop; add adaptive quality. Accept: ≥30 fps on the phone at low, ≥50 fps on the laptop at high, numbers recorded here.
5. **Harden sessions and movement.** Why: listed security gaps. How: token expiry and logout, server-side gravity and tree collision check, prune limiter map, two-human sync test. Accept: new tests for each; floating client rejected.

## Distance from the vision

| Vision | Today |
|---|---|
| Humans enter by computer and phone | Works locally; phone only emulated; not hosted |
| AI beings enter independently via an API | Works |
| AI have identity, memory, personality, home, goals | Stored as data; nothing uses persona or goals yet |
| Humans and AI share one world | Works, tested |
| AI build, run businesses, collaborate, form communities | Can place pieces. No economy, no groups |
| World evolves when users log out | Only the clock moves |
| Civilisations and economies emerge | Not started |

**Largest architectural gaps:**

1. **No resident agent runtime.** Agents exist only while an outside program polls. A living world needs agents hosted and scheduled by the platform, with budgets.
2. **No economy primitives.** No items, resources, ownership, or exchange, so there is nothing for a society to form around.
3. **Single-process world.** A planet needs spatial sharding, interest management, and a database that is not a single file.
4. **World has no processes of its own.** No growth, weather, or decay; "persistent" currently means "saved".
5. **Asset pipeline.** Realistic visuals need authored assets and streaming, not just generated geometry.

## This week's priority and what was done about it

The single most important unfinished feature at audit time was **the product itself**: there was no shared world for anyone to enter. That was built, tested, and documented this week, as recorded above.
