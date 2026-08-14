# ADR-006：头部/preface 的 chapterId、显示与计数语义；无章节/空书行为

> 状态：接受（Phase 1 关闭）· 2026-08-13
> 关联：DEVELOPMENT_PLAN.md §9 / Phase 1（P1-01）

## 背景

旧 TXT 实现把"第一个章节匹配之前的文本"固定为 `头部`（`txtIndex: -2, s: '头部', i: 0`），
在 TreeView 中作为一章显示、可打开。统一模型（`ChapterInfo`）需要明确 head/preface 语义，
并对"无章节文件""空文件"给出确定行为。

## 决策

1. **头部（preface）定义：** 第一个章节匹配之前的全部文本为 preface 章节。
   - `ChapterInfo.isPreface = true`，`index = 0`。
   - `ChapterInfo.title = '头部'`（TXT；EPUB 无头部概念，Phase 4 另行处理）。
   - 头部**计入** `BookMetadata.chapterCount`（与旧行为一致，避免"总数"口径漂移；
     进度条 Phase 6 的公式会显式按 ADR 处理头部）。
2. **无章节文件：** 全书视为单个 preface 章节（`chapterCount = 1`），Reader 可正常打开显示全文。
3. **空文件（0 字节）：** 同样只有一个 preface 章节，`ChapterContent.lines = []`，Reader 显示空正文，
   不除零、不崩溃。
4. **chapterId：** Phase 1 使用 `format:index`（如 `txt:0`）作为章节 ID，仅要求 parser 内唯一；
   Phase 2 升级为 `bookId + chapterId` 全局稳定算法（含头部固定 ID 与文件移动策略，ADR-007）。
5. **兼容性（characterization）：** 头部正文提取沿用旧 substring 公式
   （`txtIndex=-2, size 含 +2` 占位），包括无章节文件时正文长度少 2 字符的旧行为——Phase 1 不改，
   测试锁定；后续作为已知缺陷单独修复。

## 后果

- 正面：Reader/TreeView 对"头部"行为与旧版完全一致；计数口径明确，EPUB 无需头部特殊处理。
- 负面/风险：头部计入章节总数后，进度百分比语义需在 Phase 6 明确（已记录）。

## 验收

- [x] 单测覆盖：有章节文件的头部、无章节文件、空文件。
- [x] 与旧实现（split + substring）逐项等价对比测试通过。
