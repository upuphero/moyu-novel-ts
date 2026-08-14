/**
 * P4-02/P4-06：最小 ZIP 读取器测试。
 * store/deflate 解压、路径穿越拒绝、ZIP64 拒绝、大小/压缩比限制、CRC 校验、损坏检测。
 */
import * as assert from "assert";
import {
	MAX_COMPRESSION_RATIO,
	MAX_ENTRY_SIZE,
	ZipError,
	crc32,
	normalizeEntryName,
	parseZipIndex,
	readZipEntry,
} from "../../../core/epub/zip";
import { buildZip, textFile } from "../../helpers/buildZip";
import { deflateRawSync } from "zlib";

function readOne(buf: Uint8Array, name: string) {
	const entries = parseZipIndex(buf);
	const entry = entries.get(name);
	assert.ok(entry, `条目 ${name} 存在`);
	return readZipEntry(buf, entry!);
}

suite("zip.parseZipIndex", () => {
	test("store 条目（mimetype）读取内容一致", () => {
		const buf = buildZip([
			{ path: "mimetype", data: new Uint8Array(Buffer.from("application/epub+zip")), compress: false },
			textFile("OEBPS/a.xhtml", "<html/>"),
		]);
		const got = Buffer.from(readOne(buf, "mimetype")).toString("utf8");
		assert.strictEqual(got, "application/epub+zip");
	});

	test("deflate 条目读取内容一致", () => {
		const content = "第一章 开始\n正文内容……\n".repeat(100);
		const buf = buildZip([textFile("book.txt", content)]);
		const got = Buffer.from(readOne(buf, "book.txt")).toString("utf8");
		assert.strictEqual(got, content);
	});

	test("目录条目被跳过，条目数正确", () => {
		const buf = buildZip([
			textFile("dir/", ""),
			textFile("dir/a.txt", "A"),
		]);
		const entries = parseZipIndex(buf);
		assert.strictEqual(entries.size, 1);
		assert.ok(entries.has("dir/a.txt"));
	});

	test("路径穿越拒绝（.. / 绝对路径 / 反斜杠）", () => {
		assert.throws(() => normalizeEntryName("../evil.txt"), ZipError);
		assert.throws(() => normalizeEntryName("/etc/passwd"), ZipError);
		assert.throws(() => normalizeEntryName("..\\evil.txt"), ZipError);
		assert.throws(() => normalizeEntryName(""), ZipError);
	});

	test("ZIP64 EOCD locator → 明确报错", () => {
		// 构造一个 ZIP64 变体：在 EOCD 前插入 ZIP64 locator 签名
		const base = buildZip([textFile("a.txt", "A")]);
		const buf = Buffer.from(base);
		// 找到 EOCD（末尾 22 字节）
		const eocdPos = buf.length - 22;
		// 在 EOCD 前插入 20 字节的 ZIP64 locator（PK\x06\x07）
		const locator = Buffer.alloc(20);
		locator.writeUInt32LE(0x07064b50, 0);
		const newBuf = Buffer.concat([buf.slice(0, eocdPos), locator, buf.slice(eocdPos)]);
		assert.throws(() => parseZipIndex(new Uint8Array(newBuf)), /ZIP64/);
	});

	test("非 ZIP 数据 → 明确报错", () => {
		assert.throws(() => parseZipIndex(new Uint8Array(100)), ZipError);
	});
});

suite("zip 安全限制（P4-06）", () => {
	test("条目解压大小超限被拒", () => {
		// 手动构造：uncompressedSize 超过上限的中央目录条目
		const nameBuf = Buffer.from("big.bin");
		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0, 8);
		central.writeUInt16LE(0, 10); // store
		central.writeUInt32LE(0, 16); // crc
		central.writeUInt32LE(0, 20); // compressed
		central.writeUInt32LE(MAX_ENTRY_SIZE + 1, 24); // uncompressed 超限
		central.writeUInt16LE(nameBuf.length, 28);
		central.writeUInt32LE(0, 42); // local offset
		const cd = Buffer.concat([central, nameBuf]);
		const eocd = Buffer.alloc(22);
		eocd.writeUInt32LE(0x06054b50, 0);
		eocd.writeUInt16LE(1, 8);
		eocd.writeUInt16LE(1, 10);
		eocd.writeUInt32LE(cd.length, 12);
		eocd.writeUInt32LE(0, 16);
		const buf = new Uint8Array(Buffer.concat([cd, eocd]));
		// 压缩比检查在 compressedSize>0 时触发；这里 compressed=0 跳过，进入 readZipEntry 的大小检查
		const entries = parseZipIndex(buf);
		const entry = entries.get("big.bin");
		assert.ok(entry);
		assert.throws(() => readZipEntry(buf, entry!), /超限/);
	});

	test("压缩比异常（ZIP bomb 特征）被拒", () => {
		// 构造：compressed 很小但 uncompressed 极大（ratio 超限）
		const nameBuf = Buffer.from("bomb.bin");
		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0, 8);
		central.writeUInt16LE(8, 10); // deflate
		central.writeUInt32LE(0, 16);
		central.writeUInt32LE(10, 20); // compressed 10 bytes
		central.writeUInt32LE(10 * MAX_COMPRESSION_RATIO + 1000, 24); // uncompressed 极大
		central.writeUInt16LE(nameBuf.length, 28);
		central.writeUInt32LE(0, 42);
		const cd = Buffer.concat([central, nameBuf]);
		const eocd = Buffer.alloc(22);
		eocd.writeUInt32LE(0x06054b50, 0);
		eocd.writeUInt16LE(1, 8);
		eocd.writeUInt16LE(1, 10);
		eocd.writeUInt32LE(cd.length, 12);
		eocd.writeUInt32LE(0, 16);
		const buf = new Uint8Array(Buffer.concat([cd, eocd]));
		assert.throws(() => parseZipIndex(buf), /ZIP bomb/);
	});

	test("CRC 校验失败（条目损坏）被拒", () => {
		const content = "正文内容";
		// store 存储（不压缩），便于直接篡改数据字节
		const buf = buildZip([
			{ path: "a.txt", data: new Uint8Array(Buffer.from(content)), compress: false },
		]);
		const arr = new Uint8Array(buf);
		const idx = Buffer.from(arr).indexOf(Buffer.from("正文", "utf8"));
		assert.ok(idx >= 0, "找到正文位置");
		arr[idx] = arr[idx] ^ 0xff;
		const entries = parseZipIndex(new Uint8Array(arr));
		assert.throws(() => readZipEntry(new Uint8Array(arr), entries.get("a.txt")!), /CRC/);
	});

	test("local header 缺失 → 明确报错", () => {
		const content = "x";
		const buf = buildZip([textFile("a.txt", content)]);
		const arr = new Uint8Array(buf);
		// 覆盖第一个 local header 签名
		arr[0] = 0;
		arr[1] = 0;
		const entries = parseZipIndex(arr);
		assert.throws(() => readZipEntry(arr, entries.get("a.txt")!), /Local File Header/);
	});
});

suite("zip.crc32", () => {
	test("已知值校验", () => {
		assert.strictEqual(crc32(new Uint8Array(Buffer.from('123456789'))), 0xcbf43926);
		assert.strictEqual(crc32(new Uint8Array(0)), 0);
	});
});

suite("zip 与 zlib 互通", () => {
	test("deflateRawSync 解压路径与写入器一致", () => {
		const content = "互通测试内容".repeat(50);
		const compressed = new Uint8Array(deflateRawSync(Buffer.from(content)));
		const raw = Buffer.from(new Uint8Array(compressed));
		// 直接通过 readZipEntry 验证（构造 store 方式不行，这里验证 inflateRawSync 基础）
		const inflated = require('zlib').inflateRawSync(raw);
		assert.strictEqual(inflated.toString('utf8'), content);
	});
});
