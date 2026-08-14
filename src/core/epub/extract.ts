/**
 * XHTML → 正文块提取（Phase 4，P4-04）。
 *
 * 规则（与 ADR-008 一致：用户滚动经过的元素才计入段落索引）：
 * - `h1..h6` → `heading` 块；
 * - `p` → `paragraph` 块（合并内部所有行内元素文本，空白压缩）；
 * - `div` → 递归容器：含块级子元素时忽略自身文本只递归；仅文本时作为一个段落；
 * - `br` → 行内换行（同一段落内插入 `\n`）；连续多个 br 视为空段落分隔；
 * - `script` / `style` → 跳过（不执行脚本、不套用出版社 CSS，P4-04/P4-06）；
 * - `li` → 段落（列表项）；
 * - 其余行内元素（span/em/strong/a/i/b 等）→ 文本并入所在段落。
 *
 * 不引入出版社 CSS；不渲染图片（忽略 img）。
 */
import { XmlElementNode, XmlNode, childElements, textContent } from './xml';
import { ChapterBlock } from '../book/model';

/** 块级元素集合（决定 div 内文本是否并入段落） */
const BLOCK_LOCALS = new Set([
	'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
	'ul', 'ol', 'li', 'table', 'blockquote', 'section', 'article',
]);

const HEADING_LOCALS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const SKIP_LOCALS = new Set(['script', 'style', 'head', 'nav', 'title', 'meta', 'link']);

interface BlockCollector {
	blocks: ChapterBlock[];
	/** 当前段落的文本（可能含 br 换行） */
	current: string[];
}

function pushBlock(collector: BlockCollector, text: string, kind: ChapterBlock['kind']): void {
	const trimmed = text.trim();
	if (!trimmed) return;
	collector.blocks.push({
		index: collector.blocks.length,
		text: trimmed.replace(/\s*\n\s*/g, '\n').replace(/[ \t\r\f\v]+/g, ' '),
		kind,
	});
}

function walkNode(node: XmlNode, collector: BlockCollector): void {
	if (node.type === 'text' || node.type === 'cdata') {
		collector.current.push(node.text);
		return;
	}
	const el = node;
	const local = el.localName;

	if (SKIP_LOCALS.has(local)) return;
	if (local === 'br') {
		collector.current.push('\n');
		return;
	}
	if (local === 'img') {
		// 忽略图片（正文只提取文字）；alt 文本作为可读内容
		const alt = el.attrs['alt'];
		if (alt) collector.current.push(alt);
		return;
	}
	if (HEADING_LOCALS.has(local)) {
		// 先落当前段落，再开 heading 块
		pushBlock(collector, collector.current.join(''), 'paragraph');
		collector.current = [];
		pushBlock(collector, textContent(el), 'heading');
		return;
	}
	if (local === 'p') {
		pushBlock(collector, collector.current.join(''), 'paragraph');
		collector.current = [];
		const childCollector: BlockCollector = { blocks: [], current: [] };
		for (const child of el.children) walkNode(child, childCollector);
		pushBlock(childCollector, childCollector.current.join(''), 'paragraph');
		for (const b of childCollector.blocks) {
			collector.blocks.push({ ...b, index: collector.blocks.length });
		}
		return;
	}
	if (local === 'li') {
		pushBlock(collector, collector.current.join(''), 'paragraph');
		collector.current = [];
		const childCollector: BlockCollector = { blocks: [], current: [] };
		for (const child of el.children) walkNode(child, childCollector);
		pushBlock(childCollector, childCollector.current.join(''), 'paragraph');
		for (const b of childCollector.blocks) {
			collector.blocks.push({ ...b, index: collector.blocks.length });
		}
		return;
	}
	if (local === 'div' || local === 'section' || local === 'article' || local === 'blockquote') {
		// 容器：检查是否含块级子元素
		const hasBlockChild = el.children.some(
			(c) => c.type === 'element' && BLOCK_LOCALS.has(c.localName)
		);
		if (hasBlockChild) {
			for (const child of el.children) walkNode(child, collector);
		} else {
			// 仅文本的容器 → 作为段落
			pushBlock(collector, collector.current.join(''), 'paragraph');
			collector.current = [];
			const childCollector: BlockCollector = { blocks: [], current: [] };
			for (const child of el.children) walkNode(child, childCollector);
			pushBlock(childCollector, childCollector.current.join(''), 'paragraph');
			for (const b of childCollector.blocks) {
				collector.blocks.push({ ...b, index: collector.blocks.length });
			}
		}
		return;
	}
	// 其余元素：递归收集文本
	for (const child of el.children) walkNode(child, collector);
}

/**
 * 从 XHTML 根元素提取正文块（仅 body 内内容）。
 * 标题块（h1-h6）与段落块按文档顺序排列；空文本被忽略。
 */
export function extractBlocks(root: XmlElementNode): ChapterBlock[] {
	const body = childElements(root, 'body')[0] ?? root;
	const collector: BlockCollector = { blocks: [], current: [] };
	for (const child of body.children) walkNode(child, collector);
	pushBlock(collector, collector.current.join(''), 'paragraph');
	return collector.blocks;
}

/** 提取文本行（WebView 渲染用：heading 与 paragraph 均显示） */
export function blocksToLines(blocks: ChapterBlock[]): string[] {
	return blocks.map((b) => b.text);
}
