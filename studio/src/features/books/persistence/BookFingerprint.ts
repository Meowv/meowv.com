const DEFAULT_SAMPLE_BYTES = 64 * 1024;

export interface BookFingerprintSource {
  size: number;
  lastModified?: number;
  slice(start?: number, end?: number): Blob;
}

export interface BookFingerprintOptions {
  sampleBytes?: number;
}

function assertSampleBytes(sampleBytes: number): void {
  if (!Number.isInteger(sampleBytes) || sampleBytes <= 0) {
    throw new RangeError('sampleBytes 必须是正整数。');
  }
}

function appendUint64(target: Uint8Array, offset: number, value: number): void {
  const safeValue = Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0));
  new DataView(target.buffer, target.byteOffset, target.byteLength).setBigUint64(
    offset,
    BigInt(safeValue),
    false,
  );
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('当前浏览器不支持 SHA-256，无法生成书籍指纹。');
  }
  return subtle;
}

/**
 * 由文件大小、时间戳与头尾采样字节计算指纹；供完整文件与远端分段读取复用。
 */
export async function createBookFingerprintFromParts(
  size: number,
  lastModified: number,
  head: Uint8Array,
  tail: Uint8Array,
): Promise<string> {
  const metadataBytes = 16;
  const input = new Uint8Array(metadataBytes + head.byteLength + tail.byteLength);
  appendUint64(input, 0, size);
  appendUint64(input, 8, lastModified);
  input.set(head, metadataBytes);
  input.set(tail, metadataBytes + head.byteLength);
  return toHex(await getSubtleCrypto().digest('SHA-256', input));
}

/**
 * 指纹仅读取文件头尾固定片段，并加入 size/lastModified；不会保存文件名或正文。
 */
export async function createBookFingerprint(
  source: BookFingerprintSource,
  options: BookFingerprintOptions = {},
): Promise<string> {
  const sampleBytes = options.sampleBytes ?? DEFAULT_SAMPLE_BYTES;
  assertSampleBytes(sampleBytes);
  if (!Number.isFinite(source.size) || source.size < 0) {
    throw new RangeError('文件大小无效。');
  }

  const headEnd = Math.min(source.size, sampleBytes);
  const tailStart = Math.max(headEnd, source.size - sampleBytes);
  const [head, tail] = await Promise.all([
    source.slice(0, headEnd).arrayBuffer(),
    source.slice(tailStart, source.size).arrayBuffer(),
  ]);

  return createBookFingerprintFromParts(
    source.size,
    source.lastModified ?? 0,
    new Uint8Array(head),
    new Uint8Array(tail),
  );
}

export class BookFingerprint {
  static create(
    source: BookFingerprintSource,
    options: BookFingerprintOptions = {},
  ): Promise<string> {
    return createBookFingerprint(source, options);
  }
}
