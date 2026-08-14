/**
 * 带 schema 的状态存储（Phase 2，P2-02）。
 *
 * - StateStore 抽象（vscode Memento / 内存实现），typed 读写。
 * - 新状态 key 集中定义（带命名空间与语义）；旧 key 见 legacy/ids.ts。
 * - 迁移 marker：migrateLegacyState 幂等执行（见 migration/legacyState.ts）。
 * - 读取 fallback：新 key 显式值 → 旧 key 显式值 → 默认值（只读，不自动写回）。
 */
import { ReadingProgress, PROGRESS_SCHEMA_VERSION } from './types';

/** 状态 key 命名空间前缀（新 schema 状态，与旧 novelLook/legacy key 隔离） */
export const STATE_PREFIX = 'moyuNovel.state';
export const PROGRESS_PREFIX = 'moyuNovel.progress';
export const READ_LIST_PREFIX = 'moyuNovel.readList';
export const UI_PREFIX = 'moyuNovel.ui';

/** 最近打开的书/章节（新 schema） */
export const LAST_OPENED_KEY = 'moyuNovel.lastOpened';
/** 是否折叠已读章节（新 schema） */
export const SHOW_READ_CHAPTER_KEY = `${UI_PREFIX}.showReadChapter`;
/** 迁移 marker：记录已完成迁移的版本与时间 */
export const MIGRATION_MARKER_KEY = `${STATE_PREFIX}.migration.v1`;

/** 单本书的已读列表 key（已读章节 index 数组） */
export const readListStateKey = (bookId: string): string =>
	`${READ_LIST_PREFIX}.${bookId}`;
/** 单本书的进度 key */
export const progressStateKey = (bookId: string): string =>
	`${PROGRESS_PREFIX}.${bookId}`;

/** 最近打开记录（新 schema） */
export interface LastOpenedState {
	bookId: string;
	chapterId: string;
	chapterIndex: number;
	title: string;
	fullPath: string;
	updatedAt: number;
}

/** 迁移 marker 内容 */
export interface MigrationMarker {
	/** 已迁移的 schema 版本 */
	schemaVersion: number;
	migratedAt: number;
}

export const CURRENT_MIGRATION_SCHEMA_VERSION = 1;

/**
 * 状态存储抽象（typed）。
 * 实现：mementoStore（vscode Memento）/ memoryStore（单测）。
 */
export interface StateStore {
	get<T>(key: string): T | undefined;
	set<T>(key: string, value: T): Promise<void> | void;
	/** 删除 key（vscode Memento 语义：update(key, undefined) 即删除） */
	delete(key: string): Promise<void> | void;
}

/** vscode Memento 实现（globalState） */
export function mementoStore(
	memento: {
		get<T>(key: string): T | undefined;
		update(key: string, value: unknown): Thenable<void>;
	}
): StateStore {
	return {
		get<T>(key: string): T | undefined {
			return memento.get<T>(key);
		},
		set: async <T>(key: string, value: T): Promise<void> => {
			await memento.update(key, value);
		},
		delete: async (key: string): Promise<void> => {
			await memento.update(key, undefined);
		},
	};
}

/** 内存实现（单测 / 无 VS Code 环境） */
export function memoryStore(initial: Record<string, unknown> = {}): {
	store: StateStore;
	snapshot: () => Record<string, unknown>;
} {
	const data: Record<string, unknown> = { ...initial };
	return {
		store: {
			get<T>(key: string): T | undefined {
				return data[key] as T | undefined;
			},
			set<T>(key: string, value: T): void {
				data[key] = value;
			},
			delete(key: string): void {
				delete data[key];
			},
		},
		snapshot: () => ({ ...data }),
	};
}

/**
 * 读取状态：新 key 显式值 → 旧 key 显式值 → 默认值。
 * 只读 fallback，不自动写回（尊重 scope，见 DEVELOPMENT_PLAN §2.2 / Phase 2 gate）。
 */
export function readStateWithFallback<T>(
	store: StateStore,
	newKey: string,
	legacyKey: string,
	defaultValue: T
): T {
	const fresh = store.get<T>(newKey);
	if (fresh !== undefined) {
		return fresh;
	}
	const legacy = store.get<T>(legacyKey);
	return legacy !== undefined ? legacy : defaultValue;
}

/**
 * 读取进度（带 shape 校验，防止旧数据/脏数据进入恢复链）
 */
export function readProgress(store: StateStore, bookId: string): ReadingProgress | undefined {
	const raw = store.get<ReadingProgress>(progressStateKey(bookId));
	if (!raw || typeof raw !== 'object') {
		return undefined;
	}
	if (
		raw.schemaVersion !== PROGRESS_SCHEMA_VERSION ||
		typeof raw.bookId !== 'string' ||
		typeof raw.chapterId !== 'string' ||
		typeof raw.chapterIndex !== 'number' ||
		!Number.isInteger(raw.paragraphIndex) ||
		raw.paragraphIndex < 0 ||
		typeof raw.chapterProgress !== 'number' ||
		raw.chapterProgress < 0 ||
		raw.chapterProgress > 1 ||
		typeof raw.updatedAt !== 'number'
	) {
		return undefined;
	}
	return raw;
}

/** 读取已读列表（带校验；非法数据返回 undefined 由调用方回退默认） */
export function readReadList(store: StateStore, bookId: string): number[] | undefined {
	const raw = store.get<unknown>(readListStateKey(bookId));
	if (!Array.isArray(raw)) {
		return undefined;
	}
	const list = raw.filter(
		(v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
	);
	return list;
}
