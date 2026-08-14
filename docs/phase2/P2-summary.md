# Phase 2 完成记录：Book ID、状态与语义阅读进度

> 状态：完成（2026-08-13）
> 对应开发计划：Phase 2（P1 优先级）
> 前置：Phase 1（已完成）

## 目标回顾

从"书名 + 章节下标 + pixel"迁移到带版本的稳定状态；布局变化后定位误差不超过一个段落；
旧状态（saveScroll / lastOpenChapter / book_* / isShowReadChapter）兼容迁移；含本地路径的状态不再跨设备同步。

## 交付清单

### P2-01 bookId / chapterId — `src/core/progress/id.ts`（新增）
- bookId = `book:1:<sha256(规范化路径) 前16hex>`，算法版本化（ADR-007）。
- 同名不同路径状态隔离；ID 无路径明文，可安全作状态 key。
- chapterId = `<bookId>#<index>`（0 为头部）。
- 单测：稳定性 / 不同路径 / 分隔符归一 / 版本前缀 / 明文隐藏。

### P2-02 带 schema 的状态服务 — `src/core/progress/state.ts`（新增）
- `StateStore` 抽象（`mementoStore` / `memoryStore`），typed 读写 + delete。
- 新 key 集中定义：`moyuNovel.progress.<bookId>`、`moyuNovel.readList.<bookId>`、
  `moyuNovel.lastOpened`、`moyuNovel.ui.showReadChapter`、`moyuNovel.state.migration.v1`。
- `readStateWithFallback`：新 key 显式值 → 旧 key 显式值 → 默认值（只读不回写，尊重 scope）。
- `readProgress` / `readReadList` shape 校验（脏数据/非法值安全拒绝）。
- 单测：key 命名空间、fallback 优先级与只读、进度/已读列表校验矩阵。

### P2-03 ReadingProgress — `src/core/progress/types.ts` + `ProgressService.ts`（新增）
- `ReadingProgress`：`chapterId`、`paragraphIndex`、`paragraphProgress?`、`chapterProgress`、`updatedAt`、`schemaVersion`。
- `ProgressService` 单例：save/get/clear + 已读列表读写与按需迁移。
- 新进度**不依赖 pixel 作为主锚点**。
- 单测：保存/读取/清除、跨书隔离、updatedAt 自动填充、已读迁移幂等。

### P2-04 定位与恢复
- WebView 段落 identity 已存在（render 时 `dataset.i`）；新增 `dom.js`：
  `currentParagraphIndex()`（二分，hidden 段落视为 Infinity）、`chapterProgress()`、
  `scrollToParagraph()`（段落顶部定位）。
- extension `computeRestore`：chapterId+paragraphIndex → chapterProgress → 旧 pixel（仅首次）→ 开头；
  `showChapter` 消息携带 `restore` + `bookId/chapterId/chapterIndex`。
- WebView `applyRestore` 应用锚点并 rAF 上报一次（旧 pixel 转写新进度）；
  滚动防抖（50ms）上报 `saveProgress`；切章前 flush（vscodeApi.js chapterToggle）。
- extension `fn.saveProgress` 全字段 shape 校验（P0-10 延续）。

### P2-05 旧状态迁移 — `src/migration/legacyState.ts`（新增）
- `migrateLegacyState`（幂等）：isShowReadChapter → 新 key；lastOpenChapter → lastOpened（含 bookId）；
  写迁移 marker；部分失败不阻塞。
- `migrateReadListIfNeeded`（按需、幂等）：book_<label> → readList.<bookId>（非法项过滤）。
- 旧 pixel 只用于首次恢复并转写新进度（Reader 流程）；旧值暂不破坏性删除（兼容窗口，ADR-003）。
- Book 移除 `setSync` → **含本地路径的状态不再跨设备同步**。
- 单测：首次 / 重复幂等（不覆盖新值）/ 部分失败 / 全新安装零残留 / 已读迁移幂等与隔离。

## 行为与兼容性

- 阅读、切章、自动滚屏、已读分组等用户可见行为不变；恢复体验增强（段落级定位）。
- 恢复优先级固定：chapterId+paragraphIndex → chapterProgress → 章节开头（ADR-008）。
- 配置读取仍为只读 fallback，不自动写回（尊重 Global/Workspace/Workspace Folder scope）。
- 已知限制（README 明示）：文件移动/重命名后 bookId 变化 → 进度不自动关联（ADR-007）。

## 修改/新增文件

新增：`src/core/progress/{id,types,state,ProgressService}.ts`、`src/migration/legacyState.ts`、
`src/test/unit/progress/*.test.ts`、`src/test/unit/migration/legacyState.test.ts`、
`docs/adr/ADR-007/008`、`docs/phase2/P2-summary.md`、本文件。
修改：`src/treeView/Book.ts`、`src/treeView/Chapter.ts`、`src/webView.ts`、`src/index.ts`、
`static/js/{dom,webView,vscodeApi}.js`、`src/test/suite/extension.test.ts`、
`DEVELOPMENT_PLAN.md`、`CHANGELOG.md`。

## 新增依赖

无。

## Phase gate 状态

- [x] 迁移路径可恢复：旧安装数据（lastOpenChapter/isShowReadChapter/book_*）迁移后可用；
      首次迁移/重复/部分失败测试通过；saveScroll pixel 首次恢复转写新进度。
- [x] 布局变化后定位误差不超过一个段落（段落 identity 定位 + fallback 链）。
- [x] 含本地路径的状态不再跨设备同步（移除 setSync）。
- [x] 单测 86 个全部通过（Phase 1 52 + Phase 2 34）。
