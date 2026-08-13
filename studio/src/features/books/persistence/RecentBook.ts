export interface RecentBookSource {
  file: File;
  fingerprint: string;
  handle?: FileSystemFileHandle;
}

interface RecentBookRecord {
  id: 'last';
  fingerprint: string;
  handle: FileSystemFileHandle;
  updatedAt: number;
}

const DATABASE_NAME = 'meowv-studio-books-v1';
const STORE_NAME = 'recent-books';
const LAST_BOOK_ID = 'last';

let sessionBook: RecentBookSource | null = null;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('当前浏览器不支持 IndexedDB。'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开最近书籍存储。'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('最近书籍存储操作失败。'));
    transaction.oncomplete = () => database.close();
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error('最近书籍存储事务被中止。'));
    };
    transaction.onerror = () => database.close();
  });
}

async function readStoredBook(): Promise<RecentBookRecord | null> {
  try {
    return (await withStore('readonly', (store) => store.get(LAST_BOOK_ID))) ?? null;
  } catch {
    return null;
  }
}

async function clearStoredBook(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(LAST_BOOK_ID));
  } catch {
    // 最近书籍只是本地续读便利，清理失败不影响阅读。
  }
}

export async function rememberRecentBook(source: RecentBookSource): Promise<void> {
  sessionBook = source;
  if (!source.handle) {
    await clearStoredBook();
    return;
  }
  const handle = source.handle;
  try {
    await withStore('readwrite', (store) =>
      store.put({
        id: LAST_BOOK_ID,
        fingerprint: source.fingerprint,
        handle,
        updatedAt: Date.now(),
      } satisfies RecentBookRecord),
    );
  } catch {
    // 句柄无法持久化时仍保留当前会话内续读。
  }
}

export async function restoreRecentBook(): Promise<RecentBookSource | null> {
  if (sessionBook) return sessionBook;
  const record = await readStoredBook();
  if (!record?.handle) return null;

  try {
    const permission = await record.handle.queryPermission({ mode: 'read' });
    if (permission !== 'granted') {
      if (permission === 'denied') await clearStoredBook();
      return null;
    }
    const file = await record.handle.getFile();
    sessionBook = { file, fingerprint: record.fingerprint, handle: record.handle };
    return sessionBook;
  } catch {
    await clearStoredBook();
    return null;
  }
}
