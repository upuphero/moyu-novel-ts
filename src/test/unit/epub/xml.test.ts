/**
 * P4-04/P4-06：最小 XML 解析器测试。
 * 元素/属性/文本/实体/CDATA/注释/声明；DOCTYPE 拒绝（XXE）；未知实体保留；错误隔离。
 */
import * as assert from "assert";
import {
	XmlParseError,
	childElements,
	firstChild,
	parseXml,
	textContent,
} from "../../../core/epub/xml";

suite("xml.parseXml 基础", () => {
	test("元素、属性、文本、自闭合", () => {
		const doc = parseXml('<root a="1" b=\'2\'><child>x</child><empty/></root>');
		assert.strictEqual(doc.root.name, "root");
		assert.strictEqual(doc.root.attrs["a"], "1");
		assert.strictEqual(doc.root.attrs["b"], "2");
		const children = childElements(doc.root, "child");
		assert.strictEqual(children.length, 1);
		assert.strictEqual(textContent(children[0]), "x");
	});

	test("XML 声明与注释被忽略", () => {
		const doc = parseXml('<?xml version="1.0"?><!-- comment --><a><!-- inner --><b>t</b></a>');
		assert.strictEqual(doc.root.name, "a");
		assert.strictEqual(textContent(doc.root), "t");
	});

	test("CDATA 内容原样", () => {
		const doc = parseXml("<a><![CDATA[<b>& 原始内容]]></a>");
		assert.strictEqual(textContent(doc.root), "<b>& 原始内容");
	});

	test("预定义实体解码", () => {
		const doc = parseXml('<a>&lt;&gt;&amp;&quot;&apos;</a>');
		assert.strictEqual(textContent(doc.root), '<>&"\'');
	});

	test("数字实体解码（十进制与十六进制）", () => {
		const doc = parseXml("<a>&#20320;&#x597D;</a>");
		assert.strictEqual(textContent(doc.root), "你好");
	});

	test("未知实体原样保留（容错 nbsp）", () => {
		const doc = parseXml("<a>a&nbsp;b</a>");
		assert.strictEqual(textContent(doc.root), "a&nbsp;b");
	});

	test("命名空间前缀保留（dc:title）", () => {
		const doc = parseXml('<package xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>书</dc:title></package>');
		const title = firstChild(doc.root, "title");
		assert.ok(title);
		assert.strictEqual(title!.name, "dc:title");
		assert.strictEqual(textContent(title!), "书");
	});
});

suite("xml 安全（P4-06 XXE 防护）", () => {
	test("简单 DOCTYPE（如 <!DOCTYPE html>）允许（EPUB 兼容）", () => {
		const doc = parseXml('<!DOCTYPE html><html><body><p>正文</p></body></html>');
		assert.strictEqual(doc.root.name, "html");
	});

	test("DOCTYPE 含内部子集/外部引用（XXE）一律拒绝", () => {
		assert.throws(() => parseXml('<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>'), XmlParseError);
		assert.throws(() => parseXml('<!DOCTYPE foo SYSTEM "http://evil.example/x.dtd"><foo/>'), XmlParseError);
		assert.throws(() => parseXml('<!DOCTYPE foo PUBLIC "-//X" "x.dtd"><foo/>'), XmlParseError);
	});

	test("不支持的声明拒绝", () => {
		assert.throws(() => parseXml("<!ENTITY x 'y'><a/>"), XmlParseError);
	});
});

suite("xml 错误隔离", () => {
	test("标签不匹配/未闭合 → XmlParseError", () => {
		assert.throws(() => parseXml("<a><b></a>"), XmlParseError);
		assert.throws(() => parseXml("<a>"), XmlParseError);
		assert.throws(() => parseXml(""), XmlParseError);
	});

	test("多个根元素 → 报错", () => {
		assert.throws(() => parseXml("<a/><b/>"), XmlParseError);
	});
});

suite("xml 便捷函数", () => {
	test("childElements / firstChild / textContent", () => {
		const doc = parseXml("<root><item id='1'><text>A</text></item><item id='2'/></root>");
		const items = childElements(doc.root, "item");
		assert.strictEqual(items.length, 2);
		assert.strictEqual(firstChild(doc.root, "item")!.attrs["id"], "1");
		assert.strictEqual(textContent(items[0]), "A");
	});
});
