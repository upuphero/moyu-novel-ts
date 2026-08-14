/**
 * 最小 XML 解析器（Phase 4，P4-04/P4-06）。
 *
 * 只实现 EPUB 所需的 XML 子集：
 * - XML 声明、注释、CDATA、元素、属性（单/双引号）、文本、自闭合标签；
 * - 实体：仅预定义 5 个（quot/amp/apos/lt/gt）+ 数字实体（&#nn; / &#xhh;）；
 *   未知实体原样保留（容错真实书稿中常见的 &nbsp; 等 HTML 实体）；
 * - **DOCTYPE 一律拒绝**（XXE/外部实体防护，P4-06）；不支持 DTD 与外部实体；
 * - 解析错误抛 XmlParseError（内容错误隔离，单个损坏章节不影响其他章节）。
 *
 * 零第三方依赖。
 */
export class XmlParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'XmlParseError';
	}
}

export interface XmlTextNode {
	type: 'text';
	text: string;
}

export interface XmlCdataNode {
	type: 'cdata';
	text: string;
}

export interface XmlElementNode {
	type: 'element';
	/** 原始标签名（保留命名空间前缀，如 `dc:title`） */
	name: string;
	/** 无前缀标签名（如 `title`） */
	localName: string;
	attrs: Record<string, string>;
	children: XmlNode[];
}

export type XmlNode = XmlElementNode | XmlTextNode | XmlCdataNode;

export interface XmlDocument {
	/** 根元素 */
	root: XmlElementNode;
}

function decodeEntities(input: string): string {
	return input.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
		if (body[0] === '#') {
			const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
			if (Number.isFinite(code) && code >= 0 && code <= 0x10ffff) {
				try {
					return String.fromCodePoint(code);
				} catch {
					return match;
				}
			}
			return match;
		}
		switch (body) {
			case 'quot':
				return '"';
			case 'amp':
				return '&';
			case 'apos':
				return "'";
			case 'lt':
				return '<';
			case 'gt':
				return '>';
			default:
				// 未知实体（如 nbsp）原样保留
				return match;
		}
	});
}

function decodeAttrValue(input: string): string {
	// 属性值中不允许裸 <（由解析保证）；实体解码
	return decodeEntities(input);
}

class Parser {
	private pos = 0;

	constructor(private readonly input: string) {}

	private error(message: string): never {
		const line = this.input.slice(0, this.pos).split('\n').length;
		throw new XmlParseError(`${message}（第 ${line} 行附近）`);
	}

	private skipWhitespace(): void {
		while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
			this.pos++;
		}
	}

	/** 剥离 BOM（UTF-8 BOM 在解码时已处理；此处兼容直接字符串） */
	private skipBom(): void {
		if (this.input.startsWith('\uFEFF')) {
			this.pos = 1;
		}
	}

	private startsWith(prefix: string): boolean {
		return this.input.startsWith(prefix, this.pos);
	}

	parse(): XmlDocument {
		this.skipBom();
		// 1) XML 声明
		if (this.startsWith('<?')) {
			const end = this.input.indexOf('?>', this.pos);
			if (end < 0) this.error('XML 声明未闭合');
			this.pos = end + 2;
		}
		// 2) 顶层：允许注释/空白后接根元素
		let root: XmlElementNode | null = null;
		for (;;) {
			this.skipWhitespace();
			if (this.pos >= this.input.length) {
				if (!root) this.error('未找到根元素');
				break;
			}
			if (this.startsWith('<!--')) {
				this.skipComment();
				continue;
			}
			if (this.startsWith('<!DOCTYPE')) {
				// XXE 防护：仅允许无内部子集、无外部标识符的简单 DOCTYPE（如 <!DOCTYPE html>）
				const end = this.input.indexOf('>', this.pos);
				if (end < 0) this.error('DOCTYPE 未闭合');
				const body = this.input.slice(this.pos + 9, end);
				if (body.includes('[') || /SYSTEM|PUBLIC/i.test(body)) {
					this.error('DOCTYPE 含内部子集/外部引用（XXE 防护）');
				}
				this.pos = end + 1;
				continue;
			}
			if (this.startsWith('<!')) {
				this.error('不支持的声明');
			}
			if (this.input[this.pos] === '<') {
				if (root) this.error('存在多个根元素');
				root = this.parseElement();
				continue;
			}
			this.error('根元素前存在文本');
		}
		return { root: root! };
	}

	private skipComment(): void {
		const end = this.input.indexOf('-->', this.pos + 4);
		if (end < 0) this.error('注释未闭合');
		this.pos = end + 3;
	}

	private parseElement(): XmlElementNode {
		// 当前位置为 '<'
		this.pos++; // '<'
		const name = this.readName();
		const attrs: Record<string, string> = {};
		for (;;) {
			this.skipWhitespace();
			if (this.pos >= this.input.length) this.error('元素未闭合');
			const ch = this.input[this.pos];
			if (ch === '>') {
				this.pos++;
				break;
			}
			if (ch === '/') {
				if (this.input[this.pos + 1] !== '>') this.error('非法的自闭合标签');
				this.pos += 2;
				return { type: 'element', name, localName: localOf(name), attrs, children: [] };
			}
			// 属性
			const attrName = this.readName();
			this.skipWhitespace();
			if (this.input[this.pos] !== '=') this.error(`属性 ${attrName} 缺少 "="`);
			this.pos++;
			this.skipWhitespace();
			const quote = this.input[this.pos];
			if (quote !== '"' && quote !== "'") this.error(`属性 ${attrName} 引号非法`);
			this.pos++;
			const end = this.input.indexOf(quote, this.pos);
			if (end < 0) this.error(`属性 ${attrName} 未闭合`);
			const raw = this.input.slice(this.pos, end);
			this.pos = end + 1;
			attrs[attrName] = decodeAttrValue(raw);
		}
		// 子节点
		const children: XmlNode[] = [];
		for (;;) {
			if (this.pos >= this.input.length) this.error(`元素 <${name}> 未闭合`);
			if (this.startsWith('</')) {
				const end = this.input.indexOf('>', this.pos + 2);
				if (end < 0) this.error('闭合标签未闭合');
				const closeName = this.input.slice(this.pos + 2, end).trim();
				if (closeName !== name) this.error(`闭合标签不匹配: </${closeName}> 期望 </${name}>`);
				this.pos = end + 1;
				return { type: 'element', name, localName: localOf(name), attrs, children };
			}
			if (this.startsWith('<!--')) {
				this.skipComment();
				continue;
			}
			if (this.startsWith('<![CDATA[')) {
				const end = this.input.indexOf(']]>', this.pos + 9);
				if (end < 0) this.error('CDATA 未闭合');
				children.push({ type: 'cdata', text: this.input.slice(this.pos + 9, end) });
				this.pos = end + 3;
				continue;
			}
			if (this.startsWith('<!DOCTYPE')) {
				// XXE 防护：仅允许无内部子集、无外部标识符的简单 DOCTYPE（如 <!DOCTYPE html>）
				const end = this.input.indexOf('>', this.pos);
				if (end < 0) this.error('DOCTYPE 未闭合');
				const body = this.input.slice(this.pos + 9, end);
				if (body.includes('[') || /SYSTEM|PUBLIC/i.test(body)) {
					this.error('DOCTYPE 含内部子集/外部引用（XXE 防护）');
				}
				this.pos = end + 1;
				continue;
			}
			if (this.startsWith('<!')) {
				this.error('不支持的声明');
			}
			if (this.input[this.pos] === '<') {
				children.push(this.parseElement());
				continue;
			}
			// 文本
			const textEnd = this.input.indexOf('<', this.pos);
			const rawText = textEnd < 0 ? this.input.slice(this.pos) : this.input.slice(this.pos, textEnd);
			if (rawText.length > 0) {
				children.push({ type: 'text', text: decodeEntities(rawText) });
			}
			if (textEnd < 0) this.error(`元素 <${name}> 未闭合`);
			this.pos = textEnd;
		}
	}

	private readName(): string {
		const start = this.pos;
		while (this.pos < this.input.length) {
			const ch = this.input[this.pos];
			if (/[a-zA-Z0-9_:\-.]/.test(ch)) {
				this.pos++;
			} else {
				break;
			}
		}
		if (this.pos === start) this.error('预期标签/属性名');
		return this.input.slice(start, this.pos);
	}
}

function localOf(name: string): string {
	const idx = name.indexOf(':');
	return idx >= 0 ? name.slice(idx + 1) : name;
}

/** 解析 XML 文本；失败抛 XmlParseError */
export function parseXml(input: string): XmlDocument {
	return new Parser(input).parse();
}

/** 便捷：按 localName 查找直接子元素 */
export function childElements(node: XmlElementNode, localName: string): XmlElementNode[] {
	return node.children.filter(
		(c): c is XmlElementNode => c.type === 'element' && c.localName === localName
	);
}

/** 便捷：第一个匹配的直接子元素 */
export function firstChild(node: XmlElementNode, localName: string): XmlElementNode | undefined {
	return childElements(node, localName)[0];
}

/** 便捷：元素内全部文本（含后代），用于取 title/author 等简单内容 */
export function textContent(node: XmlElementNode): string {
	let out = '';
	for (const child of node.children) {
		if (child.type === 'text' || child.type === 'cdata') {
			out += child.text;
		} else {
			out += textContent(child);
		}
	}
	return out;
}
