/**
 * WebView 工具函数（迁移自 static/js/util.js，Phase 8，P8-02）。
 */

/** 保留的调试日志（原 log()，无实际用途） */
export function log(): void {
	console.log("========log被调用");
}

export async function sleep(ms = 10): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export function toFixed(n: number, fractionDigits = 3): number {
	return +n.toFixed(fractionDigits);
}

/** RGB → HSL（保留原实现；hlsToRgb 为未完成死代码，不迁移） */
export function rgbToHsl(r: number, g: number, b: number): number[] {
	r /= 255;
	g /= 255;
	b /= 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h: number | undefined;
	let s: number;
	const l = (max + min) / 2;

	if (max === min) {
		h = 0;
		s = 0; // 非彩色
	} else {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		const hueMap: Record<number, number> = {
			[b]: (r - g) / d + 4,
			[g]: (b - r) / d + 2,
			[r]: (g - b) / d + (g < b ? 6 : 0),
		};
		h = hueMap[max] / 6;
	}

	return [h as number, s, l];
}
