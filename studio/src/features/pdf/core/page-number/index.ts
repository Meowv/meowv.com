import { PDFDocument } from 'pdf-lib';
import type { PdfOperationResult } from '../types';
import { renderTextToPng } from '../shared/canvas';
import { mapPdfError } from '../shared/errors';
import { sanitizeFileName, stripFileExtension } from '../shared/naming';
import { createGeneratedFile, createOperationResult } from '../shared/result';
import type { WatermarkPosition } from '../watermark';

export type PageNumberFormat = 'plain' | 'two' | 'three' | 'chinese' | 'ratio' | 'chinese-ratio';

export interface PageNumberOptions {
  format: PageNumberFormat;
  startNumber: number;
  pages: number[];
  fontSize: number;
  color: string;
  opacity: number;
  horizontalMargin: number;
  verticalMargin: number;
  position: WatermarkPosition;
  outputName: string;
}

export function formatPageNumber(
  pageNumber: number,
  sequenceEnd: number,
  format: PageNumberFormat,
): string {
  switch (format) {
    case 'two':
      return String(pageNumber).padStart(2, '0');
    case 'three':
      return String(pageNumber).padStart(3, '0');
    case 'chinese':
      return `第 ${pageNumber} 页`;
    case 'ratio':
      return `${pageNumber} / ${sequenceEnd}`;
    case 'chinese-ratio':
      return `第 ${pageNumber} 页，共 ${sequenceEnd} 页`;
    default:
      return String(pageNumber);
  }
}

export function calculatePageNumberSequenceEnd(startNumber: number, pageCount: number): number {
  return startNumber + Math.max(0, pageCount - 1);
}

export function calculatePageNumberPosition(options: {
  pageWidth: number;
  pageHeight: number;
  width: number;
  height: number;
  horizontalMargin: number;
  verticalMargin: number;
  position: WatermarkPosition;
}): { x: number; y: number } {
  const horizontal = options.position.endsWith('left')
    ? options.horizontalMargin
    : options.position.endsWith('right')
      ? options.pageWidth - options.width - options.horizontalMargin
      : (options.pageWidth - options.width) / 2;
  const vertical = options.position.startsWith('top')
    ? options.pageHeight - options.height - options.verticalMargin
    : options.position.startsWith('bottom')
      ? options.verticalMargin
      : (options.pageHeight - options.height) / 2;

  return { x: horizontal, y: vertical };
}

export async function addPageNumbers(
  sourceBytes: Uint8Array,
  options: PageNumberOptions,
  signal?: AbortSignal,
  onProgress?: (current: number, total: number) => void,
): Promise<PdfOperationResult> {
  const startedAt = performance.now();

  try {
    const pdf = await PDFDocument.load(sourceBytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    const selectedPages = new Set(options.pages);
    const sequenceEnd = calculatePageNumberSequenceEnd(options.startNumber, selectedPages.size);
    let sequence = options.startNumber;
    let processed = 0;

    for (const [index, page] of pdf.getPages().entries()) {
      const pageNumber = index + 1;
      if (!selectedPages.has(pageNumber)) {
        continue;
      }
      if (signal?.aborted) {
        throw new DOMException('处理已取消', 'AbortError');
      }

      const text = formatPageNumber(sequence, sequenceEnd, options.format);
      const asset = await renderTextToPng(text, {
        fontSize: options.fontSize,
        color: options.color,
        fontWeight: 500,
        padding: Math.ceil(options.fontSize * 0.25),
      });
      const image = await pdf.embedPng(asset.bytes);
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const position = calculatePageNumberPosition({
        pageWidth,
        pageHeight,
        width: asset.width,
        height: asset.height,
        horizontalMargin: options.horizontalMargin,
        verticalMargin: options.verticalMargin,
        position: options.position,
      });
      page.drawImage(image, {
        x: position.x,
        y: position.y,
        width: asset.width,
        height: asset.height,
        opacity: options.opacity,
      });
      sequence += 1;
      processed += 1;
      onProgress?.(processed, selectedPages.size);
    }

    pdf.setProducer('Meowv PDF');
    pdf.setModificationDate(new Date());
    const bytes = await pdf.save({ useObjectStreams: true });
    const name = sanitizeFileName(stripFileExtension(options.outputName), 'pdf', 'numbered');
    return createOperationResult([createGeneratedFile(name, bytes)], startedAt);
  } catch (error) {
    throw mapPdfError(error);
  }
}
