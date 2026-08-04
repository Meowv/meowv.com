export interface OcrImageInfo {
  kind: 'image';
  file: File;
  url: string;
  width: number;
  height: number;
}

export interface OcrPdfInfo {
  kind: 'pdf';
  file: File;
  bytes: Uint8Array;
  pageCount: number;
  currentPage: number;
  previewUrl: string;
}

export type OcrSourceInfo = OcrImageInfo | OcrPdfInfo;

export interface OcrHistoryEntry {
  id: string;
  fileName: string;
  text: string;
  createdAt: number;
}

export type OcrStage = 'idle' | 'preparing' | 'loading' | 'recognizing' | 'complete' | 'error';
