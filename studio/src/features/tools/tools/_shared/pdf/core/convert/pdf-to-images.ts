import type { PdfOperationResult } from '../types';
import { createOperationResult } from '../shared/result';
import { renderPdfPagesToImages } from '../render/pdfjs';

export async function pdfToImages(options: {
  bytes: Uint8Array;
  pages: number[];
  format: 'png' | 'jpeg' | 'webp';
  scale: number;
  quality: number;
  signal?: AbortSignal;
  onProgress?: (current: number, total: number) => void;
}): Promise<PdfOperationResult> {
  const startedAt = performance.now();
  const { files, warnings } = await renderPdfPagesToImages(options);
  return createOperationResult(files, startedAt, warnings);
}
