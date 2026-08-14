import { BlobReader, BlobWriter, ZipReader, type Entry, type FileEntry } from '@zip.js/zip.js';
import type {
  BookLocator,
  PageProvider,
  PageRenderOptions,
  PageSize,
  Publication,
  PublicationMetadata,
  PublicationPaginateOptions,
  ReaderLayoutProfile,
  RenderedPage,
} from '../../types/reader';
import {
  applyPageFinish,
  assertNotAborted,
  createRenderedPage,
  disposeCanvas,
} from '../rendered-page';
import { compareBookFilenames } from './natural-sort';

// SVG 可以引用远程资源；漫画页只接受浏览器可安全解码的位图。
const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i;

function mimeForName(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase();
  return (
    {
      avif: 'image/avif',
      bmp: 'image/bmp',
      gif: 'image/gif',
      jpeg: 'image/jpeg',
      jpg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    }[extension ?? ''] ?? 'application/octet-stream'
  );
}

function imageEntries(entries: Entry[]): FileEntry[] {
  return entries
    .filter((entry): entry is FileEntry => !entry.directory && IMAGE_EXTENSION.test(entry.filename))
    .sort((left, right) => compareBookFilenames(left.filename, right.filename));
}

async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('当前浏览器无法解码漫画图片。');
  }
  return createImageBitmap(blob);
}

class CbzPageProvider implements PageProvider {
  readonly #reader: ZipReader<Blob>;
  readonly #entries: FileEntry[];
  readonly #cover: Blob;
  #pageSize: PageSize | null = null;
  #disposed = false;

  constructor(reader: ZipReader<Blob>, entries: FileEntry[], cover: Blob) {
    this.#reader = reader;
    this.#entries = entries;
    this.#cover = cover;
  }

  get pageCount(): number {
    return this.#entries.length;
  }

  #assertPage(pageNumber: number): void {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > this.pageCount) {
      throw new RangeError(`pageNumber 必须在 1 到 ${this.pageCount} 之间。`);
    }
  }

  async #blob(pageNumber: number, signal?: AbortSignal): Promise<Blob> {
    this.#assertPage(pageNumber);
    if (pageNumber === 1) return this.#cover;
    if (this.#disposed) throw new Error('CBZ 页面提供器已释放。');
    const entry = this.#entries[pageNumber - 1];
    return entry.getData(new BlobWriter(mimeForName(entry.filename)), { signal });
  }

  async getPageSize(pageNumber: number): Promise<PageSize> {
    this.#assertPage(pageNumber);
    if (this.#pageSize) return this.#pageSize;
    const bitmap = await loadBitmap(await this.#blob(1));
    try {
      const aspect = Math.min(1.65, Math.max(0.38, bitmap.width / bitmap.height));
      this.#pageSize = { width: Math.round(1000 * aspect), height: 1000 };
      return this.#pageSize;
    } finally {
      bitmap.close();
    }
  }

  locatorForPage(pageNumber: number): BookLocator {
    this.#assertPage(pageNumber);
    return { kind: 'fixed', pageNumber };
  }

  pageForLocator(locator: BookLocator): number {
    if (locator.kind !== 'fixed') return 1;
    return Math.min(this.pageCount, Math.max(1, Math.trunc(locator.pageNumber)));
  }

  async renderPage(pageNumber: number, options: PageRenderOptions): Promise<RenderedPage> {
    assertNotAborted(options.signal);
    this.#assertPage(pageNumber);
    const [blob, pageSize] = await Promise.all([
      this.#blob(pageNumber, options.signal),
      this.getPageSize(1),
    ]);
    assertNotAborted(options.signal);
    const bitmap = await loadBitmap(blob);
    const canvas = document.createElement('canvas');
    const targetWidth = Math.max(1, Math.round(options.targetWidth));
    canvas.width = targetWidth;
    canvas.height = Math.max(1, Math.round(targetWidth * (pageSize.height / pageSize.width)));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      bitmap.close();
      disposeCanvas(canvas);
      throw new Error('浏览器无法创建漫画页面画布。');
    }
    context.fillStyle = '#fffdf8';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = options.quality === 'reading' ? 'high' : 'medium';
    context.drawImage(
      bitmap,
      (canvas.width - width) / 2,
      (canvas.height - height) / 2,
      width,
      height,
    );
    applyPageFinish(canvas);
    bitmap.close();
    if (options.signal?.aborted) {
      disposeCanvas(canvas);
      throw new DOMException('漫画页面渲染已取消。', 'AbortError');
    }
    return createRenderedPage(pageNumber, canvas, options);
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    await this.#reader.close().catch(() => undefined);
  }
}

export class CbzPublication implements Publication {
  readonly format = 'cbz' as const;
  readonly layout = 'fixed' as const;
  readonly metadata: PublicationMetadata;
  readonly toc = [];
  readonly cover: Blob;
  readonly #reader: ZipReader<Blob>;
  readonly #entries: FileEntry[];
  #provider: CbzPageProvider | null = null;
  #disposed = false;

  private constructor(file: File, reader: ZipReader<Blob>, entries: FileEntry[], cover: Blob) {
    this.metadata = { title: file.name.replace(/\.cbz$/i, ''), authors: [] };
    this.#reader = reader;
    this.#entries = entries;
    this.cover = cover;
  }

  static async open(file: File, signal?: AbortSignal): Promise<CbzPublication> {
    assertNotAborted(signal);
    const reader = new ZipReader(new BlobReader(file), { useWebWorkers: true });
    try {
      const entries = imageEntries(await reader.getEntries());
      assertNotAborted(signal);
      if (!entries.length) throw new Error('CBZ 中没有可阅读的图片。');
      const cover = await entries[0].getData(new BlobWriter(mimeForName(entries[0].filename)), {
        signal,
      });
      assertNotAborted(signal);
      return new CbzPublication(file, reader, entries, cover);
    } catch (error) {
      await reader.close().catch(() => undefined);
      throw error;
    }
  }

  async paginate(
    _profile: ReaderLayoutProfile,
    options: PublicationPaginateOptions = {},
  ): Promise<PageProvider> {
    assertNotAborted(options.signal);
    if (this.#disposed) throw new Error('CBZ 出版物已释放。');
    options.onProgress?.({ stage: 'cover', value: 0.82, message: '正在准备封面…' });
    if (!this.#provider) {
      this.#provider = new CbzPageProvider(this.#reader, this.#entries, this.cover);
    }
    return this.#provider;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#provider) await this.#provider.dispose();
    else await this.#reader.close().catch(() => undefined);
  }
}
