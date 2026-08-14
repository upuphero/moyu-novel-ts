/**
 * 最小 ZIP 读取器（Phase 4，P4-02/P4-06）。
 *
 * 仅实现 EPUB 所需的 ZIP 子集：
 * - EOCD 定位 + Central Directory 遍历 + Local File Header 数据定位；
 * - store（0）与 deflate（8）两种压缩（deflate 用 node:zlib 原生解压）；
 * - ZIP64 明确报错（EPUB 2/3 常规文件不涉及）；
 * - 安全：路径规范化（拒绝绝对路径 / `..` / 反斜杠）、条目数与解压大小上限、
 *   压缩比上限（ZIP bomb 早期检测）、CRC32 校验（store 条目）。
 *
 * 零第三方依赖（node:zlib + node:fs），许可证与体积问题不存在（ADR-010）。
 */
import { inflateRawSync } from 'zlib';

export class ZipError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ZipError';
	}
}

/** 单文件解压大小上限（64 MB，防御 ZIP bomb） */
export const MAX_ENTRY_SIZE = 64 * 1024 * 1024;
/** 条目数量上限 */
export const MAX_ENTRIES = 10_000;
/** 压缩比上限（压缩后:解压前 > 1000:1 视为 bomb） */
export const MAX_COMPRESSION_RATIO = 1000;

export interface ZipEntry {
	/** 规范化容器内路径（`/` 分隔、无前导 `/`、无 `..`、无 `\`） */
	name: string;
	/** 0 = store, 8 = deflate */
	method: number;
	compressedSize: number;
	uncompressedSize: number;
	/** local header 中数据区起始偏移 */
	dataOffset: number;
	crc32: number;
}

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();

export function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;
	for (let i = 0; i < data.length; i++) {
		crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

/** 规范化并校验条目名（P4-06 路径穿越防护） */
export function normalizeEntryName(raw: string): string {
	if (!raw || raw.length === 0) {
		throw new ZipError('ZIP 条目名为空');
	}
	const name = raw.replace(/\\/g, '/');
	if (name.startsWith('/')) {
		throw new ZipError(`ZIP 条目为绝对路径: ${name}`);
	}
	const parts = name.split('/');
	for (const part of parts) {
		if (part === '..') {
			throw new ZipError(`ZIP 条目包含 .. 路径穿越: ${name}`);
		}
	}
	return name;
}

/** 读取 Uint16LE / Uint32LE 小助手 */
function u16(buf: Uint8Array, offset: number): number {
	return (buf[offset] | (buf[offset + 1] << 8)) >>> 0;
}
function u32(buf: Uint8Array, offset: number): number {
	return (
		(buf[offset] |
			(buf[offset + 1] << 8) |
			(buf[offset + 2] << 16) |
			(buf[offset + 3] << 24)) >>>
		0
	);
}

/**
 * 解析 ZIP 索引（EOCD + Central Directory）。
 * 不读取条目数据；entries 为 名称 → 条目 映射（保留顺序）。
 */
export function parseZipIndex(buf: Uint8Array): Map<string, ZipEntry> {
	if (buf.length < 22) {
		throw new ZipError('文件过小，不是有效的 ZIP');
	}
	// 1) 从尾部搜索 EOCD（PK\x05\x06）；注释长度最长 65535，搜索窗口为末尾 65557 字节
	const eocdStart = Math.max(0, buf.length - 22 - 65535);
	let eocd = -1;
	for (let i = buf.length - 22; i >= eocdStart; i--) {
		if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) {
		throw new ZipError('未找到 ZIP End of Central Directory');
	}
	// 2) ZIP64 EOCD locator（PK\x06\x07）位于 EOCD 之前 → 不支持（EPUB 常规文件不涉及）
	if (
		eocd >= 20 &&
		buf[eocd - 20] === 0x50 &&
		buf[eocd - 19] === 0x4b &&
		buf[eocd - 18] === 0x06 &&
		buf[eocd - 17] === 0x07
	) {
		throw new ZipError('ZIP64 暂不支持（EPUB 文件通常不使用 ZIP64）');
	}
	const totalEntries = u16(buf, eocd + 10);
	const cdSize = u32(buf, eocd + 12);
	const cdOffset = u32(buf, eocd + 16);
	if (totalEntries > MAX_ENTRIES) {
		throw new ZipError(`ZIP 条目数超限: ${totalEntries}`);
	}
	if (cdOffset + cdSize > buf.length) {
		throw new ZipError('Central Directory 越界（文件损坏）');
	}

	const entries = new Map<string, ZipEntry>();
	let cursor = cdOffset;
	for (let n = 0; n < totalEntries; n++) {
		if (cursor + 46 > buf.length || !(buf[cursor] === 0x50 && buf[cursor + 1] === 0x4b && buf[cursor + 2] === 0x01 && buf[cursor + 3] === 0x02)) {
			throw new ZipError('Central Directory 条目损坏');
		}
		const method = u16(buf, cursor + 10);
		const crc = u32(buf, cursor + 16);
		const compressedSize = u32(buf, cursor + 20);
		const uncompressedSize = u32(buf, cursor + 24);
		const nameLen = u16(buf, cursor + 28);
		const extraLen = u16(buf, cursor + 30);
		const commentLen = u16(buf, cursor + 32);
		const localOffset = u32(buf, cursor + 42);
		const nameStart = cursor + 46;
		const rawName = Buffer.from(buf.slice(nameStart, nameStart + nameLen)).toString('utf8');
		const name = normalizeEntryName(rawName);
		if (method !== 0 && method !== 8) {
			throw new ZipError(`不支持的压缩方法: ${method}（条目 ${name}）`);
		}
		// 目录条目（以 / 结尾）跳过
		if (name.endsWith('/')) {
			cursor += 46 + nameLen + extraLen + commentLen;
			continue;
		}
		// 压缩比早期检测（ZIP bomb）
		if (compressedSize > 0 && uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO) {
			throw new ZipError(`条目压缩比异常（疑似 ZIP bomb）: ${name}`);
		}
		entries.set(name, {
			name,
			method,
			compressedSize,
			uncompressedSize,
			dataOffset: localOffset,
			crc32: crc,
		});
		cursor += 46 + nameLen + extraLen + commentLen;
	}
	return entries;
}

/**
 * 读取并解压单个条目（P4-06 大小上限与 CRC 校验）。
 */
export function readZipEntry(buf: Uint8Array, entry: ZipEntry): Uint8Array {
	if (entry.uncompressedSize > MAX_ENTRY_SIZE) {
		throw new ZipError(`条目解压大小超限: ${entry.name}`);
	}
	// Local File Header（PK\x03\x04）
	const lfh = entry.dataOffset;
	if (lfh + 30 > buf.length || !(buf[lfh] === 0x50 && buf[lfh + 1] === 0x4b && buf[lfh + 2] === 0x03 && buf[lfh + 3] === 0x04)) {
		throw new ZipError(`Local File Header 损坏: ${entry.name}`);
	}
	const nameLen = u16(buf, lfh + 26);
	const extraLen = u16(buf, lfh + 28);
	const dataStart = lfh + 30 + nameLen + extraLen;
	const compressed = buf.slice(dataStart, dataStart + entry.compressedSize);
	if (compressed.length !== entry.compressedSize) {
		throw new ZipError(`条目数据越界: ${entry.name}`);
	}
	let data: Uint8Array;
	if (entry.method === 0) {
		data = compressed;
	} else {
		try {
			data = new Uint8Array(inflateRawSync(Buffer.from(compressed)));
		} catch (error) {
			throw new ZipError(`解压失败（条目可能损坏）: ${entry.name}（${String(error)}）`);
		}
	}
	if (data.length !== entry.uncompressedSize) {
		throw new ZipError(`解压后大小不符: ${entry.name}`);
	}
	if (crc32(data) !== entry.crc32) {
		throw new ZipError(`CRC 校验失败（条目损坏）: ${entry.name}`);
	}
	return data;
}
