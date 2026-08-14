import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';

export type PdfDocumentSource = File | Uint8Array;

export interface PdfDocumentLoadOptions {
  password?: string;
  signal?: AbortSignal;
}

export interface LoadedPdfDocument {
  readonly document: PDFDocumentProxy;
  readonly loadingTask: PDFDocumentLoadingTask;
  readonly sourceSize: number;
  readonly disposed: boolean;
  dispose(): Promise<void>;
}

interface PdfJsModule {
  getDocument(source: {
    data: Uint8Array;
    password?: string;
    isEvalSupported: boolean;
    useWorkerFetch: boolean;
    disableAutoFetch: boolean;
    disableRange: boolean;
    disableStream: boolean;
    wasmUrl?: string;
  }): PDFDocumentLoadingTask;
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  wasmUrl?: string;
}

let pdfJsPromise: Promise<PdfJsModule> | null = null;

function createAbortError(): DOMException {
  return new DOMException('PDF 加载已取消。', 'AbortError');
}

async function getPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsPromise) {
    pdfJsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      import('pdfjs-dist/wasm/jbig2.wasm?url'),
    ]).then(([pdfJs, worker, jbig2Wasm]) => {
      // 使用 Vite 产出的同源 worker 文件，避免 pdf.js 回退到主线程伪 worker。
      pdfJs.GlobalWorkerOptions.workerSrc = worker.default;
      // wasm 目录与 worker 同源：扫描版 PDF 的 JBIG2 图片需要 JBig2 wasm 解码，
      // 默认目录相对 build/ 不存在，缺省会整页图片被忽略而渲染为空白页。
      const wasmUrl = new URL('.', new URL(jbig2Wasm.default, location.href)).href;
      return { ...(pdfJs as unknown as PdfJsModule), wasmUrl };
    });
  }
  return pdfJsPromise;
}

async function readSource(source: PdfDocumentSource, signal?: AbortSignal): Promise<Uint8Array> {
  if (signal?.aborted) {
    throw createAbortError();
  }

  const bytes =
    source instanceof Uint8Array ? source.slice() : new Uint8Array(await source.arrayBuffer());

  if (signal?.aborted) {
    throw createAbortError();
  }
  if (bytes.byteLength === 0) {
    throw new Error('PDF 文件为空。');
  }
  return bytes;
}

class ManagedPdfDocument implements LoadedPdfDocument {
  readonly document: PDFDocumentProxy;
  readonly loadingTask: PDFDocumentLoadingTask;
  readonly sourceSize: number;
  #disposePromise: Promise<void> | null = null;

  constructor(document: PDFDocumentProxy, loadingTask: PDFDocumentLoadingTask, sourceSize: number) {
    this.document = document;
    this.loadingTask = loadingTask;
    this.sourceSize = sourceSize;
  }

  get disposed(): boolean {
    return this.#disposePromise !== null;
  }

  dispose(): Promise<void> {
    if (!this.#disposePromise) {
      this.#disposePromise = (async () => {
        let cleanupError: unknown;
        try {
          await this.document.cleanup();
        } catch (error) {
          cleanupError = error;
        }

        try {
          await this.loadingTask.destroy();
        } catch (error) {
          if (!cleanupError) {
            cleanupError = error;
          }
        }

        if (cleanupError) {
          throw cleanupError;
        }
      })();
    }
    return this.#disposePromise;
  }
}

export async function loadPdfDocument(
  source: PdfDocumentSource,
  options: PdfDocumentLoadOptions = {},
): Promise<LoadedPdfDocument> {
  const bytes = await readSource(source, options.signal);
  const pdfJs = await getPdfJs();
  if (options.signal?.aborted) {
    throw createAbortError();
  }
  const loadingTask = pdfJs.getDocument({
    data: bytes,
    ...(options.password ? { password: options.password } : {}),
    isEvalSupported: false,
    useWorkerFetch: false,
    disableAutoFetch: true,
    disableRange: true,
    disableStream: true,
    wasmUrl: pdfJs.wasmUrl,
  });

  const abort = (): void => {
    void loadingTask.destroy();
  };
  options.signal?.addEventListener('abort', abort, { once: true });

  try {
    const document = await loadingTask.promise;
    if (options.signal?.aborted) {
      await loadingTask.destroy();
      throw createAbortError();
    }
    return new ManagedPdfDocument(document, loadingTask, bytes.byteLength);
  } catch (error) {
    await loadingTask.destroy().catch(() => undefined);
    if (options.signal?.aborted) {
      throw createAbortError();
    }
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', abort);
  }
}

export class PdfDocumentLoader {
  static load(
    source: PdfDocumentSource,
    options: PdfDocumentLoadOptions = {},
  ): Promise<LoadedPdfDocument> {
    return loadPdfDocument(source, options);
  }

  load(
    source: PdfDocumentSource,
    options: PdfDocumentLoadOptions = {},
  ): Promise<LoadedPdfDocument> {
    return loadPdfDocument(source, options);
  }
}
