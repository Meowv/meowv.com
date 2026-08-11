import { readImageDimensions } from './dimensions';
import { processImage } from './process';

export const MAX_PDF_IMAGE_COUNT = 40;
export const MAX_PDF_IMAGE_BYTES = 50 * 1024 * 1024;
export const MAX_PDF_TOTAL_BYTES = 300 * 1024 * 1024;

const MAX_PDF_OUTPUT_BYTES = 256 * 1024 * 1024;
const MAX_EMBEDDED_IMAGE_SIDE = 4096;
const POINTS_PER_MILLIMETRE = 72 / 25.4;
const POINTS_PER_CSS_PIXEL = 72 / 96;
const A3_PORTRAIT = { width: 841.89, height: 1190.551 };
const A4_PORTRAIT = { width: 595.276, height: 841.89 };
const A5_PORTRAIT = { width: 419.528, height: 595.276 };
const LETTER_PORTRAIT = { width: 612, height: 792 };
const PDF_HEADER = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a,
]);

export type PdfPageSize = 'a3' | 'a4' | 'a5' | 'letter' | 'adaptive';
export type PdfOrientation = 'portrait' | 'landscape';
export type PdfImageFit = 'fit' | 'fill' | 'original';

export interface ImagesToPdfOptions {
  pageSize: PdfPageSize;
  orientation: PdfOrientation;
  marginMm: number;
  imageFit?: PdfImageFit;
  jpegQuality?: number;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}

export interface PdfJpegPage {
  jpeg: Blob;
  width: number;
  height: number;
}

interface PageLayout {
  pageWidth: number;
  pageHeight: number;
  imageWidth: number;
  imageHeight: number;
  imageX: number;
  imageY: number;
  clipX: number;
  clipY: number;
  clipWidth: number;
  clipHeight: number;
  clipToContent: boolean;
}

const textEncoder = new TextEncoder();

function abortError(): DOMException {
  return new DOMException('PDF 生成已取消', 'AbortError');
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

function assertFiniteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label}无效`);
  }
  return value;
}

function normalizeOptions(
  options: ImagesToPdfOptions,
): Required<
  Pick<ImagesToPdfOptions, 'pageSize' | 'orientation' | 'marginMm' | 'imageFit' | 'jpegQuality'>
> {
  if (
    options.pageSize !== 'a3' &&
    options.pageSize !== 'a4' &&
    options.pageSize !== 'a5' &&
    options.pageSize !== 'letter' &&
    options.pageSize !== 'adaptive'
  ) {
    throw new TypeError('不支持的 PDF 页面尺寸');
  }
  if (options.orientation !== 'portrait' && options.orientation !== 'landscape') {
    throw new TypeError('不支持的 PDF 页面方向');
  }

  const marginMm = assertFiniteNumber(options.marginMm, '页边距');
  if (marginMm < 0 || marginMm > 50) {
    throw new RangeError('页边距必须在 0 到 50 mm 之间');
  }

  const imageFit = options.imageFit ?? 'fit';
  if (imageFit !== 'fit' && imageFit !== 'fill' && imageFit !== 'original') {
    throw new TypeError('不支持的图片适配方式');
  }

  const jpegQuality = assertFiniteNumber(options.jpegQuality ?? 0.9, '图片质量');
  if (jpegQuality < 0.1 || jpegQuality > 1) {
    throw new RangeError('图片质量必须在 0.1 到 1 之间');
  }

  return {
    pageSize: options.pageSize,
    orientation: options.orientation,
    marginMm,
    imageFit,
    jpegQuality,
  };
}

function orientPage(
  width: number,
  height: number,
  orientation: PdfOrientation,
): { width: number; height: number } {
  const currentlyPortrait = height >= width;
  const wantsPortrait = orientation === 'portrait';
  return currentlyPortrait === wantsPortrait ? { width, height } : { width: height, height: width };
}

function pageLayout(
  imageWidth: number,
  imageHeight: number,
  options: ReturnType<typeof normalizeOptions>,
): PageLayout {
  if (
    !Number.isInteger(imageWidth) ||
    !Number.isInteger(imageHeight) ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    throw new RangeError('PDF 图片尺寸必须是正整数');
  }

  const margin = options.marginMm * POINTS_PER_MILLIMETRE;
  const naturalWidth = imageWidth * POINTS_PER_CSS_PIXEL + margin * 2;
  const naturalHeight = imageHeight * POINTS_PER_CSS_PIXEL + margin * 2;
  const basePage = {
    a3: A3_PORTRAIT,
    a4: A4_PORTRAIT,
    a5: A5_PORTRAIT,
    letter: LETTER_PORTRAIT,
    adaptive: { width: naturalWidth, height: naturalHeight },
  }[options.pageSize];
  const page = orientPage(basePage.width, basePage.height, options.orientation);
  const availableWidth = page.width - margin * 2;
  const availableHeight = page.height - margin * 2;

  if (availableWidth <= 0 || availableHeight <= 0) {
    throw new RangeError('页边距过大，页面中没有可用的图片区域');
  }

  const scale =
    options.imageFit === 'original'
      ? POINTS_PER_CSS_PIXEL
      : options.imageFit === 'fill'
        ? Math.max(availableWidth / imageWidth, availableHeight / imageHeight)
        : Math.min(availableWidth / imageWidth, availableHeight / imageHeight);
  const renderedWidth = imageWidth * scale;
  const renderedHeight = imageHeight * scale;

  return {
    pageWidth: page.width,
    pageHeight: page.height,
    imageWidth: renderedWidth,
    imageHeight: renderedHeight,
    imageX: (page.width - renderedWidth) / 2,
    imageY: (page.height - renderedHeight) / 2,
    clipX: margin,
    clipY: margin,
    clipWidth: availableWidth,
    clipHeight: availableHeight,
    clipToContent: options.imageFit !== 'fit',
  };
}

function number(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function text(value: string): Uint8Array {
  return textEncoder.encode(value);
}

function partsSize(parts: readonly BlobPart[]): number {
  return parts.reduce((total, part) => {
    if (typeof part === 'string') {
      return total + textEncoder.encode(part).byteLength;
    }
    if (part instanceof Blob) {
      return total + part.size;
    }
    if (part instanceof ArrayBuffer) {
      return total + part.byteLength;
    }
    return total + part.byteLength;
  }, 0);
}

function assertJpeg(page: PdfJpegPage): void {
  if (
    !Number.isInteger(page.width) ||
    !Number.isInteger(page.height) ||
    page.width <= 0 ||
    page.height <= 0
  ) {
    throw new RangeError('PDF 图片尺寸必须是正整数');
  }
  if (page.jpeg.size === 0) {
    throw new TypeError('无法把空图片写入 PDF');
  }
}

/**
 * 将已编码的 JPEG 页面写入最小合法 PDF。
 *
 * xref 偏移按最终二进制字节数累计，JPEG 数据保持原始二进制写入。
 */
export function buildPdfDocument(pages: readonly PdfJpegPage[], options: ImagesToPdfOptions): Blob {
  if (pages.length === 0) {
    throw new RangeError('至少需要一张图片才能生成 PDF');
  }
  if (pages.length > MAX_PDF_IMAGE_COUNT) {
    throw new RangeError(`一次最多生成 ${MAX_PDF_IMAGE_COUNT} 页 PDF`);
  }

  const normalized = normalizeOptions(options);
  pages.forEach(assertJpeg);

  const objectCount = 2 + pages.length * 3;
  const pageObjectIds = pages.map((_, index) => 3 + index * 3);
  const objectParts = new Map<number, BlobPart[]>();

  objectParts.set(1, ['1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n']);
  objectParts.set(2, [
    `2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds
      .map((id) => `${id} 0 R`)
      .join(' ')}] >>\nendobj\n`,
  ]);

  pages.forEach((page, index) => {
    const pageId = pageObjectIds[index]!;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const imageName = `Im${index + 1}`;
    const layout = pageLayout(page.width, page.height, normalized);
    const command = [
      'q',
      ...(layout.clipToContent
        ? [
            `${number(layout.clipX)} ${number(layout.clipY)} ${number(layout.clipWidth)} ${number(layout.clipHeight)} re W n`,
          ]
        : []),
      `${number(layout.imageWidth)} 0 0 ${number(layout.imageHeight)} ${number(layout.imageX)} ${number(layout.imageY)} cm`,
      `/${imageName} Do`,
      'Q',
      '',
    ].join('\n');
    const commandBytes = text(command);

    objectParts.set(pageId, [
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${number(layout.pageWidth)} ${number(layout.pageHeight)}] /Resources << /XObject << /${imageName} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    ]);
    objectParts.set(imageId, [
      `${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.size} >>\nstream\n`,
      page.jpeg,
      '\nendstream\nendobj\n',
    ]);
    objectParts.set(contentId, [
      `${contentId} 0 obj\n<< /Length ${commandBytes.byteLength} >>\nstream\n`,
      commandBytes.buffer as ArrayBuffer,
      'endstream\nendobj\n',
    ]);
  });

  const parts: BlobPart[] = [PDF_HEADER];
  const offsets = new Array<number>(objectCount + 1).fill(0);
  let offset = PDF_HEADER.byteLength;

  for (let objectId = 1; objectId <= objectCount; objectId += 1) {
    const currentParts = objectParts.get(objectId);
    if (!currentParts) {
      throw new Error(`PDF 对象 ${objectId} 缺失`);
    }
    offsets[objectId] = offset;
    parts.push(...currentParts);
    offset += partsSize(currentParts);
  }

  const xrefOffset = offset;
  const xref = [
    'xref',
    `0 ${objectCount + 1}`,
    '0000000000 65535 f ',
    ...offsets
      .slice(1)
      .map((objectOffset) => `${objectOffset.toString().padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${objectCount + 1} /Root 1 0 R >>`,
    'startxref',
    xrefOffset.toString(),
    '%%EOF',
    '',
  ].join('\n');
  parts.push(xref);

  return new Blob(parts, { type: 'application/pdf' });
}

function outputDimensions(width: number, height: number) {
  const scale = Math.min(1, MAX_EMBEDDED_IMAGE_SIDE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function validateFiles(files: readonly File[]): void {
  if (files.length === 0) {
    throw new RangeError('请先添加至少一张图片');
  }
  if (files.length > MAX_PDF_IMAGE_COUNT) {
    throw new RangeError(`一次最多处理 ${MAX_PDF_IMAGE_COUNT} 张图片`);
  }

  let totalBytes = 0;
  for (const file of files) {
    if (file.size === 0) {
      throw new TypeError(`${file.name || '图片'}没有内容`);
    }
    if (file.size > MAX_PDF_IMAGE_BYTES) {
      throw new RangeError(`${file.name || '图片'}超过 50 MB`);
    }
    totalBytes += file.size;
  }

  if (totalBytes > MAX_PDF_TOTAL_BYTES) {
    throw new RangeError('图片总大小超过 300 MB，请分批生成 PDF');
  }
}

/**
 * 在浏览器本地将图片依序转换为多页 PDF。
 */
export async function createImagesPdf(
  files: readonly File[],
  options: ImagesToPdfOptions,
): Promise<Blob> {
  validateFiles(files);
  const normalized = normalizeOptions(options);
  const pages: PdfJpegPage[] = [];
  let encodedBytes = 0;

  for (let index = 0; index < files.length; index += 1) {
    checkAborted(options.signal);
    const file = files[index]!;
    const dimensions = await readImageDimensions(file);
    checkAborted(options.signal);
    const target = outputDimensions(dimensions.width, dimensions.height);
    const result = await processImage(
      file,
      {
        outputSize: target,
        output: {
          mime: 'image/jpeg',
          quality: normalized.jpegQuality,
          background: '#ffffff',
        },
      },
      options.signal,
    );

    encodedBytes += result.blob.size;
    if (encodedBytes > MAX_PDF_OUTPUT_BYTES) {
      throw new RangeError('PDF 内嵌图片超过 256 MB，请减少图片数量或分批生成');
    }
    pages.push({
      jpeg: result.blob,
      width: result.width,
      height: result.height,
    });
    options.onProgress?.(index + 1, files.length);
  }

  checkAborted(options.signal);
  return buildPdfDocument(pages, options);
}
