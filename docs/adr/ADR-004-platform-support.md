# ADR-004：平台与 virtual workspace 支持边界

> 状态：接受（Phase 0 关闭）· 2026-08-13
> 关联：DEVELOPMENT_PLAN.md §6 Phase 0 / P0-09

## 背景

- `openExplorer` / `openWebViewDir` 旧实现直接执行 `explorer.exe`（仅 Windows 可用）。
- `capabilities.virtualWorkspaces` 为 `true`，但扩展的所有数据都在用户目录
  `globalStorageUri` 下，不依赖 workspace 文件；`untrustedWorkspaces.supported` 为 `false`。

## 决策

1. **平台支持矩阵（Phase 0 起生效）：**

   | 平台 | 支持 | 说明 |
   | --- | --- | --- |
   | Windows 10/11 | ✅ 支持 | 主要开发/测试平台 |
   | macOS | ✅ 支持 | "打开目录"使用 `vscode.env.openExternal`，跨平台 API |
   | Linux | ✅ 支持 | 同上；文件系统 API 为跨平台封装 |
   | Remote / Container | ⚠️ 视环境 | 依赖 `vscode.workspace.fs` 与本地 user-data 目录；未列入首版验证 |
   | Virtual Workspace | ✅ 支持 | 扩展不读取 workspace 文件，书库在 globalStorage，无虚拟工作区冲突 |
   | Untrusted Workspace | ❌ 不支持 | 保持 `supported: false`（信任边界内不运行） |

2. **打开目录统一改用 `vscode.env.openExternal(vscode.Uri.file(path))`**，移除
   `child_process.exec('explorer.exe ...')`（P0-09/P0-11）。
3. **README 明示平台矩阵**，删除"适配 Mac 基本完成"这类模糊承诺（P0-06 一并更新）。
4. 平台特定代码若未来出现，必须按 OS 分支封装并在测试矩阵登记（P0-09 测试矩阵见
   P0-02 smoke checklist）。

## 后果

- 正面：跨平台行为一致；不再有仅 Windows 可用的命令。
- 负面/风险：`openExternal` 在无默认文件管理器的极简 Linux 环境可能无操作，README 已提示。

## 验收

- [x] `src/file/file.ts` 不再依赖 `explorer.exe`。
- [x] README 平台支持矩阵已更新。
