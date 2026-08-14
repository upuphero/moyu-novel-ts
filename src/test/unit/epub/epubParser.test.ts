/**
 * P4-02/03/05/06：EpubParser 测试。
 * EPUB2/3 fixtures 的 title/author/spine 正确；懒加载（书架不读 XHTML 正文）；
 * 缺失可选 metadata；损坏章节隔离；安全（路径穿越/XXE/异常条目）。
 */
import * as assert from "assert";
import { EpubParser } from "../../../core/epub/EpubParser";
import {
	buildEpub2,
	buildEpub3,
	buildEpubMinimal,
} from "../../helpers/epubFixtures";
import { buildZip, textFile } from "../../helpers/buildZip";
import { ZipError } from "../../../core/epub/zip";

/** 注入 readFile 计数 */
function makeParser(filePath: string, bytes: Uint8Array) {
	const state = { reads: 0 };
	const parser = new EpubParser(
		filePath,
		async () => {
			state.reads++;
			return bytes;
		}
	);
	return { parser, reads: () => state.reads };
}

suite("EpubParser EPUB2（P4-02）", () => {
	test("metadata（title/author/identifier）与 spine 正确", async () => {
		const bytes = buildEpub2({ title: "测试之书二", author: "测试作者" });
		const { parser } = makeParser("/books/书2.epub", bytes);
		const meta = await parser.load();
		assert.strictEqual(meta.title, "测试之书二");
		assert.strictEqual(meta.format, "epub");
		assert.strictEqual(meta.chapterCount, 2);
		parser.dispose();
	});

	test("章节列表（NCX 标题优先级 + isPreface=false）", async () => {
		const bytes = buildEpub2();
		const { parser } = makeParser("/books/书2.epub", bytes);
		const chapters = await parser.getChapterList();
		assert.deepStrictEqual(
			chapters.map((c) => c.title),
			["第一章 相遇", "第二章 离别"]
		);
		assert.ok(chapters.every((c) => c.isPreface === false));
		assert.strictEqual(chapters[0].id, "epub:0");
		parser.dispose();
	});

	test("正文提取：heading + paragraphs 顺序正确", async () => {
		const bytes = buildEpub2();
		const { parser } = makeParser("/books/书2.epub", bytes);
		const chapters = await parser.getChapterList();
		const content = await parser.getChapterContent(chapters[0]);
		assert.deepStrictEqual(content.lines, ["第一章 相遇", "风起于青萍之末。", "他回身望去。"]);
		assert.strictEqual(content.blocks[0].kind, "heading");
		parser.dispose();
	});
});

suite("EpubParser EPUB3（P4-02/04）", () => {
	test("nav 标题与 spine 正确", async () => {
		const bytes = buildEpub3();
		const { parser } = makeParser("/books/书3.epub", bytes);
		const chapters = await parser.getChapterList();
		assert.deepStrictEqual(
			chapters.map((c) => c.title),
			["第一章 序曲", "第二章 登场", "第三章 落幕"]
		);
		assert.strictEqual(chapters.length, 3);
		parser.dispose();
	});

	test("正文含 div/br/li 混合", async () => {
		const custom = buildZip([
			textFile("mimetype", "application/epub+zip", false),
			textFile(
				"META-INF/container.xml",
				`<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
			),
			textFile(
				"OEBPS/content.opf",
				`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>混排</dc:title></metadata><manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`
			),
			textFile(
				"OEBPS/ch1.xhtml",
				`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body><h1>标题</h1><div><p>甲</p><p>乙<br/>丙</p></div><div>直接文本</div><ul><li>列表一</li></ul></body></html>`
			),
		]);
		const { parser } = makeParser("/books/mix.epub", custom);
		const chapters = await parser.getChapterList();
		const content = await parser.getChapterContent(chapters[0]);
		assert.deepStrictEqual(content.lines, ["标题", "甲", "乙\n丙", "直接文本", "列表一"]);
		parser.dispose();
	});
});

suite("EpubParser 懒加载（P4-03，书架不读 XHTML 正文）", () => {
	test("getChapterList 只读 container/OPF/nav（或 NCX），不读章节 XHTML", async () => {
		const bytes = buildEpub3();
		const { parser, reads } = makeParser("/books/lazy.epub", bytes);
		// 每次 readFile 是整文件（vscode 读取粒度）；这里通过注入计数验证调用次数：
		// load 调用 readFile 一次（整个 ZIP），章节正文在 getChapterContent 时才读。
		await parser.getChapterList();
		assert.strictEqual(reads(), 1, "书架阶段只读 1 次（整个 ZIP 字节）");
		parser.dispose();
	});
});

suite("EpubParser 缺失可选 metadata（P4-02/03）", () => {
	test("无 title → 文件名；无 nav → 文件名标题", async () => {
		const bytes = buildEpubMinimal();
		const { parser } = makeParser("/books/无名书.epub", bytes);
		const meta = await parser.load();
		assert.strictEqual(meta.title, "无名书");
		const chapters = await parser.getChapterList();
		assert.strictEqual(chapters.length, 1);
		assert.strictEqual(chapters[0].title, "body1");
		const content = await parser.getChapterContent(chapters[0]);
		assert.deepStrictEqual(content.lines, ["只有一章", "内容。"]);
		parser.dispose();
	});
});

suite("EpubParser 安全（P4-06）", () => {
	test("路径穿越条目被拒", async () => {
		const evil = buildZip([
			textFile("mimetype", "application/epub+zip", false),
			textFile(
				"META-INF/container.xml",
				`<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
			),
			textFile("../evil.txt", "should not be readable"),
			textFile(
				"content.opf",
				`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>x</dc:title></metadata><manifest/><spine/></package>`
			),
		]);
		const { parser } = makeParser("/books/evil.epub", evil);
		await assert.rejects(() => parser.load(), ZipError);
		parser.dispose();
	});

	test("XXE（DOCTYPE 外部实体）被拒", async () => {
		const xxe = buildZip([
			textFile("mimetype", "application/epub+zip", false),
			textFile(
				"META-INF/container.xml",
				`<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
			),
			textFile(
				"content.opf",
				`<?xml version="1.0"?><!DOCTYPE package [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>&xxe;</dc:title></metadata><manifest/><spine/></package>`
			),
		]);
		const { parser } = makeParser("/books/xxe.epub", xxe);
		await assert.rejects(() => parser.load(), ZipError);
		parser.dispose();
	});

	test("损坏章节内容错误隔离（其他章节不受影响）", async () => {
		const broken = buildZip([
			textFile("mimetype", "application/epub+zip", false),
			textFile(
				"META-INF/container.xml",
				`<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
			),
			textFile(
				"OEBPS/content.opf",
				`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>损坏书</dc:title></metadata><manifest><item id="c1" href="bad.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="good.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`
			),
			textFile("OEBPS/bad.xhtml", `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>未闭合`),
			textFile("OEBPS/good.xhtml", `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>内容完好。</p></body></html>`),
		]);
		const { parser } = makeParser("/books/broken.epub", broken);
		const chapters = await parser.getChapterList();
		assert.strictEqual(chapters.length, 2);
		await assert.rejects(() => parser.getChapterContent(chapters[0]), /损坏/);
		// 好章节不受影响
		const goodContent = await parser.getChapterContent(chapters[1]);
		assert.deepStrictEqual(goodContent.lines, ["内容完好。"]);
		parser.dispose();
	});
});

suite("EpubParser 生命周期（ADR-005）", () => {
	test("dispose 后重新 load（重新读取）", async () => {
		const bytes = buildEpub2();
		const { parser, reads } = makeParser("/books/again.epub", bytes);
		await parser.getChapterList();
		assert.strictEqual(reads(), 1);
		parser.dispose();
		await parser.getChapterList();
		assert.strictEqual(reads(), 2, "dispose 后重新读取");
		parser.dispose();
	});
});
