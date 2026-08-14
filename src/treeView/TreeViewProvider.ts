import * as vscode from "vscode";
import * as file from "../file/file";
import * as webView from "../webView";
import { FileTreeItem } from "../file/fileUtil";
import { getState, setState } from "../util/util";
import { Book } from "./Book";
import { Chapter, ChapterGroup, LastChapterData, curChapter } from "./Chapter";
import { BookDir } from "./BookDir";
import {
	IS_SHOW_READ_CHAPTER_KEY,
	LAST_OPEN_CHAPTER_KEY,
	TREE_VIEW_ID,
} from "../legacy/ids";

/**
 * 子节点类型
 */
type TreeItem = BookDir | Book | Chapter | ChapterGroup;

export let lastChapter: LastChapterData;

/**
 * 将文件树解析为 TreeItem 树。
 * P0-03-4：递归处理目录时同步建立 bookMap 索引，仅嵌套目录有书时根 bookMap 也完整。
 */
export const parseTree = (arr: FileTreeItem[], map?: Map<string, Book>) => {
	const res = arr.map((item) => {
		if (item.type === vscode.FileType.Directory) {
			const dir = new BookDir(item, map);
			// 提前递归建立索引，保证"最近章节恢复"在嵌套书库下可用
			if (map && item.child) {
				parseTree(item.child, map);
			}
			return dir;
		}
		// 同一实例同时进入 UI 树与 bookMap
		const book = new Book(item.item);
		map?.set(item.item.fsPath, book);
		return book;
	});
	// BookDir 排序在最前面，剩余的按照默认排序
	res.sort((a, b) => {
		if (a.type === "dir" && b.type !== "dir") {
			return -1;
		}
		if (
			a instanceof Book &&
			a.fullPath === lastChapter?.fullPath &&
			b.type !== "dir"
		) {
			return -1;
		}

		return a.label! > b.label! ? 1 : -1;
	});

	return res;
};

/**
 * 书架，数据提供者
 */
export class Bookrack implements vscode.TreeDataProvider<TreeItem> {
	/**
	 * 初始化书架
	 * @param arr 书的地址列表
	 */
	constructor(arr: FileTreeItem[]) {
		this.init(arr);
	}

	init(arr: FileTreeItem[]) {
		// 初始化之前阅读的书
		lastChapter = getState<LastChapterData>(LAST_OPEN_CHAPTER_KEY)!;
		// 初始化数据
		this.bookMap = new Map<string, Book>();
		this.child = parseTree(arr, this.bookMap);
	}

	/**
	 * 刷新需要的
	 */
	private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | null> =
		new vscode.EventEmitter<TreeItem | null>();
	readonly onDidChangeTreeData: vscode.Event<TreeItem | null> =
		this._onDidChangeTreeData.event;
	/**
	 * 书架列表
	 * 存储所有书的指针，使用书的完整地址作为 key
	 */
	bookMap: Map<string, Book> = new Map();
	child: (Book | BookDir)[] = [];

	refresh(arr: FileTreeItem[]): void {
		this.init(arr);
		this._onDidChangeTreeData.fire(null);
	}

	/**
	 * 获取书库 map（全路径 → Book）。
	 * 供搜索等模块访问；未初始化返回 undefined。
	 */
	static getBookMap(): Map<string, Book> | undefined {
		return bookrack?.bookMap;
	}

	/**
	 * 返回在视图中显示的元素的 UI 表示形式
	 */
	getTreeItem(element: TreeItem): TreeItem {
		return element;
	}

	/**
	 * 返回给定元素或根的子元素
	 */
	async getChildren(element: TreeItem): Promise<TreeItem[]> {
		if (!this.bookMap.size) {
			vscode.window.showInformationMessage("没有书");
			return Promise.resolve([]);
		}
		// 返回根元素的子元素（书/目录）
		if (!element) {
			return Promise.resolve(this.child);
		}
		// 返回某个元素的子元素
		const t = await element.getChildren();
		return Promise.resolve(t);
	}
}

async function showChapter(e: TreeItem | null | undefined): Promise<void> {
	// 是对章执行的命令
	if (e && e instanceof Chapter) {
		// 打开章节
		e.openThis();
	} else if (e && e instanceof Book) {
		vscode.window.showInformationMessage("无法对书进行此操作");
	} else {
		vscode.window.showInformationMessage(
			"未提供正确的参数,请点击某一章节打开"
		);
	}
}
export async function nextChapter() {
	console.warn("nextChapter=========");
	// 对一个章节进行下一章命令时，会记录当前章节已读
	changeChapter(1, "下", true);
}
export async function prevChapter() {
	console.warn("prevChapter=========");
	changeChapter(-1, "上");
}
/**
 * 切换章节
 * @param n 方向
 * @param s 提示文字
 * @param isSave 是否保存当前章节为已读章节
 */
async function changeChapter(n: number, s: string, isSave = false) {
	if (curChapter) {
		if (isSave) {
			// 记录当前章节为已读
			curChapter.setThisRead();
		}
		const curBook = curChapter.book;
		const index = curChapter.i;
		const newChapter = curBook.chapterList[index + n];

		if (newChapter) {
			newChapter.openThis();
		} else {
			vscode.window.showInformationMessage(`未找到${s}一章`);
		}
	} else {
		vscode.window.showInformationMessage(
			`未找到当前章,也许是出错了,请关闭再试一次`
		);
	}
}
/**
 * 关闭 webview
 */
async function closeWebView() {
	await webView.closeWebView();
}
/**
 * 关闭后重新打开 webview
 * 如果有缓存的（本次拓展启动后有打开章节），则直接打开
 * 如果没有，则尝试读取存储的记录
 */
async function openWebView() {
	if (curChapter) {
		await curChapter.openThis();
	} else {
		// 读取缓存中的
		vscode.window.showInformationMessage(`正在打开`);
		lastChapter = getState<LastChapterData>(LAST_OPEN_CHAPTER_KEY)!;
		if (bookrack.bookMap.get(lastChapter?.fullPath || "")) {
			const book = bookrack.bookMap.get(lastChapter!.fullPath) as Book;
			// 找到那本书
			// 防止在没有获取书内容的时候查找章节
			await book.getChapterList();
			const ChapterList = book.chapterList;
			const chapter = ChapterList[lastChapter!.i];
			// 判断章节是否正确（不一定有必要，但是保险起见）
			if (chapter && chapter.label === lastChapter!.title) {
				chapter.openThis();
				return;
			}
			vscode.window.showInformationMessage(`未找到对应的章节`);
		} else {
			vscode.window.showInformationMessage(`您最近没有打开章节,无法显示`);
		}
	}
}

/*
	对于 treeView 的
*/

let treeView: vscode.TreeView<Bookrack>;
let bookrack: Bookrack;

export async function createTreeView() {
	if (treeView) return;
	const fileList = await file.getBookList();
	console.log("createTreeView 执行", fileList);
	bookrack = new Bookrack(fileList);
	treeView = vscode.window.createTreeView<Bookrack>(TREE_VIEW_ID, {
		// @ts-ignore
		treeDataProvider: bookrack,
	});
}
async function refreshFile(isNotMsg = false) {
	const list = await file.getBookList();
	bookrack.refresh(list);
	if (!isNotMsg) {
		vscode.window.showInformationMessage("刷新完成");
	}
	return list;
}

async function showReadChapter() {
	setState(IS_SHOW_READ_CHAPTER_KEY, true);
	await refreshFile();
}
async function hideReadChapter() {
	setState(IS_SHOW_READ_CHAPTER_KEY, false);
	await refreshFile();
}
async function clearReadChapter(e: vscode.TreeItem): Promise<void> {
	console.log("clearReadChapter---执行");
	if (e && e instanceof Chapter) {
		vscode.window.showInformationMessage("无法对章节进行此操作");
	} else if (e && e instanceof Book) {
		e.clearReadChapter();
		await refreshFile();
	}
}

/** 便捷访问书库 map（供搜索服务注入 parserFor） */
export function getBookMap(): Map<string, Book> | undefined {
	return bookrack?.bookMap;
}

export const command = {
	showChapter,
	nextChapter,
	prevChapter,
	closeWebView,
	openWebView,
	refreshFile, // 刷新 treeView 显示
	showReadChapter,
	hideReadChapter,
	clearReadChapter,
};
