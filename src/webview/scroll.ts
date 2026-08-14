/**
 * 滚动逻辑（迁移自 static/js/scroll.js，Phase 8，P8-02）。
 * 自动滚屏、缩放、滚轮处理。
 */
import {
	cache,
	saveScroll,
	postMsg,
	nextChapter,
	setCache,
} from "./vscodeApi";
import {
	el,
	getScroll,
	getStyleRule,
	setScroll,
	updateBtn2Area,
} from "./dom";
import { renderId } from "./reader";
import { toFixed } from "./util";

/**  0未滚动 1等待结束  2等待开始  3正在滚动 */
let scrollType = 0;
const timer = {
	scroll: 0, // 滚屏用的计时器
	toggle: 0, // 换章用的计时器
};
let num = 0; // 当前滚动高度
let max = 0; // 窗口最大高度
let h = 0; // 窗口高度

let lastRenderId = -1;

/**
 * 自动滚屏
 */
export function autoScrollScreen(): void {
	clearTimeout(timer.toggle);
	clearInterval(timer.scroll);
	// 如果当前非滚屏状态,则进入滚屏状态
	if (scrollType === 0 || scrollType === 2) {
		timer.scroll = window.setInterval(scroll, getIntervalTime());
		scrollType = 3;
		scroll(); // 直接执行一次,如果是触底时,可以直接初始化状态
	} else {
		scrollType = 0;
	}
}

// 问题是每多少时间向下移动1
// 这个时间如果高于10,则可能会产生滚动一卡一卡的感觉(视觉效果)
// 以人眼24帧为标准 72, 96, 120, 144, 168, 192
function scroll(v = 1): void {
	// 检查更新尺寸信息,仅在初始化和重新渲染后才更新尺寸信息
	// P0-03-8：更新 lastRenderId，避免每个滚动 tick 都重算尺寸
	if (lastRenderId !== renderId) {
		max = el.main.scrollHeight;
		h = el.main.clientHeight;
		lastRenderId = renderId;
	}

	num = getScroll() + v;
	setScroll(num);
	if (num > max - h) {
		scrollEnd();
	} else if (num > cache.readScroll + 200) {
		// 每200高度,保存一次当前滚动高度
		saveScroll(num);
	}
}

function scrollEnd(): void {
	// 章节结束
	clearInterval(timer.scroll);
	clearTimeout(timer.toggle);
	scrollType = 1;
	timer.toggle = window.setTimeout(() => {
		// 下一章
		nextChapter();
		scrollRestart();
	}, cache.setting.scrollEndTime || 3000);
}

/** 章节结束后的重新开始 */
function scrollRestart(): void {
	scrollType = 2;
	timer.toggle = window.setTimeout(() => {
		// 开始滚屏
		autoScrollScreen();
	}, cache.setting.scrollStartTime || 3000);
}

window.addEventListener("chapterToggle", function () {
	if (scrollType !== 0) {
		clearInterval(timer.scroll);
		clearTimeout(timer.toggle);
		scrollRestart();
	}
});

// 获取间隔时间
function getIntervalTime(): number {
	const scrollSpeed = cache.setting.scrollSpeed || 96;
	return Math.round(1000 / scrollSpeed);
}

/***************
	 缩放逻辑
****************/

let zoomEl = document.querySelector<HTMLElement>(".zoom")!;
let zoomTimer = 0;
let scrollEndTimer = 0;
// 隐藏zoom框
const hideZoom = (): void => {
	zoomEl.classList.remove("on");
	zoomEl.style.opacity = "0";
};
function showZoom(size: number, zoom: number): void {
	zoomEl.innerText = `${size}px ${(zoom * 100).toFixed(0)}%`;
	zoomEl.style.cssText = "display:flex;opacity:1;";
	zoomEl.classList.add("on");
	zoomEl.ontransitionend = () => {
		zoomEl.style.display = "none";
	};
	clearTimeout(zoomTimer);
	zoomTimer = window.setTimeout(hideZoom, 1500);
}

// 滚动滑轮触发scrollFunc方法
document.addEventListener("mousewheel", scrollFunc as EventListener);

export function scrollFunc(e: WheelEvent, isScroll?: boolean): void {
	// 如果是ctrl+滚轮,则放大或缩小显示
	if (e.ctrlKey) {
		// 先计算出新的缩放比例
		let zoom = +(cache.setting.zoom ?? 1);
		const n = (e as unknown as { wheelDelta: number }).wheelDelta > 0;
		let size = 0.1;
		if (zoom > 1.5 || (n && zoom >= 1.5)) size = 0.25;
		let newValue = zoom + size * (n ? 1 : -1);
		// 不是整的,则取整
		if (newValue / size - ~~(newValue / size)) {
			newValue = toFixed(newValue / size, 0) * size;
		}
		updateZoom(newValue);
		return;
	} else if (scrollType !== 0) {
		// 如果处于自动滚屏状态,需要用这个进行滚屏
		scroll((e as unknown as { wheelDelta: number }).wheelDelta * -1);
	} else {
		if (isScroll) {
			setScroll(el.main.scrollTop + (e as unknown as { wheelDelta: number }).wheelDelta * -1 * 0.8);
			e.preventDefault();
			e.stopPropagation();
		}
		// 记录当前滚动高度,并存储（防抖 300ms）
		clearTimeout(scrollEndTimer);
		scrollEndTimer = window.setTimeout(saveScroll, 300);
	}
}

let zoomSaveTimer: number | undefined;

export function updateZoom(zoom: number): void {
	zoom = toFixed(zoom);
	// 判断值是否合法
	if (zoom < 0.4 || zoom > 10) {
		zoom = zoom > 10 ? 10 : 0.4;
		const oldZoom = cache.setting.zoom;
		if (zoom === oldZoom) return;
	}
	clearTimeout(zoomSaveTimer);
	zoomSaveTimer = window.setTimeout(() => postMsg("zoom", zoom), 600);
	// 保存
	cache.setting.zoom = zoom;
	setCache("setting", cache.setting);
	// 应用
	const rule = getStyleRule(":root:root");
	if (rule) {
		const oldRoot = rule.style.getPropertyValue("--rootFontSize");
		rule.style.cssText = `--rootFontSize: ${oldRoot || "20px"}; --zoom: ${zoom};`;
	}
	// 显示
	showZoom(toFixed((cache.setting.rootFontSize || 20) * zoom), zoom);
	updateBtn2Area();
}
