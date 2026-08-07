const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 1280;
const MAX_EMBEDDED_BYTES = 900 * 1024;
const START_QUALITY = 0.82;
const MIN_QUALITY = 0.5;
const MIN_SHRINK_SIDE = 512;
const SHRINK_FACTOR = 0.75;
const MAX_ATTEMPTS = 14;

export interface CompressedNoteImage {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

export function formatNoteBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function decodeImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(url);
    };
    image.onload = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('图片解码失败，无法插入便签。'));
    };
    image.src = url;
  });
}

function encodeCanvas(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('图片编码失败，无法插入便签。'));
      },
      mime,
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败，无法插入便签。'));
    reader.readAsDataURL(blob);
  });
}

function scaleSize(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const ratio = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function drawScaled(image: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理图片。');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

function hasTransparency(image: HTMLImageElement): boolean {
  const { width, height } = scaleSize(image.naturalWidth, image.naturalHeight, 64);
  const canvas = drawScaled(image, width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  const { data } = context.getImageData(0, 0, width, height);
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 250) return true;
  }
  return false;
}

function pickOutputMime(sourceMime: string, transparent: boolean): string {
  if (sourceMime === 'image/jpeg') return 'image/jpeg';
  if (transparent) return 'image/png';
  return 'image/jpeg';
}

/**
 * 压缩剪贴板图片，返回可直接嵌入 Markdown 的 data URL。
 * 算法参照 Image 工具的图片压缩：Canvas 重编码 + 质量 82%，再叠加最长边与体积上限。
 */
export async function compressPastedImage(blob: Blob): Promise<CompressedNoteImage> {
  if (blob.size > MAX_SOURCE_BYTES) {
    throw new Error(`图片过大（${formatNoteBytes(blob.size)}），无法粘贴。`);
  }
  const image = await decodeImage(blob);
  let { width, height } = scaleSize(image.naturalWidth, image.naturalHeight, MAX_SIDE);
  const transparent = hasTransparency(image);
  const mime = pickOutputMime(blob.type, transparent);
  const lossy = mime !== 'image/png';

  let canvas = drawScaled(image, width, height);
  let quality = START_QUALITY;
  let output = await encodeCanvas(canvas, mime, lossy ? quality : undefined);
  let attempts = 0;

  while (output.size > MAX_EMBEDDED_BYTES && attempts < MAX_ATTEMPTS) {
    if (lossy && quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, Math.round((quality - 0.12) * 100) / 100);
    } else if (width > MIN_SHRINK_SIDE || height > MIN_SHRINK_SIDE) {
      ({ width, height } = scaleSize(width, height, Math.max(width, height) * SHRINK_FACTOR));
      canvas = drawScaled(image, width, height);
      quality = START_QUALITY;
    } else {
      break;
    }
    output = await encodeCanvas(canvas, mime, lossy ? quality : undefined);
    attempts += 1;
  }

  if (output.size > MAX_EMBEDDED_BYTES) {
    throw new Error(`图片压缩后仍超过 ${formatNoteBytes(MAX_EMBEDDED_BYTES)}，请缩小后再粘贴。`);
  }
  return {
    dataUrl: await blobToDataUrl(output),
    width,
    height,
    bytes: output.size,
  };
}
