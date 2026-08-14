/**
 * EPUB 解析器（Phase 4，P4-02/03/04/05）。
 *
 * 支持 reflowable、无 DRM、以文字为主的 EPUB 2/3 子集：
 * - 容器：ZIP（META-INF/container.xml → OPF full-path）；
 * - OPF：metadata（dc:title / dc:creator / dc:identifier）+ manifest + spine；
 * - 懒加载章节表：只读 container/OPF/nav（或 NCX），**不读任何章节 XHTML 正文**；
 * - 正文：按需读取单个章节 XHTML → 提取 heading/paragraph 块（extract.ts）；
 * - 安全（P4-06）：ZIP 路径遍历/条目数/解压大小/压缩比/CRC 校验，XML 拒绝 DOCTYPE；
 *   单个损坏章节只影响该章节（XmlParseError 隔离），书架与 Reader 不崩溃。
 *
 * 纯 Node 依赖（不 import vscode），readFile 由调用方注入。
 */
import { basename, extname } from 'path';
import {
	BookFormat,
	BookMetadata,
	ChapterBlock,
	ChapterContent,
	ChapterInfo,
} from '../book/model';
import { BookParser } from '../parser/BookParser';
import {
	MAX_ENTRY_SIZE,
	ZipError,
	ZipEntry,
	parseZipIndex,
	readZipEntry,
} from './zip';
import { XmlElementNode, XmlParseError, childElements, firstChild, parseXml, textContent } from './xml';
import { blocksToLines, extractBlocks } from './extract';

/** EPUB 文件大小上限（防御异常大文件） */
const MAX_EPUB_SIZE = 200 * 1024 * 1024;

/** OPF 中 spine 引用的单个章节 */
interface SpineItem {
	idref: string;
	href: string;
}

interface OpfInfo {
	title?: string;
	author?: string;
	identifier?: string;
	/** manifest id → href（ZIP 内路径） */
	manifestHrefs: Map<string, string>;
	/** manifest id → media-type */
	manifestTypes: Map<string, string>;
	/** manifest id → properties（EPUB3 nav 检测） */
	manifestProps: Map<string, string>;
	spine: SpineItem[];
	/** nav 文档 ZIP 路径（EPUB3）或 NCX 路径（EPUB2） */
	navPath?: string;
	navIsNcx: boolean;
}

function decodeUtf16IfNeeded(bytes: Uint8Array): string {
	if (bytes.length >= 2) {
		if (bytes[0] === 0xff && bytes[1] === 0xfe) {
			return Buffer.from(bytes.slice(2)).toString('utf16le');
		}
		if (bytes[0] === 0xfe && bytes[1] === 0xff) {
			// UTF-16 BE → 转为 LE 再解码
			const le = new Uint8Array(bytes.length - 2);
			for (let i = 0; i < le.length; i += 2) {
				le[i] = bytes[i + 3];
				le[i + 1] = bytes[i + 2];
			}
			return Buffer.from(le).toString('utf16le');
		}
	}
	return Buffer.from(bytes).toString('utf8');
}

/** 解析 ZIP 内 XML 条目（错误统一转为 ZipError 包装） */
function readXml(bytes: Uint8Array): XmlElementNode {
	const text = decodeUtf16IfNeeded(bytes);
	const doc = parseXml(text);
	return doc.root;
}

export class EpubParser implements BookParser {
	readonly format: BookFormat = 'epub';

	private zipBuf?: Uint8Array;
	private zipEntries?: Map<string, ZipEntry>;
	private opf?: OpfInfo;
	private metadata?: BookMetadata;
	private loaded = false;
	/** nav/NCX 提取的标题列表（文档顺序 = spine 顺序；懒加载章节表用） */
	private loadedNavTitles?: string[];

	constructor(
		private readonly filePath: string,
		private readonly readFile: (path: string) => Promise<Uint8Array>
	) {}

	private async readZip(): Promise<{ buf: Uint8Array; entries: Map<string, ZipEntry> }> {
		if (this.zipBuf && this.zipEntries) {
			return { buf: this.zipBuf, entries: this.zipEntries };
		}
		const buf = await this.readFile(this.filePath);
		if (buf.byteLength > MAX_EPUB_SIZE) {
			throw new ZipError(`EPUB 文件过大（>${MAX_EPUB_SIZE / 1024 / 1024}MB）`);
		}
		const entries = parseZipIndex(buf);
		this.zipBuf = buf;
		this.zipEntries = entries;
		return { buf, entries };
	}

	/** 读条目（区分大小写优先，找不到则忽略大小写搜索——容错不规范容器） */
	private async readEntryBytes(
		entries: Map<string, ZipEntry>,
		buf: Uint8Array,
		path: string
	): Promise<Uint8Array> {
		let entry = entries.get(path);
		if (!entry) {
			// 大小写容错搜索（EPUB 规范要求精确大小写，但容错更健壮）
			const norm = path.toLowerCase();
			const key = Array.from(entries.keys()).find((k) => k.toLowerCase() === norm);
			if (key) entry = entries.get(key);
		}
		if (!entry) {
			throw new ZipError(`容器内找不到条目: ${path}`);
		}
		return readZipEntry(buf, entry);
	}

	private async readXmlEntry(
		entries: Map<string, ZipEntry>,
		buf: Uint8Array,
		path: string
	): Promise<XmlElementNode> {
		const bytes = await this.readEntryBytes(entries, buf, path);
		try {
			return readXml(bytes);
		} catch (error) {
			if (error instanceof XmlParseError) {
				throw new ZipError(`${path} XML 解析失败: ${error.message}`);
			}
			throw error;
		}
	}

	/** 相对 OPF 目录解析 href → ZIP 内路径 */
	private resolveHref(opfDir: string, href: string): string {
		const clean = href.replace(/\\/g, '/').split('#')[0].split('?')[0];
		if (!clean) return '';
		if (clean.startsWith('/')) return clean.slice(1);
		const parts = clean.split('/');
		const base = opfDir ? opfDir.split('/').filter((p) => p.length > 0) : [];
		for (const part of parts) {
			if (part === '..') base.pop();
			else if (part !== '.') base.push(part);
		}
		return base.join('/');
	}

	private parseOpf(root: XmlElementNode, opfDir: string): OpfInfo {
		const opf: OpfInfo = {
			manifestHrefs: new Map(),
			manifestTypes: new Map(),
			manifestProps: new Map(),
			spine: [],
			navIsNcx: false,
		};

		// metadata（dc: 命名空间）
		const metadata = firstChild(root, 'metadata');
		if (metadata) {
			for (const child of metadata.children) {
				if (child.type !== 'element') continue;
				const local = child.localName;
				if (local === 'title' && !opf.title) opf.title = textContent(child).trim();
				if (local === 'creator' && !opf.author) opf.author = textContent(child).trim();
				if (local === 'identifier' && !opf.identifier) {
					opf.identifier = textContent(child).trim();
				}
			}
		}

		// manifest
		const manifest = firstChild(root, 'manifest');
		if (manifest) {
			for (const item of childElements(manifest, 'item')) {
				const id = item.attrs['id'];
				const href = item.attrs['href'];
				const mediaType = item.attrs['media-type'] ?? '';
				const props = item.attrs['properties'] ?? '';
				if (!id || !href) continue;
				const resolved = this.resolveHref(opfDir, href);
				if (!resolved) continue;
				opf.manifestHrefs.set(id, resolved);
				opf.manifestTypes.set(id, mediaType);
				opf.manifestProps.set(id, props);
				// nav 检测：EPUB3 properties=nav
				if (props.split(/\s+/).includes('nav')) {
					opf.navPath = resolved;
					opf.navIsNcx = false;
				}
				// NCX 检测：EPUB2
				if (mediaType === 'application/x-dtbncx+xml') {
					opf.navPath = resolved;
					opf.navIsNcx = true;
				}
			}
		}

		// spine
		const spine = firstChild(root, 'spine');
		if (spine) {
			for (const itemref of childElements(spine, 'itemref')) {
				const idref = itemref.attrs['idref'];
				if (!idref) continue;
				const href = opf.manifestHrefs.get(idref);
				if (!href) continue;
				opf.spine.push({ idref, href });
			}
		}

		return opf;
	}

	/** 从 EPUB3 nav 提取标题列表（文档顺序 = spine 顺序；含嵌套 ol） */
	private extractNavTitles(root: XmlElementNode): string[] {
		const titles: string[] = [];
		const walk = (node: XmlElementNode) => {
			for (const li of childElements(node, 'li')) {
				const a = childElements(li, 'a')[0];
				if (a) {
					const text = textContent(a).trim();
					if (text) titles.push(text);
				}
				const nestedOl = childElements(li, 'ol')[0];
				if (nestedOl) walk(nestedOl);
			}
		};
		// nav 可能直接位于根（XHTML5 语义）或 body 下
		const body = firstChild(root, 'body');
		const navEl =
			childElements(root, 'nav')[0] ??
			(body ? childElements(body, 'nav')[0] : undefined) ??
			root;
		for (const ol of childElements(navEl, 'ol')) walk(ol);
		return titles;
	}

	/** 从 EPUB2 NCX 提取标题列表（navMap 文档顺序 = spine 顺序；含嵌套 navPoint） */
	private extractNcxTitles(root: XmlElementNode): string[] {
		const titles: string[] = [];
		const walk = (node: XmlElementNode) => {
			for (const np of childElements(node, 'navPoint')) {
				const label = childElements(np, 'navLabel')[0];
				const text = label ? textContent(label).trim() : '';
				if (text) titles.push(text);
				if (childElements(np, 'navPoint').length) walk(np);
			}
		};
		const navMap = childElements(root, 'navMap')[0] ?? root;
		walk(navMap);
		return titles;
	}

	async load(): Promise<BookMetadata> {
		if (this.loaded && this.metadata) {
			return this.metadata;
		}
		const { buf, entries } = await this.readZip();

		// container.xml
		const container = await this.readXmlEntry(entries, buf, 'META-INF/container.xml');
		const rootfiles = firstChild(container, 'rootfiles');
		const rootfile = rootfiles ? childElements(rootfiles, 'rootfile')[0] : undefined;
		if (!rootfile) {
			throw new ZipError('container.xml 中缺少 rootfile');
		}
		const opfPath = rootfile.attrs['full-path'];
		if (!opfPath) {
			throw new ZipError('rootfile 缺少 full-path');
		}
		const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';

		// OPF
		const opfRoot = await this.readXmlEntry(entries, buf, opfPath);
		const opf = this.parseOpf(opfRoot, opfDir);

		// 章节标题：nav（EPUB3）/ NCX（EPUB2）→ 标题列表（文档顺序 = spine 顺序）
		let titles: string[] = [];
		if (opf.navPath) {
			try {
				const navRoot = await this.readXmlEntry(entries, buf, opf.navPath);
				titles = opf.navIsNcx
					? this.extractNcxTitles(navRoot)
					: this.extractNavTitles(navRoot);
			} catch (error) {
				// nav 损坏不阻塞书架（标题回退默认）
				console.warn('EPUB nav/NCX 解析失败，使用默认标题', error);
			}
		}
		this.loadedNavTitles = titles;

		this.opf = opf;
		this.metadata = {
			title: opf.title ?? basename(this.filePath, extname(this.filePath)),
			format: this.format,
			filePath: this.filePath,
			sizeBytes: buf.byteLength,
			chapterCount: opf.spine.length,
		};
		this.loaded = true;
		return this.metadata;
	}

	async getChapterList(): Promise<ChapterInfo[]> {
		await this.load();
		const opf = this.opf!;
		return opf.spine.map((item, index) => {
			let title = '';
			// 标题优先级：nav/NCX 列表（按 index 对齐）→ 章节文件名 → "第N章"
			if (this.loadedNavTitles) {
				title = this.loadedNavTitles[index] ?? '';
			}
			if (!title) {
				const file = item.href.split('/').pop() ?? item.href;
				title = file ? basename(file, extname(file)) : '';
			}
			if (!title) title = `第${index + 1}章`;
			return {
				id: `epub:${index}`,
				index,
				title,
				isPreface: false,
			};
		});
	}

	async getChapterContent(info: ChapterInfo): Promise<ChapterContent> {
		await this.load();
		const opf = this.opf!;
		const item = opf.spine[info.index];
		if (!item) {
			throw new Error(`章节不存在: ${this.filePath}#${info.index}`);
		}
		const { buf, entries } = await this.readZip();
		const bytes = await this.readEntryBytes(entries, buf, item.href);
		let root: XmlElementNode;
		try {
			root = readXml(bytes);
		} catch (error) {
			// 内容错误隔离：损坏章节抛出明确错误，不影响其他章节
			if (error instanceof XmlParseError) {
				throw new Error(`章节 ${info.index + 1}（${item.href}）内容损坏: ${error.message}`);
			}
			throw error;
		}
		const blocks: ChapterBlock[] = extractBlocks(root);
		const lines = blocksToLines(blocks);
		return { info, blocks, lines };
	}

	dispose(): void {
		this.zipBuf = undefined;
		this.zipEntries = undefined;
		this.opf = undefined;
		this.metadata = undefined;
		this.loaded = false;
		this.loadedNavTitles = undefined;
	}
}
