import type { RenderedPage } from '../types/reader';

export interface PageCacheOptions {
  maxBytes?: number;
  maxEntries?: number;
}

interface CacheEntry {
  page: RenderedPage;
  byteSize: number;
}

interface PageRecord {
  references: number;
  cached: boolean;
}

export interface PageLease {
  readonly page: RenderedPage;
  release(): void;
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
  appearanceRevision = 0,
): string {
  return `${appearanceRevision}:${pageNumber}:${Math.round(targetWidth)}:${quality}`;
}

/** 从缓存键里取回外观版本；键格式由 createPageCacheKey 定义。 */
export function appearanceRevisionFromKey(key: string): number {
  const revision = Number.parseInt(key, 10);
  return Number.isFinite(revision) ? revision : 0;
}

export class PageCache {
  readonly #entries = new Map<string, CacheEntry>();
  readonly #records = new Map<RenderedPage, PageRecord>();
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

  // 触碰缓存项以更新 LRU 顺序而不改变内容。
  touch(key: string): boolean {
    const entry = this.#entries.get(key);
    if (!entry) {
      return false;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return true;
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

  getBest(
    pageNumber: number,
    qualityOrder: readonly RenderedPage['quality'][] = ['reading', 'preview'],
    appearanceRevision?: number,
  ): RenderedPage | undefined {
    for (const quality of qualityOrder) {
      let bestKey: string | null = null;
      let bestWidth = -1;
      for (const [key, entry] of this.#entries) {
        // 外观（主题）变化后旧位图的配色已经失效，必须按版本过滤，
        // 否则换主题会命中上一版像素、看起来像没生效。
        if (
          appearanceRevision !== undefined &&
          appearanceRevisionFromKey(key) !== appearanceRevision
        ) {
          continue;
        }
        if (
          entry.page.pageNumber === pageNumber &&
          entry.page.quality === quality &&
          entry.page.targetWidth > bestWidth
        ) {
          bestKey = key;
          bestWidth = entry.page.targetWidth;
        }
      }
      if (bestKey) return this.get(bestKey);
    }
    return undefined;
  }

  acquire(page: RenderedPage): PageLease {
    let record = this.#records.get(page);
    if (!record) {
      record = { references: 0, cached: false };
      this.#records.set(page, record);
    }
    record.references += 1;
    let released = false;
    return {
      page,
      release: () => {
        if (released) return;
        released = true;
        record.references -= 1;
        if (!record.cached && record.references === 0) this.#dispose(page);
      },
    };
  }

  /** 未进入缓存的渲染结果也通过这里释放，避免误清仍被书面引用的画布。 */
  discard(page: RenderedPage): void {
    this.#retire(page);
  }

  /** 返回是否入缓存；超预算时由调用方继续持有并负责释放。 */
  set(key: string, page: RenderedPage): boolean {
    const existing = this.#entries.get(key);
    if (existing) {
      this.#entries.delete(key);
      this.#byteSize -= existing.byteSize;
      if (existing.page !== page) this.#retire(existing.page);
    }

    const byteSize = pageByteSize(page);
    if (byteSize > this.maxBytes) {
      return false;
    }

    const record = this.#records.get(page) ?? { references: 0, cached: false };
    record.cached = true;
    this.#records.set(page, record);
    this.#entries.set(key, { page, byteSize });
    this.#byteSize += byteSize;
    this.#evictToBudget();
    return this.#entries.has(key);
  }

  delete(key: string): boolean {
    const entry = this.#entries.get(key);
    if (!entry) {
      return false;
    }
    this.#entries.delete(key);
    this.#byteSize -= entry.byteSize;
    this.#retire(entry.page);
    return true;
  }

  clear(): void {
    for (const entry of this.#entries.values()) {
      this.#retire(entry.page);
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

  #retire(page: RenderedPage): void {
    const record = this.#records.get(page);
    if (!record) {
      page.dispose();
      return;
    }
    record.cached = false;
    if (record.references === 0) this.#dispose(page);
  }

  #dispose(page: RenderedPage): void {
    this.#records.delete(page);
    page.dispose();
  }
}
