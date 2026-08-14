# ADR-010：EPUB 依赖与安全评审（零新增依赖 + 自实现最小 ZIP/XML）

> 状态：接受（Phase 4 关闭）· 2026-08-13
> 关联：DEVELOPMENT_PLAN.md §9 / Phase 4（P4-01/P4-06）

## 背景

EPUB 是 ZIP 容器 + XML（container.xml / OPF / XHTML / NCX）。需要决定依赖策略，
并满足"只引入必要能力；不引入完整 EPUB 引擎"与防御恶意输入（ZIP bomb、路径穿越、XXE）。

## 候选评审

| 方案 | 能力 | 许可证/体积 | 结论 |
| --- | --- | --- | --- |
| 完整 EPUB 引擎（epubjs 等） | 全功能 | 大；浏览器导向；许可证混合 | 拒绝：超出"文字小说子集"需求 |
| jszip + fast-xml-parser | ZIP/XML 成熟 | MIT；jszip ~100KB min | 备选：可行但体积与攻击面较大 |
| **自实现最小 ZIP + 最小 XML（node:zlib 原生解压）** | 恰好所需 | 零新增依赖；攻击面完全可控 | **采纳** |

## 决策

1. **零新增依赖**：ZIP 读取（`src/core/epub/zip.ts`）用 `node:zlib.inflateRawSync` 解压 deflate，
   store 条目直接读取；XML 解析（`src/core/epub/xml.ts`）自实现最小子集。无许可证与 bundle 体积问题。
2. **ZIP 安全边界（P4-06）**：
   - 路径规范化：拒绝空名、绝对路径、`..`、反斜杠（统一转 `/` 后校验）；
   - 条目数上限 10,000；单条目解压上限 64 MB；EPUB 文件总大小上限 200 MB；
   - 压缩比上限 1000:1（ZIP bomb 早期检测）；CRC32 校验（store 与 deflate 条目）；
   - ZIP64 明确报错（EPUB 常规文件不涉及）。
3. **XML 安全边界（P4-06）**：
   - **DOCTYPE 策略**：允许无内部子集、无外部标识符的简单 DOCTYPE（`<!DOCTYPE html>`，EPUB XHTML 标配）；
     含 `[`（内部子集）或 `SYSTEM`/`PUBLIC`（外部引用）一律拒绝——XXE 防护；
   - 实体：仅预定义 5 个 + 数字实体；未知实体原样保留（容错 `&nbsp;` 等真实书稿常见实体）；
   - 不执行脚本（`script` 内容跳过）、不套用出版社 CSS（`style` 内容跳过）；图片不渲染（`img` 取 alt 文本）。
4. **内容错误隔离**：`ZipError` / `XmlParseError` 为明确错误类型；单个损坏章节只影响该章节
   （其他章节可正常读取）；Book.getChapterList 捕获解析错误并提示，书架不崩溃。
5. **UTF-16 支持**：ZIP 内 XML 按 BOM 检测 UTF-8 / UTF-16 LE / UTF-16 BE（EPUB 规范要求 UTF-8/UTF-16）。

## 后果

- 正面：攻击面完全可控（无 DTD/外部实体/脚本/CSS）；零依赖零体积；行为可单测。
- 负面/风险：
  - 最小 XML 解析器不支持完整 XML 特性（命名空间仅保留前缀、无 XPath）——EPUB 子集足够；
  - ZIP64 不支持（大文件 >4GB 的 EPUB 罕见，报错明确）；
  - 自实现代码需测试保护（zip/xml/extract 单测 53 个）。

## 验收

- [x] ZIP：store/deflate 解压、路径穿越拒绝、ZIP64 拒绝、大小/压缩比限制、CRC 校验、损坏检测。
- [x] XML：简单 DOCTYPE 允许；内部子集/外部引用拒绝（XXE）；实体容错；错误隔离。
- [x] EPUB：损坏章节不影响其他章节；Book 解析失败不崩溃书架。
- [x] bundle 体积：零新增依赖（`npm ls` 无变化）。
