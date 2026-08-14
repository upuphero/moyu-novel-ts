/**
 * 纯分章逻辑（不依赖 VS Code API，可脱离 Extension Host 单测）。
 *
 * 定位：Phase 0 回归护栏（P0-02）。原 `src/split.ts` 顶层 import config（进而 import vscode），
 * 无法在纯 Node 单测中加载；这里将分章核心逻辑参数化为 `splitByRegex(s, regex)`，
 * `src/split.ts` 仅保留"读取配置 + 安全回退"的适配职责。
 *
 * Phase 1 将把本文件迁入 `src/core/parser/` 并扩展为 `TxtParser`，行为以本文件为准。
 */

/**
 * 章节信息（与旧 `splitChapterInfo` 形状一致，作为 characterization 基线）
 */
export interface ChapterInfo {
	/** 章节原始行文本（可能包含制表符/回车等） */
	s: string;
	/** 章节在数组中的下标（分章之后的第几章，头部为 0） */
	i: number;
	/** 章节正文开始位置（相对全书文本的字符下标；头部固定为 -2） */
	txtIndex: number;
	/** 章节正文长度（字符数） */
	size: number;
}

/** 只匹配章节名主干（不含"第几章"部分），用于同名章节去重 */
/** 只匹配章节名主干（不含“第几章”部分），用于同名章节去重 */
const chapterTitleCore = /第.+?章/;

/**
 * 安全编译用户章节正则（纯逻辑，不依赖 VS Code）：
 * - 非法模式返回 null（由调用方决定回退与提示）；
 * - 空模式 `(?:)` 视为非法（会匹配所有位置）。
 */
export function compileChapterRegex(pattern: string): RegExp | null {
	try {
		const reg = new RegExp(pattern, "gm");
		if (reg.source === "(?:)") {
			return null;
		}
		return reg;
	} catch {
		return null;
	}
}

/**
 * 获取章节标题（去掉"第X章"前缀并压缩空格）。
 * 无匹配时原样返回。行为与旧实现一致（characterization）。
 */
export function getChapterTitle(s: string): string {
	const t = chapterTitleCore.exec(s);
	if (t) {
		return s.substring(t[0].length).replace(/ /g, "") || s;
	}
	return s;
}

/**
 * 判断连续两个章节是否"重复"（标题主干相同则不新开一章）。
 * 与旧实现一致：仅比较标题主干，不比较正文。
 */
export function isRepeatChapter(cur: ChapterInfo, last: ChapterInfo): boolean {
	const curTitle = getChapterTitle(cur.s.trim());
	const lastTitle = getChapterTitle(last.s.trim());
	return curTitle === lastTitle;
}

/**
 * 用给定正则对全文分章。
 *
 * 行为基线（与旧实现一致，供 characterization 测试锁定）：
 * - 首章之前的内容固定为 `头部`（i=0, txtIndex=-2, size=全文长度，若有章节则覆盖为第一节起点）。
 * - 章节匹配使用 `gm` 标志。
 * - 连续重复标题（`isRepeatChapter`）的章节会被跳过且不占用下标。
 * - 最后一章 size 延伸至全文结尾。
 *
 * @param s 全书文本
 * @param regex 章节匹配正则（调用方负责安全回退；本函数不做 try/catch）
 */
export function splitByRegex(s: string, regex: RegExp): ChapterInfo[] {
	const reg = new RegExp(regex.source, "gm");
	let t: RegExpExecArray | null;
	// 第一章之前的为头部；txtIndex 取 -2（"头部"占位），size 先赋全文长度，命中章节后覆盖
	const arr: ChapterInfo[] = [{ txtIndex: -2, s: "头部", i: 0, size: s.length }];

	t = reg.exec(s);
	let i = 0;
	let lastItem = arr[0];
	if (t) {
		do {
			const item: ChapterInfo = {
				// 这里获取到的会包含\t\r\n 但是为了保证字符 index 不出现偏差,需要保存
				s: t[0],
				i: i + 1,
				txtIndex: t.index,
				size: 0,
			};
			if (isRepeatChapter(item, lastItem)) {
				continue;
			} else {
				arr.push(item);
				lastItem.size = t.index - lastItem.txtIndex;
				lastItem = item;
			}
			i++;
		} while ((t = reg.exec(s)) && t);
		// 最后一章的结尾
		lastItem.size = s.length - lastItem.txtIndex;
	}
	return arr;
}

/**
 * 用行匹配器分章（Phase 7，P7-01）。
 *
 * 头部语义与 splitByRegex 一致（i=0 头部，txtIndex=-2 hack，配合 s='头部'）；
 * 重复标题判定沿用 isRepeatChapter；章节原始行保留（含 \r\t 等）保证 txtIndex 偏移正确。
 *
 * @param s 全书文本
 * @param matcher 行匹配器（内置 matcher pipeline 或用户自定义正则包装；返回标题或 null）
 */
export function splitByMatcher(
	s: string,
	matcher: { match(line: string): string | null }
): ChapterInfo[] {
	const arr: ChapterInfo[] = [{ txtIndex: -2, s: "头部", i: 0, size: s.length }];
	const lines = s.split("\n");
	let offset = 0;
	let lastItem = arr[0];
	let i = 0;
	for (const raw of lines) {
		const line = raw.replace(/\r$/, "").trim();
		const title = matcher.match(line);
		if (title !== null && title.length > 0) {
			const item: ChapterInfo = {
				s: raw,
				i: i + 1,
				txtIndex: offset,
				size: 0,
			};
			if (!isRepeatChapter(item, lastItem)) {
				arr.push(item);
				lastItem.size = offset - lastItem.txtIndex;
				lastItem = item;
				i++;
			}
		}
		offset += raw.length + 1; // +1 换行符
	}
	lastItem.size = s.length - lastItem.txtIndex;
	return arr;
}
