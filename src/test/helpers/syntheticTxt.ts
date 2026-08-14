/**
 * 固定 seed 的合成 TXT 生成器（Phase 3，P3-04；Phase 7 复用）。
 * 生成 1/10/30 MB 规模、含可识别章节标题的伪随机小说文本。
 * 字节计数采用增量累加（避免 O(n²) 的全量 byteLength）。
 */
import { DEFAULT_CHAPTER_REGEX } from '../../legacy/ids';

/** mulberry32 固定 seed 伪随机（可复现） */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return function () {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const CN_DIGITS = '零一二三四五六七八九';

/** 数字 → 中文数字（1..9999） */
export function toChineseNumber(n: number): string {
	if (n <= 0) return '零';
	const parts: string[] = [];
	const units = ['', '十', '百', '千'];
	let unit = 0;
	while (n > 0) {
		const digit = n % 10;
		if (digit !== 0) {
			parts.unshift(CN_DIGITS[digit] + units[unit]);
		} else if (parts.length > 0 && !parts[0].startsWith('零')) {
			parts.unshift('零');
		}
		n = Math.floor(n / 10);
		unit++;
	}
	return parts.join('');
}

/** 章节标题（全部为默认正则可识别的“第X章”变体：中文数字/阿拉伯数字/长数字） */
export function chapterTitle(i: number): string {
	const style = i % 3;
	switch (style) {
		case 0:
			return `第${toChineseNumber(i + 1)}章 风起云涌`;
		case 1:
			return `第${i + 1}章 暗流涌动`;
		case 2:
			return `第${toChineseNumber(i + 1)}章 千里之行`;
	}
	return `第${i + 1}章 未知`;
}

/**
 * 生成合成小说文本。
 * @param approxMb 目标大小（MB）
 * @param seed 固定 seed（默认 42）
 * @returns { text, chapterCount }
 */
export function generateSyntheticTxt(
	approxMb: number,
	seed = 42
): { text: string; chapterCount: number } {
	const rand = mulberry32(seed);
	const targetBytes = approxMb * 1024 * 1024;
	const paragraphs = [
		'夜色如墨，风声呜咽，远山在黑暗中只剩下一道模糊的轮廓。',
		'他站在窗前，久久没有言语，直到天边泛起鱼肚白。',
		'这一路上，他见过太多生离死别，早已麻木，却仍忍不住叹息。',
		'古老的传说在人群中口口相传，没有人知道真相，但每个人都在谈论。',
		'她抬起头，目光坚定，仿佛已经做好了所有准备。',
		'风沙卷起千层浪，那一道身影却岿然不动。',
		'“你来了。”他说，声音平静得可怕。',
		'时间仿佛在这一刻凝固，所有的喧嚣都归于沉寂。',
		'远处的钟声敲响，惊起一树寒鸦。',
		'无论如何，路总要继续走下去。',
	];
	let text = '';
	let byteCount = 0;
	const push = (chunk: string) => {
		text += chunk;
		byteCount += Buffer.byteLength(chunk, 'utf8');
	};
	// 头部
	push('楔子 缘起\n');
	push('这是一个关于江湖与宿命的故事。\n\n');
	let chapterCount = 1;
	while (byteCount < targetBytes) {
		chapterCount++;
		push(`${chapterTitle(chapterCount)}\n`);
		const paraCount = 30 + Math.floor(rand() * 40);
		for (let k = 0; k < paraCount; k++) {
			const p = paragraphs[Math.floor(rand() * paragraphs.length)];
			// 偶发加入含"第X章/节/回"字样的正文行（旧缺陷行为一致的合成噪声；节/回不被默认正则识别）
			if (k === 7 && rand() > 0.5) {
				const noise = [
					`他说这话的时候，第${1 + Math.floor(rand() * 5)}章书稿就在桌上。`,
					`这一节的内容，与第${1 + Math.floor(rand() * 5)}节毫无关系。`,
					`那已经是第一百零${1 + Math.floor(rand() * 9)}回的事了。`,
				][Math.floor(rand() * 3)];
				push(`${noise}\n`);
			} else {
				push(`${p}\n`);
			}
		}
		push('\n');
	}
	return { text, chapterCount };
}

/** 验证生成器产出的章节可被默认正则识别（生成器自检） */
export function validateSynthetic(text: string, expectedChapters: number): boolean {
	const regex = new RegExp(DEFAULT_CHAPTER_REGEX, 'gm');
	const matches = text.match(regex);
	return !!matches && matches.length >= expectedChapters;
}
