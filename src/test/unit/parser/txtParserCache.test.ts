/**
 * P3-03/P3-04：TxtParser × 章节索引缓存集成测试。
 * 可观测性：注入 split 计数包装，断言"第二次展开/收起/切章/重开 Reader/刷新均为 0 次全文 split"。
 */
import * as assert from "assert";
import { TxtParser } from "../../../core/parser/TxtParser";
import { splitByRegex } from "../../../splitCore";
import { DEFAULT_CHAPTER_REGEX } from "../../../legacy/ids";
import { memoryCacheFs, ChapterIndexCache } from "../../../core/cache/chapterIndexCache";
import { generateSyntheticTxt } from "../../helpers/syntheticTxt";

const regex = () => new RegExp(DEFAULT_CHAPTER_REGEX, "gm");

interface CountingParser {
	parser: TxtParser;
	splitCount: () => number;
	readCount: () => number;
}

/** 构造带计数依赖的 TxtParser（内存文件 + 内存缓存） */
function makeCountingParser(
	filePath: string,
	text: string,
	opts: {
		stat?: (p: string) => Promise<{ size: number; mtimeMs: number }>;
		cache?: ChapterIndexCache;
	} = {}
): CountingParser {
	let splits = 0;
	let reads = 0;
	const stat = opts.stat ?? (async () => ({ size: Buffer.byteLength(text, "utf8"), mtimeMs: 1000 }));
	const parser = new TxtParser(
		filePath,
		async () => {
			reads++;
			return new Uint8Array(Buffer.from(text, "utf8"));
		},
		{
			chapterRegex: regex,
			cache: opts.cache,
			split: (t, r) => {
				splits++;
				return splitByRegex(t, r);
			},
			stat,
		}
	);
	return {
		parser,
		splitCount: () => splits,
		readCount: () => reads,
	};
}

function defaultCache() {
	return new ChapterIndexCache(memoryCacheFs().fs, "/cache");
}

suite("TxtParser 缓存命中：0 次全文 split（P3-04 验收）", () => {
	test("第二次展开、收起、切章、重开 Reader、刷新均为 0 次 split", async () => {
		const { text, chapterCount } = generateSyntheticTxt(1, 42);
		assert.ok(chapterCount > 5, "合成 fixture 应有多个章节");
		const cache = defaultCache();

		// 首次：新实例 → miss → 1 次 split，写缓存
		const first = makeCountingParser("/books/syn.txt", text, { cache });
		const meta = await first.parser.load();
		assert.strictEqual(meta.chapterCount, chapterCount);
		assert.strictEqual(first.splitCount(), 1, "首次 1 次 split");
		assert.strictEqual(first.readCount(), 1, "首次 1 次读全文");

		// 第二次展开（同实例 getChapterList）→ 0 split
		await first.parser.getChapterList();
		assert.strictEqual(first.splitCount(), 1, "二次展开 0 split");

		// 收起再展开（再次 getChapterList）
		await first.parser.getChapterList();
		assert.strictEqual(first.splitCount(), 1, "收起再展开 0 split");

		// 切章（getChapterContent）：首次 miss 已读全文，正文复用，0 split
		const chapters = await first.parser.getChapterList();
		const content = await first.parser.getChapterContent(chapters[1]);
		assert.ok(content.lines.length > 0);
		assert.strictEqual(first.splitCount(), 1, "切章 0 split");
		assert.strictEqual(first.readCount(), 1, "miss 时全文已读，正文复用");

		// 重开 Reader（新实例，同缓存）→ 0 split，0 读全文
		const reopened = makeCountingParser("/books/syn.txt", text, { cache });
		await reopened.parser.getChapterList();
		assert.strictEqual(reopened.splitCount(), 0, "重开 Reader 0 split（缓存命中）");
		assert.strictEqual(reopened.readCount(), 0, "缓存命中列表不读全文");
		// 正文懒加载：仅 1 次读全文
		const reopenedChapters = await reopened.parser.getChapterList();
		const reopenedContent = await reopened.parser.getChapterContent(reopenedChapters[1]);
		assert.strictEqual(reopened.splitCount(), 0, "正文读取 0 split");
		assert.strictEqual(reopened.readCount(), 1, "正文懒加载 1 次读全文");
		assert.ok(reopenedContent.lines.length > 0);
		reopened.parser.dispose();

		// 普通刷新（再 getChapterList）→ 0 split
		await first.parser.getChapterList();
		assert.strictEqual(first.splitCount(), 1, "刷新 0 split");
		first.parser.dispose();
	});

	test("缓存命中时章节列表与 split 结果一致（等价性）", async () => {
		const text = "序章\n开始。\n\n第一章 测试\n内容A\n第二章 测试\n内容B\n";
		const cache = defaultCache();
		const first = makeCountingParser("/books/eq.txt", text, { cache });
		await first.parser.getChapterList();
		first.parser.dispose();

		const second = makeCountingParser("/books/eq.txt", text, { cache });
		const chapters2 = await second.parser.getChapterList();
		assert.deepStrictEqual(
			chapters2.map((c) => c.title),
			["头部", "第一章 测试"]
		);
		const content = await second.parser.getChapterContent(chapters2[1]);
		// 锁定旧行为：被去重吞掉的"第二章 测试"行并入上一章正文（P0 既有缺陷，Phase 7 修复）
		assert.ok(content.lines.includes("内容A"), "正文包含第一章内容");
		assert.ok(content.lines.includes("第二章 测试"), "去重章标题行并入上一章正文（旧行为锁定）");
		second.parser.dispose();
	});
});

suite("TxtParser 缓存失效重建（P3-02 验收）", () => {
	function statControl(initial: { size: number; mtimeMs: number }) {
		const state = { ...initial };
		return {
			stat: async () => ({ ...state }),
			setSize: (size: number) => {
				state.size = size;
			},
			setMtime: (mtimeMs: number) => {
				state.mtimeMs = mtimeMs;
			},
		};
	}

	test("mtime 变化 → 重建（章节结果正确）", async () => {
		const text = "第一章 开始\n内容A\n第二章 继续\n内容B\n";
		const ctrl = statControl({ size: Buffer.byteLength(text, "utf8"), mtimeMs: 1000 });
		const cache = defaultCache();
		const first = makeCountingParser("/books/m.txt", text, { cache, stat: ctrl.stat });
		await first.parser.getChapterList();
		first.parser.dispose();

		// 文件变化（mtime 变、内容变）
		const newText = "第一章 开始\n内容A2\n第二章 继续\n内容B2\n第三章 新增\n内容C\n";
		ctrl.setMtime(2000);
		const second = makeCountingParser("/books/m.txt", newText, {
			cache,
			stat: async () => ({ size: Buffer.byteLength(newText, "utf8"), mtimeMs: 2000 }),
		});
		const chapters = await second.parser.getChapterList();
		assert.strictEqual(second.splitCount(), 1, "mtime 变化应重建（1 split）");
		assert.deepStrictEqual(
			chapters.map((c) => c.title),
			["头部", "第一章 开始", "第二章 继续", "第三章 新增"]
		);
		second.parser.dispose();
	});

	test("size 变化 → 重建", async () => {
		const text = "第一章 开始\n内容\n";
		const cache = defaultCache();
		const first = makeCountingParser("/books/s.txt", text, {
			cache,
			stat: async () => ({ size: 100, mtimeMs: 1000 }),
		});
		await first.parser.getChapterList();
		first.parser.dispose();

		const second = makeCountingParser("/books/s.txt", text, {
			cache,
			stat: async () => ({ size: 200, mtimeMs: 1000 }),
		});
		await second.parser.getChapterList();
		assert.strictEqual(second.splitCount(), 1, "size 变化应重建");
		second.parser.dispose();
	});

	test("规则（ruleHash）变化 → 重建", async () => {
		const text = "第一章 开始\n内容A\n第二章 继续\n内容B\n";
		const cache = defaultCache();
		const first = makeCountingParser("/books/r.txt", text, { cache });
		await first.parser.getChapterList();
		first.parser.dispose();

		// 用户改了章节规则（如只匹配"第X章"，不匹配"第X节"）
		const customRegex = () => new RegExp("^第[一二三四五六七八九十\\d]*章.*$", "gm");
		let splits = 0;
		const second = new TxtParser(
			"/books/r.txt",
			async () => new Uint8Array(Buffer.from(text, "utf8")),
			{
				chapterRegex: customRegex,
				cache,
				split: (t, r) => {
					splits++;
					return splitByRegex(t, r);
				},
				stat: async () => ({ size: Buffer.byteLength(text, "utf8"), mtimeMs: 1000 }),
			}
		);
		const chapters = await second.getChapterList();
		assert.strictEqual(splits, 1, "规则变化应重建");
		// 自定义规则下章节标题仍正确（只匹配 第X章）
		const real = chapters.slice(1);
		assert.ok(real.length >= 2 && real.every((c) => c.title.startsWith("第一章") || c.title.startsWith("第二章")));
		second.dispose();
	});

	test("缓存损坏（脏 JSON）→ 安全重建不崩溃", async () => {
		const text = "第一章 开始\n内容A\n";
		const mem = memoryCacheFs();
		const cache = new ChapterIndexCache(mem.fs, "/cache");
		// 先写缓存
		const first = makeCountingParser("/books/c.txt", text, { cache });
		await first.parser.getChapterList();
		first.parser.dispose();
		// 破坏缓存文件（路径含 \\cache\\ 前缀，需按文件名判断）
		mem.list().forEach((f) => {
			if (f.includes("idx-")) mem.get(f)!.fill(0);
		});
		// 重建
		const second = makeCountingParser("/books/c.txt", text, { cache });
		const chapters = await second.parser.getChapterList();
		assert.strictEqual(second.splitCount(), 1, "损坏缓存 → 重建");
		assert.strictEqual(chapters.length, 2);
		second.parser.dispose();
	});
});

suite("TxtParser 无缓存时行为不变（旧路径兼容）", () => {
	test("不注入 cache → 每次实例 1 次 split，功能正常", async () => {
		const text = "第一章 开始\n内容A\n";
		const first = makeCountingParser("/books/nc.txt", text);
		await first.parser.getChapterList();
		assert.strictEqual(first.splitCount(), 1);
		first.parser.dispose();
		const second = makeCountingParser("/books/nc.txt", text);
		const chapters = await second.parser.getChapterList();
		assert.strictEqual(second.splitCount(), 1);
		assert.deepStrictEqual(
			chapters.map((c) => c.title),
			["头部", "第一章 开始"]
		);
		second.parser.dispose();
	});
});

suite("TxtParser 正文懒加载与文件变化检测（P3-03）", () => {
	test("缓存命中 → getChapterContent 前不读全文；文件变化后重新索引", async () => {
		const text = "第一章 开始\n内容A\n第二章 继续\n内容B\n";
		let current = text;
		const cache = defaultCache();
		let statMtime = 1000;
		const first = makeCountingParser("/books/l.txt", text, {
			cache,
			stat: async () => ({ size: Buffer.byteLength(current, "utf8"), mtimeMs: statMtime }),
		});
		await first.parser.getChapterList();
		// 读正文
		const chapters = await first.parser.getChapterList();
		await first.parser.getChapterContent(chapters[1]);
		assert.strictEqual(first.readCount(), 1, "miss 时全文已读，正文复用");
		first.parser.dispose();

		// 新实例命中缓存，然后文件在索引后被修改（readFile 读 current，模拟真实文件变化）
		let reads = 0;
		let splits = 0;
		const reopened = new TxtParser(
			"/books/l.txt",
			async () => {
				reads++;
				return new Uint8Array(Buffer.from(current, "utf8"));
			},
			{
				chapterRegex: regex,
				cache,
				split: (t, r) => {
					splits++;
					return splitByRegex(t, r);
				},
				stat: async () => ({ size: Buffer.byteLength(current, "utf8"), mtimeMs: statMtime }),
			}
		);
		await reopened.getChapterList();
		assert.strictEqual(splits, 0, "命中缓存 0 split");
		assert.strictEqual(reads, 0, "命中缓存 0 读全文");
		// 文件被修改（mtime 变化），随后读正文 → 触发重新索引
		current = "第一章 开始\n内容A2\n第二章 继续\n内容B2\n第三章 新增\n内容C\n";
		statMtime = 2000;
		const content1 = await reopened.getChapterContent(chapters[1]);
		assert.ok(content1.lines.includes("内容A2"), "重新索引后正文为新内容");
		assert.strictEqual(splits, 1, "文件变化后重新 split");
		const chapters3 = await reopened.getChapterList();
		assert.strictEqual(chapters3.length, 4, "重新索引后章节数正确（头部+3章）");
		const content3 = await reopened.getChapterContent(chapters3[3]);
		assert.ok(content3.lines.includes("内容C"), "新增章节可读");
		reopened.dispose();
	});
});

suite("合成数据生成器（P3-04）", () => {
	test("1 MB 生成：大小达标、章节可被默认正则识别", () => {
		const { text, chapterCount } = generateSyntheticTxt(1, 42);
		assert.ok(Buffer.byteLength(text, "utf8") >= 0.9 * 1024 * 1024, "接近 1MB");
		const regex = new RegExp(DEFAULT_CHAPTER_REGEX, "gm");
		const matches = text.match(regex);
		assert.ok(matches && matches.length >= chapterCount - 1, "章节可识别");
	});

	test("10 MB 生成（固定 seed 可复现）", () => {
		const a = generateSyntheticTxt(10, 7);
		const b = generateSyntheticTxt(10, 7);
		assert.strictEqual(a.text, b.text, "固定 seed 复现");
		assert.ok(Buffer.byteLength(a.text, "utf8") >= 9 * 1024 * 1024, "接近 10MB");
		assert.ok(a.chapterCount > 100, "章节数足够");
	});

	test("30 MB 生成器可用（标记 slow，默认只验证大小）", () => {
		const { text, chapterCount } = generateSyntheticTxt(30, 1);
		assert.ok(Buffer.byteLength(text, "utf8") >= 28 * 1024 * 1024, "接近 30MB");
		assert.ok(chapterCount > 300);
	});
});
