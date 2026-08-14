/**
 * P2-05：旧状态迁移测试（首次、重复幂等、部分失败、marker）。
 */
import * as assert from "assert";
import {
	hasMigrated,
	migrateLegacyState,
	migrateReadListIfNeeded,
} from "../../../migration/legacyState";
import {
	LAST_OPENED_KEY,
	LastOpenedState,
	MIGRATION_MARKER_KEY,
	SHOW_READ_CHAPTER_KEY,
	memoryStore,
	readListStateKey,
} from "../../../core/progress/state";

suite("migrateLegacyState", () => {
	test("首次迁移：isShowReadChapter 与 lastOpenChapter 转写并写 marker", async () => {
		const { store } = memoryStore({
			isShowReadChapter: false,
			lastOpenChapter: {
				title: "第一章 开始",
				i: 1,
				bookName: "书A",
				fullPath: "C:/books/书A.txt",
			},
		});
		const result = await migrateLegacyState(store);
		assert.strictEqual(store.get<boolean>(SHOW_READ_CHAPTER_KEY), false);
		const opened = store.get<LastOpenedState>(LAST_OPENED_KEY);
		assert.ok(opened, "lastOpened 应写入");
		assert.strictEqual(opened!.title, "第一章 开始");
		assert.strictEqual(opened!.chapterIndex, 1);
		assert.ok(opened!.bookId.startsWith("book:1:"), "bookId 由 fullPath 生成");
		assert.ok(result.migrated.includes("isShowReadChapter"));
		assert.ok(result.migrated.includes("lastOpenChapter"));
		assert.ok(hasMigrated(store));
		assert.ok(store.get(MIGRATION_MARKER_KEY), "marker 应写入");
	});

	test("重复执行幂等：不覆盖新值、不重复迁移", async () => {
		const { store } = memoryStore({
			isShowReadChapter: false,
			lastOpenChapter: {
				title: "第一章 开始",
				i: 1,
				bookName: "书A",
				fullPath: "C:/books/书A.txt",
			},
		});
		await migrateLegacyState(store);
		// 用户此后修改了新值
		await store.set(SHOW_READ_CHAPTER_KEY, true);
		const opened = store.get<LastOpenedState>(LAST_OPENED_KEY)!;
		const second = await migrateLegacyState(store);
		// 新值不被旧值覆盖
		assert.strictEqual(store.get<boolean>(SHOW_READ_CHAPTER_KEY), true);
		// lastOpened 保持首次迁移结果
		assert.deepStrictEqual(store.get<LastOpenedState>(LAST_OPENED_KEY), opened);
		// 迁移项为空
		assert.deepStrictEqual(second.migrated, []);
	});

	test("部分失败不阻塞：lastOpenChapter 缺 fullPath 时跳过该项", async () => {
		const { store } = memoryStore({
			isShowReadChapter: true,
			lastOpenChapter: { title: "x", i: 0, bookName: "y", fullPath: "" },
		});
		const result = await migrateLegacyState(store);
		assert.strictEqual(store.get<boolean>(SHOW_READ_CHAPTER_KEY), true);
		assert.strictEqual(store.get<LastOpenedState>(LAST_OPENED_KEY), undefined);
		assert.ok(result.migrated.includes("isShowReadChapter"));
		assert.ok(!result.migrated.includes("lastOpenChapter"));
		assert.ok(hasMigrated(store), "marker 仍应写入");
	});

	test("全新安装（无旧 key）：不产生新 key，仅写 marker", async () => {
		const { store, snapshot } = memoryStore({});
		await migrateLegacyState(store);
		assert.strictEqual(store.get<boolean>(SHOW_READ_CHAPTER_KEY), undefined);
		assert.strictEqual(store.get<LastOpenedState>(LAST_OPENED_KEY), undefined);
		assert.ok(hasMigrated(store));
		const keys = Object.keys(snapshot());
		assert.deepStrictEqual(keys, [MIGRATION_MARKER_KEY]);
	});
});

suite("migrateReadListIfNeeded", () => {
	test("旧 book_<label> 迁移到 bookId 维度，非法项过滤", async () => {
		const { store } = memoryStore({ book_旧书: [0, 1, 3, -1, "x"] });
		const ok = await migrateReadListIfNeeded(store, "book:1:abc", "book_旧书");
		assert.strictEqual(ok, true);
		assert.deepStrictEqual(store.get<number[]>(readListStateKey("book:1:abc")), [0, 1, 3]);
	});

	test("幂等：新 key 已存在则跳过", async () => {
		const { store } = memoryStore({ book_旧书: [0] });
		store.set(readListStateKey("book:1:abc"), [9]);
		const ok = await migrateReadListIfNeeded(store, "book:1:abc", "book_旧书");
		assert.strictEqual(ok, false);
		assert.deepStrictEqual(store.get<number[]>(readListStateKey("book:1:abc")), [9]);
	});

	test("同名文件不同路径互不影响（bookId 隔离）", async () => {
		const { store } = memoryStore({});
		store.set(readListStateKey("book:1:a"), [1]);
		// book:1:b 没有已读
		assert.strictEqual(store.get<number[]>(readListStateKey("book:1:b")), undefined);
	});
});
