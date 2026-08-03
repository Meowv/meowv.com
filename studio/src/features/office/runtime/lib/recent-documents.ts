export type StoredFileHandle = {
  kind: 'file';
  name?: string;
  getFile: () => Promise<File>;
  createWritable?: () => Promise<{
    write: (data: File) => Promise<void>;
    close: () => Promise<void>;
  }>;
  isSameEntry?: (other: StoredFileHandle) => Promise<boolean>;
  queryPermission?: (descriptor?: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
};

export type RecentDocument = {
  id: string;
  name: string;
  extension: string;
  size: number;
  lastOpenedAt: number;
  lastSavedAt?: number;
  handle?: StoredFileHandle;
};

const DATABASE_NAME = 'meowv-studio-office-v1';
const STORE_NAME = 'documents';
const MAX_RECENT_DOCUMENTS = 40;

function notifyRecentDocumentsChanged(): void {
  window.dispatchEvent(new CustomEvent('office:recent-documents-changed'));
}

function getExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || 'file';
}

function getId(file: File): string {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 2);
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      if (!store.indexNames.contains('lastOpenedAt'))
        store.createIndex('lastOpenedAt', 'lastOpenedAt');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest | void,
): Promise<T | undefined> {
  if (typeof indexedDB === 'undefined') return undefined;
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = callback(transaction.objectStore(STORE_NAME));
    let value: T | undefined;
    if (request) {
      request.onsuccess = () => {
        value = request.result as T;
      };
      request.onerror = () => reject(request.error);
    }
    transaction.oncomplete = () => {
      database.close();
      resolve(value);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

async function getStoredDocuments(): Promise<RecentDocument[]> {
  try {
    return (await withStore<RecentDocument[]>('readonly', (store) => store.getAll())) || [];
  } catch {
    return [];
  }
}

async function putDocument(record: RecentDocument): Promise<void> {
  await withStore('readwrite', (store) => store.put(record));
}

export async function listRecentDocuments(): Promise<RecentDocument[]> {
  return (
    (await getStoredDocuments())
      // 旧版本会在首次保存前写入草稿记录，避免继续展示这些未保存的历史项。
      .filter((item) => {
        const legacy = item as RecentDocument & { deletedAt?: number; isNew?: boolean };
        return !legacy.isNew && !legacy.deletedAt;
      })
      .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
      .slice(0, MAX_RECENT_DOCUMENTS)
  );
}

export async function rememberRecentDocument(
  file: File,
  handle?: StoredFileHandle,
): Promise<string | undefined> {
  // 没有可持久化的授权句柄时，记录也无法在下次直接打开，因此不留下无效历史。
  if (!handle) return undefined;

  const storedDocuments = await getStoredDocuments();
  const sameFileHandle = await Promise.all(
    storedDocuments.map(async (item) => {
      if (!item.handle?.isSameEntry) return false;
      try {
        return await item.handle.isSameEntry(handle);
      } catch {
        return false;
      }
    }),
  );
  const existing =
    storedDocuments.find((item, index) => sameFileHandle[index]) ||
    storedDocuments.find((item) => item.id === getId(file));
  const record: RecentDocument = {
    id: existing?.id || getId(file),
    name: file.name,
    extension: getExtension(file.name),
    size: file.size,
    lastOpenedAt: Date.now(),
    ...(existing?.lastSavedAt ? { lastSavedAt: existing.lastSavedAt } : {}),
    handle,
  };
  try {
    await putDocument(record);
    const duplicateIds = storedDocuments
      .filter((item, index) => sameFileHandle[index] && item.id !== record.id)
      .map((item) => item.id);
    await Promise.all(
      duplicateIds.map((id) => withStore('readwrite', (store) => store.delete(id))),
    );
  } catch {
    return undefined;
  }

  const staleRecords = (await getStoredDocuments())
    .filter((item) => {
      const legacy = item as RecentDocument & { deletedAt?: number; isNew?: boolean };
      return !legacy.isNew && !legacy.deletedAt;
    })
    .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
    .slice(MAX_RECENT_DOCUMENTS);
  await Promise.all(staleRecords.map((item) => deleteRecentDocument(item.id)));
  notifyRecentDocumentsChanged();
  return record.id;
}

export async function markRecentDocumentSaved(
  id: string,
  file: File,
  handle?: StoredFileHandle,
): Promise<void> {
  const record = (await getStoredDocuments()).find((item) => item.id === id);
  if (!record) return;
  try {
    await putDocument({
      ...record,
      name: file.name,
      extension: getExtension(file.name),
      size: file.size,
      lastSavedAt: Date.now(),
      ...(handle ? { handle } : {}),
    });
    notifyRecentDocumentsChanged();
  } catch {
    // Recent documents are only an on-device convenience.
  }
}

export async function deleteRecentDocument(id: string): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(id));
    notifyRecentDocumentsChanged();
  } catch {
    // Recent documents are only an on-device convenience.
  }
}

export async function getRecentDocumentFile(record: RecentDocument): Promise<File | null> {
  if (!record.handle) return null;
  try {
    // 历史记录的再次打开由用户点击触发；此时可同时请求读写权限，确保保存会直接回写原文件。
    const currentPermission = await record.handle.queryPermission?.({ mode: 'readwrite' });
    const permission =
      currentPermission === 'granted'
        ? currentPermission
        : await record.handle.requestPermission?.({ mode: 'readwrite' });
    if (permission && permission !== 'granted') return null;
    return await record.handle.getFile();
  } catch {
    return null;
  }
}
