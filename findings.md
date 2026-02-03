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
| None yet | N/A |

## Resources
- `server/main.ts`
- `client/src/main.ts`
- `shared/src/*`

## Visual/Browser Findings
- None yet

---
*Update this file after every 2 view/browser/search operations*
