import type { ImageDimensions } from "@/types/image";

import { detectImageMimeFromBytes } from "./formats";

const HEADER_READ_LIMIT = 1024 * 1024;
export const MAX_IMAGE_SIDE = 32_768;
export const MAX_IMAGE_PIXELS = 50_000_000;

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16)
  );
}

function readPngDimensions(
  bytes: Uint8Array,
  view: DataView,
): ImageDimensions | null {
  if (bytes.length < 24) {
    return null;
  }

  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

function readGifDimensions(
  bytes: Uint8Array,
  view: DataView,
): ImageDimensions | null {
  if (bytes.length < 10) {
    return null;
  }

  return {
    width: view.getUint16(6, true),
    height: view.getUint16(8, true),
  };
}

function readBmpDimensions(
  bytes: Uint8Array,
  view: DataView,
): ImageDimensions | null {
  if (bytes.length < 26) {
    return null;
  }

  const dibHeaderSize = view.getUint32(14, true);
  if (dibHeaderSize === 12) {
    return {
      width: view.getUint16(18, true),
      height: view.getUint16(20, true),
    };
  }

  return {
    width: Math.abs(view.getInt32(18, true)),
    height: Math.abs(view.getInt32(22, true)),
  };
}

function readIcoDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 8) {
    return null;
  }

  return {
    width: bytes[6] === 0 ? 256 : bytes[6]!,
    height: bytes[7] === 0 ? 256 : bytes[7]!,
  };
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
  0xcf,
]);

function readJpegDimensions(
  bytes: Uint8Array,
  view: DataView,
): ImageDimensions | null {
  let offset = 2;

  while (offset + 8 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) {
      offset += 1;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.length) {
      break;
    }

    const marker = bytes[offset]!;
    offset += 1;

    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
      continue;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      continue;
    }
    if (offset + 2 > bytes.length) {
      break;
    }

    const segmentLength = view.getUint16(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      break;
    }

    if (JPEG_SOF_MARKERS.has(marker) && segmentLength >= 7) {
      return {
        width: view.getUint16(offset + 5),
        height: view.getUint16(offset + 3),
      };
    }

    offset += segmentLength;
  }

  return null;
}

function readWebpDimensions(
  bytes: Uint8Array,
  view: DataView,
): ImageDimensions | null {
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const chunkType = String.fromCharCode(
      bytes[offset]!,
      bytes[offset + 1]!,
      bytes[offset + 2]!,
      bytes[offset + 3]!,
    );
    const chunkSize = view.getUint32(offset + 4, true);
    const payload = offset + 8;

    if (chunkType === "VP8X" && payload + 10 <= bytes.length) {
      return {
        width: readUint24LE(bytes, payload + 4) + 1,
        height: readUint24LE(bytes, payload + 7) + 1,
      };
    }

    if (
      chunkType === "VP8 " &&
      payload + 10 <= bytes.length &&
      bytes[payload + 3] === 0x9d &&
      bytes[payload + 4] === 0x01 &&
      bytes[payload + 5] === 0x2a
    ) {
      return {
        width: view.getUint16(payload + 6, true) & 0x3fff,
        height: view.getUint16(payload + 8, true) & 0x3fff,
      };
    }

    if (
      chunkType === "VP8L" &&
      payload + 5 <= bytes.length &&
      bytes[payload] === 0x2f
    ) {
      const b1 = bytes[payload + 1]!;
      const b2 = bytes[payload + 2]!;
      const b3 = bytes[payload + 3]!;
      const b4 = bytes[payload + 4]!;

      return {
        width: 1 + (((b2 & 0x3f) << 8) | b1),
        height:
          1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
      };
    }

    const paddedSize = chunkSize + (chunkSize % 2);
    if (paddedSize > bytes.length - payload) {
      break;
    }
    offset = payload + paddedSize;
  }

  return null;
}

function readTiffValue(
  view: DataView,
  littleEndian: boolean,
  type: number,
  count: number,
  valueOffset: number,
): number | null {
  if (count < 1) {
    return null;
  }

  if (type === 3) {
    return view.getUint16(valueOffset, littleEndian);
  }
  if (type === 4) {
    return view.getUint32(valueOffset, littleEndian);
  }

  return null;
}

function readTiffDimensions(
  bytes: Uint8Array,
  view: DataView,
): ImageDimensions | null {
  if (bytes.length < 8) {
    return null;
  }

  const littleEndian = bytes[0] === 0x49;
  const ifdOffset = view.getUint32(4, littleEndian);
  if (ifdOffset + 2 > bytes.length) {
    return null;
  }

  const count = view.getUint16(ifdOffset, littleEndian);
  let width: number | null = null;
  let height: number | null = null;

  for (let index = 0; index < count; index += 1) {
    const entryOffset = ifdOffset + 2 + index * 12;
    if (entryOffset + 12 > bytes.length) {
      break;
    }

    const tag = view.getUint16(entryOffset, littleEndian);
    if (tag !== 256 && tag !== 257) {
      continue;
    }

    const type = view.getUint16(entryOffset + 2, littleEndian);
    const valueCount = view.getUint32(entryOffset + 4, littleEndian);
    const typeSize = type === 3 ? 2 : type === 4 ? 4 : 0;
    const storedSize = typeSize * valueCount;
    const valueOffset =
      storedSize > 4
        ? view.getUint32(entryOffset + 8, littleEndian)
        : entryOffset + 8;

    if (!typeSize || valueOffset + typeSize > bytes.length) {
      continue;
    }

    const value = readTiffValue(
      view,
      littleEndian,
      type,
      valueCount,
      valueOffset,
    );
    if (tag === 256) {
      width = value;
    } else {
      height = value;
    }
  }

  return width && height ? { width, height } : null;
}

function readHeifDimensions(bytes: Uint8Array, view: DataView) {
  for (let offset = 4; offset + 16 <= bytes.length; offset += 1) {
    if (
      bytes[offset] === 0x69 &&
      bytes[offset + 1] === 0x73 &&
      bytes[offset + 2] === 0x70 &&
      bytes[offset + 3] === 0x65
    ) {
      const boxStart = offset - 4;
      const boxSize = view.getUint32(boxStart);
      if (boxSize >= 20 && boxStart + boxSize <= bytes.length) {
        return {
          width: view.getUint32(offset + 8),
          height: view.getUint32(offset + 12),
        };
      }
    }
  }

  return null;
}

function readSvgDimensions(text: string): ImageDimensions | null {
  const match = text.match(/<svg\b([^>]*)>/i);
  if (!match) {
    return null;
  }

  const attributes = match[1] ?? "";
  const widthMatch = attributes.match(
    /\bwidth\s*=\s*["']\s*([0-9]+(?:\.[0-9]+)?)(?:px)?\s*["']/i,
  );
  const heightMatch = attributes.match(
    /\bheight\s*=\s*["']\s*([0-9]+(?:\.[0-9]+)?)(?:px)?\s*["']/i,
  );
  if (widthMatch && heightMatch) {
    return {
      width: Number.parseFloat(widthMatch[1]!),
      height: Number.parseFloat(heightMatch[1]!),
    };
  }

  const viewBoxMatch = attributes.match(
    /\bviewBox\s*=\s*["']\s*[-+0-9.eE]+\s+[-+0-9.eE]+\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s*["']/i,
  );
  if (!viewBoxMatch) {
    return null;
  }

  return {
    width: Number.parseFloat(viewBoxMatch[1]!),
    height: Number.parseFloat(viewBoxMatch[2]!),
  };
}

function readDimensionsFromHeader(
  bytes: Uint8Array,
  mime: string,
): ImageDimensions | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  switch (mime) {
    case "image/png":
      return readPngDimensions(bytes, view);
    case "image/jpeg":
      return readJpegDimensions(bytes, view);
    case "image/gif":
      return readGifDimensions(bytes, view);
    case "image/webp":
      return readWebpDimensions(bytes, view);
    case "image/bmp":
      return readBmpDimensions(bytes, view);
    case "image/tiff":
      return readTiffDimensions(bytes, view);
    case "image/vnd.microsoft.icon":
      return readIcoDimensions(bytes);
    case "image/heic":
      return readHeifDimensions(bytes, view);
    case "image/svg+xml":
      return readSvgDimensions(
        new TextDecoder("utf-8", { fatal: false }).decode(bytes),
      );
    default:
      return null;
  }
}

function isValidDimensions(
  dimensions: ImageDimensions | null,
): dimensions is ImageDimensions {
  return Boolean(
    dimensions &&
      Number.isFinite(dimensions.width) &&
      dimensions.width > 0 &&
      Number.isFinite(dimensions.height) &&
      dimensions.height > 0,
  );
}

function assertSafeDimensions(dimensions: ImageDimensions): void {
  if (
    dimensions.width > MAX_IMAGE_SIDE ||
    dimensions.height > MAX_IMAGE_SIDE ||
    dimensions.width * dimensions.height > MAX_IMAGE_PIXELS
  ) {
    throw new RangeError("IMAGE_TOO_LARGE");
  }
}

async function readWithImageBitmap(
  blob: Blob,
): Promise<ImageDimensions | null> {
  if (typeof createImageBitmap !== "function") {
    return null;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    try {
      bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      });
    } catch {
      bitmap = await createImageBitmap(blob);
    }

    const dimensions = { width: bitmap.width, height: bitmap.height };
    return isValidDimensions(dimensions) ? dimensions : null;
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

/**
 * 读取图片尺寸。先校验文件魔数，再优先使用浏览器解码结果处理 EXIF 方向。
 */
export async function readImageDimensions(
  file: Blob,
): Promise<ImageDimensions> {
  const bytes = new Uint8Array(
    await file.slice(0, Math.min(file.size, HEADER_READ_LIMIT)).arrayBuffer(),
  );
  const mime = detectImageMimeFromBytes(bytes);
  if (!mime) {
    throw new TypeError("无法识别图片格式，文件可能已损坏");
  }

  const headerDimensions = readDimensionsFromHeader(bytes, mime);
  if (isValidDimensions(headerDimensions)) {
    assertSafeDimensions(headerDimensions);
  }

  const decodedDimensions = await readWithImageBitmap(file);
  if (decodedDimensions) {
    assertSafeDimensions(decodedDimensions);
    return decodedDimensions;
  }

  if (!isValidDimensions(headerDimensions)) {
    throw new TypeError(`无法读取 ${mime} 图片尺寸`);
  }

  return headerDimensions;
}
