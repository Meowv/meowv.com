import { normalizedToUniver } from "../adapters/univer";
import { AppError } from "../models/app-error";
import type { WorkbookRecord, WorkbookSnapshot } from "../models/workbook";
import type {
  CompatibilityReport,
  ImportStatistics,
  NormalizedWorkbook,
} from "../types/normalized-workbook";
import type {
  ImportWorkerRequest,
  ImportWorkerResponse,
  ImportWorkerStage,
  WorkerProgress,
} from "../types/worker";
import { MAX_IMPORT_FILE_SIZE, validateSpreadsheetFile } from "../utils/file";
import { workbookService } from "./workbook.service";

export const MAX_IMPORT_SHEETS = 100;
export const MAX_IMPORT_NON_EMPTY_CELLS = 2_000_000;
export const DEFAULT_IMPORT_TIMEOUT_MS = 120_000;

const ALLOWED_MIME_TYPES = new Set([
  "",
  "application/octet-stream",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "application/csv",
]);

export type ImportProgressStage = "reading" | ImportWorkerStage | "converting" | "persisting";

export interface ImportFileOptions {
  signal?: AbortSignal;
  onProgress?: (progress: WorkerProgress<ImportProgressStage>) => void;
  maxFileSize?: number;
  maxSheets?: number;
  maxNonEmptyCells?: number;
  timeoutMs?: number;
  workerFactory?: () => Worker;
}

export interface ImportFileResult {
  record: WorkbookRecord;
  normalized: NormalizedWorkbook;
  snapshot: WorkbookSnapshot;
  compatibility: CompatibilityReport;
  statistics: ImportStatistics;
}

interface ParsedWorkerResult {
  workbook: NormalizedWorkbook;
  compatibility: CompatibilityReport;
  statistics: ImportStatistics;
}

function createImportWorker(): Worker {
  return new Worker(new URL("../workers/import.worker.ts", import.meta.url), {
    type: "module",
    name: "workbook-import",
  });
}

function abortError(): AppError {
  return new AppError({
    code: "OPERATION_CANCELLED",
    message: "导入已取消。",
  });
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

function validateMimeType(file: File): void {
  if (!ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
    throw new AppError({
      code: "INVALID_FILE",
      message: "文件类型与支持的电子表格格式不匹配。",
      details: {
        fileName: file.name,
        mimeType: file.type,
      },
    });
  }
}

function runImportWorker(
  request: Extract<ImportWorkerRequest, { type: "parse" }>,
  options: ImportFileOptions,
): Promise<ParsedWorkerResult> {
  assertNotAborted(options.signal);
  const worker = (options.workerFactory ?? createImportWorker)();

  return new Promise<ParsedWorkerResult>((resolve, reject) => {
    let settled = false;
    const timeoutMs = options.timeoutMs ?? DEFAULT_IMPORT_TIMEOUT_MS;
    const timeoutId = globalThis.setTimeout(() => {
      finish(() => {
        reject(
          new AppError({
            code: "INVALID_FILE",
            message: "文件解析时间过长，已停止导入。",
            details: { timeoutMs },
          }),
        );
      });
    }, timeoutMs);

    const cleanup = (): void => {
      globalThis.clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      // 每次导入使用独立 Worker；成功、失败或取消后都立即释放。
      worker.terminate();
    };

    const finish = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };

    const onAbort = (): void => {
      finish(() => reject(abortError()));
    };

    worker.onmessage = (event: MessageEvent<ImportWorkerResponse>): void => {
      const response = event.data;
      if (response.type === "progress") {
        options.onProgress?.(response.progress);
        return;
      }
      if (response.type === "error") {
        finish(() => {
          reject(
            new AppError({
              code: "INVALID_FILE",
              message: response.message,
              details: response.details ? { workerDetails: response.details } : undefined,
            }),
          );
        });
        return;
      }

      finish(() =>
        resolve({
          workbook: response.workbook,
          compatibility: response.compatibility,
          statistics: response.statistics,
        }),
      );
    };

    worker.onerror = (event: ErrorEvent): void => {
      finish(() => {
        reject(
          new AppError({
            code: "INVALID_FILE",
            message: event.message || "文件解析 Worker 运行失败。",
          }),
        );
      });
    };

    options.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      worker.postMessage(request, [request.buffer]);
    } catch (error) {
      finish(() => {
        reject(AppError.from(error, "INVALID_FILE", "无法将文件交给解析 Worker。"));
      });
    }
  });
}

export async function importWorkbookFile(
  file: File,
  options: ImportFileOptions = {},
): Promise<ImportFileResult> {
  assertNotAborted(options.signal);
  const validated = validateSpreadsheetFile(file, options.maxFileSize ?? MAX_IMPORT_FILE_SIZE);
  validateMimeType(file);

  options.onProgress?.({
    stage: "reading",
    message: `正在读取 ${file.name}`,
    percent: 3,
  });
  const buffer = await file.arrayBuffer();
  assertNotAborted(options.signal);

  const parsed = await runImportWorker(
    {
      type: "parse",
      fileName: file.name,
      fileType: validated.fileType,
      fileSize: file.size,
      buffer,
      limits: {
        maxSheets: options.maxSheets ?? MAX_IMPORT_SHEETS,
        maxNonEmptyCells: options.maxNonEmptyCells ?? MAX_IMPORT_NON_EMPTY_CELLS,
      },
    },
    options,
  );

  assertNotAborted(options.signal);
  options.onProgress?.({
    stage: "converting",
    message: "正在创建本地工作簿",
    percent: 94,
  });
  const snapshot = normalizedToUniver(parsed.workbook);

  options.onProgress?.({
    stage: "persisting",
    message: "正在保存到当前浏览器",
    percent: 97,
  });
  const record = await workbookService.createFromSnapshot(
    snapshot,
    parsed.workbook.name,
    file.name,
    validated.fileType,
  );
  assertNotAborted(options.signal);

  options.onProgress?.({
    stage: "complete",
    message: "文件已保存到当前浏览器",
    percent: 100,
  });

  return {
    record,
    normalized: {
      ...parsed.workbook,
      id: record.id,
      name: record.name,
    },
    snapshot: record.snapshot,
    compatibility: parsed.compatibility,
    statistics: parsed.statistics,
  };
}

export const importService = {
  importFile: importWorkbookFile,
};
