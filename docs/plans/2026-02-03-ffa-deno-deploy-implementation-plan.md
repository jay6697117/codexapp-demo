# FFA Pixel Shooter (Deno Deploy + KV) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a deployable 8-player FFA top-down pixel shooter with a KV-recoverable Deno Deploy server and a PixiJS web client.

**Architecture:** Shared deterministic simulation in `shared/`, Deno Deploy server in `server/` (HTTP + WebSocket + KV leader/snapshot), and PixiJS client in `client/` with offline fallback and network mode.

**Tech Stack:** Deno Deploy, Deno KV, TypeScript, PixiJS, Vite, Playwright (skill client).

---

### Task 1: Repository Structure & Tooling

**Files:**
- Create: `client/package.json`
- Create: `client/vite.config.ts`
- Create: `client/tsconfig.json`
- Create: `client/index.html`
- Create: `server/main.ts`
- Create: `shared/src/index.ts`
- Create: `shared/src/constants.ts`
- Create: `shared/src/types.ts`

**Step 1: Write the failing test**

```ts
import { initGameState } from "../../shared/src/index";
const state = initGameState(1);
if (!state) throw new Error("state missing");
```

**Step 2: Run test to verify it fails**

Run: `node -e "require('./shared/src/index')"`

Expected: FAIL with "module not found"

**Step 3: Write minimal implementation**

```ts
export function initGameState(seed: number) {
  return { seed };
}
```

**Step 4: Run test to verify it passes**

Run: `node -e "require('./shared/src/index')"`

Expected: PASS (no exception)

**Step 5: Commit**

```bash
git add client server shared
git commit -m "chore: initialize structure"
```

---

### Task 2: Shared Simulation Core

**Files:**
- Create: `shared/src/rng.ts`
- Create: `shared/src/map.ts`
- Create: `shared/src/physics.ts`
- Create: `shared/src/sim.ts`
- Create: `shared/src/snapshot.ts`
- Modify: `shared/src/index.ts`

**Step 1: Write the failing test**

```ts
import { initGameState, stepGame } from "../../shared/src/index";
const state = initGameState(42);
const next = stepGame(state, new Map(), 1 / 30);
if (!next) throw new Error("step missing");
```

**Step 2: Run test to verify it fails**

Run: `node -e "require('./shared/src/index')"`

Expected: FAIL with "stepGame not defined"

**Step 3: Write minimal implementation**

```ts
export function stepGame(state, inputs, dt) {
  return { ...state };
}
```

**Step 4: Run test to verify it passes**

Run: `node -e "require('./shared/src/index')"`

Expected: PASS

**Step 5: Commit**

```bash
git add shared
git commit -m "feat: add shared simulation core"
```

---

### Task 3: Client Rendering & Input

**Files:**
- Create: `client/src/main.ts`

**Step 1: Write the failing test**

```js
if (!window.render_game_to_text) throw new Error("missing render_game_to_text");
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix client run dev` then check in browser console

Expected: FAIL

**Step 3: Write minimal implementation**

```ts
window.render_game_to_text = () => JSON.stringify({ mode: "menu" });
```

**Step 4: Run test to verify it passes**

Expected: PASS

**Step 5: Commit**

```bash
git add client
git commit -m "feat: render loop and input"
```

---

### Task 4: Deno Deploy Server (HTTP + WS + KV)

**Files:**
- Modify/Create: `server/main.ts`

**Step 1: Write the failing test**

```sh
curl -s -X POST http://localhost:8000/api/match/join | jq .
```

**Step 2: Run test to verify it fails**

Expected: 404

**Step 3: Write minimal implementation**

```ts
if (pathname === "/api/match/join") return new Response("ok");
```

**Step 4: Run test to verify it passes**

Expected: 200 OK

**Step 5: Commit**

```bash
git add server
git commit -m "feat: add basic Deno server"
```

---

### Task 5: KV Leader + Snapshot Broadcast

**Files:**
- Modify: `server/main.ts`
- Modify: `shared/src/snapshot.ts`

**Step 1: Write the failing test**

```ts
// Pseudo: ensure snapshot seq increments in KV
```

**Step 2: Run test to verify it fails**

Run: `deno run -A server/main.ts`

Expected: no snapshot writes

**Step 3: Write minimal implementation**

```ts
await kv.set(["match", matchId, "snapshot"], { seq: 1, serverTime: Date.now(), bytes });
```

**Step 4: Run test to verify it passes**

Expected: KV shows snapshot key

**Step 5: Commit**

```bash
git add server shared
git commit -m "feat: leader snapshot writes"
```

---

### Task 6: Playwright Automation Loop

**Files:**
- Modify: `client/src/main.ts`
- Modify: `progress.md`

**Step 1: Run skill client**

```bash
node "$WEB_GAME_CLIENT" --url http://localhost:5173 --actions-file "$WEB_GAME_ACTIONS" --click-selector "#start-btn" --iterations 3 --pause-ms 250
```

**Step 2: Inspect screenshots and text state**

Expected: player moves, shoots, score updates.

**Step 3: Commit**

```bash
git add client progress.md
git commit -m "test: validate interactions via playwright"
```

---

## Execution Options
Plan complete and saved to `docs/plans/2026-02-03-ffa-deno-deploy-implementation-plan.md`. Two execution options:

1. Subagent-Driven (this session)
2. Parallel Session (separate)
