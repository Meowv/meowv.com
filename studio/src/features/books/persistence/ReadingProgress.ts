const STORAGE_KEY_PREFIX = 'meowv-studio:books:progress:v1:';
const MAX_UPDATED_AT = 8_640_000_000_000_000;

export interface ReadingProgressRecord {
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

function storageKey(fingerprint: string): string {
  const normalized = fingerprint.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new TypeError('fingerprint 必须是 64 位 SHA-256 十六进制字符串。');
  }
  return `${STORAGE_KEY_PREFIX}${normalized}`;
}

function isProgressRecord(value: unknown): value is ReadingProgressRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    Object.keys(candidate).every((key) => key === 'spreadIndex' || key === 'updatedAt') &&
    Number.isInteger(candidate.spreadIndex) &&
    (candidate.spreadIndex as number) >= 0 &&
    Number.isFinite(candidate.updatedAt) &&
    (candidate.updatedAt as number) >= 0 &&
    (candidate.updatedAt as number) <= MAX_UPDATED_AT
  );
}

export class ReadingProgress {
  readonly #store: ReadingProgressStore | null;

  constructor(store: ReadingProgressStore | null = getDefaultStore()) {
    this.#store = store;
  }

  load(fingerprint: string): ReadingProgressRecord | null {
    if (!this.#store) {
      return null;
    }

    try {
      const raw = this.#store.getItem(storageKey(fingerprint));
      if (!raw) {
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      return isProgressRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  save(fingerprint: string, spreadIndex: number): ReadingProgressRecord {
    if (!Number.isInteger(spreadIndex) || spreadIndex < 0) {
      throw new RangeError('spreadIndex 必须是非负整数。');
    }

    const progress = { spreadIndex, updatedAt: Date.now() } satisfies ReadingProgressRecord;
    this.#store?.setItem(storageKey(fingerprint), JSON.stringify(progress));
    return progress;
  }

  remove(fingerprint: string): void {
    this.#store?.removeItem(storageKey(fingerprint));
  }
}

const defaultReadingProgress = new ReadingProgress();

export function loadReadingProgress(fingerprint: string): ReadingProgressRecord | null {
  return defaultReadingProgress.load(fingerprint);
}

export function saveReadingProgress(
  fingerprint: string,
  spreadIndex: number,
): ReadingProgressRecord {
  return defaultReadingProgress.save(fingerprint, spreadIndex);
}

export function removeReadingProgress(fingerprint: string): void {
  defaultReadingProgress.remove(fingerprint);
}
