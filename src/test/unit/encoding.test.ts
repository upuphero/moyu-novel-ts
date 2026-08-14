/**
 * P0-02 回归护栏：编码识别 characterization 测试。
 * 覆盖 UTF-8 / GBK / BOM 场景（对应开发计划测试矩阵：TXT parser 编码项）。
 */
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import encoding from "../../file/encoding";

const fixtures = path.resolve(__dirname, "../../../src/test/fixtures");
const readBuffer = (name: string) => fs.readFileSync(path.join(fixtures, name));

suite("encoding (encoding/index.ts)", () => {
	test("UTF-8（无 BOM）文本正确解码", () => {
		const s = encoding(readBuffer("utf8-sample.txt"));
		assert.ok(s.includes("第一章 开始"));
		assert.ok(s.includes("这是第一章的内容。"));
	});

	test("UTF-8（带 BOM）文本正确解码且无 BOM 残留", () => {
		const s = encoding(readBuffer("utf8-bom-sample.txt"));
		assert.ok(s.includes("序章"));
		assert.ok(!s.startsWith("\uFEFF"));
	});

	test("GBK（无 BOM）文本正确解码", () => {
		const s = encoding(readBuffer("gbk-sample.txt"));
		assert.ok(s.includes("第一章 开始"));
		assert.ok(s.includes("这是第一章的内容。"));
	});

	test("GBK（带 BOM）文本正确解码且无 BOM 残留", () => {
		const s = encoding(readBuffer("gbk-bom-sample.txt"));
		assert.ok(s.includes("第一章 开始"));
		assert.ok(!s.startsWith("\uFEFF"));
	});

	test("空 buffer 不抛异常", () => {
		const s = encoding(new Uint8Array(0));
		assert.strictEqual(typeof s, "string");
	});
});
