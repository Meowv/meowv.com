import type { RenderedPage } from '../types/reader';

export interface PageCacheOptions {
  maxBytes?: number;
  maxEntries?: number;
}

interface CacheEntry {
  page: RenderedPage;
  byteSize: number;
}

export const DEFAULT_PAGE_CACHE_BYTES = 96 * 1024 * 1024;

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new RangeError(`${name} 必须是正整数。`);
  }
  return resolved;
}

function pageByteSize(page: RenderedPage): number {
  const estimated = page.canvas.width * page.canvas.height * 4;
  return Math.max(0, Number.isFinite(page.byteSize) ? Math.round(page.byteSize) : estimated);
}

export function createPageCacheKey(
  pageNumber: number,
  targetWidth: number,
  quality: RenderedPage['quality'],
): string {
  return `${pageNumber}:${Math.round(targetWidth)}:${quality}`;
}

export class PageCache {
  readonly #entries = new Map<string, CacheEntry>();
  readonly maxBytes: number;
  readonly maxEntries: number;
  #byteSize = 0;

  constructor(options: PageCacheOptions = {}) {
    this.maxBytes = positiveInteger(options.maxBytes, DEFAULT_PAGE_CACHE_BYTES, 'maxBytes');
    this.maxEntries = positiveInteger(options.maxEntries, Number.MAX_SAFE_INTEGER, 'maxEntries');
  }

  get size(): number {
    return this.#entries.size;
  }

  get byteSize(): number {
    return this.#byteSize;
  }

  has(key: string): boolean {
    return this.#entries.has(key);
  }

  get(key: string): RenderedPage | undefined {
    const entry = this.#entries.get(key);
    if (!entry) {
      return undefined;
    }

    // Map 的迭代顺序即 LRU 顺序；命中后移到队尾。
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.page;
  }

  set(key: string, page: RenderedPage): void {
    const existing = this.#entries.get(key);
    if (existing) {
      this.#entries.delete(key);
      this.#byteSize -= existing.byteSize;
      if (existing.page !== page) {
        existing.page.dispose();
      }
    }

    const byteSize = pageByteSize(page);
    if (byteSize > this.maxBytes) {
      page.dispose();
      return;
    }

    this.#entries.set(key, { page, byteSize });
    this.#byteSize += byteSize;
    this.#evictToBudget();
  }

  delete(key: string): boolean {
    const entry = this.#entries.get(key);
    if (!entry) {
      return false;
    }
    this.#entries.delete(key);
    this.#byteSize -= entry.byteSize;
    entry.page.dispose();
    return true;
  }

  clear(): void {
    for (const entry of this.#entries.values()) {
      entry.page.dispose();
    }
    this.#entries.clear();
    this.#byteSize = 0;
  }

  #evictToBudget(): void {
    while (this.#entries.size > this.maxEntries || this.#byteSize > this.maxBytes) {
      const oldestKey = this.#entries.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.delete(oldestKey);
    }
  }
}
