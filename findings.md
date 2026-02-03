# 调研结论与关键决策

## 需求确认

- 8 人自由混战（`FFA`）俯视像素射击（`WASD` 移动 + 鼠标瞄准/射击）
- 浏览器客户端 + Deno Deploy 服务端
- 服务端权威裁决，客户端快照插值（可选轻量移动预测）
- Deno KV 可恢复：领导者租约、输入汇聚、快照写入/订阅转发
- 快照载荷必须稳定 < 64KiB
- 客户端渲染：PixiJS

## 约束要点（直接影响架构）

- Deno Deploy：多实例无服务器运行，实例可能被停止/驱逐；不能依赖进程内内存长期存活。
- Deno KV：
  - 单条 `value` 上限 64KiB，`key` 有长度上限（实现侧必须做体积预算）
  - `kv.watch` 单次最多监听 10 个 `key`
  - `kv.watch` 的通知会带来额外读取成本，因此必须控制监听规模与写入频率

## 技术决策（已落地）

| 决策 | 原因 |
|------|------|
| KV 用于领导者租约/输入/快照 | 满足“可恢复”与跨实例协调 |
| 输入量化（`moveDir` 0..8，`aimDir` 0..15） | 减少输入写入放大 |
| 快照使用固定大小二进制编码 | 体积可控、解码快、便于 KV 限制约束 |
| 服务端固定频率推进仿真 | 同步节奏稳定，利于插值渲染 |
| 客户端侧插值渲染 | 抵消网络抖动，降低“拉扯感” |

## 工程问题与处理

| 问题 | 处理 |
|------|------|
| TypeScript 无法解析 `@shared/*` | 在 `client/tsconfig.json` 增加 `paths` |
| TS 报 `.ts` 扩展名导入限制 | 开启 `allowImportingTsExtensions` |
| Vite 开发服务器联机同源问题 | 在 `client/vite.config.ts` 增加 `/api` 与 `/ws` 反向代理 |
| 本地 Deno 2.x 需要显式启用 KV | 在 `deno.json` 增加 `"unstable": ["kv"]`，确保 `deno run/test` 默认可用 |
| `kv.watch` 无法使用 `AbortSignal` 停止（类型层面） | 改为保存迭代器，并在需要停止时调用 `iterator.return()` |
| 无头截图易出现透明/全黑 | 客户端渲染改为显式 `app.render()`，并开启 `preserveDrawingBuffer`；回归时建议 Playwright 使用 `--screenshot-dir` 指向未跟踪目录 |
| Deno Deploy 需要可声明的构建配置 | 在 `deno.json` 增加 `deploy.install` / `deploy.build` / `deploy.runtime.entrypoint` |

## 关键实现入口

- `server/main.ts`
- `client/src/main.ts`
- `shared/src/*`

## 本次环境检查补充

- `rg` 未安装（后续搜索改用 `find`/`grep`）。
- 已执行 `session-catchup.py`，未输出异常。
- Git 根目录：`/Users/zhangjinhui/Desktop/codexapp-demo`
- 当前目录下未发现 `.worktrees/` 或 `worktrees/`（需按流程选择 worktree 位置）。
- 未发现 `CLAUDE.md`（无 worktree 目录偏好配置）。
- 已安装 Deno（用于本地 `deno test`/`deno check` 验证）。

## 2026-02-03 Local Online
- Added explicit online policy function to control local online/offline behavior.
- Installed Deno locally at `~/.deno/bin/deno` to enable local server and tests.
