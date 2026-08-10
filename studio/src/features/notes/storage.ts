import {
  NOTE_COLOR_OPTIONS,
  NOTE_DEFAULT_COLOR,
  NOTE_DEFAULT_OPACITY,
  type NotesPreferences,
  type NoteSticky,
} from './types';

const DATABASE_NAME = 'meowv-studio-notes';
const DATABASE_VERSION = 1;
const NOTES_STORE = 'notes';
const PREFERENCES_STORE = 'preferences';

let databasePromise: Promise<IDBDatabase> | null = null;

function newNoteId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `note:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
      reject(new Error('当前浏览器不支持 IndexedDB，无法保存便签。'));
      return;
    }
    const openRequest = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    openRequest.onupgradeneeded = () => {
      const database = openRequest.result;
      if (!database.objectStoreNames.contains(NOTES_STORE)) {
        const store = database.createObjectStore(NOTES_STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
        store.createIndex('lastEditedAt', 'lastEditedAt');
      }
      if (!database.objectStoreNames.contains(PREFERENCES_STORE)) {
        database.createObjectStore(PREFERENCES_STORE, { keyPath: 'id' });
      }
    };
    openRequest.onerror = () => reject(openRequest.error ?? new Error('IndexedDB 打开失败。'));
    openRequest.onsuccess = () => resolve(openRequest.result);
  });
  return databasePromise;
}

export function createNoteSticky(title: string, x: number, y: number, zIndex: number): NoteSticky {
  const timestamp = Date.now();
  const color =
    NOTE_COLOR_OPTIONS[Math.floor(Math.random() * NOTE_COLOR_OPTIONS.length)]?.value ??
    NOTE_DEFAULT_COLOR;
  return {
    id: newNoteId(),
    content: title,
    color,
    collapsed: false,
    mode: 'edit',
    opacity: NOTE_DEFAULT_OPACITY,
    pinned: false,
    x,
    y,
    width: 300,
    height: 220,
    zIndex,
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastEditedAt: timestamp,
  };
}

function toPlainNote(note: NoteSticky): NoteSticky {
  return JSON.parse(JSON.stringify(note)) as NoteSticky;
}

function normalizeNote(note: NoteSticky): NoteSticky {
  if (typeof note.mode === 'undefined') {
    note.mode = note.content.trim().length === 0 ? 'edit' : 'preview';
  }
  if (typeof note.opacity === 'undefined') note.opacity = NOTE_DEFAULT_OPACITY;
  if (typeof note.pinned === 'undefined') note.pinned = false;
  return note;
}

export async function saveNoteSticky(note: NoteSticky): Promise<NoteSticky> {
  if (!note.id) throw new Error('便签缺少 id。');
  const database = await openDatabase();
  const transaction = database.transaction(NOTES_STORE, 'readwrite');
  transaction.objectStore(NOTES_STORE).put(toPlainNote(note));
  await complete(transaction);
  return note;
}

export async function saveNotesBatch(notes: NoteSticky[]): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(NOTES_STORE, 'readwrite');
  const store = transaction.objectStore(NOTES_STORE);
  for (const note of notes) {
    if (note.id) store.put(toPlainNote(note));
  }
  await complete(transaction);
}

export async function clearNoteStickies(): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(NOTES_STORE, 'readwrite');
  transaction.objectStore(NOTES_STORE).clear();
  await complete(transaction);
}

export async function deleteNoteSticky(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(NOTES_STORE, 'readwrite');
  transaction.objectStore(NOTES_STORE).delete(id);
  await complete(transaction);
}

export async function listNoteStickies(): Promise<NoteSticky[]> {
  const database = await openDatabase();
  const transaction = database.transaction(NOTES_STORE, 'readonly');
  const result = await request<NoteSticky[]>(transaction.objectStore(NOTES_STORE).getAll());
  return (result ?? []).map(normalizeNote);
}

async function getPreferences(): Promise<NotesPreferences | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(PREFERENCES_STORE, 'readonly');
  return request(transaction.objectStore(PREFERENCES_STORE).get('global'));
}

export async function saveNotesPreferences(patch: Partial<NotesPreferences>): Promise<void> {
  const database = await openDatabase();
  const current = await getPreferences();
  const next: NotesPreferences = { ...(current ?? { id: 'global' }), ...patch, id: 'global' };
  const transaction = database.transaction(PREFERENCES_STORE, 'readwrite');
  transaction.objectStore(PREFERENCES_STORE).put(next);
  await complete(transaction);
}

export async function getStoredNotesPreferences(): Promise<NotesPreferences> {
  const current = await getPreferences();
  return current ?? { id: 'global' };
}
