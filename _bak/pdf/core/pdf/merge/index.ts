import { PDFDocument } from "pdf-lib";
import type { LoadedPdfFile, PdfOperationResult } from "../types";
import { mapPdfError } from "../shared/errors";
import { sanitizeFileName, stripFileExtension } from "../shared/naming";
import { createGeneratedFile, createOperationResult } from "../shared/result";

export async function mergePdfFiles(
  files: LoadedPdfFile[],
  outputName = "merged.pdf",
  signal?: AbortSignal
): Promise<PdfOperationResult> {
  const startedAt = performance.now();
  if (files.length < 2) {
    throw new Error("至少需要两个 PDF 才能合并。");
  }

  try {
    const target = await PDFDocument.create();

    for (const file of files) {
      if (signal?.aborted) {
        throw new DOMException("处理已取消", "AbortError");
      }

      const source = await PDFDocument.load(file.bytes, {
        ignoreEncryption: false,
        updateMetadata: false
      });
      const pages = await target.copyPages(source, source.getPageIndices());
      pages.forEach((page) => target.addPage(page));
    }

    target.setProducer("Meowv PDF");
    target.setModificationDate(new Date());
    const bytes = await target.save({ useObjectStreams: true });
    const name = sanitizeFileName(stripFileExtension(outputName), "pdf", "merged");

    return createOperationResult([createGeneratedFile(name, bytes)], startedAt);
  } catch (error) {
    throw mapPdfError(error);
  }
}
