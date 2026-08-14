/**
 * 旧状态迁移（Phase 2，P2-05；决策见 ADR-002/007/008）。
 *
 * 迁移内容（幂等，重复执行结果一致）：
 * - isShowReadChapter（旧）→ moyuNovel.ui.showReadChapter（新）
 * - lastOpenChapter（旧）→ moyuNovel.lastOpened（新，含 bookId）
 * - book_<label> 已读列表：按需迁移（见 Book 构造：新 key 不存在且旧 key 存在时转写）
 * - saveScroll：不迁移内容；pixel 仅用于首次恢复并转写新进度（Reader 端处理）
 *
 * 原则：
 * - 旧值暂不破坏性删除（兼容窗口，见 ADR-003）。
 * - 迁移 marker 幂等：已迁移则不重复执行；部分失败不阻塞后续。
 * - 含本地路径的状态不再跨设备同步（Book 不再调用 setSync）。
 */
import {
	StateStore,
	LAST_OPENED_KEY,
	LastOpenedState,
	MIGRATION_MARKER_KEY,
	MigrationMarker,
	CURRENT_MIGRATION_SCHEMA_VERSION,
	SHOW_READ_CHAPTER_KEY,
} from '../core/progress/state';
import {
	IS_SHOW_READ_CHAPTER_KEY,
	LAST_OPEN_CHAPTER_KEY,
} from '../legacy/ids';
import { generateBookId } from '../core/progress/id';

/** 旧 lastOpenChapter 形状（与 Chapter.ts 的 LastChapterData 一致） */
interface LegacyLastOpenChapter {
	title: string;
	i: number;
	bookName: string;
	fullPath: string;
}

export interface MigrationResult {
	/** 已执行的迁移项（用于日志/测试断言） */
	migrated: string[];
	/** 是否已完成（marker 已写入） */
	done: boolean;
}

/** 是否已迁移 */
export function hasMigrated(store: StateStore): boolean {
	const marker = store.get<MigrationMarker>(MIGRATION_MARKER_KEY);
	return !!marker && marker.schemaVersion >= CURRENT_MIGRATION_SCHEMA_VERSION;
}

/**
 * 幂等迁移旧状态到新 schema。
 * 可重复执行；失败项不影响其他项（每项独立 try/catch）。
 */
export async function migrateLegacyState(
	store: StateStore
): Promise<MigrationResult> {
	const result: MigrationResult = { migrated: [], done: false };

	// 1) isShowReadChapter → moyuNovel.ui.showReadChapter
	try {
		const fresh = store.get<boolean>(SHOW_READ_CHAPTER_KEY);
		const legacy = store.get<boolean>(IS_SHOW_READ_CHAPTER_KEY);
		if (fresh === undefined && legacy !== undefined) {
			await store.set(SHOW_READ_CHAPTER_KEY, legacy);
			result.migrated.push('isShowReadChapter');
		}
	} catch (error) {
		console.error('迁移 isShowReadChapter 失败', error);
	}

	// 2) lastOpenChapter → moyuNovel.lastOpened
	try {
		const fresh = store.get<LastOpenedState>(LAST_OPENED_KEY);
		const legacy = store.get<LegacyLastOpenChapter>(LAST_OPEN_CHAPTER_KEY);
		if (fresh === undefined && legacy && typeof legacy.fullPath === 'string' && legacy.fullPath.length > 0) {
			const bookId = generateBookId(legacy.fullPath);
			const opened: LastOpenedState = {
				bookId,
				chapterId: `${bookId}#${legacy.i}`,
				chapterIndex: legacy.i,
				title: legacy.title,
				fullPath: legacy.fullPath,
				updatedAt: Date.now(),
			};
			await store.set(LAST_OPENED_KEY, opened);
			result.migrated.push('lastOpenChapter');
		}
	} catch (error) {
		console.error('迁移 lastOpenChapter 失败', error);
	}

	// 3) 写迁移 marker（无论上面是否成功，保证下次不再重复尝试已成功项——
	//    失败项仍可能因 fresh 未写入而在下次重试，天然幂等）
	await store.set(MIGRATION_MARKER_KEY, {
		schemaVersion: CURRENT_MIGRATION_SCHEMA_VERSION,
		migratedAt: Date.now(),
	} satisfies MigrationMarker);
	result.done = true;

	return result;
}

/**
 * 按需迁移单本书的已读列表（Book 构造时调用）：
 * 新 key（bookId）不存在且旧 key（book_<label>）存在 → 转写。
 * 幂等：新 key 已存在则跳过。
 */
export async function migrateReadListIfNeeded(
	store: StateStore,
	bookId: string,
	legacyKey: string
): Promise<boolean> {
	const fresh = store.get<number[]>(`moyuNovel.readList.${bookId}`);
	if (fresh !== undefined) {
		return false;
	}
	const legacy = store.get<number[]>(legacyKey);
	if (!Array.isArray(legacy)) {
		return false;
	}
	const list = legacy.filter(
		(v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
	);
	await store.set(`moyuNovel.readList.${bookId}`, list);
	return true;
}
