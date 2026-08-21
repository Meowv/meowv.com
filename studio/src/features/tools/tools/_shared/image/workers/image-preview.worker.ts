/// <reference lib="webworker" />

type PreviewImageKind = 'heic' | 'tiff' | 'psd';

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
const PSD_MEMORY_BUDGET = 512 * 1024 * 1024;
let psdCanvasInitialized = false;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new TypeError('图片没有有效的像素尺寸');
  }
}

async function canvasSourceToPng(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxEdge?: number,
): Promise<Blob> {
  assertDimensions(width, height);
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('当前浏览器不支持后台图片转换');
  }

  const scale = maxEdge ? Math.min(1, maxEdge / Math.max(width, height)) : 1;
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const target = new OffscreenCanvas(targetWidth, targetHeight);
  const targetContext = target.getContext('2d');
  if (!targetContext) {
    throw new Error('无法创建图片绘制上下文');
  }
  targetContext.drawImage(source, 0, 0, targetWidth, targetHeight);
  return target.convertToBlob({ type: 'image/png' });
}

async function rgbaToPng(
  pixels: Uint8Array,
  width: number,
  height: number,
  maxEdge?: number,
): Promise<Blob> {
  assertDimensions(width, height);
  const source = new OffscreenCanvas(width, height);
  const sourceContext = source.getContext('2d');
  if (!sourceContext) {
    throw new Error('无法创建图片绘制上下文');
  }
  const clamped = new Uint8ClampedArray(pixels.length);
  clamped.set(pixels);
  sourceContext.putImageData(new ImageData(clamped, width, height), 0, 0);
  return canvasSourceToPng(source, width, height, maxEdge);
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
    return await canvasSourceToPng(bitmap, bitmap.width, bitmap.height, request.maxEdge);
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
  return rgbaToPng(pixels, firstPage.width, firstPage.height, request.maxEdge);
}

async function decodePsd(request: PreviewImageRequest): Promise<Blob> {
  const { initializeCanvas, readPsd } = await import('ag-psd');
  if (!psdCanvasInitialized) {
    initializeCanvas(
      (width, height) => new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement,
    );
    psdCanvasInitialized = true;
  }

  const psd = readPsd(request.buffer, {
    skipLayerImageData: true,
    skipLinkedFilesData: true,
    skipThumbnail: true,
    totalMemoryLimit: PSD_MEMORY_BUDGET,
  });
  const canvas = psd.canvas as unknown as OffscreenCanvas | undefined;
  if (!canvas || !(canvas instanceof OffscreenCanvas)) {
    throw new TypeError('PSD 文件中没有可预览的合成图');
  }
  return canvasSourceToPng(canvas, psd.width, psd.height, request.maxEdge);
}

async function decodeRequest(request: PreviewImageRequest): Promise<PreviewImageSuccess> {
  const blob =
    request.kind === 'heic'
      ? await decodeHeic(request)
      : request.kind === 'tiff'
        ? await decodeTiff(request)
        : await decodePsd(request);
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
