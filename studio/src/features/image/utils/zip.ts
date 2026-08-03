import type { ZipEntry } from '@/features/image/types/image';

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const DOS_DATE_1980_01_01 = 0x0021;
const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;

let crcTable: Uint32Array | undefined;

function getCrcTable(): Uint32Array {
  if (crcTable) {
    return crcTable;
  }

  crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    crcTable[index] = value >>> 0;
  }
  return crcTable;
}

function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function abortError(): DOMException {
  return new DOMException('ZIP 打包已取消', 'AbortError');
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

async function crc32Blob(blob: Blob, signal?: AbortSignal): Promise<number> {
  checkAborted(signal);

  if (typeof blob.stream !== 'function') {
    return crc32(new Uint8Array(await blob.arrayBuffer()));
  }

  const table = getCrcTable();
  const reader = blob.stream().getReader();
  let crc = 0xffffffff;

  try {
    while (true) {
      checkAborted(signal);
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      for (const byte of value) {
        crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
      }
    }
  } finally {
    reader.releaseLock();
  }

  checkAborted(signal);
  return (crc ^ 0xffffffff) >>> 0;
}

function normalizeEntryName(name: string): string {
  const parts = name
    .replaceAll('\\', '/')
    .split('/')
    .filter((part) => part && part !== '.');
  const safeParts: string[] = [];

  for (const part of parts) {
    if (part === '..') {
      safeParts.pop();
      continue;
    }
    safeParts.push(part.replaceAll('\u0000', ''));
  }

  const normalized = safeParts.join('/');
  if (!normalized) {
    throw new TypeError('ZIP 条目名称不能为空');
  }

  return normalized;
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function createLocalHeader(name: Uint8Array, checksum: number, size: number): Uint8Array {
  const header = new Uint8Array(30 + name.length);
  const view = new DataView(header.buffer);

  view.setUint32(0, LOCAL_FILE_HEADER_SIGNATURE, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, UTF8_FLAG, true);
  view.setUint16(8, STORE_METHOD, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, DOS_DATE_1980_01_01, true);
  view.setUint32(14, checksum, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, name.length, true);
  view.setUint16(28, 0, true);
  header.set(name, 30);

  return header;
}

function createCentralHeader(
  name: Uint8Array,
  checksum: number,
  size: number,
  localOffset: number,
): Uint8Array {
  const header = new Uint8Array(46 + name.length);
  const view = new DataView(header.buffer);

  view.setUint32(0, CENTRAL_DIRECTORY_SIGNATURE, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, UTF8_FLAG, true);
  view.setUint16(10, STORE_METHOD, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, DOS_DATE_1980_01_01, true);
  view.setUint32(16, checksum, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, name.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localOffset, true);
  header.set(name, 46);

  return header;
}

function createEndRecord(
  entryCount: number,
  directorySize: number,
  directoryOffset: number,
): Uint8Array {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);

  view.setUint32(0, END_OF_CENTRAL_DIRECTORY_SIGNATURE, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, directorySize, true);
  view.setUint32(16, directoryOffset, true);
  view.setUint16(20, 0, true);

  return record;
}

/**
 * 创建无压缩 ZIP。图片本身通常已压缩，STORE 模式可避免额外依赖与无意义耗时。
 */
export async function createZip(entries: ZipEntry[], signal?: AbortSignal): Promise<Blob> {
  if (entries.length > MAX_UINT16) {
    throw new RangeError('ZIP 文件数量超过 65535，暂不支持 ZIP64');
  }

  const localChunks: BlobPart[] = [];
  const centralChunks: Uint8Array[] = [];
  const encoder = new TextEncoder();
  let localOffset = 0;

  for (const entry of entries) {
    checkAborted(signal);
    const name = encoder.encode(normalizeEntryName(entry.name));
    if (name.length > MAX_UINT16) {
      throw new RangeError(`ZIP 条目名称过长：${entry.name}`);
    }
    if (entry.blob.size > MAX_UINT32) {
      throw new RangeError(`ZIP 条目超过 4 GiB：${entry.name}`);
    }

    const checksum = await crc32Blob(entry.blob, signal);
    const localHeader = createLocalHeader(name, checksum, entry.blob.size);
    const centralHeader = createCentralHeader(name, checksum, entry.blob.size, localOffset);

    localChunks.push(toBlobPart(localHeader), entry.blob);
    centralChunks.push(centralHeader);
    localOffset += localHeader.length + entry.blob.size;
    if (localOffset > MAX_UINT32) {
      throw new RangeError('ZIP 文件超过 4 GiB，暂不支持 ZIP64');
    }
  }

  const directory = concat(centralChunks);
  if (directory.length > MAX_UINT32) {
    throw new RangeError('ZIP 目录过大，暂不支持 ZIP64');
  }

  const endRecord = createEndRecord(entries.length, directory.length, localOffset);
  checkAborted(signal);
  return new Blob([...localChunks, toBlobPart(directory), toBlobPart(endRecord)], {
    type: 'application/zip',
  });
}
