const DATABASE_NAME = 'meowv-studio-books-pagination-v1';
const STORE_NAME = 'indexes';

interface PaginationIndexRecord {
  key: string;
  pageCounts: number[];
  updatedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('当前浏览器不支持分页索引缓存。'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开分页索引缓存。'));
  });
}

async function requestResult<T>(
  mode: IDBTransactionMode,
  request: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, mode);
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('分页索引事务已中止。'));
      transaction.onerror = () => reject(transaction.error ?? new Error('分页索引事务失败。'));
    });
    const resultRequest = new Promise<T>((resolve, reject) => {
      const operation = request(transaction.objectStore(STORE_NAME));
      operation.onsuccess = () => resolve(operation.result);
      operation.onerror = () => reject(operation.error ?? new Error('分页索引操作失败。'));
    });
    const [value] = await Promise.all([resultRequest, completed]);
    return value;
  } finally {
    database.close();
  }
}

export async function loadPaginationIndex(
  key: string,
  sectionCount: number,
): Promise<number[] | null> {
  if (!key || !('indexedDB' in globalThis)) return null;
  try {
    const record = (await requestResult('readonly', (store) => store.get(key))) as
      PaginationIndexRecord | undefined;
    if (
      !record ||
      record.pageCounts.length !== sectionCount ||
      record.pageCounts.some((count) => !Number.isInteger(count) || count < 1)
    ) {
      return null;
    }
    return record.pageCounts;
  } catch {
    return null;
  }
}

export async function savePaginationIndex(key: string, pageCounts: number[]): Promise<void> {
  if (!key || !('indexedDB' in globalThis)) return;
  try {
    await requestResult('readwrite', (store) =>
      store.put({ key, pageCounts, updatedAt: Date.now() } satisfies PaginationIndexRecord),
    );
  } catch {
    // 缓存失败仅影响下次打开速度。
  }
}
