import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookshelfRepository } from '../persistence/BookshelfRepository';

const mocks = vi.hoisted(() => ({ metadata: vi.fn(), list: vi.fn() }));
vi.mock('./metadata', () => ({ probeBookMetadata: mocks.metadata }));
vi.mock('./BuiltinShelf', () => ({
  builtinBookKey: (slug: string, format: string) => `${slug}.${format}`,
  getRemovedSlugs: () => new Set(),
  listBuiltinBooks: mocks.list,
}));
vi.mock('../persistence/coverThumbnail', () => ({
  drawCoverThumbnail: vi.fn(),
  drawPlaceholderCover: vi.fn().mockResolvedValue(new Blob(['cover'])),
}));

import { probeBuiltinBooks } from './probe';

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

it('进入阅读时停止补队和写回，回到书架可以重试已取消的书', async () => {
  const defs = Array.from({ length: 6 }, (_, i) => ({
    slug: `cancel-${i}`,
    title: 'test',
    format: 'txt',
    url: `/cancel-${i}.txt`,
  }));
  mocks.list.mockResolvedValue(defs);
  const pending: Array<() => void> = [];
  mocks.metadata.mockImplementation(
    (def) =>
      new Promise((resolve) => {
        pending.push(() => resolve({ id: def.slug, metadata: { title: 'test', authors: [] } }));
      }),
  );
  const bookshelf = { get: vi.fn().mockResolvedValue(null), upsert: vi.fn() };
  const controller = new AbortController();
  const task = probeBuiltinBooks(
    bookshelf as unknown as BookshelfRepository,
    [],
    undefined,
    controller.signal,
  );
  await vi.waitFor(() => expect(mocks.metadata).toHaveBeenCalledTimes(2));
  controller.abort();
  for (const finish of pending) finish();
  await task;
  expect(bookshelf.upsert).not.toHaveBeenCalled();
  expect(mocks.metadata).toHaveBeenCalledTimes(2);

  mocks.metadata.mockImplementation(async (def) => ({
    id: def.slug,
    metadata: { title: 'test', authors: [] },
  }));
  await probeBuiltinBooks(bookshelf as unknown as BookshelfRepository, []);
  expect(bookshelf.upsert).toHaveBeenCalledTimes(6);
});

describe('已取消的探测', () => {
  it('不启动元数据请求', async () => {
    mocks.list.mockResolvedValue([{ slug: 'stopped', format: 'txt' }]);
    const controller = new AbortController();
    controller.abort();
    await probeBuiltinBooks({} as BookshelfRepository, [], undefined, controller.signal);
    expect(mocks.metadata).not.toHaveBeenCalled();
  });
});
