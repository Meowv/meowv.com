import { assetRepository } from "../db/repositories/asset.repository";
import { localDataRepository } from "../db/repositories/local-data.repository";
import { revisionRepository } from "../db/repositories/revision.repository";
import { settingsRepository } from "../db/repositories/settings.repository";
import { workbookRepository } from "../db/repositories/workbook.repository";
import { AppError } from "../models/app-error";
import type {
  AppSettings,
  WorkbookAsset,
  WorkbookFileType,
  WorkbookRecord,
  WorkbookRevision,
  WorkbookSnapshot,
} from "../models/workbook";
import { WORKBOOK_SCHEMA_VERSION } from "../models/workbook";
import type {
  SerializedBackup,
  SerializedLocalDataBackup,
  SerializedWorkbookBackup,
  WorkerProgress,
} from "../types/worker";
import type { ExportedFile, ExportProgressStage } from "./export.service";
import { exportBackupEnvelope } from "./export.service";

const BACKUP_APP_VERSION = "0.1.0";
const MAX_BACKUP_FILE_SIZE = 200 * 1024 * 1024;

export type BackupProgressStage =
  "collecting" | "reading" | "validating" | "restoring" | ExportProgressStage;

export interface BackupProgressOptions {
  signal?: AbortSignal;
  onProgress?: (progress: WorkerProgress<BackupProgressStage>) => void;
}

export interface CreateWorkbookBackupOptions extends BackupProgressOptions {
  assets?: WorkbookAsset[];
  revisions?: WorkbookRevision[];
  settings?: AppSettings;
  chartConfigs?: Record<string, unknown>[];
}

export interface ExportAllLocalDataOptions extends BackupProgressOptions {
  fileName?: string;
  timeoutMs?: number;
  workerFactory?: () => Worker;
}

export interface ImportAllLocalDataResult {
  workbookCount: number;
  revisionCount: number;
  assetCount: number;
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new AppError({
      code: "OPERATION_CANCELLED",
      message: "备份操作已取消。",
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 8_192;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, bytes.length);
    for (let index = offset; index < end; index += 1) {
      binary += String.fromCharCode(bytes[index] ?? 0);
    }
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

async function serializeWorkbookRecord(workbook: WorkbookRecord): Promise<Record<string, unknown>> {
  return {
    id: workbook.id,
    name: workbook.name,
    snapshot: workbook.snapshot,
    sourceFileName: workbook.sourceFileName,
    sourceFileType: workbook.sourceFileType,
    sheetCount: workbook.sheetCount,
    createdAt: workbook.createdAt,
    updatedAt: workbook.updatedAt,
    lastOpenedAt: workbook.lastOpenedAt,
    lastExportedAt: workbook.lastExportedAt,
    schemaVersion: workbook.schemaVersion,
    hasLocalChanges: workbook.hasLocalChanges,
    deletedAt: workbook.deletedAt,
    thumbnailBase64: workbook.thumbnail ? await blobToBase64(workbook.thumbnail) : undefined,
    thumbnailMimeType: workbook.thumbnail?.type,
  };
}

function serializeRevision(revision: WorkbookRevision): Record<string, unknown> {
  return {
    id: revision.id,
    workbookId: revision.workbookId,
    name: revision.name,
    snapshot: revision.snapshot,
    type: revision.type,
    createdAt: revision.createdAt,
    schemaVersion: revision.schemaVersion,
  };
}

async function serializeAssets(
  assets: WorkbookAsset[],
  signal?: AbortSignal,
): Promise<SerializedWorkbookBackup["assets"]> {
  const serialized: SerializedWorkbookBackup["assets"] = [];
  for (const asset of assets) {
    assertNotAborted(signal);
    serialized.push({
      id: asset.id,
      workbookId: asset.workbookId,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      size: asset.size,
      createdAt: asset.createdAt,
      base64: await blobToBase64(asset.blob),
    });
  }
  return serialized;
}

function serializeSettings(settings: AppSettings): Record<string, unknown> {
  return {
    id: settings.id,
    theme: settings.theme,
    locale: settings.locale,
    autoSave: settings.autoSave,
    autoSaveDelay: settings.autoSaveDelay,
    createRevisionInterval: settings.createRevisionInterval,
    maxAutoRevisions: settings.maxAutoRevisions,
    defaultFontSize: settings.defaultFontSize,
    showGridlines: settings.showGridlines,
    showFormulaBar: settings.showFormulaBar,
    showStatusBar: settings.showStatusBar,
    enablePwa: settings.enablePwa,
  };
}

export async function createWorkbookBackup(
  workbook: WorkbookRecord,
  options: CreateWorkbookBackupOptions = {},
): Promise<SerializedWorkbookBackup> {
  assertNotAborted(options.signal);
  options.onProgress?.({
    stage: "collecting",
    message: "正在收集工作簿和历史版本",
    percent: 10,
  });

  const [assets, revisions, settings] = await Promise.all([
    options.assets ?? assetRepository.listByWorkbook(workbook.id),
    options.revisions ?? revisionRepository.listByWorkbook(workbook.id),
    options.settings ?? settingsRepository.get(),
  ]);
  assertNotAborted(options.signal);
  const now = Date.now();

  return {
    format: "meowv-local-sheet",
    formatVersion: 1,
    appVersion: BACKUP_APP_VERSION,
    schemaVersion: WORKBOOK_SCHEMA_VERSION,
    createdAt: workbook.createdAt,
    exportedAt: now,
    workbook: await serializeWorkbookRecord(workbook),
    revisions: revisions.map(serializeRevision),
    settings: serializeSettings(settings),
    assets: await serializeAssets(assets, options.signal),
    chartConfigs: options.chartConfigs ?? [],
  };
}

async function createAllLocalDataBackup(
  options: BackupProgressOptions = {},
): Promise<SerializedLocalDataBackup> {
  assertNotAborted(options.signal);
  options.onProgress?.({
    stage: "collecting",
    message: "正在收集当前浏览器中的工作簿",
    percent: 8,
  });

  const [activeWorkbooks, trashedWorkbooks, settings] = await Promise.all([
    workbookRepository.list(),
    workbookRepository.listTrash(),
    settingsRepository.get(),
  ]);
  const workbooks = [...activeWorkbooks, ...trashedWorkbooks];
  const revisionsByWorkbook = await Promise.all(
    workbooks.map((workbook) => revisionRepository.listByWorkbook(workbook.id)),
  );
  const assetsByWorkbook = await Promise.all(
    workbooks.map((workbook) => assetRepository.listByWorkbook(workbook.id)),
  );
  assertNotAborted(options.signal);

  options.onProgress?.({
    stage: "collecting",
    message: "正在打包本地资源",
    percent: 25,
  });
  const serializedWorkbooks: Record<string, unknown>[] = [];
  for (const workbook of workbooks) {
    assertNotAborted(options.signal);
    serializedWorkbooks.push(await serializeWorkbookRecord(workbook));
  }
  const now = Date.now();

  return {
    format: "meowv-local-sheet-collection",
    formatVersion: 1,
    appVersion: BACKUP_APP_VERSION,
    schemaVersion: WORKBOOK_SCHEMA_VERSION,
    createdAt: now,
    exportedAt: now,
    workbooks: serializedWorkbooks,
    revisions: revisionsByWorkbook.flat().map(serializeRevision),
    settings: serializeSettings(settings),
    assets: await serializeAssets(assetsByWorkbook.flat(), options.signal),
    chartConfigs: [],
  };
}

async function sourceToText(source: Blob | ArrayBuffer | Uint8Array | string): Promise<string> {
  if (typeof source === "string") {
    return source;
  }
  if (source instanceof Blob) {
    if (source.size > MAX_BACKUP_FILE_SIZE) {
      throw new AppError({
        code: "FILE_TOO_LARGE",
        message: "备份文件超过 200 MB，暂时无法恢复。",
      });
    }
    return source.text();
  }
  if (source instanceof ArrayBuffer) {
    return new TextDecoder().decode(source);
  }
  return new TextDecoder().decode(source);
}

function isSerializedAsset(value: unknown): value is SerializedWorkbookBackup["assets"][number] {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.workbookId === "string" &&
    typeof value.fileName === "string" &&
    typeof value.mimeType === "string" &&
    isNumber(value.size) &&
    isNumber(value.createdAt) &&
    typeof value.base64 === "string"
  );
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}

function validateBackupEnvelope(value: unknown): SerializedBackup {
  if (!isRecord(value) || value.formatVersion !== 1) {
    throw new AppError({
      code: "INVALID_FILE",
      message: "这不是有效的在线 Excel 处理备份文件。",
    });
  }
  const commonValid =
    typeof value.appVersion === "string" &&
    isNumber(value.schemaVersion) &&
    isNumber(value.createdAt) &&
    isNumber(value.exportedAt) &&
    Array.isArray(value.assets) &&
    value.assets.every(isSerializedAsset) &&
    isRecordArray(value.revisions) &&
    isRecordArray(value.chartConfigs);
  if (!commonValid) {
    throw new AppError({
      code: "INVALID_FILE",
      message: "备份文件结构不完整或已损坏。",
    });
  }

  if (
    value.format === "meowv-local-sheet" &&
    isRecord(value.workbook) &&
    (value.settings === undefined || isRecord(value.settings))
  ) {
    return value as unknown as SerializedWorkbookBackup;
  }
  if (
    value.format === "meowv-local-sheet-collection" &&
    isRecordArray(value.workbooks) &&
    isRecord(value.settings)
  ) {
    return value as unknown as SerializedLocalDataBackup;
  }

  throw new AppError({
    code: "INVALID_FILE",
    message: "备份文件格式不受支持。",
  });
}

export async function parseBackup(
  source: Blob | ArrayBuffer | Uint8Array | string,
): Promise<SerializedBackup> {
  const text = await sourceToText(source);
  try {
    const parsed: unknown = JSON.parse(text);
    return validateBackupEnvelope(parsed);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError({
      code: "INVALID_FILE",
      message: "备份文件不是有效的 JSON 数据。",
      cause: error,
    });
  }
}

function isWorkbookSnapshot(value: unknown): value is WorkbookSnapshot {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.appVersion === "string" &&
    typeof value.locale === "string" &&
    isRecord(value.styles) &&
    Array.isArray(value.sheetOrder) &&
    value.sheetOrder.every((item) => typeof item === "string") &&
    isRecord(value.sheets)
  );
}

function workbookFileType(value: unknown): WorkbookFileType | undefined {
  switch (value) {
    case "xlsx":
    case "xls":
    case "csv":
    case "local":
    case "template":
      return value;
    default:
      return undefined;
  }
}

function parseWorkbookRecord(value: Record<string, unknown>): WorkbookRecord {
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !isWorkbookSnapshot(value.snapshot) ||
    !isNumber(value.sheetCount) ||
    !isNumber(value.createdAt) ||
    !isNumber(value.updatedAt) ||
    !isNumber(value.lastOpenedAt) ||
    !isNumber(value.schemaVersion) ||
    typeof value.hasLocalChanges !== "boolean"
  ) {
    throw new AppError({
      code: "INVALID_FILE",
      message: "备份中的工作簿数据不完整。",
    });
  }

  const thumbnailBase64 =
    typeof value.thumbnailBase64 === "string" ? value.thumbnailBase64 : undefined;
  return {
    id: value.id,
    name: value.name,
    snapshot: value.snapshot,
    sourceFileName: typeof value.sourceFileName === "string" ? value.sourceFileName : undefined,
    sourceFileType: workbookFileType(value.sourceFileType),
    sheetCount: value.sheetCount,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    lastOpenedAt: value.lastOpenedAt,
    lastExportedAt: isNumber(value.lastExportedAt) ? value.lastExportedAt : undefined,
    schemaVersion: value.schemaVersion,
    hasLocalChanges: value.hasLocalChanges,
    deletedAt: isNumber(value.deletedAt) ? value.deletedAt : undefined,
    thumbnail: thumbnailBase64
      ? new Blob([bytesToArrayBuffer(base64ToBytes(thumbnailBase64))], {
          type: typeof value.thumbnailMimeType === "string" ? value.thumbnailMimeType : "image/png",
        })
      : undefined,
  };
}

function parseRevision(value: Record<string, unknown>): WorkbookRevision {
  const type = value.type;
  if (
    typeof value.id !== "string" ||
    typeof value.workbookId !== "string" ||
    typeof value.name !== "string" ||
    !isWorkbookSnapshot(value.snapshot) ||
    !["auto", "manual", "import", "before-restore"].includes(String(type)) ||
    !isNumber(value.createdAt) ||
    !isNumber(value.schemaVersion)
  ) {
    throw new AppError({
      code: "INVALID_FILE",
      message: "备份中的历史版本数据不完整。",
    });
  }

  return {
    id: value.id,
    workbookId: value.workbookId,
    name: value.name,
    snapshot: value.snapshot,
    type: type as WorkbookRevision["type"],
    createdAt: value.createdAt,
    schemaVersion: value.schemaVersion,
  };
}

function parseAsset(value: SerializedWorkbookBackup["assets"][number]): WorkbookAsset {
  const bytes = base64ToBytes(value.base64);
  return {
    id: value.id,
    workbookId: value.workbookId,
    fileName: value.fileName,
    mimeType: value.mimeType,
    size: value.size,
    blob: new Blob([bytesToArrayBuffer(bytes)], { type: value.mimeType }),
    createdAt: value.createdAt,
  };
}

function parseSettings(
  value: Record<string, unknown> | undefined,
): Partial<AppSettings> | undefined {
  if (!value) {
    return undefined;
  }
  return {
    id: "global",
    theme:
      value.theme === "light" || value.theme === "dark" || value.theme === "system"
        ? value.theme
        : undefined,
    locale: value.locale === "zh-CN" ? "zh-CN" : undefined,
    autoSave: typeof value.autoSave === "boolean" ? value.autoSave : undefined,
    autoSaveDelay: isNumber(value.autoSaveDelay) ? value.autoSaveDelay : undefined,
    createRevisionInterval: isNumber(value.createRevisionInterval)
      ? value.createRevisionInterval
      : undefined,
    maxAutoRevisions: isNumber(value.maxAutoRevisions) ? value.maxAutoRevisions : undefined,
    defaultFontSize: isNumber(value.defaultFontSize) ? value.defaultFontSize : undefined,
    showGridlines: typeof value.showGridlines === "boolean" ? value.showGridlines : undefined,
    showFormulaBar: typeof value.showFormulaBar === "boolean" ? value.showFormulaBar : undefined,
    showStatusBar: typeof value.showStatusBar === "boolean" ? value.showStatusBar : undefined,
    enablePwa: typeof value.enablePwa === "boolean" ? value.enablePwa : undefined,
  };
}

export async function exportAllLocalData(
  options: ExportAllLocalDataOptions = {},
): Promise<ExportedFile> {
  const backup = await createAllLocalDataBackup(options);
  assertNotAborted(options.signal);
  const date = new Date().toISOString().slice(0, 10);
  return exportBackupEnvelope(backup, options.fileName ?? `在线 Excel 处理完整备份-${date}`, {
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    workerFactory: options.workerFactory,
    onProgress: (progress) => options.onProgress?.(progress),
  });
}

export async function importAllLocalData(
  source: Blob | ArrayBuffer | Uint8Array | string,
  options: BackupProgressOptions = {},
): Promise<ImportAllLocalDataResult> {
  assertNotAborted(options.signal);
  options.onProgress?.({
    stage: "reading",
    message: "正在读取本地备份",
    percent: 5,
  });
  const backup = await parseBackup(source);
  assertNotAborted(options.signal);

  options.onProgress?.({
    stage: "validating",
    message: "正在校验备份内容",
    percent: 20,
  });
  const serializedWorkbooks =
    backup.format === "meowv-local-sheet" ? [backup.workbook] : backup.workbooks;
  const workbooks = serializedWorkbooks.map(parseWorkbookRecord);
  const revisions = backup.revisions.map(parseRevision);
  const assets = backup.assets.map(parseAsset);
  const settings = parseSettings(backup.settings);
  const workbookIds = new Set(workbooks.map((workbook) => workbook.id));

  if (
    revisions.some((revision) => !workbookIds.has(revision.workbookId)) ||
    assets.some((asset) => !workbookIds.has(asset.workbookId))
  ) {
    throw new AppError({
      code: "INVALID_FILE",
      message: "备份中的历史版本或资源没有对应的工作簿。",
    });
  }

  options.onProgress?.({
    stage: "restoring",
    message: "正在恢复到当前浏览器",
    percent: 45,
  });
  assertNotAborted(options.signal);
  await localDataRepository.restore({
    workbooks,
    revisions,
    assets,
    settings,
    assertCanContinue: () => assertNotAborted(options.signal),
  });
  assertNotAborted(options.signal);

  options.onProgress?.({
    stage: "complete",
    message: "本地备份恢复完成",
    percent: 100,
  });
  return {
    workbookCount: workbooks.length,
    revisionCount: revisions.length,
    assetCount: assets.length,
  };
}

export const backupService = {
  createWorkbookBackup,
  parseBackup,
  exportAllLocalData,
  importAllLocalData,
};
