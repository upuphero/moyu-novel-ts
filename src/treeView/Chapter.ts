import * as vscode from 'vscode';
import { Book } from './Book';
import { setState } from '../util/util';

import { HighlightAnchor, showChapter } from '../webView';
import { ChapterInfo } from '../core/book/model';

/** 当前显示章节 */
export let curChapter: Chapter;

export interface LastChapterData {
	title: string;
	i: number;
	bookName: string;

	fullPath: string;
}

export class ChapterGroup extends vscode.TreeItem {
	constructor(label: string, child: (ChapterGroup | Chapter)[]) {
		super(label);
		this.collapsibleState = 1; // 可展开，未展开
		if (label === '未读章节') {
			this.collapsibleState = 2;
		}
		this.child = child;
	}
	child: (ChapterGroup | Chapter)[] = [];

	async getChildren() {
		return this.child;
	}
}

/**
 * 章节（UI adapter，P1-04）。
 * 只消费统一模型 ChapterInfo；正文经 book.parser 获取。
 */
export class Chapter extends vscode.TreeItem {
	label: string;
	title: string;
	type = 'chapter' as const;
	/** 章节序号（= ChapterInfo.index） */
	i: number;
	/** 统一章节信息 */
	info: ChapterInfo;
	/**
	 * 创建章节
	 * @param book 这个章节属于哪本书
	 * @param info 统一章节信息
	 * @param isRead 是否已读
	 */
	constructor(public book: Book, info: ChapterInfo, public isRead = false) {
		super(info.title);
		this.label = info.title;
		this.title = info.title;
		this.tooltip = `${this.label}`;
		this.collapsibleState = 0; // 不可折叠
		this.i = info.index;
		this.info = info;
		this.book = book;
		this.command = { title: '', command: 'novel-look.showChapter', arguments: [this] }; // 执行命令
		this.isRead = isRead;
	}

	/**
	 * 打开本章
	 * @param highlight 搜索结果高亮锚点（P5-04，可选）
	 */
	async openThis(highlight?: HighlightAnchor) {
		curChapter = this;
		const parser = this.book.parser;
		if (!parser) {
			vscode.window.showInformationMessage(
				`无法打开章节: 该书解析器不可用 (${this.book.parserError || '未知错误'})`
			);
			return;
		}
		const content = await parser.getChapterContent(this.info);
		// 缓存最后打开的章节
		const data: LastChapterData = {
			title: this.label,
			i: this.i,
			bookName: this.book.label,
			fullPath: this.book.fullPath,
		};
		setState('lastOpenChapter', data);
		// P0-03-7：携带书身份（fullPath），WebView 端不再只按章节标题去重
		showChapter(
			this.label,
			content.lines,
			this.book.fullPath,
			this.book.bookId,
			this.info.id,
			this.i,
			highlight
		);
	}
	/**
	 * 设置当前章节为已读章节
	 */
	setThisRead() {
		this.book.setReadChapter(this.i);
	}

	// 放着就行
	async getChildren() {
		return [];
	}
}
