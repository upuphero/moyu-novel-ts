import * as vscode from "vscode";
import * as file from "./file/file";

import * as config from "./config";
import { setState, getExtensionUri, getStateDefault, sleep } from "./util/util";
import { command } from "./treeView/TreeViewProvider";
import { getTargetStaticDir } from "./file/file";
import { getProgressService } from "./core/progress/ProgressService";
import { ReadingProgress } from "./core/progress/types";
import { SAVE_SCROLL_KEY } from "./legacy/ids";

let content: vscode.ExtensionContext;

let panel: vscode.WebviewPanel | null = null;

// TODO: 暂时放这里
let isZenMode = false;

let titleTimer: NodeJS.Timeout;

function updateTitle() {
	clearInterval(titleTimer);
}

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

/** WebView 上报的进度（P2-03） */
interface SaveProgressData {
	bookId: string;
	chapterId: string;
	chapterIndex: number;
	paragraphIndex: number;
	chapterProgress: number;
}

/**
 * 计算恢复锚点（P2-04）：
 * 新进度（chapterId+paragraphIndex 优先，chapterProgress 次之）→ 旧 pixel（仅首次）→ 章节开头。
 */
function computeRestore(
	bookId: string,
	chapterId: string,
	chapterIndex: number,
	bookPath: string,
	title: string
): RestoreAnchor {
	const svc = getProgressService();
	if (svc) {
		const progress = svc.get(bookId);
		if (progress && progress.chapterId === chapterId) {
			return {
				paragraphIndex: progress.paragraphIndex,
				chapterProgress: progress.chapterProgress,
			};
		}
		if (progress && progress.chapterIndex === chapterIndex) {
			return { chapterProgress: progress.chapterProgress };
		}
	}
	// 首次（该书/该章无新进度）：旧 pixel 仅用于首次恢复并转写（P2-05）
	const scroll = getStateDefault<{ key: string; value: number }>(SAVE_SCROLL_KEY, {
		key: "",
		value: 0,
	});
	const key1 = "catch_" + bookPath + "_" + title;
	const key2 = "catch_" + title;
	if (scroll.key === key1 || scroll.key === key2) {
		return { pixel: scroll.value };
	}
	return {};
}

/**
 * 显示某一章
 * @param title 章节标题
 * @param list 清洗后的行数组
 * @param bookPath 书文件完整路径（同名章节去重与滚动 key 兼容）
 * @param bookId 稳定书 ID（P2-01）
 * @param chapterId 章节 ID（P2-01）
 * @param chapterIndex 章节序号
 */
export async function showChapter(
	title: string,
	list: string[],
	bookPath: string,
	bookId: string,
	chapterId: string,
	chapterIndex: number,
	highlight?: HighlightAnchor
) {
	const restore = computeRestore(bookId, chapterId, chapterIndex, bookPath, title);
	if (!panel) {
		// 初次显示 webView，则需要初始化显示滚动高度
		await createWebView();
		await initWebView(title, list, bookPath, bookId, chapterId, chapterIndex, restore, highlight);
		return;
	} else if (!panel.visible) {
		// 如果当前 webView 存在，并且被隐藏了，则显示
		panel.reveal();
	}
	await postMsg("showChapter", {
		title,
		list,
		book: bookPath,
		bookId,
		chapterId,
		chapterIndex,
		restore,
		highlight,
	});
}

/**
 * 创建
 */
export async function createWebView() {
	const { getContent } = await import("./index");
	content = getContent();
	// 存储 panel 相关文件的目录
	const uri = vscode.Uri.joinPath(content.globalStorageUri, getTargetStaticDir());

	panel = vscode.window.createWebviewPanel(
		"novel", // 标识 webview 的类型。在内部使用
		"阅读", // 标题
		vscode.ViewColumn.Active, // 编辑器列以显示新的 webview 面板
		{
			localResourceRoots: [uri],
			// 启用 javascript
			enableScripts: true,
			// 查找
			enableFindWidget: true,
		}
	);
	const webview = panel.webview;
	panel.iconPath = vscode.Uri.joinPath(getExtensionUri(), "/img/fish2.png");
	webview.html = await getWebviewContent(uri);
	// 关闭事件
	panel.onDidDispose(onDidDispose, null, content.subscriptions);
	// 消息事件
	webview.onDidReceiveMessage(onMessage, null, content.subscriptions);
}
// 初始化样式设置
async function initWebView(
	title: string,
	list: string[],
	bookPath: string,
	bookId: string,
	chapterId: string,
	chapterIndex: number,
	restore: RestoreAnchor,
	highlight?: HighlightAnchor
) {
	const readSetting = config.get("readSetting", {});
	const themeSetting = config.get("theme", {
		use: 0,
		custom: [] as Record<string, string | number>[],
	});
	if (themeSetting) {
		themeSetting.custom = themeSetting.custom || [];
	}
	console.warn(themeSetting);

	const setting = {
		...readSetting,
		theme: themeSetting,
	};
	await postMsg("showChapter", {
		title,
		list,
		book: bookPath,
		bookId,
		chapterId,
		chapterIndex,
		restore,
		highlight,
	});
	await postMsg("setting", setting);
}

/**
 * 获取 panel 的内容
 */
async function getWebviewContent(uri: vscode.Uri) {
	let s = "";
	// 读取文件，显示
	s = await file.getWebViewHtml();
	// 替换某些特定的值（路径）
	s = s.replace(/(#csp)/g, () => {
		return panel!.webview.cspSource;
	});
	s = s.replace(/(@)(.+?)/g, (_m, _sign, $2) => {
		return panel!.webview.asWebviewUri(vscode.Uri.joinPath(uri, $2)).toString();
	});
	return s;
}

/**
 * 发送消息
 * @param type 操作类型
 * @param data 数据
 */
async function postMsg(type: string, data: any) {
	try {
		// FIXME(Phase 8, P8-04): 移除 Promise.race + sleep(5) 临时绕过，改为 request/response ID
		await Promise.race([
			// 发送消息
			panel!.webview.postMessage({ type, data }),
			// 最多等待 5ms
			sleep(5),
		]);
	} catch (error) {
		console.error(error);
	}
}
/**************************************
		接收消息，以及处理
***************************************/
async function onDidDispose() {
	// 执行这个的时候 webView 已经不可用
	panel = null;
	console.log("已关闭panel");
}

/**
 * 类型，只支持上下，效果是切换上下章
 */
type chapterToggleType = "next" | "prev";

type scrollInfo = {
	key: string;
	value: number;
};

/** P0-10：数值边界（与 package.json 配置 schema 对齐） */
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 10;

/** 校验 WebView 上报的进度数据（P2-03/P0-10） */
function isValidSaveProgress(data: unknown): data is SaveProgressData {
	if (!data || typeof data !== "object") return false;
	const d = data as Record<string, unknown>;
	return (
		typeof d.bookId === "string" &&
		typeof d.chapterId === "string" &&
		typeof d.chapterIndex === "number" &&
		Number.isInteger(d.chapterIndex) &&
		d.chapterIndex >= 0 &&
		typeof d.paragraphIndex === "number" &&
		Number.isInteger(d.paragraphIndex) &&
		d.paragraphIndex >= 0 &&
		typeof d.chapterProgress === "number" &&
		d.chapterProgress >= 0 &&
		d.chapterProgress <= 1
	);
}

/** P0-10：来自 WebView 的消息处理表；所有入口均做边界校验 */
export let fn = {
	chapterToggle(type: chapterToggleType) {
		console.log("chapterToggle执行", type);
		try {
			if (type === "next") {
				command.nextChapter();
			} else {
				command.prevChapter();
			}
		} catch (error) {
			console.error(error);
			vscode.window.showInformationMessage(`切换章节操作${type}不存在`);
		}
	},
	zoom(v: unknown) {
		// P0-10：仅接受有限数字并限制范围
		if (typeof v !== "number" || !Number.isFinite(v)) return;
		const zoom = Math.min(Math.max(v, ZOOM_MIN), ZOOM_MAX);
		config.set("readSetting.zoom", zoom);
	},
	/**
	 * 更新阅读设置（P0-10：key 白名单，任意消息不能更新未允许的配置）
	 */
	updateReadSetting(data: { key?: unknown; value?: unknown }) {
		if (!data || typeof data !== "object") return;
		const key = data.key;
		if (typeof key !== "string" || !config.ALLOWED_READ_SETTING_KEYS.has(key)) {
			console.warn("updateReadSetting 拒绝未授权 key:", key);
			return;
		}
		const value = data.value;
		if (typeof value !== "number" && typeof value !== "string") return;
		console.log("updateReadSetting", { key, value });
		config.set(key, value);
	},

	/**
	 * 保存语义进度（P2-03：新主锚点，不再依赖 pixel）
	 */
	saveProgress(data: unknown) {
		if (!isValidSaveProgress(data)) {
			console.warn("saveProgress 数据非法:", data);
			return;
		}
		const svc = getProgressService();
		if (!svc) return;
		const progress: ReadingProgress = {
			schemaVersion: 1,
			bookId: data.bookId,
			chapterId: data.chapterId,
			chapterIndex: data.chapterIndex,
			paragraphIndex: data.paragraphIndex,
			chapterProgress: data.chapterProgress,
			updatedAt: Date.now(),
		};
		void svc.save(progress);
	},

	/**
	 * 保存滚动高度（P2-05 兼容窗口：旧 pixel 仅用于首次恢复并转写新进度）
	 */
	saveScroll(data: scrollInfo) {
		if (!data || typeof data !== "object") return;
		const key = typeof data.key === "string" ? data.key : "";
		const value =
			typeof data.value === "number" && Number.isFinite(data.value)
				? data.value
				: 0;
		setState("saveScroll", { key, value });
	},
	/** 切换禅模式 */
	toggleZenMode({ onlyNotice = false }: { onlyNotice?: boolean } = {}) {
		if (!onlyNotice) {
			vscode.commands.executeCommand("workbench.action.toggleZenMode");
		}
		console.warn("toggleZenMode");
		isZenMode = !isZenMode;
		if (isZenMode) {
			titleTimer = setInterval(updateTitle, 1000);
		}
	},
	/**
	 * 更改使用的主题
	 */
	changeUseTheme(data: unknown) {
		if (typeof data !== "number" || !Number.isInteger(data) || data < 0) return;
		config.set("theme.use", data);
	},
	/**
	 * 编辑主题（占位，暂不实现）
	 */
	editTheme(_data: scrollInfo) {
		// 保留空实现；主题编辑属于 backlog
	},
};

type MessageHandle = typeof fn;

export type MessageTypes = keyof MessageHandle;
type Message<T extends MessageTypes> = {
	type: T;
	data: Parameters<MessageHandle[T]>[0];
};
async function onMessage<T extends MessageTypes>(e: Message<T>) {
	// TODO: 日志
	console.log("收到webView message:  ", e);
	// FIXME: 类型推断问题，Phase 8 改为完整 runtime validation
	fn[e.type]?.(e.data as never);
}

export async function closeWebView() {
	if (panel) {
		panel.dispose();
		panel = null;
	}
}
