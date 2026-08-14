/**
 * 关于操作文件的、可复用的代码
 */

import * as vscode from "vscode";
const Uri = vscode.Uri;
let _fs = vscode.workspace.fs;
import * as config from "./../config";

import { fromString } from "uint8arrays/from-string";
import encoding from "./encoding/index";
import { DEFAULT_NOVEL_NAME_REGEX } from "../legacy/ids";

/** vscode 返回的目录类型 */
type dir = [string, vscode.FileType];

export interface FileTreeItem {
	item: vscode.Uri;
	type: vscode.FileType;
	child?: FileTreeItem[];
}

/**
 * 每次调用时读取（P0-03-5：配置不再在模块加载时缓存，修改设置后刷新立即生效）
 */
function getIgnoreDirs(): string[] {
	return config.get<string[]>("ignoreDir", ["tmp", "static"]);
}

function getIgnoreFileNames(): string[] {
	return config.get<string[]>("ignoreFileName", []);
}

/**
 * 安全构建小说文件名匹配正则：
 * - 每次调用时读取最新配置；
 * - 非法/空规则回退内置默认并提示，不让书架崩溃。
 */
function getNovelNameRegex(): RegExp {
	const pattern = config.get<string>("match.novelName", DEFAULT_NOVEL_NAME_REGEX);
	try {
		const reg = new RegExp(pattern);
		// 空模式会匹配所有文件，视为非法，回退默认
		if (reg.source === "(?:)") {
			throw new Error("empty pattern");
		}
		return reg;
	} catch (error) {
		console.error("moyuNovel.match.novelName 非法,已回退默认规则", error);
		try {
			vscode.window.showErrorMessage("小说文件匹配正则非法,已回退默认规则");
		} catch {
			// 非 Extension Host 环境
		}
		return new RegExp(DEFAULT_NOVEL_NAME_REGEX);
	}
}

/**
 * 获取电子书，结果是一个树而不是列表
 * @param uri 地址
 * @param root 是否是本次递归调用的第一次
 * @returns 地址列表
 */
export async function readBookDirTerr(
	uri: vscode.Uri,
	root = true
): Promise<FileTreeItem[]> {
	const ignoreDir = getIgnoreDirs();
	const ignoreFileName = getIgnoreFileNames();
	const novelName = getNovelNameRegex();
	// 所有目录项
	const items: dir[] = await getDir(uri);

	console.warn(items);
	let arr: FileTreeItem[] = [];
	for (let index = 0; index < items.length; index++) {
		const [name, type] = items[index];
		// 如果是文件夹
		if (type === vscode.FileType.Directory) {
			// 满足排除条件
			if (ignoreDir.includes(name)) continue;
			const child = await readBookDirTerr(Uri.joinPath(uri, name), false);
			arr.push({ item: Uri.joinPath(uri, name), type, child });
		} else if (type === vscode.FileType.File) {
			// 满足小说名判断正则 并且不在忽略文件名列表中
			if (novelName.test(name) && !ignoreFileName.includes(name)) {
				arr.push({ item: Uri.joinPath(uri, name), type });
			}
		}
	}
	return arr;
}

/**
 * 获取一个目录下的所有可能的电子书文件
 * @param uri 地址
 * @param isFilter 是否筛选
 * @param root 是否是本次递归调用的第一次
 * @returns 地址列表
 */
export async function readDir(
	uri: vscode.Uri,
	isFilter = false,
	root = true
): Promise<vscode.Uri[]> {
	const ignoreDir = getIgnoreDirs();
	const ignoreFileName = getIgnoreFileNames();
	const novelName = getNovelNameRegex();
	// 所有目录项
	const items: dir[] = await getDir(uri);
	let arr: vscode.Uri[] = [];
	for (let index = 0; index < items.length; index++) {
		const [name, type] = items[index];
		// 如果是文件夹
		if (type === vscode.FileType.Directory) {
			// 如果不过滤 或者过滤并且满足条件
			if (!isFilter || !ignoreDir.includes(name)) {
				// 将递归读取的结果直接添加进数组中
				const files = await readDir(Uri.joinPath(uri, name), isFilter, false);
				arr.push(...files);
			}
			continue;
		} else if (type === vscode.FileType.File) {
			if (!isFilter || (novelName.test(name) && !ignoreFileName.includes(name))) {
				arr.push(Uri.joinPath(uri, name));
			}
		}
	}
	return arr;
}
/**
 * 打开文件夹，获取 dir 对象
 */
export async function getDir(uri: vscode.Uri): Promise<dir[]> {
	try {
		const dir: dir[] = await _fs.readDirectory(uri);
		return dir;
	} catch (error) {
		console.error("读取文件夹失败", uri.fsPath, error);
		throw error;
	}
}

/**
 * 打开文件夹，存在返回目录项，不存在返回 false
 */
export async function isDir(uri: vscode.Uri): Promise<dir[] | false> {
	try {
		const dir: dir[] = await _fs.readDirectory(uri);
		return dir;
	} catch (error) {
		return false;
	}
}
/**
 * 读取文件
 * @param uri 地址
 * @param checkEncoding 是否需要检查编码
 * @returns 文件内容
 */
export async function readFile(
	uri: vscode.Uri,
	{ binary = false, checkEncoding = false } = {}
): Promise<string | Uint8Array> {
	const buffer = await _fs.readFile(uri);
	if (binary) return buffer;
	if (checkEncoding) {
		return encoding(buffer);
	}
	return buffer.toString();
}
/**
 * 写文件；isCreateDir 时自动创建父目录（P0-03-3：copyDir 依赖此能力）。
 * 错误不再被吞掉，由调用方决定如何处理。
 * @param path 目标文件
 * @param content 内容
 * @param isCreateDir 是否创建父目录
 */
export async function writeFile(
	path: vscode.Uri,
	content: string | Uint8Array,
	isCreateDir = false
): Promise<void> {
	let data: Uint8Array;
	if (typeof content === "string") {
		data = fromString(content);
	} else {
		data = content;
	}
	if (isCreateDir) {
		await createDir(Uri.joinPath(path, ".."), true);
	}
	await _fs.writeFile(path, data);
}

/**
 * 创建目录（recursive）
 */
export async function createDir(path: vscode.Uri, recursive: boolean): Promise<void> {
	await _fs.createDirectory(path);
}

/**
 * 获取文件名称
 * @param uri 文件地址
 * @param isSuffix 是否包含后缀名
 */
export function getFileName(uri: vscode.Uri, isSuffix = false): string {
	const path = uri.path;
	let tArr = path.split("/");
	let name = tArr[tArr.length - 1];
	if (isSuffix) {
		return name;
	}
	let index = name.lastIndexOf(".");
	if (index != -1) {
		name = name.substring(0, index);
	}
	return name;
}
