# Phase 4 完成记录：EPUB 小说模式

> 状态：完成（2026-08-13）
> 对应开发计划：Phase 4（P2 优先级）
> 前置：Phase 1、2

## 目标回顾

支持 reflowable、无 DRM、以文字为主的 EPUB 2/3 子集，保持懒加载；TXT 与 EPUB 共用统一 Reader 消息模型。

## 交付清单

### P4-01 依赖与安全评审 — ADR-010
- **零新增依赖**：ZIP 读取用 `node:zlib` 原生解压，XML 自实现最小解析器（攻击面可控）
- 完整 EPUB 引擎 / jszip+fast-xml-parser 候选均被拒绝并记录理由

### P4-02 解析容器与包信息 — `src/core/epub/zip.ts` + `EpubParser.ts`
- 最小 ZIP 读取器：EOCD 定位、Central Directory、Local File Header、store/deflate、CRC32
- container.xml → rootfile → OPF：metadata（dc:title/creator/identifier）、manifest、spine
- EPUB2/3 fixtures：title/author/spine 正确；大小写扩展名（`.EPUB`）经 ParserFactory 识别

### P4-03 懒加载章节表 — `EpubParser.load/getChapterList`
- 书架只读 container/OPF/nav（EPUB3）或 NCX（EPUB2），**不解析任何章节 XHTML**
- 标题优先级：nav/NCX 列表（文档顺序=spine 顺序）→ 章节文件名 → `第N章`
- 集成测试断言：`getChapterList` 阶段 readFile 仅 1 次（整个 ZIP 字节，正文不解析）

### P4-04 提取小说正文 — `src/core/epub/extract.ts`
- h1–h6 → `heading` 块；`p` → `paragraph`；`div` 递归（仅文本时作段落）；`br` 行内换行；`li` 段落
- `script`/`style`/`head`/`nav` 跳过（不执行脚本、不套用出版社 CSS）；`img` 取 alt 文本
- blocks 顺序与文本正确（heading + paragraph 混合测试）；lines = 全部块文本（统一 Reader 渲染）

### P4-05 接入书架与 Reader
- ParserFactory `.epub/.EPUB` → `EpubParser`（不再抛 UnsupportedFormatError；既有 factory 测试更新）
- `ChapterContent.lines` 与 TXT 同构 → WebView 消息模型不变（TXT/EPUB 同一 Reader）
- Book 适配：`parserError` / 解析失败提示 / 错误隔离（损坏书不崩溃书架）
- 集成测试：临时 EPUB3 文件经 `vscode.Uri.file` 创建 Book，章节列表/标题/已读分组正确

### P4-06 防御恶意输入
- ZIP：路径穿越拒绝（`..`/绝对路径/反斜杠）、条目数 ≤10,000、单条目 ≤64 MB、文件 ≤200 MB、
  压缩比 ≤1000:1（bomb 检测）、CRC 校验、ZIP64 明确报错
- XML：简单 DOCTYPE（`<!DOCTYPE html>`）允许；内部子集/外部引用拒绝（XXE）；
  未知实体原样保留（容错 `&nbsp;`）；UTF-8/UTF-16 BOM 解码
- 内容错误隔离：损坏章节抛明确错误，其他章节不受影响；Book 层捕获提示

## 行为与兼容性

- 用户可见：书架新增 `.epub` 文件即显示，展开/阅读/切章/已读/自动滚屏与 TXT 完全一致
- 已知限制（ADR-010 / README）：不支持 ZIP64（大文件明确报错）；完整 XML 特性子集；
  图片不渲染（正文仅文字）；出版社 CSS 不套用

## 修改/新增文件

新增：`src/core/epub/{zip,xml,extract,EpubParser}.ts`、`src/test/helpers/{buildZip,epubFixtures}.ts`、
`src/test/unit/epub/{zip,xml,extract,epubParser}.test.ts`、`docs/adr/ADR-010-epub-deps-and-security.md`、
`docs/phase4/P4-summary.md`、本文件。
修改：`src/core/parser/ParserFactory.ts`、`src/treeView/Book.ts`、`src/test/unit/parser/factory.test.ts`、
`src/test/suite/extension.test.ts`、`DEVELOPMENT_PLAN.md`、`CHANGELOG.md`。

## 新增依赖

无（零新增）。

## Phase gate 状态

- [x] 2–3 章最小 EPUB 2/3 fixtures（EPUB2 NCX / EPUB3 nav）。
- [x] 缺失可选 metadata（无 title → 文件名；无 nav → 文件名标题）。
- [x] 损坏章节与大小写扩展名测试通过；错误隔离（好章节不受影响）。
- [x] 书架阶段通过 spy 证明未读取章节正文（readFile 仅 1 次，正文懒加载）。
- [x] 单测 110 → 156（Phase 4 新增 46 个：zip 11 + xml 9 + extract 9 + epubParser 13 + factory 更新）。
