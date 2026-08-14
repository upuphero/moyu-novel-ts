import * as vscode from 'vscode';

/**
 * 使用 vscode.workspace.fs 读取文件字节的实现（注入给 ParserFactory / TxtParser）。
 * core 层保持纯 Node 可测，VS Code 依赖只存在于本适配层。
 */
export async function vscodeFileReader(path: string): Promise<Uint8Array> {
	return await vscode.workspace.fs.readFile(vscode.Uri.file(path));
}
