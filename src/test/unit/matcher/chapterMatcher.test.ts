/**
 * P7-01/02：章节标题 matcher pipeline 测试。
 * - 17 种正例全部识别（P7 gate）；5+ 正文/对话反例不识别；
 * - 每个 matcher 可单独测试；
 * - 30 MB 合成数据无灾难性回溯（P7 gate）。
 */
import * as assert from "assert";
import {
	CHAPTER_MATCHER_VERSION,
	chapterMatchers,
	matchChapterTitle,
} from "../../../core/matcher/chapterMatcher";
import { generateSyntheticTxt } from "../../helpers/syntheticTxt";

suite("matchChapterTitle 正例（P7-02，17 种）", () => {
	const positives: [string, string][] = [
		// 1-5：第X章 中文/阿拉伯/大写数字、纯章名、无空格
		["第一章 风起", "cn-chapter"],
		["第二章", "cn-chapter"],
		["第100章 终章", "cn-chapter"],
		["第壹章 开端", "cn-chapter"],
		["第三章风起", "cn-chapter"],
		// 6-9：卷/部/篇/集
		["第一卷 风云", "cn-volume"],
		["第2部 崛起", "cn-volume"],
		["第三篇 谋略", "cn-volume"],
		["第4集 试播", "cn-volume"],
		// 10：节
		["第一节 相遇", "cn-section"],
		// 11-15：序/尾/后记/番外/大结局
		["序章", "special"],
		["尾声", "special"],
		["后记", "special"],
		["番外 婚礼", "special"],
		["大结局", "special"],
		// 16-17：英文 Chapter
		["Chapter 1", "english"],
		["CHAPTER 12: The End", "english"],
	];

	for (const [line, matcherId] of positives) {
		test(`正例: "${line}" → ${matcherId}`, () => {
			const title = matchChapterTitle(line);
			assert.strictEqual(title, line, `应识别 ${line}`);
			const matcher = chapterMatchers.find((m) => m.id === matcherId);
			assert.ok(matcher, `matcher ${matcherId} 存在`);
			assert.strictEqual(matcher!.match(line), line);
		});
	}

	test("额外变体：楔子/前言/引子/外传/番外篇/终章（special 家族）", () => {
		for (const line of ["楔子", "前言", "引子", "外传", "番外篇 缘起", "终章 尘埃落定"]) {
			assert.strictEqual(matchChapterTitle(line), line, `应识别 ${line}`);
		}
	});
});

suite("matchChapterTitle 反例（P7 gate：正文/对话不识别）", () => {
	const negatives = [
		"他说：“第一章讲完了。”", // 对话引用
		"我们讨论到第三章就结束了", // 章词在行中
		"（第一章完）", // 括号注释
		"第二章的内容。", // P0 已知缺陷修复：正文误判（"的"紧跟）
		"第一节，我们先说结论。", // 节 + 逗号紧接（正文）
		"第一卷的内容。", // 卷 + "的"（正文）
		"看 Chapter 1 的内容", // 英文行中
		"", // 空行
		"   ", // 纯空白
		"他推门进来，说：第 3 章的内容还没写完。", // 空格插入
	];

	for (const line of negatives) {
		test(`反例不识别: "${line}"`, () => {
			assert.strictEqual(matchChapterTitle(line), null, `不应识别 ${line}`);
		});
	}
});

suite("chapterMatchers 可单独测试（P7-01）", () => {
	test("cn-chapter 排除‘的’紧跟的正文形态", () => {
		const matcher = chapterMatchers.find((m) => m.id === "cn-chapter")!;
		assert.strictEqual(matcher.match("第一章 风起"), "第一章 风起");
		assert.strictEqual(matcher.match("第二章的内容。"), null);
		assert.strictEqual(matcher.match("第一章完"), "第一章完", "无标点短标题");
	});

	test("cn-volume/cn-section 要求空格分隔或纯名", () => {
		const vol = chapterMatchers.find((m) => m.id === "cn-volume")!;
		assert.strictEqual(vol.match("第一卷 风云"), "第一卷 风云");
		assert.strictEqual(vol.match("第一卷"), "第一卷");
		assert.strictEqual(vol.match("第一卷的内容。"), null);
		const sec = chapterMatchers.find((m) => m.id === "cn-section")!;
		assert.strictEqual(sec.match("第一节 相遇"), "第一节 相遇");
		assert.strictEqual(sec.match("第一节"), "第一节");
		assert.strictEqual(sec.match("第一节，我们先说结论。"), null);
	});

	test("english 支持大小写与标题后缀", () => {
		const matcher = chapterMatchers.find((m) => m.id === "english")!;
		assert.strictEqual(matcher.match("Chapter 1"), "Chapter 1");
		assert.strictEqual(matcher.match("CHAPTER 12: The End"), "CHAPTER 12: The End");
		assert.strictEqual(matcher.match("Chapter1"), null, "无空格不识别");
		assert.strictEqual(matcher.match("Chapter 1 风起"), "Chapter 1 风起");
	});

	test("行首锚定（行中章词不识别）", () => {
		assert.strictEqual(matchChapterTitle("我们在第三章相遇"), null);
		assert.strictEqual(matchChapterTitle("（番外）"), null);
	});
});

suite("P7 gate：30 MB 合成数据无灾难性回溯", () => {
	test("30MB 逐行扫描完成且章节命中合理", () => {
		const { text, chapterCount } = generateSyntheticTxt(30);
		assert.ok(
			Buffer.byteLength(text, "utf8") > 25 * 1024 * 1024,
			"生成器应产出 ~30MB（字节）"
		);
		const lines = text.split("\n");
		const start = Date.now();
		let hits = 0;
		for (const raw of lines) {
			const line = raw.replace(/\r$/, "").trim();
			if (matchChapterTitle(line) !== null) hits++;
		}
		const elapsed = Date.now() - start;
		// 记录机器与耗时（benchmark 趋势指标；宽松阈值防 CI 抖动）
		console.log(`30MB matcher 扫描耗时: ${elapsed}ms, 行数: ${lines.length}, 命中: ${hits}`);
		assert.ok(elapsed < 10000, `30MB 扫描 ${elapsed}ms 超阈值（灾难性回溯风险）`);
		assert.ok(hits >= chapterCount - 10, `应命中约 ${chapterCount} 个章节标题（实际 ${hits}）`);
	});
});

suite("CHAPTER_MATCHER_VERSION", () => {
	test("版本为正整数（P7-04 缓存联动依据）", () => {
		assert.ok(Number.isInteger(CHAPTER_MATCHER_VERSION) && CHAPTER_MATCHER_VERSION >= 1);
	});
});
