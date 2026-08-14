/**
 * P2-01：Book ID / Chapter ID 生成器测试。
 */
import * as assert from "assert";
import {
	BOOK_ID_VERSION,
	generateBookId,
	generateChapterId,
	normalizePath,
} from "../../../core/progress/id";

suite("id.generateBookId", () => {
	test("同一路径稳定生成同一 ID", () => {
		const a = generateBookId("C:/books/斗破苍穹.txt");
		const b = generateBookId("C:/books/斗破苍穹.txt");
		assert.strictEqual(a, b);
	});

	test("不同路径（同名不同目录）生成不同 ID（P2-01：同名不同路径不共享状态）", () => {
		const a = generateBookId("C:/books/a/斗破苍穹.txt");
		const b = generateBookId("C:/books/b/斗破苍穹.txt");
		assert.notStrictEqual(a, b);
	});

	test("Windows 反斜杠与正斜杠归一化后 ID 一致", () => {
		const a = generateBookId("C:\\books\\斗破苍穹.txt");
		const b = generateBookId("C:/books/斗破苍穹.txt");
		assert.strictEqual(a, b);
	});

	test("算法版本化前缀（ADR-007）", () => {
		const id = generateBookId("C:/books/x.txt");
		assert.ok(id.startsWith(`book:${BOOK_ID_VERSION}:`), id);
		// hash 段为 16 hex
		const hashPart = id.split(":")[2];
		assert.match(hashPart, /^[0-9a-f]{16}$/);
	});

	test("ID 不含原始路径明文（哈希化，可安全用作状态 key）", () => {
		const id = generateBookId("C:/books/秘密路径/书.txt");
		assert.ok(!id.includes("秘密路径"));
		assert.ok(!id.includes("书.txt"));
	});
});

suite("id.normalizePath", () => {
	test("统一分隔符", () => {
		assert.strictEqual(normalizePath("a\\b\\c.txt"), "a/b/c.txt");
		assert.strictEqual(normalizePath("a/b/c.txt"), "a/b/c.txt");
	});
});

suite("id.generateChapterId", () => {
	test("bookId#index 格式（0 为头部）", () => {
		const bookId = generateBookId("C:/books/x.txt");
		assert.strictEqual(generateChapterId(bookId, 0), `${bookId}#0`);
		assert.strictEqual(generateChapterId(bookId, 3), `${bookId}#3`);
	});
});
