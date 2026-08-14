/**
 * P1-02/P4-05：ParserFactory 测试。
 * 扩展名大小写不敏感；.epub 创建 EpubParser（Phase 4）；不支持格式返回明确错误。
 */
import * as assert from 'assert';
import {
	ParserFactory,
	UnsupportedFormatError,
} from '../../../core/parser/ParserFactory';
import { TxtParser } from '../../../core/parser/TxtParser';
import { EpubParser } from '../../../core/epub/EpubParser';

const readFile = async () => new Uint8Array(0);

suite('ParserFactory', () => {
	test('.txt → TxtParser', () => {
		const parser = ParserFactory.create('/books/书.txt', { readFile });
		assert.ok(parser instanceof TxtParser);
		parser.dispose();
	});

	test('.TXT 大小写不敏感 → TxtParser', () => {
		const parser = ParserFactory.create('/books/BOOK.TXT', { readFile });
		assert.ok(parser instanceof TxtParser);
		parser.dispose();
	});

	test('.epub → EpubParser（P4-05）', () => {
		const parser = ParserFactory.create('/books/书.epub', { readFile });
		assert.ok(parser instanceof EpubParser);
		assert.strictEqual(parser.format, 'epub');
		parser.dispose();
	});

	test('.EPUB 大小写不敏感 → EpubParser', () => {
		const parser = ParserFactory.create('/books/BOOK.EPUB', { readFile });
		assert.ok(parser instanceof EpubParser);
		parser.dispose();
	});

	test('.pdf 等未知格式 → 明确错误', () => {
		assert.throws(
			() => ParserFactory.create('/books/书.pdf', { readFile }),
			(error) =>
				error instanceof UnsupportedFormatError &&
				/不支持/.test(error.message)
		);
	});

	test('无扩展名 → 明确错误', () => {
		assert.throws(
			() => ParserFactory.create('/books/README', { readFile }),
			(error) => error instanceof UnsupportedFormatError
		);
	});

	test('缺少 readFile 注入 → 明确抛错', () => {
		assert.throws(() => ParserFactory.create('/books/书.txt'));
	});
});
