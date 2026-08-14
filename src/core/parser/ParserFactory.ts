import { extname } from 'path';
import { BookParser } from './BookParser';
import { TxtParser } from './TxtParser';
import { EpubParser } from '../epub/EpubParser';
import { ChapterIndexCache } from '../cache/chapterIndexCache';

/** 明确的不支持格式错误（区别于未知错误，便于 UI 给出可读提示） */
export class UnsupportedFormatError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UnsupportedFormatError';
	}
}

/** 读取文件字节的注入点（extension 侧提供 vscode.workspace.fs 实现） */
export type FileReader = (path: string) => Promise<Uint8Array>;

export interface ParserFactoryOptions {
	/** 读取文件实现（必须注入；core 层不依赖 VS Code） */
	readFile?: FileReader;
	/** 章节正则提供者（仅 TXT 使用；缺省用内置默认） */
	chapterRegex?: () => RegExp;
	/** 章节索引缓存（仅 TXT 使用；P3-03） */
	cache?: ChapterIndexCache;
}

/**
 * 根据扩展名创建对应解析器（大小写不敏感，P1-02）。
 *
 * - `.txt` → TxtParser
 * - `.epub` → EpubParser（Phase 4）
 * - 其他 → 明确抛错（UnsupportedFormatError）
 */
export class ParserFactory {
	static create(filePath: string, options: ParserFactoryOptions = {}): BookParser {
		const ext = extname(filePath).toLowerCase();
		const readFile = options.readFile;
		if (!readFile) {
			throw new Error('ParserFactory.create 需要注入 readFile 实现');
		}
		if (ext === '.txt') {
			return new TxtParser(filePath, readFile, {
				chapterRegex: options.chapterRegex,
				cache: options.cache,
			});
		}
		if (ext === '.epub') {
			return new EpubParser(filePath, readFile);
		}
		throw new UnsupportedFormatError(
			`不支持的文件格式: ${ext || '(无扩展名)'}`
		);
	}
}
