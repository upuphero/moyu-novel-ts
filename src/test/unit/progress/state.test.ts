/**
 * P2-02：状态存储（schema、key、fallback 读取、shape 校验）测试。
 */
import * as assert from "assert";
import {
	StateStore,
	memoryStore,
	readStateWithFallback,
	readProgress,
	readReadList,
	readListStateKey,
	progressStateKey,
} from "../../../core/progress/state";
import { ReadingProgress } from "../../../core/progress/types";

function validProgress(overrides: Partial<ReadingProgress> = {}): ReadingProgress {
	return {
		schemaVersion: 1,
		bookId: "book:1:abcdef0123456789",
		chapterId: "book:1:abcdef0123456789#2",
		chapterIndex: 2,
		paragraphIndex: 5,
		chapterProgress: 0.4,
		updatedAt: 1234567890,
		...overrides,
	};
}

suite("state.memoryStore", () => {
	test("读写与删除", () => {
		const { store, snapshot } = memoryStore();
		store.set("k", 1);
		assert.strictEqual(store.get<number>("k"), 1);
		store.delete("k");
		assert.strictEqual(store.get<number>("k"), undefined);
		snapshot();
	});

	test("可注入初始数据（迁移测试用）", () => {
		const { store } = memoryStore({ legacy: 42 });
		assert.strictEqual(store.get<number>("legacy"), 42);
	});
});

suite("state.key 常量", () => {
	test("命名空间隔离", () => {
		assert.ok(readListStateKey("book:1:x").startsWith("moyuNovel.readList."));
		assert.ok(progressStateKey("book:1:x").startsWith("moyuNovel.progress."));
	});
});

suite("state.readStateWithFallback", () => {
	test("新 key 显式值优先", () => {
		const { store } = memoryStore({ fresh: true, legacy: false });
		assert.strictEqual(readStateWithFallback(store, "fresh", "legacy", true), true);
	});

	test("新 key 无值时回退旧 key", () => {
		const { store } = memoryStore({ legacy: false });
		assert.strictEqual(readStateWithFallback(store, "fresh", "legacy", true), false);
	});

	test("两者皆无时返回默认值", () => {
		const { store } = memoryStore({});
		assert.strictEqual(readStateWithFallback(store, "fresh", "legacy", true), true);
	});

	test("只读不回写（尊重 scope）", () => {
		const { store, snapshot } = memoryStore({ legacy: false });
		readStateWithFallback(store, "fresh", "legacy", true);
		assert.strictEqual(snapshot()["fresh"], undefined);
	});
});

suite("state.readProgress shape 校验", () => {
	test("合法进度通过", () => {
		const { store } = memoryStore({});
		store.set(progressStateKey("book:1:x"), validProgress());
		assert.ok(readProgress(store, "book:1:x"));
	});

	test("schemaVersion 不符被拒", () => {
		const { store } = memoryStore({});
		store.set(progressStateKey("book:1:x"), validProgress({ schemaVersion: 99 as never }));
		assert.strictEqual(readProgress(store, "book:1:x"), undefined);
	});

	test("paragraphIndex 非负整数校验", () => {
		const { store } = memoryStore({});
		store.set(progressStateKey("book:1:x"), validProgress({ paragraphIndex: -1 }));
		assert.strictEqual(readProgress(store, "book:1:x"), undefined);
		store.set(progressStateKey("book:1:x"), validProgress({ paragraphIndex: 1.5 }));
		assert.strictEqual(readProgress(store, "book:1:x"), undefined);
	});

	test("chapterProgress 范围校验", () => {
		const { store } = memoryStore({});
		store.set(progressStateKey("book:1:x"), validProgress({ chapterProgress: 1.2 }));
		assert.strictEqual(readProgress(store, "book:1:x"), undefined);
		store.set(progressStateKey("book:1:x"), validProgress({ chapterProgress: 1 }));
		assert.ok(readProgress(store, "book:1:x"));
	});

	test("脏数据（字符串等）被拒", () => {
		const { store } = memoryStore({});
		store.set(progressStateKey("book:1:x"), "garbage" as never);
		assert.strictEqual(readProgress(store, "book:1:x"), undefined);
	});
});

suite("state.readReadList 校验", () => {
	test("合法数组通过；非法项被过滤", () => {
		const { store } = memoryStore({});
		store.set(readListStateKey("book:1:x"), [0, 1, 3, -1, 2.5, "x"]);
		assert.deepStrictEqual(readReadList(store, "book:1:x"), [0, 1, 3]);
	});

	test("非数组返回 undefined", () => {
		const { store } = memoryStore({});
		store.set(readListStateKey("book:1:x"), { a: 1 });
		assert.strictEqual(readReadList(store, "book:1:x"), undefined);
	});
});

suite("state.StateStore 契约", () => {
	test("接口可被内存实现满足", () => {
		const { store } = memoryStore();
		const s: StateStore = store;
		s.set("k", "v");
		assert.strictEqual(s.get<string>("k"), "v");
	});
});
