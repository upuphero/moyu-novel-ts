import { basename, extname } from 'path';
import {
	splitByRegex,
	ChapterInfo as SplitItem,
} from '../../splitCore';
import { DEFAULT_CHAPTER_REGEX } from '../../legacy/ids';
import decodeEncoding from '../../file/encoding';
import {
	BookFormat,
	BookMetadata,
	ChapterBlock,
	ChapterContent,
	ChapterInfo,
} from '../book/model';
import { BookParser } from './BookParser';
import { TXT_PARSER_VERSION } from './versions';
import { generateBookId } from '../progress/id';
import {
	ChapterIndexCache,
	IndexedChapter,
} from '../cache/chapterIndexCache';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';

/** 全文缓存 TTL：与旧实现一致（10 分钟自动回收） */
const TXT_CACHE_TTL_MS = 10 * 60 * 1000;

/** stat 结果（注入；默认用 node:fs） */
export interface FileStat {
	size: number;
	mtimeMs: number;
}

export interface TxtParserOptions {
	/**
	 * 章节正则提供者（每次调用重新读取，保证配置修改即时生效，P0-03-5）。
	 * 缺省时使用内置默认正则。
	 */
	chapterRegex?: () => RegExp;
	/** 分章实现（默认 splitByRegex；测试注入计数包装做可观测性，P3-04） */
	split?: (text: string, regex: RegExp) => SplitItem[];
	/** 文件 stat（默认 node:fs；测试注入以模拟 mtime/size 变化） */
	stat?: (path: string) => Promise<FileStat>;
	/** 章节索引缓存（P3-03）；缺省无缓存 */
	cache?: ChapterIndexCache;
}

/**
 * TXT 解析器：读取、编码识别、分章、按章取内容（P1-03 + P3）。
 *
 * - 纯 Node 依赖（不 import vscode），`readFile`/`split`/`stat` 均可注入。
 * - 章节索引缓存（P3）：展开书架命中缓存时**不读全文、不 split**；
 *   正文只在 getChapterContent 需要时懒加载。
 * - 缓存校验条件：size / mtime / ruleHash / parserVersion / filePath（P3-02）。
 */
export class TxtParser implements BookParser {
	readonly format: BookFormat = 'txt';

	private text = '';
	private items: SplitItem[] = [];
	private infos: ChapterInfo[] = [];
	private metadata?: BookMetadata;
	private timer?: NodeJS.Timeout;
	private loaded = false;
	/** load 时的文件 stat（正文懒加载时校验文件是否变化） */
	private lastStat?: FileStat;
	private readonly bookId: string;

	constructor(
		private readonly filePath: string,
		private readonly readFile: (path: string) => Promise<Uint8Array>,
		private readonly options: TxtParserOptions = {}
	) {
		this.bookId = generateBookId(filePath);
	}

	private get regex(): RegExp {
		if (this.options.chapterRegex) {
			return this.options.chapterRegex();
		}
		return new RegExp(DEFAULT_CHAPTER_REGEX, 'gm');
	}

	private async getStat(): Promise<FileStat> {
		if (this.options.stat) {
			return this.options.stat(this.filePath);
		}
		const st = await fs.stat(this.filePath);
		return { size: st.size, mtimeMs: st.mtimeMs };
	}

	/** 规则 hash：正则 source 的 sha256 前 16 hex（P3-02） */
	private get ruleHash(): string {
		return createHash('sha256')
			.update(this.regex.source)
			.digest('hex')
			.slice(0, 16);
	}

	/** 重置缓存计时器（与旧 Book.getContent 语义一致：任何访问都会续期） */
	private touch(): void {
		if (this.timer) {
			clearTimeout(this.timer);
		}
		this.timer = setTimeout(() => this.releaseText(), TXT_CACHE_TTL_MS);
	}

	/** 释放全文与索引缓存（内存回收；磁盘索引缓存不受影响） */
	private releaseText(): void {
		this.text = '';
		this.items = [];
		this.infos = [];
		this.metadata = undefined;
		this.loaded = false;
		this.lastStat = undefined;
	}

	async load(): Promise<BookMetadata> {
		if (this.loaded && this.metadata) {
			this.touch();
			return this.metadata;
		}
		// stat 失败（文件不可 stat 等）→ 降级为无缓存路径（旧行为），不抛错
		let stat: FileStat | undefined;
		try {
			stat = await this.getStat();
		} catch {
			stat = undefined;
		}
		// 缓存命中：不读全文、不 split
		if (stat && this.options.cache) {
			const validation = this.buildValidation(stat);
			const cached = await this.options.cache.read(this.bookId, validation);
			if (cached) {
				this.items = cached;
				this.infos = this.buildInfos(cached);
				this.metadata = this.buildMetadata(stat.size, this.infos.length);
				this.lastStat = stat;
				this.loaded = true;
				this.touch();
				return this.metadata;
			}
		}
		// 未命中/失效/无 stat：读全文 + split（+ 写缓存）
		const buffer = await this.readFile(this.filePath);
		this.text = decodeEncoding(buffer);
		this.items = this.options.split
			? this.options.split(this.text, this.regex)
			: splitByRegex(this.text, this.regex);
		this.infos = this.buildInfos(this.items);
		this.metadata = this.buildMetadata(buffer.byteLength, this.infos.length);
		this.lastStat = stat;
		this.loaded = true;
		this.touch();
		if (stat && this.options.cache) {
			await this.options.cache.write(this.bookId, this.buildValidation(stat), this.items);
		}
		return this.metadata;
	}

	private buildValidation(stat: FileStat) {
		return {
			filePath: this.filePath,
			sizeBytes: stat.size,
			mtimeMs: stat.mtimeMs,
			ruleHash: this.ruleHash,
			parserVersion: TXT_PARSER_VERSION,
		};
	}

	private buildInfos(items: SplitItem[]): ChapterInfo[] {
		return items.map((item, index) => ({
			id: `${this.format}:${index}`,
			index,
			title: item.s.trim(),
			isPreface: index === 0,
		}));
	}

	private buildMetadata(sizeBytes: number, chapterCount: number): BookMetadata {
		return {
			title: basename(this.filePath, extname(this.filePath)),
			format: this.format,
			filePath: this.filePath,
			sizeBytes,
			chapterCount,
		};
	}

	async getChapterList(): Promise<ChapterInfo[]> {
		await this.load();
		// 返回拷贝，防止外部修改内部状态
		return this.infos.map((info) => ({ ...info }));
	}

	async getChapterContent(info: ChapterInfo): Promise<ChapterContent> {
		await this.load();
		const item = this.items[info.index];
		if (!item) {
			throw new Error(`章节不存在: ${this.filePath}#${info.index}`);
		}
		// 懒加载全文（缓存命中场景 load() 未读全文）
		if (!this.text) {
			// stat 失败视为"无法校验"→ 走重新索引路径（保证正确性）
			let stat: FileStat | undefined;
			try {
				stat = await this.getStat();
			} catch {
				stat = undefined;
			}
			const changed =
				stat === undefined ||
				!this.lastStat ||
				stat.size !== this.lastStat.size ||
				stat.mtimeMs !== this.lastStat.mtimeMs;
			if (changed) {
				// 文件在索引之后变化（或无法校验）→ 重新索引（保证章节结果正确，P3 gate）
				this.releaseText();
				await this.load();
				const reloaded = this.items[info.index];
				if (!reloaded) {
					throw new Error(`章节不存在: ${this.filePath}#${info.index}`);
				}
				return this.buildContent(info, reloaded);
			}
			this.text = decodeEncoding(await this.readFile(this.filePath));
			this.touch();
		}
		return this.buildContent(info, item);
	}

	private buildContent(info: ChapterInfo, item: IndexedChapter): ChapterContent {
		// 与旧 Chapter.getTxt() 等价：跳过标题行（含换行符），取正文区间
		const content = this.text.substring(
			item.txtIndex + item.s.length,
			item.txtIndex + item.size
		);
		// 与旧 parseChapterTxt_WebView() 等价：按行切分、trim、过滤空行
		const lines = content
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		const blocks: ChapterBlock[] = lines.map((text, index) => ({
			index,
			text,
			kind: 'paragraph',
		}));
		return { info, blocks, lines };
	}

	dispose(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		this.releaseText();
	}
}
