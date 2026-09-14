import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import type { MermaidDocument } from '@/features/mermaid/types';

const KEY = `${STORAGE_POLICY.namespace('mermaid')}:documents`;
const ACTIVE_KEY = `${STORAGE_POLICY.namespace('mermaid')}:active`;
const HISTORY_KEY = `${STORAGE_POLICY.namespace('mermaid')}:history`;
const DB_NAME = 'meowv-studio-mermaid-v1';
const STORE_NAME = 'documents';
const MAX_TITLE = 120;
const MAX_SOURCE = 200_000;
const MAX_CONFIG = 120_000;

export function normalizeMermaidDocument(value: unknown): MermaidDocument | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<MermaidDocument>;
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.id !== 'string' ||
    !candidate.id ||
    candidate.id.length > 200 ||
    typeof candidate.title !== 'string' ||
    typeof candidate.source !== 'string' ||
    typeof candidate.configText !== 'string' ||
    !Number.isFinite(candidate.createdAt) ||
    !Number.isFinite(candidate.updatedAt) ||
    candidate.source.length > MAX_SOURCE ||
    candidate.configText.length > MAX_CONFIG
  )
    return null;
  const createdAt = candidate.createdAt as number;
  const updatedAt = candidate.updatedAt as number;
  return {
    schemaVersion: 1,
    id: candidate.id,
    title: candidate.title.slice(0, MAX_TITLE) || '未命名图表',
    source: candidate.source,
    configText: candidate.configText,
    createdAt,
    updatedAt,
  };
}

function readLocal<T>(key: string, fallback: T): T {
  if (!storageAvailable()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLocal(key: string, value: unknown): boolean {
  if (!storageAvailable()) return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function localDocuments(key: string): MermaidDocument[] {
  const raw = readLocal<unknown>(key, []);
  return (Array.isArray(raw) ? raw : [])
    .map(normalizeMermaidDocument)
    .filter((item): item is MermaidDocument => Boolean(item));
}
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'));
  });
}
async function putDb(document: MermaidDocument): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(document);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function getAllDb(): Promise<MermaidDocument[]> {
  const db = await openDb();
  try {
    return await new Promise<MermaidDocument[]>((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result as MermaidDocument[]);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function listMermaidDocuments(): Promise<MermaidDocument[]> {
  const local = localDocuments(KEY);
  try {
    const docs = (await getAllDb())
      .map(normalizeMermaidDocument)
      .filter(Boolean) as MermaidDocument[];
    const byId = new Map<string, MermaidDocument>();
    for (const document of [...local, ...docs]) {
      const previous = byId.get(document.id);
      if (!previous || document.updatedAt >= previous.updatedAt) byId.set(document.id, document);
    }
    return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return local.sort((a, b) => b.updatedAt - a.updatedAt);
  }
}
export async function saveMermaidDocument(document: MermaidDocument): Promise<boolean> {
  const normalized = normalizeMermaidDocument(document);
  if (!normalized) return false;
  try {
    await putDb(normalized);
    // 保留轻量镜像，便于 IndexedDB 暂时不可用时恢复最近文档。
    writeLocal(
      KEY,
      [normalized, ...localDocuments(KEY).filter((item) => item.id !== normalized.id)].slice(0, 30),
    );
  } catch {
    if (
      !writeLocal(
        KEY,
        [normalized, ...localDocuments(KEY).filter((item) => item.id !== normalized.id)].slice(
          0,
          30,
        ),
      )
    )
      return false;
  }
  writeLocal(ACTIVE_KEY, document.id);
  return true;
}
export function activeMermaidId(): string | null {
  const value = readLocal<unknown>(ACTIVE_KEY, null);
  return typeof value === 'string' && value.length <= 200 ? value : null;
}
export function saveActiveMermaidId(id: string): void {
  writeLocal(ACTIVE_KEY, id);
}
export function saveMermaidHistory(document: MermaidDocument): boolean {
  const normalized = normalizeMermaidDocument(document);
  if (!normalized) return false;
  const history = localDocuments(HISTORY_KEY).filter(
    (item) => item.source !== normalized.source || item.configText !== normalized.configText,
  );
  return writeLocal(HISTORY_KEY, [normalized, ...history].slice(0, 20));
}
export function listMermaidHistory(): MermaidDocument[] {
  return localDocuments(HISTORY_KEY).sort((a, b) => b.updatedAt - a.updatedAt);
}
