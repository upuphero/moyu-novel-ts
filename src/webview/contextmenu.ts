/**
 * 右键菜单与主题（迁移自 static/js/contextmenu.js，Phase 8，P8-02/05）。
 * - 主题 CSS 值安全渲染：sanitizeThemeCss 只允许安全字符集，防 CSS 注入（P8-05）；
 * - getThemeCssText 为纯函数（可单测），getThemeStyleRule 为兼容薄包装。
 */
import { elementParentIterator } from "./dom";
import { cache, nextChapter, postMsg, setCache } from "./vscodeApi";
import { changeTheme } from "./reader";
import { updateZoom } from "./scroll";
import { getThemeStyleRule } from "../shared/theme";

let isShow = false;

window.addEventListener("DOMContentLoaded", function () {
	/** 本页面元素引用 */
	const el = {
		contextmenu: document.querySelector<HTMLDivElement>(".custom-contextmenu")!,
		customThemeContainer: document.getElementById("customThemeContainer")!,
		themeContainer: document.getElementById("themeContainer")!,
		zenModeButton: document.querySelector<HTMLDivElement>(".contextmenu-item.zen-mode")!,
		scrollSpeedInput: document.getElementById("scroll-speed-input") as HTMLInputElement,
		zoomInput: document.getElementById("zoom-input") as HTMLInputElement,
		turnScreenBtns: document.querySelectorAll<HTMLElement>(".rotate-screen-items .item"),
	};

	// 双击右键下一章
	let rightBtnTime = 0;
	document.oncontextmenu = function (e) {
		const now = Date.now();
		// 300ms内连续两次鼠标右键点击,关闭右键弹窗并且下一章
		if (rightBtnTime + 300 > now) {
			e.preventDefault();
			nextChapter();
			rightBtnTime = 0;
		} else if (isShow) {
			// 在显示状态中,则隐藏
			hideContextMenu();
		} else {
			showContextMenu(e.pageX, e.pageY);
		}
		rightBtnTime = now;
		return false;
	};

	/**
	 * 显示右键菜单
	 */
	showContextMenu = (x?: number, y?: number): void => {
		// 如果当前ContextMenu处于显示状态,则允许通过不传递x,y(坐标)来实现重新渲染
		if (!isShow && x !== undefined) {
			el.contextmenu.style.cssText = `display: block;`;
			let w = el.contextmenu.offsetWidth;
			let h = el.contextmenu.offsetHeight;
			let pageW = document.body.clientWidth;
			let pageH = document.body.clientHeight;
			const direction = cache.setting?.screenDirection || 1;
			// 在各种旋转状态时,修正坐标
			if (!(direction & 1)) {
				// 横着的
				[pageW, pageH] = [pageH, pageW];
				[x, y] = [y, x];
			}
			if (direction === 2) {
				y = pageW - y!;
			}
			if (direction === 3) {
				x = pageW - x!;
				y = pageH - y!;
			}
			if (direction === 4) {
				x = pageH - x!;
			}
			if (!(direction & 1)) {
				// 横着的,判断时x需要和h对比,y和w对比
				[pageW, pageH] = [pageH, pageW];
			}
			// 如果右(下)方位置不足,并且左(上)方有足够的位置,则移动
			if (pageW < x! + w && x! > w) x = x! - w;
			if (pageH < y! + h && y! > h) y = y! - h;
			el.contextmenu.style.cssText = `display: block;top:${y || 0}px;left:${x || 0}px;`;
			isShow = true;
		}
		renderThemeContent();
	};

	function renderThemeContent(): void {
		// 使用的主题的下标
		const use = (cache.setting?.theme?.use ?? 0) - 1;
		const themes = cache.setting?.theme?.custom || [];

		// 更新滚动速度,zoom等
		el.scrollSpeedInput.value = String(cache.setting.scrollSpeed ?? 144);
		el.zoomInput.value = String(cache.setting.zoom ?? 1);
		el.turnScreenBtns[(cache.setting.screenDirection ?? 1) - 1].classList.add("on");

		// P0-10：使用 DOM API 构建主题列表（theme.name 以 textContent 渲染，禁止不可信 innerHTML）
		el.customThemeContainer.replaceChildren();
		for (let i = 0; i < themes.length; i++) {
			const theme = themes[i];
			const item = document.createElement("div");
			item.className = "contextmenu-item theme-item";
			item.style.cssText = getThemeStyleRule(theme) || "";
			item.dataset.id = String(i + 1);
			const icon = document.createElement("div");
			icon.className = "icon" + (use === i ? " on" : "");
			item.appendChild(icon);
			item.appendChild(document.createTextNode(String(theme?.name ?? "")));
			el.customThemeContainer.appendChild(item);
		}
	}

	el.themeContainer.onclick = function (e) {
		for (const item of elementParentIterator(e.target as Element)) {
			if (item === el.themeContainer) return;
			if (item.classList.contains("add-theme")) return void addTheme();
			if (item.classList.contains("theme-item")) return void clickItem(item as HTMLDivElement);
		}
		return;
	};
	el.scrollSpeedInput.onchange = inputChange;
	el.zoomInput.onchange = inputChange;
	el.turnScreenBtns.forEach((btn) => {
		btn.onclick = (e) => {
			const value = (e.target as HTMLElement).dataset.i;
			document.body.className = `body init screenDirection-${value}`;
			const newSetting = { ...cache.setting, screenDirection: +value! as 1 | 2 | 3 | 4 };
			setCache("setting", newSetting);
			document
				.querySelector(".rotate-screen-items .item.on")
				?.classList.remove("on");
			el.turnScreenBtns[+value! - 1].classList.add("on");

			postMsg("updateReadSetting", {
				key: `readSetting.screenDirection`,
				value: +value!,
			});
		};
	});

	function inputChange(e: Event): void {
		const target = e.target as HTMLInputElement;
		let value = target.value;
		const name = target.name;
		// 判断value是否合法
		if (name === "zoom") {
			return void updateZoom(+value);
		}
		if (name === "screenDirection") {
			if (!["1", "2", "3", "4"].includes(value)) {
				return;
			}
			document.body.className = `body init screenDirection-${value}`;
		}
		const newSetting = { ...cache.setting, [name]: +value };
		setCache("setting", newSetting);
		postMsg("updateReadSetting", {
			key: `readSetting.${name}`,
			value: +value,
		});
	}

	function addTheme(): void {
		console.warn("addTheme（暂未实现）");
	}

	/**
	 * 点击主题项
	 */
	function clickItem(item: HTMLDivElement): void {
		const i = item.dataset.id || "0";
		const use = +i || 0;
		postMsg("changeUseTheme", use);
		// 更新主题
		changeTheme(use);
		// 更新menu
		showContextMenu();
		// 缓存数据
		cache.setting.theme = cache.setting.theme || { use: 0, custom: [] };
		cache.setting.theme.use = use;
		setCache("setting", cache.setting);
	}

	/** 主题之外的其他项目的处理 */
	el.zenModeButton.onclick = function () {
		// 进入禅模式
		postMsg("toggleZenMode", { onlyNotice: false });
	};

	/** 隐藏menu相关逻辑 */
	function hideContextMenu(): void {
		if (!isShow) return;
		isShow = false;
		el.contextmenu.style.cssText = "";
	}
	document.body.addEventListener("click", hideContextMenu);
	el.contextmenu.addEventListener("click", (e) => {
		e.stopPropagation();
	});
});

export let showContextMenu: (x?: number, y?: number) => void = () => {
	throw new Error("webview=>contextMenu=>showContextMenu uninitialized ");
};
