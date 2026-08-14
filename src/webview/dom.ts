/**
 * DOM 操作层（迁移自 static/js/dom.js，Phase 8，P8-02）。
 * 只提供 dom 相关的操作,不包含业务逻辑。
 */
import { cache, nextChapter, prevChapter, saveScroll } from "./vscodeApi";
import { NotNull } from "./types";

/** 滚动冗余区间 */
const scrollThreshold = 10;

/** WebviewElements：initEl 返回值（NotNull 保证字段非空） */
export type WebviewElements = NotNull<ReturnType<typeof initEl>>;

/**
 * @type {WebviewElements}
 */
export let el: WebviewElements;

const sheet = document.createElement("style");
sheet.className = "theme-sheet";

document.head.appendChild(sheet);

export function initEl(): {
	main: HTMLElement;
	title: HTMLElement;
	content: HTMLElement;
	nav: HTMLElement;
	navTitle: HTMLElement;
	navTime: HTMLElement;
	sideNextBtns: NodeListOf<HTMLElement>;
	btn2: HTMLElement;
	sheet: HTMLStyleElement;
	progressBar: HTMLElement;
	progressBarFill: HTMLElement;
	progressBarText: HTMLElement;
} {
	const _el = {
		main: document.querySelector<HTMLElement>(".main")!,
		title: document.querySelector<HTMLElement>(".main .header .title")!,
		get content() {
			return document.querySelector<HTMLElement>(".main .content")!;
		},
		nav: document.querySelector<HTMLElement>(".nav")!,
		navTitle: document.querySelector<HTMLElement>(".nav .title")!,
		navTime: document.querySelector<HTMLElement>(".nav .time")!,
		sideNextBtns: document.querySelectorAll<HTMLElement>(".function-box .side-next-btn"),
		btn2: document.querySelector<HTMLElement>(".btn2")!,
		sheet,
		// P6：阅读进度条
		progressBar: document.querySelector<HTMLElement>(".progress-bar")!,
		progressBarFill: document.querySelector<HTMLElement>(".progress-bar-fill")!,
		progressBarText: document.querySelector<HTMLElement>(".progress-bar-text")!,
	};
	el = _el as unknown as WebviewElements;
	return _el as unknown as WebviewElements;
}

/** 获取主滚动区域的滚动高度 */
export const getScroll = (): number => el.main.scrollTop;
export const setScroll = (h: number): void => el.main.scrollTo(0, h);

/** 段落元素相对滚动容器顶部的偏移（hidden 段落视为 Infinity，避免二分命中） */
function paragraphTop(elm: HTMLElement): number {
	return elm.style.display === "none"
		? Infinity
		: elm.getBoundingClientRect().top - el.main.getBoundingClientRect().top;
}

/**
 * 当前视口顶部所在段落下标（P2-04）。
 * 段落 div 带 dataset.i（render 时设置）；布局变化后段落 identity 稳定。
 */
export function currentParagraphIndex(): number {
	const children = el.content?.children;
	if (!children || !children.length) return 0;
	let lo = 0;
	let hi = children.length - 1;
	let ans = 0;
	const scrollTop = el.main.scrollTop;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (paragraphTop(children[mid] as HTMLElement) <= scrollTop + 2) {
			ans = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return ans;
}

/** 本章进度 0..1（P2-03 fallback 锚点） */
export function chapterProgress(): number {
	const max = el.main.scrollHeight - el.main.clientHeight;
	return max > 0 ? Math.min(1, Math.max(0, el.main.scrollTop / max)) : 0;
}

/**
 * 滚动到指定段落（P2-04：段落顶部略留边距）。
 * 段落在 hidden 区（内容变少）时回退到本章进度/顶部。
 */
export function scrollToParagraph(pi: number): void {
	const children = el.content?.children;
	if (!children || !children.length) {
		setScroll(0);
		return;
	}
	const visible = Array.from(children).filter(
		(c) => (c as HTMLElement).style.display !== "none"
	) as HTMLElement[];
	if (!visible.length) {
		setScroll(0);
		return;
	}
	const target = visible[Math.min(pi, visible.length - 1)];
	const top = target.getBoundingClientRect().top - el.main.getBoundingClientRect().top;
	setScroll(Math.max(0, top - 10));
}

/**
 * 页面是否触底
 */
export function isPageEnd(curScroll: number = getScroll()): boolean {
	// 总滚动高度
	const h = el.main.scrollHeight;
	// 当前滚动top+元素可视大小(元素大小)
	const curH = curScroll + el.main.clientHeight;
	// 如果距离小于scrollThreshold.就认为触底了
	return h - curH < scrollThreshold;
}

/**
 * 上下翻页(一个屏幕)
 * @param direction 方向 1下 -1上
 * @param event 用来阻止默认行为
 */
export function scrollScreen(direction = 1, event?: Event): void {
	event?.preventDefault();
	const cur = getScroll();
	const h =
		el.main.clientHeight -
		el.nav.clientHeight -
		50 * (cache.setting?.zoom || 1);
	// 最大值不能超过总滚动高度
	const newH = Math.min(cur + h * direction, el.main.scrollHeight);
	el.main.scrollTo({
		left: 0,
		top: newH,
	});
	saveScroll(newH);
}

/**
 * 向下翻页,如果到页面底部则去下一章
 * @returns 是否翻章
 */
export function nextPageOrChapter(event?: Event): boolean {
	const flag = isPageEnd();
	if (flag) nextChapter();
	// 空格自带翻页效果
	else scrollScreen(1, event);
	return flag;
}

export function prevPageOrChapter(event?: Event): boolean {
	const flag = getScroll() < scrollThreshold;
	if (flag) {
		prevChapter();
		window.addEventListener(
			"showChapterAfter",
			function () {
				scrollScreen(1e10);
			},
			{ once: true }
		);
	}
	// 空格自带翻页效果
	else scrollScreen(-1, event);
	return flag;
}

/**
 * 迭代元素的所有父元素
 */
export function* elementParentIterator(el: Element | null): Generator<Element, null> {
	let curEl = el;
	while (curEl) {
		yield curEl;
		curEl = curEl?.parentElement;
	}
	return null;
}

/**
 * 格式化数字：n > 10 [12] => 12 | n < 10 [3] => '03'
 */
export function formatNumber(v: string | number): string {
	const num = v.toString();
	return num[1] ? num : "0" + num;
}

export function updateHeaderTime(): void {
	if (!el?.navTime) return;
	const oldTime = el?.navTime?.innerText;
	const date = new Date();
	const newTime = `${formatNumber(date.getHours() % 12)}:${formatNumber(
		date.getMinutes()
	)}`;
	if (newTime !== oldTime) el.navTime.innerText = newTime;
}

window.addEventListener("DOMContentLoaded", function () {
	initEl();
	// 时间显示
	handleBtn2Click();
});

/**
 * 发送自定义事件
 */
export function dispatchCustomEvent(
	eventName: string,
	eventProperty: Record<string, unknown> = {}
): void {
	const event = new Event(eventName, {
		bubbles: false,
	});
	// 拷贝一遍属性,某些属性名可能会拷贝失败,这里拦截一下
	for (const item in eventProperty) {
		try {
			(event as unknown as Record<string, unknown>)[item] = eventProperty[item];
		} catch (error) {
			console.log("eventProperty copy", error);
		}
	}
	window.dispatchEvent(event);
}

/**
 * 获取 css rule（按 selectorText 匹配）
 */
export function getStyleRule(selector: string): CSSStyleRule | null {
	const rules = el?.sheet?.sheet?.cssRules;
	for (let i = 0; i < (rules?.length || 0); i++) {
		const rule = rules![i] as CSSStyleRule;
		if (rule.selectorText === selector) {
			return rule;
		}
	}
	return null;
}

window.onresize = function () {
	updateBtn2Area();
};

const center = {
	x: 0,
	y: 0,
	size: 0,
};
const isArea = (e: MouseEvent): boolean => {
	return (
		Math.abs(e.x - center.x) < center.size &&
		Math.abs(e.y - center.y) < center.size
	);
};
export const updateBtn2Area = (init?: boolean): void => {
	// 已经初始化,不重复初始化
	if (init && center.size) return;
	if (!el.btn2) return;
	const area = el.btn2.getBoundingClientRect();
	center.x = area.x + area.width / 2;
	center.y = area.y + area.width / 2;
	center.size = area.width / 2;
};

window.addEventListener("load", () => {
	updateBtn2Area(true);
	setTimeout(() => {
		updateBtn2Area(true);
	}, 100);
});

function handleBtn2Click(): void {
	if (!el?.btn2) return;
	document.addEventListener(
		"click",
		(e) => {
			if (isArea(e)) {
				nextPageOrChapter();
				e.stopPropagation();
			}
		},
		true
	);
}
