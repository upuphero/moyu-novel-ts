/**
 * 主题 CSS 纯函数（Phase 8，P8-05）。
 * 无 DOM 依赖，可脱离浏览器单测：
 * - sanitizeCssValue：CSS 值安全过滤（防注入）；
 * - getThemeCssText：构建主题 CSS 文本（所有值经 sanitize）。
 */
import { ThemeItem } from "../shared/contract";

/** 判断一个字符串是 16 进制色值（含 8 位 RGBA） */
export function isHexColor(str: string): boolean {
	const hexColorPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/;
	return hexColorPattern.test(str);
}

function hexToRGB(hex: string): number[] {
	hex = hex.replace(/^#/, "");
	const r = parseInt(hex.slice(0, 2), 16);
	const g = parseInt(hex.slice(2, 4), 16);
	const b = parseInt(hex.slice(4, 6), 16);
	return [r, g, b];
}

/**
 * CSS 值安全过滤（P8-05）：只允许颜色/数字/单位/var()/常见字体字符，
 * 禁止 `; { }` 等可注入 CSS 的字符。非法 → 返回空串（该属性被丢弃）。
 */
export function sanitizeCssValue(value: unknown): string {
	if (typeof value !== "string") return "";
	// 允许：hex、rgb/rgba/hsl/hsla()、数字、%、空格、逗号、点、负号、引号、var(--x)、中文字符
	if (/^[#a-zA-Z0-9 ,().%\-'"\u4e00-\u9fa5]+$/.test(value)) {
		// 再排除危险模式：分隔符注入与 IE expression / url() / javascript: / import
		if (/[;{}]/.test(value)) return "";
		if (/expression\s*\(|url\s*\(|javascript\s*:|@import|behavior\s*:/i.test(value)) {
			return "";
		}
		return value.trim();
	}
	return "";
}

/**
 * 构建主题 CSS 文本（P8-05：所有值经 sanitizeCssValue）。
 * fontWidght 为历史拼写错误 key（P0-08 alias）：fontWidth 优先。
 */
export function getThemeCssText(theme: Partial<ThemeItem> = {}): string {
	const defaultKeys: Record<string, string> = {
		navBg: "bg",
		textColor: "color",
	};
	// 值全部安全过滤；非法值丢弃
	const safeTheme: Record<string, string> = {};
	for (const k of Object.keys(theme)) {
		const v = sanitizeCssValue((theme as Record<string, unknown>)[k]);
		if (v) safeTheme[k] = v;
	}
	if (safeTheme.fontWidth && !safeTheme.fontWidght) {
		safeTheme.fontWidght = safeTheme.fontWidth;
	}
	const keys = [...new Set([...Object.keys(safeTheme), ...Object.keys(defaultKeys)])];
	const list = keys.map((k) => {
		if (defaultKeys[k]) {
			return `--${k}: ${safeTheme[k] || `var(--${defaultKeys[k]})`};`;
		}
		if (!safeTheme[k]) return undefined;
		return ` --${k}:${safeTheme[k]};`;
	});
	let s = list.filter(Boolean).join("\n");
	// 颜色 RGB 分量（供半透明背景使用）
	if (isHexColor(safeTheme.bg)) {
		s += ` --bg-rgb:${hexToRGB(safeTheme.bg).join(",")}; `;
	}
	if (isHexColor(safeTheme.color)) {
		s += ` --color-rgb:${hexToRGB(safeTheme.color).join(",")}; `;
	}
	return s;
}

/** 兼容原签名（contextmenu.js 的 getThemeStyleRule） */
export function getThemeStyleRule(theme: Partial<ThemeItem> = {}): string {
	return getThemeCssText(theme);
}
