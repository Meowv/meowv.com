import { afterEach, expect, it, vi } from 'vitest';
import { fetchBuiltinFile } from './BuiltinShelf';

afterEach(() => vi.unstubAllGlobals());

it('只合并进行中的下载，完成后释放整本文件引用', async () => {
  const def = { slug: 'file', title: 'file', format: 'txt' as const, url: '/test.txt' };
  const fetch = vi.fn(async () => new Response('sample book'));
  vi.stubGlobal('fetch', fetch);
  const first = fetchBuiltinFile(def);
  const second = fetchBuiltinFile(def);
  expect(second).toBe(first);
  expect((await first).lastModified).toBe(0);
  await fetchBuiltinFile(def);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('下载失败不会把错误永久缓存', async () => {
  const def = { slug: 'retry', title: 'retry', format: 'txt' as const, url: '/retry.txt' };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(new Response('book'));
  vi.stubGlobal('fetch', fetch);
  await expect(fetchBuiltinFile(def)).rejects.toThrow('加载失败');
  await expect(fetchBuiltinFile(def)).resolves.toBeInstanceOf(File);
  expect(fetch).toHaveBeenCalledTimes(2);
});
