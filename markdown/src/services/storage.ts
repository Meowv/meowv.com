import {
  DEFAULT_WORKSPACE_PREFERENCES,
  WorkspaceError,
  type AutoSaveDelay,
  type ThemePreference,
  type WorkspacePreferences,
} from "../types/workspace";

const DATABASE_NAME = "meowv-markdown-studio";
const DATABASE_VERSION = 1;
const HANDLE_STORE = "workspace-handles";
const PREFERENCE_STORE = "preferences";
const RECENT_DIRECTORY_KEY = "recent-directory";
const PREFERENCES_KEY = "workspace-preferences";

type StoreName = typeof HANDLE_STORE | typeof PREFERENCE_STORE;

function getIndexedDB(): IDBFactory {
  if (typeof globalThis.indexedDB === "undefined") {
    throw new WorkspaceError(
      "STORAGE_UNAVAILABLE",
      "当前浏览器不支持 IndexedDB，无法记住最近工作空间。",
    );
  }
  return globalThis.indexedDB;
}

export function isWorkspaceStorageSupported(): boolean {
  return typeof globalThis.indexedDB !== "undefined";
}

function toStorageError(
  error: unknown,
  fallbackMessage: string,
): WorkspaceError {
  if (error instanceof WorkspaceError) {
    return error;
  }

  const name =
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
      ? error.name
      : "";

  const message =
    name === "DataCloneError"
      ? "浏览器无法保存该目录句柄，请重新打开工作空间。"
      : name === "QuotaExceededError"
        ? "浏览器本地存储空间不足。"
        : fallbackMessage;

  return new WorkspaceError("STORAGE_UNAVAILABLE", message, { cause: error });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;

    try {
      request = getIndexedDB().open(DATABASE_NAME, DATABASE_VERSION);
    } catch (error) {
      reject(toStorageError(error, "无法打开浏览器本地存储。"));
      return;
    }

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(HANDLE_STORE)) {
        database.createObjectStore(HANDLE_STORE);
      }
      if (!database.objectStoreNames.contains(PREFERENCE_STORE)) {
        database.createObjectStore(PREFERENCE_STORE);
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => {
      reject(
        toStorageError(request.error, "无法打开浏览器本地存储。"),
      );
    };
    request.onblocked = () => {
      reject(
        new WorkspaceError(
          "STORAGE_UNAVAILABLE",
          "本地存储正在被其他页面占用，请关闭旧页面后重试。",
        ),
      );
    };
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(toStorageError(request.error, "本地存储操作失败。"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(toStorageError(transaction.error, "本地存储事务失败。"));
    transaction.onabort = () =>
      reject(toStorageError(transaction.error, "本地存储事务已中止。"));
  });
}

function abortTransaction(transaction: IDBTransaction): void {
  try {
    transaction.abort();
  } catch {
    // 事务可能已经自动完成或中止，无需再次处理。
  }
}

async function withStore<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, mode);
  const done = transactionDone(transaction);

  try {
    const result = await operation(transaction.objectStore(storeName));
    await done;
    return result;
  } catch (error) {
    abortTransaction(transaction);
    await done.catch(() => undefined);
    throw toStorageError(error, "本地存储操作失败。");
  } finally {
    database.close();
  }
}

/**
 * 只保存一个最近工作空间的 DirectoryHandle，不保存子文件列表或文件名历史。
 */
export async function saveRecentDirectory(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  if (handle.kind !== "directory") {
    throw new WorkspaceError(
      "INVALID_PATH",
      "最近工作空间只能保存目录句柄。",
    );
  }

  await withStore(HANDLE_STORE, "readwrite", async (store) => {
    await requestResult(store.put(handle, RECENT_DIRECTORY_KEY));
  });
}

export async function getRecentDirectory(): Promise<FileSystemDirectoryHandle | null> {
  return withStore(HANDLE_STORE, "readonly", async (store) => {
    const stored = await requestResult<unknown>(
      store.get(RECENT_DIRECTORY_KEY),
    );

    if (
      typeof stored === "object" &&
      stored !== null &&
      "kind" in stored &&
      stored.kind === "directory"
    ) {
      return stored as FileSystemDirectoryHandle;
    }

    return null;
  });
}

export async function clearRecentDirectory(): Promise<void> {
  await withStore(HANDLE_STORE, "readwrite", async (store) => {
    await requestResult(store.delete(RECENT_DIRECTORY_KEY));
  });
}

function isTheme(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function isAutoSaveDelay(value: unknown): value is AutoSaveDelay {
  return value === 1000 || value === 2000 || value === 5000;
}

function finiteNumberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : fallback;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizePreferences(value: unknown): WorkspacePreferences {
  const stored =
    typeof value === "object" && value !== null
      ? (value as Partial<Record<keyof WorkspacePreferences, unknown>>)
      : {};
  const defaults = DEFAULT_WORKSPACE_PREFERENCES;

  return {
    theme: isTheme(stored.theme) ? stored.theme : defaults.theme,
    autoSaveEnabled: booleanOrDefault(
      stored.autoSaveEnabled,
      defaults.autoSaveEnabled,
    ),
    autoSaveDelay: isAutoSaveDelay(stored.autoSaveDelay)
      ? stored.autoSaveDelay
      : defaults.autoSaveDelay,
    editorFontSize: finiteNumberInRange(
      stored.editorFontSize,
      10,
      28,
      defaults.editorFontSize,
    ),
    wordWrap: booleanOrDefault(stored.wordWrap, defaults.wordWrap),
    lineNumbers: booleanOrDefault(stored.lineNumbers, defaults.lineNumbers),
    previewEnabled: booleanOrDefault(
      stored.previewEnabled,
      defaults.previewEnabled,
    ),
    syncScroll: booleanOrDefault(stored.syncScroll, defaults.syncScroll),
    sidebarWidth: finiteNumberInRange(
      stored.sidebarWidth,
      116,
      600,
      defaults.sidebarWidth,
    ),
    editorWidth: finiteNumberInRange(
      stored.editorWidth,
      360,
      1200,
      defaults.editorWidth,
    ),
  };
}

export async function getPreferences(): Promise<WorkspacePreferences> {
  return withStore(PREFERENCE_STORE, "readonly", async (store) => {
    const stored = await requestResult<unknown>(store.get(PREFERENCES_KEY));
    return normalizePreferences(stored);
  });
}

export const loadPreferences = getPreferences;

export async function savePreferences(
  preferences: Partial<WorkspacePreferences>,
): Promise<WorkspacePreferences> {
  const current = await getPreferences();
  const normalized = normalizePreferences({ ...current, ...preferences });

  await withStore(PREFERENCE_STORE, "readwrite", async (store) => {
    await requestResult(store.put(normalized, PREFERENCES_KEY));
  });

  return normalized;
}

export async function setPreference<K extends keyof WorkspacePreferences>(
  key: K,
  value: WorkspacePreferences[K],
): Promise<WorkspacePreferences> {
  return savePreferences({ [key]: value } as Pick<WorkspacePreferences, K>);
}

export async function getPreference<K extends keyof WorkspacePreferences>(
  key: K,
): Promise<WorkspacePreferences[K]> {
  const preferences = await getPreferences();
  return preferences[key];
}

export async function clearPreferences(): Promise<void> {
  await withStore(PREFERENCE_STORE, "readwrite", async (store) => {
    await requestResult(store.delete(PREFERENCES_KEY));
  });
}

export async function clearWorkspaceStorage(): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(
    [HANDLE_STORE, PREFERENCE_STORE],
    "readwrite",
  );
  const done = transactionDone(transaction);

  try {
    const handleClear = requestResult(
      transaction.objectStore(HANDLE_STORE).clear(),
    );
    const preferenceClear = requestResult(
      transaction.objectStore(PREFERENCE_STORE).clear(),
    );
    await Promise.all([handleClear, preferenceClear]);
    await done;
  } catch (error) {
    abortTransaction(transaction);
    await done.catch(() => undefined);
    throw toStorageError(error, "无法清除本地工作空间设置。");
  } finally {
    database.close();
  }
}
