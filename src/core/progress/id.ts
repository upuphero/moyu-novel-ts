/**
 * Book ID / Chapter ID 生成器（Phase 2，P2-01；决策见 ADR-007）。
 *
 * - bookId：基于规范化文件路径的哈希，算法版本化（前缀 `book:1:`）。
 * - chapterId：`<bookId>#<index>`（index 为 parser 内章节序号，0 为头部）。
 *
 * 约束：
 * - 同名不同路径不共享状态（路径进入哈希）。
 * - 文件移动/重命名后 bookId 变化 → 进度不自动关联（ADR-007）。
 * - 本模块纯 Node（仅用 crypto），可脱离 VS Code 单测。
 */
import { createHash } from 'crypto';

/** bookId 算法版本（变化时必须递增，旧 ID 走迁移/失效策略，见 ADR-007） */
export const BOOK_ID_VERSION = 1;

/** 哈希截断长度（16 hex = 64 bit，碰撞概率可忽略） */
const HASH_LENGTH = 16;

/** 规范化路径：统一分隔符；不做大小写折叠（跨平台一致性，见 ADR-007） */
export function normalizePath(filePath: string): string {
	return filePath.replace(/\\/g, '/');
}

/**
 * 生成 bookId。
 * 同一文件路径（规范化后）稳定生成同一 ID；不同路径不碰撞。
 */
export function generateBookId(filePath: string): string {
	const normalized = normalizePath(filePath);
	const hash = createHash('sha256').update(normalized).digest('hex').slice(0, HASH_LENGTH);
	return `book:${BOOK_ID_VERSION}:${hash}`;
}

/**
 * 生成 chapterId（parser 内章节序号）。
 * @param bookId 书的稳定 ID
 * @param chapterIndex ChapterInfo.index（0 为头部）
 */
export function generateChapterId(bookId: string, chapterIndex: number): string {
	return `${bookId}#${chapterIndex}`;
}
