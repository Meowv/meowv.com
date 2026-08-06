import type { StoredFileHandle } from './recent-documents';

export type OfficeRouteFormat = 'doc' | 'xls' | 'ppt' | 'csv';

export type ActiveOfficeDocument = {
  routeFormat: OfficeRouteFormat;
  name: string;
  type: string;
  lastModified: number;
  snapshot: Blob;
  handle?: StoredFileHandle;
  updatedAt: number;
};

const DATABASE_NAME = 'meowv-studio-office-active-v1';
const STORE_NAME = 'documents';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'routeFormat' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = callback(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

function toFile(record: ActiveOfficeDocument): File {
  return new File([record.snapshot], record.name, {
    type: record.type,
    lastModified: record.lastModified,
  });
}

export async function replaceActiveOfficeDocument(
  routeFormat: OfficeRouteFormat,
  file: File,
  handle?: StoredFileHandle,
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await withStore('readwrite', (store) =>
    store.put({
      routeFormat,
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      snapshot: file,
      ...(handle ? { handle } : {}),
      updatedAt: Date.now(),
    } satisfies ActiveOfficeDocument),
  );
}

export async function updateActiveOfficeSnapshot(
  routeFormat: OfficeRouteFormat,
  file: File,
  handle?: StoredFileHandle,
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const current = await getActiveOfficeDocument(routeFormat);
  await replaceActiveOfficeDocument(routeFormat, file, handle || current?.handle);
}

export async function getActiveOfficeDocument(
  routeFormat: OfficeRouteFormat,
): Promise<(ActiveOfficeDocument & { file: File }) | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const record = await withStore<ActiveOfficeDocument | undefined>('readonly', (store) =>
      store.get(routeFormat),
    );
    return record ? { ...record, file: toFile(record) } : null;
  } catch {
    return null;
  }
}
