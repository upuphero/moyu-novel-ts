/**
 * 最小 ZIP 写入器（仅测试辅助用，Phase 4 fixtures）。
 * 支持 store（0）与 deflate（8）；生成标准 ZIP（含 Central Directory + EOCD）。
 * 与生产代码 src/core/epub/zip.ts 的读取器对应。
 */
import { deflateRawSync } from 'zlib';

export interface ZipInputFile {
	path: string;
	data: Uint8Array;
	/** 默认 deflate；false = store */
	compress?: boolean;
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

/** 构造 ZIP 字节 */
export function buildZip(files: ZipInputFile[]): Uint8Array {
	const localParts: Buffer[] = [];
	const centralParts: Buffer[] = [];
	let offset = 0;

	for (const file of files) {
		const nameBuf = Buffer.from(file.path, 'utf8');
		const raw = file.data;
		const compress = file.compress !== false;
		const compressed = compress ? new Uint8Array(deflateRawSync(Buffer.from(raw))) : raw;
		const method = compress ? 8 : 0;
		const crc = crc32(raw);

		// Local File Header
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4); // version needed
		local.writeUInt16LE(0, 6); // flags
		local.writeUInt16LE(method, 8);
		local.writeUInt16LE(0, 10); // mod time
		local.writeUInt16LE(0, 12); // mod date
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(compressed.byteLength, 18);
		local.writeUInt32LE(raw.byteLength, 22);
		local.writeUInt16LE(nameBuf.length, 26);
		local.writeUInt16LE(0, 28); // extra len
		localParts.push(local, nameBuf, Buffer.from(compressed));

		// Central Directory Header
		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4); // version made by
		central.writeUInt16LE(20, 6); // version needed
		central.writeUInt16LE(0, 8); // flags
		central.writeUInt16LE(method, 10);
		central.writeUInt16LE(0, 12); // mod time
		central.writeUInt16LE(0, 14); // mod date
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(compressed.byteLength, 20);
		central.writeUInt32LE(raw.byteLength, 24);
		central.writeUInt16LE(nameBuf.length, 28);
		central.writeUInt16LE(0, 30); // extra
		central.writeUInt16LE(0, 32); // comment
		central.writeUInt16LE(0, 34); // disk
		central.writeUInt16LE(0, 36); // internal attrs
		central.writeUInt32LE(0, 38); // external attrs
		central.writeUInt32LE(offset, 42); // local header offset
		centralParts.push(central, nameBuf);

		offset += local.length + nameBuf.length + compressed.byteLength;
	}

	const cdStart = offset;
	const cdBuf = Buffer.concat(centralParts);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(0, 4); // disk
	eocd.writeUInt16LE(0, 6); // cd start disk
	eocd.writeUInt16LE(files.length, 8);
	eocd.writeUInt16LE(files.length, 10);
	eocd.writeUInt32LE(cdBuf.length, 12);
	eocd.writeUInt32LE(cdStart, 16);
	eocd.writeUInt16LE(0, 20); // comment len

	return new Uint8Array(Buffer.concat([...localParts, cdBuf, eocd]));
}

/** 便捷：字符串文件 */
export function textFile(path: string, content: string, compress = true): ZipInputFile {
	return { path, data: new Uint8Array(Buffer.from(content, 'utf8')), compress };
}
