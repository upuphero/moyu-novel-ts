/**
 * P0-03-6 / P0-07 / P0-11 + P9-01/02/04：package.json manifest 断言（纯 Node 单测）。
 * - 菜单 when 条件引用新 view ID（moyuNovelTreeView），旧拼写错误不再出现
 * - contributes.commands 全部为新 namespace（moyu-novel.*），旧命令不再声明
 * - activationEvents 含新 view/命令 + 旧 alias 命令（兼容窗口内旧调用可激活）
 * - configuration 双 namespace（moyuNovel.* 新 + novelLook.* deprecated）
 * - 用户可见身份与仓库链接正确
 */
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

const pkgPath = path.resolve(__dirname, "../../../package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
	name: string;
	displayName: string;
	publisher: string;
	repository?: { url?: string };
	homepage?: string;
	bugs?: { url?: string };
	activationEvents?: string[];
	contributes: {
		title?: string;
		configuration: {
			properties: Record<string, { deprecationMessage?: string; default?: unknown }>;
		};
		commands?: { command: string }[];
		keybindings?: { command: string; key: string }[];
		menus?: Record<string, { command?: string; when?: string }[]>;
		views?: Record<string, { id: string }[]>;
		viewsContainers?: { activitybar?: { id: string }[] };
	};
};

const VIEW_ID = "moyuNovelTreeView";

suite("manifest 断言（P9 namespace 收口）", () => {
	test("context menu 的 when 条件引用新 view ID（P0-03-6 回归 + P9-01）", () => {
		const menus = pkg.contributes.menus || {};
		const viewItemMenus = menus["view/item/context"] || [];
		assert.ok(viewItemMenus.length >= 2, "缺少 view/item/context 菜单");
		for (const m of viewItemMenus) {
			assert.ok(
				m.when && m.when.includes(VIEW_ID),
				`view/item/context 的 when 条件错误: ${m.when}`
			);
		}
	});

	test("所有菜单 when 不再引用旧 view ID（P9-01 收口）", () => {
		const menus = pkg.contributes.menus || {};
		for (const [menu, items] of Object.entries(menus)) {
			for (const m of items) {
				assert.ok(
					!m.when || !m.when.includes("novelLookTreeView"),
					`${menu} 的 when 仍引用旧 view: ${m.when}`
				);
				assert.ok(
					!m.when || !m.when.includes("config.novelLook."),
					`${menu} 的 when 仍引用旧配置: ${m.when}`
				);
			}
		}
	});

	test("view/title 菜单与 keybinding 命令均在 commands 中声明（新 ID）", () => {
		const declared = new Set(
			(pkg.contributes.commands || []).map((c) => c.command)
		);
		const menus = pkg.contributes.menus || {};
		for (const m of [...(menus["view/title"] || []), ...(menus["view/item/context"] || [])]) {
			if (m.command) {
				assert.ok(
					declared.has(m.command),
					`菜单引用了未声明的命令: ${m.command}`
				);
			}
		}
		for (const k of pkg.contributes.keybindings || []) {
			assert.ok(declared.has(k.command), `keybinding 引用了未声明的命令: ${k.command}`);
		}
	});

	test("contributes.commands 全部为新 namespace（P9-01）", () => {
		const declared = (pkg.contributes.commands || []).map((c) => c.command);
		for (const cmd of declared) {
			assert.ok(
				cmd.startsWith("moyu-novel."),
				`命令未迁移到新 namespace: ${cmd}`
			);
		}
		// 旧命令不应在 commands 声明（alias 仅注册不声明，避免命令面板重复）
		assert.ok(!declared.some((c) => c.startsWith("novel-look.")));
		// 示例命令清理（P0-11）
		assert.ok(!declared.includes("novel-look.helloWorld"));
		assert.ok(!declared.includes("extension.sayHello"));
	});

	test("activationEvents 覆盖新 view/命令与旧 alias（P9-02）", () => {
		const events = pkg.activationEvents || [];
		assert.ok(events.includes("onView:moyuNovelTreeView"), "缺少 onView 新 ID");
		assert.ok(events.includes("onCommand:moyu-novel.openWebView"));
		assert.ok(
			events.includes("onCommand:novel-look.openWebView"),
			"旧 alias 命令应保留激活事件（外部调用/旧 keybinding 可激活）"
		);
		assert.ok(events.includes("onCommand:moyu-novel.searchBook"));
	});

	test("configuration 双 namespace：moyuNovel.* 全套 + novelLook.* deprecated（P9-03）", () => {
		const props = pkg.contributes.configuration.properties;
		const moyuKeys = Object.keys(props).filter((k) => k.startsWith("moyuNovel."));
		const legacyKeys = Object.keys(props).filter((k) => k.startsWith("novelLook."));
		assert.ok(moyuKeys.length >= 17, `moyuNovel.* 配置项不足: ${moyuKeys.length}`);
		assert.strictEqual(moyuKeys.length, legacyKeys.length, "新旧配置项一一对应");
		for (const legacyKey of legacyKeys) {
			const moyuKey = legacyKey.replace(/^novelLook\./, "moyuNovel.");
			assert.ok(moyuKeys.includes(moyuKey), `缺少 ${moyuKey}`);
			const legacyProp = props[legacyKey];
			assert.ok(
				legacyProp.deprecationMessage && legacyProp.deprecationMessage.includes("moyuNovel"),
				`novelLook.* 缺少 deprecationMessage: ${legacyKey}`
			);
			// 默认值一致（兼容读取不改变语义）
			assert.deepStrictEqual(
				props[moyuKey].default,
				legacyProp.default,
				`${moyuKey} 与 ${legacyKey} 默认值不一致`
			);
		}
	});

	test("TreeView 与容器 ID 声明一致（P9-01）", () => {
		const views = pkg.contributes.views || {};
		const containerIds = new Set(
			(pkg.contributes.viewsContainers?.activitybar || []).map((c) => c.id)
		);
		assert.ok(containerIds.has("moyu-novel"), "activitybar 容器应为 moyu-novel");
		for (const [containerId, items] of Object.entries(views)) {
			assert.ok(
				containerIds.has(containerId),
				`views 容器未在 viewsContainers 中声明: ${containerId}`
			);
			for (const v of items) {
				assert.strictEqual(v.id, VIEW_ID, "TreeView ID 与常量不一致");
			}
		}
	});

	test("用户可见身份（P0-06 / P9-04）", () => {
		assert.strictEqual(pkg.name, "moyu-novel-ts");
		assert.strictEqual(pkg.displayName, "Moyu Novel");
		assert.ok(
			(pkg.repository?.url || "").includes("upuphero/moyu-novel-ts"),
			"repository 未指向新仓库"
		);
		assert.ok(
			(pkg.homepage || "").includes("upuphero/moyu-novel-ts"),
			"homepage 未指向新仓库"
		);
		assert.ok(
			(pkg.bugs?.url || "").includes("upuphero/moyu-novel-ts"),
			"bugs 未指向新仓库"
		);
	});

	test("publisher 未冒用上游（P0-05，ADR-001）", () => {
		assert.notStrictEqual(pkg.publisher, "ytx222", "不得冒用上游 publisher");
	});
});
