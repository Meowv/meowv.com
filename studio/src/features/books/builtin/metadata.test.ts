import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBookFingerprint } from '../persistence/BookFingerprint';
import { probeBookMetadata } from './metadata';

const def = { slug: 'sample', title: 'sample', format: 'txt' as const, url: '/sample.txt' };

afterEach(() => vi.unstubAllGlobals());

function mockRanges(bytes: Uint8Array): ReturnType<typeof vi.fn> {
  const fetch = vi.fn(async (_url: string, options: RequestInit) => {
    const range = (options.headers as Record<string, string>).Range;
    const suffix = /^bytes=-(\d+)$/.exec(range);
    const explicit = /^bytes=(\d+)-(\d+)$/.exec(range);
    const start = suffix ? Math.max(0, bytes.length - Number(suffix[1])) : Number(explicit![1]);
    const end = suffix ? bytes.length - 1 : Math.min(bytes.length - 1, Number(explicit![2]));
    return new Response(bytes.slice(start, end + 1), {
      status: 206,
      headers: { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` },
    });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('内置书分段探测', () => {
  it.each([1, 65536, 65537, 100000, 131072, 180000])(
    '%i 字节文件的探测指纹与完整文件一致',
    async (size) => {
      const bytes = Uint8Array.from({ length: size }, (_, i) => i % 251);
      const fetch = mockRanges(bytes);
      const file = new File([bytes], 'sample.txt', { lastModified: 0 });
      const result = await probeBookMetadata(def);
      expect(result?.id).toBe(await createBookFingerprint(file));
      expect(fetch).toHaveBeenCalledTimes(size <= 65536 ? 1 : 2);
    },
  );

  it('服务器忽略 Range 时取消响应体，不下载整本书', async () => {
    const cancel = vi.fn();
    const arrayBuffer = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers(),
        body: { cancel },
        arrayBuffer,
      }),
    );
    await expect(probeBookMetadata(def)).rejects.toThrow('不支持分段读取');
    expect(cancel).toHaveBeenCalledOnce();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('拒绝范围不匹配的响应，避免错误指纹进入书架', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array(10), {
          status: 206,
          headers: { 'Content-Range': 'bytes 0-9/100000' },
        }),
      ),
    );
    await expect(probeBookMetadata(def)).rejects.toThrow('范围不匹配');
  });

  it('拒绝被截断的分段数据', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array(9), {
          status: 206,
          headers: { 'Content-Range': 'bytes 0-9/10' },
        }),
      ),
    );
    await expect(probeBookMetadata(def)).rejects.toThrow('长度不匹配');
  });

  it('将取消信号传递给每次网络请求', async () => {
    const fetch = mockRanges(new Uint8Array(180000));
    const controller = new AbortController();
    await probeBookMetadata(def, controller.signal);
    expect(fetch.mock.calls.every(([, options]) => options.signal === controller.signal)).toBe(
      true,
    );
  });
});
