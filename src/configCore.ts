/**
 * 配置读取回退纯函数（Phase 9，P9-03）。
 * 无 VS Code 依赖，可脱离 Extension Host 单测。
 *
 * 语义（ADR-002/003 scope-aware fallback）：
 * 新 key 显式值 → 旧 key 显式值 → 默认值。
 * 只读回退（不写回旧 key），尊重用户已设置的旧值；新设置一律写新 key。
 */

/**
 * 解析配置值：新 key 显式值优先，其次旧 key 显式值，最后默认值。
 * undefined 与 null 均视为"未设置"（防御脏配置）。
 * @param newValue 新 namespace（moyuNovel.*）下读到的值；undefined/null = 未设置
 * @param legacyValue 旧 namespace（novelLook.*）下读到的值；undefined/null = 未设置
 * @param defaultValue 新默认值
 */
export function resolveConfigValue<T>(
	newValue: T | undefined | null,
	legacyValue: T | undefined | null,
	defaultValue: T
): T {
	if (newValue !== undefined && newValue !== null) return newValue;
	if (legacyValue !== undefined && legacyValue !== null) return legacyValue;
	return defaultValue;
}

/**
 * 迁移日志：返回是否命中了旧 key（用于可观测性日志，不落状态）。
 */
export function isLegacyFallback<T>(
	newValue: T | undefined | null,
	legacyValue: T | undefined | null
): boolean {
	return (newValue === undefined || newValue === null) &&
		legacyValue !== undefined && legacyValue !== null;
}
