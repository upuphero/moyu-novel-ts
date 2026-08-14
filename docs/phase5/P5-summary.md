# Phase 5 完成记录：全书搜索

> 状态：完成（2026-08-13）
> 对应开发计划：Phase 5（P3 优先级）
> 前置：Phase 3（TXT 索引缓存）、Phase 4（EPUB 懒加载）

## 目标回顾

提供 `Moyu Novel: Search in Book`，返回可跳转、可高亮的章节级结果；
TXT/EPUB 共用实现；大书搜索不阻塞无限增长。

## 交付清单

### P5-01 搜索 contract — `src/core/search/types.ts`
- `SearchQuery { bookId, keyword, caseSensitive?, wholeWord?, limit? }`、`SearchResult`
  （chapterId/chapterIndex/chapterTitle/paragraphIndex/preview/matchStart/matchLength）、
  `SearchCancel`、`BookSearch`
- `preview` = 关键词前后各 20 字符上下文；`matchStart/matchLength` 供高亮

### P5-02 TXT 搜索 — `src/core/search/searchEngine.ts`
- 逐章线性扫描（复用 P3 索引缓存 + 全文内存缓存）
- 大小写/整词选项；正则元字符按字面匹配；preview 正确
- 测试：关键词/无结果/多结果/特殊字符/大小写/整词/归属章节正确

### P5-03 EPUB 搜索索引
- `bookId:format` 级章节正文缓存：首次按 spine 解析，**第二次搜索 readFile 计数不变**
  （测试断言）；不同关键词复用同一索引
- 损坏章节跳过（P4-06 错误隔离延续），好章正常命中

### P5-04 命令与 Reader UI
- `moyu-novel.searchBook`（activation event + commands + view/title 菜单）
- 流程：QuickPick 选书 → showInputBox（**Enter/明确提交才扫描**）→ withProgress（cancellable）
  → 结果 QuickPick（显示章节标题 + 段落号 + preview）→ 打开章节并高亮
- `openSearchResult`：book.getChapterList → chapter.openThis(HighlightAnchor)
- WebView 高亮：`applyHighlight` 用 **textContent 安全重建**段落节点（span+mark，
  P0-10 安全路径，不解析用户输入为 HTML）；高亮优先于恢复锚点；`.search-highlight` 样式
- 集成测试：命令注册、搜索服务初始化、fixture 搜索冒烟、openSearchResult 不抛错

### P5-05 缓存与边界策略 — ADR-011
- 失效：每搜前 `getChapterList()` 与快照比对（数量/id/标题任一变化 → 重建）；
  覆盖"文件或抽取规则变化后失效"（测试：新 parser 实例 2→3 章自动重建）
- 取消：每章/每行间检查 `cancelled()`，取消返回已收集结果（测试）
- 上限：默认 200（1..500 可配），达到立即返回（测试）
- 错误提示：无结果/书库为空/服务未初始化均有明确提示

## 行为与兼容性

- 用户可见：书架标题栏新增"全书搜索"按钮 + 命令面板 `Moyu Novel: 全书搜索`
- TXT/EPUB 搜索结果点击后打开对应章节、定位段落、高亮关键词
- 已知限制（ADR-011）：整词匹配仅 ASCII 词边界；结果上限 200（QuickPick 容量）；
  TXT 文件变化在 parser TTL 内的可见性受 P3 缓存约束

## 修改/新增文件

新增：`src/core/search/{types,searchEngine}.ts`、`src/searchCommand.ts`、
`src/test/unit/search/searchEngine.test.ts`、`docs/adr/ADR-011-search-contract-and-cache.md`、
`docs/phase5/P5-summary.md`、本文件。
修改：`src/treeView/TreeViewProvider.ts`（getBookMap）、`src/treeView/Chapter.ts`（openThis 高亮）、
`src/webView.ts`（HighlightAnchor 透传）、`src/index.ts`（initSearchService + 命令合并）、
`static/js/webView.js`（applyHighlight）、`static/style.css`（.search-highlight）、
`package.json`（命令/activation/菜单）、`src/test/unit/manifest.test.ts`、
`src/test/suite/extension.test.ts`、`DEVELOPMENT_PLAN.md`、`CHANGELOG.md`。

## 新增依赖

无。

## Phase gate 状态

- [x] TXT/EPUB 关键词、无结果、多结果、取消、特殊字符、preview、段落跳转测试通过。
- [x] EPUB 第二次搜索不重新解析 XHTML（readFile 计数断言）。
- [x] 单测 156 → 170（新增 14 个：搜索 13 + manifest 1）；集成测试 +3。
