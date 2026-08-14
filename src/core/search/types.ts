/**
 * 全书搜索 contract（Phase 5，P5-01）。
 * 纯核心层类型：不依赖 VS Code，供 engine 与 UI 层共同消费。
 */

/** 搜索请求 */
export interface SearchQuery {
	/** 稳定书 ID（P2-01） */
	bookId: string;
	/** 关键词（用户输入原样；空字符串返回空结果） */
	keyword: string;
	/** 大小写敏感（默认 false） */
	caseSensitive?: boolean;
	/** 整词匹配（默认 false；对 ASCII 词边界有效） */
	wholeWord?: boolean;
	/** 结果上限（默认 200；达到即停止扫描，避免大书无限增长） */
	limit?: number;
}

/** 搜索结果（可跳转、可高亮） */
export interface SearchResult {
	bookId: string;
	/** 章节 ID（P2-01：bookId#index） */
	chapterId: string;
	/** 章节下标（0 为头部） */
	chapterIndex: number;
	/** 章节标题 */
	chapterTitle: string;
	/** 段落下标（= ChapterBlock.index，P2-04 定位锚点） */
	paragraphIndex: number;
	/** 命中段落的 preview（关键词前后各取上下文，P5-01） */
	preview: string;
	/** 关键词在 preview 中的起始偏移（高亮用） */
	matchStart: number;
	/** 关键词长度 */
	matchLength: number;
}

/** 取消句柄（P5-05）：搜索在每章之间检查 cancelled() */
export interface SearchCancel {
	cancelled(): boolean;
}

/** 搜索提供者契约（P5-01） */
export interface BookSearch {
	search(query: SearchQuery, cancel?: SearchCancel): Promise<SearchResult[]>;
}
