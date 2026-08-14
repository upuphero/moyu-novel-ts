# ADR-001：Marketplace Publisher ID、版本与发布策略

> 状态：接受（Phase 0 关闭）· 2026-08-13
> 关联：DEVELOPMENT_PLAN.md §6 Phase 0 / P0-05

## 背景

仓库从上游 `ytx222/novel-look-ts` fork 而来，当前 `package.json` 的 `publisher` 仍为上游作者
的 `ytx222`。VS Code 扩展 ID 由 `publisher.name` 决定，冒用他人 publisher 既不合法也不可维护，
但新 publisher 又意味着新的扩展身份（见 ADR-002）。

## 决策

1. **不再使用 `ytx222` 作为 publisher。** 当前维护者的 Marketplace Publisher ID 尚未确认，
   Phase 0 先使用明确占位的 `moyu-novel`，并在本文档登记。
2. **占位 publisher 的边界：**
   - 允许：`vsce package` 本地打包、Extension Development Host 调试、CI 构建验证。
   - 禁止：向 Marketplace 发布（`vsce publish`）。发布前必须：
     a. 确认实际拥有的 Publisher ID；
     b. 若与 `moyu-novel` 不同，按 ADR-002 的迁移路径再走一次身份变更验证；
     c. 更新本文档并关闭本 ADR 的"待办"标记。
3. **版本策略：** 保持 semver；`2.1.11` 继续作为 Phase 0 基线版本，身份迁移完成后
   由维护者决定 bump。工具链（Node/TypeScript/VS Code engine）升级单独评审，不夹带。
4. **许可证：** 保留上游 MIT License 与 `Copyright (c) 2020 yangtengxiang` 声明（LICENSE.txt 不删改）。

## 后果

- 正面：不再冒用上游身份；身份变更的影响被显式管理。
- 负面/风险：`moyu-novel.moyu-novel-ts` 是一个新扩展 ID，旧 `ytx222.novel-look-ts` 的
  globalState / globalStorage（书库目录）默认不可达 → 见 ADR-002 迁移方案。

## 验收

- [x] `package.json.publisher` 不再是 `ytx222`（manifest 单测覆盖）。
- [x] 发布动作被文档阻止；publish 前必须经过确认流程。
