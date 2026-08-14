/**
 * WebView ⇄ Extension Host 共享消息 contract（Phase 8，P8-01）。
 *
 * - 单一事实来源：两侧都从本文件导入类型与校验函数；
 * - runtime validation（P8-05）：所有进入处理器的 payload 先过校验函数，
 *   非法 payload 拒绝并告警（不 panic）；
 * - 不再依赖 any 形状的消息：`Message<T>` 在两侧都是强类型。
 *
 * 纯逻辑模块（不 import vscode / DOM），可脱离 VS Code 单测。
 */

/* ---------------- Host → WebView ---------------- */

/** 恢复锚点（P2-04 fallback 链：paragraphIndex → chapterProgress → pixel） */
export interface RestoreAnchor {
	paragraphIndex?: number;
	chapterProgress?: number;
	pixel?: number;
}

/** 搜索结果高亮锚点（P5-04） */
export interface HighlightAnchor {
	keyword: string;
	paragraphIndex: number;
}

/** showChapter 载荷（含 P6 进度条所需的 totalChapters） */
export interface ShowChapterData {
	title: string;
	list: string[];
	/** 书文件完整路径（同名章节去重身份，P0-03-7） */
	book: string;
	bookId: string;
	chapterId: string;
	chapterIndex: number;
	restore?: RestoreAnchor;
	highlight?: HighlightAnchor;
	totalChapters?: number;
}

/** 阅读设置（setting 载荷） */
export interface SettingData {
	lineIndent?: number;
	rootFontSize?: number;
	titleSize?: number;
	zoom?: number;
	scrollSpeed?: number;
	scrollEndTime?: number;
	scrollStartTime?: number;
	titleCenter?: boolean;
	screenDirection?: 1 | 2 | 3 | 4;
	theme?: {
		use: number;
		custom: ThemeItem[];
	};
}

/** 主题项（P8-05：颜色值安全渲染，见 sanitizeTheme） */
export interface ThemeItem {
	name: string;
	bg?: string;
	color?: string;
	btnBg?: string;
	btnColor?: string;
	btnActive?: string;
	btnActiveBorder?: string;
	navBg?: string;
	textColor?: string;
	/** 历史拼写错误 key（P0-08 alias） */
	fontWidght?: string;
	fontWidth?: string;
	fontFamily?: string;
}

export type HostToWebviewMessage =
	| { type: "showChapter"; data: ShowChapterData }
	| { type: "setting"; data: SettingData }
	| { type: "readScroll"; data: number };

/* ---------------- WebView → Host ---------------- */

export type ChapterToggleType = "next" | "prev";

export interface SaveProgressData {
	bookId: string;
	chapterId: string;
	chapterIndex: number;
	paragraphIndex: number;
	chapterProgress: number;
}

export interface SaveScrollData {
	key: string;
	value: number;
}

export interface UpdateReadSettingData {
	key: string;
	value: number | string;
}

export type WebviewToHostMessage =
	| { type: "chapterToggle"; data: ChapterToggleType }
	| { type: "zoom"; data: number }
	| { type: "updateReadSetting"; data: UpdateReadSettingData }
	| { type: "saveProgress"; data: SaveProgressData }
	| { type: "saveScroll"; data: SaveScrollData }
	| { type: "toggleZenMode"; data?: { onlyNotice?: boolean } }
	| { type: "changeUseTheme"; data: number };

/* ---------------- runtime validation（P8-05） ---------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
	return !!v && typeof v === "object";
}

export function isRestoreAnchor(v: unknown): v is RestoreAnchor {
	if (!isRecord(v)) return false;
	if (
		v.paragraphIndex !== undefined &&
		!(typeof v.paragraphIndex === "number" && Number.isInteger(v.paragraphIndex) && v.paragraphIndex >= 0)
	) {
		return false;
	}
	if (
		v.chapterProgress !== undefined &&
		!(typeof v.chapterProgress === "number" && v.chapterProgress >= 0 && v.chapterProgress <= 1)
	) {
		return false;
	}
	if (v.pixel !== undefined && !(typeof v.pixel === "number" && Number.isFinite(v.pixel))) {
		return false;
	}
	return true;
}

export function isHighlightAnchor(v: unknown): v is HighlightAnchor {
	return (
		isRecord(v) &&
		typeof v.keyword === "string" &&
		typeof v.paragraphIndex === "number" &&
		Number.isInteger(v.paragraphIndex) &&
		v.paragraphIndex >= 0
	);
}

/** P0-10 数值边界（与 package.json 配置 schema 对齐） */
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 10;

export function isShowChapterData(v: unknown): v is ShowChapterData {
	if (!isRecord(v)) return false;
	return (
		typeof v.title === "string" &&
		Array.isArray(v.list) &&
		v.list.every((l) => typeof l === "string") &&
		typeof v.book === "string" &&
		typeof v.bookId === "string" &&
		typeof v.chapterId === "string" &&
		typeof v.chapterIndex === "number" &&
		Number.isInteger(v.chapterIndex) &&
		v.chapterIndex >= 0 &&
		(v.restore === undefined || isRestoreAnchor(v.restore)) &&
		(v.highlight === undefined || isHighlightAnchor(v.highlight)) &&
		(v.totalChapters === undefined ||
			(typeof v.totalChapters === "number" &&
				Number.isInteger(v.totalChapters) &&
				v.totalChapters >= 0))
	);
}

export function isThemeItem(v: unknown): v is ThemeItem {
	if (!isRecord(v)) return false;
	return typeof v.name === "string";
}

export function isSettingData(v: unknown): v is SettingData {
	if (!isRecord(v)) return false;
	if (v.theme !== undefined) {
		if (!isRecord(v.theme)) return false;
		const t = v.theme;
		if (
			typeof t.use !== "number" ||
			!Number.isInteger(t.use) ||
			t.use < 0 ||
			!Array.isArray(t.custom) ||
			!t.custom.every(isThemeItem)
		) {
			return false;
		}
	}
	for (const k of [
		"lineIndent",
		"rootFontSize",
		"titleSize",
		"zoom",
		"scrollSpeed",
		"scrollEndTime",
		"scrollStartTime",
	]) {
		if (v[k] !== undefined && typeof v[k] !== "number") return false;
	}
	// zoom 边界校验（前面已保证是 number；TS 收窄需要局部变量）
	const zoom = v.zoom;
	if (zoom !== undefined && typeof zoom === "number" && (zoom < ZOOM_MIN || zoom > ZOOM_MAX)) {
		return false;
	}
	if (v.titleCenter !== undefined && typeof v.titleCenter !== "boolean") return false;
	if (
		v.screenDirection !== undefined &&
		![1, 2, 3, 4].includes(v.screenDirection as number)
	) {
		return false;
	}
	return true;
}

export function isSaveProgressData(v: unknown): v is SaveProgressData {
	if (!isRecord(v)) return false;
	return (
		typeof v.bookId === "string" &&
		typeof v.chapterId === "string" &&
		typeof v.chapterIndex === "number" &&
		Number.isInteger(v.chapterIndex) &&
		v.chapterIndex >= 0 &&
		typeof v.paragraphIndex === "number" &&
		Number.isInteger(v.paragraphIndex) &&
		v.paragraphIndex >= 0 &&
		typeof v.chapterProgress === "number" &&
		v.chapterProgress >= 0 &&
		v.chapterProgress <= 1
	);
}

export function isSaveScrollData(v: unknown): v is SaveScrollData {
	return (
		isRecord(v) &&
		typeof v.key === "string" &&
		typeof v.value === "number" &&
		Number.isFinite(v.value)
	);
}

export function isUpdateReadSettingData(v: unknown): v is UpdateReadSettingData {
	return (
		isRecord(v) &&
		typeof v.key === "string" &&
		(typeof v.value === "number" || typeof v.value === "string")
	);
}

export function isZoomData(v: unknown): v is number {
	return typeof v === "number" && Number.isFinite(v);
}

export function isThemeUseData(v: unknown): v is number {
	return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

export function isChapterToggleData(v: unknown): v is ChapterToggleType {
	return v === "next" || v === "prev";
}

/**
 * Host→WebView 消息校验：非法 payload 返回 false（调用方记录并忽略）。
 */
export function isValidHostMessage(msg: unknown): msg is HostToWebviewMessage {
	if (!isRecord(msg) || typeof msg.type !== "string") return false;
	switch (msg.type) {
		case "showChapter":
			return isShowChapterData(msg.data);
		case "setting":
			return isSettingData(msg.data);
		case "readScroll":
			return typeof msg.data === "number" && Number.isFinite(msg.data);
		default:
			return false;
	}
}

/**
 * WebView→Host 消息校验：非法 payload 返回 false（extension 侧拒绝并告警）。
 */
export function isValidWebviewMessage(msg: unknown): msg is WebviewToHostMessage {
	if (!isRecord(msg) || typeof msg.type !== "string") return false;
	switch (msg.type) {
		case "chapterToggle":
			return isChapterToggleData(msg.data);
		case "zoom":
			return isZoomData(msg.data);
		case "updateReadSetting":
			return isUpdateReadSettingData(msg.data);
		case "saveProgress":
			return isSaveProgressData(msg.data);
		case "saveScroll":
			return isSaveScrollData(msg.data);
		case "toggleZenMode":
			return msg.data === undefined || (isRecord(msg.data) && typeof msg.data.onlyNotice === "boolean");
		case "changeUseTheme":
			return isThemeUseData(msg.data);
		default:
			return false;
	}
}
