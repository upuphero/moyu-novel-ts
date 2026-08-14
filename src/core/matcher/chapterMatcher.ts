/**
 * 中文章节标题匹配器（Phase 7，P7-01/02）。
 *
 * 用多个职责清晰、可单独测试和版本化的 matcher 替换"继续扩张的单一巨型正则"：
 *
 * - `chapterMatchers`：按类别分组的匹配器数组（顺序即优先级）；
 * - `matchChapterTitle(line)`：主入口，返回标题（trim 后整行）或 null；
 * - `CHAPTER_MATCHER_VERSION`：内置规则版本（P7-04），内置规则变化时递增，
 *   使章节索引缓存 ruleHash 变化 → 自动失效重建。
 *
 * 匹配原则（整行锚定，正文句子/对话反例不识别）：
 * - 行首锚定：正文段落（"我们讨论到第三章…"）、对话（"他说：…"）不匹配；
 * - 排除"第X章 的…"结构："第二章的内容。" 这类正文行不再被误判（修复 P0 已知缺陷）；
 * - 排除以句末标点（。！？）结尾的行：正文句子特征；
 * - 卷/部/篇/集/节 需要空格/缩进分隔或纯名，排除"第一节，我们先说…"这类正文；
 * - 英文 Chapter N 支持大小写与标题后缀。
 */
import { ChapterLineMatcher } from './types';

/** 内置 matcher pipeline 版本（P7-04：内置规则变化时递增） */
export const CHAPTER_MATCHER_VERSION = 1;

export interface ChapterMatcher {
	id: string;
	/** 返回标题（trim 后整行）；不匹配返回 null */
	match(line: string): string | null;
}

const CN_NUM = "零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟";
const CN_NUM_OR_DIGIT = CN_NUM + "\\d";

/** 句子结束标点（正文句子特征，标题行排除） */
const SENTENCE_END = /[。！？]$/;

function matchWith(re: RegExp, line: string): string | null {
	re.lastIndex = 0;
	if (!re.test(line)) return null;
	// 排除以句末标点结尾（正文句子特征）
	if (SENTENCE_END.test(line)) return null;
	return line;
}

/** 1) 第X章（中文/大写/阿拉伯数字；可带标题后缀；排除紧跟"的"的正文形态） */
const cnChapterRe = new RegExp(`^第[${CN_NUM_OR_DIGIT}]+章(?![的])`);

/** 2) 第X卷/部/篇/集（需空格/缩进分隔或纯名；排除"第一卷的内容"等正文） */
const cnVolumeRe = new RegExp(`^第[${CN_NUM_OR_DIGIT}]+[卷部篇集]([ \t　].*|$)`);

/** 3) 第X节（需空格/缩进分隔或纯名；排除"第一节，我们先说…"） */
const cnSectionRe = new RegExp(`^第[${CN_NUM_OR_DIGIT}]+节([ \t　].*|$)`);

/** 4) 序/尾/后记/番外等固定词（可带 :： 或空格后缀） */
const specialRe =
	/^(序章|序言|前言|引子|楔子|尾声|终章|后记|大结局|番外|番外篇|外传)([ \t　:：].*|$)/;

/** 5) 英文 Chapter N（大小写不敏感；支持 ": / -" 与空格后缀） */
const englishRe =
	/^[Cc][Hh][Aa][Pp][Tt][Ee][Rr][ \t　]+\d+([ \t　:：\-—].*|$)/;

/** 分组的匹配器（顺序即优先级；可单独测试） */
export const chapterMatchers: ChapterMatcher[] = [
	{ id: 'cn-chapter', match: (line) => matchWith(cnChapterRe, line) },
	{ id: 'cn-volume', match: (line) => matchWith(cnVolumeRe, line) },
	{ id: 'cn-section', match: (line) => matchWith(cnSectionRe, line) },
	{ id: 'special', match: (line) => matchWith(specialRe, line) },
	{ id: 'english', match: (line) => matchWith(englishRe, line) },
];

/**
 * 内置 matcher pipeline 主入口（P7-01）。
 * @returns 标题（trim 后整行）；不匹配返回 null
 */
export function matchChapterTitle(line: string): string | null {
	for (const matcher of chapterMatchers) {
		const title = matcher.match(line);
		if (title !== null) return title;
	}
	return null;
}

/** 内置 matcher 的 ruleKey（P7-04：缓存 ruleHash 依据） */
export const BUILTIN_MATCHER_RULE_KEY = `matcher:v${CHAPTER_MATCHER_VERSION}`;

/** 由内置 pipeline 构造的 ChapterLineMatcher（extension 侧默认使用） */
export const builtinChapterLineMatcher: ChapterLineMatcher = {
	match: (line) => matchChapterTitle(line),
	ruleKey: BUILTIN_MATCHER_RULE_KEY,
};

/**
 * 由用户自定义正则构造的 ChapterLineMatcher（P7-03 / ADR-012）：
 * **用户显式规则完全替换内置 matcher**（不 fallback），匹配行为与旧 split 一致
 * （标题 = 正则匹配文本 trim）。
 * 规则无效由调用方（getChapterMatcher）负责提示并回退内置。
 */
export function userChapterLineMatcher(
	compiled: RegExp,
	pattern: string
): ChapterLineMatcher {
	return {
		match: (line: string) => {
			compiled.lastIndex = 0;
			const m = compiled.exec(line);
			return m ? m[0].trim() : null;
		},
		ruleKey: `user:${pattern}`,
	};
}
