/**
 * 统一书籍模型（Phase 1，P1-01）。
 *
 * 本模块不依赖 VS Code / TXT / EPUB 的任何实现细节。
 * 成功后的 Reader 只消费这些类型，不感知格式差异（见 DEVELOPMENT_PLAN.md §1）。
 *
 * 设计约束：模型不含 TXT 专属字段（如 txtIndex/size/encoding），无 `any`；
 * 无章节/空书行为见 ADR-006。
 */

/** 书籍格式 */
export type BookFormat = 'txt' | 'epub';

/**
 * 书籍元数据（parser.load() 的返回）
 */
export interface BookMetadata {
	/** 书名（TXT 为文件名去扩展名；EPUB 为 title 元数据） */
	title: string;
	/** 格式 */
	format: BookFormat;
	/** 文件绝对路径 */
	filePath: string;
	/** 文件大小（字节） */
	sizeBytes: number;
	/** 章节总数（含 preface/头部，见 ADR-006） */
	chapterCount: number;
	/** 作者（EPUB 元数据；TXT 无此字段，不填） */
	author?: string;
	/** 语言（EPUB 元数据；TXT 无此字段，不填） */
	language?: string;
}

/**
 * 章节信息（轻量描述，不含正文；获取正文用 parser.getChapterContent）
 */
export interface ChapterInfo {
	/** 章节 ID（Phase 2 升级为 bookId+chapterId 算法；Phase 1 为 `format:index`） */
	id: string;
	/** 章节序号：0 为 preface/头部，从 1 开始为正文章节 */
	index: number;
	/** 章节标题（显示用；TXT 为章节行去除首尾空白后的文本） */
	title: string;
	/** 是否 preface（头部）。语义见 ADR-006 */
	isPreface: boolean;
}

/** 章节内块的种类 */
export type ChapterBlockKind = 'paragraph' | 'heading';

/**
 * 章节正文块（段落级单元，供搜索/进度/EPUB 标题使用）
 */
export interface ChapterBlock {
	/** 块在章节内的序号（从 0 开始） */
	index: number;
	/** 块文本（已去除首尾空白） */
	text: string;
	/** 块种类（TXT 全为 paragraph；EPUB 章节内标题为 heading，Phase 4 使用） */
	kind: ChapterBlockKind;
}

/**
 * 章节内容（ChapterInfo + 正文块）
 */
export interface ChapterContent {
	info: ChapterInfo;
	/** 段落块（模型化视图） */
	blocks: ChapterBlock[];
	/** 纯文本行（Reader 渲染视图，与旧 parseChapterTxt_WebView 输出等价，P1-05 锁定） */
	lines: string[];
}
