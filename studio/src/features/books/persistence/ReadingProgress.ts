import type { BookFormat, BookLocator } from '../types/reader';

const STORAGE_KEY_PREFIX_V1 = 'meowv-studio:books:progress:v1:';
const STORAGE_KEY_PREFIX_V2 = 'meowv-studio:books:progress:v2:';
const MAX_UPDATED_AT = 8_640_000_000_000_000;

export interface ReadingProgressV2 {
  version: 2;
  format: BookFormat;
  locator: BookLocator;
  fallbackProgress: number;
  layoutKey: string;
  updatedAt: number;
}

interface ReadingProgressV1 {
  spreadIndex: number;
  updatedAt: number;
}

export interface ReadingProgressStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getDefaultStore(): ReadingProgressStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function normalizedFingerprint(fingerprint: string): string {
  const normalized = fingerprint.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new TypeError('fingerprint 必须是 64 位 SHA-256 十六进制字符串。');
  }
  return normalized;
}

function isLocator(value: unknown): value is BookLocator {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === 'fixed') {
    return Number.isInteger(candidate.pageNumber) && (candidate.pageNumber as number) >= 1;
  }
  return (
    candidate.kind === 'reflowable' &&
    Number.isInteger(candidate.sectionIndex) &&
    (candidate.sectionIndex as number) >= 0 &&
    typeof candidate.progression === 'number' &&
    candidate.progression >= 0 &&
    candidate.progression <= 1 &&
    (candidate.cfi === undefined || typeof candidate.cfi === 'string')
  );
}

function isProgressV2(value: unknown): value is ReadingProgressV2 {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 2 &&
    typeof candidate.format === 'string' &&
    ['pdf', 'epub', 'txt', 'mobi', 'azw3', 'fb2', 'cbz'].includes(candidate.format) &&
    isLocator(candidate.locator) &&
    typeof candidate.fallbackProgress === 'number' &&
    candidate.fallbackProgress >= 0 &&
    candidate.fallbackProgress <= 1 &&
    typeof candidate.layoutKey === 'string' &&
    Number.isFinite(candidate.updatedAt) &&
    (candidate.updatedAt as number) >= 0 &&
    (candidate.updatedAt as number) <= MAX_UPDATED_AT
  );
}

function isProgressV1(value: unknown): value is ReadingProgressV1 {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Number.isInteger(candidate.spreadIndex) &&
    (candidate.spreadIndex as number) >= 0 &&
    Number.isFinite(candidate.updatedAt) &&
    (candidate.updatedAt as number) >= 0
  );
}

export class ReadingProgress {
  readonly #store: ReadingProgressStore | null;

  constructor(store: ReadingProgressStore | null = getDefaultStore()) {
    this.#store = store;
  }

  load(fingerprint: string): ReadingProgressV2 | null {
    if (!this.#store) return null;
    const normalized = normalizedFingerprint(fingerprint);
    try {
      const current = this.#store.getItem(`${STORAGE_KEY_PREFIX_V2}${normalized}`);
      if (current) {
        const parsed: unknown = JSON.parse(current);
        if (isProgressV2(parsed)) return parsed;
      }
      const legacy = this.#store.getItem(`${STORAGE_KEY_PREFIX_V1}${normalized}`);
      if (!legacy) return null;
      const parsed: unknown = JSON.parse(legacy);
      if (!isProgressV1(parsed)) return null;
      const migrated: ReadingProgressV2 = {
        version: 2,
        format: 'pdf',
        locator: {
          kind: 'fixed',
          pageNumber: parsed.spreadIndex === 0 ? 1 : parsed.spreadIndex * 2,
        },
        fallbackProgress: 0,
        layoutKey: 'fixed',
        updatedAt: parsed.updatedAt,
      };
      this.#store.setItem(`${STORAGE_KEY_PREFIX_V2}${normalized}`, JSON.stringify(migrated));
      return migrated;
    } catch {
      return null;
    }
  }

  save(
    fingerprint: string,
    progress: Omit<ReadingProgressV2, 'version' | 'updatedAt'>,
  ): ReadingProgressV2 {
    const normalized = normalizedFingerprint(fingerprint);
    const record: ReadingProgressV2 = { ...progress, version: 2, updatedAt: Date.now() };
    if (!isProgressV2(record)) throw new TypeError('阅读进度数据无效。');
    this.#store?.setItem(`${STORAGE_KEY_PREFIX_V2}${normalized}`, JSON.stringify(record));
    return record;
  }

  remove(fingerprint: string): void {
    const normalized = normalizedFingerprint(fingerprint);
    this.#store?.removeItem(`${STORAGE_KEY_PREFIX_V1}${normalized}`);
    this.#store?.removeItem(`${STORAGE_KEY_PREFIX_V2}${normalized}`);
  }
}

const defaultReadingProgress = new ReadingProgress();

export function loadReadingProgress(fingerprint: string): ReadingProgressV2 | null {
  return defaultReadingProgress.load(fingerprint);
}

export function saveReadingProgress(
  fingerprint: string,
  progress: Omit<ReadingProgressV2, 'version' | 'updatedAt'>,
): ReadingProgressV2 {
  return defaultReadingProgress.save(fingerprint, progress);
}

export function removeReadingProgress(fingerprint: string): void {
  defaultReadingProgress.remove(fingerprint);
}
