/* eslint-env browser */
import { log, sleep } from "./util.js";

import {
	//
	getState,
	setCache,
	cache,
	saveScroll,
	postMsg,
	nextChapter,
	prevChapter,
} from "./vscodeApi.js";
import {
	//
	el,
	getScroll,
	setScroll,
	isPageEnd,
	scrollScreen,
	nextPageOrChapter,
	prevPageOrChapter,
	dispatchCustomEvent,
	getStyleRule,
	updateHeaderTime,
	updateBtn2Area,
	currentParagraphIndex,
	chapterProgress,
	scrollToParagraph,
} from "./dom.js";
import { autoScrollScreen, scrollFunc } from "./scroll.js";
import "./contextmenu.js";
import { getThemeStyleRule, showContextMenu } from "./contextmenu.js";
/** 每次重新渲染(调用render方法)加1 */
export let renderId = 0;
export const isFirstRender = () => renderId <= 1;

let themeSheetRuleIndex;

// 渲染id,其实就是渲染次数自增,用于判断是否重新渲染了以便于重新加载尺寸信息等
let fn = {
	undefined() {
		console.error("webView端找不到处理程序,无法执行");
	},
	/*设置一些公共设置,如行高,行间隔,字体大小等*/
	setting(data) {
		setCache("setting", data);
		// setCache('changeTheme', data);
		// 这里多一个.body,以达到更高匹配级别
		el.sheet.sheet.insertRule(`.body .main .content div{
				text-indent: ${data.lineIndent}em;
				font-size:1rem;
		}`);
		// 动态注入一些css变量
		el.sheet.sheet.insertRule(`:root:root{
			--rootFontSize: ${data.rootFontSize}px;
			--zoom: ${data.zoom};
		}`);
		// console.log('setting', sheetEl.sheet);
		// document.documentElement.style.fontSize = data.rootFontSize * data.zoom + 'px';
		this.changeTheme(data.theme.use);
		if (data.titleCenter) {
		} else {
			setInterval(updateHeaderTime, 1000);
			updateHeaderTime();
			el.nav.classList.add("left");
		}
		// window.focus()

		document.body.className = `body init screenDirection-${cache.setting.screenDirection}`;
	},
	/*显示章节*/
	showChapter(data) {
		// P0-03-7：同时比较书身份（book），不再只按章节标题去重
		const last = cache.showChapter || {};
		if (data.title === last.title && data.book === last.book) {
			return;
		}
		// console.warn('开始显示章节', data.title, cache, data);
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
		if (data.highlight && typeof data.highlight.paragraphIndex === 'number') {
			applyHighlight(data.highlight.paragraphIndex, data.highlight.keyword);
		} else {
			// P2-04：应用恢复锚点（段落 → 本章进度 → 旧 pixel）
			applyRestore(data.restore);
		}
		// P6：切章后立即更新进度条
		scheduleProgressUpdate();
		setTimeout(() => {
			dispatchCustomEvent("showChapterAfter", data);
		}, 0);
	},
	// 只会被插件层调用
	readScroll(data) {
		// console.warn('readScroll', data);
		if (!data) {
			return;
		}
		// 在刚刚调用render,还没有实际渲染的时候,
		// 滚动到超出目前的高度,是不生效的
		// 这里只需要一个渲染后的时机,settimeout和requestAnimationFrame是差不多的
		requestAnimationFrame(setScroll.bind(null, data));
		saveScroll(data, false);
	},
	changeTheme,
	// screenDirection (v) {
	// 	// screenDirection
	// 	console.log('screenDirection init');
	// 	// document.body.classList.add('screenDirection-'+v);
	// 	document.body.className=`body init screenDirection-${cache.setting.screenDirection}`
	// }
};

export function changeTheme(index) {
	console.warn("changeTheme", index);
	cache.setting.theme.use = index;
	const sheet = el.sheet.sheet;
	const rule = getStyleRule(":root:root:root");
	console.log({
		sheet,
		themeSheetRuleIndex,
		index,
		renderId,
	});
	console.log(isFirstRender(), renderId);

	// 使用系统默认主题
	if (index !== 0) {
		const themes = cache.setting.theme.custom;
		const theme = themes[index - 1];
		// console.log('使用主题', theme);
		const ruleContent = getThemeStyleRule(theme);
		// 使用自定义主题
		if (rule) rule.style = ruleContent;
		else {
			console.log(sheet, el.sheet);
			themeSheetRuleIndex = sheet.insertRule(
				`:root:root:root{${ruleContent}}`
			);
		}
	} else if (rule) {
		rule.style = "";
	}
}

/** P6：进度条 rAF 合并标记 */
let progressRaf = 0;

/**
 * 更新底部阅读进度条（P6-02/03）。
 * 公式与 core/progress/progressBar.ts 一致：
 * 全书% = (chapterIndex + chapterProgress) / totalChapters（空书不除零）。
 * 每次 scroll 最多每动画帧更新一次（rAF 合并）。
 */
function updateProgressBar() {
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
function scheduleProgressUpdate() {
	if (progressRaf) return;
	progressRaf = requestAnimationFrame(() => {
		progressRaf = 0;
		updateProgressBar();
	});
}

/**
 * 应用搜索结果高亮（P5-04）：仅高亮指定段落中的关键词，并滚动到该段落。
 * 安全：使用 textContent 构建（P0-10 文本安全渲染路径，不解析用户输入为 HTML）。
 * @param {Number} paragraphIndex
 * @param {String} keyword
 */
function applyHighlight(paragraphIndex, keyword) {
	const div = el.content.children[paragraphIndex];
	if (!div || !keyword) return;
	const text = div.textContent || '';
	const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
	if (idx < 0) return;
	const before = text.slice(0, idx);
	const match = text.slice(idx, idx + keyword.length);
	const after = text.slice(idx + keyword.length);
	// 重建节点（textContent 赋值保证关键词不被当作 HTML 执行）
	div.textContent = '';
	const b = document.createElement('span');
	b.textContent = before;
	const m = document.createElement('mark');
	m.className = 'search-highlight';
	m.textContent = match;
	const a = document.createElement('span');
	a.textContent = after;
	div.appendChild(b);
	div.appendChild(m);
	div.appendChild(a);
	scrollToParagraph(paragraphIndex);
}

/**
 * 应用恢复锚点（P2-04）：段落 → 本章进度 → 旧 pixel（首次恢复）→ 顶部。
 * 应用后上报一次当前段落，完成"旧 pixel 转写新进度"。
 * @param {Object} restore
 */
function applyRestore(restore) {
	restore = restore || {};
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
function reportProgress() {
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

/**
 * @param {String} title
 * @param {Array<String>} lines
 */
function render(title, lines) {
	// console.log('render111', lines);
	el.title.innerText = title;
	el.navTitle.innerText = title;
	el.navTitle.title = title;
	let list = el.content.children;
	el.content.style.display = "none";
	if (list.length < lines.length) {
		addLine(lines.length - list.length);
	}

	// 比如不能再设置时获取属性,否则必须刷新(回流)
	// 循环添加数据
	for (let i = 0; i < list.length; i++) {
		if (i < lines.length) {
			list[i].innerText = lines[i];
			list[i].dataset.i = i;
			list[i].style = "";
		} else {
			list[i].style.display = "none";
		}
	}

	el.content.style.display = "block";
	// 修改渲染id,告诉其他人我重新渲染了
	renderId++;
	// console.log('子页面render', renderId);
}

/**
 * 在行不够用的情况下添加行
 */
function addLine(num) {
	// 因为前期肯定隐藏过了dom,这里不在隐藏
	for (var i = 0; i < num; i++) {
		el.content.appendChild(document.createElement("div"));
	}
}
window.addEventListener("DOMContentLoaded", function () {
	window.addEventListener("message", function (e) {
		let data = e.data.data;
		let type = e.data.type;
		console.log("子页面-message", type, data);
		fn[type](data);
		// postMsg('type'+'_end')
	});
	/**********************************
		  判断是否是隐藏后重新显示
	 **********************************/
	let data = getState();
	if (data) {
		console.warn("是隐藏后的", data);
		for (var item in data) {
			fn[item]?.(data[item]);
		}
	}

	/*********************************
		换章和其他需要和拓展交互的功能
	**********************************/
	window.onkeydown = function (e) {
		// console.log("KEY onkeyup ", e);
		const flag = e.altKey || e.shiftKey || e.ctrlKey || e.metaKey;
		switch (e.key.toLowerCase()) {
			//FIXME:手动处理tab事件
			// case 'Tab':
			// 	e.stopPropagation()
			// 	return false
			case "arrowright": //下一章
			case !flag && "d":
				return nextChapter();
			case "arrowleft": //上一章
			case !flag && "a":
				return prevChapter();
			case "arrowdown": //向下翻页
			case !flag && "s":
				// return scrollScreen(1, e);
				return nextPageOrChapter(e);
			case "arrowup": //向上翻页
			case !flag && "w":
				// return scrollScreen(-1, e);
				return prevPageOrChapter(e);
			//检查是否触底,如果触底,下一章,没有则向下
			// 空格是向下翻页,
			case " ":
				return nextPageOrChapter(e);
			case ".":
				// 多判断一下是不是数字键盘的.
				if (e.code === "NumpadDecimal") {
					let t = Date.now();
					let count = 60;
					let maxCount = count * 0.33;
					const fn = () => {
						let v = 5 * Math.min(count / maxCount, 1) * 1.05;
						console.log(v, count / maxCount);
						setScroll(getScroll() + v);
						if (count--) {
							requestAnimationFrame(fn);
						} else {
							console.log("动画完成,时间", Date.now() - t);
							saveScroll();
						}
					};
					fn();
				}
				break;
		}
	};
	window.onmouseup = function (e) {
		// MouseEvent.button MDN https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
		// 0：按下主按钮，通常是向左按钮或未初始化状态
		// 1：按下辅助按钮，通常是滚轮按钮或中间按钮（如果有）
		// 2：按下辅助按钮，通常是右键
		// 3：第四个按钮，通常是“浏览器后退”按钮
		// 4：第五个按钮，通常是“浏览器前进”按钮
		switch (e.button) {
			case 1:
			case 4:
				return prevChapter();
			case 3:
				return nextChapter();
		}
	};

	document.querySelector(".footer .btn-box .prev").onclick = prevChapter;
	document.querySelector(".footer .btn-box .next").onclick = nextChapter;
	document.querySelector(".nav button.prev").onclick = prevChapter;
	document.querySelector(".nav button.next").onclick = nextChapter;
	el.content.ondblclick = autoScrollScreen;
	el.sideNextBtns.forEach((e) => {
		// TODO: 增加防抖???
		if (!e.onclick) e.onclick = nextPageOrChapter;
		// 暂时继续使用局部滚动
		e.onmousewheel = (e) => scrollFunc(e, true);
		// 拦截双击
		e.ondblclick = (e) => e.stopPropagation();
	});

	/**
	 * 这个东西,放哪里合适呢,
	 * scrollAntiShake里面包含了业务逻辑
	 */
	let scrollTimer;
	el.main.addEventListener("scroll", () => {
		clearTimeout(scrollTimer);
		scrollTimer = setTimeout(scrollAntiShake, 50);
	});
	function scrollAntiShake() {
		// console.log('scroll=====');
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
});

function copy(obj) {
	return JSON.parse(JSON.stringify(obj));
}
