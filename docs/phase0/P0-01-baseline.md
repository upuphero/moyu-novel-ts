# P0-01 可复现基线

> 状态：完成（2026-08-13）
> 对应开发计划：Phase 0 / P0-01「补齐可复现基线」

## 1. 开发环境版本矩阵（实测）

| 项目 | 值 | 说明 |
| --- | --- | --- |
| OS | Windows（Git Bash / PowerShell 7 兼容） | 见 ADR-004 |
| Node.js | 20.19.4 | `.nvmrc` 原为 `16.20.2`，属漂移项，见 §3 |
| npm | 11.7.0 | PowerShell 执行策略阻止 `npm.ps1`，统一使用 `npm.cmd` |
| nvm-windows | 1.2.2 | Node 版本管理器 |
| git | 2.45.1.windows.1 | |
| VS Code | 已安装（`code` CLI 可用） | 用于 P0-04 spike 与集成测试 |
| npm registry | `https://registry.npmjs.org/` | 官方源（历史镜像见 §3） |

## 2. 基线检查记录

| 检查项 | 命令 | 结果 |
| --- | --- | --- |
| 依赖安装 | `npm ci` / `npm install` | 见 §3：lockfile 与 package.json 不同步，先重新生成 lockfile |
| 编译（esbuild dev） | `npm run compile` | 记录于下方 |
| 类型检查 | `npm run test-compile`（tsc -p ./） | 记录于下方 |
| lint | `npm run lint` | 记录于下方 |
| 测试 | `npm test`（VS Code 集成） | 只有 sample test，P0-02 补齐 |
| 打包 | `npm run package` | 记录于下方 |

> 基线结果以执行当时的终端输出为准，见本仓库 CI 与后续提交记录。既有失败单独建账，不混入功能改造（§4）。

## 3. 已确认的基线漂移（进入 Phase 0 修复清单）

| # | 漂移 | 影响 | 处理 |
| --- | --- | --- | --- |
| 1 | `.nvmrc` 为 `16.20.2`，实际开发环境为 Node `20.19.4` | 工具链版本不一致 | 基线记录后更新 `.nvmrc` 为实测版本；TS / VS Code engine 升级仍按计划独立评审 |
| 2 | `package-lock.json` 根版本 `2.1.10`，`package.json` 为 `2.1.11` | `npm ci` 在不同步时会失败 | 重新生成 lockfile（P0-12） |
| 3 | lockfile 中 `resolved` 指向 `registry.nlark.com` 历史镜像 | 镜像可能失效导致安装失败 | 重新生成 lockfile 时统一使用官方 registry |
| 4 | `npm.ps1` 被 PowerShell 执行策略阻止 | 交互不便 | 文档记录使用 `npm.cmd`，不改用户系统策略 |

## 4. 既有失败账目

Phase 0 开工前确认存在的缺陷（详细修复见 P0-03）：

| 缺陷 | 影响 | 建账状态 |
| --- | --- | --- |
| `activate()` 未等待异步 `init()` | 命令可能在初始化完成前被调用 | P0-03-1 |
| dev mode 判断使用 `packageJSON.isUnderDevelopment`（不存在） | 静态资源刷新策略错误 | P0-03-2 |
| 静态目录复制不创建目标/子目录，写入错误被吞 | 全新 global storage 无法打开 Reader | P0-03-3 |
| 嵌套目录书未进入根 `bookMap` | TreeView 空白、最近章节无法恢复 | P0-03-4 |
| 文件筛选配置模块加载时缓存；非法 regex 无保护 | 修改设置不生效；坏规则令书架失败 | P0-03-5 |
| context menu 使用拼写错误的 `novelLookTreeViewk` | 章节菜单无法显示 | P0-03-6 |
| WebView 按章节标题去重 | 不同书/章节同名时拒绝渲染 | P0-03-7 |
| 自动滚屏 `lastRenderId` 未更新 | 每个滚动 tick 重算尺寸 | P0-03-8 |
| CSP 被注释；`updateReadSetting` 无 key 白名单；主题 `innerHTML` 注入 | WebView 安全边界弱 | P0-10 |

## 5. 重新生成 lockfile 的操作记录

```powershell
# 移除旧 lockfile（含镜像 URL 与版本漂移）
Remove-Item package-lock.json
# 从官方 registry 重新解析并生成
npm.cmd install --registry=https://registry.npmjs.org/
```

生成后验证：

- lockfile 根版本与 `package.json` 一致（`2.1.11`，后续随 P0-06 身份迁移同步更新）。
- `resolved` 全部为 `registry.npmjs.org`。
- `npm ci` 可重复执行。
