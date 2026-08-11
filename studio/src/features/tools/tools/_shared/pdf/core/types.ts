export type PdfErrorCode =
  | 'INVALID_FILE'
  | 'CORRUPTED_PDF'
  | 'ENCRYPTED_PDF'
  | 'UNSUPPORTED_PDF'
  | 'OUT_OF_MEMORY'
  | 'PROCESS_ABORTED'
  | 'RENDER_FAILED'
  | 'EXPORT_FAILED'
  | 'UNKNOWN_ERROR';

export interface GeneratedFile {
  name: string;
  blob: Blob;
  size: number;
  mimeType: string;
}

export interface PdfWarning {
  code: string;
  message: string;
  pageNumber?: number;
}

export interface PdfOperationResult {
  success: boolean;
  files: GeneratedFile[];
  warnings: PdfWarning[];
  duration: number;
}

export interface LoadedPdfFile {
  id: string;
  file: File;
  name: string;
  size: number;
  bytes: Uint8Array;
  pageCount: number;
  status: 'ready' | 'error';
  error?: string;
}

export interface PageState {
  id: string;
  sourceIndex: number;
  originalPageNumber: number;
  rotation: number;
  deleted: boolean;
}

export interface PdfMetadata {
  pdfVersion: string;
  pageSizes: string;
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  creationDate: string;
  modificationDate: string;
  pageCount: number;
}

export type WorkspaceStatus = 'empty' | 'loading' | 'ready' | 'processing' | 'completed' | 'failed';

export interface PageRangeGroup {
  label: string;
  pages: number[];
}
