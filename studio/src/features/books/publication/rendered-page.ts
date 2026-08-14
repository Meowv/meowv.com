import type { PageRenderOptions, PageRenderQuality, RenderedPage } from '../types/reader';

export function abortError(message = '书页处理已取消。'): DOMException {
  return new DOMException(message, 'AbortError');
}

export function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

export function disposeCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

export function applyPageFinish(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d');
  if (!context || !canvas.width || !canvas.height) return;
  context.save();
  const horizontal = context.createLinearGradient(0, 0, canvas.width, 0);
  horizontal.addColorStop(0, 'rgba(60, 36, 22, 0.022)');
  horizontal.addColorStop(0.045, 'rgba(60, 36, 22, 0)');
  horizontal.addColorStop(0.955, 'rgba(60, 36, 22, 0)');
  horizontal.addColorStop(1, 'rgba(60, 36, 22, 0.018)');
  context.fillStyle = horizontal;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const vertical = context.createLinearGradient(0, 0, 0, canvas.height);
  vertical.addColorStop(0, 'rgba(60, 36, 22, 0.012)');
  vertical.addColorStop(0.035, 'rgba(60, 36, 22, 0)');
  vertical.addColorStop(0.965, 'rgba(60, 36, 22, 0)');
  vertical.addColorStop(1, 'rgba(60, 36, 22, 0.016)');
  context.fillStyle = vertical;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

export function createRenderedPage(
  pageNumber: number,
  canvas: HTMLCanvasElement,
  options: Pick<PageRenderOptions, 'targetWidth' | 'quality'>,
): RenderedPage {
  let disposed = false;
  return {
    pageNumber,
    canvas,
    width: canvas.width,
    height: canvas.height,
    targetWidth: Math.round(options.targetWidth),
    quality: options.quality,
    byteSize: canvas.width * canvas.height * 4,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      disposeCanvas(canvas);
    },
  };
}

export function qualityScale(quality: PageRenderQuality): number {
  return quality === 'reading' ? 1 : 0.56;
}
