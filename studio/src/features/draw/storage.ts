export interface DrawDocumentRecord {
  id: string;
  title: string;
  sceneJson: string;
  fileHandle?: FileSystemFileHandle;
  fileSyncPending?: boolean;
  schemaVersion: 1;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  elementCount: number;
  size: number;
}

export interface DrawSettingsRecord {
  id: 'global';
  activeDocumentId: string | null;
  headerCollapsed: boolean;
  storagePersistRequested: boolean;
  localStorageNoticeShown: boolean;
}

export interface DrawLibraryRecord<T = unknown> {
  id: 'default';
  items: T;
  updatedAt: number;
}

const DATABASE_NAME = 'meowv-studio-draw';
const DATABASE_VERSION = 1;
const DOCUMENTS_STORE = 'documents';
const SETTINGS_STORE = 'settings';
const LIBRARY_STORE = 'library';
const EXCALIDRAW_FILE_MIME_TYPE = 'application/vnd.excalidraw+json';

export const EMPTY_DRAW_SCENE = JSON.stringify({
  type: 'excalidraw',
  version: 2,
  source: 'https://studio.meowv.com/draw',
  elements: [],
  appState: {},
  files: {},
});

let databasePromise: Promise<IDBDatabase> | null = null;

function createDrawId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `draw:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function requestDrawFileWritePermission(
  handle: FileSystemFileHandle,
  requestIfNeeded = false,
): Promise<boolean> {
  const current = await handle.queryPermission({ mode: 'readwrite' });
  if (current === 'granted') return true;
  if (!requestIfNeeded) return false;
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export async function writeDrawDocumentFile(
  handle: FileSystemFileHandle,
  sceneJson: string,
  requestPermission = false,
): Promise<boolean> {
  if (!(await requestDrawFileWritePermission(handle, requestPermission))) return false;

  const writable = await handle.createWritable();
  try {
    await writable.write(new Blob([sceneJson], { type: EXCALIDRAW_FILE_MIME_TYPE }));
    await writable.close();
    return true;
  } catch (error) {
    await writable.abort(error).catch(() => undefined);
    throw error;
  }
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败。'));
  });
}

function transactionAsPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB 事务被中止。'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB 事务失败。'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('当前浏览器不支持 IndexedDB。'));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DOCUMENTS_STORE)) {
        const documents = database.createObjectStore(DOCUMENTS_STORE, { keyPath: 'id' });
        documents.createIndex('updatedAt', 'updatedAt');
        documents.createIndex('lastOpenedAt', 'lastOpenedAt');
        documents.createIndex('title', 'title');
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(LIBRARY_STORE)) {
        database.createObjectStore(LIBRARY_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('无法打开本地画板存储。'));
    };
  });

  return databasePromise;
}

async function useStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, mode);
  const result = await callback(transaction.objectStore(storeName));
  await transactionAsPromise(transaction);
  return result;
}

async function putRecord<T>(storeName: string, record: T): Promise<void> {
  await useStore(storeName, 'readwrite', async (store) => {
    await requestAsPromise(store.put(record));
  });
}

async function updateDrawDocumentRecord(
  id: string,
  update: (document: DrawDocumentRecord) => DrawDocumentRecord,
): Promise<DrawDocumentRecord> {
  return useStore(DOCUMENTS_STORE, 'readwrite', async (store) => {
    const document = (await requestAsPromise(store.get(id))) as DrawDocumentRecord | undefined;
    if (!document) throw new Error('当前画板不存在。');
    const record = update(document);
    await requestAsPromise(store.put(record));
    return record;
  });
}

export async function listDrawDocuments(): Promise<DrawDocumentRecord[]> {
  const documents = await useStore(
    DOCUMENTS_STORE,
    'readonly',
    (store) => requestAsPromise(store.getAll()) as Promise<DrawDocumentRecord[]>,
  );
  return documents.sort((first, second) => second.lastOpenedAt - first.lastOpenedAt);
}

export async function getDrawDocument(id: string): Promise<DrawDocumentRecord | null> {
  const document = await useStore(
    DOCUMENTS_STORE,
    'readonly',
    (store) => requestAsPromise(store.get(id)) as Promise<DrawDocumentRecord | undefined>,
  );
  return document ?? null;
}

export async function createDrawDocument(
  title = '未命名画板',
  sceneJson = EMPTY_DRAW_SCENE,
  fileHandle?: FileSystemFileHandle,
): Promise<DrawDocumentRecord> {
  const timestamp = Date.now();
  const record: DrawDocumentRecord = {
    id: createDrawId(),
    title: title.trim() || '未命名画板',
    sceneJson,
    ...(fileHandle ? { fileHandle, fileSyncPending: false } : {}),
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
    elementCount: 0,
    size: new Blob([sceneJson]).size,
  };
  await putRecord(DOCUMENTS_STORE, record);
  return record;
}

export async function saveDrawDocument(
  id: string,
  sceneJson: string,
  elementCount: number,
  fileHandle?: FileSystemFileHandle,
  fileSyncPending?: boolean,
): Promise<DrawDocumentRecord> {
  return updateDrawDocumentRecord(id, (document) => ({
    ...document,
    sceneJson,
    ...(fileHandle ? { fileHandle } : {}),
    ...(typeof fileSyncPending === 'boolean' ? { fileSyncPending } : {}),
    elementCount,
    size: new Blob([sceneJson]).size,
    updatedAt: Date.now(),
  }));
}

export async function setDrawDocumentFileSyncPending(
  id: string,
  fileSyncPending: boolean,
): Promise<DrawDocumentRecord> {
  return updateDrawDocumentRecord(id, (document) => ({
    ...document,
    fileSyncPending,
  }));
}

export async function renameDrawDocument(id: string, title: string): Promise<DrawDocumentRecord> {
  return updateDrawDocumentRecord(id, (document) => ({
    ...document,
    title: title.trim() || '未命名画板',
    updatedAt: Date.now(),
  }));
}

export async function touchDrawDocument(id: string): Promise<DrawDocumentRecord> {
  return updateDrawDocumentRecord(id, (document) => ({
    ...document,
    lastOpenedAt: Date.now(),
  }));
}

export async function duplicateDrawDocument(id: string): Promise<DrawDocumentRecord> {
  const document = await getDrawDocument(id);
  if (!document) throw new Error('要复制的画板不存在。');
  return createDrawDocument(`${document.title} 副本`, document.sceneJson);
}

export async function deleteDrawDocument(id: string): Promise<void> {
  await useStore(DOCUMENTS_STORE, 'readwrite', async (store) => {
    await requestAsPromise(store.delete(id));
  });
}

export async function clearDrawDocuments(): Promise<void> {
  await useStore(DOCUMENTS_STORE, 'readwrite', async (store) => {
    await requestAsPromise(store.clear());
  });
}

export async function getDrawSettings(): Promise<DrawSettingsRecord> {
  const record = await useStore(
    SETTINGS_STORE,
    'readonly',
    (store) => requestAsPromise(store.get('global')) as Promise<DrawSettingsRecord | undefined>,
  );
  return (
    record ?? {
      id: 'global',
      activeDocumentId: null,
      headerCollapsed: false,
      storagePersistRequested: false,
      localStorageNoticeShown: false,
    }
  );
}

export async function updateDrawSettings(
  changes: Partial<Omit<DrawSettingsRecord, 'id'>>,
): Promise<DrawSettingsRecord> {
  const record: DrawSettingsRecord = { ...(await getDrawSettings()), ...changes, id: 'global' };
  await putRecord(SETTINGS_STORE, record);
  return record;
}

export async function getDrawLibrary<T>(): Promise<DrawLibraryRecord<T> | null> {
  const record = await useStore(
    LIBRARY_STORE,
    'readonly',
    (store) => requestAsPromise(store.get('default')) as Promise<DrawLibraryRecord<T> | undefined>,
  );
  return record ?? null;
}

export async function saveDrawLibrary<T>(items: T): Promise<void> {
  await putRecord<DrawLibraryRecord<T>>(LIBRARY_STORE, {
    id: 'default',
    items,
    updatedAt: Date.now(),
  });
}
