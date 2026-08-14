import { get } from "./config";
import { DEFAULT_CHAPTER_REGEX } from "./legacy/ids";
import { ChapterInfo, compileChapterRegex, splitByRegex } from "./splitCore";
import {
	builtinChapterLineMatcher,
	userChapterLineMatcher,
} from "./core/matcher/chapterMatcher";
import { ChapterLineMatcher } from "./core/matcher/types";

/** 兼容旧导出名（characterization 基线保持形状不变） */
export type splitChapterInfo = ChapterInfo;

/**
 * 安全获取用户章节正则：
 * - 每次调用都重新读取配置（P0-03-5：避免模块加载时缓存导致修改设置不生效）。
 * - 非法 regex 提示并回退内置默认，不让书架/分章崩溃。
 */
export function getChapterRegex(): RegExp {
	const pattern = get<string>("match.chapterName", DEFAULT_CHAPTER_REGEX);
	const compiled = compileChapterRegex(pattern);
	if (compiled) {
		return compiled;
	}
	console.error("moyuNovel.match.chapterName 非法,已回退默认正则");
	vscodeShowErrorMessage("章节匹配正则非法,已回退默认正则");
	return new RegExp(DEFAULT_CHAPTER_REGEX, "gm");
}

// 延迟引用 vscode，避免本模块在纯 Node 单测中加载 vscode 模块失败
function vscodeShowErrorMessage(message: string) {
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const vscode = require("vscode");
		vscode.window?.showErrorMessage(message);
	} catch {
		// 非 Extension Host 环境（单测）下静默
	}
}


/**
 * 获取用户章节匹配器（Phase 7，P7-03 / ADR-012）：
 * - 用户显式设置 `moyuNovel.match.chapterName` 且有效 → **完全替换**内置 matcher（不 fallback）；
 * - 无效 regex → 提示并安全回退内置 matcher；
 * - 未设置 → 内置 matcher pipeline（多类别，P7-02）。
 * 每次调用重新读取配置（P0-03-5）。
 */
export function getChapterMatcher(): ChapterLineMatcher {
	const pattern = get<string>("match.chapterName", "");
	if (pattern && pattern.trim()) {
		const compiled = compileChapterRegex(pattern);
		if (compiled) {
			return userChapterLineMatcher(compiled, pattern);
		}
		console.error("moyuNovel.match.chapterName 非法,已回退内置 matcher");
		vscodeShowErrorMessage("章节匹配正则非法,已回退内置规则");
	}
	return builtinChapterLineMatcher;
}

/**
 * 分章（保持旧签名：从配置读取正则）
 * @param s 全书文本
 * @returns 章节列表（首项恒为"头部"）
 */
export function split(s: string): splitChapterInfo[] {
	return splitByRegex(s, getChapterRegex());
}
