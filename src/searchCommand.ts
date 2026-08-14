/**
 * 全书搜索命令（Phase 5，P5-04）。
 *
 * 流程：QuickPick 选书 → showInputBox 关键词 → withProgress（可取消）搜索 →
 * QuickPick 结果列表 → 打开章节并定位高亮。
 *
 * 性能约定：**Enter 或明确提交才执行重扫描**（showInputBox 只在提交时触发一次）；
 * 不逐键扫描大文件。搜索内部受结果上限（200）与取消句柄约束（P5-05）。
 */
import * as vscode from "vscode";
import { SearchEngine } from "./core/search/searchEngine";
import { SearchResult } from "./core/search/types";
import { Book } from "./treeView/Book";
import { getBookMap } from "./treeView/TreeViewProvider";

/** 上次使用的关键词（命令内记忆） */
let lastKeyword = "";

let engine: SearchEngine | null = null;

/** 初始化搜索服务（activate 时调用；parserFor 从书库 map 取解析器） */
export function initSearchService(): SearchEngine {
	engine = new SearchEngine((bookId) => {
		const map = getBookMap();
		if (!map) return undefined;
		for (const book of map.values()) {
			if (book.bookId === bookId) return book.parser;
		}
		return undefined;
	});
	return engine;
}

/** 获取搜索服务（未初始化返回 null） */
export function getSearchEngine(): SearchEngine | null {
	return engine;
}

/** 根据当前选中项或书库选择一本书 */
async function pickBook(): Promise<Book | undefined> {
	const map = getBookMap();
	if (!map || map.size === 0) {
		vscode.window.showInformationMessage("书库为空，请先放入小说");
		return undefined;
	}
	const books = Array.from(map.values());
	const picked = await vscode.window.showQuickPick(
		books.map((b) => ({
			label: b.label,
			description: b.bookId.slice(0, 12),
			book: b,
		})),
		{ placeHolder: "选择要搜索的书" }
	);
	return picked?.book;
}

/**
 * 在 Reader 中打开搜索结果（P5-04：定位并高亮）。
 * @param book 书
 * @param result 搜索结果
 */
export async function openSearchResult(
	book: Book,
	result: SearchResult
): Promise<void> {
	await book.getChapterList();
	const chapter = book.chapterList[result.chapterIndex];
	if (!chapter) {
		vscode.window.showInformationMessage("未找到对应章节（章节列表可能已变化）");
		return;
	}
	await chapter.openThis({
		keyword: lastKeyword,
		paragraphIndex: result.paragraphIndex,
	});
}

/** 主命令：全书搜索 */
export async function searchBook(): Promise<void> {
	const book = await pickBook();
	if (!book) return;

	const keyword = await vscode.window.showInputBox({
		prompt: `在《${book.label}》中搜索`,
		placeHolder: "输入关键词，Enter 提交后扫描",
		value: lastKeyword,
		ignoreFocusOut: true,
	});
	// 取消或空输入 → 不扫描（P5-04：明确提交才执行重扫描）
	if (!keyword || !keyword.trim()) {
		return;
	}
	lastKeyword = keyword.trim();

	if (!engine) {
		vscode.window.showInformationMessage("搜索服务未初始化");
		return;
	}

	const results = await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: `正在搜索《${book.label}》中的“${keyword}”…`,
			cancellable: true,
		},
		async (_progress, token) => {
			return engine!.search(
				{
					bookId: book.bookId,
					keyword: lastKeyword,
				},
				{ cancelled: () => token.isCancellationRequested }
			);
		}
	);

	if (results.length === 0) {
		vscode.window.showInformationMessage(
			`未在《${book.label}》中找到“${keyword}”`
		);
		return;
	}

	const picked = await vscode.window.showQuickPick(
		results.map((r, i) => ({
			label: `${r.chapterTitle || `第${r.chapterIndex + 1}章`}`,
			description: `段落 ${r.paragraphIndex + 1}`,
			detail: r.preview,
			result: r,
			index: i,
		})),
		{
			placeHolder: `共 ${results.length} 个结果（最多显示 200）`,
			matchOnDescription: true,
			matchOnDetail: true,
		}
	);
	if (!picked) return;
	await openSearchResult(book, picked.result);
}

/** 命令导出（合并进 index.ts command） */
export const command = {
	searchBook,
};
