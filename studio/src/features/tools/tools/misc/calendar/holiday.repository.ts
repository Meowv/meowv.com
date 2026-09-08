import {
  MAX_HOLIDAY_BYTES,
  SOURCE_URLS,
  mergeHolidaySnapshots,
  parseBackupHolidays,
  parsePrimaryHolidays,
  restoreHolidaySnapshot,
} from './holiday.service';
import type { HolidayRepositoryState, HolidaySnapshot, HolidaySourceId } from './types';

export { resolveHolidayData } from './holiday.service';

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_PREFIX = 'meowv-studio:calendar-cache:v1:';
const REQUEST_TIMEOUT_MS = 8000;
const RETRY_INTERVAL_MS = 60_000;
const SOURCES: HolidaySourceId[] = ['lanceliao', 'muhac'];

interface HolidayRepositoryOptions {
  onChange?: (state: HolidayRepositoryState) => void;
  fetcher?: typeof fetch;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  now?: () => number;
}

function localStorageOrNull(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

async function readBoundedResponse(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`日历请求失败（HTTP ${response.status}）`);
  }
  if (Number(response.headers.get('content-length')) > MAX_HOLIDAY_BYTES) {
    await response.body?.cancel();
    throw new Error('日历响应超过大小限制');
  }
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > MAX_HOLIDAY_BYTES) throw new Error('日历响应过大');
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_HOLIDAY_BYTES) {
        await reader.cancel();
        throw new Error('日历响应超过大小限制');
      }
      text += decoder.decode(value, { stream: true });
    }
    if (signal.aborted) throw new Error('日历请求已取消');
    return text + decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

export function createHolidayRepository(options: HolidayRepositoryOptions = {}) {
  const now = options.now ?? Date.now;
  const storage = options.storage === undefined ? localStorageOrNull() : options.storage;
  const fetcher =
    options.fetcher ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const snapshots = new Map<HolidaySourceId, HolidaySnapshot>();
  const attempts = new Map<HolidaySourceId, number>();
  const errors: HolidayRepositoryState['errors'] = {};
  const controllers = new Set<AbortController>();
  let active: Promise<void> | undefined;
  let loading = false;
  let disposed = false;

  for (const source of SOURCES) {
    try {
      const raw = storage?.getItem(`${CACHE_PREFIX}${source}`);
      if (!raw || raw.length > MAX_HOLIDAY_BYTES) continue;
      const cached: unknown = JSON.parse(raw);
      if (
        !cached ||
        typeof cached !== 'object' ||
        !('version' in cached) ||
        cached.version !== 1 ||
        !('snapshot' in cached)
      )
        continue;
      const snapshot = restoreHolidaySnapshot(cached.snapshot, source);
      if (snapshot.fetchedAt <= now()) snapshots.set(source, snapshot);
    } catch {
      continue;
    }
  }

  function getState(): HolidayRepositoryState {
    return {
      snapshots: SOURCES.flatMap((source) => {
        const snapshot = snapshots.get(source);
        return snapshot ? [structuredClone(snapshot)] : [];
      }),
      loading,
      errors: { ...errors },
    };
  }

  function notify(): void {
    if (disposed) return;
    options.onChange?.(getState());
  }

  async function request(url: string): Promise<string> {
    const controller = new AbortController();
    controllers.add(controller);
    let timedOut = false;
    let rejectAbort: () => void = () => undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () =>
        reject(new Error(timedOut ? '日历请求超时，请稍后重试' : '日历请求已取消'));
      controller.signal.addEventListener('abort', rejectAbort, { once: true });
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    try {
      const response = Promise.resolve().then(async () => {
        if (controller.signal.aborted) throw new Error('日历请求已取消');
        const result = await fetcher(url, {
          method: 'GET',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          cache: 'no-cache',
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          await result.body?.cancel();
          throw new Error('日历请求已取消');
        }
        return readBoundedResponse(result, controller.signal);
      });
      return await Promise.race([response, aborted]);
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener('abort', rejectAbort);
      controllers.delete(controller);
    }
  }

  function save(snapshot: HolidaySnapshot): void {
    if (disposed) return;
    const merged = mergeHolidaySnapshots(snapshots.get(snapshot.source), snapshot);
    snapshots.set(snapshot.source, merged);
    try {
      const serialized = JSON.stringify({ version: 1, snapshot: merged });
      if (new TextEncoder().encode(serialized).length <= MAX_HOLIDAY_BYTES) {
        storage?.setItem(`${CACHE_PREFIX}${snapshot.source}`, serialized);
      }
    } catch {
      return;
    }
  }

  function needsRefresh(source: HolidaySourceId, force: boolean): boolean {
    if (force) return true;
    const fetchedAt = snapshots.get(source)?.fetchedAt;
    const currentTime = now();
    if (
      !errors[source] &&
      fetchedAt !== undefined &&
      currentTime >= fetchedAt &&
      currentTime - fetchedAt < CACHE_TTL_MS
    )
      return false;
    const lastAttempt = attempts.get(source);
    return (
      lastAttempt === undefined ||
      currentTime - lastAttempt >= RETRY_INTERVAL_MS ||
      currentTime < lastAttempt
    );
  }

  async function updateSource(source: HolidaySourceId): Promise<void> {
    attempts.set(source, now());
    try {
      let snapshot: HolidaySnapshot;
      if (source === 'lanceliao') {
        const text = await request(SOURCE_URLS.lanceliao);
        if (disposed) return;
        snapshot = parsePrimaryHolidays(JSON.parse(text), now());
      } else {
        const [rest, work] = await Promise.all([
          request(SOURCE_URLS.muhacRest),
          request(SOURCE_URLS.muhacWork),
        ]);
        if (disposed) return;
        snapshot = parseBackupHolidays(rest, work, now());
      }
      save(snapshot);
      delete errors[source];
    } catch (error) {
      if (disposed) return;
      for (const controller of controllers) controller.abort();
      errors[source] =
        error instanceof Error && !/fetch|network|load failed/i.test(error.message)
          ? error.message
          : '无法读取远程日历，请检查网络或稍后重试';
    }
    notify();
  }

  function refresh(force = false): Promise<void> {
    if (disposed) return Promise.resolve();
    if (active) return active;
    const pending = SOURCES.filter((source) => needsRefresh(source, force));
    if (!pending.length) return Promise.resolve();
    loading = true;
    active = Promise.resolve()
      .then(async () => {
        notify();
        for (const source of pending) {
          if (disposed) break;
          await updateSource(source);
        }
      })
      .finally(() => {
        loading = false;
        active = undefined;
        notify();
      });
    return active;
  }

  function dispose(): void {
    disposed = true;
    loading = false;
    for (const controller of controllers) controller.abort();
    controllers.clear();
  }

  return { getState, refresh, dispose };
}
