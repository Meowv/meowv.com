import { builtinDefForEntry, fetchBuiltinFile } from '../builtin/BuiltinShelf';
import type { BookFormat, PublicationMetadata } from '../types/reader';
import type { ReadingProgressV2 } from './ReadingProgress';

export type BookshelfAvailability = 'available' | 'permission-required' | 'missing';

export interface BookshelfEntry {
  id: string;
  format: BookFormat;
  metadata: PublicationMetadata;
  coverThumbnail?: Blob;
  /** 封面缩略图为书名占位图（无法轻量提取封面内容的内置书，如 PDF）；打开书籍后由真实封面替换。 */
  coverThumbnailPlaceholder?: boolean;
  handle?: FileSystemFileHandle;
  availability: BookshelfAvailability;
  progress?: ReadingProgressV2;
  addedAt: number;
  lastOpenedAt: number;
  /** 内置书籍标记（数据来自项目书库目录，无本地文件句柄）。 */
  builtIn?: boolean;
  /** 内置书籍标识，即书库目录中的文件名（不含扩展名）。 */
  builtinSlug?: string;
}

interface RecentBookRecordV1 {
  id: 'last';
  fingerprint: string;
  handle: FileSystemFileHandle;
  updatedAt: number;
}

const DATABASE_NAME = 'meowv-studio-books-v1';
const DATABASE_VERSION = 2;
const STORE_NAME = 'bookshelf';
const RECENT_STORE_NAME = 'recent-books';
const sessionEntries = new Map<string, BookshelfEntry>();
const sessionFiles = new Map<string, File>();

function requestResult<T>(request: IDBRequest<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(message));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('当前浏览器不支持 IndexedDB。'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const transaction = request.transaction;
      const bookshelf = database.objectStoreNames.contains(STORE_NAME)
        ? transaction?.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      if (!bookshelf || !database.objectStoreNames.contains(RECENT_STORE_NAME) || !transaction) {
        return;
      }
      const recentRequest = transaction.objectStore(RECENT_STORE_NAME).get('last');
      recentRequest.onsuccess = () => {
        const recent = recentRequest.result as RecentBookRecordV1 | undefined;
        if (!recent?.fingerprint || !recent.handle) return;
        bookshelf.put({
          id: recent.fingerprint,
          format: 'pdf',
          metadata: { title: '最近阅读的 PDF', authors: [] },
          handle: recent.handle,
          availability: 'available',
          addedAt: recent.updatedAt,
          lastOpenedAt: recent.updatedAt,
        } satisfies BookshelfEntry);
      };
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开本地书架。'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, mode);
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('书架事务已中止。'));
      transaction.onerror = () => reject(transaction.error ?? new Error('书架事务失败。'));
    });
    const result = await requestResult(
      operation(transaction.objectStore(STORE_NAME)),
      '书架操作失败。',
    );
    await completed;
    return result;
  } finally {
    database.close();
  }
}

function cloneEntry(entry: BookshelfEntry): BookshelfEntry {
  return {
    ...entry,
    metadata: { ...entry.metadata, authors: [...entry.metadata.authors] },
    ...(entry.progress
      ? { progress: { ...entry.progress, locator: { ...entry.progress.locator } } }
      : {}),
  };
}

function runtimeAvailability(entry: BookshelfEntry): BookshelfEntry {
  if (entry.builtIn || entry.handle || sessionFiles.has(entry.id)) return entry;
  return { ...entry, availability: 'missing' };
}

export class BookshelfRepository {
  readonly persistent: boolean;
  persistentHandles: boolean;

  constructor() {
    this.persistent = 'indexedDB' in globalThis;
    this.persistentHandles = this.persistent && 'showOpenFilePicker' in globalThis;
  }

  async list(): Promise<BookshelfEntry[]> {
    if (!this.persistent) return [...sessionEntries.values()].map(cloneEntry);
    try {
      const stored = await withStore('readonly', (store) => store.getAll());
      const entries = stored as BookshelfEntry[];
      for (const entry of sessionEntries.values()) {
        const index = entries.findIndex((candidate) => candidate.id === entry.id);
        if (index >= 0) entries[index] = entry;
        else entries.push(entry);
      }
      return entries.map(runtimeAvailability).map(cloneEntry);
    } catch {
      return [...sessionEntries.values()].map(cloneEntry);
    }
  }

  async get(id: string): Promise<BookshelfEntry | null> {
    const session = sessionEntries.get(id);
    if (session) return cloneEntry(session);
    if (!this.persistent) return null;
    try {
      const entry = (await withStore('readonly', (store) => store.get(id))) as
        BookshelfEntry | undefined;
      return entry ? cloneEntry(entry) : null;
    } catch {
      return null;
    }
  }

  async upsert(entry: BookshelfEntry): Promise<void> {
    const normalized = cloneEntry(entry);
    sessionEntries.set(entry.id, normalized);
    // 内置书籍没有本地句柄，仍需写入 IndexedDB，刷新后保留进度与封面。
    const shouldPersist =
      entry.builtIn || (this.persistent && this.persistentHandles && !!entry.handle);
    if (!shouldPersist) return;
    try {
      await withStore('readwrite', (store) => store.put(normalized));
    } catch (error) {
      if (entry.handle && error instanceof DOMException && error.name === 'DataCloneError') {
        this.persistentHandles = false;
      }
      // IndexedDB 或句柄结构化克隆不可用时，当前会话书架仍然有效。
    }
  }

  async relink(id: string, handle: FileSystemFileHandle): Promise<void> {
    const entry = await this.get(id);
    if (!entry) throw new Error('书架中找不到这本书。');
    await this.upsert({ ...entry, handle, availability: 'available', lastOpenedAt: Date.now() });
  }

  async remove(id: string, options: { removeProgress?: boolean } = {}): Promise<void> {
    sessionEntries.delete(id);
    if (this.persistent) {
      await withStore('readwrite', (store) => store.delete(id)).catch(() => undefined);
    }
    if (options.removeProgress) {
      const { removeReadingProgress } = await import('./ReadingProgress');
      removeReadingProgress(id);
    }
  }
}

export async function resolveBookshelfFile(
  entry: BookshelfEntry,
  requestPermission = false,
): Promise<File | null> {
  if (entry.builtIn && entry.builtinSlug) {
    const slug = entry.builtinSlug;
    return fetchBuiltinFile(builtinDefForEntry({ builtinSlug: slug, format: entry.format })).catch(
      () => null,
    );
  }
  const sessionFile = sessionFiles.get(entry.id);
  if (sessionFile) return sessionFile;
  if (!entry.handle) return null;
  try {
    let permission = await entry.handle.queryPermission({ mode: 'read' });
    if (permission === 'prompt' && requestPermission) {
      permission = await entry.handle.requestPermission({ mode: 'read' });
    }
    if (permission !== 'granted') return null;
    return await entry.handle.getFile();
  } catch {
    return null;
  }
}

export function rememberBookshelfSessionFile(id: string, file: File): void {
  sessionFiles.set(id, file);
}
