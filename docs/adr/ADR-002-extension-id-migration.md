# ADR-002：扩展 ID 改名后旧 globalState / globalStorageUri 的可达性与书库迁移

> 状态：接受（Phase 0 关闭）· 2026-08-13
> 关联：DEVELOPMENT_PLAN.md §3.5 发布阻断风险 / P0-04 spike 报告

## 背景

扩展 ID = `publisher.name`。Phase 0 将 `name` 改为 `moyu-novel-ts`、`publisher` 改为占位
`moyu-novel`，形成新扩展身份 `moyu-novel.moyu-novel-ts`；旧身份为 `ytx222.novel-look-ts`。

VS Code 的关键事实（本仓库 P0-04 spike 实测确认，见
[P0-04-extension-id-spike.md](../phase0/P0-04-extension-id-spike.md)）：

- `globalStorageUri` = `<user-data>/User/globalStorage/<publisher>.<name>/`
- `globalState`（state.vscdb）按 `<extensionId>:<key>` 命名空间存储
- 扩展自己把**书库文件放在自己的 globalStorage 目录**（`readBookDirTerr(globalStorageUri)`）

因此：**新 ID 的扩展无法自动读取旧 ID 的书库目录与状态。**

## 决策

1. **不承诺"改名后自动无损迁移"**。`migrateLegacyState()` 只能处理同 ID 下的 key 迁移，
   无法跨越 `publisher.name` 形成的存储边界。
2. **迁移路径（三选一，发布时随文档交付）：**
   - **方案 A（推荐，简单可靠）：保留旧扩展 ID。** 若后续确认当前维护者可直接获得
     `novel-look-ts` 的续接（上游转交 / 使用旧 ID 继续发布），则不需要跨 ID 迁移。
   - **方案 B：人工复制书库目录。** 从旧
     `<user-data>/User/globalStorage/ytx222.novel-look-ts/` 复制小说文件到新
     `<user-data>/User/globalStorage/moyu-novel.moyu-novel-ts/`（仅复制用户放入的小说，
     不复制 `static` 缓存目录）；已读/进度状态（state.vscdb 中 `book_*`、
     `lastOpenChapter` 等）需用户手动重建或在迁移工具中按 key 映射导入。
   - **方案 C：旧版导出、新版导入。** 在旧版增加"导出书库/状态"命令，新版增加"导入"命令
     （Phase 2 状态 schema 落地后实现）；本 Phase 只交付方案说明与演练步骤。
3. **Phase 0 不实现代码级迁移**，但必须：
   - 在 README 发布说明中明确新旧 ID 与迁移步骤；
   - P0-04 spike 报告记录两份 VSIX 实测的存储路径差异；
   - 若最终发布采用新 ID，方案 B/C 必须经过真实升级演练后才能正式发布。

## 后果

- 正面：身份变更的风险被明确化、可验证；用户不会被"自动迁移"承诺误导。
- 负面/风险：老用户（如有）需要一次人工迁移；状态（已读、进度）迁移依赖 Phase 2 的
  schema 化状态服务。

## 验收

- [x] P0-04 spike 实测新旧 ID 的 globalStorage 路径不同（报告见 docs/phase0/）。
- [x] 发布前检查清单包含"旧书库迁移步骤"项。
