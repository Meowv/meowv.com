/// <reference lib="webworker" />

type PreviewImageKind = 'heic' | 'tiff';

interface PreviewImageRequest {
  id: number;
  kind: PreviewImageKind;
  buffer: ArrayBuffer;
  mime: string;
  maxEdge?: number;
}

interface PreviewImageSuccess {
  id: number;
  ok: true;
  buffer: ArrayBuffer;
  mime: 'image/png';
}

interface PreviewImageFailure {
  id: number;
  ok: false;
  error: string;
}

type PreviewImageResponse = PreviewImageSuccess | PreviewImageFailure;

const workerScope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new TypeError('图片没有有效的像素尺寸');
  }
}

async function canvasToPng(
  pixels: Uint8Array,
  width: number,
  height: number,
  maxEdge?: number,
): Promise<Blob> {
  assertDimensions(width, height);
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('当前浏览器不支持后台图片转换');
  }

  const source = new OffscreenCanvas(width, height);
  const sourceContext = source.getContext('2d');
  if (!sourceContext) {
    throw new Error('无法创建图片绘制上下文');
  }
  const clamped = new Uint8ClampedArray(pixels.length);
  clamped.set(pixels);
  sourceContext.putImageData(new ImageData(clamped, width, height), 0, 0);

  const scale = maxEdge ? Math.min(1, maxEdge / Math.max(width, height)) : 1;
  if (scale === 1) {
    return source.convertToBlob({ type: 'image/png' });
  }

  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const target = new OffscreenCanvas(targetWidth, targetHeight);
  const targetContext = target.getContext('2d');
  if (!targetContext) {
    throw new Error('无法创建缩略图绘制上下文');
  }
  targetContext.drawImage(source, 0, 0, targetWidth, targetHeight);
  return target.convertToBlob({ type: 'image/png' });
}

async function decodeHeic(request: PreviewImageRequest): Promise<Blob> {
  const { heicTo } = await import('heic-to/next');
  const decoded = await heicTo({
    blob: new Blob([request.buffer], { type: request.mime || 'image/heic' }),
    type: 'image/png',
  });
  if (!request.maxEdge) {
    return decoded;
  }

  const bitmap = await createImageBitmap(decoded);
  try {
    const scale = Math.min(1, request.maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) {
      return decoded;
    }
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('无法创建 HEIC 缩略图绘制上下文');
    }
    context.drawImage(bitmap, 0, 0, width, height);
    return await canvas.convertToBlob({ type: 'image/png' });
  } finally {
    bitmap.close();
  }
}

async function decodeTiff(request: PreviewImageRequest): Promise<Blob> {
  const loaded = await import('utif');
  const utif = ('default' in loaded ? loaded.default : loaded) as typeof import('utif');
  const pages = utif.decode(request.buffer);
  const firstPage = pages[0];
  if (!firstPage) {
    throw new TypeError('TIFF 文件中没有可预览的页面');
  }
  utif.decodeImage(request.buffer, firstPage);
  const pixels = utif.toRGBA8(firstPage);
  return canvasToPng(pixels, firstPage.width, firstPage.height, request.maxEdge);
}

async function decodeRequest(request: PreviewImageRequest): Promise<PreviewImageSuccess> {
  const blob = request.kind === 'heic' ? await decodeHeic(request) : await decodeTiff(request);
  return {
    id: request.id,
    ok: true,
    buffer: await blob.arrayBuffer(),
    mime: 'image/png',
  };
}

let decodeQueue = Promise.resolve();

workerScope.addEventListener('message', (event: MessageEvent<PreviewImageRequest>) => {
  const request = event.data;
  decodeQueue = decodeQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        const response = await decodeRequest(request);
        workerScope.postMessage(response, [response.buffer]);
      } catch (error) {
        const response: PreviewImageFailure = {
          id: request.id,
          ok: false,
          error: toErrorMessage(error),
        };
        workerScope.postMessage(response);
      }
    });
});

export type { PreviewImageRequest, PreviewImageResponse };
