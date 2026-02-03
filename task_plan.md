# Task Plan: Deno Deploy FFA Pixel Shooter Demo

## Goal
Implement a deployable 8-player FFA top-down pixel shooter demo with a KV-recoverable Deno Deploy server, a PixiJS web client, and a shared deterministic simulation core.

## Current Phase
Phase 3

## Phases

### Phase 1: Requirements & Discovery
- [x] Understand user intent
- [x] Identify constraints and requirements
- [x] Document findings in findings.md
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Define technical approach
- [x] Create project structure if needed
- [x] Document decisions with rationale
- **Status:** complete

### Phase 3: Implementation
- [x] Execute the plan step by step
- [x] Write code to files before executing
- [ ] Test incrementally
- **Status:** in_progress

### Phase 4: Testing & Verification
- [ ] Verify all requirements met
- [ ] Document test results in progress.md
- [ ] Fix any issues found
- **Status:** pending

### Phase 5: Delivery
- [ ] Review all output files
- [ ] Ensure deliverables are complete
- [ ] Deliver to user
- **Status:** pending

## Key Questions
1. How to keep KV snapshot payload < 64KiB while keeping necessary state?
2. How to structure leader election and snapshot broadcast with minimal complexity?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Deno Deploy + KV for server | Matches deployment constraint and recoverability requirement |
| PixiJS for client rendering | Efficient 2D canvas rendering for pixel-style visuals |
| Fixed-step shared simulation | Deterministic state across server and client |
| Fixed-size binary snapshot | Guarantees KV payload bounds and fast decode |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `pnpm -C client exec tsc -p tsconfig.json` failed (TS2307/TS18047/TS7006) | 1 | Fixed `client/tsconfig.json` alias + `allowImportingTsExtensions`; added `requireElement` for DOM refs |
| `deno run -A server/main.ts` failed (`Deno.openKv` unstable) | 1 | Added `"unstable": ["kv"]` to `deno.json` |
| Node Playwright multi-client check failed (shell backticks + matchId undefined) | 1 | Fixed quoting + wait loop; verified same match and playerCount >= 2 |
| `deno deploy --help` timed out while downloading deps | 1 | Re-ran with longer timeout; help output retrieved |
| `deno deploy create .` failed (config parse: unknown field `install`) | 1 | pending |
| `deno deploy .` failed after auth (org not found/no access) | 1 | Removed placeholder `deploy.org/app` from `deno.json`; waiting for real org/app |
| `deno deploy .` failed: no organization selected | 1 | pending |
| `deno deploy switch` failed: no organization selected | 1 | pending |
| `deno deploy --org SteveZhang --app codex-demo --prod .` failed (org not found/no access) | 1 | pending |

## Notes
- Update phase status as you progress: pending → in_progress → complete
- Re-read this plan before major decisions (attention manipulation)
- Log ALL errors - they help avoid repetition
