# Phase 9 完成记录：内部 namespace 收口与发布准备

> 状态：完成（2026-08-13）
> 对应开发计划：Phase 9（P4 优先级，最后一个 Phase）
> 前置：Phase 0-8（身份迁移 P0、统一 Parser、状态/进度、缓存、EPUB、搜索、进度条、WebView TS）
> 决策：ADR-003（迁移顺序与 alias 窗口，本 Phase 关闭）

## 目标回顾

新代码只使用新 ID，旧 ID 通过明确兼容层继续工作；发布文档与检查就绪。

## 交付清单

### P9-01 迁移并收口剩余 command/view/config ID
- **命令**：全部 `novel-look.*` → `moyu-novel.*`（`Command` 常量生成，含 searchBook）；
  注册处 `extension.ts` 统一 `COMMAND_PREFIX + 键`；内部调用改用 `Command.*` 常量
  （`Chapter.ts` 的 showChapter、`file.ts` 的 openWebView）
- **配置**：`config.get/set` 读写 `moyuNovel.*`；package.json configuration 新增
  `moyuNovel.*` 全套 17 项（默认值与旧一致），`novelLook.*` 保留并加 `deprecationMessage`
- **TreeView/容器**：`moyuNovelTreeView` / `moyu-novel`（contributes views/viewsContainers/
  viewsWelcome/menus when 全部同步；`TreeViewProvider` 用 `TREE_VIEW_ID` 常量）
- **activationEvents**：`onView:moyuNovelTreeView`、`onCommand:moyu-novel.openWebView`、
  `onCommand:moyu-novel.searchBook` + `onCommand:novel-look.openWebView`（旧 alias 可激活）
- **keybindings**：alt+s / alt+d 绑定新命令（用户自定义旧绑定经 alias 仍有效）

### P9-02 保留旧 command alias（集中 legacy adapter）
- `extension.ts`：同一 handler 注册两次（新 ID + `LEGACY_COMMAND_PREFIX + 键`）
- 旧命令**不 declared**（不进命令面板/菜单，避免重复项），但注册存在 →
  外部 `executeCommand('novel-look.*')` 与旧 keybinding 兼容窗口内有效
- `src/legacy/ids.ts` 是唯一映射点（LEGACY_* 常量 + 测试锁定）

### P9-03 完成设置/状态迁移
- **配置**：`src/configCore.ts` 纯函数 `resolveConfigValue`（新 key 显式值 → 旧 key 显式值 →
  默认值；undefined/null 视为未设置）；`config.get` 按新前缀读取 + 旧前缀只读 fallback
  （尊重 scope，不写回旧 key）；新设置一律写 `moyuNovel.*`
- **状态**：P2-05 已迁移（`moyuNovel.*` 新 key + migration v1 marker 幂等）；
  本次验证 `CURRENT_MIGRATION_SCHEMA_VERSION = 1` 与 key 全部为新前缀
- 单测：configCore 8 个（新优先/旧 fallback/默认/null/日志标记）；集成测试验证
  `getConfiguration("moyuNovel")` 读写与 fallback 语义

### P9-04 发布文档与检查
- README：新增"配置与命令命名空间"迁移说明 + 已知限制（文件移动、兼容窗口、扩展 ID、EPUB 子集）
- CHANGELOG 追加 Phase 9；本 summary + 发布 checklist + 兼容窗口文档
- LICENSE.txt 原样保留（上游 MIT + Copyright yangtengxiang）；fork attribution 在 README

### P9-05 定义兼容窗口
- `docs/phase9/P9-compat-window.md`：alias/旧 key 最短保留 2 个 minor 版本，
  删除条件 = 窗口到期 + 迁移数据充分 + 升级测试通过；ADR-003 同步关闭

## 修改/新增文件

新增：`src/configCore.ts`、`src/test/unit/configCore.test.ts`、
`docs/phase9/{P9-summary,P9-release-checklist,P9-compat-window}.md`、本文件。
修改：`src/legacy/ids.ts`（新/旧前缀常量 + Command 新 ID）、`src/extension.ts`（alias 注册）、
`src/config.ts`（双前缀读写）、`src/treeView/{TreeViewProvider,Chapter}.ts`、`src/file/file.ts`、
`src/split.ts`、`src/file/fileUtil.ts`（文案）、`package.json`（contributes 全套迁移）、
`src/test/unit/{stateKeys,manifest}.test.ts`、`src/test/suite/extension.test.ts`、
`README.md`、`CHANGELOG.md`、`DEVELOPMENT_PLAN.md`、`docs/adr/ADR-003-namespace-migration.md`（关闭）。

## 测试

- 单测 **244 → 254**（configCore 8 + stateKeys/manifest 重写断言新 ID + legacy 锁定）
- 集成测试更新：新命令注册断言 + 旧 alias 注册断言 + 新配置读写 + fallback 语义
- `npm run check`（lint + 双 tsc typecheck + 254 单测 + production bundle）通过

## Phase gate 状态

- [x] active metadata（repository/homepage/bugs）指向 `upuphero/moyu-novel-ts`，不再指向上游仓库。
- [x] 旧身份只存在于：Credits/README fork 说明、LICENSE.txt（上游 MIT 保留）、历史 CHANGELOG、
      迁移代码（legacyState/configCore）、legacy 测试与兼容文档（P9 文档/ADR-003/P0-07 inventory）。
- [x] 新安装与旧版迁移路径：新配置写 `moyuNovel.*`、旧配置只读 fallback；旧命令 alias 共存；
      状态迁移幂等（P2-05）；扩展 ID 迁移路径见 ADR-002/P0-04 spike（人工复制方案）。
