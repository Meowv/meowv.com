import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE, readImageDimensions } from './dimensions';

function ascii(text: string): number[] {
  return [...text].map((character) => character.charCodeAt(0));
}

function writeUint24LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
}

function pngBytes(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(24);
  const view = new DataView(bytes.buffer);

  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function gifBytes(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(10);
  const view = new DataView(bytes.buffer);

  bytes.set(ascii('GIF89a'), 0);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return bytes;
}

function bmpBytes(width: number, height: number, core = false): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(26);
  const view = new DataView(bytes.buffer);

  bytes[0] = 0x42;
  bytes[1] = 0x4d;

  if (core) {
    view.setUint32(14, 12, true);
    view.setUint16(18, width, true);
    view.setUint16(20, height, true);
  } else {
    view.setUint32(14, 40, true);
    view.setInt32(18, width, true);
    view.setInt32(22, height, true);
  }
  return bytes;
}

function icoBytes(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  bytes[6] = width === 256 ? 0 : width;
  bytes[7] = height === 256 ? 0 : height;
  return bytes;
}

function jpegBytes(width: number, height: number, withApp0 = false): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(withApp0 ? 40 : 20);
  const view = new DataView(bytes.buffer);

  bytes[0] = 0xff;
  bytes[1] = 0xd8;

  let markerIndex = 2;
  if (withApp0) {
    bytes[2] = 0xff;
    bytes[3] = 0xe0;
    view.setUint16(4, 16);
    markerIndex = 20;
  }

  bytes[markerIndex] = 0xff;
  bytes[markerIndex + 1] = 0xc0;
  view.setUint16(markerIndex + 2, 16);
  view.setUint16(markerIndex + 5, height);
  view.setUint16(markerIndex + 7, width);
  return bytes;
}

function webpVp8xBytes(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);

  bytes.set(ascii('RIFF'), 0);
  view.setUint32(4, 24, true);
  bytes.set(ascii('WEBP'), 8);
  bytes.set(ascii('VP8X'), 12);
  view.setUint32(16, 10, true);
  writeUint24LE(bytes, 24, width - 1);
  writeUint24LE(bytes, 27, height - 1);
  return bytes;
}

function webpVp8Bytes(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);

  bytes.set(ascii('RIFF'), 0);
  view.setUint32(4, 24, true);
  bytes.set(ascii('WEBP'), 8);
  bytes.set(ascii('VP8 '), 12);
  view.setUint32(16, 10, true);
  bytes[23] = 0x9d;
  bytes[24] = 0x01;
  bytes[25] = 0x2a;
  view.setUint16(26, width, true);
  view.setUint16(28, height, true);
  return bytes;
}

function webpVp8lBytes(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;

  bytes.set(ascii('RIFF'), 0);
  view.setUint32(4, 24, true);
  bytes.set(ascii('WEBP'), 8);
  bytes.set(ascii('VP8L'), 12);
  view.setUint32(16, 5, true);
  bytes[20] = 0x2f;
  bytes[21] = encodedWidth & 0xff;
  bytes[22] = ((encodedWidth >> 8) & 0x3f) | ((encodedHeight & 0x03) << 6);
  bytes[23] = (encodedHeight >> 2) & 0xff;
  bytes[24] = (encodedHeight >> 10) & 0x0f;
  return bytes;
}

function tiffBytes(
  width: number,
  height: number,
  littleEndian = true,
  shortType = false,
): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(40);
  const view = new DataView(bytes.buffer);
  const ifdOffset = 8;

  if (littleEndian) {
    bytes[0] = 0x49;
    bytes[1] = 0x49;
    view.setUint16(2, 42, true);
  } else {
    bytes[0] = 0x4d;
    bytes[1] = 0x4d;
    view.setUint16(2, 42, false);
  }

  view.setUint32(4, ifdOffset, littleEndian);
  view.setUint16(ifdOffset, 2, littleEndian);

  for (const [index, entry] of [
    { tag: 256, value: width },
    { tag: 257, value: height },
  ].entries()) {
    const entryOffset = ifdOffset + 2 + index * 12;
    view.setUint16(entryOffset, entry.tag, littleEndian);
    view.setUint16(entryOffset + 2, shortType ? 3 : 4, littleEndian);
    view.setUint32(entryOffset + 4, 1, littleEndian);
    if (shortType) {
      view.setUint16(entryOffset + 8, entry.value, littleEndian);
    } else {
      view.setUint32(entryOffset + 8, entry.value, littleEndian);
    }
  }

  return bytes;
}

function psdBytes(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(26);
  const view = new DataView(bytes.buffer);

  bytes.set(ascii('8BPS'), 0);
  view.setUint16(4, 1);
  view.setUint32(14, height);
  view.setUint32(18, width);
  return bytes;
}

function heicBytes(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(36);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 16);
  bytes.set(ascii('ftyp'), 4);
  bytes.set(ascii('heic'), 8);
  view.setUint32(16, 20);
  bytes.set(ascii('ispe'), 20);
  view.setUint32(24, 0);
  view.setUint32(28, width);
  view.setUint32(32, height);
  return bytes;
}

function svgBytes(markup: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(markup);
}

describe('readImageDimensions 各格式头部解析', () => {
  it('读取 PNG 尺寸', async () => {
    expect(await readImageDimensions(new Blob([pngBytes(640, 480)]))).toEqual({
      width: 640,
      height: 480,
    });
  });

  it('读取 GIF 尺寸', async () => {
    expect(await readImageDimensions(new Blob([gifBytes(320, 200)]))).toEqual({
      width: 320,
      height: 200,
    });
  });

  it('读取 BMP 尺寸并取绝对值处理自上而下的位图', async () => {
    expect(await readImageDimensions(new Blob([bmpBytes(128, 64)]))).toEqual({
      width: 128,
      height: 64,
    });
    expect(await readImageDimensions(new Blob([bmpBytes(128, -64)]))).toEqual({
      width: 128,
      height: 64,
    });
  });

  it('读取旧版 BITMAPCOREHEADER 的 BMP 尺寸', async () => {
    expect(await readImageDimensions(new Blob([bmpBytes(16, 16, true)]))).toEqual({
      width: 16,
      height: 16,
    });
  });

  it('读取 ICO 尺寸并把 0 解释为 256', async () => {
    expect(await readImageDimensions(new Blob([icoBytes(32, 32)]))).toEqual({
      width: 32,
      height: 32,
    });
    expect(await readImageDimensions(new Blob([icoBytes(256, 256)]))).toEqual({
      width: 256,
      height: 256,
    });
  });

  it('读取 JPEG 尺寸', async () => {
    expect(await readImageDimensions(new Blob([jpegBytes(640, 480)]))).toEqual({
      width: 640,
      height: 480,
    });
  });

  it('跳过 JPEG 的 APP0 段后定位 SOF', async () => {
    expect(await readImageDimensions(new Blob([jpegBytes(800, 600, true)]))).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('读取 WebP 的 VP8X、VP8 与 VP8L 三种编码尺寸', async () => {
    expect(await readImageDimensions(new Blob([webpVp8xBytes(640, 480)]))).toEqual({
      width: 640,
      height: 480,
    });
    expect(await readImageDimensions(new Blob([webpVp8Bytes(640, 480)]))).toEqual({
      width: 640,
      height: 480,
    });
    expect(await readImageDimensions(new Blob([webpVp8lBytes(256, 128)]))).toEqual({
      width: 256,
      height: 128,
    });
  });

  it('读取 TIFF 尺寸并支持两种字节序', async () => {
    expect(await readImageDimensions(new Blob([tiffBytes(640, 480, true)]))).toEqual({
      width: 640,
      height: 480,
    });
    expect(await readImageDimensions(new Blob([tiffBytes(640, 480, false)]))).toEqual({
      width: 640,
      height: 480,
    });
  });

  it('读取 TIFF 中以 SHORT 类型存储的尺寸', async () => {
    expect(await readImageDimensions(new Blob([tiffBytes(320, 240, true, true)]))).toEqual({
      width: 320,
      height: 240,
    });
  });

  it('读取 PSD 尺寸', async () => {
    expect(await readImageDimensions(new Blob([psdBytes(1024, 768)]))).toEqual({
      width: 1024,
      height: 768,
    });
  });

  it('读取 HEIC 的 ispe 尺寸', async () => {
    expect(await readImageDimensions(new Blob([heicBytes(640, 480)]))).toEqual({
      width: 640,
      height: 480,
    });
  });

  it('读取 SVG 的 width/height 属性', async () => {
    expect(
      await readImageDimensions(new Blob([svgBytes('<svg width="100" height="50"></svg>')])),
    ).toEqual({ width: 100, height: 50 });
  });

  it('SVG 支持带 px 单位与小数', async () => {
    expect(
      await readImageDimensions(new Blob([svgBytes('<svg width="100px" height="50.5px"></svg>')])),
    ).toEqual({ width: 100, height: 50.5 });
  });

  it('SVG 缺少 width/height 时回退到 viewBox', async () => {
    expect(
      await readImageDimensions(new Blob([svgBytes('<svg viewBox="0 0 200 100"></svg>')])),
    ).toEqual({ width: 200, height: 100 });
  });

  it('接受 File 对象', async () => {
    expect(await readImageDimensions(new File([pngBytes(64, 32)], 'a.png'))).toEqual({
      width: 64,
      height: 32,
    });
  });
});

describe('readImageDimensions 异常路径', () => {
  it('无法识别格式时抛出可读错误', async () => {
    await expect(readImageDimensions(new Blob(['not an image']))).rejects.toThrow(
      '无法识别图片格式，文件可能已损坏',
    );
  });

  it('空内容抛出可读错误', async () => {
    await expect(readImageDimensions(new Blob([]))).rejects.toThrow(
      '无法识别图片格式，文件可能已损坏',
    );
  });

  it('识别出格式但读不到尺寸时抛出对应提示', async () => {
    await expect(readImageDimensions(new Blob([svgBytes('<svg></svg>')]))).rejects.toThrow(
      '无法读取 image/svg+xml 图片尺寸',
    );
  });

  it('单边超过上限时抛出 IMAGE_TOO_LARGE', async () => {
    await expect(
      readImageDimensions(new Blob([pngBytes(MAX_IMAGE_SIDE + 1, 100)])),
    ).rejects.toThrow('IMAGE_TOO_LARGE');
  });

  it('总像素数超过上限时抛出 IMAGE_TOO_LARGE', async () => {
    const side = Math.floor(Math.sqrt(MAX_IMAGE_PIXELS)) + 1;

    await expect(readImageDimensions(new Blob([pngBytes(side, side)]))).rejects.toThrow(
      'IMAGE_TOO_LARGE',
    );
  });

  it('刚好等于上限时正常返回', async () => {
    expect(await readImageDimensions(new Blob([pngBytes(MAX_IMAGE_SIDE, 1000)]))).toEqual({
      width: MAX_IMAGE_SIDE,
      height: 1000,
    });
  });
});
