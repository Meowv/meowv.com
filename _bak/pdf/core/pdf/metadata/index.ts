import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import type { PdfMetadata, PdfOperationResult } from "../types";
import { mapPdfError } from "../shared/errors";
import { sanitizeFileName, stripFileExtension } from "../shared/naming";
import { createGeneratedFile, createOperationResult } from "../shared/result";

function safeDate(value: Date | undefined): string {
  return value && !Number.isNaN(value.getTime()) ? value.toISOString() : "";
}

function parseDate(value: string): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function deleteInfoEntry(pdf: PDFDocument, key: PDFName): void {
  const info = pdf.context.lookup(pdf.context.trailerInfo.Info);
  if (info instanceof PDFDict) {
    info.delete(key);
  }
}

function updateTextEntry(
  pdf: PDFDocument,
  key: PDFName,
  value: string,
  write: (value: string) => void
): void {
  if (value.trim()) {
    write(value);
  } else {
    deleteInfoEntry(pdf, key);
  }
}

function updateDateEntry(
  pdf: PDFDocument,
  key: PDFName,
  value: string,
  write: (value: Date) => void
): void {
  if (!value.trim()) {
    deleteInfoEntry(pdf, key);
    return;
  }

  const date = parseDate(value);
  if (!date) {
    throw new Error("元数据日期格式无效。");
  }
  write(date);
}

export async function readPdfMetadata(sourceBytes: Uint8Array): Promise<PdfMetadata> {
  try {
    const pdf = await PDFDocument.load(sourceBytes, {
      ignoreEncryption: false,
      updateMetadata: false
    });
    const versionMatch = new TextDecoder("latin1")
      .decode(sourceBytes.slice(0, 16))
      .match(/%PDF-([\d.]+)/);
    const pageSizes = [
      ...new Set(
        pdf.getPages().map((page) => {
          const { width, height } = page.getSize();
          const widthMm = Math.round((width * 25.4) / 72);
          const heightMm = Math.round((height * 25.4) / 72);
          return `${widthMm} × ${heightMm} mm`;
        })
      )
    ];
    return {
      pdfVersion: versionMatch?.[1] ?? "未知",
      pageSizes: pageSizes.join("、"),
      title: pdf.getTitle() ?? "",
      author: pdf.getAuthor() ?? "",
      subject: pdf.getSubject() ?? "",
      keywords: pdf.getKeywords() ?? "",
      creator: pdf.getCreator() ?? "",
      producer: pdf.getProducer() ?? "",
      creationDate: safeDate(pdf.getCreationDate()),
      modificationDate: safeDate(pdf.getModificationDate()),
      pageCount: pdf.getPageCount()
    };
  } catch (error) {
    throw mapPdfError(error);
  }
}

export async function updatePdfMetadata(
  sourceBytes: Uint8Array,
  metadata: Pick<
    PdfMetadata,
    "title" | "author" | "subject" | "keywords" | "creationDate" | "modificationDate"
  >,
  outputName: string
): Promise<PdfOperationResult> {
  const startedAt = performance.now();

  try {
    const pdf = await PDFDocument.load(sourceBytes, {
      ignoreEncryption: false,
      updateMetadata: false
    });
    updateTextEntry(pdf, PDFName.Title, metadata.title, (value) => pdf.setTitle(value));
    updateTextEntry(pdf, PDFName.Author, metadata.author, (value) => pdf.setAuthor(value));
    updateTextEntry(pdf, PDFName.Subject, metadata.subject, (value) => pdf.setSubject(value));

    const keywords = metadata.keywords
      .split(/[,，;]/)
      .map((keyword) => keyword.trim())
      .filter(Boolean);
    if (keywords.length > 0) {
      pdf.setKeywords(keywords);
    } else {
      deleteInfoEntry(pdf, PDFName.Keywords);
    }

    updateDateEntry(pdf, PDFName.CreationDate, metadata.creationDate, (value) =>
      pdf.setCreationDate(value)
    );
    updateDateEntry(pdf, PDFName.ModDate, metadata.modificationDate, (value) =>
      pdf.setModificationDate(value)
    );

    const bytes = await pdf.save({ useObjectStreams: true });
    const name = sanitizeFileName(stripFileExtension(outputName), "pdf", "metadata");
    return createOperationResult([createGeneratedFile(name, bytes)], startedAt);
  } catch (error) {
    throw mapPdfError(error);
  }
}

export function clearEditableMetadata(metadata: PdfMetadata): PdfMetadata {
  return {
    ...metadata,
    title: "",
    author: "",
    subject: "",
    keywords: "",
    creationDate: "",
    modificationDate: ""
  };
}
