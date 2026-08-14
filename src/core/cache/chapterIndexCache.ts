/**
 * TXT 章节索引缓存（Phase 3，P3-01/02/05）。
 *
 * - schema：TxtChapterIndex（版本化 + 校验条件 + 章节数组），JSON 落盘。
 * - 校验：sizeBytes / mtimeMs / ruleHash / parserVersion / filePath 任一变化 → 重建。
 * - 原子写入：temp + rename，写入中断不留下半截缓存（且损坏 JSON 也能安全重建）。
 * - 生命周期：启动时 cleanup()——版本不匹配删除、孤儿删除、超容量按 mtime LRU 清理；
 *   不每次启动清空全部缓存。
 * - 纯 Node（node:fs），VS Code 侧只需提供目录路径。
 */
import { promises as fs, Stats } from 'fs';
import { join } from 'path';

/** 缓存 schema 版本（索引结构变化时递增） */
export const INDEX_SCHEMA_VERSION = 1;

/** 缓存文件名的 bookId 净化（bookId 含 `:`，Windows 文件名不允许） */
export function sanitizeBookId(bookId: string): string {
	return bookId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** 缓存文件名（含 parser 版本，便于启动时按文件名清理旧版本） */
export function cacheFileName(bookId: string, parserVersion: number): string {
	return `idx-${sanitizeBookId(bookId)}.v${parserVersion}.json`;
}

/** 章节索引条目（与 splitCore.ChapterInfo 字段一致） */
export interface IndexedChapter {
	s: string;
	i: number;
	txtIndex: number;
	size: number;
}

/** 磁盘上的章节索引（schema v1） */
export interface TxtChapterIndex {
	schemaVersion: number;
	parserVersion: number;
	/** 章节规则 hash（用户正则 source 的 sha256 前 16 hex） */
	ruleHash: string;
	filePath: string;
	sizeBytes: number;
	mtimeMs: number;
	chapters: IndexedChapter[];
}

/** 缓存校验条件（load 时计算） */
export interface CacheValidation {
	filePath: string;
	sizeBytes: number;
	mtimeMs: number;
	ruleHash: string;
	parserVersion: number;
}

/** 校验解析出的 JSON：形状非法返回 null（损坏 → 安全重建） */
export function validateIndexJson(json: unknown): TxtChapterIndex | null {
	if (!json || typeof json !== 'object') return null;
	const index = json as Record<string, unknown>;
	if (
		typeof index.schemaVersion !== 'number' ||
		typeof index.parserVersion !== 'number' ||
		typeof index.ruleHash !== 'string' ||
		typeof index.filePath !== 'string' ||
		typeof index.sizeBytes !== 'number' ||
		typeof index.mtimeMs !== 'number' ||
		!Array.isArray(index.chapters)
	) {
		return null;
	}
	const chapters: IndexedChapter[] = [];
	for (const raw of index.chapters) {
		if (!raw || typeof raw !== 'object') return null;
		const c = raw as Record<string, unknown>;
		if (
			typeof c.s !== 'string' ||
			typeof c.i !== 'number' ||
			typeof c.txtIndex !== 'number' ||
			typeof c.size !== 'number'
		) {
			return null;
		}
		chapters.push({ s: c.s, i: c.i, txtIndex: c.txtIndex, size: c.size });
	}
	return {
		schemaVersion: index.schemaVersion,
		parserVersion: index.parserVersion,
		ruleHash: index.ruleHash,
		filePath: index.filePath,
		sizeBytes: index.sizeBytes,
		mtimeMs: index.mtimeMs,
		chapters,
	};
}

/** 校验条件全部匹配（任一变化 → 重建） */
export function matchesValidation(
	index: TxtChapterIndex,
	validation: CacheValidation
): boolean {
	return (
		index.schemaVersion === INDEX_SCHEMA_VERSION &&
		index.parserVersion === validation.parserVersion &&
		index.ruleHash === validation.ruleHash &&
		index.filePath === validation.filePath &&
		index.sizeBytes === validation.sizeBytes &&
		index.mtimeMs === validation.mtimeMs
	);
}

/** 缓存文件系统抽象（node 实现 / 测试内存实现） */
export interface CacheFs {
	readFile(path: string): Promise<Uint8Array>;
	writeFile(path: string, data: Uint8Array): Promise<void>;
	stat(path: string): Promise<{ size: number; mtimeMs: number }>;
	readdir(dir: string): Promise<string[]>;
	unlink(path: string): Promise<void>;
	mkdir(dir: string): Promise<void>;
	rename(from: string, to: string): Promise<void>;
}

/** node:fs 实现 */
export const nodeCacheFs: CacheFs = {
	async readFile(path: string) {
		return new Uint8Array(await fs.readFile(path));
	},
	writeFile(path, data) {
		return fs.writeFile(path, Buffer.from(data));
	},
	async stat(path: string) {
		const st: Stats = await fs.stat(path);
		return { size: st.size, mtimeMs: st.mtimeMs };
	},
	readdir(dir) {
		return fs.readdir(dir);
	},
	unlink(path) {
		return fs.unlink(path);
	},
	mkdir(dir) {
		return fs.mkdir(dir, { recursive: true }) as Promise<void>;
	},
	rename(from, to) {
		return fs.rename(from, to);
	},
};

/** 内存实现（单测；模拟原子语义） */
export function memoryCacheFs(initial: Record<string, Uint8Array> = {}) {
	const files = new Map<string, Uint8Array>(Object.entries(initial));
	return {
		fs: {
			async readFile(path: string) {
				const data = files.get(path);
				if (!data) throw new Error(`ENOENT: ${path}`);
				return data;
			},
			async writeFile(path: string, data: Uint8Array) {
				files.set(path, data);
			},
			async stat(path: string) {
				const data = files.get(path);
				if (!data) throw new Error(`ENOENT: ${path}`);
				return { size: data.byteLength, mtimeMs: 1000 };
			},
			async readdir() {
				return Array.from(files.keys()).map((k) => k.split('/').pop()!);
			},
			async unlink(path) {
				files.delete(path);
			},
			async mkdir() {},
			async rename(from, to) {
				const data = files.get(from);
				if (!data) throw new Error(`ENOENT: ${from}`);
				files.delete(from);
				files.set(to, data);
			},
		} satisfies CacheFs,
		/** 测试断言用 */
		has(path: string) {
			return files.has(path);
		},
		list() {
			return Array.from(files.keys());
		},
		get(path: string) {
			return files.get(path);
		},
	};
}

export interface ChapterIndexCacheOptions {
	/** 容量上限（字节）；超过后按 mtime LRU 清理，默认 50 MB */
	maxTotalBytes?: number;
}

export interface CleanupResult {
	/** 因版本不匹配/格式非法删除的文件数 */
	removedInvalid: string[];
	/** 因书文件不存在删除的孤儿缓存数 */
	removedOrphans: string[];
	/** 因超容量 LRU 删除的文件数 */
	removedOverCapacity: string[];
	totalBytes: number;
}

/** 默认总容量上限（50 MB：1000 章 × 约 100B/章 ≈ 100 KB/本，可容纳数百本） */
const DEFAULT_MAX_TOTAL_BYTES = 50 * 1024 * 1024;

/**
 * 章节索引缓存（单目录）。
 * 全部操作容错：读失败/写失败不抛出（缓存错误不影响阅读主流程）。
 */
export class ChapterIndexCache {
	private readonly maxTotalBytes: number;

	constructor(
		private readonly fs: CacheFs,
		private readonly dir: string,
		options: ChapterIndexCacheOptions = {}
	) {
		this.maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
	}

	private filePath(bookId: string, parserVersion: number): string {
		return join(this.dir, cacheFileName(bookId, parserVersion));
	}

	/**
	 * 读取并校验缓存。命中返回章节索引；未命中/损坏/失效返回 null。
	 * 出错（目录不存在、文件不存在、JSON 损坏）一律返回 null，由调用方重建。
	 */
	async read(
		bookId: string,
		validation: CacheValidation
	): Promise<IndexedChapter[] | null> {
		try {
			const file = this.filePath(bookId, validation.parserVersion);
			const raw = await this.fs.readFile(file);
			const text = Buffer.from(raw).toString('utf8');
			const index = validateIndexJson(JSON.parse(text));
			if (!index) return null;
			if (!matchesValidation(index, validation)) return null;
			return index.chapters;
		} catch {
			return null;
		}
	}

	/** 原子写入（temp + rename）；失败静默（不影响阅读主流程） */
	async write(
		bookId: string,
		validation: CacheValidation,
		chapters: IndexedChapter[]
	): Promise<boolean> {
		try {
			await this.fs.mkdir(this.dir);
			const file = this.filePath(bookId, validation.parserVersion);
			const temp = `${file}.tmp`;
			const index: TxtChapterIndex = {
				schemaVersion: INDEX_SCHEMA_VERSION,
				parserVersion: validation.parserVersion,
				ruleHash: validation.ruleHash,
				filePath: validation.filePath,
				sizeBytes: validation.sizeBytes,
				mtimeMs: validation.mtimeMs,
				chapters,
			};
			await this.fs.writeFile(temp, Buffer.from(JSON.stringify(index), 'utf8'));
			await this.fs.rename(temp, file);
			return true;
		} catch (error) {
			console.warn('写入章节索引缓存失败', error);
			return false;
		}
	}

	/**
	 * 生命周期清理（启动时调用一次）：
	 * 1. 删除文件名与当前 parser 版本不匹配/非本缓存格式的文件；
	 * 2. 删除书文件已不存在（孤儿）的缓存；
	 * 3. 总大小超上限时按 mtime 升序删除最旧缓存。
	 * 不删除版本匹配且书文件仍存在的缓存（不会每次启动清空全部）。
	 */
	async cleanup(parserVersion: number): Promise<CleanupResult> {
		const result: CleanupResult = {
			removedInvalid: [],
			removedOrphans: [],
			removedOverCapacity: [],
			totalBytes: 0,
		};
		let names: string[];
		try {
			names = await this.fs.readdir(this.dir);
		} catch {
			return result; // 目录不存在 → 无需清理
		}
		const prefix = `idx-`;
		const suffix = `.v${parserVersion}.json`;
		const entries: { name: string; path: string; size: number; mtimeMs: number }[] = [];

		for (const name of names) {
			const file = join(this.dir, name);
			// 1) 版本/格式不匹配 → 删除
			if (!name.startsWith(prefix)) {
				// 只管理本缓存格式的文件：非 idx- 开头的一律跳过（不删未知文件）
				continue;
			}
			// 1) 版本不匹配（含 .tmp 残留、旧版本）→ 删除
			if (!name.endsWith(suffix)) {
				await this.safeUnlink(file);
				result.removedInvalid.push(name);
				continue;
			}
			let stat;
			try {
				stat = await this.fs.stat(file);
			} catch {
				await this.safeUnlink(file);
				result.removedInvalid.push(name);
				continue;
			}
			// 2) 孤儿：书文件不存在 → 删除
			try {
				const raw = await this.fs.readFile(file);
				const index = validateIndexJson(JSON.parse(Buffer.from(raw).toString('utf8')));
				if (!index) {
					await this.safeUnlink(file);
					result.removedInvalid.push(name);
					continue;
				}
				try {
					await this.fs.stat(index.filePath);
				} catch {
					await this.safeUnlink(file);
					result.removedOrphans.push(name);
					continue;
				}
				entries.push({ name, path: file, size: stat.size, mtimeMs: stat.mtimeMs });
			} catch {
				await this.safeUnlink(file);
				result.removedInvalid.push(name);
			}
		}

		// 3) 容量 LRU
		const totalBytes = entries.reduce((sum, e) => sum + e.size, 0);
		result.totalBytes = totalBytes;
		if (totalBytes > this.maxTotalBytes) {
			const sorted = [...entries].sort((a, b) => a.mtimeMs - b.mtimeMs);
			let current = totalBytes;
			for (const entry of sorted) {
				if (current <= this.maxTotalBytes) break;
				await this.safeUnlink(entry.path);
				result.removedOverCapacity.push(entry.name);
				current -= entry.size;
			}
		}
		return result;
	}

	private async safeUnlink(path: string): Promise<void> {
		try {
			await this.fs.unlink(path);
		} catch {
			// 已删除/无权限：忽略
		}
	}
}

/* ---------------- 扩展侧单例（目录由 index.ts 提供） ---------------- */

let cacheInstance: ChapterIndexCache | null = null;

/** 初始化单例（activate 时调用；dir 为 globalStorage 下的缓存目录绝对路径） */
export function initChapterIndexCache(dir: string): ChapterIndexCache {
	cacheInstance = new ChapterIndexCache(nodeCacheFs, dir);
	return cacheInstance;
}

/** 获取单例（未初始化返回 null，调用方降级为无缓存） */
export function getChapterIndexCache(): ChapterIndexCache | null {
	return cacheInstance;
}

/** 缓存目录相对名（globalStorage 下） */
export function cacheDirName(): string {
	return join('cache', 'index');
}

/** 解析缓存目录绝对路径（从 globalStorageUri 的 fsPath） */
export function resolveCacheDir(globalStorageFsPath: string): string {
	return join(globalStorageFsPath, cacheDirName());
}
