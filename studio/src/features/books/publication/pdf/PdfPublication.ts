import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import type {
  BookLocator,
  Publication,
  PublicationMetadata,
  PublicationPaginateOptions,
  ReaderLayoutProfile,
  TocItem,
} from '../../types/reader';
import { assertNotAborted } from '../rendered-page';
import {
  loadPdfDocument,
  type LoadedPdfDocument,
  type PdfDocumentLoadOptions,
} from './PdfDocumentLoader';
import { PdfPageProvider } from './PdfPageProvider';
import { cleanPdfMetadataText } from './pdf-metadata';

function authorNames(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return cleanPdfMetadataText(value)
    .split(/[,;、，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function destinationPageNumber(document: PDFDocumentProxy, destination: unknown): Promise<number> {
  if (!Array.isArray(destination) || destination.length === 0) return Promise.resolve(1);
  const reference = destination[0];
  if (typeof reference === 'number') return Promise.resolve(reference + 1);
  return document
    .getPageIndex(reference)
    .then((index) => index + 1)
    .catch(() => 1);
}

async function normalizeOutline(
  document: PDFDocumentProxy,
  outline: Awaited<ReturnType<PDFDocumentProxy['getOutline']>> | null,
): Promise<TocItem[]> {
  if (!outline) return [];
  return Promise.all(
    outline.map(async (item) => {
      const destination =
        typeof item.dest === 'string' ? await document.getDestination(item.dest) : item.dest;
      const pageNumber = await destinationPageNumber(document, destination);
      const locator: BookLocator = { kind: 'fixed', pageNumber };
      const children = await normalizeOutline(document, item.items);
      return {
        label: cleanPdfMetadataText(item.title) || `第 ${pageNumber} 页`,
        locator,
        ...(children.length ? { children } : {}),
      };
    }),
  );
}

export class PdfPublication implements Publication {
  readonly format = 'pdf' as const;
  readonly layout = 'fixed' as const;
  readonly metadata: PublicationMetadata;
  readonly toc: TocItem[];
  readonly cover: Blob | null = null;
  readonly #loaded: LoadedPdfDocument;
  #provider: PdfPageProvider | null = null;
  #disposed = false;

  private constructor(loaded: LoadedPdfDocument, metadata: PublicationMetadata, toc: TocItem[]) {
    this.#loaded = loaded;
    this.metadata = metadata;
    this.toc = toc;
  }

  static async open(file: File, options: PdfDocumentLoadOptions = {}): Promise<PdfPublication> {
    const loaded = await loadPdfDocument(file, options);
    try {
      const [rawMetadata, outline] = await Promise.all([
        loaded.document.getMetadata().catch(() => null),
        loaded.document.getOutline().catch(() => null),
      ]);
      assertNotAborted(options.signal);
      const info = rawMetadata?.info as Record<string, unknown> | undefined;
      const title = cleanPdfMetadataText(info?.Title) || file.name.replace(/\.pdf$/i, '');
      const metadata: PublicationMetadata = {
        title,
        authors: authorNames(info?.Author),
        ...(typeof info?.Language === 'string' ? { language: info.Language } : {}),
      };
      return new PdfPublication(loaded, metadata, await normalizeOutline(loaded.document, outline));
    } catch (error) {
      await loaded.dispose().catch(() => undefined);
      throw error;
    }
  }

  async paginate(
    _profile: ReaderLayoutProfile,
    options: PublicationPaginateOptions = {},
  ): Promise<PdfPageProvider> {
    assertNotAborted(options.signal);
    if (this.#disposed) throw new Error('PDF 出版物已释放。');
    if (!this.#provider) this.#provider = new PdfPageProvider(this.#loaded);
    options.onProgress?.({ stage: 'cover', value: 0.8, message: '正在准备封面…' });
    return this.#provider;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    const provider = this.#provider;
    this.#provider = null;
    if (provider) await provider.dispose();
    else await this.#loaded.dispose();
  }
}
