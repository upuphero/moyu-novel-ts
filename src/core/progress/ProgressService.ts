/**
 * 阅读进度服务（Phase 2，P2-03）。
 *
 * - 保存/读取/清除 ReadingProgress（带 schema 与 shape 校验）。
 * - 已读列表（新 schema，bookId 维度）读写与按需迁移。
 * - 恢复锚点链（ADR-008）：chapterId + paragraphIndex → chapterProgress → 章节开头。
 * - 单例：initProgressService(store) 在扩展激活时注入 vscode globalState；
 *   getProgressService() 供 Book/Chapter/webView 使用。
 */
import { ReadingProgress, PROGRESS_SCHEMA_VERSION } from './types';
import {
	StateStore,
	progressStateKey,
	readProgress,
	readListStateKey,
	readReadList,
} from './state';
import { migrateReadListIfNeeded } from '../../migration/legacyState';

let instance: ProgressService | null = null;

/** 初始化（激活时调用一次） */
export function initProgressService(store: StateStore): ProgressService {
	instance = new ProgressService(store);
	return instance;
}

/** 获取单例（未初始化返回 null，调用方降级处理） */
export function getProgressService(): ProgressService | null {
	return instance;
}

export class ProgressService {
	constructor(private readonly store: StateStore) {}

	/** 保存进度（调用方负责提供合法数据） */
	async save(progress: ReadingProgress): Promise<void> {
		await this.store.set(progressStateKey(progress.bookId), {
			...progress,
			schemaVersion: PROGRESS_SCHEMA_VERSION,
			updatedAt: Date.now(),
		});
	}

	/** 读取某本书的进度（shape 校验通过才返回） */
	get(bookId: string): ReadingProgress | undefined {
		return readProgress(this.store, bookId);
	}

	/** 清除某本书的进度 */
	async clear(bookId: string): Promise<void> {
		await this.store.delete(progressStateKey(bookId));
	}

	/** 读取已读列表（新 schema；无则空数组） */
	getReadList(bookId: string): number[] {
		return readReadList(this.store, bookId) ?? [];
	}

	/** 保存已读列表 */
	async saveReadList(bookId: string, list: number[]): Promise<void> {
		await this.store.set(readListStateKey(bookId), list);
	}

	/** 按需迁移旧已读列表（book_<label> → bookId），幂等 */
	async migrateReadList(bookId: string, legacyKey: string): Promise<boolean> {
		return migrateReadListIfNeeded(this.store, bookId, legacyKey);
	}

	/** 暴露底层 store（迁移模块使用） */
	getStore(): StateStore {
		return this.store;
	}
}
