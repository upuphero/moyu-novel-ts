/**
 * 最小 EPUB 2/3 fixtures（测试辅助）。
 * 全部为自编占位内容（无版权材料），供 P4-02/03/04/06 测试使用。
 */
import { buildZip, textFile, ZipInputFile } from './buildZip';

const XHTML_HEADER = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>章节</title></head>
<body>`;

const XHTML_FOOTER = `</body>
</html>`;

export function chapterXhtml(title: string, paragraphs: string[]): string {
	const body = [
		`<h1>${title}</h1>`,
		...paragraphs.map((p) => `<p>${p}</p>`),
	].join('\n');
	return `${XHTML_HEADER}\n${body}\n${XHTML_FOOTER}`;
}

export function xhtml(
	body: string,
	opts: { withDoctype?: boolean } = {}
): string {
	const doctype = opts.withDoctype !== false ? '<!DOCTYPE html>\n' : '';
	return `<?xml version="1.0" encoding="utf-8"?>\n${doctype}<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body>${body}</body></html>`;
}

/** EPUB2 最小书（NCX 目录，无 nav） */
export function buildEpub2(
	opts: {
		title?: string;
		author?: string;
		identifier?: string;
		chapters?: { id: string; file: string; title: string; paragraphs: string[] }[];
	} = {}
): Uint8Array {
	const title = opts.title ?? '测试之书二';
	const author = opts.author ?? '测试作者';
	const identifier = opts.identifier ?? 'urn:uuid:test-epub2-0001';
	const chapters =
		opts.chapters ?? [
			{ id: 'c1', file: 'chapter1.xhtml', title: '第一章 相遇', paragraphs: ['风起于青萍之末。', '他回身望去。'] },
			{ id: 'c2', file: 'chapter2.xhtml', title: '第二章 离别', paragraphs: ['长亭外，古道边。', '自此一别，山高水长。'] },
		];

	const manifest = [
		'<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
		...chapters.map(
			(c, i) =>
				`<item id="${c.id}" href="${c.file}" media-type="application/xhtml+xml"/>` +
				(i === 0 ? '' : '')
		),
	].join('\n');
	const spine = chapters.map((c) => `<itemref idref="${c.id}"/>`).join('\n');
	const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${identifier}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>zh</dc:language>
  </metadata>
  <manifest>
    ${manifest}
  </manifest>
  <spine toc="ncx">
    ${spine}
  </spine>
</package>`;

	const ncx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${identifier}"/></head>
  <docTitle><text>${title}</text></docTitle>
  <navMap>
    ${chapters
			.map(
				(c, i) =>
					`<navPoint id="np${i}" playOrder="${i + 1}"><navLabel><text>${c.title}</text></navLabel><content src="${c.file}#p${i}"/></navPoint>`
			)
			.join('\n')}
  </navMap>
</ncx>`;

	const files: ZipInputFile[] = [
		textFile('mimetype', 'application/epub+zip', false),
		textFile(
			'META-INF/container.xml',
			`<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
		),
		textFile('OEBPS/content.opf', opf),
		textFile('OEBPS/toc.ncx', ncx),
		...chapters.map((c) =>
			textFile(`OEBPS/${c.file}`, chapterXhtml(c.title, c.paragraphs))
		),
	];
	return buildZip(files);
}

/** EPUB3 最小书（nav 文档） */
export function buildEpub3(
	opts: {
		title?: string;
		author?: string;
		chapters?: { id: string; file: string; title: string; paragraphs: string[] }[];
	} = {}
): Uint8Array {
	const title = opts.title ?? '测试之书三';
	const author = opts.author ?? '测试作者';
	const chapters =
		opts.chapters ?? [
			{ id: 'c1', file: 'text/ch1.xhtml', title: '第一章 序曲', paragraphs: ['序幕拉开。', '舞台上空无一人。'] },
			{ id: 'c2', file: 'text/ch2.xhtml', title: '第二章 登场', paragraphs: ['他登场了。', '掌声如潮。'] },
			{ id: 'c3', file: 'text/ch3.xhtml', title: '第三章 落幕', paragraphs: ['帷幕落下。', '一切归于平静。'] },
		];

	const manifest = [
		'<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
		...chapters.map(
			(c) => `<item id="${c.id}" href="${c.file}" media-type="application/xhtml+xml"/>`
		),
	].join('\n');
	const spine = chapters.map((c) => `<itemref idref="${c.id}"/>`).join('\n');
	const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:test-epub3-0001</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>zh</dc:language>
  </metadata>
  <manifest>
    ${manifest}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`;

	const nav = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head>
<body>
  <nav epub:type="toc">
    <ol>
      ${chapters
				.map(
					(c, i) => `<li><a href="${c.file}#p${i}">${c.title}</a></li>`
				)
				.join('\n')}
    </ol>
  </nav>
</body>
</html>`;

	const files: ZipInputFile[] = [
		textFile('mimetype', 'application/epub+zip', false),
		textFile(
			'META-INF/container.xml',
			`<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
		),
		textFile('OEBPS/content.opf', opf),
		textFile('OEBPS/nav.xhtml', nav),
		...chapters.map((c) =>
			textFile(`OEBPS/${c.file}`, chapterXhtml(c.title, c.paragraphs))
		),
	];
	return buildZip(files);
}

/** 缺失可选 metadata 的 EPUB（无 title/author/identifier/nav） */
export function buildEpubMinimal(): Uint8Array {
	const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:test-minimal</dc:identifier>
    <dc:language>zh</dc:language>
  </metadata>
  <manifest>
    <item id="c1" href="body1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
  </spine>
</package>`;
	const files: ZipInputFile[] = [
		textFile('mimetype', 'application/epub+zip', false),
		textFile(
			'META-INF/container.xml',
			`<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
		),
		textFile('content.opf', opf),
		textFile('body1.xhtml', xhtml('<h1>只有一章</h1><p>内容。</p>')),
	];
	return buildZip(files);
}
