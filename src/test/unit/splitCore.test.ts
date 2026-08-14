/**
 * P0-02 回归护栏：分章逻辑 characterization 测试。
 * 锁定旧 split() 的可观察行为，防止后续重构（Phase 1 Parser）回归。
 */
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
	ChapterInfo,
	compileChapterRegex,
	getChapterTitle,
	splitByRegex,
} from "../../splitCore";

const fixtures = path.resolve(__dirname, "../../../src/test/fixtures");
const read = (name: string) => fs.readFileSync(path.join(fixtures, name), "utf8");

// 与 package.json novelLook.match.chapterName default 一致
const DEFAULT_CHAPTER_REGEX =
	"^(?:[ \\t\\r\\f\\v]*)(第[一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟万零〇\\d]*[篇节部卷][ \\t\\r\\f\\v]*.*[ \\t\\r\\f\\v]*)?第[一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟万零〇\\d]*章[^\\n\\r]*$";

const regex = () => new RegExp(DEFAULT_CHAPTER_REGEX, "gm");

suite("splitCore.splitByRegex", () => {
	test("基本分章：头部 + 章节顺序/下标/txtIndex/size 正确", () => {
		const text = read("utf8-sample.txt");
		const arr = splitByRegex(text, regex());
		// 头部 + 3 章
		assert.strictEqual(arr.length, 4);
		assert.strictEqual(arr[0].s, "头部");
		assert.strictEqual(arr[0].i, 0);
		assert.strictEqual(arr[0].txtIndex, -2);
		// 第一章从"第一章 开始"开始
		assert.strictEqual(arr[1].s, "第一章 开始");
		assert.strictEqual(arr[1].i, 1);
		assert.strictEqual(arr[1].txtIndex, text.indexOf("第一章 开始"));
		// 头部 size = 第一章起点 - 头部起点(-2)
		assert.strictEqual(arr[0].size, arr[1].txtIndex + 2);
		// 最后一章 size 延伸到结尾
		assert.strictEqual(arr[3].size, text.length - arr[3].txtIndex);
		// 章节按全文顺序排列
		for (let i = 1; i < arr.length; i++) {
			assert.ok(arr[i].txtIndex > arr[i - 1].txtIndex);
		}
	});

	test("连续重复章名：只保留第一个且不占用下标（旧行为锁定）", () => {
		const text = read("repeat-chapter.txt");
		const arr = splitByRegex(text, regex());
		// 头部 + 第一章 + 第二章 = 3 项；完全相同的"第一章 测试"被跳过
		assert.strictEqual(arr.length, 3);
		assert.strictEqual(arr[1].s, "第一章 测试");
		assert.strictEqual(arr[1].i, 1);
		assert.strictEqual(arr[2].s, "第二章 继续");
		assert.strictEqual(arr[2].i, 2);
		// 第一章 size 覆盖到第二章起点（含被跳过的重复标题文本）
		assert.strictEqual(arr[1].size, arr[2].txtIndex - arr[1].txtIndex);
	});

	test("characterization: 不同章号但标题主干相同会被吞（旧去重缺陷，Phase 7 修复）", () => {
		const text = "第一章 测试\n内容A\n第二章 测试\n内容B\n";
		const arr = splitByRegex(text, regex());
		// 旧实现按"去掉第X章后的主干"比较，"测试"=== "测试"，第二章被跳过
		assert.strictEqual(arr.length, 2);
		assert.strictEqual(arr[1].s, "第一章 测试");
	});

	test("characterization: 默认正则对'第X章+后缀'正文行会误判（旧缺陷，Phase 7 修复）", () => {
		const text = "第一章 开始\n这是第一章的内容。\n第二章的内容。\n";
		const arr = splitByRegex(text, regex());
		// "第二章的内容。"以"第"开头且含"章"，被误判为章节标题
		assert.strictEqual(arr.length, 3);
		assert.strictEqual(arr[2].s, "第二章的内容。");
	});

	test("无章节文件：仅头部，size 为全文长度", () => {
		const text = read("no-chapter.txt");
		const arr = splitByRegex(text, regex());
		assert.strictEqual(arr.length, 1);
		assert.strictEqual(arr[0].s, "头部");
		assert.strictEqual(arr[0].txtIndex, -2);
		assert.strictEqual(arr[0].size, text.length);
	});

	test("中文数字章节：第一百二十三章/第十二章/第九章 均识别", () => {
		const text = read("chinese-number-chapters.txt");
		const arr = splitByRegex(text, regex());
		assert.strictEqual(arr.length, 4);
		assert.strictEqual(arr[1].s, "第一百二十三章 数字");
		assert.strictEqual(arr[2].s, "第十二章 十二章");
		assert.strictEqual(arr[3].s, "第九章 九章");
	});

	test("自定义正则生效（参数化）", () => {
		const text = "第一节 甲\n内容A\n第二节 乙\n内容B\n";
		const arr = splitByRegex(text, new RegExp("^第[一二三四五六七八九十\\d]*节.*$", "gm"));
		assert.strictEqual(arr.length, 3);
		assert.strictEqual(arr[1].s, "第一节 甲");
		assert.strictEqual(arr[2].s, "第二节 乙");
	});

	test("头部 size 覆盖到第一章起点；空文本只有头部", () => {
		const arr = splitByRegex("", regex());
		assert.strictEqual(arr.length, 1);
		assert.strictEqual(arr[0].size, 0);
	});
});

suite("splitCore.getChapterTitle", () => {
	test("去掉'第X章'主干并压缩空格", () => {
		assert.strictEqual(getChapterTitle("第一章 开始"), "开始");
		assert.strictEqual(getChapterTitle("第1章 测试"), "测试");
	});
	test("无'第X章'时原样返回", () => {
		assert.strictEqual(getChapterTitle("头部"), "头部");
		assert.strictEqual(getChapterTitle("正文内容"), "正文内容");
	});
});

suite("splitCore.compileChapterRegex", () => {
	test("合法模式返回 RegExp", () => {
		const r = compileChapterRegex("^第.*章$");
		assert.ok(r instanceof RegExp);
	});
	test("非法模式返回 null", () => {
		assert.strictEqual(compileChapterRegex("[不合法"), null);
	});
	test("空模式返回 null", () => {
		assert.strictEqual(compileChapterRegex(""), null);
	});
});

suite("splitByRegex 类型形状（characterization）", () => {
	test("章节对象仅含 s/i/txtIndex/size 字段", () => {
		const text = read("utf8-sample.txt");
		const arr: ChapterInfo[] = splitByRegex(text, regex());
		const keys = Object.keys(arr[1]).sort();
		assert.deepStrictEqual(keys, ["i", "s", "size", "txtIndex"]);
	});
});
