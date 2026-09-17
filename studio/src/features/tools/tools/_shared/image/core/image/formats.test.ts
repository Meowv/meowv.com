import { describe, expect, it } from 'vitest';
import {
  detectImageMime,
  detectImageMimeFromBytes,
  isMatchingMime,
  isSupportedImageFilename,
  normalizeMime,
  normalizeOutputMime,
} from './formats';

function ascii(text: string): number[] {
  return [...text].map((character) => character.charCodeAt(0));
}

function bytesOf(...parts: Array<number[] | string>): Uint8Array<ArrayBuffer> {
  const values = parts.flatMap((part) => (typeof part === 'string' ? ascii(part) : part));
  return Uint8Array.from(values);
}

/** 构造带 ftyp 头的 ISO BMFF 容器，用于 HEIC / AVIF 识别。 */
function isoBmff(brand: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 16);
  bytes.set(ascii('ftyp'), 4);
  bytes.set(ascii(brand), 8);
  return bytes;
}

describe('isSupportedImageFilename', () => {
  it('识别支持的扩展名', () => {
    expect(isSupportedImageFilename('photo.png')).toBe(true);
    expect(isSupportedImageFilename('photo.jpg')).toBe(true);
    expect(isSupportedImageFilename('photo.webp')).toBe(true);
    expect(isSupportedImageFilename('photo.psd')).toBe(true);
    expect(isSupportedImageFilename('photo.avif')).toBe(true);
  });

  it('扩展名大小写不敏感', () => {
    expect(isSupportedImageFilename('PHOTO.PNG')).toBe(true);
    expect(isSupportedImageFilename('photo.JpEg')).toBe(true);
  });

  it('只取最后一个扩展名', () => {
    expect(isSupportedImageFilename('archive.tar.png')).toBe(true);
    expect(isSupportedImageFilename('photo.png.bak')).toBe(false);
  });

  it('拒绝不支持的扩展名与无扩展名文件', () => {
    expect(isSupportedImageFilename('photo.xyz')).toBe(false);
    expect(isSupportedImageFilename('photo')).toBe(false);
  });
});

describe('detectImageMimeFromBytes', () => {
  it('识别 PNG', () => {
    expect(
      detectImageMimeFromBytes(bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe('image/png');
  });

  it('识别 JPEG', () => {
    expect(detectImageMimeFromBytes(bytesOf([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
  });

  it('识别 GIF87a 与 GIF89a', () => {
    expect(detectImageMimeFromBytes(bytesOf('GIF87a'))).toBe('image/gif');
    expect(detectImageMimeFromBytes(bytesOf('GIF89a'))).toBe('image/gif');
  });

  it('识别 WebP', () => {
    expect(detectImageMimeFromBytes(bytesOf('RIFF', [0, 0, 0, 0], 'WEBP'))).toBe('image/webp');
  });

  it('识别 BMP', () => {
    expect(detectImageMimeFromBytes(bytesOf([0x42, 0x4d]))).toBe('image/bmp');
  });

  it('识别两种字节序的 TIFF', () => {
    expect(detectImageMimeFromBytes(bytesOf([0x49, 0x49, 0x2a, 0x00]))).toBe('image/tiff');
    expect(detectImageMimeFromBytes(bytesOf([0x4d, 0x4d, 0x00, 0x2a]))).toBe('image/tiff');
  });

  it('识别 PSD', () => {
    expect(detectImageMimeFromBytes(bytesOf('8BPS'))).toBe('image/vnd.adobe.photoshop');
  });

  it('识别 ICO', () => {
    expect(detectImageMimeFromBytes(bytesOf([0x00, 0x00, 0x01, 0x00]))).toBe(
      'image/vnd.microsoft.icon',
    );
  });

  it('识别 HEIC 与 AVIF 的 ftyp 品牌', () => {
    expect(detectImageMimeFromBytes(isoBmff('heic'))).toBe('image/heic');
    expect(detectImageMimeFromBytes(isoBmff('heix'))).toBe('image/heic');
    expect(detectImageMimeFromBytes(isoBmff('avif'))).toBe('image/avif');
    expect(detectImageMimeFromBytes(isoBmff('avis'))).toBe('image/avif');
  });

  it('识别 SVG 文本', () => {
    expect(detectImageMimeFromBytes(bytesOf('<svg xmlns="http://www.w3.org/2000/svg">'))).toBe(
      'image/svg+xml',
    );
    expect(detectImageMimeFromBytes(bytesOf('<?xml version="1.0"?>\n<svg>'))).toBe('image/svg+xml');
    expect(detectImageMimeFromBytes(bytesOf('<!-- 注释 --><svg>'))).toBe('image/svg+xml');
  });

  it('无法识别时返回 null', () => {
    expect(detectImageMimeFromBytes(bytesOf('not an image'))).toBeNull();
    expect(detectImageMimeFromBytes(new Uint8Array(0))).toBeNull();
  });

  it('只依据内容判断，不受扩展名影响', () => {
    const pngHeader = bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    expect(detectImageMimeFromBytes(pngHeader)).toBe('image/png');
  });
});

describe('detectImageMime', () => {
  it('读取 Blob 头部并识别格式', async () => {
    const png = bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    expect(await detectImageMime(new Blob([png]))).toBe('image/png');
  });

  it('无法识别时返回 null', async () => {
    expect(await detectImageMime(new Blob(['text']))).toBeNull();
  });
});

describe('normalizeMime', () => {
  it('统一小写并去掉空白', () => {
    expect(normalizeMime('  IMAGE/PNG  ')).toBe('image/png');
  });

  it('去掉参数部分', () => {
    expect(normalizeMime('image/png; charset=utf-8')).toBe('image/png');
  });

  it('把别名归一为规范 MIME', () => {
    expect(normalizeMime('image/jpg')).toBe('image/jpeg');
    expect(normalizeMime('image/pjpeg')).toBe('image/jpeg');
    expect(normalizeMime('image/x-png')).toBe('image/png');
    expect(normalizeMime('image/x-icon')).toBe('image/vnd.microsoft.icon');
    expect(normalizeMime('image/ico')).toBe('image/vnd.microsoft.icon');
    expect(normalizeMime('image/tif')).toBe('image/tiff');
    expect(normalizeMime('image/x-tiff')).toBe('image/tiff');
    expect(normalizeMime('image/x-photoshop')).toBe('image/vnd.adobe.photoshop');
  });

  it('没有别名时原样返回', () => {
    expect(normalizeMime('image/webp')).toBe('image/webp');
    expect(normalizeMime('')).toBe('');
  });
});

describe('normalizeOutputMime', () => {
  it('接受支持的输出格式', () => {
    expect(normalizeOutputMime('image/jpeg')).toBe('image/jpeg');
    expect(normalizeOutputMime('image/png')).toBe('image/png');
    expect(normalizeOutputMime('image/webp')).toBe('image/webp');
    expect(normalizeOutputMime('image/vnd.microsoft.icon')).toBe('image/vnd.microsoft.icon');
    expect(normalizeOutputMime('image/svg+xml')).toBe('image/svg+xml');
  });

  it('接受别名写法', () => {
    expect(normalizeOutputMime('image/jpg')).toBe('image/jpeg');
    expect(normalizeOutputMime('IMAGE/PNG')).toBe('image/png');
  });

  it('拒绝不支持的输出格式', () => {
    expect(() => normalizeOutputMime('image/gif')).toThrow('不支持的输出格式：image/gif');
    expect(() => normalizeOutputMime('image/tiff')).toThrow('不支持的输出格式：image/tiff');
  });

  it('空格式给出明确提示', () => {
    expect(() => normalizeOutputMime('')).toThrow('不支持的输出格式：空格式');
  });
});

describe('isMatchingMime', () => {
  it('别名与大小写不影响比较', () => {
    expect(isMatchingMime('image/jpg', 'image/jpeg')).toBe(true);
    expect(isMatchingMime('IMAGE/PNG', 'image/png')).toBe(true);
    expect(isMatchingMime('image/png; charset=utf-8', 'image/png')).toBe(true);
  });

  it('不同格式返回 false', () => {
    expect(isMatchingMime('image/gif', 'image/png')).toBe(false);
  });
});
