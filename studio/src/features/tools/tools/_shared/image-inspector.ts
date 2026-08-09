const EXIF_TAGS: Record<number, string> = {
  0x010f: '相机制造商',
  0x0110: '相机型号',
  0x0112: '方向',
  0x0131: '软件',
  0x0132: '修改时间',
  0x829a: '曝光时间',
  0x829d: '光圈值',
  0x8827: 'ISO',
  0x9003: '拍摄时间',
  0x9004: '数字化时间',
  0x9209: '闪光灯',
  0x920a: '焦距',
  0xa002: '原始宽度',
  0xa003: '原始高度',
  0xa405: '等效焦距',
};

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return new TextDecoder('ascii').decode(bytes.subarray(start, start + length));
}

function readExifValue(
  view: DataView,
  tiffStart: number,
  littleEndian: boolean,
  type: number,
  count: number,
  valueOffset: number,
): string | number | undefined {
  const sizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const size = sizes[type];
  if (!size || count < 1) return undefined;
  const byteLength = size * count;
  const offset =
    byteLength <= 4 ? valueOffset : tiffStart + view.getUint32(valueOffset, littleEndian);
  if (offset < 0 || offset + byteLength > view.byteLength) return undefined;

  if (type === 2) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, Math.max(0, count - 1));
    return new TextDecoder().decode(bytes).replace(/\0+$/g, '').trim();
  }
  if (type === 3) return view.getUint16(offset, littleEndian);
  if (type === 4) return view.getUint32(offset, littleEndian);
  if (type === 9) return view.getInt32(offset, littleEndian);
  if (type === 5 || type === 10) {
    const numerator =
      type === 5 ? view.getUint32(offset, littleEndian) : view.getInt32(offset, littleEndian);
    const denominator =
      type === 5
        ? view.getUint32(offset + 4, littleEndian)
        : view.getInt32(offset + 4, littleEndian);
    return denominator ? Number((numerator / denominator).toFixed(4)) : undefined;
  }
  if (type === 1 || type === 7) return view.getUint8(offset);
  return undefined;
}

function readIfd(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  littleEndian: boolean,
  result: Record<string, string | number>,
): number | undefined {
  const start = tiffStart + ifdOffset;
  if (start < 0 || start + 2 > view.byteLength) return undefined;
  const count = view.getUint16(start, littleEndian);
  let exifIfd: number | undefined;
  for (let index = 0; index < count; index += 1) {
    const entry = start + 2 + index * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = view.getUint16(entry, littleEndian);
    const type = view.getUint16(entry + 2, littleEndian);
    const valueCount = view.getUint32(entry + 4, littleEndian);
    if (tag === 0x8769) {
      exifIfd = view.getUint32(entry + 8, littleEndian);
      continue;
    }
    const label = EXIF_TAGS[tag];
    if (!label) continue;
    const value = readExifValue(view, tiffStart, littleEndian, type, valueCount, entry + 8);
    if (value !== undefined && value !== '') result[label] = value;
  }
  return exifIfd;
}

export async function readExif(file: Blob): Promise<Record<string, string | number>> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return {};

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (marker === 0xe1 && ascii(bytes, offset + 4, 6) === 'Exif\0\0') {
      const tiffStart = offset + 10;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const byteOrder = ascii(bytes, tiffStart, 2);
      const littleEndian = byteOrder === 'II';
      if (!littleEndian && byteOrder !== 'MM') return {};
      if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return {};
      const result: Record<string, string | number> = {};
      const firstIfd = view.getUint32(tiffStart + 4, littleEndian);
      const exifIfd = readIfd(view, tiffStart, firstIfd, littleEndian, result);
      if (exifIfd !== undefined) readIfd(view, tiffStart, exifIfd, littleEndian, result);
      return result;
    }
    offset += 2 + length;
  }
  return {};
}
