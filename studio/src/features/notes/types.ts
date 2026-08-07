export type NoteEditorMode = 'edit' | 'preview';

export interface NoteSticky {
  id: string;
  content: string;
  color: string;
  collapsed: boolean;
  mode: NoteEditorMode;
  opacity: number;
  pinned: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  schemaVersion: 1;
  createdAt: number;
  updatedAt: number;
  lastEditedAt: number;
}

export interface NotesPreferences {
  id: 'global';
  headerVisible?: boolean;
}

export const NOTE_DEFAULT_COLOR = '#d97706';
export const NOTE_DEFAULT_OPACITY = 0.85;
export const NOTE_MIN_OPACITY = 0.3;
export const NOTE_MAX_OPACITY = 1;
export const NOTE_PIN_Z_BASE = 1_000_000;
export const NOTE_MIN_WIDTH = 220;
export const NOTE_MIN_HEIGHT = 140;
export const NOTE_DEFAULT_WIDTH = 300;
export const NOTE_DEFAULT_HEIGHT = 220;

export const NOTE_COLOR_OPTIONS: string[] = [
  '#d97706',
  '#f59e0b',
  '#fbbf24',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#6366f1',
  '#0ea5e9',
  '#14b8a6',
  '#22c55e',
  '#475569',
  '#a3a3a3',
];
