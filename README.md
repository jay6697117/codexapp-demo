# Pixel FFA Arena（Deno Deploy）

这是一个用于验证「Deno Deploy + WebSocket + Deno KV 可恢复对局」的 8 人自由混战（`FFA`）俯视像素射击示例：

- 服务端权威裁决，按固定频率推进仿真
- 客户端 PixiJS 渲染，输入稀疏上报（仅变化才发送）
- Deno KV：领导者租约、输入汇聚、快照发布
- 支持离线模式（服务端不可用时本地仿真）

## 目录结构

- `client/`：PixiJS + Vite 浏览器客户端
- `shared/`：确定性仿真 + 快照编解码（服务端/客户端共用）
- `server/`：Deno Deploy 服务端（HTTP + WebSocket + KV），并静态服务 `server/public/`

## 本地开发

### 1）只跑客户端（离线模式）

```bash
pnpm -C client install
pnpm -C client dev
```

打开 `http://localhost:5173`，点击 **Start**。如果服务端不可用，会自动进入离线模式。

### 2）联机模式（同源，推荐）

1. 构建前端到 `server/public/`

```bash
pnpm -C client install
pnpm -C client build
```

2. 启动服务端（需要 Deno）

```bash
deno run -A server/main.ts
```

3. 打开 `http://localhost:8000`，多开几个浏览器标签页体验对战。

### 3）联机模式（Vite 开发服务器 + 反向代理）

`client/vite.config.ts` 已内置 `/api` 和 `/ws` 的反向代理到 `http://localhost:8000`。

1. 启动服务端（Deno）

```bash
deno run -A server/main.ts
```

2. 启动前端开发服务器

```bash
pnpm -C client dev
```

3. 打开 `http://localhost:5173`。

## Deno Deploy 部署

- 入口文件：`server/main.ts`
- 构建：`pnpm -C client build`（输出到 `server/public/`）
- 运行：服务端使用 `serveDir` 提供静态文件，并通过 `/ws` 提供 WebSocket 对局

## KV 键结构（当前实现）

- `["match", matchId, "meta"]`
- `["match", matchId, "leader"]`
- `["match", matchId, "player", playerId]`
- `["match", matchId, "slot", slot]`
- `["match", matchId, "token", playerId]`
- `["match", matchId, "input", playerId]`
- `["match", matchId, "snapshot"]`
- `["match", "waiting", matchId]`

## 操作

- 移动：`WASD`
- 瞄准：鼠标
- 开火：鼠标左键
- 全屏：`F`（`Esc` 退出）

## 测试（可选，Playwright 技能客户端）

建议使用 `--screenshot-dir output/web-game-run`，避免覆盖仓库内已跟踪的 `output/web-game/*`。

```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export WEB_GAME_CLIENT="$CODEX_HOME/skills/develop-web-game/scripts/web_game_playwright_client.js"
export WEB_GAME_ACTIONS="$CODEX_HOME/skills/develop-web-game/references/action_payloads.json"

node "$WEB_GAME_CLIENT" --url http://localhost:5173 --screenshot-dir output/web-game-run --actions-file "$WEB_GAME_ACTIONS" --click-selector "#start-btn" --iterations 3 --pause-ms 250
```

## 联机冒烟（可选，脚本）

用于快速验证“多客户端加入 + 发送输入 + 周期性断线重连 + 能持续收到快照”。

1. 先启动服务端：

```bash
deno run -A server/main.ts
```

2. 再运行脚本（默认 4 个客户端，可改成 8）：

```bash
deno run -A scripts/online_smoke.ts --clients 8 --duration 30000
```
