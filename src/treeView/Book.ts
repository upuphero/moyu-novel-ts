import { getFileName } from '../file/fileUtil';
import { getExtensionUri, getStateDefault, setState } from '../util/util';
import * as vscode from 'vscode';
import { Chapter, ChapterGroup } from './Chapter';
import { lastChapter } from './TreeViewProvider';
import {
	IS_SHOW_READ_CHAPTER_KEY,
	readListKey,
} from '../legacy/ids';
import { ParserFactory } from '../core/parser/ParserFactory';
import { BookParser } from '../core/parser/BookParser';
import { getChapterRegex } from '../split';
import { vscodeFileReader } from '../file/vscodeAdapter';
import { generateBookId } from '../core/progress/id';
import { SHOW_READ_CHAPTER_KEY } from '../core/progress/state';
import { getProgressService } from '../core/progress/ProgressService';
import { getChapterIndexCache } from '../core/cache/chapterIndexCache';

/**
 * 书（UI adapter，P2）。
 * - 拥有稳定 bookId（路径哈希，ADR-007），同名不同路径状态隔离。
 * - 已读列表：新 key（bookId）优先，旧 key（book_<label>）按需迁移（兼容窗口）。
 * - 含本地路径的状态不再跨设备同步（移除 setSync）。
 */
export class Book extends vscode.TreeItem {
	label: string;
	fullPath: string;
	/** 稳定书 ID（ADR-007） */
	bookId: string;
	/** 统一解析器（由 ParserFactory 创建） */
	parser?: BookParser;
	/** 创建解析器失败时的错误信息（如不支持的格式），书架不崩溃 */
	parserError?: string;

	// 所有章节列表
	chapterList: Chapter[] = [];
	/** 未读章节 可能不会初始化 */
	unreadList: Chapter[] = [];
	/** 已读章节 可能不会初始化 */
	haveReadList: Chapter[] = [];
	readList: number[] = [];
	type = 'book' as const;

	/**
	 * 创建一本书
	 * @param uri 这本书的文件地址
	 */
	constructor(uri: vscode.Uri) {
		super(getFileName(uri));
		this.label = getFileName(uri);
		this.tooltip = `${this.label}`;
		this.collapsibleState = 1; // 可展开，未展开
		if (lastChapter?.fullPath === uri.fsPath) {
			this.iconPath = vscode.Uri.joinPath(
				getExtensionUri(),
				'img/book_read.png'
			);
		} else {
			this.iconPath = vscode.Uri.joinPath(getExtensionUri(), 'img/book.png');
		}
		this.fullPath = uri.fsPath;
		this.bookId = generateBookId(uri.fsPath);

		try {
			this.parser = ParserFactory.create(uri.fsPath, {
				readFile: vscodeFileReader,
				chapterRegex: getChapterRegex,
				cache: getChapterIndexCache() ?? undefined,
			});
		} catch (error) {
			this.parserError =
				error instanceof Error ? error.message : String(error);
			console.error('创建解析器失败', this.fullPath, this.parserError);
		}

		// 已读章节（P2-02/05：新 key（bookId）优先；旧 key 按需迁移）
		const svc = getProgressService();
		if (svc) {
			void svc.migrateReadList(this.bookId, readListKey(this.label));
			this.readList = svc.getReadList(this.bookId);
		} else {
			// 服务未初始化（理论不会发生，防御降级）：直接读旧 key
			this.readList = getStateDefault<number[]>(readListKey(this.label), []);
		}
	}

	async getChildren() {
		return await this.getChapterList();
	}

	/**
	 * 获取章节列表（经由统一模型 ChapterInfo）
	 */
	async getChapterList() {
		if (!this.parser) {
			vscode.window.showInformationMessage(
				`无法打开该书: ${this.parserError || '未知错误'}`
			);
			return [];
		}
		// P4-06：解析失败（损坏 EPUB/ZIP 等）不崩溃书架，提示后返回空
		let infos;
		try {
			infos = await this.parser.getChapterList();
		} catch (error) {
			vscode.window.showInformationMessage(
				`无法解析该书: ${error instanceof Error ? error.message : String(error)}`
			);
			console.error('解析章节列表失败', this.fullPath, error);
			return [];
		}
		this.chapterList = infos.map((info, i) => {
			return new Chapter(this, info, !!this.readList[i] || false);
		});

		// 是否需要隐藏已读章节（新 key 显式值 → 旧 key 显式值 → 默认，P2-05）
		const showRead = getStateDefault<boolean | undefined>(
			SHOW_READ_CHAPTER_KEY,
			undefined
		);
		const isShowRead =
			showRead !== undefined
				? showRead
				: getStateDefault(IS_SHOW_READ_CHAPTER_KEY, false);
		if (!isShowRead) {
			this.unreadList = this.chapterList.filter((e) => !e.isRead);
			this.haveReadList = this.chapterList.filter((e) => e.isRead);
			return [
				new ChapterGroup('已读章节', this.haveReadList),
				new ChapterGroup('未读章节', this.unreadList),
			];
		}
		return this.chapterList;
	}

	/**
	 * 设置某个章节为已读章节
	 * @param i 章节下标
	 */
	setReadChapter(i: number) {
		this.readList[i] = 1; // 数据转化为 json，所以 1 比 true 更合适
		const svc = getProgressService();
		if (svc) {
			void svc.saveReadList(this.bookId, this.readList);
		}
		// 旧 key 保留兼容窗口（不再 setSync，含路径状态不再跨设备同步）
		setState(readListKey(this.label), this.readList);
	}

	clearReadChapter() {
		this.readList = [];
		const svc = getProgressService();
		if (svc) {
			void svc.saveReadList(this.bookId, []);
		}
		setState(readListKey(this.label), []);
	}
}
