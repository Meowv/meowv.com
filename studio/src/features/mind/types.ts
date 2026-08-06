import type { MindElixirData } from 'mind-elixir';

export type MindDocumentType = 'visual' | 'markdown';
export type MindDirection = 'left' | 'right' | 'both' | 'down';
export type MindThemeId = 'studio-light' | 'studio-dark' | 'green' | 'blue' | 'orange' | 'mono';

export interface MindDocumentSettings {
  themeId: MindThemeId;
  direction: MindDirection;
  background: string;
  exportScale: 1 | 2 | 3;
  exportBackground: 'transparent' | 'document';
}

export interface MindDocument {
  id: string;
  schemaVersion: 1;
  type: MindDocumentType;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  visualData?: MindElixirData;
  markdown?: string;
  settings: MindDocumentSettings;
}

export interface MindAsset {
  id: string;
  documentId: string;
  type: 'image' | 'thumbnail';
  mimeType: string;
  fileName: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

export interface MindPreferences {
  id: 'global';
  activeDocumentId: string | null;
  sidebarCollapsed: boolean;
  inspectorCollapsed: boolean;
  markdownSplit: number;
}

export const DEFAULT_MIND_SETTINGS: MindDocumentSettings = {
  themeId: 'studio-light',
  direction: 'both',
  background: '#f8fafc',
  exportScale: 2,
  exportBackground: 'document',
};
