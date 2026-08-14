/**
 * P9-03：配置读取回退纯函数测试（configCore.ts）。
 * 新 key 显式值 → 旧 key 显式值 → 默认值（scope-aware 只读 fallback，不写回）。
 */
import * as assert from "assert";
import {
	isLegacyFallback,
	resolveConfigValue,
} from "../../configCore";

suite("configCore.resolveConfigValue（P9-03）", () => {
	test("新 key 显式值优先", () => {
		assert.strictEqual(resolveConfigValue(2, 3, 1), 2);
		assert.strictEqual(resolveConfigValue(false, true, true), false);
		assert.strictEqual(resolveConfigValue("new", "old", "def"), "new");
	});

	test("新 key 未设置（undefined）→ 旧 key 显式值（只读 fallback）", () => {
		assert.strictEqual(resolveConfigValue(undefined, 3, 1), 3);
		assert.strictEqual(resolveConfigValue(undefined, "old", "def"), "old");
	});

	test("新旧均未设置 → 默认值", () => {
		assert.strictEqual(resolveConfigValue(undefined, undefined, 1), 1);
		assert.strictEqual(resolveConfigValue(undefined, undefined, "def"), "def");
	});

	test("显式 null 视为未设置（用户清除设置）", () => {
		// VS Code 清除设置后 get 返回 undefined；null 由调用方归一化
		assert.strictEqual(resolveConfigValue(undefined, null as unknown as string, "def"), "def");
	});

	test("新 key 显式 undefined 语义（未设置）", () => {
		// 用户显式设置为 undefined 等价未设置 → fallback 旧 key
		assert.strictEqual(resolveConfigValue(undefined, 42, 0), 42);
	});
});

suite("configCore.isLegacyFallback", () => {
	test("命中旧 key 时返回 true（可观测性日志）", () => {
		assert.ok(isLegacyFallback(undefined, "old"));
		assert.ok(!isLegacyFallback("new", "old"));
		assert.ok(!isLegacyFallback(undefined, undefined));
	});
});
