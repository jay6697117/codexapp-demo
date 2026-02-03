# 自由混战（`FFA`）像素射击（Deno Deploy + KV）落地实施计划

> **给 Codex：**必须使用 `superpowers:executing-plans` 按任务逐条执行本计划。

**目标：**落地一个可部署的 8 人自由混战（`FFA`）俯视像素射击示例：Deno Deploy 服务端（Deno KV 可恢复）+ PixiJS 浏览器客户端。

**架构：**`shared/` 提供确定性仿真与快照编解码；`server/` 提供 HTTP + WebSocket + KV 领导者租约/快照；`client/` 负责渲染与输入，上线模式失败自动回退离线模式。

**技术栈：**Deno Deploy、Deno KV、TypeScript、PixiJS、Vite、Playwright（技能客户端）。

---

### 任务 1：仓库结构与工具链

**涉及文件：**
- 新建：`client/package.json`
- 新建：`client/vite.config.ts`
- 新建：`client/tsconfig.json`
- 新建：`client/index.html`
- 新建：`server/main.ts`
- 新建：`shared/src/index.ts`
- 新建：`shared/src/constants.ts`
- 新建：`shared/src/types.ts`

**步骤 1：先写一个会失败的最小测试**

```ts
import { initGameState } from "../../shared/src/index";
const state = initGameState(1);
if (!state) throw new Error("state missing");
```

**步骤 2：运行测试，确认它会失败**

运行：`node -e "require('./shared/src/index')"`

预期：失败（`module not found`）

**步骤 3：写最小实现让测试通过**

```ts
export function initGameState(seed: number) {
  return { seed };
}
```

**步骤 4：再次运行测试，确认它通过**

运行：`node -e "require('./shared/src/index')"`

预期：通过（无异常）

**步骤 5：提交**

```bash
git add client server shared
git commit -m "chore: initialize structure"
```

---

### 任务 2：`shared/` 仿真核心

**涉及文件：**
- 新建：`shared/src/rng.ts`
- 新建：`shared/src/map.ts`
- 新建：`shared/src/physics.ts`
- 新建：`shared/src/sim.ts`
- 新建：`shared/src/snapshot.ts`
- 修改：`shared/src/index.ts`

**步骤 1：先写一个会失败的最小测试**

```ts
import { initGameState, stepGame } from "../../shared/src/index";
const state = initGameState(42);
const next = stepGame(state, new Map(), 1 / 30);
if (!next) throw new Error("step missing");
```

**步骤 2：运行测试，确认它会失败**

运行：`node -e "require('./shared/src/index')"`

预期：失败（`stepGame not defined`）

**步骤 3：写最小实现让测试通过**

```ts
export function stepGame(state, inputs, dt) {
  return { ...state };
}
```

**步骤 4：再次运行测试，确认它通过**

运行：`node -e "require('./shared/src/index')"`

预期：通过

**步骤 5：提交**

```bash
git add shared
git commit -m "feat: add shared simulation core"
```

---

### 任务 3：客户端渲染与输入

**涉及文件：**
- 新建：`client/src/main.ts`

**步骤 1：先写一个会失败的最小测试**

```js
if (!window.render_game_to_text) throw new Error("missing render_game_to_text");
```

**步骤 2：运行测试，确认它会失败**

运行：`npm --prefix client run dev`，然后在浏览器控制台检查

预期：失败

**步骤 3：写最小实现让测试通过**

```ts
window.render_game_to_text = () => JSON.stringify({ mode: "menu" });
```

**步骤 4：再次验证，确认它通过**

预期：通过

**步骤 5：提交**

```bash
git add client
git commit -m "feat: render loop and input"
```

---

### 任务 4：Deno Deploy 服务端（HTTP + WS + KV）

**涉及文件：**
- 新建/修改：`server/main.ts`

**步骤 1：先写一个会失败的最小验证**

```sh
curl -s -X POST http://localhost:8000/api/match/join | jq .
```

**步骤 2：运行验证，确认它会失败**

预期：404

**步骤 3：写最小实现让验证通过**

```ts
if (pathname === "/api/match/join") return new Response("ok");
```

**步骤 4：再次运行验证，确认它通过**

预期：200

**步骤 5：提交**

```bash
git add server
git commit -m "feat: add basic Deno server"
```

---

### 任务 5：KV 领导者 + 快照广播

**涉及文件：**
- 修改：`server/main.ts`
- 修改：`shared/src/snapshot.ts`

**步骤 1：先写一个会失败的最小验证**

```ts
// Pseudo: ensure snapshot seq increments in KV
```

**步骤 2：运行验证，确认它会失败**

运行：`deno run -A server/main.ts`

预期：KV 中没有快照写入

**步骤 3：写最小实现让验证通过**

```ts
await kv.set(["match", matchId, "snapshot"], { seq: 1, serverTime: Date.now(), bytes });
```

**步骤 4：再次运行验证，确认它通过**

预期：KV 中存在快照 `key`

**步骤 5：提交**

```bash
git add server shared
git commit -m "feat: leader snapshot writes"
```

---

### 任务 6：Playwright 自动化回归（技能客户端）

**涉及文件：**
- 修改：`client/src/main.ts`
- 修改：`progress.md`

**步骤 1：运行技能客户端**

```bash
node "$WEB_GAME_CLIENT" --url http://localhost:5173 --screenshot-dir output/web-game-run --actions-file "$WEB_GAME_ACTIONS" --click-selector "#start-btn" --iterations 3 --pause-ms 250
```

**步骤 2：检查截图与文本状态**

预期：玩家能移动/射击，分数能更新。

**步骤 3：提交**

```bash
git add client progress.md
git commit -m "test: validate interactions via playwright"
```

---
