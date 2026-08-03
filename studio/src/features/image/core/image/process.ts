import type {
  EncodingCapabilities,
  ImageDimensions,
  RenderSpec,
} from '@/features/image/types/image';

import { detectImageMime, isMatchingMime, normalizeOutputMime, type OutputMime } from './formats';

interface DecodedImage extends ImageDimensions {
  source: CanvasImageSource;
  dispose: () => void;
}

export interface ProcessedImage extends ImageDimensions {
  blob: Blob;
  mime: string;
}

type CanvasTarget = HTMLCanvasElement | OffscreenCanvas;

const MAX_RENDER_SIDE = 16_384;
const MAX_RENDER_PIXELS = 50_000_000;
const sanitizedSvgSources = new WeakSet<Blob>();

const MAGIC_PREFIXES: Readonly<Record<OutputMime, readonly number[]>> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
  'image/vnd.microsoft.icon': [0x00, 0x00, 0x01, 0x00],
  'image/svg+xml': [],
};

function abortError(): DOMException {
  return new DOMException('图片处理已取消', 'AbortError');
}

async function sanitizeSvgSource(blob: Blob): Promise<Blob> {
  if (sanitizedSvgSources.has(blob)) {
    return blob;
  }
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    throw new Error('当前浏览器无法安全解析 SVG');
  }

  const documentNode = new DOMParser().parseFromString(await blob.text(), 'image/svg+xml');
  if (
    documentNode.querySelector('parsererror') ||
    documentNode.documentElement.localName.toLowerCase() !== 'svg'
  ) {
    throw new TypeError('SVG 内容无效');
  }

  const blockedElements = new Set([
    'script',
    'style',
    'foreignobject',
    'iframe',
    'object',
    'embed',
    'link',
    'audio',
    'video',
  ]);

  for (const element of Array.from(documentNode.querySelectorAll('*'))) {
    if (blockedElements.has(element.localName.toLowerCase())) {
      element.remove();
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      const isRemoteReference =
        (name === 'href' || name === 'xlink:href' || name === 'src') &&
        value !== '' &&
        !value.startsWith('#') &&
        !value.startsWith('data:image/');
      const hasExternalCssUrl =
        /url\s*\(/i.test(value) &&
        !/url\s*\(\s*['"]?#/i.test(value) &&
        !/url\s*\(\s*['"]?data:image\//i.test(value);

      if (
        name.startsWith('on') ||
        name === 'xml:base' ||
        isRemoteReference ||
        hasExternalCssUrl ||
        (name === 'style' && /@import/i.test(value))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  const sanitized = new Blob(
    [new XMLSerializer().serializeToString(documentNode.documentElement)],
    { type: 'image/svg+xml' },
  );
  sanitizedSvgSources.add(sanitized);
  return sanitized;
}

export async function sanitizeSvgFile(file: File): Promise<File> {
  const sanitizedBlob = await sanitizeSvgSource(file);
  const sanitizedFile = new File([sanitizedBlob], file.name, {
    type: 'image/svg+xml',
    lastModified: file.lastModified,
  });
  sanitizedSvgSources.add(sanitizedFile);
  return sanitizedFile;
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

function assertDimension(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new RangeError(`${label}必须是正整数`);
  }
  return value;
}

function validateSpec(
  spec: RenderSpec,
  source: ImageDimensions,
): Required<Pick<RenderSpec, 'sourceRect'>> &
  Pick<RenderSpec, 'outputSize' | 'output'> & { mime: OutputMime } {
  const outputSize = {
    width: assertDimension(spec.outputSize.width, '输出宽度'),
    height: assertDimension(spec.outputSize.height, '输出高度'),
  };
  if (
    outputSize.width > MAX_RENDER_SIDE ||
    outputSize.height > MAX_RENDER_SIDE ||
    outputSize.width * outputSize.height > MAX_RENDER_PIXELS
  ) {
    throw new RangeError(
      `输出尺寸过大，最长边不能超过 ${MAX_RENDER_SIDE} px，且总像素不能超过 5000 万`,
    );
  }
  const sourceRect = spec.sourceRect ?? {
    x: 0,
    y: 0,
    width: source.width,
    height: source.height,
  };

  for (const [label, value] of [
    ['裁剪横坐标', sourceRect.x],
    ['裁剪纵坐标', sourceRect.y],
    ['裁剪宽度', sourceRect.width],
    ['裁剪高度', sourceRect.height],
  ] as const) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`${label}无效`);
    }
  }

  if (
    sourceRect.x < 0 ||
    sourceRect.y < 0 ||
    sourceRect.width <= 0 ||
    sourceRect.height <= 0 ||
    sourceRect.x + sourceRect.width > source.width ||
    sourceRect.y + sourceRect.height > source.height
  ) {
    throw new RangeError('裁剪区域超出原图范围');
  }

  if (
    spec.output.quality !== undefined &&
    (!Number.isFinite(spec.output.quality) || spec.output.quality < 0 || spec.output.quality > 1)
  ) {
    throw new RangeError('输出质量必须在 0 到 1 之间');
  }

  return {
    sourceRect,
    outputSize,
    output: spec.output,
    mime: normalizeOutputMime(spec.output.mime),
  };
}

function loadHtmlImage(blob: Blob, signal?: AbortSignal): Promise<DecodedImage> {
  if (
    typeof Image === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return Promise.reject(new Error('当前浏览器不支持图片解码'));
  }

  checkAborted(signal);
  const url = URL.createObjectURL(blob);
  const image = new Image();

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanupListeners = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener('abort', onAbort);
    };
    const dispose = () => {
      cleanupListeners();
      image.src = '';
      URL.revokeObjectURL(url);
    };
    const onAbort = () => {
      if (settled) {
        return;
      }
      settled = true;
      dispose();
      reject(abortError());
    };

    image.onload = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanupListeners();
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        dispose,
      });
    };
    image.onerror = () => {
      if (settled) {
        return;
      }
      settled = true;
      dispose();
      reject(new TypeError('图片解码失败，格式可能不受浏览器支持'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    image.decoding = 'async';
    image.src = url;
  });
}

async function decodeImage(blob: Blob, signal?: AbortSignal): Promise<DecodedImage> {
  checkAborted(signal);

  if (typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob, {
        imageOrientation: 'from-image',
      });
    } catch (firstError) {
      checkAborted(signal);
      try {
        bitmap = await createImageBitmap(blob);
      } catch {
        if (firstError instanceof DOMException && firstError.name === 'AbortError') {
          throw firstError;
        }
        return loadHtmlImage(blob, signal);
      }
    }

    if (signal?.aborted) {
      bitmap.close();
      throw abortError();
    }

    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      dispose: () => bitmap.close(),
    };
  }

  return loadHtmlImage(blob, signal);
}

function createCanvas(width: number, height: number): CanvasTarget {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }

  throw new Error('当前浏览器不支持 Canvas 图片处理');
}

function getContext(canvas: CanvasTarget) {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('无法创建 Canvas 2D 上下文');
  }
  return context;
}

function encodeRasterCanvas(
  canvas: CanvasTarget,
  mime: 'image/jpeg' | 'image/png' | 'image/webp',
  quality?: number,
): Promise<Blob> {
  if ('toBlob' in canvas) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error(`浏览器无法编码 ${mime} 图片`));
            }
          },
          mime,
          quality,
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  return (canvas as OffscreenCanvas).convertToBlob({ type: mime, quality });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 32_768;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return `data:${blob.type};base64,${btoa(binary)}`;
}

async function encodeSvgCanvas(canvas: CanvasTarget): Promise<Blob> {
  const png = await encodeRasterCanvas(canvas, 'image/png');
  const dataUrl = await blobToDataUrl(png);
  const width = canvas.width;
  const height = canvas.height;
  const markup = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<image width="${width}" height="${height}" href="${dataUrl}"/>`,
    '</svg>',
  ].join('');

  return new Blob([markup], { type: 'image/svg+xml' });
}

async function encodeIcoCanvas(canvas: CanvasTarget): Promise<Blob> {
  const width = canvas.width;
  const height = canvas.height;
  if (width > 256 || height > 256) {
    throw new RangeError('ICO 输出最长边不能超过 256 px');
  }

  const png = await encodeRasterCanvas(canvas, 'image/png');
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  header[6] = width === 256 ? 0 : width;
  header[7] = height === 256 ? 0 : height;
  header[8] = 0;
  header[9] = 0;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, png.size, true);
  view.setUint32(18, header.length, true);

  return new Blob([header, png], { type: 'image/vnd.microsoft.icon' });
}

function encodeCanvas(canvas: CanvasTarget, mime: OutputMime, quality?: number): Promise<Blob> {
  if (mime === 'image/svg+xml') {
    return encodeSvgCanvas(canvas);
  }
  if (mime === 'image/vnd.microsoft.icon') {
    return encodeIcoCanvas(canvas);
  }
  return encodeRasterCanvas(canvas, mime, quality);
}

async function hasExpectedMagic(blob: Blob, mime: OutputMime) {
  const expected = MAGIC_PREFIXES[mime];
  const bytes = new Uint8Array(await blob.slice(0, Math.min(blob.size, 64)).arrayBuffer());

  if (mime === 'image/webp') {
    return (
      bytes.length >= 12 &&
      expected.every((value, index) => bytes[index] === value) &&
      String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
    );
  }

  if (mime === 'image/svg+xml') {
    return (await detectImageMime(blob)) === mime;
  }

  return expected.every((value, index) => bytes[index] === value);
}

async function assertEncodedMime(blob: Blob, mime: OutputMime): Promise<void> {
  if (!isMatchingMime(blob.type, mime) || !(await hasExpectedMagic(blob, mime))) {
    throw new TypeError(`浏览器未按要求输出 ${mime}，可能不支持该编码格式`);
  }
}

/**
 * 使用浏览器 Canvas 在本地裁剪、缩放并编码图片。
 */
export async function processImage(
  file: File | Blob,
  spec: RenderSpec,
  signal?: AbortSignal,
): Promise<ProcessedImage> {
  checkAborted(signal);

  const sourceMime = await detectImageMime(file);
  if (!sourceMime) {
    throw new TypeError('无法识别图片格式，文件可能已损坏');
  }
  checkAborted(signal);

  const source = sourceMime === 'image/svg+xml' ? await sanitizeSvgSource(file) : file;
  const decoded = await decodeImage(source, signal);
  try {
    const normalized = validateSpec(spec, decoded);
    const canvas = createCanvas(normalized.outputSize.width, normalized.outputSize.height);
    const context = getContext(canvas);

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    const background =
      normalized.output.background ?? (normalized.mime === 'image/jpeg' ? '#ffffff' : undefined);
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, normalized.outputSize.width, normalized.outputSize.height);
    } else {
      context.clearRect(0, 0, normalized.outputSize.width, normalized.outputSize.height);
    }

    checkAborted(signal);
    context.drawImage(
      decoded.source,
      normalized.sourceRect.x,
      normalized.sourceRect.y,
      normalized.sourceRect.width,
      normalized.sourceRect.height,
      0,
      0,
      normalized.outputSize.width,
      normalized.outputSize.height,
    );
    checkAborted(signal);

    const blob = await encodeCanvas(canvas, normalized.mime, normalized.output.quality);
    checkAborted(signal);
    await assertEncodedMime(blob, normalized.mime);
    checkAborted(signal);

    return {
      blob,
      width: normalized.outputSize.width,
      height: normalized.outputSize.height,
      mime: normalized.mime,
    };
  } finally {
    decoded.dispose();
  }
}

async function canEncode(mime: OutputMime): Promise<boolean> {
  try {
    const canvas = createCanvas(1, 1);
    const context = getContext(canvas);
    context.fillStyle = '#000000';
    context.fillRect(0, 0, 1, 1);
    const blob = await encodeCanvas(canvas, mime, 0.8);
    await assertEncodedMime(blob, mime);
    return true;
  } catch {
    return false;
  }
}

/**
 * 实测当前浏览器 Canvas 的编码能力，防止不支持的格式静默回退为 PNG。
 */
export async function detectEncodingCapabilities(): Promise<EncodingCapabilities> {
  const [jpeg, png, webp, ico, svg] = await Promise.all([
    canEncode('image/jpeg'),
    canEncode('image/png'),
    canEncode('image/webp'),
    canEncode('image/vnd.microsoft.icon'),
    canEncode('image/svg+xml'),
  ]);

  return { jpeg, png, webp, ico, svg };
}
