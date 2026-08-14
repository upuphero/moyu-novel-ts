/**
 * P7-03/04：TxtParser + matcher pipeline 集成测试。
 * - 内置 matcher 分章：头部/章节数/正文截取正确；
 * - 用户自定义 matcher 完全替换内置（ADR-012）；
 * - ruleKey 参与缓存失效（ruleHash 联动，P7-04）；
 * - 缓存命中场景不读全文不 split（复用 P3 行为）。
 */
import * as assert from "assert";
import { TxtParser } from "../../../core/parser/TxtParser";
import { splitByMatcher } from "../../../splitCore";
import {
	builtinChapterLineMatcher,
	userChapterLineMatcher,
	CHAPTER_MATCHER_VERSION,
} from "../../../core/matcher/chapterMatcher";
import { compileChapterRegex } from "../../../splitCore";
import { DEFAULT_CHAPTER_REGEX } from "../../../legacy/ids";
import { ChapterIndexCache, nodeCacheFs } from "../../../core/cache/chapterIndexCache";
import { generateSyntheticTxt } from "../../helpers/syntheticTxt";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

function makeParser(
	filePath: string,
	text: string,
	opts: { matcher?: boolean; cache?: ChapterIndexCache } = {}
) {
	const parser = new TxtParser(
		filePath,
		async () => new Uint8Array(Buffer.from(text, "utf8")),
		{
			chapterMatcher: opts.matcher
				? () => builtinChapterLineMatcher
				: undefined,
			stat: async () => ({
				size: Buffer.byteLength(text, "utf8"),
				mtimeMs: 1000,
			}),
			cache: opts.cache,
		}
	);
	return parser;
}

suite("splitByMatcher（P7-01 分章路径）", () => {
	const TEXT =
		"楔子 缘起\n这是开篇。\n\n" +
		"第一章 风起\n风起了。\n\n" +
		"第二章 云涌\n云涌了。\n\n" +
		"Chapter 3\n英文章节内容。\n";

	test("头部语义与 splitByRegex 一致（首项为头部）", () => {
		const items = splitByMatcher(TEXT, builtinChapterLineMatcher);
		assert.strictEqual(items[0].s, "头部");
		assert.strictEqual(items[0].i, 0);
		// 楔子被 special matcher 识别为第一章
		assert.strictEqual(items.length, 5, "头部+楔子+3 章（含英文）");
		assert.strictEqual(items[1].s.trim(), "楔子 缘起");
		assert.strictEqual(items[2].s.trim(), "第一章 风起");
		assert.strictEqual(items[3].s.trim(), "第二章 云涌");
		assert.strictEqual(items[4].s.trim(), "Chapter 3");
	});

	test("正文截取跳过标题行本身", () => {
		const items = splitByMatcher(TEXT, builtinChapterLineMatcher);
		const ch2 = items[2];
		const content = TEXT.substring(
			ch2.txtIndex + ch2.s.length,
			ch2.txtIndex + ch2.size
		);
		assert.ok(content.includes("风起了。"), "正文含风起段落");
		assert.ok(!content.includes("第一章 风起"), "正文不含标题行");
	});
});

suite("TxtParser + 内置 matcher（P7-03 默认路径）", () => {
	test("章节列表与正文正确", async () => {
		const parser = makeParser("/books/m.txt", "第一章 风起\n内容A\n第二章 云涌\n内容B\n", {
			matcher: true,
		});
		const meta = await parser.load();
		assert.strictEqual(meta.chapterCount, 3, "头部+2 章");
		const chapters = await parser.getChapterList();
		assert.strictEqual(chapters[1].title, "第一章 风起");
		const content = await parser.getChapterContent(chapters[1]);
		assert.deepStrictEqual(content.lines, ["内容A"]);
		parser.dispose();
	});

	test("正文误判修复（P0 已知缺陷）：‘第二章的内容。’不再成为章节", async () => {
		const parser = makeParser(
			"/books/m.txt",
			"第一章 风起\n第二章的内容。\n第二章 云涌\n内容B\n",
			{ matcher: true }
		);
		const meta = await parser.load();
		// 头部 + 2 章（"第二章的内容。" 是正文，不识别）
		assert.strictEqual(meta.chapterCount, 3);
		const chapters = await parser.getChapterList();
		const content = await parser.getChapterContent(chapters[1]);
		assert.ok(content.lines.includes("第二章的内容。"), "该行作为正文保留");
		parser.dispose();
	});

	test("序类标题（楔子）被识别为章节", async () => {
		const parser = makeParser("/books/m.txt", "楔子 缘起\n开篇内容\n第一章 风起\n内容A\n", {
			matcher: true,
		});
		const meta = await parser.load();
		assert.strictEqual(meta.chapterCount, 3, "楔子+第一章+头部");
		const chapters = await parser.getChapterList();
		assert.strictEqual(chapters[1].title, "楔子 缘起");
		parser.dispose();
	});
});

suite("TxtParser + 用户自定义 matcher（P7-03 / ADR-012 完全替换）", () => {
	test("用户正则完全替换内置（只识别用户规则）", async () => {
		const compiled = compileChapterRegex("^第\\d+章.*$");
		assert.ok(compiled);
		const parser = new TxtParser(
			"/books/u.txt",
			async () =>
				new Uint8Array(
					Buffer.from(
						"第1章 风起\n内容A\n楔子\n内容B\n第2章 云涌\n内容C\n",
						"utf8"
					)
				),
			{
				// 用户正则只认"第N章"（阿拉伯数字），"楔子"不被识别（完全替换）
				chapterMatcher: () =>
					userChapterLineMatcher(compiled!, "^第\\d+章.*$"),
				stat: async () => ({ size: 100, mtimeMs: 1000 }),
			}
		);
		const meta = await parser.load();
		assert.strictEqual(meta.chapterCount, 3, "头部+第1章+第2章（楔子不识别）");
		const chapters = await parser.getChapterList();
		const ch2 = chapters[2];
		const content = await parser.getChapterContent(ch2);
		assert.deepStrictEqual(content.lines, ["内容C"]);
		parser.dispose();
	});

	test("ruleKey 反映用户正则 source（user:...）", () => {
		const compiled = compileChapterRegex("^第\\d+章$")!;
		const matcher = userChapterLineMatcher(compiled, "^第\\d+章$");
		assert.ok(matcher.ruleKey.startsWith("user:"));
	});
});

suite("P7-04 缓存联动（ruleHash 随 matcher 版本/规则变化）", () => {
	function tempCache() {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "moyu-p7-cache-"));
		const cache = new ChapterIndexCache(nodeCacheFs, dir);
		return { cache, dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
	}

	test("内置 matcher 与旧正则规则 key 不同（P7-04 缓存联动依据）", () => {
		// ruleKey 不同 → ruleHash 不同 → 同文件下缓存必然失效重建
		assert.notStrictEqual(builtinChapterLineMatcher.ruleKey, DEFAULT_CHAPTER_REGEX);
		assert.ok(builtinChapterLineMatcher.ruleKey.includes(`v${CHAPTER_MATCHER_VERSION}`));
	});

	test("matcher 规则变化 → 缓存失效重建（P7-04）", async () => {
		const { cache, cleanup } = tempCache();
		try {
			const text = "第一章 风起\n内容A\n第二章 云涌\n内容B\n";
			let reads = 0;
			const make = (matcher: boolean) =>
				new TxtParser(
					"/books/h.txt",
					async () => {
						reads++;
						return new Uint8Array(Buffer.from(text, "utf8"));
					},
					{
						chapterMatcher: matcher
							? () => builtinChapterLineMatcher
							: undefined,
						stat: async () => ({
							size: Buffer.byteLength(text, "utf8"),
							mtimeMs: 1000,
						}),
						cache,
					}
				);
			// 1) 旧 regex 规则写缓存
			const p1 = make(false);
			await p1.load();
			p1.dispose();
			assert.strictEqual(reads, 1);
			// 2) matcher 规则读取：ruleHash 不同 → miss → 重新索引
			const p2 = make(true);
			await p2.load();
			p2.dispose();
			assert.strictEqual(reads, 2, "规则变化后缓存失效，重新索引");
			// 3) 再次 matcher 读取：命中
			const p3 = make(true);
			await p3.load();
			p3.dispose();
			assert.strictEqual(reads, 2, "规则一致后缓存命中");
		} finally {
			cleanup();
		}
	});

	test("缓存命中：不读全文（split 计数不可观测但 readFile 计数为 0）", async () => {
		const { cache, cleanup } = tempCache();
		try {
			const text = "第一章 风起\n内容A\n第二章 云涌\n内容B\n";
			let reads = 0;
			const parser = new TxtParser(
				"/books/c.txt",
				async () => {
					reads++;
					return new Uint8Array(Buffer.from(text, "utf8"));
				},
				{
					chapterMatcher: () => builtinChapterLineMatcher,
					stat: async () => ({ size: Buffer.byteLength(text, "utf8"), mtimeMs: 1000 }),
					cache,
				}
			);
			const meta = await parser.load();
			assert.strictEqual(reads, 1, "首次 miss 读全文");
			parser.dispose();
			// 新实例 + 同一缓存 → 命中，不读全文
			const parser2 = new TxtParser(
				"/books/c.txt",
				async () => {
					reads++;
					return new Uint8Array(Buffer.from(text, "utf8"));
				},
				{
					chapterMatcher: () => builtinChapterLineMatcher,
					stat: async () => ({ size: Buffer.byteLength(text, "utf8"), mtimeMs: 1000 }),
					cache,
				}
			);
			const meta2 = await parser2.load();
			assert.strictEqual(reads, 1, "缓存命中不读全文");
			assert.strictEqual(meta2.chapterCount, meta.chapterCount);
			parser2.dispose();
		} finally {
			cleanup();
		}
	});

	test("合成数据 matcher 分章：章节数一致且正文可读（P7 gate 场景）", async () => {
		const { text, chapterCount } = generateSyntheticTxt(1);
		const parser = makeParser("/books/syn.txt", text, { matcher: true });
		const meta = await parser.load();
		// 生成器的"楔子 缘起"头部被 special matcher 识别为章节 → 章节数 ≥ 生成器计数
		assert.ok(meta.chapterCount >= chapterCount - 1, `章节数 ${meta.chapterCount} vs ${chapterCount}`);
		const chapters = await parser.getChapterList();
		const mid = chapters[Math.floor(chapters.length / 2)];
		const content = await parser.getChapterContent(mid);
		assert.ok(content.lines.length > 0, "中间章节有正文");
		parser.dispose();
	});
});
