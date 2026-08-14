import * as vscode from "vscode";
// 方法在 index.js，导入并集中添加
import { init, command } from "./index";
import { COMMAND_PREFIX, LEGACY_COMMAND_PREFIX } from "./legacy/ids";

/**
 * 扩展激活入口（P0-03-1：等待异步 init 完成后再返回，保证命令/文件/视图初始化完成）
 */
export async function activate(context: vscode.ExtensionContext) {
	console.log("moyu-novel-ts 拓展初始化");
	await init(context);

	interface CommandList {
		[key: string]: (...args: any[]) => any;
	}

	// 批量注册命令（P9-01：统一走新 namespace 前缀；P9-02：旧前缀 alias 注册到同一 handler，
	// 保证兼容窗口内旧 keybinding（alt+s/alt+d）与外部 executeCommand('novel-look.*') 仍有效）
	for (const item in command) {
		const handler = (command as CommandList)[item];
		context.subscriptions.push(
			vscode.commands.registerCommand(COMMAND_PREFIX + item, handler)
		);
		context.subscriptions.push(
			vscode.commands.registerCommand(LEGACY_COMMAND_PREFIX + item, handler)
		);
	}
}

// 当你的扩展被停用时，这个方法被调用
export function deactivate() {
	console.log("moyu-novel-ts 拓展被停用");
}
