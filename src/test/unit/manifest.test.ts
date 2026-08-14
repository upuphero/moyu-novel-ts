/**
 * P0-03-6 / P0-07 / P0-11：package.json manifest 断言（纯 Node 单测）。
 * - view/item/context 菜单的 when 条件必须引用正确的 view ID（曾拼写错误 novelLookTreeViewk）
 * - contributes.commands 与注册命令集合一致，示例命令已被清理
 * - 用户可见身份（P0-06）与仓库链接正确
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
	contributes: {
		commands?: { command: string }[];
		menus?: Record<string, { command?: string; when?: string }[]>;
		views?: Record<string, { id: string }[]>;
		viewsContainers?: { activitybar?: { id: string }[] };
	};
};

const VIEW_ID = "novelLookTreeView";

suite("manifest 断言", () => {
	test("context menu 的 when 条件引用正确的 view ID（P0-03-6 回归）", () => {
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

	test("view/title 菜单与 keybinding 命令均在 commands 中声明", () => {
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
	});

	test("示例/测试命令已被清理（P0-11）", () => {
		const declared = (pkg.contributes.commands || []).map((c) => c.command);
		assert.ok(!declared.includes("novel-look.helloWorld"));
		assert.ok(!declared.includes("novel-look.test"));
		assert.ok(!declared.includes("extension.sayHello"));
		assert.ok(!declared.includes("novel-look.sayHello"));
	});

	test("搜索命令与 activation event 声明一致（P5-04）", () => {
		const declared = (pkg.contributes.commands || []).map((c) => c.command);
		assert.ok(
			declared.includes("moyu-novel.searchBook"),
			"commands 中缺少 moyu-novel.searchBook"
		);
		const raw = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
			activationEvents?: string[];
		};
		assert.ok(
			raw.activationEvents?.includes("onCommand:moyu-novel.searchBook"),
			"activationEvents 缺少 onCommand:moyu-novel.searchBook"
		);
	});

	test("TreeView 与容器 ID 声明一致（P0-07）", () => {
		const views = pkg.contributes.views || {};
		const containerIds = new Set(
			(pkg.contributes.viewsContainers?.activitybar || []).map((c) => c.id)
		);
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

	test("用户可见身份（P0-06）", () => {
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
