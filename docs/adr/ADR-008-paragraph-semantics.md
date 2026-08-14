# ADR-008：paragraph 定义、heading 是否占索引、正文变化后的 fallback

> 状态：接受（Phase 2 关闭）· 2026-08-13
> 关联：DEVELOPMENT_PLAN.md §9 / Phase 2（P2-03/P2-04）

## 背景

语义进度以"段落"为定位单元，需要明确段落定义、标题是否占索引，以及正文变化后的恢复策略。

## 决策

1. **paragraph 定义**：段落 = `ChapterBlock` 的一个实例。
   - TXT：非空行（与旧 `parseChapterTxt_WebView` 输出的行一一对应），`paragraphIndex` 从 0 开始。
   - EPUB（Phase 4）：以 XHTML 抽取的 `<p>`/`<div>`/`<br>` 文本块为段落；规则届时细化。
2. **heading 是否占索引**：TXT 章节标题**不**占段落索引（标题在 `ChapterContent.info.title`，
   段落从正文第一行开始编号）。EPUB 章节内标题（heading 块）是否占索引由 Phase 4 决定，
   原则是"用户滚动经过的元素才计入段落索引"。
3. **恢复锚点链（固定顺序）**：
   1. `chapterId + paragraphIndex`：chapterId 精确匹配当前章节 → 滚动到段落（`scrollToParagraph`，
      段落顶部定位，误差不超过一个段落）；
   2. `chapterProgress`：章节存在但段落失效 → 按本章百分比滚动；
   3. 章节开头。
   旧 pixel（`saveScroll`）仅当该书该章**无任何新进度**时作为首次恢复输入，恢复后立即转写新进度。
4. **正文变化后的 fallback**：
   - 段落数量减少：`paragraphIndex` 越界 → 取最后一个可见段落；更严重的错位交给
     `chapterProgress` → 开头。
   - 章节增删（`chapterId` 的 index 段漂移）：chapterId 不匹配但 `chapterIndex` 存在 →
     `chapterProgress`；否则开头。
   - 段落内容变化但数量相同：`paragraphIndex` 仍指向"位置"（可接受，文档化）。
5. **chapterProgress 计算**：`scrollTop / (scrollHeight - clientHeight)`，分母为 0（空章）→ 0。

## 后果

- 正面：布局（字号/zoom/行高/宽度）变化后定位误差不超过一个段落；恢复逻辑简单可测。
- 负面/风险：段落内容增删导致的位置错位无法完全避免（任何"按位置"方案皆然），
  已通过 fallback 链与文档化缓解。

## 验收

- [x] WebView 段落定位（`currentParagraphIndex` / `scrollToParagraph`）基于段落 identity（dataset.i）。
- [x] 恢复顺序：段落 → 本章进度 → pixel → 顶部（extension 侧 `computeRestore` 与 WebView 侧 `applyRestore`）。
- [x] 进度上报：滚动防抖 + 切章前 flush；shape 校验在 extension 侧（`isValidSaveProgress`）。
