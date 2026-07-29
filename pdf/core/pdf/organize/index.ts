import { degrees, PDFDocument } from "pdf-lib";
import type { PageState, PdfOperationResult } from "../types";
import { mapPdfError } from "../shared/errors";
import { sanitizeFileName, stripFileExtension } from "../shared/naming";
import { createGeneratedFile, createOperationResult } from "../shared/result";

export function createPageStates(pageCount: number): PageState[] {
  return Array.from({ length: pageCount }, (_, index) => ({
    id: `page-${index + 1}-${crypto.randomUUID()}`,
    sourceIndex: index,
    originalPageNumber: index + 1,
    rotation: 0,
    deleted: false
  }));
}

export function reorderPages(pages: PageState[], from: number, to: number): PageState[] {
  if (from === to || from < 0 || to < 0 || from >= pages.length || to >= pages.length) {
    return [...pages];
  }

  const result = [...pages];
  const [moved] = result.splice(from, 1);
  if (moved) {
    result.splice(to, 0, moved);
  }
  return result;
}

export function markPagesDeleted(pages: PageState[], selectedIds: Set<string>): PageState[] {
  return pages.map((page) => (selectedIds.has(page.id) ? { ...page, deleted: true } : { ...page }));
}

export function rotatePageStates(
  pages: PageState[],
  selectedIds: Set<string>,
  rotation: number
): PageState[] {
  return pages.map((page) =>
    selectedIds.has(page.id)
      ? { ...page, rotation: (page.rotation + rotation + 360) % 360 }
      : { ...page }
  );
}

export function duplicatePageStates(pages: PageState[], selectedIds: Set<string>): PageState[] {
  const result: PageState[] = [];
  for (const page of pages) {
    result.push({ ...page });
    if (selectedIds.has(page.id)) {
      result.push({
        ...page,
        id: `${page.id}-copy-${crypto.randomUUID()}`
      });
    }
  }
  return result;
}

export async function exportPageStates(
  sourceBytes: Uint8Array,
  states: PageState[],
  outputName: string,
  signal?: AbortSignal
): Promise<PdfOperationResult> {
  const startedAt = performance.now();
  const activeStates = states.filter((state) => !state.deleted);
  if (activeStates.length === 0) {
    throw new Error("至少需要保留一页。");
  }

  try {
    const source = await PDFDocument.load(sourceBytes, {
      ignoreEncryption: false,
      updateMetadata: false
    });
    const output = await PDFDocument.create();

    for (const state of activeStates) {
      if (signal?.aborted) {
        throw new DOMException("处理已取消", "AbortError");
      }
      const [page] = await output.copyPages(source, [state.sourceIndex]);
      if (!page) {
        continue;
      }
      const originalRotation = page.getRotation().angle;
      page.setRotation(degrees((originalRotation + state.rotation + 360) % 360));
      output.addPage(page);
    }

    output.setProducer("Meowv PDF");
    output.setModificationDate(new Date());
    const bytes = await output.save({ useObjectStreams: true });
    const name = sanitizeFileName(stripFileExtension(outputName), "pdf", "organized");
    return createOperationResult([createGeneratedFile(name, bytes)], startedAt);
  } catch (error) {
    throw mapPdfError(error);
  }
}
