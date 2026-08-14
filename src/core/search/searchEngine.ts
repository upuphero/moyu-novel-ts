/**
 * 全书搜索引擎（Phase 5，P5-02/03/05）。
 *
 * - TXT：复用章节索引缓存（P3）+ 正文内存缓存，逐章线性扫描；
 * - EPUB：按 spine 懒解析章节正文并缓存 lines —— **同一有效索引第二次搜索不重新解析任何 XHTML**（P5-03）；
 * - 可取消：每章之间检查 token（P5-05），取消时返回已收集结果（不抛错）；
 * - 结果上限：默认 200，达到即停止（大书搜索不阻塞无限增长）；
 * - 缓存失效：每次搜索前重新获取章节列表，与缓存章节列表比对
 *   （数量/章节 id/标题任一变化 → 整体重建；覆盖"文件或抽取规则变化后失效"）；
 * - 大小写 / 整词选项（P5-02）；preview 带关键词上下文与 matchStart/matchLength（P5-01）。
 *
 * 纯 Node 可测（不 import vscode）。
 */
import { BookParser } from '../parser/BookParser';
import { ChapterContent, ChapterInfo } from '../book/model';
import { BookSearch, SearchCancel, SearchQuery, SearchResult } from './types';

/** 默认结果上限（P5-05） */
export const DEFAULT_RESULT_LIMIT = 200;
/** preview 上下文长度（关键词前后各取这么多字符） */
export const PREVIEW_CONTEXT = 20;

/** 单本书记忆的章节正文（chapterIndex → lines）；EPUB 首次搜索构建后复用 */
interface ChapterContentCache {
	/** 章节列表快照（用于失效比对） */
	chapters: ChapterInfo[];
	/** chapterIndex → 该章 lines */
	contents: Map<number, string[]>;
}

export class SearchEngine implements BookSearch {
	/** 缓存 key（bookId:format） → 内容缓存（跨搜索复用；章节变化时重建） */
	private readonly caches = new Map<string, ChapterContentCache>();

	/**
	 * @param parserFor 按 bookId 取解析器（extension 侧从书库 map 提供）
	 */
	constructor(
		private readonly parserFor: (bookId: string) => BookParser | undefined
	) {}

	/** 清除某本书的缓存（书被移除/刷新时调用） */
	clearCache(bookId: string): void {
		this.caches.delete(bookId);
	}

	dispose(): void {
		this.caches.clear();
	}

	async search(query: SearchQuery, cancel?: SearchCancel): Promise<SearchResult[]> {
		const keyword = query.keyword ?? '';
		if (!keyword) return [];
		const limit = Math.max(1, Math.min(query.limit ?? DEFAULT_RESULT_LIMIT, 500));
		const parser = this.parserFor(query.bookId);
		if (!parser) return [];

		let chapters: ChapterInfo[];
		try {
			chapters = await parser.getChapterList();
		} catch {
			return [];
		}

		const cacheKey = `${query.bookId}:${parser.format}`;
		let cache = this.caches.get(cacheKey);
		// 失效比对：章节数量/ID/标题任一变化 → 重建
		if (
			!cache ||
			cache.chapters.length !== chapters.length ||
			!cache.chapters.every(
				(c, i) => c.id === chapters[i].id && c.title === chapters[i].title
			)
		) {
			cache = { chapters, contents: new Map() };
			this.caches.set(cacheKey, cache);
		}

		const results: SearchResult[] = [];
		for (let ci = 0; ci < chapters.length; ci++) {
			if (cancel?.cancelled()) break; // P5-05：可取消
			const chapter = chapters[ci];
			let lines: string[] | undefined = cache.contents.get(ci);
			if (lines === undefined) {
				try {
					const content: ChapterContent = await parser.getChapterContent(chapter);
					lines = content.lines;
					cache.contents.set(ci, lines);
				} catch {
					// 损坏章节（P4-06 错误隔离）：跳过该章继续
					continue;
				}
			}
			for (let pi = 0; pi < lines.length; pi++) {
				if (cancel?.cancelled()) break;
				const hits = this.findInLine(lines[pi], keyword, query);
				for (const hit of hits) {
					results.push({
						bookId: query.bookId,
						chapterId: chapter.id,
						chapterIndex: ci,
						chapterTitle: chapter.title,
						paragraphIndex: pi,
						preview: this.buildPreview(lines[pi], hit, keyword.length),
						matchStart: Math.max(0, hit - PREVIEW_CONTEXT),
						matchLength: keyword.length,
					});
					if (results.length >= limit) {
						return results; // 达到上限立即返回（P5-05）
					}
				}
			}
		}
		return results;
	}

	/** 在一行内查找所有命中（返回命中起点数组） */
	private findInLine(
		line: string,
		keyword: string,
		query: SearchQuery
	): number[] {
		const positions: number[] = [];
		if (!line) return positions;
		const hay = query.caseSensitive ? line : line.toLowerCase();
		const needle = query.caseSensitive ? keyword : keyword.toLowerCase();
		if (query.wholeWord) {
			// ASCII 词边界匹配（中文不适用，按字面匹配）
			const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const re = new RegExp(
				`\\b${escaped}\\b`,
				query.caseSensitive ? 'g' : 'gi'
			);
			let m: RegExpExecArray | null;
			while ((m = re.exec(line)) !== null) {
				positions.push(m.index);
				if (m.index === re.lastIndex) re.lastIndex++;
			}
			return positions;
		}
		let idx = hay.indexOf(needle);
		while (idx !== -1) {
			positions.push(idx);
			idx = hay.indexOf(needle, idx + keyword.length);
		}
		return positions;
	}

	/** preview：关键词前后各 PREVIEW_CONTEXT 字符（matchStart 相对 preview 起点） */
	private buildPreview(line: string, start: number, len: number): string {
		const from = Math.max(0, start - PREVIEW_CONTEXT);
		const to = Math.min(line.length, start + len + PREVIEW_CONTEXT);
		const prefix = from > 0 ? '…' : '';
		const suffix = to < line.length ? '…' : '';
		return prefix + line.slice(from, to) + suffix;
	}
}
