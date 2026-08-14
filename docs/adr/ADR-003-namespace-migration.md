# ADR-003：command/config/view 的迁移顺序与 alias 保留窗口

> 状态：接受（Phase 0 关闭）· 2026-08-13
> 关联：DEVELOPMENT_PLAN.md §3.5 / Phase 9

## 背景

旧 namespace：命令 `novel-look.*`、配置 `novelLook.*`、TreeView `novelLookTreeView`、
Activity 容器 `novel-look`。长期目标：`moyu-novel.*` / `moyuNovel.*` / `moyuNovelTreeView`。

一次性全局替换会破坏用户配置、keybinding、when 条件和已保存状态，风险不可控。

## 决策

1. **迁移顺序固定为：用户可见身份（Phase 0 已完成）→ 内部调用（Phase 9）→ 收口删除 legacy。**
   - Phase 0：只改 `package.json` 的 name/displayName/仓库/欢迎文案；**命令、配置、
     TreeView ID 保持旧值**，作为兼容基线。
   - Phase 9：先注册新 ID（含新 command alias 指向同一实现），再迁移内部调用，
     最后在兼容窗口结束后移除 legacy。
2. **兼容窗口：** 新旧 command alias 至少共存 2 个 minor 版本；`novelLook.*` 配置 key
   保留读取支持（新 key 显式值 → 旧 key 显式值 → 新默认值），删除条件为"窗口到期 +
   迁移数据充分 + 升级测试通过"。
3. **集中管理：** 所有旧 ID 字符串只出现在 `src/legacy/ids.ts` 与 `docs/phase0/P0-07-legacy-inventory.md`
   （+ 相应测试），禁止在业务代码中散落硬编码；Phase 9 只改 ids.ts 一处映射。
4. **配置写入 scope：** 保持现状（`config.set` 写 Global scope），scope 感知迁移
   （Global / Workspace / Workspace Folder）在 Phase 2 状态服务中处理，不提前动。

## 后果

- 正面：旧用户配置与 keybinding 在迁移窗口内继续工作；变更可逐步验证。
- 负面/风险：legacy 兼容代码需要维护一段时间；窗口定义需随发布节奏修订。

## 验收

- [x] `src/legacy/ids.ts` 集中所有旧 ID 常量；单测锁定形状（P0-07）。
- [x] Phase 0 未改动任何命令/配置/view ID（manifest 单测覆盖）。
- [x] **Phase 9 完成（2026-08-13）**：命令全部迁移 `moyu-novel.*`（旧 ID alias 注册同一 handler，
      兼容窗口内有效）；配置读写 `moyuNovel.*` + 旧 key 只读 fallback（`configCore.resolveConfigValue`）；
      TreeView/容器迁移 `moyuNovelTreeView` / `moyu-novel`；`novelLook.*` 配置项保留并标注 deprecated。
- [x] 兼容窗口与删除条件文档化（`docs/phase9/P9-compat-window.md`，P9-05）。
- [x] 发布 checklist 就绪（`docs/phase9/P9-release-checklist.md`，P9-04）。
