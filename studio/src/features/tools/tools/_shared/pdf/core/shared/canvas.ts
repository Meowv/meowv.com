import { readImageDimensions } from '@/features/tools/tools/_shared/image/core/image/dimensions';

export interface CanvasTextAsset {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

export const MAX_WATERMARK_IMAGE_BYTES = 50 * 1024 * 1024;

export async function validateWatermarkImage(file: File): Promise<void> {
  if (file.size === 0) {
    throw new RangeError('WATERMARK_IMAGE_EMPTY');
  }
  if (file.size > MAX_WATERMARK_IMAGE_BYTES) {
    throw new RangeError('WATERMARK_IMAGE_TOO_LARGE');
  }

  // readImageDimensions 在解码前读取文件头，并复用统一的最长边和像素上限。
  await readImageDimensions(file);
}

export async function decodeImageFile(file: File): Promise<DecodedImage> {
  if (typeof globalThis.createImageBitmap === 'function') {
    const bitmap = await globalThis
      .createImageBitmap(file, { imageOrientation: 'from-image' })
      .catch(() => globalThis.createImageBitmap(file));

    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => URL.revokeObjectURL(url),
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('浏览器无法读取这张图片。'));
    };
    image.src = url;
  });
}

function blobFromCanvas(
  canvas: HTMLCanvasElement,
  mimeType = 'image/png',
  quality = 0.95,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('浏览器无法生成透明图像。'));
        }
      },
      mimeType,
      quality,
    );
  });
}

export async function renderTextToPng(
  text: string,
  options: {
    fontSize: number;
    color: string;
    fontWeight?: number;
    padding?: number;
  },
): Promise<CanvasTextAsset> {
  const scale = 2;
  const padding = options.padding ?? Math.ceil(options.fontSize * 0.4);
  const probe = document.createElement('canvas');
  const probeContext = probe.getContext('2d');
  if (!probeContext) {
    throw new Error('浏览器无法创建文字画布。');
  }

  const font = `${options.fontWeight ?? 500} ${options.fontSize * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
  probeContext.font = font;
  const metrics = probeContext.measureText(text);
  const width = Math.max(1, Math.ceil(metrics.width + padding * scale * 2));
  const height = Math.max(1, Math.ceil(options.fontSize * 1.6 * scale + padding * scale * 2));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('浏览器无法创建文字画布。');
  }

  context.clearRect(0, 0, width, height);
  context.font = font;
  context.fillStyle = options.color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, width / 2, height / 2);
  const blob = await blobFromCanvas(canvas);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  canvas.width = 1;
  canvas.height = 1;

  return {
    bytes,
    width: width / scale,
    height: height / scale,
  };
}

export async function normalizeImageForPdf(file: File): Promise<{
  bytes: Uint8Array;
  type: 'png' | 'jpeg';
  width: number;
  height: number;
}> {
  await validateWatermarkImage(file);
  const decoded = await decodeImageFile(file);
  try {
    if (file.type === 'image/png' || file.type === 'image/jpeg') {
      return {
        bytes: new Uint8Array(await file.arrayBuffer()),
        type: file.type === 'image/png' ? ('png' as const) : ('jpeg' as const),
        width: decoded.width,
        height: decoded.height,
      };
    }

    const canvas = document.createElement('canvas');
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    try {
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('浏览器无法转换这张图片。');
      }
      context.drawImage(decoded.source, 0, 0);
      const blob = await blobFromCanvas(canvas);
      return {
        bytes: new Uint8Array(await blob.arrayBuffer()),
        type: 'png',
        width: decoded.width,
        height: decoded.height,
      };
    } finally {
      canvas.width = 1;
      canvas.height = 1;
    }
  } finally {
    decoded.close();
  }
}
