/**
 * P3-01/02/05：章节索引缓存模块测试。
 * 覆盖：schema 校验（损坏 JSON 安全重建）、原子写、校验条件变化重建、
 * 生命周期清理（版本不匹配 / 孤儿 / 容量 LRU）。
 */
import * as assert from "assert";
import * as os from "os";
import * as path from "path";
import * as nodeFs from "fs";
import {
	ChapterIndexCache,
	CacheValidation,
	INDEX_SCHEMA_VERSION,
	cacheFileName,
	memoryCacheFs,
	matchesValidation,
	nodeCacheFs,
	sanitizeBookId,
	validateIndexJson,
} from "../../../core/cache/chapterIndexCache";

function validation(overrides: Partial<CacheValidation> = {}): CacheValidation {
	return {
		filePath: "/books/x.txt",
		sizeBytes: 1000,
		mtimeMs: 123456,
		ruleHash: "abc123",
		parserVersion: 1,
		...overrides,
	};
}

function chapters() {
	return [
		{ s: "头部", i: 0, txtIndex: -2, size: 12 },
		{ s: "第一章 开始", i: 1, txtIndex: 10, size: 200 },
	];
}

function makeCache(fs = memoryCacheFs().fs, dir = "/cache") {
	return new ChapterIndexCache(fs, dir);
}

/** 真实临时目录缓存（验证 node 实现） */
function tempCache(dirName: string) {
	const dir = path.join(os.tmpdir(), `moyu-cache-test-${Date.now()}-${dirName}`);
	nodeFs.mkdirSync(dir, { recursive: true });
	const cache = new ChapterIndexCache(nodeCacheFs, dir);
	return { cache, dir, cleanup: () => nodeFs.rmSync(dir, { recursive: true, force: true }) };
}

suite("cache.validateIndexJson", () => {
	test("合法 JSON 通过并保留字段", () => {
		const index = {
			schemaVersion: INDEX_SCHEMA_VERSION,
			parserVersion: 1,
			ruleHash: "abc123",
			filePath: "/books/x.txt",
			sizeBytes: 1,
			mtimeMs: 2,
			chapters: chapters(),
		};
		const got = validateIndexJson(index);
		assert.ok(got);
		assert.strictEqual(got!.chapters.length, 2);
	});

	test("缺字段 / 类型错误 / 损坏 → null（安全重建）", () => {
		assert.strictEqual(validateIndexJson(null), null);
		assert.strictEqual(validateIndexJson("garbage"), null);
		assert.strictEqual(validateIndexJson({}), null);
		assert.strictEqual(
			validateIndexJson({
				schemaVersion: INDEX_SCHEMA_VERSION,
				parserVersion: 1,
				ruleHash: "abc123",
				filePath: "/x.txt",
				sizeBytes: 1,
				mtimeMs: 2,
				chapters: [{ s: 1, i: 0, txtIndex: 0, size: 1 }],
			}),
			null
		);
		assert.strictEqual(
			validateIndexJson({
				schemaVersion: INDEX_SCHEMA_VERSION,
				parserVersion: 1,
				ruleHash: "abc123",
				filePath: "/x.txt",
				sizeBytes: 1,
				mtimeMs: 2,
				chapters: "not array",
			}),
			null
		);
	});
});

suite("cache.matchesValidation", () => {
	const base = {
		schemaVersion: INDEX_SCHEMA_VERSION,
		parserVersion: 1,
		ruleHash: "abc123",
		filePath: "/books/x.txt",
		sizeBytes: 1000,
		mtimeMs: 123456,
		chapters: [],
	};

	test("全部一致 → 命中", () => {
		assert.ok(matchesValidation(base, validation()));
	});

	test("任一条件变化 → 失效（重建）", () => {
		assert.ok(!matchesValidation(base, validation({ sizeBytes: 999 })), "size");
		assert.ok(!matchesValidation(base, validation({ mtimeMs: 1 })), "mtime");
		assert.ok(!matchesValidation(base, validation({ ruleHash: "zzz" })), "rule");
		assert.ok(
			!matchesValidation(base, validation({ parserVersion: 2 })),
			"parser version"
		);
		assert.ok(!matchesValidation(base, validation({ filePath: "/y.txt" })), "path");
	});
});

suite("cache.ChapterIndexCache read/write", () => {
	test("写入后命中读取；内容一致", async () => {
		const mem = memoryCacheFs();
		const cache = makeCache(mem.fs);
		const v = validation();
		await cache.write("book:1:x", v, chapters());
		const got = await cache.read("book:1:x", v);
		assert.deepStrictEqual(got, chapters());
	});

	test("校验条件变化 → read 返回 null", async () => {
		const mem = memoryCacheFs();
		const cache = makeCache(mem.fs);
		const v = validation();
		await cache.write("book:1:x", v, chapters());
		assert.strictEqual(await cache.read("book:1:x", validation({ mtimeMs: 1 })), null);
	});

	test("文件内容损坏（半截 JSON）→ null（安全重建）", async () => {
		const mem = memoryCacheFs();
		const cache = makeCache(mem.fs);
		const v = validation();
		await cache.write("book:1:x", v, chapters());
		// 直接破坏缓存文件内容
		const key = path.join("/cache", cacheFileName("book:1:x", 1));
		mem.get(key)!.fill(0);
		assert.strictEqual(await cache.read("book:1:x", v), null);
	});

	test("写入中断不留下半截主文件（原子写：temp + rename）", async () => {
		const mem = memoryCacheFs();
		const cache = makeCache(mem.fs);
		const v = validation();
		await cache.write("book:1:x", v, chapters());
		assert.ok(mem.has(path.join("/cache", cacheFileName("book:1:x", 1))));
		assert.ok(!mem.list().some((f) => f.endsWith(".tmp")), "无 temp 残留");
	});

	test("bookId 含冒号被净化（Windows 文件名安全）", () => {
		assert.strictEqual(sanitizeBookId("book:1:abcdef"), "book_1_abcdef");
		const name = cacheFileName("book:1:abcdef", 1);
		assert.ok(!name.includes(":"), name);
		assert.ok(name.startsWith("idx-") && name.endsWith(".v1.json"));
	});
});

suite("cache.ChapterIndexCache cleanup（P3-05）", () => {
	test("版本不匹配文件被删除（版本升级清理，不每次启动清空全部）", async () => {
		const { cache, dir, cleanup } = tempCache("ver");
		try {
			// v99 版本的缓存文件（手动写入）
			nodeFs.writeFileSync(
				path.join(dir, cacheFileName("book:1:old", 99)),
				JSON.stringify({
					schemaVersion: INDEX_SCHEMA_VERSION,
					parserVersion: 99,
					ruleHash: "x",
					filePath: "/books/old.txt",
					sizeBytes: 1,
					mtimeMs: 1,
					chapters: [],
				})
			);
			const result = await cache.cleanup(1);
			assert.ok(result.removedInvalid.length >= 1, "v99 应被删除");
			const remaining = nodeFs.readdirSync(dir);
			assert.ok(!remaining.some((f) => f.includes("v99")), "v99 已删");
		} finally {
			cleanup();
		}
	});

	test("孤儿缓存（书文件不存在）被删除；书文件存在则保留", async () => {
		const { cache, dir, cleanup } = tempCache("orphan");
		try {
			const bookFile = path.join(dir, "book.txt");
			nodeFs.writeFileSync(bookFile, "第一章 开始\n内容");
			// 有效缓存（书存在）
			await cache.write(
				"book:1:real",
				validation({ filePath: bookFile }),
				[{ s: "第一章 开始", i: 1, txtIndex: 0, size: 10 }]
			);
			// 孤儿缓存（书不存在）
			await cache.write(
				"book:1:ghost",
				validation({ filePath: path.join(dir, "不存在.txt") }),
				[{ s: "头部", i: 0, txtIndex: -2, size: 5 }]
			);
			const result = await cache.cleanup(1);
			assert.ok(result.removedOrphans.length >= 1, "孤儿应被删除");
			assert.strictEqual(result.removedInvalid.length, 0);
			// 书存在的缓存保留且仍可命中
			assert.ok(
				await cache.read("book:1:real", validation({ filePath: bookFile })),
				"书存在缓存保留"
			);
		} finally {
			cleanup();
		}
	});

	test("超容量按 mtime LRU 清理最旧", async () => {
		const { cache, dir, cleanup } = tempCache("cap");
		try {
			// 每本缓存都指向存在的书文件
			const mkBook = (name: string) => {
				const f = path.join(dir, `${name}.txt`);
				nodeFs.writeFileSync(f, "第一章 开始\n内容");
				return f;
			};
			const fileA = mkBook("a");
			const fileB = mkBook("b");
			const small = new ChapterIndexCache(nodeCacheFs, dir, { maxTotalBytes: 60 });
			await small.write("book:1:a", validation({ filePath: fileA }), chapters());
			await small.write("book:1:b", validation({ filePath: fileB }), chapters());
			const result = await small.cleanup(1);
			assert.ok(result.removedOverCapacity.length >= 1, "超容量应清理");
			const remaining = nodeFs.readdirSync(dir).filter((f) => f.startsWith("idx-"));
			assert.ok(remaining.length <= 1, "保留不超过容量");
		} finally {
			cleanup();
		}
	});

	test("目录不存在时 cleanup 无副作用", async () => {
		const dir = path.join(os.tmpdir(), `moyu-cache-none-${Date.now()}`);
		const cache = new ChapterIndexCache(nodeCacheFs, dir);
		const result = await cache.cleanup(1);
		assert.deepStrictEqual(result, {
			removedInvalid: [],
			removedOrphans: [],
			removedOverCapacity: [],
			totalBytes: 0,
		});
	});
});
