# P9-05 兼容窗口定义（alias / legacy key 最短保留版本与删除条件）

> 状态：生效（Phase 9 起）· 2026-08-13
> 关联：ADR-003（namespace 迁移）、DEVELOPMENT_PLAN.md §6 Phase 9

## 1. 窗口内容

| 项目 | 旧值 | 窗口行为 | 最短保留 |
| --- | --- | --- | --- |
| 命令 alias | `novel-look.*` → `moyu-novel.*` | 注册同一 handler；不 declared（不进命令面板） | **2 个 minor 版本** |
| 配置 key | `novelLook.*` → `moyuNovel.*` | 只读 fallback（新 key 显式值 → 旧 key 显式值 → 默认值）；不写回 | **2 个 minor 版本** |
| 状态 key | `book_*` / `lastOpenChapter` / `isShowReadChapter` / `saveScroll` | 迁移（P2-05）后保留旧值不删除 | **2 个 minor 版本** |
| TreeView ID | `novelLookTreeView` → `moyuNovelTreeView` | 无 alias 机制，直接迁移（旧 view 不再贡献） | 不适用 |

## 2. 删除条件（全部满足才可移除 legacy 支持）

1. **窗口到期**：自本版本（2.1.11 之后首个包含 P9 的版本）起已发布 **≥2 个 minor 版本**。
2. **迁移数据充分**：遥测/用户反馈显示 `novelLook.*` 与 `novel-look.*` 调用量趋近于零
   （无外部依赖旧 ID 的常见场景：旧 keybinding、脚本 executeCommand）。
3. **升级测试通过**：移除 legacy 后的版本在新安装与旧版升级路径上全部通过
   （含 P9-release-checklist 第 2/3 节）。

## 3. 移除动作（窗口到期后，单独一个 minor 版本执行）

- `src/legacy/ids.ts`：删除 `LEGACY_*` 常量与 `Command` 中的旧前缀推导；`COMMAND_PREFIX`
  保持 `moyu-novel.`。
- `src/extension.ts`：删除旧 alias 注册。
- `src/config.ts` / `src/configCore.ts`：删除旧前缀 fallback 读取（保留 `resolveConfigValue`
  或改为单参数）。
- `package.json`：删除 `novelLook.*` 配置项与 `onCommand:novel-look.openWebView` activation event。
- `migration/legacyState.ts`：删除旧 key 迁移分支（保留 marker 防重复）。
- 测试：同步移除 legacy 断言（stateKeys / manifest / extension.test.ts 的旧 alias 部分）。
- 文档：ADR-003 记录实际删除版本。

## 4. 说明

- 扩展 ID（`ytx222.novel-look-ts` → `moyu-novel.moyu-novel-ts`）**不在**本窗口内
  （跨 ID 存储边界，见 ADR-002），另行按发布策略处理。
- 窗口内的 `novelLook.*` 设置项在 VS Code 设置面板中带 `deprecationMessage` 提示。
