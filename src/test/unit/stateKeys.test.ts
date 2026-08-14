/**
 * P0-07 + P9-01/02/05 回归护栏：namespace 常量与状态 key 生成测试。
 * - 业务代码使用新 namespace（moyu-novel.* / moyuNovel.* / moyuNovelTreeView）；
 * - LEGACY_* 常量锁定旧值（alias 注册 / fallback 读取 / 兼容窗口依据）。
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
	LEGACY_ACTIVITY_CONTAINER_ID,
	LEGACY_COMMAND_PREFIX,
	LEGACY_CONFIG_PREFIX,
	LEGACY_TREE_VIEW_ID,
	REPOSITORY_URL,
	SAVE_SCROLL_KEY,
	TREE_VIEW_ID,
	readListKey,
} from "../../legacy/ids";

suite("legacy/ids 常量（P9 迁移后）", () => {
	test("身份常量（P0-06 基线）", () => {
		assert.strictEqual(EXTENSION_NAME, "moyu-novel-ts");
		assert.strictEqual(DISPLAY_NAME, "Moyu Novel");
		assert.strictEqual(REPOSITORY_URL, "https://github.com/upuphero/moyu-novel-ts");
	});

	test("新 namespace 前缀（P9-01 业务代码唯一引用）", () => {
		assert.strictEqual(COMMAND_PREFIX, "moyu-novel.");
		assert.strictEqual(CONFIG_PREFIX, "moyuNovel");
		assert.strictEqual(TREE_VIEW_ID, "moyuNovelTreeView");
		assert.strictEqual(ACTIVITY_CONTAINER_ID, "moyu-novel");
	});

	test("旧 namespace 常量锁定（P9-02/05 兼容窗口）", () => {
		assert.strictEqual(LEGACY_COMMAND_PREFIX, "novel-look.");
		assert.strictEqual(LEGACY_CONFIG_PREFIX, "novelLook");
		assert.strictEqual(LEGACY_TREE_VIEW_ID, "novelLookTreeView");
		assert.strictEqual(LEGACY_ACTIVITY_CONTAINER_ID, "novel-look");
	});

	test("命令 ID 集合为新 namespace（与 package.json contributes 对齐）", () => {
		assert.strictEqual(Command.OpenWebView, "moyu-novel.openWebView");
		assert.strictEqual(Command.CloseWebView, "moyu-novel.closeWebView");
		assert.strictEqual(Command.ShowChapter, "moyu-novel.showChapter");
		assert.strictEqual(Command.RefreshFile, "moyu-novel.refreshFile");
		assert.strictEqual(Command.SearchBook, "moyu-novel.searchBook");
	});

	test("新命令 ID 可由旧前缀推导（alias 注册规则）", () => {
		// extension.ts 用 LEGACY_COMMAND_PREFIX + camelCase 键 注册旧 alias
		assert.strictEqual(
			LEGACY_COMMAND_PREFIX + "openWebView",
			"novel-look.openWebView"
		);
		assert.strictEqual(
			Command.OpenWebView.replace(COMMAND_PREFIX, LEGACY_COMMAND_PREFIX),
			"novel-look.openWebView"
		);
	});

	test("状态 key 形状（characterization，P9 不改变）", () => {
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
