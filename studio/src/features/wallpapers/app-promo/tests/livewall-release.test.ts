import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LIVEWALL_RELEASE } from '../livewall-meta';
import {
  LIVEWALL_RELEASE_TIMEOUT_MS,
  loadLivewallRelease,
  type LivewallReleaseFetcher,
} from '../livewall-release';

const FEED_URL = '/data/livewall/version.json';
const FALLBACK = DEFAULT_LIVEWALL_RELEASE;

const VALID_PAYLOAD = {
  version: '0.2.0',
  build: 2,
  notes: '',
  sizeBytes: 4_194_304,
  sha256: 'b'.repeat(64),
  fileURL: 'https://studio.meowv.com/data/livewall/LiveWall-0.2.0.dmg',
  minOSVersion: '13.0',
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('loadLivewallRelease', () => {
  it('拿到合法远端数据时标记为 remote', async () => {
    let seenUrl: string | null = null;
    const fetcher: LivewallReleaseFetcher = async (url) => {
      seenUrl = url;
      return jsonResponse(VALID_PAYLOAD);
    };

    const result = await loadLivewallRelease(fetcher, FEED_URL, FALLBACK);

    expect(seenUrl).toBe(FEED_URL);
    expect(result.source).toBe('remote');
    expect(result.release).toEqual(VALID_PAYLOAD);
  });

  it('远端 404 时退回兜底且不抛错（本地开发的常态路径）', async () => {
    const fetcher: LivewallReleaseFetcher = async () => new Response('Not Found', { status: 404 });

    const result = await loadLivewallRelease(fetcher, FEED_URL, FALLBACK);

    expect(result.source).toBe('fallback');
    expect(result.release).toBe(FALLBACK);
  });

  it('网络异常时退回兜底', async () => {
    const fetcher: LivewallReleaseFetcher = async () => {
      throw new TypeError('Failed to fetch');
    };

    const result = await loadLivewallRelease(fetcher, FEED_URL, FALLBACK);

    expect(result.source).toBe('fallback');
    expect(result.release).toBe(FALLBACK);
  });

  it('响应不是合法 JSON 时退回兜底', async () => {
    const fetcher: LivewallReleaseFetcher = async () => new Response('<<<not json>>>');

    const result = await loadLivewallRelease(fetcher, FEED_URL, FALLBACK);

    expect(result.source).toBe('fallback');
    expect(result.release).toBe(FALLBACK);
  });

  it('HTTP 200 但内容不可用时仍记为 fallback', async () => {
    const fetcher: LivewallReleaseFetcher = async () =>
      jsonResponse({ version: '0.2.0', build: 2 });

    const result = await loadLivewallRelease(fetcher, FEED_URL, FALLBACK);

    expect(result.source).toBe('fallback');
    expect(result.release).toBe(FALLBACK);
  });

  it('超时后收口为兜底，并清掉定时器（即使 fetcher 忽略 abort 信号）', async () => {
    vi.useFakeTimers();
    const fetcher: LivewallReleaseFetcher = () => new Promise<Response>(() => undefined);

    const pending = loadLivewallRelease(fetcher, FEED_URL, FALLBACK);
    await vi.advanceTimersByTimeAsync(LIVEWALL_RELEASE_TIMEOUT_MS);
    const result = await pending;

    expect(result.source).toBe('fallback');
    expect(result.release).toBe(FALLBACK);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('信号已中止时不发起请求，直接返回兜底', async () => {
    let called = false;
    const fetcher: LivewallReleaseFetcher = async () => {
      called = true;
      return jsonResponse(VALID_PAYLOAD);
    };
    const controller = new AbortController();
    controller.abort();

    const result = await loadLivewallRelease(fetcher, FEED_URL, FALLBACK, {
      signal: controller.signal,
    });

    expect(called).toBe(false);
    expect(result.source).toBe('fallback');
    expect(result.release).toBe(FALLBACK);
  });

  it('成功返回后不残留定时器', async () => {
    vi.useFakeTimers();
    const fetcher: LivewallReleaseFetcher = async () => jsonResponse(VALID_PAYLOAD);

    const result = await loadLivewallRelease(fetcher, FEED_URL, FALLBACK);

    expect(result.source).toBe('remote');
    expect(vi.getTimerCount()).toBe(0);
  });
});
