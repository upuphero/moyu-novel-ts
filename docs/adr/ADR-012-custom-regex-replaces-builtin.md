# ADR-012：自定义章节正则 vs 内置 matcher —— 完全替换，不 fallback

> 状态：接受（Phase 7 关闭）· 2026-08-13
> 关联：DEVELOPMENT_PLAN.md §9 / Phase 7（P7-03）

## 背景

Phase 7 将默认章节识别从"单一巨型正则"升级为多类别 matcher pipeline（P7-01/02）。
用户配置 `novelLook.match.chapterName` 的自定义规则与内置 matcher 的关系需要明确：
**完全替换**（只用用户规则）还是**内置优先匹配、失败后 fallback 用户规则**。

## 候选方案

| 方案 | 行为 | 问题 |
| --- | --- | --- |
| 完全替换 | 用户设置 → 只用用户规则；未设置 → 内置 matcher | 语义清晰；与 v1 行为一致（用户正则本就替换默认正则） |
| 内置优先 + fallback | 先试内置，未命中再试用户 | 用户无法"排除"某些内置类别（如不想识别楔子/英文）；混合结果难以解释与调试 |

## 决策

**用户显式设置 `novelLook.match.chapterName` 且正则有效 → 完全替换内置 matcher（不 fallback）**。

1. 未设置 → 内置 matcher pipeline（`matchChapterTitle`，P7-02 多类别）。
2. 已设置且有效 → `userChapterLineMatcher`：`compiled.exec(line)` 整行匹配，
   标题 = 匹配文本 trim（与 v1 `split()` 行为一致）；`ruleKey = user:<source>`。
3. 已设置但无效（编译失败 / 空模式 `(?:)`）→ 提示"章节匹配正则非法,已回退内置规则"并回退内置 matcher。
4. 每次调用重新读取配置（P0-03-5），修改设置即时生效。

## 后果

- 正面：语义可预测（用户显式配置最大权威）；与 v1 用户正则行为兼容；无效规则安全回退不崩溃。
- 负面/风险：用户设置后无法使用内置类别扩展（如"第X节"）——文档明示"用户规则完全替换内置"。

## 验收

- [x] 未设置 → 内置 matcher 识别 17 种正例（P7 gate）。
- [x] 用户正则（`^第\d+章.*$`）→ 只识别阿拉伯数字章节，"楔子"不被识别（完全替换）。
- [x] 无效正则（`([非法`）→ 回退内置且正例仍识别（集成测试）。
- [x] `ruleKey`：内置 = `matcher:v<版本>`；用户 = `user:<source>` → 缓存自动失效（P7-04 测试）。
