/**
 * 章节行匹配器类型（Phase 7，P7-03）。
 * 供 TxtParser 注入：extension 侧提供内置 matcher pipeline 或用户自定义正则包装。
 */
export interface ChapterLineMatcher {
	/**
	 * 匹配章节标题行。
	 * @returns 标题文本（trim 后）；不匹配返回 null
	 */
	match(line: string): string | null;
	/**
	 * 规则标识（P7-04 缓存 ruleHash 依据）：
	 * 内置 = `matcher:v<CHAPTER_MATCHER_VERSION>`；用户 = `user:<正则 source>`。
	 * 规则变化 → hash 变化 → 章节索引缓存自动失效。
	 */
	ruleKey: string;
}
