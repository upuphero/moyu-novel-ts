# ADR-011：全书搜索的 contract、缓存与取消策略

> 状态：接受（Phase 5 关闭）· 2026-08-13
> 关联：DEVELOPMENT_PLAN.md §9 / Phase 5（P5-01/03/05）

## 背景

需要提供 `Moyu Novel: Search in Book`（`moyu-novel.searchBook`），返回可跳转、可高亮的
章节级结果；TXT 与 EPUB 共用同一搜索实现；大书搜索不得阻塞无限增长。

## 决策

1. **搜索 contract（P5-01）**：`SearchQuery { bookId, keyword, caseSensitive?, wholeWord?, limit? }` →
   `SearchResult[]`，结果含 `chapterId / chapterIndex / chapterTitle / paragraphIndex / preview / matchStart / matchLength`。
   - `preview` 为关键词前后各 20 字符的上下文；`matchStart/matchLength` 供 WebView 高亮。
2. **实现（P5-02）**：`SearchEngine` 逐章线性扫描（`parser.getChapterList()` + 逐章 `getChapterContent().lines`）。
   - TXT 复用 P3 章节索引缓存与全文内存缓存；EPUB 首次搜索按 spine 解析并缓存各章 lines。
   - 大小写选项走 `toLowerCase` 比较；整词选项仅对 ASCII 词边界生效（中文按字面匹配）；
     正则元字符按字面匹配（不把用户输入当正则）。
3. **EPUB 索引复用（P5-03）**：`bookId:format` 级缓存；**同一有效索引第二次搜索不重新解析任何 XHTML**
   （`getChapterContent` 不再被调用，readFile 计数不变）。
4. **缓存失效（P5-05）**：每次搜索前重新 `getChapterList()`，与缓存快照比对
   （数量 / 章节 id / 标题任一变化 → 整体重建），覆盖"文件或抽取规则变化后失效"。
   - 注意：TXT 的 parser 内存缓存（10 分钟 TTL）意味着同一实例在 TTL 内文件变化不可见——
     与 P3 设计一致（正文懒加载路径才 re-stat）；搜索缓存失效比对针对的是 parser 返回的章节列表。
5. **取消与上限（P5-05）**：`SearchCancel.cancelled()` 在每章/每行之间检查，取消返回已收集结果（不抛错）；
   结果上限默认 200（可配置 1..500），达到立即返回。
6. **UI（P5-04）**：QuickPick 选书 → `showInputBox`（**Enter 或明确提交才触发扫描**，不逐键扫描大文件）→
   `withProgress`（cancellable）→ 结果 QuickPick → `openSearchResult` 打开章节并携带
   `HighlightAnchor { keyword, paragraphIndex }`。
7. **高亮安全（P5-04/P0-10）**：WebView 端用 `textContent` 重建段落节点（span + mark），
   关键词不作为 HTML 解析（XSS 防护）；高亮优先于恢复锚点（P2-04 fallback）。

## 后果

- 正面：TXT/EPUB 共用一套搜索；第二次搜索 EPUB 零解析成本；取消/上限防大书失控；
  高亮走安全文本路径。
- 负面/风险：
  - 整词匹配不支持中文词边界（ASCII 仅 `\b`）——文档明示；
  - 搜索结果上限 200（QuickPick 容量），未命中后续章节——提示"最多显示 200"；
  - TXT TTL 内文件变化的可见性受 parser 缓存约束（与 P3 一致）。

## 验收

- [x] TXT：关键词/无结果/多结果/取消/特殊字符/preview/大小写/整词/上限。
- [x] EPUB：第二次搜索 readFile 计数不变（不重新解析 XHTML）；损坏章节跳过（错误隔离）。
- [x] 缓存失效：章节列表变化（新 parser 实例）→ 自动重建；clearCache 后重新扫描。
- [x] 命令注册（manifest 断言 + 集成测试）；openSearchResult 打开章节携带高亮锚点。
