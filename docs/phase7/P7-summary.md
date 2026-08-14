# Phase 7 完成记录：中文章节识别升级

> 状态：完成（2026-08-13）
> 对应开发计划：Phase 7（P4 优先级）
> 前置：Phase 1（splitCore/TxtParser）、Phase 3（缓存 ruleHash 联动）
> 决策：ADR-012（自定义正则完全替换内置 matcher）

## 目标回顾

以多个可维护 matcher 替换继续扩张的单一巨型正则；覆盖中文小说常见标题形态；
修复 P0 已知缺陷（正文行误判为章节）；保留自定义规则与缓存联动。

## 交付清单

### P7-01 matcher pipeline — `src/core/matcher/chapterMatcher.ts`
- `chapterMatchers`：按类别分组的 5 个 matcher（可单独测试）：
  `cn-chapter`（第X章）/ `cn-volume`（卷部篇集）/ `cn-section`（节）/ `special`（序尾后记番外）/ `english`（Chapter N）
- `matchChapterTitle(line)`：主入口，整行锚定，返回标题或 null
- `splitByMatcher`（splitCore.ts）：逐行扫描分章，头部语义与 splitByRegex 一致、
  重复标题跳过沿用 `isRepeatChapter`、章节原始行保留保证 txtIndex 偏移正确

### P7-02 扩展规则与反例
- **17 种正例**：中文/大写/阿拉伯数字章节（含纯章名、无空格）、卷部篇集、节、
  序章/尾声/后记/番外/大结局、Chapter 1 / CHAPTER 12: The End
- **反例不识别**：对话引用、章词在行中、括号注释、`第二章的内容。`（P0 缺陷修复）、
  `第一节，我们先说结论。`、`第一卷的内容。`、英文行中、空行/纯空白
- 匹配原则：行首锚定 + 排除紧跟"的"的正文形态 + 排除句末标点（。！？）结尾的行

### P7-03 保留自定义规则（ADR-012：完全替换）
- `getChapterMatcher()`（split.ts）：用户显式设置且有效 → `userChapterLineMatcher`
  （exec 整行匹配，标题=匹配文本 trim，与 v1 一致）；无效 → 提示并回退内置；
  未设置 → 内置 matcher；每次调用重新读配置（P0-03-5）
- TxtParser 新增 `chapterMatcher` 注入（优先于 chapterRegex）；
  ParserFactory / Book 透传 `getChapterMatcher`

### P7-04 缓存版本联动
- `CHAPTER_MATCHER_VERSION = 1`：内置规则变化时递增 → ruleKey 变化 → ruleHash 变化 → 缓存自动失效
- `ruleKey`：内置 = `matcher:v<版本>`；用户 = `user:<source>`
- `TXT_PARSER_VERSION` **1 → 2**（v2：默认识别切换为 matcher pipeline；旧 v1 缓存被 cleanup 删除）
- 测试：规则变化 → 缓存 miss 重新索引；规则一致 → 命中不读全文

## 行为变化（用户可见）

- 默认章节识别从单正则升级为多类别 matcher：
  - **修复**：`第二章的内容。` 这类正文行不再误判为章节（P0 已知缺陷）
  - **新增识别**：楔子/序言/引子/尾声/后记/大结局/番外/外传、第X卷/部/篇/集/节、Chapter N
  - 无章节文件的"头部"语义不变；重复标题跳过不变
- 用户自定义 `novelLook.match.chapterName` 行为与 v1 一致（完全替换）
- 性能：30 MB 合成数据逐行 matcher 扫描 **107ms**（本机；9484 章命中，无灾难性回溯）

## 已知限制

- 以句末标点（。！？）结尾的标题行不识别（如"第一章 风起。"，罕见，文档明示）
- 英文标题无空格（"Chapter1"）不识别（要求 `Chapter N` 形态）

## 修改/新增文件

新增：`src/core/matcher/{types,chapterMatcher}.ts`、`src/test/unit/matcher/chapterMatcher.test.ts`、
`src/test/unit/parser/txtParserMatcher.test.ts`、`docs/adr/ADR-012-custom-regex-replaces-builtin.md`、
`docs/phase7/P7-summary.md`、本文件。
修改：`src/splitCore.ts`（splitByMatcher）、`src/core/parser/{TxtParser,ParserFactory,versions}.ts`、
`src/split.ts`（getChapterMatcher）、`src/treeView/Book.ts`、`src/test/suite/extension.test.ts`、
`DEVELOPMENT_PLAN.md`、`CHANGELOG.md`。

## Phase gate 状态

- [x] 17 种标题正例全部识别（测试逐一断言）。
- [x] 10 种正文/对话反例不识别（含 P0 缺陷修复验证）。
- [x] 30 MB 合成数据无灾难性回溯（107ms / 489137 行）。
- [x] 自定义规则完全替换 + 无效规则安全回退（单元 + 集成测试）。
- [x] matcher 版本与 ruleKey 联动缓存失效；TXT_PARSER_VERSION 递增。
- [x] 单测 180 → 225（matcher 33 + TxtParser matcher 12）；集成测试 +3。
