import * as assert from "assert";

// 你可以导入并使用 vscode 模块中的 API
// 也可以导入你的扩展来测试它
import * as vscode from "vscode";
import * as path from "path";
import { ParserFactory } from "../../core/parser/ParserFactory";
import { vscodeFileReader } from "../../file/vscodeAdapter";
import { getChapterRegex } from "../../split";
import { Book } from "../../treeView/Book";
import { generateBookId } from "../../core/progress/id";
import { getProgressService } from "../../core/progress/ProgressService";
import { buildEpub3 } from "../helpers/epubFixtures";
import * as os from "os";
import * as path2 from "path";
import * as fsx from "fs";

const EXTENSION_ID = "moyu-novel.moyu-novel-ts";
const fixturePath = (name: string) =>
	path.resolve(__dirname, "../../../src/test/fixtures", name);

suite("Extension Test Suite", () => {
	vscode.window.showInformationMessage("Start all tests.");

	suiteSetup(async () => {
		// 手动激活扩展（集成测试不会自动触发 activationEvents）
		const ext = vscode.extensions.getExtension(EXTENSION_ID);
		if (ext && !ext.isActive) {
			await ext.activate();
		}
	});

	test("激活后核心命令已注册（P0-03-1 async activate）", async () => {
		const commands = await vscode.commands.getCommands(true);
		for (const cmd of [
			"novel-look.openWebView",
			"novel-look.closeWebView",
			"novel-look.showChapter",
			"novel-look.refreshFile",
			"novel-look.nextChapter",
			"novel-look.prevChapter",
		]) {
			assert.ok(commands.includes(cmd), `命令未注册: ${cmd}`);
		}
	});

	test("示例命令已被清理（P0-11）", async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(!commands.includes("novel-look.helloWorld"));
		assert.ok(!commands.includes("extension.sayHello"));
	});

	test("TxtParser 经 vscodeFileReader 读取 fixture（P1-03 adapter）", async () => {
		const file = fixturePath("utf8-sample.txt");
		const parser = ParserFactory.create(file, {
			readFile: vscodeFileReader,
			chapterRegex: getChapterRegex,
		});
		const meta = await parser.load();
		assert.strictEqual(meta.chapterCount, 4);
		const chapters = await parser.getChapterList();
		assert.strictEqual(chapters[1].title, "第一章 开始");
		const content = await parser.getChapterContent(chapters[1]);
		assert.ok(content.lines.includes("这是第一章的内容。"));
		parser.dispose();
	});

	test("Book adapter 只消费统一模型（P1-04）", async () => {
		const uri = vscode.Uri.file(fixturePath("utf8-sample.txt"));
		const book = new Book(uri);
		assert.ok(book.parser, "Book 应持有解析器");
		const children = (await book.getChildren()) as any[];
		// 无已读章节：返回 [已读章节组(空), 未读章节组(全部)]
		assert.ok(children.length >= 2, "应包含已读/未读分组");
		const unread = children.find((c) => c.label === "未读章节");
		assert.ok(unread && unread.child.length >= 4, "未读分组应包含头部+3章");
		const firstChapter = unread.child[1];
		assert.strictEqual(firstChapter.label, "第一章 开始");
	});

	test("Book 对不支持格式不崩溃（P1-02）", async () => {
		const tmp = path.resolve(__dirname, "../../../src/test/fixtures");
		const uri = vscode.Uri.file(path.join(tmp, "fake-book.pdf"));
		const book = new Book(uri);
		assert.ok(!book.parser, "pdf 不应创建解析器");
		assert.ok(book.parserError, "应记录明确错误");
		const children = await book.getChildren();
		assert.deepStrictEqual(children, []);
	});
test("Book bookId 稳定且同名不同路径隔离（P2-01）", () => {
		const uriA = vscode.Uri.file(fixturePath("utf8-sample.txt"));
		const bookA1 = new Book(uriA);
		const bookA2 = new Book(uriA);
		assert.strictEqual(bookA1.bookId, bookA2.bookId, "同一路径两次构造应相同");
		assert.strictEqual(bookA1.bookId, generateBookId(uriA.fsPath));

		const uriB = vscode.Uri.file(fixturePath("gbk-sample.txt"));
		const bookB = new Book(uriB);
		assert.notStrictEqual(bookA1.bookId, bookB.bookId, "不同路径应不同");
	});

test("已读列表走新 schema（bookId），Book 构造可读（P2-02/05）", async () => {
		const svc = getProgressService();
		assert.ok(svc, "ProgressService 应已初始化（activate 时注入）");
		const bookId = generateBookId(fixturePath("utf8-sample.txt"));
		await svc!.saveReadList(bookId, [0, 1]);
		const book = new Book(vscode.Uri.file(fixturePath("utf8-sample.txt")));
		assert.deepStrictEqual(book.readList, [0, 1], "Book 应读取新 schema 已读列表");
	});

	
test("EPUB：Book 适配 + 统一 Reader 消息模型（P4-05）", async () => {
		// 生成临时 EPUB3 文件（自编内容）
		const dir = fsx.mkdtempSync(path2.join(os.tmpdir(), "moyu-epub-test-"));
		const epubPath = path2.join(dir, "book.epub");
		try {
			fsx.writeFileSync(epubPath, buildEpub3({ title: "集成测试书" }));
			const uri = vscode.Uri.file(epubPath);
			const book = new Book(uri);
			assert.ok(book.parser, "EPUB 应创建解析器");
			assert.strictEqual(book.parser!.format, "epub");
			const children = (await book.getChildren()) as any[];
			const unread = children.find((c) => c.label === "未读章节");
			assert.ok(unread && unread.child.length >= 3, "3 个章节");
			const titles = unread.child.map((c: any) => c.label);
			assert.deepStrictEqual(titles, ["第一章 序曲", "第二章 登场", "第三章 落幕"]);
		} finally {
			fsx.rmSync(dir, { recursive: true, force: true });
		}
	});

test("EPUB：损坏章节不崩溃（P4-06 错误隔离）", async () => {
		const dir = fsx.mkdtempSync(path2.join(os.tmpdir(), "moyu-epub-bad-"));
		const epubPath = path2.join(dir, "bad.epub");
		try {
			// 用坏 XHTML 构造（通过 helpers 直接构造 ZIP）
			const { buildZip, textFile } = await import("../helpers/buildZip");
			fsx.writeFileSync(epubPath, buildZip([
				textFile("mimetype", "application/epub+zip", false),
				textFile("META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
				textFile("content.opf", '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>坏书</dc:title></metadata><manifest><item id="c1" href="bad.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>'),
				textFile("bad.xhtml", '<?xml version="1.0"?><html><body><p>未闭合'),
			]));
			const uri = vscode.Uri.file(epubPath);
			const book = new Book(uri);
			assert.ok(book.parser, "解析器创建");
			const chapters = await book.parser!.getChapterList();
			assert.strictEqual(chapters.length, 1);
			await assert.rejects(() => book.parser!.getChapterContent(chapters[0]), /损坏/);
		} finally {
			fsx.rmSync(dir, { recursive: true, force: true });
		}
	});
test("内置章节 matcher：正例识别、正文反例不识别（P7-02）", async () => {
		const { getChapterMatcher } = await import("../../split");
		const matcher = getChapterMatcher();
		assert.ok(matcher, "getChapterMatcher 应返回 matcher");
		assert.strictEqual(matcher.match("第一章 风起"), "第一章 风起");
		assert.strictEqual(matcher.match("Chapter 1"), "Chapter 1");
		// P0 已知缺陷修复：正文行不再误判为章节
		assert.strictEqual(matcher.match("第二章的内容。"), null);
		assert.strictEqual(matcher.match("他说：“第一章讲完了。”"), null);
	});

	test("无效用户 regex 安全回退内置 matcher（P7-03）", async () => {
		const config = vscode.workspace.getConfiguration("novelLook");
		const before = config.get("match.chapterName");
		try {
			await config.update("match.chapterName", "([非法", true);
			const { getChapterMatcher } = await import("../../split");
			const matcher = getChapterMatcher();
			// 回退内置：仍能识别正例
			assert.strictEqual(matcher.match("第一章 风起"), "第一章 风起");
		} finally {
			await config.update("match.chapterName", before, true);
		}
	});

	test("进度计算纯函数冒烟（P6-01）", async () => {
		const { computeProgress } = await import("../../core/progress/progressBar");
		const p = computeProgress(4, 0.5, 10);
		assert.strictEqual(p.bookPercent, 0.45);
		const empty = computeProgress(0, 0.5, 0);
		assert.strictEqual(empty.bookPercent, 0, "空书不除零");
	});

test("WebView bundle 存在且 html 引用它（P8-01）", async () => {
		const fsPath = path.resolve(__dirname, "../../../static/js/webview.bundle.js");
		assert.ok(fsx.existsSync(fsPath), "webview.bundle.js 应已构建");
		const bundle = fsx.readFileSync(fsPath, "utf8");
		assert.ok(bundle.includes("showChapter"), "bundle 应含 Reader 逻辑");
		const htmlPath = path.resolve(__dirname, "../../../static/webView.html");
		const html = fsx.readFileSync(htmlPath, "utf8");
		assert.ok(html.includes("webview.bundle.js"), "html 应引用 bundle");
		assert.ok(html.includes("nonce-"), "html 应带 nonce 占位（CSP，P8-05）");
		assert.ok(!html.includes("webView.js"), "旧 module 引用已移除");
	});

	test("static/js 不再承载未类型检查的业务源文件（P8 gate）", async () => {
		const dir = path.resolve(__dirname, "../../../static/js");
		const files = fsx.readdirSync(dir);
		for (const f of files) {
			assert.ok(
				f === "webview.bundle.js" || f.endsWith(".map"),
				`static/js 应只含构建产物，发现: ${f}`
			);
		}
	});

	test("消息 contract：extension 侧拒绝非法 WebView 消息（P8-05）", async () => {
		const { isValidWebviewMessage } = await import("../../shared/contract");
		assert.ok(!isValidWebviewMessage({ type: "changeUseTheme", data: -5 }));
		assert.ok(!isValidWebviewMessage({ type: "saveScroll", data: { key: 1, value: 2 } }));
		assert.ok(isValidWebviewMessage({ type: "zoom", data: 1.2 }));
	});

	test("主题 CSS 安全：注入值被过滤（P8-05）", async () => {
		const { getThemeCssText } = await import("../../shared/theme");
		const css = getThemeCssText({ bg: "red; } body { display:none }", color: "#FFF" });
		assert.ok(!css.includes("display:none"));
		assert.ok(css.includes("--color:#FFF"));
	});

test("Sample test（保留最小冒烟）", () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test("全书搜索命令已注册（P5-04）", async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(
			commands.includes("moyu-novel.searchBook"),
			"moyu-novel.searchBook 未注册"
		);
	});

	test("搜索服务已初始化；TXT fixture 搜索冒烟（P5-02）", async () => {
		const { getSearchEngine } = await import("../../searchCommand");
		const engine = getSearchEngine();
		assert.ok(engine, "SearchEngine 应在 activate 时初始化");
		const uri = vscode.Uri.file(fixturePath("utf8-sample.txt"));
		const book = new Book(uri);
		const results = await engine!.search({
			bookId: book.bookId,
			keyword: "内容",
		});
		assert.ok(results.length >= 3, "fixture 中“内容”应多处命中");
		for (const r of results) {
			assert.ok(r.preview.includes("内容"), "preview 含关键词");
			assert.ok(r.chapterId.length > 0);
		}
	});

	test("搜索结果打开章节并携带高亮锚点（P5-04）", async () => {
		const { getSearchEngine, openSearchResult } = await import("../../searchCommand");
		const engine = getSearchEngine();
		const uri = vscode.Uri.file(fixturePath("utf8-sample.txt"));
		const book = new Book(uri);
		const results = await engine!.search({
			bookId: book.bookId,
			keyword: "第一章",
		});
		assert.ok(results.length >= 1, "应命中第一章标题");
		const r = results.find((x) => x.chapterIndex === 1)!;
		await openSearchResult(book, r);
		// openSearchResult 内部已 openThis（打开 webview/章节），不抛错即通过
	});
});
