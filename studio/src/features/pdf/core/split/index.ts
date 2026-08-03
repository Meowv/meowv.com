import { PDFDocument } from 'pdf-lib';
import type { PageRangeGroup, PdfOperationResult } from '../types';
import { mapPdfError } from '../shared/errors';
import { sanitizeFileName, stripFileExtension } from '../shared/naming';
import { createGeneratedFile, createOperationResult } from '../shared/result';

export async function splitPdf(
  sourceBytes: Uint8Array,
  groups: PageRangeGroup[],
  prefix = 'split',
  signal?: AbortSignal,
): Promise<PdfOperationResult> {
  const startedAt = performance.now();
  if (groups.length === 0) {
    throw new Error('请至少选择一组页码。');
  }

  try {
    const source = await PDFDocument.load(sourceBytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    const baseName = stripFileExtension(prefix) || 'split';
    const files = [];

    for (const group of groups) {
      if (signal?.aborted) {
        throw new DOMException('处理已取消', 'AbortError');
      }

      const output = await PDFDocument.create();
      const indices = group.pages.map((page) => page - 1);
      const copiedPages = await output.copyPages(source, indices);
      copiedPages.forEach((page) => output.addPage(page));
      output.setProducer('Meowv PDF');
      const bytes = await output.save({ useObjectStreams: true });
      const name = sanitizeFileName(`${baseName}-${group.label}`, 'pdf', group.label);
      files.push(createGeneratedFile(name, bytes));
    }

    return createOperationResult(files, startedAt);
  } catch (error) {
    throw mapPdfError(error);
  }
}
