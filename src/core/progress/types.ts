/**
 * 语义阅读进度（Phase 2，P2-03）。
 * 新进度以 chapterId + paragraphIndex 为主锚点，不依赖 pixel。
 */
export interface ReadingProgress {
	/** 进度 schema 版本（变化时迁移/失效，见 ADR-007/008） */
	schemaVersion: 1;
	/** 书 ID（bookId，见 id.ts） */
	bookId: string;
	/** 章 ID（chapterId = bookId#index） */
	chapterId: string;
	/** 章节序号（冗余，便于显示与校验） */
	chapterIndex: number;
	/** 段落下标（ChapterBlock.index，从 0 开始；见 ADR-008） */
	paragraphIndex: number;
	/** 段内进度 0..1（可选：用于段内精确定位，Phase 2 起作为冗余字段） */
	paragraphProgress?: number;
	/** 本章进度 0..1（fallback 锚点：布局/内容变化导致段落失效时使用） */
	chapterProgress: number;
	/** 更新时间（epoch ms） */
	updatedAt: number;
}

export const PROGRESS_SCHEMA_VERSION = 1;
