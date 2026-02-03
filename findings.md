# Findings & Decisions

## Requirements
- 8-player FFA top-down pixel shooter (WASD + mouse aim/shoot)
- Web client (browser) + Deno Deploy server
- Server authoritative, client interpolation + light prediction
- KV recoverable server architecture (leader election + snapshot in KV)
- Snapshot payload must stay < 64KiB
- PixiJS rendering on client

## Research Findings
- Deno Deploy is multi-instance serverless; instances can be stopped or evicted.
- Deno KV value limit is 64KiB; watch supports up to 10 keys and returns entries that count as reads.
- WebSocket upgrade supports idleTimeout for health checks.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Use KV for leader lease + snapshot + input | Aligns with recoverable design; avoids per-tick full state writes |
| Quantize aim/move directions | Reduces input churn and KV writes |
| Snapshot binary encoding | Keeps payload compact and predictable |
| Server uses fixed 8-slot player array | Allows constant snapshot size and simple decode |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| `pnpm -C client exec tsc -p tsconfig.json` failed with TS2307/TS18047/TS7006 | resolved (tsconfig paths + DOM guards) |
| `deno run -A server/main.ts` failed: `Deno.openKv is not a function` (unstable API) | resolved (`deno.json` adds `unstable.kv`) |
| Playwright run shows console 404 but `mode: online` after adding Vite proxy | resolved (stale errors file; fresh run has no console errors) |

## 2026-02-03 TypeScript Baseline (Local Worktree)
- `client/tsconfig.json` currently lacks `baseUrl`/`paths` for `@shared/*`, triggering TS2307 for `@shared/index.ts`.
- `client/src/main.ts` DOM refs are typed as nullable; despite runtime guards, tsc still reports possible null use in functions.
- `client/src/main.ts` has several `map` callbacks inferred as `any`, causing TS7006.
- `client/vite.config.ts` already defines alias `@shared -> ../shared/src`, so TS config should mirror this.
- `client/src/main.ts` uses `snapshot.players.map/forEach` in `interpolateSnapshots`, `render()`, and `renderGameToText`, suggesting `players` is typed as `any[]` (or `unknown[]`), which drives TS7006.

## 2026-02-03 Local Server Notes
- `server/main.ts` uses `Deno.serve()` with defaults (port 8000 unless overridden).
- WebSocket endpoint: `/ws`; API: `/api/match/join`, `/api/match/:id/state`.
- `deno.json` in worktree lacks `"unstable": ["kv"]`, so local `deno run` does not enable `Deno.openKv()`.
- Vite dev server is running on `http://localhost:5174/` (status 200).
- Playwright state now shows `mode: online`, `connected: true`, `snapshotSeq` advancing; `/api` proxy appears functional.
- Fresh Playwright run in `output/web-game-run-2/` produced no `errors-*.json`, confirming console is clean.
- Multi-client verification (Playwright + fetch): two clients joined same match, `playerCount >= 2` and both `connected: true`.

## 2026-02-03 Deploy Config
- `deno deploy` CLI expects `deploy.org/app` only; build config is not accepted in `deno.json` for this CLI.

## 2026-02-03 Deploy CLI Checks
- `deno deploy` CLI is available via `deno deploy ...` (no `deployctl` on PATH).
- `DENO_DEPLOY_TOKEN` not set in environment; interactive auth or token input required.
- `deno deploy` supports `--org` and `--app`; `deno deploy create` supports `--org` but prompts for app name.
- `deno deploy .` after auth failed with org access error when `deno.json` contained placeholder `deploy.org/app`; removed placeholders.

## Resources
- `server/main.ts`
- `client/src/main.ts`
- `shared/src/*`

## Visual/Browser Findings
- None yet

---
*Update this file after every 2 view/browser/search operations*
