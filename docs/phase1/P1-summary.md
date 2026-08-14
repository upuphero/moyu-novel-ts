# Phase 1 完成记录：统一 Parser 与 TXT 适配

> 状态：完成（2026-08-13）
> 对应开发计划：Phase 1（P0 优先级）
> 前置：Phase 0（已完成）

## 目标回顾

切开文件格式、书架模型与 Reader，为 EPUB 留出稳定接口，同时保持 TXT 输出不变。

## 交付清单

### P1-01 统一模型 — `src/core/book/model.ts`（新增）
- `BookMetadata`（title/format/filePath/sizeBytes/chapterCount，author/language 为 EPUB 预留可选）
- `ChapterInfo`（id/index/title/isPreface）
- `ChapterBlock`（index/text/kind：paragraph|heading，heading 供 Phase 4 EPUB）
- `ChapterContent`（info + blocks + lines）
- 无 `any`；模型不含 TXT 专属字段（txtIndex/size/encoding 只存在于 TxtParser 内部）。
- 头部/空书语义见 ADR-006。

### P1-02 Parser 生命周期 — `src/core/parser/BookParser.ts` + `ParserFactory.ts`（新增）
- `BookParser` 接口：`load()`（幂等/懒加载）、`getChapterList()`、`getChapterContent()`、`dispose()`。
- `ParserFactory.create(filePath, {readFile, chapterRegex})`：`.txt/.TXT` 大小写安全；
  `.epub` 与未知格式抛 `UnsupportedFormatError`（明确错误，书架不崩溃）。
- 生命周期/错误语义见 ADR-005。

### P1-03 TxtParser — `src/core/parser/TxtParser.ts`（新增）
- 读取（注入 `readFile`）→ 编码识别（复用 `src/file/encoding`）→ 分章（复用 splitCore）→ 按章取内容。
- 纯 Node 可测（不 import vscode）；章节正则由调用方注入（配置读取留在 extension 侧）。
- 全文缓存 10 分钟（与旧行为一致），dispose 释放。

### P1-04 适配 Book/Chapter/TreeView
- `Book`：持有 `parser`（ParserFactory 创建），不再有 `txt/getContent/clearTxt/timer`，
  不再管理 `split/substring`；`getChapterList()` 消费 `ChapterInfo[]`。
- `Chapter`：持有 `ChapterInfo`，`openThis()` 经 `book.parser.getChapterContent(info)` 取
  `content.lines` 交给 Reader；删除 `txtIndex/size/getTxt/parseChapterTxt_WebView`。
- `src/file/vscodeAdapter.ts`：`vscodeFileReader`（VS Code 依赖只在此适配层）。
- TreeView 已读/未读分组、lastOpenChapter 恢复、切章逻辑未变。

### P1-05 锁定 TXT 回归
- `src/test/unit/parser/txtParser.test.ts`：load/章节列表/metadata、GBK/BOM、
  无章节/空文件、**与旧实现逐项等价对比**（5 个 fixture × 章节）、头部正文、章节越界错误、
  懒加载/dispose 重载/自定义正则。
- `src/test/unit/parser/factory.test.ts`：扩展名大小写、epub/未知格式/无 readFile 明确错误。
- 集成测试（`src/test/suite/extension.test.ts`）：vscodeFileReader 读 fixture、
  Book adapter 分组、不支持格式不崩溃。
- 合计单测 **52 passing**（Phase 0 30 + Phase 1 22）。

## 行为等价性说明

- 分章（默认正则、重复章名去重、正文误判等）与旧实现完全一致——splitCore 的
  characterization 测试（Phase 0）继续锁定，Phase 1 新增"章节正文与旧 substring 逻辑等价"对比。
- Reader 消息（showChapter title/list/book）与 WebView 渲染路径未变；自动滚屏、切章、已读状态不受影响。
- 已知旧缺陷（默认正则对"第X章+后缀"正文行误判、不同章号同标题主干被吞、无章节文件正文少 2 字符）
  保持原样并已在测试中显式锁定，留待 Phase 7 / 后续修复。

## 修改/新增文件

新增：`src/core/book/model.ts`、`src/core/parser/{BookParser,TxtParser,ParserFactory}.ts`、
`src/file/vscodeAdapter.ts`、`src/test/unit/parser/*.test.ts`、`docs/adr/ADR-005/006`、本文件。
修改：`src/treeView/Book.ts`、`src/treeView/Chapter.ts`、`src/test/suite/extension.test.ts`、
`package.json`（unit 脚本加 --exit）、`DEVELOPMENT_PLAN.md`、`CHANGELOG.md`。

## 新增依赖

无。

## Phase gate 状态

- [x] TXT 数据经过新接口进入现有 Reader（showChapter 消息流不变）。
- [x] 用户可见的 TXT 阅读、切章、已读状态、自动滚屏行为不变（等价性测试锁定）。
- [x] ADR-005/006 关闭。
