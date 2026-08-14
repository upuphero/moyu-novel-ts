/**
 * P2-03：ProgressService 测试。
 */
import * as assert from "assert";
import { ProgressService } from "../../../core/progress/ProgressService";
import { memoryStore, progressStateKey } from "../../../core/progress/state";
import { ReadingProgress } from "../../../core/progress/types";

function makeProgress(overrides: Partial<ReadingProgress> = {}): ReadingProgress {
	return {
		schemaVersion: 1,
		bookId: "book:1:abc",
		chapterId: "book:1:abc#1",
		chapterIndex: 1,
		paragraphIndex: 3,
		chapterProgress: 0.25,
		updatedAt: 0,
		...overrides,
	};
}

suite("ProgressService", () => {
	test("保存后读取（schemaVersion 与 updatedAt 自动填充）", async () => {
		const { store } = memoryStore();
		const svc = new ProgressService(store);
		await svc.save(makeProgress({ updatedAt: 0 }));
		const got = svc.get("book:1:abc");
		assert.ok(got);
		assert.strictEqual(got!.schemaVersion, 1);
		assert.strictEqual(got!.paragraphIndex, 3);
		assert.ok(got!.updatedAt > 0, "updatedAt 应为当前时间");
	});

	test("清除后读取为 undefined", async () => {
		const { store } = memoryStore();
		const svc = new ProgressService(store);
		await svc.save(makeProgress());
		await svc.clear("book:1:abc");
		assert.strictEqual(svc.get("book:1:abc"), undefined);
		assert.strictEqual(store.get(progressStateKey("book:1:abc")), undefined);
	});

	test("不同 bookId 互不干扰", async () => {
		const { store } = memoryStore();
		const svc = new ProgressService(store);
		await svc.save(makeProgress({ bookId: "book:1:a", chapterId: "book:1:a#1" }));
		assert.strictEqual(svc.get("book:1:b"), undefined);
		assert.ok(svc.get("book:1:a"));
	});

	test("已读列表读写与按需迁移", async () => {
		const { store } = memoryStore();
		const svc = new ProgressService(store);
		// 旧 key 存在 → 迁移
		store.set("book_旧书", [0, 1, 4]);
		const migrated = await svc.migrateReadList("book:1:abc", "book_旧书");
		assert.strictEqual(migrated, true);
		assert.deepStrictEqual(svc.getReadList("book:1:abc"), [0, 1, 4]);
		// 再次迁移幂等
		const again = await svc.migrateReadList("book:1:abc", "book_旧书");
		assert.strictEqual(again, false);
		assert.deepStrictEqual(svc.getReadList("book:1:abc"), [0, 1, 4]);
		// 保存
		await svc.saveReadList("book:1:abc", [0, 2]);
		assert.deepStrictEqual(svc.getReadList("book:1:abc"), [0, 2]);
	});

	test("无旧 key 时不产生新 key", async () => {
		const { store, snapshot } = memoryStore();
		const svc = new ProgressService(store);
		const migrated = await svc.migrateReadList("book:1:abc", "book_不存在");
		assert.strictEqual(migrated, false);
		assert.strictEqual(snapshot()[progressStateKey("book:1:abc")], undefined);
	});
});
