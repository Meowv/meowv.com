export interface MermaidDocumentConfig {
  theme?: string;
  look?: string;
  handDrawn?: boolean;
  layout?: string;
  flowchart?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MermaidDocument {
  schemaVersion: 1;
  id: string;
  title: string;
  source: string;
  configText: string;
  createdAt: number;
  updatedAt: number;
}

export interface MermaidShareSnapshot {
  protocol: 1;
  title: string;
  source: string;
  configText: string;
}

export type MermaidPreviewState = 'idle' | 'loading' | 'success' | 'error' | 'engine-error';
