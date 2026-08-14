# Phase 3 完成记录：TXT 章节索引缓存

> 状态：完成（2026-08-13）
> 对应开发计划：Phase 3（P1 优先级）
> 前置：Phase 1、2（共用 bookId）

## 目标回顾

有效缓存命中时，展开书籍和常规 UI 刷新不再扫描整本 TXT；
性能按"split 调用次数"验收（非墙钟时间）；文件与用户章节规则变化后结果正确。

## 交付清单

### P3-01 缓存 schema — `src/core/cache/chapterIndexCache.ts`
- `TxtChapterIndex`（v1）：`schemaVersion/parserVersion/ruleHash/filePath/sizeBytes/mtimeMs/chapters[]`
- `validateIndexJson`：缺字段/类型错误/损坏 → null（安全重建）
- 原子写入：temp + rename（`write()`）；损坏或写入中断都能安全重建
- 文件名 `idx-<bookId净化>.v<parserVersion>.json`（bookId 冒号净化，Windows 安全）

### P3-02 缓存校验
- 条件：sizeBytes / mtimeMs / ruleHash（正则 source sha256 前16hex）/ parserVersion / filePath
- 任一变化 → 重建；`TXT_PARSER_VERSION=1`（`src/core/parser/versions.ts`）编入文件名
- `matchesValidation` + 五项单测

### P3-03 接入 TxtParser
- `load()`：stat + 缓存命中 → 用缓存索引（**0 读全文、0 split**）；miss → 读+split+写
- **stat 失败降级无缓存**（旧路径兼容）；正文懒加载（命中时 `getChapterContent` 首次才读全文）
- 读正文前 re-stat：文件在索引后变化 → 自动重新索引
- `ParserFactoryOptions.cache` 透传；`Book` 注入 `getChapterIndexCache()` 单例
- `index.ts`：activate 时 `initChapterIndexCache(globalStorage/cache/index)` + 启动 cleanup 一次
- 不修改小说文件或小说所在目录

### P3-04 可观测性与性能测试
- `src/test/helpers/syntheticTxt.ts`：mulberry32 固定 seed 生成器，**增量字节计数**（O(n)），
  1/10/30 MB 均可生成（30 MB 实测 162ms）；章节标题覆盖中文/阿拉伯数字变体，
  "第X节/回"作正文噪声
- `txtParserCache.test.ts`：第二次展开/收起/切章/重开 Reader/刷新 **0 split**（注入 split 计数）；
  mtime/size/规则变化重建；损坏重建；正文懒加载 1 次读；文件变化后重新索引
- `chapterIndexCache.test.ts`：13 个模块级测试（真实临时目录验证 node 实现）

### P3-05 缓存生命周期
- `cleanup(parserVersion)`：非 `idx-` 文件跳过（不删未知）；版本不匹配（含 tmp/旧版本）删除；
  孤儿（书文件不存在）删除；超容量（默认 50 MB）按 mtime LRU 清理最旧
- 不每次启动清空全部；写缓存失败静默（不影响阅读主流程）

## 行为与兼容性

- 无缓存注入时 TxtParser 走完全旧路径（Phase 1 测试原样通过）
- 用户可见行为不变：展开/阅读/切章/已读/自动滚屏零回归
- 已知限制（ADR-009）：缓存随 global storage 清理；mtime 秒级精度文件可能多重建一次（正确性无损）；
  Phase 7 必须递增 parser version

## 修改/新增文件

新增：`src/core/cache/chapterIndexCache.ts`、`src/core/parser/versions.ts`、
`src/test/helpers/syntheticTxt.ts`、`src/test/unit/cache/chapterIndexCache.test.ts`、
`src/test/unit/parser/txtParserCache.test.ts`、`docs/adr/ADR-009-chapter-index-cache.md`、
`docs/phase3/P3-summary.md`、本文件。
修改：`src/core/parser/TxtParser.ts`、`src/core/parser/ParserFactory.ts`、
`src/treeView/Book.ts`、`src/index.ts`、`DEVELOPMENT_PLAN.md`、`CHANGELOG.md`。

## 新增依赖

无。

## Phase gate 状态

- [x] 性能通过行为计数（split 调用计数）而非墙钟时间：命中场景 0 次 split。
- [x] 文件变化（mtime/size）与用户章节规则变化后章节结果正确（重建测试）。
- [x] 单测 86 → 110（Phase 3 新增 24 个）。
