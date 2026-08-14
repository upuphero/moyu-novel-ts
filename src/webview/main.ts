/**
 * WebView 入口（Phase 8，P8-01）。
 * 装配 Reader：初始化 DOM 引用（dom.ts 的 DOMContentLoaded 已做）+
 * 业务装配（reader.setupReader 键盘/按钮/滚动）+ 右键菜单（contextmenu.ts 自装配）。
 *
 * 注意：dom.ts / contextmenu.ts 各自监听 DOMContentLoaded 完成 DOM 引用与菜单装配，
 * 这里只负责加载 reader 的交互装配（避免重复绑定）。
 */
import "./contextmenu"; // 右键菜单自装配（DOMContentLoaded）
import { setupReader } from "./reader";
import { initEl } from "./dom";

window.addEventListener("DOMContentLoaded", function () {
	initEl();
	setupReader();
});
