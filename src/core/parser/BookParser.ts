import { BookFormat, BookMetadata, ChapterContent, ChapterInfo } from '../book/model';

/**
 * 书籍解析器生命周期（ADR-005）。
 *
 * - load()：幂等，可多次调用；懒加载（getChapterList / getChapterContent 会先 load）。
 * - 错误：读文件失败 / 解码失败时抛出 Error，由 UI 层捕获并提示，不让书架崩溃。
 * - dispose()：释放缓存内存；dispose 之后仍可重新 load（重新读取文件）。
 */
export interface BookParser {
	readonly format: BookFormat;
	load(): Promise<BookMetadata>;
	getChapterList(): Promise<ChapterInfo[]>;
	getChapterContent(info: ChapterInfo): Promise<ChapterContent>;
	dispose(): void;
}
