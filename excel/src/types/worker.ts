import type {
  CompatibilityReport,
  ImportStatistics,
  NormalizedWorkbook,
} from "./normalized-workbook";
import type { WorkbookSnapshot } from "../models/workbook";

export type ImportFileType = "xlsx" | "xls" | "csv";
export type ExportFileType = "xlsx" | "csv" | "json" | "msheet";

export type ImportWorkerStage = "validating" | "parsing" | "normalizing" | "reporting" | "complete";

export type ExportWorkerStage = "normalizing" | "converting" | "encoding" | "complete";

export interface WorkerProgress<TStage extends string> {
  stage: TStage;
  message: string;
  percent: number;
}

export type ImportWorkerRequest =
  | {
      type: "parse";
      fileName: string;
      fileType: ImportFileType;
      fileSize: number;
      buffer: ArrayBuffer;
      limits: {
        maxSheets: number;
        maxNonEmptyCells: number;
      };
    }
  | {
      type: "cancel";
    };

export type ImportWorkerResponse =
  | {
      type: "progress";
      progress: WorkerProgress<ImportWorkerStage>;
    }
  | {
      type: "success";
      workbook: NormalizedWorkbook;
      compatibility: CompatibilityReport;
      statistics: ImportStatistics;
    }
  | {
      type: "error";
      message: string;
      details?: string;
    };

export interface SerializedWorkbookBackup {
  format: "meowv-local-sheet";
  formatVersion: 1;
  appVersion: string;
  schemaVersion: number;
  createdAt: number;
  exportedAt: number;
  workbook: Record<string, unknown>;
  revisions: Record<string, unknown>[];
  settings?: Record<string, unknown>;
  assets: Array<{
    id: string;
    workbookId: string;
    fileName: string;
    mimeType: string;
    size: number;
    createdAt: number;
    base64: string;
  }>;
  chartConfigs: Record<string, unknown>[];
}

export interface SerializedLocalDataBackup {
  format: "meowv-local-sheet-collection";
  formatVersion: 1;
  appVersion: string;
  schemaVersion: number;
  createdAt: number;
  exportedAt: number;
  workbooks: Record<string, unknown>[];
  revisions: Record<string, unknown>[];
  settings: Record<string, unknown>;
  assets: SerializedWorkbookBackup["assets"];
  chartConfigs: Record<string, unknown>[];
}

export type SerializedBackup = SerializedWorkbookBackup | SerializedLocalDataBackup;

export type ExportWorkerRequest = {
  type: "export";
  format: ExportFileType;
  workbook?: NormalizedWorkbook;
  snapshot?: WorkbookSnapshot;
  sheetId?: string;
  backup?: SerializedBackup;
};

export type ExportWorkerResponse =
  | {
      type: "progress";
      progress: WorkerProgress<ExportWorkerStage>;
    }
  | {
      type: "success";
      buffer: ArrayBuffer;
      mimeType: string;
      extension: ExportFileType;
    }
  | {
      type: "error";
      message: string;
      details?: string;
    };
