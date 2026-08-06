import MindElixir, { type MindElixirData } from 'mind-elixir';
import {
  DEFAULT_MIND_SETTINGS,
  type MindAsset,
  type MindDocument,
  type MindDocumentSettings,
  type MindDocumentType,
  type MindPreferences,
} from './types';

const DATABASE_NAME = 'meowv-studio-mind';
const DATABASE_VERSION = 1;
const DOCUMENTS_STORE = 'mind_documents';
const ASSETS_STORE = 'mind_assets';
const PREFERENCES_STORE = 'mind_preferences';

let databasePromise: Promise<IDBDatabase> | null = null;

function newId(prefix: string): string {
  return `${prefix}:${crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error('IndexedDB 请求失败。'));
  });
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB 事务失败。'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB 事务被中止。'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('当前浏览器不支持 IndexedDB，无法保存思维导图。'));
      return;
    }
    const openRequest = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    openRequest.onupgradeneeded = () => {
      const database = openRequest.result;
      if (!database.objectStoreNames.contains(DOCUMENTS_STORE)) {
        const store = database.createObjectStore(DOCUMENTS_STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
        store.createIndex('lastOpenedAt', 'lastOpenedAt');
      }
      if (!database.objectStoreNames.contains(ASSETS_STORE)) {
        const store = database.createObjectStore(ASSETS_STORE, { keyPath: 'id' });
        store.createIndex('documentId', 'documentId');
      }
      if (!database.objectStoreNames.contains(PREFERENCES_STORE)) {
        database.createObjectStore(PREFERENCES_STORE, { keyPath: 'id' });
      }
    };
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => {
      databasePromise = null;
      reject(openRequest.error ?? new Error('无法打开本地思维导图存储。'));
    };
  });
  return databasePromise;
}

async function useStore<T>(
  name: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const transaction = (await openDatabase()).transaction(name, mode);
  const result = await callback(transaction.objectStore(name));
  await complete(transaction);
  return result;
}

function normalizeTitle(title: string, fallback: string): string {
  return title.trim().slice(0, 120) || fallback;
}

export function createVisualData(title: string): MindElixirData {
  return MindElixir.new(normalizeTitle(title, '未命名思维导图'));
}

export async function listMindDocuments(): Promise<MindDocument[]> {
  const documents = await useStore(
    DOCUMENTS_STORE,
    'readonly',
    (store) => request(store.getAll()) as Promise<MindDocument[]>,
  );
  return documents.sort((first, second) => second.lastOpenedAt - first.lastOpenedAt);
}

export async function getMindDocument(id: string): Promise<MindDocument | null> {
  return (
    (await useStore(
      DOCUMENTS_STORE,
      'readonly',
      (store) => request(store.get(id)) as Promise<MindDocument | undefined>,
    )) ?? null
  );
}

export async function createMindDocument(
  type: MindDocumentType,
  title = type === 'visual' ? '未命名思维导图' : '未命名 Markdown 脑图',
  payload?: MindElixirData | string,
  settings: Partial<MindDocumentSettings> = {},
): Promise<MindDocument> {
  const now = Date.now();
  const document: MindDocument = {
    id: newId('mind'),
    schemaVersion: 1,
    type,
    title: normalizeTitle(title, type === 'visual' ? '未命名思维导图' : '未命名 Markdown 脑图'),
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    settings: { ...DEFAULT_MIND_SETTINGS, ...settings },
    ...(type === 'visual'
      ? { visualData: (payload as MindElixirData | undefined) ?? createVisualData(title) }
      : { markdown: (payload as string | undefined) ?? `# ${title}\n\n- 在这里开始整理思路` }),
  };
  await useStore(DOCUMENTS_STORE, 'readwrite', async (store) => request(store.put(document)));
  return document;
}

export async function saveMindDocument(
  document: MindDocument,
  update: Partial<Pick<MindDocument, 'title' | 'visualData' | 'markdown' | 'settings'>>,
): Promise<MindDocument> {
  const next: MindDocument = {
    ...document,
    ...update,
    title: normalizeTitle(update.title ?? document.title, '未命名思维导图'),
    settings: { ...document.settings, ...update.settings },
    updatedAt: Date.now(),
  };
  await useStore(DOCUMENTS_STORE, 'readwrite', async (store) => request(store.put(next)));
  return next;
}

export async function touchMindDocument(document: MindDocument): Promise<MindDocument> {
  const next = { ...document, lastOpenedAt: Date.now() };
  await useStore(DOCUMENTS_STORE, 'readwrite', async (store) => request(store.put(next)));
  return next;
}

export async function deleteMindDocument(id: string): Promise<void> {
  const assets = await listMindAssets(id);
  const database = await openDatabase();
  const transaction = database.transaction([DOCUMENTS_STORE, ASSETS_STORE], 'readwrite');
  await request(transaction.objectStore(DOCUMENTS_STORE).delete(id));
  await Promise.all(
    assets.map((asset) => request(transaction.objectStore(ASSETS_STORE).delete(asset.id))),
  );
  await complete(transaction);
}

export async function duplicateMindDocument(document: MindDocument): Promise<MindDocument> {
  const duplicate = await createMindDocument(
    document.type,
    `${document.title} 副本`,
    document.type === 'visual' ? structuredClone(document.visualData) : document.markdown,
    structuredClone(document.settings),
  );
  const assets = await listMindAssets(document.id);
  await Promise.all(
    assets.map((asset) =>
      saveMindAsset({
        ...asset,
        id: newId('asset'),
        documentId: duplicate.id,
        createdAt: Date.now(),
      }),
    ),
  );
  return duplicate;
}

export async function getMindPreferences(): Promise<MindPreferences> {
  const preferences = await useStore(
    PREFERENCES_STORE,
    'readonly',
    (store) => request(store.get('global')) as Promise<MindPreferences | undefined>,
  );
  return (
    preferences ?? {
      id: 'global',
      activeDocumentId: null,
      sidebarCollapsed: false,
      inspectorCollapsed: false,
      markdownSplit: 50,
    }
  );
}

export async function saveMindPreferences(
  update: Partial<MindPreferences>,
): Promise<MindPreferences> {
  const preferences = { ...(await getMindPreferences()), ...update, id: 'global' as const };
  await useStore(PREFERENCES_STORE, 'readwrite', async (store) => request(store.put(preferences)));
  return preferences;
}

export async function listMindAssets(documentId: string): Promise<MindAsset[]> {
  return useStore(
    ASSETS_STORE,
    'readonly',
    (store) => request(store.index('documentId').getAll(documentId)) as Promise<MindAsset[]>,
  );
}

export async function saveMindAsset(asset: MindAsset): Promise<void> {
  await useStore(ASSETS_STORE, 'readwrite', async (store) => request(store.put(asset)));
}
