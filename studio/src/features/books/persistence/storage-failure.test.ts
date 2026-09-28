import { afterEach, expect, it, vi } from 'vitest';
import {
  BookshelfRepository,
  rememberBookshelfSessionFile,
  resolveBookshelfFile,
  type BookshelfEntry,
} from './BookshelfRepository';
import { loadPaginationIndex, savePaginationIndex } from './PaginationIndexRepository';

afterEach(() => vi.unstubAllGlobals());

it('IndexedDB 请求与事务同时失败时正常降级，不产生未处理的 rejection', async () => {
  const close = vi.fn();
  vi.stubGlobal('indexedDB', {
    open: () => {
      const opening = {} as IDBOpenDBRequest;
      const database = {
        close,
        transaction: () => {
          const transaction = { error: new DOMException('test', 'AbortError') } as IDBTransaction;
          const fail = () => {
            const request = { error: new DOMException('test', 'UnknownError') } as IDBRequest;
            queueMicrotask(() => {
              request.onerror?.call(request, new Event('error'));
              transaction.onabort?.call(transaction, new Event('abort'));
            });
            return request;
          };
          transaction.objectStore = () =>
            ({ get: fail, getAll: fail, put: fail }) as unknown as IDBObjectStore;
          return transaction;
        },
      };
      Object.defineProperty(opening, 'result', { value: database });
      queueMicrotask(() => opening.onsuccess?.call(opening, new Event('success')));
      return opening;
    },
  });
  const shelf = new BookshelfRepository();
  expect(await shelf.get('missing')).toBeNull();
  expect(await shelf.list()).toEqual([]);
  expect(await loadPaginationIndex('missing', 1)).toBeNull();
  await savePaginationIndex('missing', [1]);
  expect(close).toHaveBeenCalledTimes(4);
});

it('移出书架后释放会话内的本地文件引用', async () => {
  const shelf = new BookshelfRepository();
  const entry: BookshelfEntry = {
    id: 'removed-session-file',
    format: 'txt',
    metadata: { title: 'test', authors: [] },
    availability: 'available',
    addedAt: 0,
    lastOpenedAt: 0,
  };
  const file = new File(['test'], 'test.txt');
  rememberBookshelfSessionFile(entry.id, file);
  expect(await resolveBookshelfFile(entry)).toBe(file);
  await shelf.remove(entry.id);
  expect(await resolveBookshelfFile(entry)).toBeNull();
});
