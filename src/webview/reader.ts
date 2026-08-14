/**
 * Reader 主逻辑（迁移自 static/js/webView.js，Phase 8，P8-02/04/05）。
 * - 消息接收统一走 contract 校验（P8-05）：非法 payload 告警并忽略，不 panic；
 * - 渲染、恢复锚点、搜索高亮、进度条、键盘/按钮装配。
 */
import { cache, getState, postMsg, saveScroll, setCache, nextChapter, prevChapter } from "./vscodeApi";
export { nextChapter, prevChapter };
import {
	el,
	getScroll,
	setScroll,
	isPageEnd,
	nextPageOrChapter,
	prevPageOrChapter,
	dispatchCustomEvent,
	getStyleRule,
	updateHeaderTime,
	updateBtn2Area,
	currentParagraphIndex,
	chapterProgress,
	scrollToParagraph,
} from "./dom";
import { autoScrollScreen, scrollFunc } from "./scroll";
import { getThemeStyleRule } from "../shared/theme";
import {
	isValidHostMessage,
	SettingData,
	RestoreAnchor,
	ShowChapterData,
} from "../shared/contract";

/** 每次重新渲染(调用render方法)加1 */
export let renderId = 0;
export const isFirstRender = (): boolean => renderId <= 1;

/* ---------------- setting ---------------- */
/**
 * 处理来自 Extension Host 的消息（P8-05：先校验，非法忽略并告警）。
 */
function handleHostMessage(msg: unknown): void {
	if (!isValidHostMessage(msg)) {
		console.warn("忽略非法 Host 消息:", msg);
		return;
	}
	const { type, data } = msg;
	console.log("子页面-message", type, data);
	switch (type) {
		case "setting":
			onSetting(data);
			break;
		case "showChapter":
			onShowChapter(data);
			break;		case "readScroll":
			onReadScroll(data);
			break;
	}
}

/** 设置公共设置（行高/行间隔/字体大小等） */
function onSetting(data: SettingData): void {
	setCache("setting", data as never);
	// 这里多一个.body,以达到更高匹配级别
	el.sheet.sheet!.insertRule(`.body .main .content div{
			text-indent: ${data.lineIndent}em;
			font-size:1rem;
	}`);
	// 动态注入一些css变量
	el.sheet.sheet!.insertRule(`:root:root{
		--rootFontSize: ${data.rootFontSize}px;
		--zoom: ${data.zoom};
	}`);
	changeTheme((data.theme && data.theme.use) || 0);
	if (data.titleCenter) {
		// 居中模式：不启用左侧时间
	} else {
		setInterval(updateHeaderTime, 1000);
		updateHeaderTime();
		el.nav.classList.add("left");
	}
	document.body.className = `body init screenDirection-${data.screenDirection || 1}`;
}

/* ---------------- showChapter ---------------- */

function onShowChapter(data: ShowChapterData): void {
	// P0-03-7：同时比较书身份（book），不再只按章节标题去重
	const last = cache.showChapter || {};
	if (data.title === last.title && data.book === last.book) {
		return;
	}
	setCache("showChapter", data);
	// P6：缓存总章数（含头部；空书防御）
	cache.totalChapters =
		typeof data.totalChapters === "number" && data.totalChapters > 0
			? data.totalChapters
			: 0;
	render(data.title, data.list);
	// 初次渲染后,renderId 是1
	if (!isFirstRender()) {
		setScroll(0);
	} else {
		updateBtn2Area();
	}
	renderId++;
	// P5-04：搜索结果高亮优先于恢复锚点
	if (data.highlight && typeof data.highlight.paragraphIndex === "number") {
		applyHighlight(data.highlight.paragraphIndex, data.highlight.keyword);
	} else {
		// P2-04：应用恢复锚点（段落 → 本章进度 → 旧 pixel）
		applyRestore(data.restore || {});
	}
	// P6：切章后立即更新进度条
	scheduleProgressUpdate();
	setTimeout(() => {
		dispatchCustomEvent("showChapterAfter", data as unknown as Record<string, unknown>);
	}, 0);
}

/** 只会被插件层调用 */
function onReadScroll(data: number): void {
	if (typeof data !== "number" || !Number.isFinite(data)) {
		return;
	}
	// 在刚刚调用render,还没有实际渲染的时候,
	// 滚动到超出目前的高度,是不生效的
	// 这里只需要一个渲染后的时机,settimeout和requestAnimationFrame是差不多的
	requestAnimationFrame(setScroll.bind(null, data));
	saveScroll(data, false);
}

/* ---------------- theme ---------------- */

export function changeTheme(index: number): void {
	cache.setting.theme = cache.setting.theme || { use: 0, custom: [] };
	cache.setting.theme.use = index;
	const sheet = el.sheet.sheet!;
	const rule = getStyleRule(":root:root:root");

	// 使用系统默认主题
	if (index !== 0) {
		const themes = cache.setting.theme.custom || [];
		const theme = themes[index - 1];
		const ruleContent = getThemeStyleRule(theme);
		// 使用自定义主题
		if (rule) rule.style.cssText = ruleContent;
		else {
			sheet.insertRule(`:root:root:root{${ruleContent}}`);
		}
	} else if (rule) {
		rule.style.cssText = "";
	}
}

/* ---------------- progress bar（P6） ---------------- */

let progressRaf = 0;

/**
 * 更新底部阅读进度条（P6-02/03）。
 * 公式与 core/progress/progressBar.ts 一致：
 * 全书% = (chapterIndex + chapterProgress) / totalChapters（空书不除零）。
 * 每次 scroll 最多每动画帧更新一次（rAF 合并）。
 */
function updateProgressBar(): void {
	const cur = cache.showChapter || {};
	if (!el.progressBar) return;
	const total = cache.totalChapters || 0;
	const index =
		typeof cur.chapterIndex === "number" && cur.chapterIndex >= 0
			? cur.chapterIndex
			: 0;
	const cp = chapterProgress();
	const bp = total > 0 ? Math.min(1, Math.max(0, (index + cp) / total)) : 0;
	if (el.progressBarFill) {
		el.progressBarFill.style.width = (bp * 100).toFixed(2) + "%";
	}
	if (el.progressBarText) {
		el.progressBarText.textContent =
			total > 0
				? `${index + 1} / ${total} 章 · 本章 ${Math.round(cp * 100)}% · 全书 ${Math.round(bp * 100)}%`
				: "";
	}
}

/** rAF 合并调度（P6-03：每帧最多一次 DOM 写） */
function scheduleProgressUpdate(): void {
	if (progressRaf) return;
	progressRaf = requestAnimationFrame(() => {
		progressRaf = 0;
		updateProgressBar();
	});
}

/* ---------------- restore / highlight / progress report ---------------- */

/**
 * 应用搜索结果高亮（P5-04）：仅高亮指定段落中的关键词，并滚动到该段落。
 * 安全：使用 textContent 构建（P0-10 文本安全渲染路径，不解析用户输入为 HTML）。
 */
function applyHighlight(paragraphIndex: number, keyword: string): void {
	const div = el.content.children[paragraphIndex] as HTMLElement | undefined;
	if (!div || !keyword) return;
	const text = div.textContent || "";
	const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
	if (idx < 0) return;
	const before = text.slice(0, idx);
	const match = text.slice(idx, idx + keyword.length);
	const after = text.slice(idx + keyword.length);
	// 重建节点（textContent 赋值保证关键词不被当作 HTML 执行）
	div.textContent = "";
	const b = document.createElement("span");
	b.textContent = before;
	const m = document.createElement("mark");
	m.className = "search-highlight";
	m.textContent = match;
	const a = document.createElement("span");
	a.textContent = after;
	div.appendChild(b);
	div.appendChild(m);
	div.appendChild(a);
	scrollToParagraph(paragraphIndex);
}

/**
 * 应用恢复锚点（P2-04）：段落 → 本章进度 → 旧 pixel（首次恢复）→ 顶部。
 * 应用后上报一次当前段落，完成"旧 pixel 转写新进度"。
 */
function applyRestore(restore: RestoreAnchor): void {
	if (typeof restore.paragraphIndex === "number" && restore.paragraphIndex >= 0) {
		scrollToParagraph(restore.paragraphIndex);
	} else if (typeof restore.chapterProgress === "number") {
		setScroll(
			Math.round(
				restore.chapterProgress *
					(el.main.scrollHeight - el.main.clientHeight)
			)
		);
	} else if (typeof restore.pixel === "number" && Number.isFinite(restore.pixel)) {
		setScroll(restore.pixel);
	} else {
		setScroll(0);
	}
	requestAnimationFrame(reportProgress);
}

/**
 * 上报当前阅读位置（P2-03：paragraphIndex + chapterProgress 为新主锚点）
 */
function reportProgress(): void {
	const cur = cache.showChapter || {};
	if (!cur.bookId || !cur.chapterId) return;
	postMsg("saveProgress", {
		bookId: cur.bookId,
		chapterId: cur.chapterId,
		chapterIndex: cur.chapterIndex,
		paragraphIndex: currentParagraphIndex(),
		chapterProgress: chapterProgress(),
	});
}

/* ---------------- render ---------------- */

function render(title: string, lines: string[]): void {
	el.title.innerText = title;
	el.navTitle.innerText = title;
	el.navTitle.title = title;
	const list = el.content.children;
	el.content.style.display = "none";
	if (list.length < lines.length) {
		addLine(lines.length - list.length);
	}

	// 循环添加数据
	for (let i = 0; i < list.length; i++) {
		const item = list[i] as HTMLElement;
		if (i < lines.length) {
			item.innerText = lines[i];
			item.dataset.i = String(i);
			item.style.cssText = "";
		} else {
			item.style.display = "none";
		}
	}

	el.content.style.display = "block";
	// 修改渲染id,告诉其他人我重新渲染了
	renderId++;
}

/** 在行不够用的情况下添加行 */
function addLine(num: number): void {
	for (let i = 0; i < num; i++) {
		el.content.appendChild(document.createElement("div"));
	}
}

/* ---------------- 装配（DOMContentLoaded） ---------------- */

export function setupReader(): void {
	window.addEventListener("message", (e) => {
		handleHostMessage(e.data);
	});
	/**********************************
		  判断是否是隐藏后重新显示
	 **********************************/
	const data = getState();
	if (data) {
		console.warn("是隐藏后的", data);
		const state = data as Record<string, unknown>;
		for (const item in state) {
			if (item === "setting") {
				const v = state[item] as SettingData;
				if (v && v.lineIndent !== undefined) onSetting(v);
			} else if (item === "showChapter") {
				onShowChapter(state[item] as ShowChapterData);
			} else if (item === "readScroll") {
				onReadScroll(state[item] as number);
			}
		}
	}

	/*********************************
		换章和其他需要和拓展交互的功能
	**********************************/
	window.onkeydown = function (e) {
		const flag = e.altKey || e.shiftKey || e.ctrlKey || e.metaKey;
		switch (e.key.toLowerCase()) {
			case "arrowright": //下一章
			case !flag && "d":
				return nextChapter();
			case "arrowleft": //上一章
			case !flag && "a":
				return prevChapter();
			case "arrowdown": //向下翻页
			case !flag && "s":
				return nextPageOrChapter(e);
			case "arrowup": //向上翻页
			case !flag && "w":
				return prevPageOrChapter(e);
			//检查是否触底,如果触底,下一章,没有则向下
			case " ":
				return nextPageOrChapter(e);
			case ".":
				// 多判断一下是不是数字键盘的.
				if (e.code === "NumpadDecimal") {
										let count = 60;
					const maxCount = count * 0.33;
					const fn = (): void => {
						let v = 5 * Math.min(count / maxCount, 1) * 1.05;
						setScroll(getScroll() + v);
						if (count--) {
							requestAnimationFrame(fn);
						} else {
							saveScroll();
						}
					};
					fn();
				}
				break;
		}
	};
	window.onmouseup = function (e) {
		switch (e.button) {
			case 1:
			case 4:
				return prevChapter();
			case 3:
				return nextChapter();
		}
	};

	document.querySelector<HTMLElement>(".footer .btn-box .prev")!.onclick = prevChapter;
	document.querySelector<HTMLElement>(".footer .btn-box .next")!.onclick = nextChapter;
	document.querySelector<HTMLElement>(".nav button.prev")!.onclick = prevChapter;
	document.querySelector<HTMLElement>(".nav button.next")!.onclick = nextChapter;
	el.content.ondblclick = autoScrollScreen;
	el.sideNextBtns.forEach((e) => {
		// TODO: 增加防抖???
		if (!e.onclick) e.onclick = () => void nextPageOrChapter();
		// 暂时继续使用局部滚动
		e.addEventListener("mousewheel", (ev) => scrollFunc(ev as WheelEvent, true));
		// 拦截双击
		e.ondblclick = (ev) => ev.stopPropagation();
	});

	/**
	 * scrollAntiShake里面包含了业务逻辑
	 */
	let scrollTimer = 0;
	el.main.addEventListener("scroll", () => {
		clearTimeout(scrollTimer);
		scrollTimer = window.setTimeout(scrollAntiShake, 50);
	});
	function scrollAntiShake(): void {
		if (isPageEnd()) {
			el.sideNextBtns.forEach((e) => e.classList.add("right"));
		} else {
			el.sideNextBtns.forEach((e) => {
				e.classList.remove("right");
			});
		}
		// P2-03：滚动防抖后上报语义进度（段落 + 本章百分比）
		reportProgress();
		// P6-03：rAF 合并更新进度条（每帧最多一次）
		scheduleProgressUpdate();
	}
}

