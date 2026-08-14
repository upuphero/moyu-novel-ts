/**
 * P6-01：阅读进度计算测试。
 * 首章/末章/空章/单章、头部计数（ADR-006）、不除零、钳制、非法输入。
 */
import * as assert from "assert";
import { clamp01, computeProgress } from "../../../core/progress/progressBar";

suite("progressBar.computeProgress（P6-01）", () => {
	test("首章：全书百分比 = (0 + 本章进度) / 总章数", () => {
		// 10 章（含头部），首章读到 50% → 全书 5%
		const p = computeProgress(0, 0.5, 10);
		assert.strictEqual(p.chapterPercent, 0.5);
		assert.ok(Math.abs(p.bookPercent - 0.05) < 1e-9, `bookPercent=${p.bookPercent}`);
	});

	test("末章读完：全书百分比 = 1", () => {
		const p = computeProgress(9, 1, 10);
		assert.strictEqual(p.bookPercent, 1);
	});

	test("末章开头：全书百分比接近 90%", () => {
		const p = computeProgress(9, 0, 10);
		assert.strictEqual(p.bookPercent, 0.9);
	});

	test("空书（0 章）不除零，全书百分比 0", () => {
		const p = computeProgress(0, 0.5, 0);
		assert.strictEqual(p.bookPercent, 0, "空书不除零");
		assert.strictEqual(p.chapterPercent, 0.5);
	});

	test("负数总章数视为空书", () => {
		const p = computeProgress(0, 0.3, -1);
		assert.strictEqual(p.bookPercent, 0);
	});

	test("单章（含头部=1 章）读完 → 全书 1", () => {
		const p = computeProgress(0, 1, 1);
		assert.strictEqual(p.bookPercent, 1);
	});

	test("章节进度钳制（-0.5 → 0；2 → 1）", () => {
		assert.strictEqual(computeProgress(0, -0.5, 10).chapterPercent, 0);
		assert.strictEqual(computeProgress(0, 2, 10).chapterPercent, 1);
		assert.strictEqual(computeProgress(0, 2, 10).bookPercent, 0.1);
	});

	test("chapterIndex 越界钳制到最后一章", () => {
		const p = computeProgress(99, 0.5, 10);
		assert.strictEqual(p.bookPercent, 0.95, "钳制到 index=9");
	});

	test("非法输入（NaN/Infinity/负数/非整数）→ 安全默认", () => {
		assert.deepStrictEqual(computeProgress(NaN, 0.5, 10), { chapterPercent: 0.5, bookPercent: 0 });
		assert.deepStrictEqual(computeProgress(-1, 0.5, 10), { chapterPercent: 0.5, bookPercent: 0 });
		assert.deepStrictEqual(computeProgress(1.5, 0.5, 10), { chapterPercent: 0.5, bookPercent: 0 });
		assert.deepStrictEqual(computeProgress(0, Infinity, 10), { chapterPercent: 0, bookPercent: 0 });
	});
});

suite("progressBar.clamp01", () => {
	test("边界与非法值", () => {
		assert.strictEqual(clamp01(0), 0);
		assert.strictEqual(clamp01(1), 1);
		assert.strictEqual(clamp01(0.5), 0.5);
		assert.strictEqual(clamp01(-3), 0);
		assert.strictEqual(clamp01(7), 1);
		assert.strictEqual(clamp01(NaN), 0);
		assert.strictEqual(clamp01(Infinity), 0);
	});
});
