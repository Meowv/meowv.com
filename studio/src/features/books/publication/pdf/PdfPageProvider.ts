import type { PDFPageProxy, RenderTask } from 'pdfjs-dist/types/src/display/api';
import type {
  BookLocator,
  PageProvider,
  PageRenderOptions,
  PageSize,
  RenderedPage,
} from '../../types/reader';
import { applyPageFinish } from '../rendered-page';
import {
  loadPdfDocument,
  type LoadedPdfDocument,
  type PdfDocumentLoadOptions,
  type PdfDocumentSource,
} from './PdfDocumentLoader';

const MAX_TEXTURE_EDGE = 2048;

function createAbortError(): DOMException {
  return new DOMException('PDF 页面渲染已取消。', 'AbortError');
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

function createRenderedPage(
  pageNumber: number,
  canvas: HTMLCanvasElement,
  options: PageRenderOptions,
): RenderedPage {
  let disposed = false;
  return {
    pageNumber,
    canvas,
    width: canvas.width,
    height: canvas.height,
    targetWidth: canvas.width,
    quality: options.quality,
    byteSize: canvas.width * canvas.height * 4,
    dispose: () => {
      if (!disposed) {
        disposed = true;
        releaseCanvas(canvas);
      }
    },
  };
}

export class PdfPageProvider implements PageProvider {
  readonly #loadedDocument: LoadedPdfDocument;
  readonly #renderTasks = new Map<RenderTask, Promise<void>>();
  #referenceSizePromise: Promise<PageSize> | null = null;
  #disposePromise: Promise<void> | null = null;

  constructor(loadedDocument: LoadedPdfDocument) {
    this.#loadedDocument = loadedDocument;
  }

  static async open(
    source: PdfDocumentSource,
    options: PdfDocumentLoadOptions = {},
  ): Promise<PdfPageProvider> {
    return new PdfPageProvider(await loadPdfDocument(source, options));
  }

  get pageCount(): number {
    return this.#loadedDocument.document.numPages;
  }

  locatorForPage(pageNumber: number): BookLocator {
    this.#assertPageNumber(pageNumber);
    return { kind: 'fixed', pageNumber };
  }

  pageForLocator(locator: BookLocator): number {
    if (locator.kind !== 'fixed') return 1;
    return Math.min(this.pageCount, Math.max(1, Math.trunc(locator.pageNumber)));
  }

  #assertUsable(): void {
    if (this.#disposePromise || this.#loadedDocument.disposed) {
      throw new Error('PDF 页面提供器已释放。');
    }
  }

  #assertPageNumber(pageNumber: number): void {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > this.pageCount) {
      throw new RangeError(`pageNumber 必须在 1 到 ${this.pageCount} 之间。`);
    }
  }

  async #getPage(pageNumber: number): Promise<PDFPageProxy> {
    this.#assertUsable();
    this.#assertPageNumber(pageNumber);
    const page = await this.#loadedDocument.document.getPage(pageNumber);
    this.#assertUsable();
    return page;
  }

  async getPageSize(pageNumber: number): Promise<PageSize> {
    this.#assertPageNumber(pageNumber);
    if (!this.#referenceSizePromise) {
      this.#referenceSizePromise = this.#getPage(1).then((page) => {
        try {
          const viewport = page.getViewport({ scale: 1 });
          return { width: viewport.width, height: viewport.height };
        } finally {
          page.cleanup();
        }
      });
    }
    return this.#referenceSizePromise;
  }

  async renderPage(pageNumber: number, options: PageRenderOptions): Promise<RenderedPage> {
    this.#assertUsable();
    if (!Number.isFinite(options.targetWidth) || options.targetWidth <= 0) {
      throw new RangeError('targetWidth 必须是大于 0 的有限数值。');
    }
    if (options.quality !== 'preview' && options.quality !== 'reading') {
      throw new TypeError('quality 必须是 preview 或 reading。');
    }
    if (options.signal?.aborted) {
      throw createAbortError();
    }
    if (typeof globalThis.document?.createElement !== 'function') {
      throw new Error('当前环境无法创建 PDF 页面 Canvas。');
    }

    const [page, referenceSize] = await Promise.all([
      this.#getPage(pageNumber),
      this.getPageSize(1),
    ]);
    if (options.signal?.aborted) {
      page.cleanup();
      throw createAbortError();
    }
    const baseViewport = page.getViewport({ scale: 1 });
    if (baseViewport.width <= 0 || baseViewport.height <= 0) {
      page.cleanup();
      throw new Error(`PDF 第 ${pageNumber} 页尺寸无效。`);
    }

    const requestedWidth = Math.max(1, Math.round(options.targetWidth));
    const requestedHeight = Math.max(
      1,
      Math.round(requestedWidth * (referenceSize.height / referenceSize.width)),
    );
    const scaleToTexture = Math.min(
      1,
      MAX_TEXTURE_EDGE / requestedWidth,
      MAX_TEXTURE_EDGE / requestedHeight,
    );
    const canvasWidth = Math.max(1, Math.round(requestedWidth * scaleToTexture));
    const canvasHeight = Math.max(1, Math.round(requestedHeight * scaleToTexture));
    const scale = Math.min(
      canvasWidth / baseViewport.width,
      canvasHeight / baseViewport.height,
      MAX_TEXTURE_EDGE / Math.max(baseViewport.width, baseViewport.height),
    );
    const viewport = page.getViewport({ scale });
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      page.cleanup();
      releaseCanvas(canvas);
      throw new Error('浏览器无法创建 PDF 页面画布。');
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = options.quality === 'reading' ? 'high' : 'medium';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const offsetX = (canvas.width - viewport.width) / 2;
    const offsetY = (canvas.height - viewport.height) / 2;

    const renderTask = page.render({
      canvas,
      canvasContext: context,
      viewport,
      intent: 'display',
      background: '#ffffff',
      transform: [1, 0, 0, 1, offsetX, offsetY],
    });
    const renderPromise = renderTask.promise;
    this.#renderTasks.set(renderTask, renderPromise);

    const abort = (): void => renderTask.cancel();
    options.signal?.addEventListener('abort', abort, { once: true });

    try {
      await renderPromise;
      if (options.signal?.aborted) {
        throw createAbortError();
      }
      this.#assertUsable();
      applyPageFinish(canvas);
      return createRenderedPage(pageNumber, canvas, options);
    } catch (error) {
      releaseCanvas(canvas);
      if (options.signal?.aborted || this.#disposePromise) {
        throw createAbortError();
      }
      throw error;
    } finally {
      options.signal?.removeEventListener('abort', abort);
      this.#renderTasks.delete(renderTask);
      page.cleanup();
    }
  }

  dispose(): Promise<void> {
    if (!this.#disposePromise) {
      this.#disposePromise = (async () => {
        const pending = [...this.#renderTasks.entries()];
        for (const [task] of pending) {
          task.cancel();
        }
        await Promise.allSettled(pending.map(([, promise]) => promise));
        await this.#loadedDocument.dispose();
      })();
    }
    return this.#disposePromise;
  }
}
