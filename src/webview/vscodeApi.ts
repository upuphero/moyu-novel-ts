/**
 * WebView ⇄ Host 消息通道（迁移自 static/js/vscodeApi.js，Phase 8，P8-02/04/05）。
 * - postMsg 使用 contract 类型（WebviewToHostMessage），单向发送（P8-04：不再等待回执）；
 * - 所有外发 payload 均来自本地状态或输入框（WebView 侧无不可信来源）。
 */
import { dispatchCustomEvent, getScroll, currentParagraphIndex, chapterProgress } from "./dom";
import {
	SaveProgressData,
	WebviewToHostMessage,
	ChapterToggleType,
	ShowChapterData,
} from "../shared/contract";
import { ReaderSetting, WebviewCache } from "./types";

// acquireVsCodeApi 由 VS Code WebView 注入（types.ts 已声明全局）
const vscode = acquireVsCodeApi();

/**
 * 一些缓存数据,也可以理解为state,会调用vscode的api进行临时缓存
 * 不能持久保存
 */
export let cache: WebviewCache = {
	setting: {} as ReaderSetting,
	showChapter: {} as ShowChapterData,
	readScroll: 0,
};
// 方便调试
window.cache = cache;

export function getState(): unknown {
	return vscode.getState();
}

/**
 * 设置缓存（对 vscode.setState 的键值封装）
 */
export function setCache<K extends keyof WebviewCache>(key: K, value: WebviewCache[K]): void {
	cache[key] = value;
	vscode.setState(cache);
}

/**
 * 保存当前章节的滚动高度
 * @param scroll 滚动高度
 * @param isPostMsg 是否同时上报 extension（默认 true）
 */
export function saveScroll(scroll: number = getScroll(), isPostMsg = true): void {
	// 如果滚动高度未变化,则无意义
	if (scroll === cache.readScroll) return;
	setCache("readScroll", scroll);
	if (isPostMsg) {
		// P0-03-7：key 包含书身份，避免不同书/同名章节共用滚动位置
		const cur = cache?.showChapter || {};
		postMsg("saveScroll", { key: "catch_" + (cur.book || "") + "_" + (cur.title || ""), value: scroll });
	}
}

/** 从 WebviewToHostMessage 提取某类型消息的 data 参数类型 */
type MsgData<T extends WebviewToHostMessage["type"]> = Extract<
	WebviewToHostMessage,
	{ type: T }
>["data"];

/**
 * 发送消息（单向，P8-04：postMessage 返回值不等待；错误由 vscodeApi 内部捕获）
 */
export function postMsg<T extends WebviewToHostMessage["type"]>(
	type: T,
	data: MsgData<T>
): void {
	console.log("子页面-postMsg", type, data);
	try {
		vscode.postMessage({ type, data });
	} catch (error) {
		console.error("postMsg 失败", type, error);
	}
}

/**
 * 切换章节必须走的方法
 */
export const chapterToggle = (type: ChapterToggleType): void => {
	// P2-03：切换前上报当前语义进度（防丢失最后位置）
	const cur = cache?.showChapter || {};
	if (cur.bookId && cur.chapterId) {
		const data: SaveProgressData = {
			bookId: cur.bookId,
			chapterId: cur.chapterId,
			chapterIndex: cur.chapterIndex,
			paragraphIndex: currentParagraphIndex(),
			chapterProgress: chapterProgress(),
		};
		postMsg("saveProgress", data);
	}
	postMsg("chapterToggle", type);
	// 切换章节时,清除当前章节的缓存滚动高度
	saveScroll(0, false);
	// 清空选择
	document.getSelection()?.empty();
	dispatchCustomEvent("chapterToggle", { toggleType: type });
};
/** 下一章 */
export const nextChapter = (): void => void chapterToggle("next");
/** 上一章 */
export const prevChapter = (): void => void chapterToggle("prev");
