import { afterEach, describe, expect, it, vi } from 'vitest';
import { CACHE_TTL_MS, createHolidayRepository } from '../holiday.repository';
import {
  MAX_HOLIDAY_BYTES,
  SOURCE_URLS,
  parseBackupHolidays,
  parsePrimaryHolidays,
  resolveHolidayData,
} from '../holiday.service';
import type { HolidaySnapshot } from '../types';

const NOW = Date.UTC(2026, 8, 7);
const CACHE_PREFIX = 'meowv-studio:calendar-cache:v1:';

function primaryInput(year = 2026) {
  return {
    Name: '测试',
    Version: '1.0',
    Generated: '20251104T235904Z',
    Timezone: 'Asia/Shanghai',
    Years: {
      [year]: ['元旦', '春节', '清明节', '劳动节', '端午节', '中秋节', '国庆节'].map(
        (name, index) => ({
          Name: name,
          StartDate: `${year}-${String(index + 1).padStart(2, '0')}-01`,
          EndDate: `${year}-${String(index + 1).padStart(2, '0')}-01`,
          Duration: 1,
          CompDays: [`${year}-${String(index + 1).padStart(2, '0')}-04`],
          Memo: '固定测试数据，不代表实际年度安排',
        }),
      ),
    },
  };
}

function ics(date: string) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `UID:${date}`,
    `DTSTART;VALUE=DATE:${date}`,
    'SUMMARY:测试',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function memoryStorage(snapshots: HolidaySnapshot[] = []) {
  const values = new Map(
    snapshots.map((snapshot) => [
      `${CACHE_PREFIX}${snapshot.source}`,
      JSON.stringify({ version: 1, snapshot }),
    ]),
  );
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

function successFetcher(year = 2026) {
  return vi.fn<typeof fetch>().mockImplementation(async (url) => {
    if (url === SOURCE_URLS.lanceliao) return new Response(JSON.stringify(primaryInput(year)));
    return new Response(url === SOURCE_URLS.muhacRest ? ics(`${year}0101`) : ics(`${year}0104`));
  });
}

function cachedSnapshots(fetchedAt = NOW) {
  return [
    parsePrimaryHolidays(primaryInput(), fetchedAt),
    parseBackupHolidays(ics('20260101'), ics('20260104'), fetchedAt),
  ];
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('日历仓储刷新和缓存', () => {
  it('失败请求不使过期缓存重新有效，稍后恢复可见能够自动重试', async () => {
    let currentTime = NOW;
    const fetcher = successFetcher();
    fetcher.mockRejectedValueOnce(new Error('Failed to fetch'));
    const repository = createHolidayRepository({
      storage: memoryStorage(cachedSnapshots(NOW - CACHE_TTL_MS)),
      now: () => currentTime,
      fetcher,
    });
    await repository.refresh();
    expect(repository.getState().errors.lanceliao).toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(3);
    currentTime += 60_000;
    await repository.refresh();
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(repository.getState().errors.lanceliao).toBeUndefined();
    expect(
      repository.getState().snapshots.find((snapshot) => snapshot.source === 'lanceliao')
        ?.fetchedAt,
    ).toBe(currentTime);
    repository.dispose();
  });
  it('同步读取新鲜缓存，不自动请求；24 小时内普通刷新不重复获取', async () => {
    const snapshots = cachedSnapshots();
    const fetcher = successFetcher();
    const repository = createHolidayRepository({
      storage: memoryStorage(snapshots),
      now: () => NOW,
      fetcher,
    });
    expect(repository.getState()).toEqual({ snapshots, loading: false, errors: {} });
    await repository.refresh();
    expect(fetcher).not.toHaveBeenCalled();
    repository.dispose();
  });

  it('先请求主源再成对请求备用，使用无凭据 GET 并成功写入版本缓存', async () => {
    const storage = memoryStorage();
    const fetcher = successFetcher();
    const onChange = vi.fn();
    const repository = createHolidayRepository({ storage, fetcher, now: () => NOW, onChange });
    await repository.refresh();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      SOURCE_URLS.lanceliao,
      SOURCE_URLS.muhacRest,
      SOURCE_URLS.muhacWork,
    ]);
    for (const [, options] of fetcher.mock.calls) {
      expect(options).toEqual({
        method: 'GET',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-cache',
        signal: expect.any(AbortSignal),
      });
    }
    expect(repository.getState().snapshots).toHaveLength(2);
    expect(repository.getState().loading).toBe(false);
    expect(repository.getState().errors).toEqual({});
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[0]![0].loading).toBe(true);
    expect(onChange.mock.lastCall![0].loading).toBe(false);
    const restored = createHolidayRepository({ storage, fetcher, now: () => NOW });
    expect(restored.getState().snapshots).toEqual(repository.getState().snapshots);
    await repository.refresh();
    expect(fetcher).toHaveBeenCalledTimes(3);
    repository.dispose();
    restored.dispose();
  });

  it('过期缓存先可读，刷新后自动新增 2027 并保留旧年度', async () => {
    const storage = memoryStorage(cachedSnapshots(NOW - CACHE_TTL_MS));
    const repository = createHolidayRepository({
      storage,
      fetcher: successFetcher(2027),
      now: () => NOW,
    });
    expect(resolveHolidayData(repository.getState().snapshots).coverage[2027]).toBe('unavailable');
    await repository.refresh();
    const result = resolveHolidayData(repository.getState().snapshots);
    expect(result.coverage[2026]).toBe('complete');
    expect(result.coverage[2027]).toBe('complete');
    expect(result.sourcesByYear[2027]).toBe('lanceliao');
    expect(repository.getState().snapshots.every((snapshot) => snapshot.fetchedAt === NOW)).toBe(
      true,
    );
    repository.dispose();
  });

  it('主源失败时使用备用；全部失败保留原快照，不覆盖缓存', async () => {
    const fetcher = successFetcher();
    fetcher.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const storage = memoryStorage([cachedSnapshots(NOW - CACHE_TTL_MS)[0]!]);
    const repository = createHolidayRepository({ storage, fetcher, now: () => NOW });
    await repository.refresh();
    expect(repository.getState().errors.lanceliao).toMatch(/网络/);
    expect(repository.getState().snapshots).toHaveLength(2);
    expect(resolveHolidayData(repository.getState().snapshots).sourcesByYear[2026]).toBe(
      'lanceliao',
    );
    const saved = repository.getState().snapshots;
    storage.setItem.mockClear();
    fetcher.mockRejectedValue(new TypeError('NetworkError: CORS'));
    await repository.refresh(true);
    expect(repository.getState().snapshots).toEqual(saved);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(Object.keys(repository.getState().errors)).toHaveLength(2);
    repository.dispose();
  });

  it('无主源缓存时备用仅提供部分覆盖，不能用于精确全年口径', async () => {
    const fetcher = successFetcher();
    fetcher.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const repository = createHolidayRepository({ storage: null, fetcher, now: () => NOW });
    await repository.refresh();
    const result = resolveHolidayData(repository.getState().snapshots);
    expect(result.sourcesByYear[2026]).toBe('muhac');
    expect(result.coverage[2026]).toBe('partial');
    repository.dispose();
  });

  it('备用源单侧 HTTP 失败保持成对原子性，不丢弃旧数据', async () => {
    const snapshots = cachedSnapshots(NOW - CACHE_TTL_MS);
    const storage = memoryStorage(snapshots);
    const fetcher = successFetcher();
    fetcher.mockImplementation(async (url) => {
      if (url === SOURCE_URLS.lanceliao) return new Response(JSON.stringify(primaryInput()));
      if (url === SOURCE_URLS.muhacRest) return new Response(ics('20270101'));
      return new Response('failure', { status: 503 });
    });
    const repository = createHolidayRepository({ storage, fetcher, now: () => NOW });
    await repository.refresh();
    expect(repository.getState().snapshots.find((snapshot) => snapshot.source === 'muhac')).toEqual(
      snapshots[1],
    );
    expect(repository.getState().errors.muhac).toMatch(/503/);
    expect(storage.setItem.mock.calls.map(([key]) => key)).toEqual([`${CACHE_PREFIX}lanceliao`]);
    repository.dispose();
  });

  it.each([
    null,
    {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    },
  ])('存储不可用时保持内存可用', async (storage) => {
    const repository = createHolidayRepository({
      storage,
      fetcher: successFetcher(),
      now: () => NOW,
    });
    await repository.refresh();
    expect(repository.getState().snapshots).toHaveLength(2);
    expect(repository.getState().errors).toEqual({});
    repository.dispose();
  });

  it('localStorage 属性抛错不会阻塞工具', async () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('SecurityError');
      },
    });
    const repository = createHolidayRepository({ fetcher: successFetcher(), now: () => NOW });
    await repository.refresh();
    expect(repository.getState().snapshots).toHaveLength(2);
    repository.dispose();
  });

  it.each([
    '{',
    JSON.stringify({ version: 0, snapshot: {} }),
    JSON.stringify({
      version: 1,
      snapshot: { source: 'lanceliao', fetchedAt: NOW, events: [], coverage: { 2027: 'complete' } },
    }),
  ])('忽略损坏或旧版本缓存并重新获取', async (raw) => {
    const storage = memoryStorage();
    storage.values.set(`${CACHE_PREFIX}lanceliao`, raw);
    const repository = createHolidayRepository({
      storage,
      fetcher: successFetcher(),
      now: () => NOW,
    });
    expect(repository.getState().snapshots).toHaveLength(0);
    await repository.refresh();
    expect(repository.getState().snapshots).toHaveLength(2);
    repository.dispose();
  });

  it('拒绝未来获取时间，getState 返回隔离副本', async () => {
    const repository = createHolidayRepository({
      storage: memoryStorage(cachedSnapshots(NOW + 1000)),
      fetcher: successFetcher(),
      now: () => NOW,
    });
    expect(repository.getState().snapshots).toHaveLength(0);
    await repository.refresh();
    const state = repository.getState();
    state.snapshots[0]!.events[0]!.period!.compDays.length = 0;
    state.snapshots[0]!.coverage[2026] = 'unavailable';
    expect(repository.getState().snapshots[0]!.coverage[2026]).toBe('complete');
    expect(repository.getState().snapshots[0]!.events[0]!.period!.compDays).toHaveLength(1);
    repository.dispose();
  });

  it('主源结构变更与不完整年度不会覆盖成功快照', async () => {
    const snapshots = cachedSnapshots(NOW - CACHE_TTL_MS);
    const input = primaryInput();
    input.Years[2026]!.pop();
    const fetcher = successFetcher();
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(input)));
    const repository = createHolidayRepository({
      storage: memoryStorage(snapshots),
      fetcher,
      now: () => NOW,
    });
    await repository.refresh();
    expect(repository.getState().snapshots[0]).toEqual(snapshots[0]);
    expect(repository.getState().errors.lanceliao).toBeTruthy();
    repository.dispose();
  });

  it('主源缓存新鲜时只补齐缺失备用；失败重试受到节流而手动刷新可重试', async () => {
    let currentTime = NOW;
    const fetcher = successFetcher();
    const repository = createHolidayRepository({
      storage: memoryStorage([cachedSnapshots()[0]!]),
      fetcher,
      now: () => currentTime,
    });
    await repository.refresh();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      SOURCE_URLS.muhacRest,
      SOURCE_URLS.muhacWork,
    ]);
    fetcher.mockRejectedValue(new Error('Failed to fetch'));
    await repository.refresh(true);
    const callsAfterFailure = fetcher.mock.calls.length;
    await repository.refresh();
    expect(fetcher).toHaveBeenCalledTimes(callsAfterFailure);
    currentTime += CACHE_TTL_MS;
    await repository.refresh();
    expect(fetcher).toHaveBeenCalledTimes(callsAfterFailure + 3);
    repository.dispose();
  });
});

describe('并发、取消与响应限制', () => {
  it('普通与强制并发刷新共享一个 promise 和同一批请求', async () => {
    const first = deferred<Response>();
    const fetcher = successFetcher();
    fetcher.mockImplementationOnce(() => first.promise);
    const repository = createHolidayRepository({ storage: null, fetcher, now: () => NOW });
    const pending = repository.refresh();
    expect(repository.refresh()).toBe(pending);
    expect(repository.refresh(true)).toBe(pending);
    first.resolve(new Response(JSON.stringify(primaryInput())));
    await pending;
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(repository.getState().snapshots).toHaveLength(2);
    repository.dispose();
  });

  it('8 秒主源超时后尝试备用，忽略不响应 abort 的晚到主源', async () => {
    vi.useFakeTimers();
    const late = deferred<Response>();
    const fetcher = successFetcher();
    fetcher.mockImplementationOnce(() => late.promise);
    const storage = memoryStorage();
    const repository = createHolidayRepository({ storage, fetcher, now: () => NOW });
    const pending = repository.refresh();
    await vi.advanceTimersByTimeAsync(8000);
    await pending;
    expect(fetcher.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    expect(repository.getState().errors.lanceliao).toMatch(/超时/);
    expect(repository.getState().snapshots.map((snapshot) => snapshot.source)).toEqual(['muhac']);
    const successful = repository.getState();
    late.resolve(new Response(JSON.stringify(primaryInput(2027))));
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.getState()).toEqual(successful);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    repository.dispose();
  });

  it('dispose 中止请求，之后无回调、缓存写入或新请求', async () => {
    vi.useFakeTimers();
    const late = deferred<Response>();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => late.promise);
    const storage = memoryStorage();
    const onChange = vi.fn();
    const repository = createHolidayRepository({ storage, fetcher, onChange, now: () => NOW });
    const pending = repository.refresh();
    await vi.advanceTimersByTimeAsync(0);
    repository.dispose();
    const callbacksAtDispose = onChange.mock.calls.length;
    await pending;
    late.resolve(new Response(JSON.stringify(primaryInput())));
    await vi.advanceTimersByTimeAsync(0);
    await repository.refresh(true);
    expect(fetcher.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledTimes(callbacksAtDispose);
    expect(repository.getState().snapshots).toHaveLength(0);
    expect(repository.getState().loading).toBe(false);
  });

  it('dispose 在微任务开始前发生时不会发出请求', async () => {
    const fetcher = successFetcher();
    const onChange = vi.fn();
    const repository = createHolidayRepository({ storage: null, fetcher, onChange });
    const pending = repository.refresh();
    repository.dispose();
    await pending;
    expect(fetcher).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('备用一侧失败会取消仍在等待的另一侧，不能产生部分写入', async () => {
    vi.useFakeTimers();
    const late = deferred<Response>();
    const fetcher = successFetcher();
    fetcher.mockImplementation(async (url) => {
      if (url === SOURCE_URLS.lanceliao) return new Response(JSON.stringify(primaryInput()));
      if (url === SOURCE_URLS.muhacRest) return late.promise;
      throw new TypeError('Failed to fetch');
    });
    const storage = memoryStorage();
    const repository = createHolidayRepository({ storage, fetcher, now: () => NOW });
    await repository.refresh();
    expect(
      fetcher.mock.calls.find(([url]) => url === SOURCE_URLS.muhacRest)![1]!.signal!.aborted,
    ).toBe(true);
    late.resolve(new Response(ics('20260101')));
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.getState().snapshots.map((snapshot) => snapshot.source)).toEqual([
      'lanceliao',
    ]);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    repository.dispose();
  });

  it.each([true, false])('拒绝超限响应，不依赖 Content-Length 声明：%s', async (includeHeader) => {
    const fetcher = successFetcher();
    fetcher.mockResolvedValueOnce(
      new Response(
        'a'.repeat(MAX_HOLIDAY_BYTES + 1),
        includeHeader
          ? { headers: { 'content-length': String(MAX_HOLIDAY_BYTES + 1) } }
          : undefined,
      ),
    );
    const repository = createHolidayRepository({ storage: null, fetcher, now: () => NOW });
    await repository.refresh();
    expect(repository.getState().errors.lanceliao).toMatch(/大小限制/);
    expect(repository.getState().snapshots.map((snapshot) => snapshot.source)).toEqual(['muhac']);
    repository.dispose();
  });

  it('读取永不结束的响应体也受 8 秒超时保护', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetcher = successFetcher();
    fetcher.mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({ cancel })));
    const repository = createHolidayRepository({ storage: null, fetcher, now: () => NOW });
    const pending = repository.refresh();
    await vi.advanceTimersByTimeAsync(8000);
    await pending;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(repository.getState().errors.lanceliao).toMatch(/超时/);
    expect(repository.getState().snapshots).toHaveLength(1);
    repository.dispose();
  });
});
