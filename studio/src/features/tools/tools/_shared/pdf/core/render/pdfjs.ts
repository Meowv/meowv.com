import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
} from 'pdfjs-dist/types/src/display/api';
import type { GeneratedFile, PdfWarning } from '../types';
import { PdfProcessingError, mapPdfError } from '../shared/errors';
import { padPageNumber } from '../shared/format';

interface PdfJsModule {
  getDocument: (source: {
    data: Uint8Array;
    isEvalSupported: boolean;
    useWorkerFetch: boolean;
    wasmUrl?: string;
  }) => PDFDocumentLoadingTask;
  GlobalWorkerOptions: {
    workerSrc: string;
  };
}

interface PdfJsRuntime {
  module: PdfJsModule;
  wasmUrl: string;
}

interface AssetUrlModule {
  default: string;
}

export interface ManagedPdfDocument extends PDFDocumentProxy {
  destroyDocument: () => Promise<void>;
}

let pdfJsPromise: Promise<PdfJsRuntime> | null = null;

async function getPdfJs(): Promise<PdfJsRuntime> {
  if (!pdfJsPromise) {
    pdfJsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?worker&url'),
      import('pdfjs-dist/wasm/jbig2.wasm?url'),
      import('pdfjs-dist/wasm/jbig2_nowasm_fallback.js?url'),
      import('pdfjs-dist/wasm/openjpeg.wasm?url'),
      import('pdfjs-dist/wasm/openjpeg_nowasm_fallback.js?url'),
      import('pdfjs-dist/wasm/qcms_bg.wasm?url'),
    ]).then(([pdfJs, worker, ...wasmAssets]) => {
      pdfJs.GlobalWorkerOptions.workerSrc = worker.default;
      const assetUrls = (wasmAssets as AssetUrlModule[]).map(
        ({ default: url }) => new URL(url, location.href),
      );
      const wasmUrl = new URL('.', assetUrls[0]).href;

      if (assetUrls.some((url) => new URL('.', url).href !== wasmUrl)) {
        throw new Error('PDF.js WASM 资源未输出到同一目录。');
      }

      return {
        module: pdfJs as unknown as PdfJsModule,
        wasmUrl,
      };
    });
  }
  return pdfJsPromise;
}

export async function openPdfDocument(bytes: Uint8Array): Promise<ManagedPdfDocument> {
  try {
    const pdfJs = await getPdfJs();
    const loadingTask = pdfJs.module.getDocument({
      data: bytes.slice(),
      isEvalSupported: false,
      useWorkerFetch: true,
      wasmUrl: pdfJs.wasmUrl,
    });
    const document = (await loadingTask.promise) as ManagedPdfDocument;
    document.destroyDocument = async () => {
      await document.cleanup();
      await loadingTask.destroy();
    };
    return document;
  } catch (error) {
    throw mapPdfError(error);
  }
}

export async function renderPdfPage(
  document: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  options: { maxWidth?: number; scale?: number; rotation?: number } = {},
): Promise<PDFPageProxy> {
  const page = await document.getPage(pageNumber);
  const baseViewport = page.getViewport({
    scale: 1,
    rotation: (page.rotate + (options.rotation ?? 0)) % 360,
  });
  const requestedScale = options.scale ?? 1;
  const widthScale = options.maxWidth ? options.maxWidth / baseViewport.width : requestedScale;
  const scale = Math.min(requestedScale, widthScale);
  const deviceScale = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({
    scale: scale * deviceScale,
    rotation: (page.rotate + (options.rotation ?? 0)) % 360,
  });

  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  canvas.style.width = `${Math.round(viewport.width / deviceScale)}px`;
  canvas.style.height = `${Math.round(viewport.height / deviceScale)}px`;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new PdfProcessingError('RENDER_FAILED', '浏览器无法创建页面画布。');
  }

  await page.render({
    canvas,
    canvasContext: context,
    viewport,
  }).promise;
  return page;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new PdfProcessingError('EXPORT_FAILED', '浏览器无法生成图片文件。'));
        }
      },
      mimeType,
      quality,
    );
  });
}

export async function renderPdfPagesToImages(options: {
  bytes: Uint8Array;
  pages: number[];
  format: 'png' | 'jpeg' | 'webp';
  scale: number;
  quality: number;
  signal?: AbortSignal;
  onProgress?: (current: number, total: number) => void;
}): Promise<{ files: GeneratedFile[]; warnings: PdfWarning[] }> {
  const document = await openPdfDocument(options.bytes);
  const files: GeneratedFile[] = [];
  const warnings: PdfWarning[] = [];
  const mimeType =
    options.format === 'png'
      ? 'image/png'
      : options.format === 'webp'
        ? 'image/webp'
        : 'image/jpeg';

  try {
    for (const [index, pageNumber] of options.pages.entries()) {
      if (options.signal?.aborted) {
        throw new DOMException('处理已取消', 'AbortError');
      }

      try {
        const page = await document.getPage(pageNumber);
        const viewport = page.getViewport({ scale: options.scale });
        const maxDimension = 12_000;
        const safeScale = Math.min(
          options.scale,
          maxDimension / Math.max(viewport.width, viewport.height),
        );
        const safeViewport = page.getViewport({ scale: safeScale });
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(safeViewport.width));
        canvas.height = Math.max(1, Math.round(safeViewport.height));
        const context = canvas.getContext('2d', {
          alpha: options.format === 'png' || options.format === 'webp',
        });
        if (!context) {
          throw new Error('无法创建图片画布');
        }

        if (options.format === 'jpeg') {
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
        await page.render({ canvas, canvasContext: context, viewport: safeViewport }).promise;
        const blob = await canvasToBlob(canvas, mimeType, options.quality);
        files.push({
          name: `page-${padPageNumber(pageNumber, document.numPages)}.${options.format === 'jpeg' ? 'jpg' : options.format}`,
          blob,
          size: blob.size,
          mimeType,
        });
        canvas.width = 1;
        canvas.height = 1;
        page.cleanup();
      } catch {
        warnings.push({
          code: 'RENDER_FAILED',
          message: `第 ${pageNumber} 页导出失败，其他页面已继续处理。`,
          pageNumber,
        });
      }
      options.onProgress?.(index + 1, options.pages.length);
    }
  } finally {
    await document.destroyDocument();
  }

  if (files.length === 0) {
    throw new PdfProcessingError('EXPORT_FAILED', '没有成功生成任何图片。');
  }

  return { files, warnings };
}
