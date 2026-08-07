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

export const NOTE_DEFAULT_COLOR = '#FEF3C7';
export const NOTE_DEFAULT_OPACITY = 0.85;
export const NOTE_MIN_OPACITY = 0.3;
export const NOTE_MAX_OPACITY = 1;
export const NOTE_PIN_Z_BASE = 1_000_000;
export const NOTE_MIN_WIDTH = 220;
export const NOTE_MIN_HEIGHT = 140;
export const NOTE_DEFAULT_WIDTH = 300;
export const NOTE_DEFAULT_HEIGHT = 220;

export const NOTE_COLOR_OPTIONS = [
  { name: '经典黄', value: '#FEF3C7' },
  { name: '蜜桃橙', value: '#FED7AA' },
  { name: '珊瑚红', value: '#FECACA' },
  { name: '樱花粉', value: '#FBCFE8' },
  { name: '薰衣草', value: '#E9D5FF' },
  { name: '淡靛蓝', value: '#C7D2FE' },
  { name: '天空蓝', value: '#BAE6FD' },
  { name: '薄荷青', value: '#99F6E4' },
  { name: '抹茶绿', value: '#BBF7D0' },
  { name: '云雾灰', value: '#E2E8F0' },
  { name: '奶油白', value: '#FEFCE8' },
  { name: '燕麦棕', value: '#E7D7C9' },
];
