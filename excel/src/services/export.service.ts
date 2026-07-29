import { univerToNormalized } from "../adapters/univer";
import { AppError } from "../models/app-error";
import type { WorkbookRecord, WorkbookSnapshot } from "../models/workbook";
import { WORKBOOK_SCHEMA_VERSION } from "../models/workbook";
import type {
  ExportFileType,
  ExportWorkerRequest,
  ExportWorkerResponse,
  ExportWorkerStage,
  SerializedBackup,
  SerializedWorkbookBackup,
  WorkerProgress,
} from "../types/worker";
import { sanitizeFileName } from "../utils/file";
import { workbookService } from "./workbook.service";

export const DEFAULT_EXPORT_TIMEOUT_MS = 120_000;

export type ExportProgressStage = "preparing" | ExportWorkerStage;

export interface ExportWorkbookOptions {
  format?: ExportFileType;
  fileName?: string;
  sheetId?: string;
  signal?: AbortSignal;
  onProgress?: (progress: WorkerProgress<ExportProgressStage>) => void;
  timeoutMs?: number;
  workerFactory?: () => Worker;
  backup?: SerializedBackup;
}

export interface ExportedFile {
  blob: Blob;
  fileName: string;
  mimeType: string;
  extension: ExportFileType;
  size: number;
}

interface RunExportWorkerOptions {
  signal?: AbortSignal;
  onProgress?: (progress: WorkerProgress<ExportProgressStage>) => void;
  timeoutMs?: number;
  workerFactory?: () => Worker;
}

function createExportWorker(): Worker {
  return new Worker(new URL("../workers/export.worker.ts", import.meta.url), {
    type: "module",
    name: "workbook-export",
  });
}

function abortError(): AppError {
  return new AppError({
    code: "OPERATION_CANCELLED",
    message: "导出已取消。",
  });
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

function runExportWorker(
  request: ExportWorkerRequest,
  options: RunExportWorkerOptions,
): Promise<Omit<ExportedFile, "blob" | "fileName" | "size"> & { buffer: ArrayBuffer }> {
  assertNotAborted(options.signal);
  const worker = (options.workerFactory ?? createExportWorker)();

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutMs = options.timeoutMs ?? DEFAULT_EXPORT_TIMEOUT_MS;
    const timeoutId = globalThis.setTimeout(() => {
      finish(() => {
        reject(
          new AppError({
            code: "UNKNOWN",
            message: "文件生成时间过长，已停止导出。",
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

    worker.onmessage = (event: MessageEvent<ExportWorkerResponse>): void => {
      const response = event.data;
      if (response.type === "progress") {
        options.onProgress?.(response.progress);
        return;
      }
      if (response.type === "error") {
        finish(() => {
          reject(
            new AppError({
              code: "UNKNOWN",
              message: response.message,
              details: response.details ? { workerDetails: response.details } : undefined,
            }),
          );
        });
        return;
      }

      finish(() =>
        resolve({
          buffer: response.buffer,
          mimeType: response.mimeType,
          extension: response.extension,
        }),
      );
    };

    worker.onerror = (event: ErrorEvent): void => {
      finish(() => {
        reject(
          new AppError({
            code: "UNKNOWN",
            message: event.message || "导出 Worker 运行失败。",
          }),
        );
      });
    };

    options.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      worker.postMessage(request);
    } catch (error) {
      finish(() => {
        reject(AppError.from(error, "UNKNOWN", "无法启动文件导出 Worker。"));
      });
    }
  });
}

function createFileName(
  requestedName: string | undefined,
  workbookName: string,
  extension: ExportFileType,
): string {
  const candidate = requestedName?.trim() || workbookName;
  const withoutKnownExtension = candidate.replace(/\.(xlsx|csv|json|msheet)$/i, "");
  return `${sanitizeFileName(withoutKnownExtension)}.${extension}`;
}

function createMinimalBackup(snapshot: WorkbookSnapshot): SerializedWorkbookBackup {
  const now = Date.now();
  return {
    format: "meowv-local-sheet",
    formatVersion: 1,
    appVersion: "0.1.0",
    schemaVersion: WORKBOOK_SCHEMA_VERSION,
    createdAt: now,
    exportedAt: now,
    workbook: {
      id: snapshot.id,
      name: snapshot.name,
      snapshot,
      sourceFileType: "local",
      sheetCount: snapshot.sheetOrder.length,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      schemaVersion: WORKBOOK_SCHEMA_VERSION,
      hasLocalChanges: true,
    },
    revisions: [],
    assets: [],
    chartConfigs: [],
  };
}

async function createExportedFile(
  request: ExportWorkerRequest,
  fileName: string,
  options: RunExportWorkerOptions,
): Promise<ExportedFile> {
  const generated = await runExportWorker(request, options);
  assertNotAborted(options.signal);
  const blob = new Blob([generated.buffer], { type: generated.mimeType });
  return {
    blob,
    fileName,
    mimeType: generated.mimeType,
    extension: generated.extension,
    size: blob.size,
  };
}

export async function exportWorkbook(
  snapshot: WorkbookSnapshot,
  options: ExportWorkbookOptions = {},
): Promise<ExportedFile> {
  assertNotAborted(options.signal);
  const format = options.format ?? "xlsx";
  options.onProgress?.({
    stage: "preparing",
    message: "正在读取最新工作簿快照",
    percent: 5,
  });

  const normalized =
    format === "xlsx" || format === "csv" ? univerToNormalized(snapshot) : undefined;
  const jsonSnapshot = format === "json" ? snapshot : undefined;
  const backup =
    format === "msheet" ? (options.backup ?? createMinimalBackup(snapshot)) : undefined;
  const fileName = createFileName(options.fileName, snapshot.name, format);

  return createExportedFile(
    {
      type: "export",
      format,
      workbook: normalized,
      snapshot: jsonSnapshot,
      sheetId: options.sheetId,
      backup,
    },
    fileName,
    options,
  );
}

export async function exportBackupEnvelope(
  backup: SerializedBackup,
  fileName: string,
  options: RunExportWorkerOptions = {},
): Promise<ExportedFile> {
  options.onProgress?.({
    stage: "preparing",
    message: "正在整理本地备份数据",
    percent: 5,
  });
  return createExportedFile(
    {
      type: "export",
      format: "msheet",
      backup,
    },
    createFileName(fileName, "在线 Excel 处理备份", "msheet"),
    options,
  );
}

export function downloadExport(file: ExportedFile): void {
  const objectUrl = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = file.fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";

  try {
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }
}

export async function exportAndDownloadWorkbook(
  record: WorkbookRecord,
  options: ExportWorkbookOptions = {},
): Promise<ExportedFile> {
  const file = await exportWorkbook(record.snapshot, {
    ...options,
    fileName: options.fileName ?? record.name,
  });
  downloadExport(file);

  const format = options.format ?? "xlsx";
  if (format === "xlsx" || format === "msheet") {
    await workbookService.markExported(record.id);
  }
  return file;
}

export const exportService = {
  exportWorkbook,
  exportAndDownload: exportAndDownloadWorkbook,
  download: downloadExport,
};
