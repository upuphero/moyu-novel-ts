import * as vscode from "vscode";
import { createTreeView, command as viewCommand } from "./treeView/TreeViewProvider";
import { setEnv } from "./config";
import { command as fileCommand, init as initFile } from "./file/file";
import { init as initUtil } from "./util/util";
import { initProgressService } from "./core/progress/ProgressService";
import { mementoStore } from "./core/progress/state";
import { migrateLegacyState } from "./migration/legacyState";
import { initChapterIndexCache, resolveCacheDir } from "./core/cache/chapterIndexCache";
import { TXT_PARSER_VERSION } from "./core/parser/versions";
import { initSearchService, command as searchCommand } from "./searchCommand";

let content: vscode.ExtensionContext;

/**
 * 初始化
 * @param _context vscode 拓展上下文
 */
export async function init(_context: vscode.ExtensionContext) {
	content = _context;

	// P0-03-2：dev mode 判断改为官方 API（原实现读取不存在的 packageJSON.isUnderDevelopment）
	const isDev =
		_context.extensionMode === vscode.ExtensionMode.Development ||
		_context.extensionMode === vscode.ExtensionMode.Test;
	console.log("setEnv", isDev ? "dev" : "production");
	setEnv(isDev ? "dev" : "production");
	// 工具类优先初始化，其他地方很有可能用
	initUtil(content);
	// P2：状态服务（typed store 注入 globalState），随后幂等迁移旧状态
	const progressService = initProgressService(mementoStore(content.globalState));
	void migrateLegacyState(progressService.getStore());
	// P3：章节索引缓存（globalStorage 下按 bookId 隔离）；启动时清理一次（不每次清空全部）
	const chapterIndexCache = initChapterIndexCache(
		resolveCacheDir(content.globalStorageUri.fsPath)
	);
	void chapterIndexCache.cleanup(TXT_PARSER_VERSION);
	// P5：全书搜索服务（parserFor 从书库 map 注入）
	initSearchService();
	await initFile(content);
	createTreeView();
}

/**
 * 获取拓展上下文
 */
export function getContent() {
	return content;
}
/**
 * 可被 vscode 执行的命令
 */
export const command = {
	...fileCommand,
	...viewCommand,
	...searchCommand,
};
