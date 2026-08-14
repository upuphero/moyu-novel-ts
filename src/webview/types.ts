/**
 * WebView 侧类型（替代 static/js/index.d.ts，Phase 8，P8-02）。
 * 消息形状从 src/webview/contract.ts 导入（单一事实来源）。
 */
import { ShowChapterData, SettingData, ThemeItem } from "../shared/contract";

/** acquireVsCodeApi（VS Code WebView 注入的全局） */
declare global {
	/* eslint-disable no-unused-vars */
	// eslint-disable-next-line no-var
	var acquireVsCodeApi: () => {
		getState(): unknown;
		setState(state: unknown): void;
		postMessage(message: unknown): void;
	};
	var cache: WebviewCache;
	/* eslint-enable no-unused-vars */
}

/** WebView 侧缓存的阅读设置（setting 载荷 + 补充字段） */
export interface ReaderSetting extends SettingData {
	scrollSpeed?: number;
	scrollEndTime?: number;
	scrollStartTime?: number;
}

/** 缓存数据（会调用 vscode.setState 临时缓存，不持久保存） */
export interface WebviewCache {
	setting: ReaderSetting;
	showChapter: ShowChapterData;
	readScroll: number;
	/** P6：总章数（含头部；空书防御） */
	totalChapters?: number;
}

/** dom 元素集合（initEl 返回值；类型由 NotNull 推断） */
export type NotNull<T> = { [P in keyof T]: T[P] & {} };

export { ThemeItem };
