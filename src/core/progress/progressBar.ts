/**
 * 阅读进度计算（Phase 6，P6-01）。
 *
 * 纯函数：不依赖 DOM/VS Code，可单测。
 *
 * 语义（ADR-006 / P1-01）：
 * - 头部（index 0）计入章节总数（totalChapters 含头部）；
 * - 空书（totalChapters <= 0）不除零，全书百分比返回 0；
 * - 本章百分比与全书百分比均钳制在 0..1。
 *
 * 基础公式：`bookPercent = (chapterIndex + chapterProgress) / totalChapters`
 */

export interface ProgressSnapshot {
	/** 本章百分比 0..1 */
	chapterPercent: number;
	/** 全书百分比 0..1 */
	bookPercent: number;
}

/** 钳制到 0..1（NaN/Infinity → 0） */
export function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

/**
 * 计算阅读进度（P6-01）。
 * @param chapterIndex 当前章下标（0 = 头部，计入总数）
 * @param chapterProgress 本章内进度 0..1（来自 WebView chapterProgress()）
 * @param totalChapters 总章数（含头部）；<=0 视为空书，不除零
 */
export function computeProgress(
	chapterIndex: number,
	chapterProgressValue: number,
	totalChapters: number
): ProgressSnapshot {
	const cp = clamp01(chapterProgressValue);
	if (
		!Number.isInteger(chapterIndex) ||
		chapterIndex < 0 ||
		!Number.isInteger(totalChapters) ||
		totalChapters <= 0
	) {
		// 空书/非法输入：不除零，全书百分比为 0（本章百分比仍可展示）
		return { chapterPercent: cp, bookPercent: 0 };
	}
	const idx = Math.min(chapterIndex, totalChapters - 1);
	const bookPercent = clamp01((idx + cp) / totalChapters);
	return { chapterPercent: cp, bookPercent };
}
