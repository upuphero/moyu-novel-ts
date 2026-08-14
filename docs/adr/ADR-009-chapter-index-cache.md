# ADR-009：TXT 章节索引缓存的 schema、校验与生命周期

> 状态：接受（Phase 3 关闭）· 2026-08-13
> 关联：DEVELOPMENT_PLAN.md §9 / Phase 3（P3-01/02/03/05）

## 背景

展开书籍与常规 UI 刷新每次都会重新 split 整本 TXT。需要持久化章节索引，使缓存命中时
0 次全文读取、0 次 split，同时保证文件/规则变化后结果正确。

## 决策

1. **缓存位置与隔离**：`<globalStorage>/cache/index/idx-<bookId净化>.v<parserVersion>.json`。
   - bookId 含 `:`（Windows 文件名非法），统一净化（`:` → `_`，保留 `[a-zA-Z0-9_-]`）。
   - 按 bookId 隔离；**不修改小说文件或小说所在目录**（小说在书库目录，缓存在 global storage）。
2. **schema（v1）**：`{ schemaVersion, parserVersion, ruleHash, filePath, sizeBytes, mtimeMs, chapters[] }`。
   - `chapters` 与 `splitCore.ChapterInfo` 字段一致（s/i/txtIndex/size），可直接注入 TxtParser。
   - JSON 损坏（半截/脏数据）→ `validateIndexJson` 返回 null → 安全重建，不崩溃。
3. **原子写入**：写 `*.tmp` 后 `rename` 到目标；写入中断不留下半截主文件；
   即使留下半截，下次读取也走"损坏 → 重建"路径。
4. **校验条件（任一变化 → 重建）**：`sizeBytes`、`mtimeMs`、`ruleHash`
   （用户正则 source 的 sha256 前 16 hex）、`parserVersion`、`filePath`。
   - `parserVersion`（TXT_PARSER_VERSION=1）编入**文件名**，版本升级靠文件名直接失效，无需读内容。
5. **接入语义**：
   - `load()`：stat 成功且有缓存命中 → 用缓存章节索引，**不读全文、不 split**；
     miss/失效 → 读全文 + split + 写缓存。
   - **stat 失败（文件不可 stat 等）→ 降级无缓存路径**（读全文 + split，不写缓存），与旧行为一致。
   - 正文懒加载：缓存命中时 `load()` 不持有全文，`getChapterContent()` 首次需要正文才读全文；
     读正文前 re-stat，文件在索引后变化 → 自动重新索引（保证章节结果正确）。
   - 无缓存注入（`cache` 缺省）→ 完全旧路径，行为不变。
6. **生命周期（P3-05）**：
   - 启动时 `cleanup()` 一次：
     - 非 `idx-` 开头的文件**跳过**（不删未知文件）；
     - 版本不匹配（含 `.tmp` 残留、旧版本）删除；
     - 孤儿（缓存的 `filePath` 指向的书文件不存在）删除；
     - 总大小超上限（默认 50 MB）按 mtime 升序 LRU 清理最旧。
   - **不每次启动清空全部**；写缓存失败静默（`console.warn`），不影响阅读主流程。
7. **可观测性（P3-04）**：`TxtParser` 的 `split`/`stat` 可注入（测试计数），
   验收按"split 调用次数"而非墙钟时间。

## 后果

- 正面：第二次展开/收起/切章/重开 Reader/刷新 0 次全文 split；文件与规则变化自动重建；
  损坏与写入中断安全恢复；容量/孤儿/版本清理可控。
- 负面/风险：
  - 缓存文件跟随 global storage，卸载扩展后清空（可接受）。
  - mtime 精度问题（FAT 文件系统秒级）——size 与 ruleHash 兜底，mtime 差异小时可能
    多重建一次（代价是重新 split，正确性无损）。
  - Phase 7 升级章节识别时必须递增 `TXT_PARSER_VERSION`。

## 验收

- [x] 单测：schema 校验矩阵、原子写（无 tmp 残留）、校验条件五项、损坏重建、
      stat 降级、版本/孤儿/容量清理（真实临时目录）。
- [x] 集成：合成 fixture（1/10/30 MB，固定 seed）下命中 0 split；mtime/size/规则变化重建；
      文件在索引后变化重新索引（章节数、新章节正文正确）。
