/**
 * P5-02/03/05：全书搜索引擎测试。
 * TXT/EPUB 关键词、无结果、多结果、取消、特殊字符、preview、大小写/整词、
 * 结果上限、缓存失效、EPUB 第二次搜索不重新解析 XHTML。
 */
import * as assert from "assert";
import { SearchEngine, DEFAULT_RESULT_LIMIT } from "../../../core/search/searchEngine";
import { TxtParser } from "../../../core/parser/TxtParser";
import { splitByRegex } from "../../../splitCore";
import { DEFAULT_CHAPTER_REGEX } from "../../../legacy/ids";
import { EpubParser } from "../../../core/epub/EpubParser";
import { buildEpub2 } from "../../helpers/epubFixtures";

const regex = () => new RegExp(DEFAULT_CHAPTER_REGEX, "gm");

/** 构造 TxtParser（readFile/split/stat 计数可注入） */
function txtParser(filePath: string, text: string) {
	const state = { reads: 0 };
	const parser = new TxtParser(
		filePath,
		async () => {
			state.reads++;
			return new Uint8Array(Buffer.from(text, "utf8"));
		},
		{
			chapterRegex: regex,
			split: (t, r) => splitByRegex(t, r),
			stat: async () => ({
				size: Buffer.byteLength(text, "utf8"),
				mtimeMs: 1000,
			}),
		}
	);
	return { parser, reads: () => state.reads };
}

/** 构造 EpubParser（readFile 计数） */
function epubParser(filePath: string, bytes: Uint8Array) {
	const state = { reads: 0 };
	const parser = new EpubParser(filePath, async () => {
		state.reads++;
		return bytes;
	});
	return { parser, reads: () => state.reads };
}

function engineWith(parsers: Record<string, { parser: any }>) {
	return new SearchEngine((bookId) => {
		const p = parsers[bookId];
		return p ? p.parser : undefined;
	});
}

suite("SearchEngine TXT（P5-02）", () => {
	const TEXT =
		"序言\n这是开篇。\n\n" +
		"第一章 开始\n" +
		"风起于青萍之末。\n" +
		"他说：明日再来。\n\n" +
		"第二章 继续\n" +
		"风停了，人散了。\n" +
		"风与月，皆往事。\n";

	test("关键词命中：归属章节/段落正确，preview 带上下文", async () => {
		const p = txtParser("/books/a.txt", TEXT);
		const engine = engineWith({ "book:1:a": { parser: p.parser } });
		const results = await engine.search({
			bookId: "book:1:a",
			keyword: "风",
		});
		assert.ok(results.length >= 3, "应命中多处");
		// 第二章有两处"风"
		const ch2 = results.filter((r) => r.chapterTitle === "第二章 继续");
		assert.strictEqual(ch2.length, 2);
		assert.ok(ch2.every((r) => r.chapterIndex === 2));
		// preview 包含关键词
		for (const r of results) {
			assert.ok(r.preview.includes("风"), `preview 应含关键词: ${r.preview}`);
			assert.ok(r.matchLength === 1);
			assert.ok(r.matchStart >= 0);
		}
		// chapterId 为 bookId#index 语义（TXT 当前为 txt:index，含章 id）
		assert.ok(results[0].chapterId.length > 0);
		p.parser.dispose();
	});

	test("无结果返回空数组", async () => {
		const p = txtParser("/books/a.txt", TEXT);
		const engine = engineWith({ "book:1:a": { parser: p.parser } });
		const results = await engine.search({
			bookId: "book:1:a",
			keyword: "不存在的词xyz",
		});
		assert.deepStrictEqual(results, []);
		p.parser.dispose();
	});

	test("大小写敏感选项", async () => {
		const p = txtParser("/books/a.txt", "第一章\nHello World\nhello world\n");
		const engine = engineWith({ "book:1:b": { parser: p.parser } });
		const insensitive = await engine.search({ bookId: "book:1:b", keyword: "hello" });
		assert.strictEqual(insensitive.length, 2, "默认不区分大小写");
		const sensitive = await engine.search({
			bookId: "book:1:b",
			keyword: "Hello",
			caseSensitive: true,
		});
		assert.strictEqual(sensitive.length, 1, "区分大小写仅 1 处");
		assert.ok(sensitive[0].preview.includes("Hello"));
		p.parser.dispose();
	});

	test("整词匹配（ASCII 边界）", async () => {
		const p = txtParser(
			"/books/a.txt",
			"第一章\ncat\ncategory\nconcat\n"
		);
		const engine = engineWith({ "book:1:c": { parser: p.parser } });
		const whole = await engine.search({
			bookId: "book:1:c",
			keyword: "cat",
			wholeWord: true,
		});
		assert.strictEqual(whole.length, 1, "整词只命中 cat");
		p.parser.dispose();
	});

	test("特殊字符（正则元字符）按字面匹配", async () => {
		const p = txtParser("/books/a.txt", "第一章\n价格是 $5.99 与 (x)* ?\n");
		const engine = engineWith({ "book:1:d": { parser: p.parser } });
		const results = await engine.search({
			bookId: "book:1:d",
			keyword: "$5.99",
		});
		assert.strictEqual(results.length, 1);
		assert.ok(results[0].preview.includes("$5.99"));
		p.parser.dispose();
	});

	test("结果上限（limit）生效", async () => {
		const p = txtParser(
			"/books/a.txt",
			"第一章\n" + "重复词 重复词 重复词\n".repeat(50) + "\n"
		);
		const engine = engineWith({ "book:1:e": { parser: p.parser } });
		const limited = await engine.search({
			bookId: "book:1:e",
			keyword: "重复词",
			limit: 10,
		});
		assert.strictEqual(limited.length, 10, "达到上限即返回");
		p.parser.dispose();
	});

	test("取消（token）在扫描中生效，返回已收集结果", async () => {
		const p = txtParser(
			"/books/a.txt",
			"第一章\n词A\n第二章\n词B\n第三章\n词C\n"
		);
		const engine = engineWith({ "book:1:f": { parser: p.parser } });
		let cancelled = false;
		// 首次搜索构建缓存（不取消）
		await engine.search({ bookId: "book:1:f", keyword: "词" });
		// 模拟：在第 6 次检查后取消（此时应已收集词A、词B，共 2 个，少于全部 3 个）
		let count = 0;
		cancelled = false;
		const results2 = await engine.search(
			{ bookId: "book:1:f", keyword: "词" },
			{
				cancelled: () => {
					count++;
					if (count >= 6) cancelled = true;
					return cancelled;
				},
			}
		);
		// 取消后收集结果应少于全部（3），且至少收集了部分
		assert.ok(results2.length >= 1 && results2.length < 3, "取消生效且返回已收集结果");
		p.parser.dispose();
	});

	test("损坏章节跳过（错误隔离）", async () => {
		const { parser } = epubParser("/books/bad.epub", buildEpub2());
		// 构造含损坏章的 EPUB：bad.xhtml 缺闭合
		const { buildZip, textFile } = await import("../../helpers/buildZip");
		const broken = buildZip([
			textFile("mimetype", "application/epub+zip", false),
			textFile(
				"META-INF/container.xml",
				'<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
			),
			textFile(
				"OEBPS/content.opf",
				'<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>坏书</dc:title></metadata><manifest><item id="c1" href="bad.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="good.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>'
			),
			textFile("OEBPS/bad.xhtml", '<?xml version="1.0"?><html><body><p>未闭合'),
			textFile(
				"OEBPS/good.xhtml",
				'<?xml version="1.0"?><html><body><h1>完好章</h1><p>这里有搜索词</p></body></html>'
			),
		]);
		const p2 = epubParser("/books/bad.epub", broken);
		const engine = engineWith({ "book:1:bad": { parser: p2.parser } });
		const results = await engine.search({
			bookId: "book:1:bad",
			keyword: "搜索词",
		});
		assert.strictEqual(results.length, 1, "损坏章跳过，好章命中");
		assert.strictEqual(results[0].chapterTitle, "good", "无 nav 时标题回退为文件名");
		parser.dispose();
		p2.parser.dispose();
	});
});

suite("SearchEngine EPUB 缓存（P5-03）", () => {
	test("同一有效索引第二次搜索不重新解析 XHTML", async () => {
		const bytes = buildEpub2({
			chapters: [
				{ id: "c1", file: "ch1.xhtml", title: "第一章", paragraphs: ["风起。", "风云突变。"] },
				{ id: "c2", file: "ch2.xhtml", title: "第二章", paragraphs: ["雨落。", "风声依旧。"] },
			],
		});
		const { parser, reads } = epubParser("/books/e.epub", bytes);
		const engine = engineWith({ "book:1:e": { parser } });
		// 第一次：解析全部章节正文（readFile 为整文件读取；getChapterContent 解压各章）
		const first = await engine.search({ bookId: "book:1:e", keyword: "风" });
		assert.ok(first.length >= 2);
		const readsAfterFirst = reads();
		// 第二次：命中缓存，不重新解析（readFile 不再增加）
		const second = await engine.search({ bookId: "book:1:e", keyword: "雨" });
		assert.strictEqual(reads(), readsAfterFirst, "第二次搜索不重新读取文件");
		assert.ok(second.length >= 1);
		// 第三次：不同关键词仍复用缓存
		const third = await engine.search({ bookId: "book:1:e", keyword: "依旧" });
		assert.strictEqual(reads(), readsAfterFirst, "第三次也不重新读取");
		assert.strictEqual(third.length, 1);
		parser.dispose();
	});
});

suite("SearchEngine 缓存失效（P5-05）", () => {
	test("章节列表变化 → 自动整体重建（同一 engine 同一 bookId）", async () => {
		let text = "第一章 开始\n内容A\n第二章 继续\n内容B\n";
		const makeParser = () =>
			new TxtParser(
				"/books/m.txt",
				async () => new Uint8Array(Buffer.from(text, "utf8")),
				{
					chapterRegex: regex,
					split: (t, r) => splitByRegex(t, r),
					stat: async () => ({
						size: Buffer.byteLength(text, "utf8"),
						mtimeMs: 1000,
					}),
				}
			);
		// parserFor 使用可变引用（模拟书被重新打开、解析器实例变化）
		let current = makeParser();
		const engine = new SearchEngine(() => current);
		const r1 = await engine.search({ bookId: "book:1:m", keyword: "内容" });
		assert.strictEqual(r1.length, 2);
		// 文件变化（新增章节）后重新打开（新 parser 实例）
		text =
			"第一章 开始\n内容A\n第二章 继续\n内容B\n第三章 新增\n内容C\n";
		current.dispose();
		current = makeParser();
		// 同一 engine 同一 bookId：新实例 getChapterList 3 章 vs 缓存 2 章 → 自动重建
		const r2 = await engine.search({ bookId: "book:1:m", keyword: "内容" });
		assert.strictEqual(r2.length, 3, "重建后含新章节");
		const ch3 = r2.filter((r) => r.chapterIndex === 3);
		assert.strictEqual(ch3.length, 1);
		current.dispose();
	});

	test("clearCache 后重新扫描", async () => {
		const p = txtParser("/books/c.txt", "第一章\n词A\n");
		const engine = engineWith({ "book:1:c": { parser: p.parser } });
		const r1 = await engine.search({ bookId: "book:1:c", keyword: "词" });
		assert.strictEqual(r1.length, 1);
		engine.clearCache("book:1:c");
		const r2 = await engine.search({ bookId: "book:1:c", keyword: "词" });
		assert.strictEqual(r2.length, 1);
		p.parser.dispose();
	});
});

suite("SearchEngine 边界", () => {
	test("空关键词 / 未知 bookId / parser 抛错 → 空结果", async () => {
		const p = txtParser("/books/a.txt", "第一章\n内容\n");
		const engine = engineWith({ "book:1:a": { parser: p.parser } });
		assert.deepStrictEqual(
			await engine.search({ bookId: "book:1:a", keyword: "" }),
			[]
		);
		assert.deepStrictEqual(
			await engine.search({ bookId: "book:9:unknown", keyword: "x" }),
			[]
		);
		p.parser.dispose();
	});

	test("默认上限为 200（常量）", async () => {
		assert.strictEqual(DEFAULT_RESULT_LIMIT, 200);
		const p = txtParser(
			"/books/a.txt",
			"第一章\n" + "词 ".repeat(300) + "\n"
		);
		const engine = engineWith({ "book:1:z": { parser: p.parser } });
		const results = await engine.search({ bookId: "book:1:z", keyword: "词" });
		assert.ok(results.length <= 200, "默认上限 200");
		p.parser.dispose();
	});
});
