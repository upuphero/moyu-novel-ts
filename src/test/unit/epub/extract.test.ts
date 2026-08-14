/**
 * P4-04：XHTML → 正文块提取测试。
 * h1-h6/p/div/br/li 顺序与文本正确；script/style 跳过；不渲染图片。
 */
import * as assert from "assert";
import { blocksToLines, extractBlocks } from "../../../core/epub/extract";
import { parseXml } from "../../../core/epub/xml";
import { xhtml } from "../../helpers/epubFixtures";

function extract(body: string) {
	return extractBlocks(parseXml(xhtml(body)).root);
}

suite("extract.extractBlocks", () => {
	test("h1 + 多个 p 顺序与文本正确", () => {
		const blocks = extract("<h1>第一章 风起</h1><p>第一段。</p><p>第二段。</p>");
		assert.deepStrictEqual(
			blocks.map((b) => ({ kind: b.kind, text: b.text })),
			[
				{ kind: "heading", text: "第一章 风起" },
				{ kind: "paragraph", text: "第一段。" },
				{ kind: "paragraph", text: "第二段。" },
			]
		);
	});

	test("段落内行内元素（span/em/strong/a）文本合并", () => {
		const blocks = extract("<p>他<em>轻声</em>说：<strong>“站住！”</strong></p>");
		assert.strictEqual(blocks[0].text, "他轻声说：“站住！”");
	});

	test("br 作为段落内换行（文本含 \\n）", () => {
		const blocks = extract("<p>第一行<br/>第二行</p>");
		assert.strictEqual(blocks[0].text, "第一行\n第二行");
	});

	test("div 含块级子元素 → 递归；仅文本 div → 段落", () => {
		const blocks = extract("<div><p>A</p><p>B</p></div><div>直接文本</div>");
		assert.deepStrictEqual(
			blocks.map((b) => b.text),
			["A", "B", "直接文本"]
		);
	});

	test("h2/h3 亦识别为 heading", () => {
		const blocks = extract("<h2>小节</h2><p>内容</p><h3>小小节</h3>");
		assert.deepStrictEqual(
			blocks.map((b) => b.kind),
			["heading", "paragraph", "heading"]
		);
	});

	test("script/style 内容跳过（不执行脚本、不套用 CSS）", () => {
		const blocks = extract('<script>alert("xss")</script><style>p{color:red}</style><p>正文</p>');
		assert.deepStrictEqual(blocks.map((b) => b.text), ["正文"]);
	});

	test("li 列表项作为段落", () => {
		const blocks = extract("<ul><li>一</li><li>二</li></ul>");
		assert.deepStrictEqual(blocks.map((b) => b.text), ["一", "二"]);
	});

	test("img 忽略（alt 作为文本）", () => {
		const blocks = extract('<p>看图：<img src="a.png" alt="插图说明"/></p>');
		assert.strictEqual(blocks[0].text, "看图：插图说明");
	});

	test("空文本块被忽略；body 缺失时用根元素", () => {
		const blocks = extractBlocks(parseXml('<html><head><title>x</title></head></html>').root);
		assert.deepStrictEqual(blocks, []);
	});

	test("blocksToLines 顺序与 blocks 一致", () => {
		const blocks = extract("<h1>标题</h1><p>正文</p>");
		assert.deepStrictEqual(blocksToLines(blocks), ["标题", "正文"]);
	});
});
