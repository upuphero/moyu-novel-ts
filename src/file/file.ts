/**
 * file 不提供工具方法，只提供和文件相关的、工具方法的封装调用
 */

import * as vscode from "vscode";
import * as util from "./fileUtil";
import * as config from "../config";
import { FileTreeItem } from "./fileUtil";

import { closeWebView, showChapter } from "../webView";
import { Command } from "../legacy/ids";

const staticDir = "/static/";
export const getTargetStaticDir = () => {
	// 动态获取当前版本号
	return `/static/${context.extension.packageJSON.version}${config.env === "dev" ? ".dev" : ""}`;
};

let uri: vscode.Uri;

let _fs: vscode.FileSystem;
let context: vscode.ExtensionContext;
/**
 * 初始化
 */
export async function init(_context: vscode.ExtensionContext) {
	context = context || _context;
	uri = uri || context.globalStorageUri;
	_fs = _fs || vscode.workspace.fs;
	// 先创建一遍，如果已存在不会做操作（P0-03-3：保证全新 global storage 可用）
	await _fs.createDirectory(uri);
}

/**
 * 获取书架中书的列表
 */
export async function getBookList(): Promise<FileTreeItem[]> {
	return await util.readBookDirTerr(uri);
}

/**
 * 获取 webView 的 html 内容
 */
export async function getWebViewHtml() {
	// 拓展安装目录里的静态文件目录
	const dirSrc = vscode.Uri.joinPath(context.extensionUri, staticDir);
	// 要拷贝到的地址的目录
	const targetDirSrc = vscode.Uri.joinPath(uri, getTargetStaticDir());
	const file = vscode.Uri.joinPath(dirSrc, "webView.html");
	// 开发环境始终从拓展目录（开发目录）拷贝一份最新的文件
	// 正式环境则判断文件不存在时拷贝一份
	if (config.env === "dev" || !(await util.isDir(targetDirSrc))) {
		await copyDir(dirSrc, targetDirSrc);
	}

	return (await util.readFile(file)) as string;
}

async function refreshStaticFile() {
	// 拓展安装目录
	const dirSrc = vscode.Uri.joinPath(context.extensionUri, staticDir);
	// 要拷贝到的地址的目录
	const targetDirSrc = vscode.Uri.joinPath(uri, getTargetStaticDir());
	await copyDir(dirSrc, targetDirSrc);
	console.log("刷新完成");

	// 重启视图
	closeWebView();
	vscode.commands.executeCommand(Command.OpenWebView);
}

/**
 * 复制文件夹（P0-03-3：先确保目标目录存在，写入失败时向上抛错，不再吞掉）
 * @param src 源
 * @param dist 目标
 */
async function copyDir(src: vscode.Uri, dist: vscode.Uri) {
	// 先创建目标目录（含递归），全新 global storage 下也能成功
	await _fs.createDirectory(dist);
	const files = await util.readDir(src);
	// 文件不多，for 循环单进程读写即可
	for (let i = 0; i < files.length; i++) {
		// 目标文件的路径，可能是文件名(index.html)，或者相对地址(/js/a.js)
		const filePath = files[i].path.replace(src.path, "");
		const toFileUrl = vscode.Uri.joinPath(dist, filePath);
		const s = await util.readFile(files[i], { binary: true });
		await util.writeFile(toFileUrl, s, true);
	}
}
/**
 * 打开资源管理器（P0-09：使用跨平台 API，不再依赖 Windows 的 explorer.exe）
 * @param url 目录地址
 */
function openExplorer(url = uri.fsPath) {
	vscode.env.openExternal(vscode.Uri.file(url));
}

/**
 * 打开 webView 静态文件所在的目录
 */
function openWebViewDir() {
	const url = vscode.Uri.joinPath(uri, staticDir).fsPath;
	vscode.env.openExternal(vscode.Uri.file(url));
}

export const command = {
	openWebViewDir,
	openExplorer,
	refreshStaticFile,
};

export function getUrl() {
	return uri;
}

export { readFile, getFileName } from "./fileUtil";
