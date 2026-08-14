/**
 * P8-05：双向消息 contract runtime validation 测试。
 * 非法 payload 拒绝、合法 payload 通过；覆盖全部消息类型。
 */
import * as assert from "assert";
import {
	isValidHostMessage,
	isValidWebviewMessage,
	isShowChapterData,
	isSettingData,
	isSaveProgressData,
	ShowChapterData,
	SettingData,
} from "../../../shared/contract";

suite("contract.isShowChapterData（P8-05）", () => {
	const valid: ShowChapterData = {
		title: "第一章 风起",
		list: ["内容A", "内容B"],
		book: "/books/a.txt",
		bookId: "book:1:a",
		chapterId: "txt:1",
		chapterIndex: 1,
		restore: { paragraphIndex: 3 },
		totalChapters: 10,
	};

	test("合法 payload 通过", () => {
		assert.ok(isShowChapterData(valid));
	});

	test("缺失/类型错误字段拒绝", () => {
		assert.ok(!isShowChapterData({ ...valid, title: 123 }));
		assert.ok(!isShowChapterData({ ...valid, list: "not-array" }));
		assert.ok(!isShowChapterData({ ...valid, list: [1, 2] }));
		assert.ok(!isShowChapterData({ ...valid, chapterIndex: -1 }));
		assert.ok(!isShowChapterData({ ...valid, chapterIndex: 1.5 }));
		assert.ok(!isShowChapterData(null));
		assert.ok(!isShowChapterData("string"));
	});

	test("restore/highlight/totalChapters 校验", () => {
		assert.ok(!isShowChapterData({ ...valid, restore: { paragraphIndex: -1 } }));
		assert.ok(!isShowChapterData({ ...valid, restore: { chapterProgress: 2 } }));
		assert.ok(!isShowChapterData({ ...valid, highlight: { keyword: 1, paragraphIndex: 0 } }));
		assert.ok(!isShowChapterData({ ...valid, totalChapters: -1 }));
		assert.ok(isShowChapterData({ ...valid, totalChapters: 0 }));
	});
});

suite("contract.isSettingData（P8-05）", () => {
	const valid: SettingData = {
		lineIndent: 2,
		rootFontSize: 20,
		zoom: 1,
		screenDirection: 1,
		theme: { use: 0, custom: [] },
	};

	test("合法 payload 通过", () => {
		assert.ok(isSettingData(valid));
	});

	test("zoom 边界（0.1..10）", () => {
		assert.ok(!isSettingData({ ...valid, zoom: 0.05 }));
		assert.ok(!isSettingData({ ...valid, zoom: 11 }));
		assert.ok(isSettingData({ ...valid, zoom: 0.1 }));
	});

	test("screenDirection 仅 1..4", () => {
		assert.ok(!isSettingData({ ...valid, screenDirection: 5 }));
		assert.ok(!isSettingData({ ...valid, screenDirection: 0 }));
		assert.ok(isSettingData({ ...valid, screenDirection: 4 }));
	});

	test("theme.custom 元素必须是 ThemeItem（含 name）", () => {
		assert.ok(!isSettingData({ ...valid, theme: { use: 1, custom: [{}] } }));
		assert.ok(isSettingData({ ...valid, theme: { use: 1, custom: [{ name: "绿色", bg: "#cbd9c0" }] } }));
	});
});

suite("contract.isSaveProgressData（P8-05）", () => {
	test("合法/非法", () => {
		assert.ok(
			isSaveProgressData({
				bookId: "b",
				chapterId: "c",
				chapterIndex: 1,
				paragraphIndex: 5,
				chapterProgress: 0.5,
			})
		);
		assert.ok(!isSaveProgressData({ bookId: "b", chapterId: "c" }));
		assert.ok(!isSaveProgressData({ ...{}, bookId: "b", chapterId: "c", chapterIndex: 1, paragraphIndex: 5, chapterProgress: 2 }));
	});
});

suite("contract.isValidHostMessage / isValidWebviewMessage", () => {
	test("Host 消息：showChapter/setting/readScroll", () => {
		assert.ok(
			isValidHostMessage({
				type: "showChapter",
				data: { title: "t", list: [], book: "b", bookId: "x", chapterId: "c", chapterIndex: 0 },
			})
		);
		assert.ok(isValidHostMessage({ type: "setting", data: { zoom: 1 } }));
		assert.ok(isValidHostMessage({ type: "readScroll", data: 100 }));
		assert.ok(!isValidHostMessage({ type: "showChapter", data: {} }));
		assert.ok(!isValidHostMessage({ type: "unknown", data: {} }));
	});

	test("WebView 消息：全部类型 + 非法拒绝", () => {
		assert.ok(isValidWebviewMessage({ type: "chapterToggle", data: "next" }));
		assert.ok(isValidWebviewMessage({ type: "zoom", data: 1.2 }));
		assert.ok(
			isValidWebviewMessage({ type: "updateReadSetting", data: { key: "readSetting.zoom", value: 1.5 } })
		);
		assert.ok(
			isValidWebviewMessage({
				type: "saveProgress",
				data: { bookId: "b", chapterId: "c", chapterIndex: 0, paragraphIndex: 1, chapterProgress: 0.3 },
			})
		);
		assert.ok(isValidWebviewMessage({ type: "saveScroll", data: { key: "k", value: 10 } }));
		assert.ok(isValidWebviewMessage({ type: "toggleZenMode", data: undefined }));
		assert.ok(isValidWebviewMessage({ type: "changeUseTheme", data: 2 }));

		// 非法
		assert.ok(!isValidWebviewMessage({ type: "chapterToggle", data: "sideways" }));
		assert.ok(!isValidWebviewMessage({ type: "zoom", data: "1.2" }));
		assert.ok(!isValidWebviewMessage({ type: "changeUseTheme", data: -1 }));
		assert.ok(!isValidWebviewMessage({ type: "saveScroll", data: { key: 1, value: 2 } }));
		assert.ok(!isValidWebviewMessage({ type: "evil", data: {} }));
		assert.ok(!isValidWebviewMessage(null));
	});

	test("更新配置 key 白名单以外的消息仍有校验兜底（updateReadSetting key 由 extension 侧白名单再过滤）", () => {
		// contract 只保证形状；key 白名单在 extension 侧（config.ALLOWED_READ_SETTING_KEYS）
		assert.ok(
			isValidWebviewMessage({ type: "updateReadSetting", data: { key: "任意.key", value: "x" } })
		);
	});
});
