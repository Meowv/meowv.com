import type { IWorkbookData } from "@univerjs/presets";

export const WORKBOOK_SCHEMA_VERSION = 1;
export const GLOBAL_SETTINGS_ID = "global" as const;
export const DEFAULT_WORKBOOK_NAME = "未命名表格";
export const DEFAULT_WORKSHEET_NAME = "Sheet1";
export const DEFAULT_AUTO_REVISION_LIMIT = 20;

export type WorkbookSnapshot = IWorkbookData;

export type WorkbookFileType = "xlsx" | "xls" | "csv" | "local" | "template";

export interface WorkbookRecord {
  id: string;
  name: string;
  snapshot: WorkbookSnapshot;
  sourceFileName?: string;
  sourceFileType?: WorkbookFileType;
  sheetCount: number;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  lastExportedAt?: number;
  schemaVersion: number;
  hasLocalChanges: boolean;
  thumbnail?: Blob;
  deletedAt?: number;
}

export type WorkbookRevisionType = "auto" | "manual" | "import" | "before-restore";

export interface WorkbookRevision {
  id: string;
  workbookId: string;
  name: string;
  snapshot: WorkbookSnapshot;
  type: WorkbookRevisionType;
  createdAt: number;
  schemaVersion: number;
}

export interface WorkbookAsset {
  id: string;
  workbookId: string;
  fileName: string;
  mimeType: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

export interface AppSettings {
  id: typeof GLOBAL_SETTINGS_ID;
  theme: "light" | "dark" | "system";
  locale: "zh-CN";
  autoSave: boolean;
  autoSaveDelay: number;
  createRevisionInterval: number;
  maxAutoRevisions: number;
  defaultFontSize: number;
  showGridlines: boolean;
  showFormulaBar: boolean;
  showStatusBar: boolean;
  enablePwa: boolean;
}

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = Object.freeze({
  id: GLOBAL_SETTINGS_ID,
  theme: "system",
  locale: "zh-CN",
  autoSave: true,
  autoSaveDelay: 1_500,
  createRevisionInterval: 5 * 60 * 1_000,
  maxAutoRevisions: DEFAULT_AUTO_REVISION_LIMIT,
  defaultFontSize: 11,
  showGridlines: true,
  showFormulaBar: true,
  showStatusBar: true,
  enablePwa: true,
});

export interface RecentFileRecord {
  id: string;
  workbookId: string;
  fileName: string;
  fileType: WorkbookFileType;
  size: number;
  lastOpenedAt: number;
}

export interface TrashRecord {
  workbookId: string;
  deletedAt: number;
}

export type WorkbookSortField = "lastOpenedAt" | "updatedAt" | "name" | "createdAt";

export interface ListWorkbooksOptions {
  search?: string;
  sortBy?: WorkbookSortField;
  sortOrder?: "asc" | "desc";
}

export type WorkbookEditableFields = Pick<
  WorkbookRecord,
  | "name"
  | "snapshot"
  | "sourceFileName"
  | "sourceFileType"
  | "sheetCount"
  | "lastExportedAt"
  | "schemaVersion"
  | "hasLocalChanges"
  | "thumbnail"
>;
