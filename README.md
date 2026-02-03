# Pixel FFA Arena (Deno Deploy)

8-player FFA top-down pixel shooter demo with a KV-recoverable Deno Deploy server and PixiJS web client.

## Structure
- `client/` PixiJS + Vite web client
- `shared/` Deterministic simulation core (shared by server/client)
- `server/` Deno Deploy server (HTTP + WebSocket + KV)

## Local Development

### Client only (offline mode)
```bash
pnpm -C client install
pnpm -C client dev
```
Open `http://localhost:5173` and click **Start**. If the server is not running, the game falls back to offline mode.

### Server (requires Deno)
```bash
deno run -A server/main.ts
```

### Build for Deno Deploy
```bash
pnpm -C client install
pnpm -C client build
```
The build outputs to `server/public/`.

## Deno Deploy Notes
- Entrypoint: `server/main.ts`
- The server serves static files from `server/public/`
- Use `deno deploy create .` or `deno deploy --prod .` with interactive login; `deno.json` `deploy` supports `org/app` only.
- KV keys:
  - `["match", matchId, "meta"]`
  - `["match", matchId, "leader"]`
  - `["match", matchId, "players", playerId]`
  - `["match", matchId, "input", playerId]`
  - `["match", matchId, "snapshot"]`

## Controls
- Move: `WASD`
- Aim: Mouse
- Fire: Left mouse button
- Fullscreen: `F` (Esc to exit)

## Testing (Playwright Skill Client)
```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export WEB_GAME_CLIENT="$CODEX_HOME/skills/develop-web-game/scripts/web_game_playwright_client.js"
export WEB_GAME_ACTIONS="$CODEX_HOME/skills/develop-web-game/references/action_payloads.json"

node "$WEB_GAME_CLIENT" --url http://localhost:5173 --actions-file "$WEB_GAME_ACTIONS" --click-selector "#start-btn" --iterations 3 --pause-ms 250
```
