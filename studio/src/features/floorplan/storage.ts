import { STORAGE_POLICY } from '@/core/privacy/storage';
import { newPlanDocument, parsePlanFile, validatePlanDocument } from './files';
import type { PlanDocument } from './types';

const DATABASE = STORAGE_POLICY.namespace('floorplan');
const STORE = 'documents';
let databasePromise: Promise<IDBDatabase> | null = null;
export const createDocument = newPlanDocument;

export class PlanConflictError extends Error {
  constructor() {
    super('此方案已在其他窗口修改或删除。请加载最新方案，或另存副本。');
    this.name = 'PlanConflictError';
  }
}
function storageError(cause?: unknown): Error {
  return cause instanceof PlanConflictError
    ? cause
    : new Error('本地保存失败，可能是存储空间不足或浏览器禁用存储。请重试或导出方案备份。', {
        cause,
      });
}
function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(storageError());
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onblocked = () => {
      blocked = true;
      reject(new Error('本地存储升级被其他窗口阻塞。请关闭旧窗口后重试。'));
    };
    request.onerror = () => reject(storageError(request.error));
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        db.close();
        databasePromise = null;
      };
      db.onclose = () => {
        databasePromise = null;
      };
      resolve(db);
    };
  }).catch((cause) => {
    databasePromise = null;
    throw cause;
  });
  return databasePromise;
}

export async function listDocuments(): Promise<PlanDocument[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    let documents: PlanDocument[] = [];
    let failure: unknown;
    request.onsuccess = () => {
      try {
        documents = (request.result as unknown[]).map(validatePlanDocument);
      } catch (cause) {
        failure = cause;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(documents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    tx.onabort = tx.onerror = () => reject(failure ?? storageError(tx.error));
  });
}

export async function saveDocument(
  doc: PlanDocument,
  expectedRevision: number | null,
): Promise<PlanDocument> {
  const validated = validatePlanDocument(doc);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const request = store.get(validated.id);
    let saved: PlanDocument;
    let failure: unknown;
    request.onsuccess = () => {
      const existing = request.result as PlanDocument | undefined;
      if (
        (expectedRevision === null && existing) ||
        (expectedRevision !== null && existing?.revision !== expectedRevision)
      ) {
        failure = new PlanConflictError();
        tx.abort();
        return;
      }
      try {
        saved = { ...validated, revision: (existing?.revision ?? 0) + 1 };
        store.put(saved);
      } catch (cause) {
        failure = storageError(cause);
        tx.abort();
      }
    };
    // 等待事务完成后才向界面报告保存成功，避免 request 成功但磁盘提交失败。
    tx.oncomplete = () => resolve(saved);
    tx.onabort = tx.onerror = () => reject(failure ?? storageError(tx.error));
  });
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(storageError(tx.error));
  });
}

export function loadLegacyPlan(): PlanDocument | null {
  const text = localStorage.getItem('huxing-design-v1');
  // 保留旧副本；迁移失败时仍可回到原页面导出。
  return text ? parsePlanFile(text, '原户型方案.json') : null;
}
