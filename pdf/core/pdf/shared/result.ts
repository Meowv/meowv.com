import type { GeneratedFile, PdfOperationResult, PdfWarning } from "../types";

export function createGeneratedFile(
  name: string,
  bytes: Uint8Array<ArrayBufferLike>,
  mimeType = "application/pdf"
): GeneratedFile {
  const normalizedBytes = new Uint8Array(bytes);
  const blob = new Blob([normalizedBytes], { type: mimeType });
  return {
    name,
    blob,
    size: blob.size,
    mimeType
  };
}

export function createOperationResult(
  files: GeneratedFile[],
  startedAt: number,
  warnings: PdfWarning[] = []
): PdfOperationResult {
  return {
    success: files.length > 0,
    files,
    warnings,
    duration: performance.now() - startedAt
  };
}
