import { PDFDocument } from "pdf-lib";
import type { LoadedPdfFile } from "../types";
import { openPdfDocument, type ManagedPdfDocument } from "../render/pdfjs";
import { getPdfErrorMessage, PdfProcessingError, mapPdfError } from "./errors";

const PDF_HEADER = "%PDF-";

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function loadPdfFile(file: File): Promise<LoadedPdfFile> {
  const extensionValid = file.name.toLowerCase().endsWith(".pdf");
  const mimeValid = !file.type || file.type === "application/pdf";

  if (!extensionValid || !mimeValid) {
    throw new PdfProcessingError("INVALID_FILE", "请选择扩展名为 .pdf 的文件。");
  }

  const buffer = await file.arrayBuffer();
  const header = new TextDecoder("latin1").decode(buffer.slice(0, PDF_HEADER.length));

  if (header !== PDF_HEADER) {
    throw new PdfProcessingError("INVALID_FILE", "文件头不是有效的 PDF 格式。");
  }

  try {
    const bytes = new Uint8Array(buffer);
    const pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false
    });
    let previewDocument: ManagedPdfDocument | undefined;
    try {
      previewDocument = await openPdfDocument(bytes);
      if (previewDocument.numPages !== pdf.getPageCount()) {
        throw new PdfProcessingError("UNSUPPORTED_PDF", getPdfErrorMessage("UNSUPPORTED_PDF"));
      }
    } catch (error) {
      const mapped = mapPdfError(error);
      throw mapped.code === "UNKNOWN_ERROR"
        ? new PdfProcessingError("UNSUPPORTED_PDF", getPdfErrorMessage("UNSUPPORTED_PDF"), error)
        : mapped;
    } finally {
      await previewDocument?.destroyDocument();
    }

    return {
      id: createId(),
      file,
      name: file.name,
      size: file.size,
      bytes,
      pageCount: pdf.getPageCount(),
      status: "ready"
    };
  } catch (error) {
    throw mapPdfError(error);
  }
}

export function warnForLargePdf(file: LoadedPdfFile): string[] {
  const warnings: string[] = [];
  if (file.size > 100 * 1024 * 1024) {
    warnings.push("文件超过 100 MB，处理时可能占用较多内存。");
  }
  if (file.pageCount > 500) {
    warnings.push("文件超过 500 页，缩略图将分批加载。");
  }
  return warnings;
}
