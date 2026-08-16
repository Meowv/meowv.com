import {
  BlobReader,
  BlobWriter,
  TextWriter,
  ZipReader,
  type Entry,
  type FileEntry,
} from '@zip.js/zip.js';
import { unzlibSync } from 'fflate';
import { EPUB, type EpubArchiveLoader } from 'foliate-js/epub.js';
import { makeFB2 } from 'foliate-js/fb2.js';
import { MOBI } from 'foliate-js/mobi.js';
import type {
  BookFormat,
  BookLayoutKind,
  BookLocator,
  PageProvider,
  Publication,
  PublicationMetadata,
  PublicationPaginateOptions,
  ReaderLayoutProfile,
  TocItem,
} from '../../types/reader';
import { assertNotAborted } from '../rendered-page';
import { HtmlPageProvider, type HtmlBookSection } from '../html/HtmlPageProvider';

interface OpenFoliateOptions {
  format: Extract<BookFormat, 'epub' | 'mobi' | 'azw3' | 'fb2'>;
  signal?: AbortSignal;
}

interface FoliateArchive extends EpubArchiveLoader {
  close(): Promise<void>;
}

function isFileEntry(entry: Entry): entry is FileEntry {
  return !entry.directory;
}

async function createArchive(file: File, signal?: AbortSignal): Promise<FoliateArchive> {
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: true });
  try {
    const entries = await reader.getEntries();
    assertNotAborted(signal);
    const files = new Map(entries.filter(isFileEntry).map((entry) => [entry.filename, entry]));
    const lookup = (name: string): FileEntry | undefined => {
      const normalized = name.replace(/^\.\//, '');
      try {
        return files.get(normalized) ?? files.get(decodeURI(normalized));
      } catch {
        return files.get(normalized);
      }
    };
    return {
      async loadText(name) {
        const entry = lookup(name);
        return entry ? entry.getData(new TextWriter()) : null;
      },
      async loadBlob(name, type) {
        const entry = lookup(name);
        return entry ? entry.getData(new BlobWriter(type)) : null;
      },
      getSize(name) {
        return lookup(name)?.uncompressedSize ?? 0;
      },
      async sha1(value) {
        const source = Uint8Array.from(value).buffer;
        return new Uint8Array(await crypto.subtle.digest('SHA-1', source));
      },
      async close() {
        await reader.close().catch(() => undefined);
      },
    };
  } catch (error) {
    await reader.close().catch(() => undefined);
    throw error;
  }
}

function contributorName(value: string | FoliateContributor): string {
  if (typeof value === 'string') return value.trim();
  return value.name?.trim() ?? '';
}

function normalizeAuthors(value: FoliateMetadata['author']): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map(contributorName).filter(Boolean);
}

function metadataFor(file: File, book: FoliateBook): PublicationMetadata {
  const fallbackTitle = file.name.replace(/\.(?:epub|mobi|azw3|fb2)$/i, '');
  const title = typeof book.metadata?.title === 'string' ? book.metadata.title.trim() : '';
  return {
    title: title || fallbackTitle,
    authors: normalizeAuthors(book.metadata?.author),
    ...(book.metadata?.language ? { language: book.metadata.language } : {}),
    ...(book.metadata?.description ? { description: book.metadata.description } : {}),
  };
}

function locatorForHref(book: FoliateBook, href: string | undefined): BookLocator {
  if (!href) return { kind: 'reflowable', sectionIndex: 0, progression: 0 };
  try {
    const resolved = book.resolveHref?.(href);
    return {
      kind: 'reflowable',
      sectionIndex: Math.max(0, resolved?.index ?? 0),
      progression: 0,
      ...(book.sections[resolved?.index ?? 0]?.cfi
        ? { cfi: book.sections[resolved?.index ?? 0].cfi }
        : {}),
    };
  } catch {
    return { kind: 'reflowable', sectionIndex: 0, progression: 0 };
  }
}

function normalizeToc(book: FoliateBook, items: FoliateTocItem[] | undefined): TocItem[] {
  if (!items) return [];
  return items
    .map((item) => {
      const children = normalizeToc(book, item.subitems ?? item.children);
      return {
        label: item.label?.trim() || '未命名章节',
        locator: locatorForHref(book, item.href),
        ...(children.length ? { children } : {}),
      };
    })
    .filter((item) => item.label);
}

function readableSections(book: FoliateBook): HtmlBookSection[] {
  return book.sections.map((section) => ({
    ...(section.id == null ? {} : { id: String(section.id) }),
    ...(section.cfi ? { cfi: section.cfi } : {}),
    // FB2 的 load 直接返回字符串 URL，统一包装为 Promise，避免调用方依赖返回类型。
    load: () => Promise.resolve(section.load()),
    ...(section.unload ? { unload: () => section.unload?.() } : {}),
  }));
}

export class FoliatePublication implements Publication {
  readonly format: OpenFoliateOptions['format'];
  readonly layout: BookLayoutKind;
  readonly metadata: PublicationMetadata;
  readonly toc: TocItem[];
  readonly cover: Blob | null;
  readonly #book: FoliateBook;
  readonly #archive: FoliateArchive | null;
  #providers = new Set<PageProvider>();
  #disposed = false;

  private constructor(
    file: File,
    format: OpenFoliateOptions['format'],
    book: FoliateBook,
    cover: Blob | null,
    archive: FoliateArchive | null,
  ) {
    this.format = format;
    this.#book = book;
    this.#archive = archive;
    this.layout = book.rendition?.layout === 'pre-paginated' ? 'fixed' : 'reflowable';
    this.metadata = metadataFor(file, book);
    this.toc = normalizeToc(book, book.toc);
    this.cover = cover;
  }

  static async open(file: File, options: OpenFoliateOptions): Promise<FoliatePublication> {
    assertNotAborted(options.signal);
    let archive: FoliateArchive | null = null;
    let book: FoliateBook | null = null;
    try {
      if (options.format === 'epub') {
        archive = await createArchive(file, options.signal);
        book = await new EPUB(archive).init();
      } else if (options.format === 'fb2') {
        book = await makeFB2(file);
      } else {
        book = await new MOBI({ unzlib: unzlibSync }).open(file);
      }
      assertNotAborted(options.signal);
      const cover = (await book.getCover?.()) ?? null;
      assertNotAborted(options.signal);
      return new FoliatePublication(file, options.format, book, cover, archive);
    } catch (error) {
      book?.destroy?.();
      await archive?.close().catch(() => undefined);
      throw error;
    }
  }

  async paginate(
    profile: ReaderLayoutProfile,
    options: PublicationPaginateOptions = {},
  ): Promise<PageProvider> {
    assertNotAborted(options.signal);
    if (this.#disposed) throw new Error('电子书出版物已释放。');
    const provider = await HtmlPageProvider.create({
      sections: readableSections(this.#book),
      profile,
      fixedLayout: this.layout === 'fixed',
      paginateOptions: options,
    });
    this.#providers.add(provider);
    options.onProgress?.({ stage: 'cover', value: 0.82, message: '正在准备封面…' });
    return provider;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    await Promise.all([...this.#providers].map((provider) => provider.dispose()));
    this.#providers.clear();
    this.#book.destroy?.();
    await this.#archive?.close();
  }
}
