/**
 * P0-07 回归护栏：legacy 兼容常量与状态 key 生成测试。
 * 保证 state shape（book_<label> / lastOpenChapter / isShowReadChapter / saveScroll）
 * 与集中常量一致，防止散落字符串与意外改名。
 */
import * as assert from "assert";
import {
	ACTIVITY_CONTAINER_ID,
	Command,
	COMMAND_PREFIX,
	CONFIG_PREFIX,
	DEFAULT_CHAPTER_REGEX,
	DEFAULT_NOVEL_NAME_REGEX,
	DISPLAY_NAME,
	EXTENSION_NAME,
	IS_SHOW_READ_CHAPTER_KEY,
	LAST_OPEN_CHAPTER_KEY,
	REPOSITORY_URL,
	SAVE_SCROLL_KEY,
	TREE_VIEW_ID,
	readListKey,
} from "../../legacy/ids";

suite("legacy/ids 常量", () => {
	test("身份常量（P0-06 基线）", () => {
		assert.strictEqual(EXTENSION_NAME, "moyu-novel-ts");
		assert.strictEqual(DISPLAY_NAME, "Moyu Novel");
		assert.strictEqual(REPOSITORY_URL, "https://github.com/upuphero/moyu-novel-ts");
	});

	test("namespace 前缀（Phase 9 迁移前保持旧值）", () => {
		assert.strictEqual(COMMAND_PREFIX, "novel-look.");
		assert.strictEqual(CONFIG_PREFIX, "novelLook");
		assert.strictEqual(TREE_VIEW_ID, "novelLookTreeView");
		assert.strictEqual(ACTIVITY_CONTAINER_ID, "novel-look");
	});

	test("命令 ID 集合（与 package.json contributes 对齐）", () => {
		assert.strictEqual(Command.OpenWebView, "novel-look.openWebView");
		assert.strictEqual(Command.CloseWebView, "novel-look.closeWebView");
		assert.strictEqual(Command.ShowChapter, "novel-look.showChapter");
		assert.strictEqual(Command.RefreshFile, "novel-look.refreshFile");
	});

	test("状态 key 形状（characterization）", () => {
		assert.strictEqual(readListKey("斗破苍穹"), "book_斗破苍穹");
		assert.strictEqual(readListKey("a.txt"), "book_a.txt");
		assert.strictEqual(LAST_OPEN_CHAPTER_KEY, "lastOpenChapter");
		assert.strictEqual(IS_SHOW_READ_CHAPTER_KEY, "isShowReadChapter");
		assert.strictEqual(SAVE_SCROLL_KEY, "saveScroll");
	});

	test("内置默认正则与 package.json default 一致", () => {
		assert.strictEqual(DEFAULT_NOVEL_NAME_REGEX, "^.*\\.txt$");
		assert.ok(DEFAULT_CHAPTER_REGEX.length > 0);
		assert.ok(new RegExp(DEFAULT_CHAPTER_REGEX).test("第一章 开始"));
		assert.ok(new RegExp(DEFAULT_CHAPTER_REGEX).test("第123章 数字"));
		assert.ok(!new RegExp(DEFAULT_CHAPTER_REGEX).test("这是正文内容。"));
	});
});
