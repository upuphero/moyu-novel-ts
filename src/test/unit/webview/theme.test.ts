/**
 * P8-05：主题 CSS 安全渲染测试（theme.ts 纯函数）。
 * - sanitizeCssValue 防 CSS 注入；
 * - getThemeCssText：值安全过滤、fontWidght alias、RGB 分量、默认 var 引用。
 */
import * as assert from "assert";
import {
	getThemeCssText,
	getThemeStyleRule,
	isHexColor,
	sanitizeCssValue,
} from "../../../shared/theme";

suite("theme.sanitizeCssValue（P8-05）", () => {
	test("合法值保留", () => {
		assert.strictEqual(sanitizeCssValue("#cbd9c0"), "#cbd9c0");
		assert.strictEqual(sanitizeCssValue("rgba(0, 0, 0, 0.2)"), "rgba(0, 0, 0, 0.2)");
		assert.strictEqual(sanitizeCssValue("400"), "400");
		assert.strictEqual(sanitizeCssValue("'Microsoft YaHei'"), "'Microsoft YaHei'");
		assert.strictEqual(sanitizeCssValue("var(--bg)"), "var(--bg)");
	});

	test("非法值拒绝（CSS 注入）", () => {
		assert.strictEqual(sanitizeCssValue("red; background: url(evil)"), "");
		assert.strictEqual(sanitizeCssValue("red} body { display: none"), "");
		assert.strictEqual(sanitizeCssValue("url(http://evil)"), "");
		assert.strictEqual(sanitizeCssValue(""), "");
		assert.strictEqual(sanitizeCssValue(123), "");
		assert.strictEqual(sanitizeCssValue(null), "");
		assert.strictEqual(sanitizeCssValue("expression(alert(1))"), "");
		assert.strictEqual(sanitizeCssValue("javascript:alert(1)"), "");
	});
});

suite("theme.getThemeCssText", () => {
	test("完整主题生成 CSS 变量", () => {
		const css = getThemeCssText({
			name: "绿色",
			bg: "#cbd9c0",
			color: "#303b33",
			btnBg: "#cbd9c0",
			btnColor: "#303b33",
			btnActive: "rgba(0, 0, 0, 0.2)",
			btnActiveBorder: "#303b33",
		});
		assert.ok(css.includes("--bg:#cbd9c0"), css);
		assert.ok(css.includes("--color:#303b33"));
		assert.ok(css.includes("--btnBg:#cbd9c0"));
		assert.ok(css.includes("--bg-rgb:203,217,192"), "hex → RGB 分量");
		assert.ok(css.includes("--color-rgb:48,59,51"));
	});

	test("缺失值引用默认变量（navBg → bg）", () => {
		const css = getThemeCssText({ bg: "#000", color: "#FFF" });
		assert.ok(css.includes("--navBg: var(--bg)"), css);
		assert.ok(css.includes("--textColor: var(--color)"));
	});

	test("fontWidght 历史 key alias（P0-08）：fontWidth 优先", () => {
		const css = getThemeCssText({ fontWidth: "700" });
		assert.ok(css.includes("--fontWidght:700"), css);
		// 若用户只设置 fontWidght（旧配置），仍可用
		const cssOld = getThemeCssText({ fontWidght: "500" });
		assert.ok(cssOld.includes("--fontWidght:500"));
	});

	test("非法值被丢弃，不进入 CSS", () => {
		const css = getThemeCssText({ bg: "red; } body { display:none", color: "#FFF" });
		assert.ok(!css.includes("display:none"), css);
		assert.ok(!css.includes("red"));
		assert.ok(css.includes("--color:#FFF"));
	});

	test("getThemeStyleRule 与 getThemeCssText 一致（兼容别名）", () => {
		assert.strictEqual(getThemeStyleRule({ bg: "#000" }), getThemeCssText({ bg: "#000" }));
	});
});

suite("theme.isHexColor", () => {
	test("6/8 位 hex", () => {
		assert.ok(isHexColor("#ffffff"));
		assert.ok(isHexColor("#FFFFFF"));
		assert.ok(isHexColor("#cbd9c0"));
		assert.ok(isHexColor("#00000000"));
		assert.ok(!isHexColor("#fff"));
		assert.ok(!isHexColor("white"));
		assert.ok(!isHexColor("rgb(0,0,0)"));
		assert.ok(!isHexColor("#GGGGGG"));
	});
});
