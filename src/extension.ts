import * as vscode from "vscode";
// 方法在 index.js，导入并集中添加
import { init, command } from "./index";
import { COMMAND_PREFIX } from "./legacy/ids";

/**
 * 扩展激活入口（P0-03-1：等待异步 init 完成后再返回，保证命令/文件/视图初始化完成）
 */
export async function activate(context: vscode.ExtensionContext) {
	console.log("moyu-novel-ts 拓展初始化");
	await init(context);

	interface CommandList {
		[key: string]: (...args: any[]) => any;
	}
	// 批量注册命令（统一走 legacy 常量前缀，避免散落硬编码字符串）
	for (const item in command) {
		context.subscriptions.push(
			vscode.commands.registerCommand(
				COMMAND_PREFIX + item,
				(command as CommandList)[item]
			)
		);
	}
}

// 当你的扩展被停用时，这个方法被调用
export function deactivate() {
	console.log("moyu-novel-ts 拓展被停用");
}
