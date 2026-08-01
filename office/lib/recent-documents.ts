export type StoredFileHandle = {
  kind: 'file';
  getFile: () => Promise<File>;
  createWritable?: () => Promise<{ write: (data: File) => Promise<void>; close: () => Promise<void> }>;
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
  deletedAt?: number;
  isNew?: boolean;
  handle?: StoredFileHandle;
};

const DATABASE_NAME = 'meowv-office-recent-documents';
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

function createNewDocumentId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `new:${globalThis.crypto.randomUUID()}`;
  }

  return `new:${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getRecentDocumentId(file: File): string {
  return getId(file);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 2);
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      if (!store.indexNames.contains('lastOpenedAt')) store.createIndex('lastOpenedAt', 'lastOpenedAt');
      if (!store.indexNames.contains('deletedAt')) store.createIndex('deletedAt', 'deletedAt');
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
  return (await getStoredDocuments())
    .filter((item) => !item.deletedAt)
    .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
    .slice(0, MAX_RECENT_DOCUMENTS);
}

export async function listTrashedDocuments(): Promise<RecentDocument[]> {
  return (await getStoredDocuments())
    .filter((item) => Boolean(item.deletedAt))
    .sort((left, right) => (right.deletedAt || 0) - (left.deletedAt || 0));
}

export async function rememberRecentDocument(file: File, handle?: StoredFileHandle): Promise<void> {
  const storedDocuments = await getStoredDocuments();
  const sameFileHandle = handle
    ? await Promise.all(
        storedDocuments.map(async (item) => {
          if (!item.handle?.isSameEntry) return false;
          try {
            return await item.handle.isSameEntry(handle);
          } catch {
            return false;
          }
        }),
      )
    : [];
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
    ...(handle || existing?.handle ? { handle: handle || existing?.handle } : {}),
  };
  try {
    await putDocument(record);
    const duplicateIds = storedDocuments
      .filter((item, index) => sameFileHandle[index] && item.id !== record.id)
      .map((item) => item.id);
    await Promise.all(duplicateIds.map((id) => withStore('readwrite', (store) => store.delete(id))));
  } catch {
    const metadataOnly = { ...record };
    delete metadataOnly.handle;
    try {
      await putDocument(metadataOnly);
    } catch {
      return;
    }
  }

  const staleRecords = (await getStoredDocuments())
    .filter((item) => !item.deletedAt)
    .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
    .slice(MAX_RECENT_DOCUMENTS);
  await Promise.all(staleRecords.map((item) => permanentlyDeleteRecentDocument(item.id)));
  notifyRecentDocumentsChanged();
}

export async function createRecentDocument(fileName: string): Promise<string> {
  const id = createNewDocumentId();
  const record: RecentDocument = {
    id,
    name: fileName,
    extension: getExtension(fileName),
    size: 0,
    lastOpenedAt: Date.now(),
    isNew: true,
  };
  try {
    await putDocument(record);
    notifyRecentDocumentsChanged();
  } catch {
    // Recent documents are only an on-device convenience.
  }
  return id;
}

export async function markRecentDocumentSaved(id: string, file: File, handle?: StoredFileHandle): Promise<void> {
  const record = (await getStoredDocuments()).find((item) => item.id === id);
  if (!record) return;
  try {
    await putDocument({
      ...record,
      name: file.name,
      extension: getExtension(file.name),
      size: file.size,
      lastSavedAt: Date.now(),
      isNew: false,
      ...(handle ? { handle } : {}),
    });
    notifyRecentDocumentsChanged();
  } catch {
    // Recent documents are only an on-device convenience.
  }
}

export async function moveRecentDocumentToTrash(id: string): Promise<void> {
  const record = (await getStoredDocuments()).find((item) => item.id === id);
  if (!record) return;
  try {
    await putDocument({ ...record, deletedAt: Date.now() });
    notifyRecentDocumentsChanged();
  } catch {
    // Recent documents are only an on-device convenience.
  }
}

export async function restoreRecentDocument(id: string): Promise<void> {
  const record = (await getStoredDocuments()).find((item) => item.id === id);
  if (!record) return;
  try {
    const restored = { ...record, lastOpenedAt: Date.now() };
    delete restored.deletedAt;
    await putDocument(restored);
    notifyRecentDocumentsChanged();
  } catch {
    // Recent documents are only an on-device convenience.
  }
}

export async function permanentlyDeleteRecentDocument(id: string): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(id));
    notifyRecentDocumentsChanged();
  } catch {
    // Recent documents are only an on-device convenience.
  }
}

export async function clearRecentDocuments(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.clear());
    notifyRecentDocumentsChanged();
  } catch {
    // Recent documents are only an on-device convenience.
  }
}

export async function getRecentDocumentFile(record: RecentDocument): Promise<File | null> {
  if (!record.handle) return null;
  try {
    const currentPermission = await record.handle.queryPermission?.({ mode: 'read' });
    const permission =
      currentPermission === 'granted' ? currentPermission : await record.handle.requestPermission?.({ mode: 'read' });
    if (permission && permission !== 'granted') return null;
    return await record.handle.getFile();
  } catch {
    return null;
  }
}
