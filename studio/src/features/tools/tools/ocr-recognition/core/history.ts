import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import type { OcrHistoryEntry } from '@/features/tools/tools/ocr-recognition/types';

const HISTORY_KEY = `${STORAGE_POLICY.namespace('ocr')}:history`;
const MAX_HISTORY_ENTRIES = 20;

function readHistory(): OcrHistoryEntry[] {
  if (!storageAvailable()) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as unknown;
    if (!Array.isArray(saved)) return [];
    return saved.filter(isHistoryEntry).slice(0, MAX_HISTORY_ENTRIES);
  } catch {
    return [];
  }
}

function isHistoryEntry(value: unknown): value is OcrHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<OcrHistoryEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.fileName === 'string' &&
    typeof entry.text === 'string' &&
    typeof entry.createdAt === 'number'
  );
}

function writeHistory(entries: OcrHistoryEntry[]): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY_ENTRIES)));
  } catch {
    // 本地存储不可用不影响当前识别结果。
  }
}

export function loadOcrHistory(): OcrHistoryEntry[] {
  return readHistory();
}

export function addOcrHistory(fileName: string, text: string): OcrHistoryEntry {
  const entry: OcrHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName,
    text,
    createdAt: Date.now(),
  };
  writeHistory([entry, ...readHistory()]);
  return entry;
}

export function removeOcrHistory(id: string): OcrHistoryEntry[] {
  const entries = readHistory().filter((entry) => entry.id !== id);
  writeHistory(entries);
  return entries;
}
