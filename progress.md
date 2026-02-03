# 进度记录

原始需求：想将计划落地在目录下，然后使用 `develop-web-game` 这个技能参考开发计划进行全面开发

## 会话：2026-02-03

### 阶段 1：需求与调研（完成）
- 目标：8 人自由混战、仅 Deno Deploy、KV 可恢复
- 输出：完成规划文件初始化（`task_plan.md`、`findings.md`、`progress.md`）

### 阶段 2：结构搭建（完成）
- 完成 `client/`、`shared/`、`server/` 三段式结构
- 明确仿真步进、快照与 `kv.watch` 的边界与约束

### 阶段 3：实现（完成）
- `shared/`：固定步长仿真 + 二进制快照编解码
- `server/`：HTTP `/api/match/join` + WebSocket `/ws` + KV 领导者租约 + KV 快照订阅转发
- `client/`：PixiJS 渲染 + 输入上报 + 在线/离线模式 + 快照插值

### 阶段 4：验证（进行中）
- ✅ 补齐 Deno Deploy 构建配置（`deno.json` 的 `deploy.*`）
- ✅ 修复 `kv.watch` 停止方式（改用迭代器，并通过 `iterator.return()` 取消）
- ✅ 本地安装 Deno 并完成基础验证
- ✅ 启动 `server/main.ts` 后对 `POST /api/match/join` 做冒烟测试（返回 200）
- ✅ 更新本地开发文档：`deno.json` 的 `"unstable": ["kv"]`、Vite 反向代理、Playwright `--screenshot-dir`
- ✅ 增加联机冒烟脚本与单测（`scripts/online_smoke.ts`、`tests/online_smoke_lib_test.ts`）
- ⚠️ Playwright 无头截图异常：本轮未复跑技能客户端，仅提供规避手段（显式 `app.render()`，以及建议使用 `--screenshot-dir`）
- ✅ 运行 `session-catchup.py` 与 Git 根目录确认
- ✅ 重新加载 superpowers 技能清单与必要技能
- ✅ 检查 worktree 目录：未发现 `.worktrees/` 或 `worktrees/`
- ✅ 未发现 `CLAUDE.md`，无 worktree 目录偏好

## 测试/命令记录
| 命令 | 结果 |
|------|------|
| `~/.deno/bin/deno test -A` | 通过 |
| `~/.deno/bin/deno check server/main.ts` | 通过 |
| `~/.deno/bin/deno check server/src/*.ts` | 通过 |
| `pnpm -C client exec tsc -p tsconfig.json` | 通过 |
| `pnpm -C client build` | 通过 |
| `python3（启动服务端 + POST /api/match/join）` | 通过 |
| `python3 ~/.codex/skills/planning-with-files/scripts/session-catchup.py "$(pwd)"` | 通过 |
| `git status --porcelain=v1` | 通过 |

## 问题记录
| 时间 | 问题 | 处理 |
|------|------|------|
| 2026-02-03 | TS 无法解析 `@shared/*` | 补齐 `client/tsconfig.json` 的 `paths` |
| 2026-02-03 | TS 不允许 `.ts` 扩展名导入 | 开启 `allowImportingTsExtensions` |
| 2026-02-03 | Vite 开发服务器联机同源问题 | 增加 `/api` 与 `/ws` 反向代理 |
| 2026-02-03 | `kv.watch` AbortSignal 类型不匹配 | 改为迭代器 + `return()` 取消 `watch` |
| 2026-02-03 | 本地 Deno 2.x `Deno.openKv` 需要显式启用 | 在 `deno.json` 增加 `"unstable": ["kv"]`，让 `deno run/test` 默认可用 |

### Phase 3: Implementation (local online focus)
- **Status:** in_progress
- Actions taken:
  - Added online policy module and tests to control online/force-offline behavior.
  - Removed temporary Playwright verification script and pngjs dependency after validation.
- Files created/modified:
  - client/src/online-policy.ts
  - tests/online_policy_test.ts
  - client/src/main.ts
  - package.json / pnpm-lock.yaml
