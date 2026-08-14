/**
 * P1-03/P1-05：TxtParser 回归测试。
 * 锁定"章节标题和正文与旧实现等价"：用旧逻辑（split + substring + 行清洗）作为参考实现逐项对比。
 * 纯 Node 运行（注入内存 reader，不依赖 VS Code）。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { TxtParser } from '../../../core/parser/TxtParser';
import { splitByRegex } from '../../../splitCore';
import decodeEncoding from '../../../file/encoding';
import { DEFAULT_CHAPTER_REGEX } from '../../../legacy/ids';

const fixtures = path.resolve(__dirname, '../../../../src/test/fixtures');
const readBuffer = (name: string) => new Uint8Array(fs.readFileSync(path.join(fixtures, name)));

const regex = () => new RegExp(DEFAULT_CHAPTER_REGEX, 'gm');
const memReader = (buffer: Uint8Array) => async (_path: string) => buffer;

/** 旧行为参考实现：与旧 Chapter.getTxt() + parseChapterTxt_WebView() 逐字等价 */
function legacyChapterLines(buffer: Uint8Array): { title: string; lines: string[] }[] {
	const text = decodeEncoding(buffer);
	const items = splitByRegex(text, regex());
	return items.map((item) => {
		const content = text.substring(
			item.txtIndex + item.s.length,
			item.txtIndex + item.size
		);
		const lines = content
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		return { title: item.s.trim(), lines };
	});
}

async function parseFixture(name: string): Promise<TxtParser> {
	const parser = new TxtParser(name, memReader(readBuffer(name)), {
		chapterRegex: regex,
	});
	await parser.load();
	return parser;
}

suite('TxtParser.load / getChapterList', () => {
	test('UTF-8：metadata 与章节列表正确', async () => {
		const parser = await parseFixture('utf8-sample.txt');
		const meta = await parser.load();
		assert.strictEqual(meta.title, 'utf8-sample');
		assert.strictEqual(meta.format, 'txt');
		assert.strictEqual(meta.chapterCount, 4);
		assert.ok(meta.sizeBytes > 0);

		const chapters = await parser.getChapterList();
		assert.deepStrictEqual(
			chapters.map((c) => c.title),
			['头部', '第一章 开始', '第二章 继续', '第三章 结束']
		);
		assert.strictEqual(chapters[0].isPreface, true);
		assert.strictEqual(chapters[1].isPreface, false);
		assert.strictEqual(chapters[1].index, 1);
		assert.ok(chapters[1].id.length > 0);
		parser.dispose();
	});

	test('GBK：解码与章节列表正确', async () => {
		const parser = await parseFixture('gbk-sample.txt');
		const chapters = await parser.getChapterList();
		assert.strictEqual(chapters[1].title, '第一章 开始');
		parser.dispose();
	});

	test('UTF-8 带 BOM：解码无 BOM 残留', async () => {
		const parser = await parseFixture('utf8-bom-sample.txt');
		const content = await parser.getChapterContent((await parser.getChapterList())[1]);
		assert.ok(content.lines.includes('这是第一章的内容。'));
		parser.dispose();
	});

	test('无章节文件：仅头部 preface（ADR-006）', async () => {
		const parser = await parseFixture('no-chapter.txt');
		const chapters = await parser.getChapterList();
		assert.strictEqual(chapters.length, 1);
		assert.strictEqual(chapters[0].isPreface, true);
		parser.dispose();
	});

	test('空文件：仅头部，正文为空', async () => {
		const parser = new TxtParser('empty.txt', memReader(new Uint8Array(0)), {
			chapterRegex: regex,
		});
		const chapters = await parser.getChapterList();
		assert.strictEqual(chapters.length, 1);
		const content = await parser.getChapterContent(chapters[0]);
		assert.deepStrictEqual(content.lines, []);
		parser.dispose();
	});
});

suite('TxtParser.getChapterContent 与旧实现等价（P1-05）', () => {
	for (const name of [
		'utf8-sample.txt',
		'gbk-sample.txt',
		'repeat-chapter.txt',
		'no-chapter.txt',
		'chinese-number-chapters.txt',
	]) {
		test(`fixture: ${name}`, async () => {
			const parser = await parseFixture(name);
			const legacy = legacyChapterLines(readBuffer(name));
			const chapters = await parser.getChapterList();
			assert.strictEqual(chapters.length, legacy.length);
			for (let i = 0; i < chapters.length; i++) {
				const content = await parser.getChapterContent(chapters[i]);
				// 标题等价
				assert.strictEqual(chapters[i].title, legacy[i].title);
				// 正文行等价（旧 parseChapterTxt_WebView 输出）
				assert.deepStrictEqual(content.lines, legacy[i].lines);
				// blocks 与 lines 投影一致
				assert.strictEqual(content.blocks.length, content.lines.length);
				content.blocks.forEach((block, bi) => {
					assert.strictEqual(block.text, content.lines[bi]);
					assert.strictEqual(block.kind, 'paragraph');
				});
			}
			parser.dispose();
		});
	}

	test('头部正文 = 第一章之前的内容（旧 substring 公式锁定）', async () => {
		const parser = await parseFixture('utf8-sample.txt');
		const chapters = await parser.getChapterList();
		const preface = await parser.getChapterContent(chapters[0]);
		assert.ok(preface.lines.includes('这是一个用于测试的示例文本。'));
		assert.ok(preface.lines.includes('序章'));
		parser.dispose();
	});

	test('章节不存在时抛出明确错误', async () => {
		const parser = await parseFixture('utf8-sample.txt');
		const chapters = await parser.getChapterList();
		await assert.rejects(
			() =>
				parser.getChapterContent({
					...chapters[0],
					index: 999,
				}),
			/章节不存在/
		);
		parser.dispose();
	});
});

suite('TxtParser 生命周期（ADR-005）', () => {
	test('懒加载：getChapterList 前无需显式 load', async () => {
		const parser = new TxtParser('x.txt', memReader(readBuffer('utf8-sample.txt')), {
			chapterRegex: regex,
		});
		const chapters = await parser.getChapterList();
		assert.strictEqual(chapters.length, 4);
		parser.dispose();
	});

	test('dispose 后仍可重新 load（重新读取）', async () => {
		const parser = new TxtParser('x.txt', memReader(readBuffer('utf8-sample.txt')), {
			chapterRegex: regex,
		});
		await parser.load();
		parser.dispose();
		const meta = await parser.load();
		assert.strictEqual(meta.chapterCount, 4);
		parser.dispose();
	});

	test('自定义 chapterRegex 注入生效', async () => {
		const text = '第一节 甲\n内容A\n第二节 乙\n内容B\n';
		const parser = new TxtParser(
			'custom.txt',
			async () => new Uint8Array(Buffer.from(text, 'utf8')),
			{ chapterRegex: () => new RegExp('^第[一二三四五六七八九十\\d]*节.*$', 'gm') }
		);
		const chapters = await parser.getChapterList();
		assert.strictEqual(chapters.length, 3);
		assert.strictEqual(chapters[1].title, '第一节 甲');
		parser.dispose();
	});
});
