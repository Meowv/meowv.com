import type { NoteSticky } from './types';

const BACKUP_FORMAT = 'meowv-studio-notes';
const BACKUP_VERSION = 1;
const MAX_BACKUP_NOTES = 10_000;

interface NotesBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  notes: NoteSticky[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNoteSticky(value: unknown): value is NoteSticky {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.content === 'string' &&
    typeof value.color === 'string' &&
    /^#[0-9a-f]{6}$/i.test(value.color) &&
    typeof value.collapsed === 'boolean' &&
    (value.layoutMode === undefined ||
      value.layoutMode === 'full' ||
      value.layoutMode === 'compact' ||
      value.layoutMode === 'stack') &&
    (value.mode === 'edit' || value.mode === 'preview') &&
    isFiniteNumber(value.opacity) &&
    value.opacity >= 0 &&
    value.opacity <= 1 &&
    typeof value.pinned === 'boolean' &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    value.width > 0 &&
    isFiniteNumber(value.height) &&
    value.height > 0 &&
    isFiniteNumber(value.zIndex) &&
    value.schemaVersion === 1 &&
    isFiniteNumber(value.createdAt) &&
    isFiniteNumber(value.updatedAt) &&
    isFiniteNumber(value.lastEditedAt)
  );
}

function noteSignature(note: NoteSticky): string {
  return JSON.stringify([
    note.content,
    note.color,
    note.mode,
    note.opacity,
    note.pinned,
    note.schemaVersion,
    note.createdAt,
    note.updatedAt,
    note.lastEditedAt,
  ]);
}

export function serializeNotesBackup(notes: NoteSticky[]): string {
  const backup: NotesBackup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    notes,
  };
  return JSON.stringify(backup, null, 2);
}

export function parseNotesBackup(text: string): NoteSticky[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('备份文件不是有效的 JSON。');
  }
  if (
    !isRecord(value) ||
    value.format !== BACKUP_FORMAT ||
    value.version !== BACKUP_VERSION ||
    !Array.isArray(value.notes)
  ) {
    throw new Error('备份文件格式或版本不受支持。');
  }
  if (value.notes.length > MAX_BACKUP_NOTES) throw new Error('备份中的便签数量过多。');
  if (!value.notes.every(isNoteSticky)) throw new Error('备份包含无效的便签数据。');
  return value.notes;
}

export function mergeNotesBackup(
  current: NoteSticky[],
  imported: NoteSticky[],
  newId: () => string,
): NoteSticky[] {
  const ids = new Set(current.map((note) => note.id));
  const signatures = new Set(current.map(noteSignature));
  const added: NoteSticky[] = [];
  for (const note of imported) {
    const signature = noteSignature(note);
    let id = note.id;
    if (ids.has(id)) {
      if (signatures.has(signature)) continue;
      do {
        id = newId();
      } while (ids.has(id));
    }
    added.push({ ...note, id });
    ids.add(id);
    signatures.add(signature);
  }
  return added;
}
