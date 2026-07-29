import { read } from "xlsx";

import {
  countSheetJsNonEmptyCells,
  createSheetJsCompatibilityReport,
  sheetJsToNormalized,
} from "../adapters/sheetjs";
import type { ImportWorkerRequest, ImportWorkerResponse, ImportWorkerStage } from "../types/worker";

interface WorkerEndpoint {
  onmessage: ((event: MessageEvent<ImportWorkerRequest>) => void) | null;
  postMessage(message: ImportWorkerResponse): void;
}

const endpoint = globalThis as unknown as WorkerEndpoint;
let cancelled = false;

function progress(stage: ImportWorkerStage, message: string, percent: number): void {
  endpoint.postMessage({
    type: "progress",
    progress: { stage, message, percent },
  });
}

function errorDetails(error: unknown): string | undefined {
  return error instanceof Error ? (error.stack ?? error.message) : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (/password|encrypted/i.test(error.message)) {
      return "暂不支持打开密码保护或加密的工作簿。";
    }
    return error.message || "文件解析失败。";
  }
  return "文件解析失败。";
}

function assertNotCancelled(): void {
  if (cancelled) {
    throw new DOMException("导入已取消。", "AbortError");
  }
}

function parseWorkbook(request: Extract<ImportWorkerRequest, { type: "parse" }>): void {
  const startedAt = performance.now();

  try {
    progress("validating", "正在校验文件结构", 10);
    assertNotCancelled();

    progress("parsing", "正在解析工作簿", 30);
    const workbook = read(request.buffer, {
      type: "array",
      cellFormula: true,
      cellNF: true,
      cellStyles: true,
      cellDates: true,
      cellHTML: false,
      sheetStubs: false,
      bookVBA: true,
      xlfn: true,
      raw: false,
    });

    assertNotCancelled();
    if (workbook.SheetNames.length > request.limits.maxSheets) {
      throw new Error(
        `工作簿包含 ${workbook.SheetNames.length} 个 Sheet，超过最多 ${request.limits.maxSheets} 个的限制。`,
      );
    }

    const nonEmptyCellCount = countSheetJsNonEmptyCells(workbook);
    if (nonEmptyCellCount > request.limits.maxNonEmptyCells) {
      throw new Error(
        `工作簿包含约 ${nonEmptyCellCount.toLocaleString()} 个非空单元格，超过当前浏览器安全限制。`,
      );
    }

    progress("normalizing", "正在转换单元格和工作表", 68);
    const normalized = sheetJsToNormalized(workbook, {
      fileName: request.fileName,
    });

    assertNotCancelled();
    progress("reporting", "正在生成兼容性报告", 90);
    const compatibility = createSheetJsCompatibilityReport(workbook);
    const parseDurationMs = Math.round(performance.now() - startedAt);

    progress("complete", "文件解析完成", 100);
    endpoint.postMessage({
      type: "success",
      workbook: normalized,
      compatibility,
      statistics: {
        fileSize: request.fileSize,
        sheetCount: normalized.sheets.length,
        nonEmptyCellCount,
        parseDurationMs,
      },
    });
  } catch (error) {
    if (cancelled || (error instanceof DOMException && error.name === "AbortError")) {
      return;
    }
    endpoint.postMessage({
      type: "error",
      message: errorMessage(error),
      details: errorDetails(error),
    });
  }
}

endpoint.onmessage = (event): void => {
  if (event.data.type === "cancel") {
    cancelled = true;
    return;
  }

  cancelled = false;
  parseWorkbook(event.data);
};
