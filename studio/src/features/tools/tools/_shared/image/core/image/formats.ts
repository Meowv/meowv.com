const MIME_ALIASES: Readonly<Record<string, string>> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'image/x-icon': 'image/vnd.microsoft.icon',
  'image/ico': 'image/vnd.microsoft.icon',
  'image/tif': 'image/tiff',
  'image/x-tiff': 'image/tiff',
  'image/x-photoshop': 'image/vnd.adobe.photoshop',
};

export const INPUT_IMAGE_EXTENSIONS = [
  '.avif',
  '.bmp',
  '.gif',
  '.heic',
  '.heif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.psd',
  '.svg',
  '.tif',
  '.tiff',
  '.webp',
] as const;

export const INPUT_IMAGE_ACCEPT = [
  ...INPUT_IMAGE_EXTENSIONS,
  'image/avif',
  'image/bmp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/tiff',
  'image/vnd.adobe.photoshop',
  'image/vnd.microsoft.icon',
  'image/webp',
].join(',');

const INPUT_IMAGE_EXTENSION_SET = new Set<string>(INPUT_IMAGE_EXTENSIONS);

export function isSupportedImageFilename(name: string): boolean {
  const dot = name.lastIndexOf('.');
  return dot >= 0 && INPUT_IMAGE_EXTENSION_SET.has(name.slice(dot).toLowerCase());
}

export const OUTPUT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/vnd.microsoft.icon',
  'image/svg+xml',
] as const;

export type OutputMime = (typeof OUTPUT_MIME_TYPES)[number];

const OUTPUT_MIME_SET = new Set<string>(OUTPUT_MIME_TYPES);

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function hasBytes(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  if (bytes.length < offset + expected.length) {
    return false;
  }

  return expected.every((value, index) => bytes[offset + index] === value);
}

function detectIsoBmffMime(bytes: Uint8Array): string | null {
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== 'ftyp') {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declaredSize = view.getUint32(0);
  const boxEnd = declaredSize >= 16 && declaredSize <= bytes.length ? declaredSize : bytes.length;
  const brands: string[] = [];

  for (let offset = 8; offset + 4 <= boxEnd; offset += 4) {
    if (offset === 12) {
      continue;
    }
    brands.push(ascii(bytes, offset, 4));
  }

  if (brands.some((brand) => ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'].includes(brand))) {
    return 'image/heic';
  }

  if (brands.some((brand) => brand === 'avif' || brand === 'avis')) {
    return 'image/avif';
  }

  return null;
}

function detectSvg(bytes: Uint8Array): boolean {
  if (bytes.length === 0) {
    return false;
  }

  const text = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes)
    .replace(/^\uFEFF/, '')
    .trimStart();

  return /^(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i.test(text);
}

/**
 * 仅依据文件内容识别图片格式，避免扩展名或 Blob.type 伪装。
 */
export function detectImageMimeFromBytes(bytes: Uint8Array): string | null {
  if (hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }

  if (hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }

  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')) {
    return 'image/gif';
  }

  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return 'image/webp';
  }

  if (hasBytes(bytes, 0, [0x42, 0x4d])) {
    return 'image/bmp';
  }

  if (
    hasBytes(bytes, 0, [0x49, 0x49, 0x2a, 0x00]) ||
    hasBytes(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a])
  ) {
    return 'image/tiff';
  }

  if (hasBytes(bytes, 0, [0x38, 0x42, 0x50, 0x53])) {
    return 'image/vnd.adobe.photoshop';
  }

  if (hasBytes(bytes, 0, [0x00, 0x00, 0x01, 0x00])) {
    return 'image/vnd.microsoft.icon';
  }

  const isoBmffMime = detectIsoBmffMime(bytes);
  if (isoBmffMime) {
    return isoBmffMime;
  }

  if (detectSvg(bytes)) {
    return 'image/svg+xml';
  }

  return null;
}

export async function detectImageMime(blob: Blob): Promise<string | null> {
  const bytes = new Uint8Array(await blob.slice(0, Math.min(blob.size, 64 * 1024)).arrayBuffer());
  return detectImageMimeFromBytes(bytes);
}

export function normalizeMime(mime: string): string {
  const normalized = mime.trim().toLowerCase().split(';')[0] ?? '';
  return MIME_ALIASES[normalized] ?? normalized;
}

export function normalizeOutputMime(mime: string): OutputMime {
  const normalized = normalizeMime(mime);
  if (!OUTPUT_MIME_SET.has(normalized)) {
    throw new TypeError(`不支持的输出格式：${mime || '空格式'}`);
  }

  return normalized as OutputMime;
}

export function isMatchingMime(actual: string, expected: string): boolean {
  return normalizeMime(actual) === normalizeMime(expected);
}
