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

  const metadataBytes = 16;
  const input = new Uint8Array(metadataBytes + head.byteLength + tail.byteLength);
  appendUint64(input, 0, source.size);
  appendUint64(input, 8, source.lastModified ?? 0);
  input.set(new Uint8Array(head), metadataBytes);
  input.set(new Uint8Array(tail), metadataBytes + head.byteLength);

  return toHex(await getSubtleCrypto().digest('SHA-256', input));
}

export class BookFingerprint {
  static create(
    source: BookFingerprintSource,
    options: BookFingerprintOptions = {},
  ): Promise<string> {
    return createBookFingerprint(source, options);
  }
}
