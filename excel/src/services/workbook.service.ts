import { LocaleType, mergeWorksheetSnapshotWithDefault } from "@univerjs/presets";
import { nanoid } from "nanoid";

import { workbookRepository } from "../db/repositories/workbook.repository";
import type {
  ListWorkbooksOptions,
  WorkbookFileType,
  WorkbookRecord,
  WorkbookRevision,
  WorkbookSnapshot,
} from "../models/workbook";
import {
  DEFAULT_WORKBOOK_NAME,
  DEFAULT_WORKSHEET_NAME,
  WORKBOOK_SCHEMA_VERSION,
} from "../models/workbook";

const UNIVER_SNAPSHOT_VERSION = "0.25.1";

function createWorkbookId(): string {
  return `workbook_${nanoid(12)}`;
}

function countSheets(snapshot: WorkbookSnapshot): number {
  return snapshot.sheetOrder.length || Object.keys(snapshot.sheets).length;
}

function createImportRevision(record: WorkbookRecord): WorkbookRevision {
  return {
    id: `revision_${nanoid(12)}`,
    workbookId: record.id,
    name: "导入版本",
    snapshot: structuredClone(record.snapshot),
    type: "import",
    createdAt: Date.now(),
    schemaVersion: record.schemaVersion,
  };
}

export function createBlankWorkbookData(
  workbookId: string,
  name = DEFAULT_WORKBOOK_NAME,
  worksheetId = `sheet_${nanoid(10)}`,
): WorkbookSnapshot {
  const worksheet = mergeWorksheetSnapshotWithDefault({
    id: worksheetId,
    name: DEFAULT_WORKSHEET_NAME,
  });

  return {
    id: workbookId,
    name,
    appVersion: UNIVER_SNAPSHOT_VERSION,
    locale: LocaleType.ZH_CN,
    styles: {},
    sheetOrder: [worksheetId],
    sheets: {
      [worksheetId]: worksheet,
    },
  };
}

export class WorkbookService {
  async createBlank(name = DEFAULT_WORKBOOK_NAME): Promise<WorkbookRecord> {
    const uniqueName = await workbookRepository.nextAvailableName(name);
    const id = createWorkbookId();
    const now = Date.now();
    const record: WorkbookRecord = {
      id,
      name: uniqueName,
      snapshot: createBlankWorkbookData(id, uniqueName),
      sourceFileType: "local",
      sheetCount: 1,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      schemaVersion: WORKBOOK_SCHEMA_VERSION,
      hasLocalChanges: true,
    };

    await workbookRepository.create(record);
    return record;
  }

  async createBlankWorkbook(name = DEFAULT_WORKBOOK_NAME): Promise<WorkbookRecord> {
    return this.createBlank(name);
  }

  async createFromSnapshot(
    snapshot: WorkbookSnapshot,
    name: string,
    sourceFileName?: string,
    sourceFileType?: WorkbookFileType,
  ): Promise<WorkbookRecord> {
    const workbookName = name.trim() || DEFAULT_WORKBOOK_NAME;
    const id = createWorkbookId();
    const now = Date.now();
    const normalizedSnapshot: WorkbookSnapshot = {
      ...structuredClone(snapshot),
      id,
      name: workbookName,
    };
    const record: WorkbookRecord = {
      id,
      name: workbookName,
      snapshot: normalizedSnapshot,
      sourceFileName,
      sourceFileType: sourceFileType ?? "local",
      sheetCount: countSheets(normalizedSnapshot),
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      schemaVersion: WORKBOOK_SCHEMA_VERSION,
      hasLocalChanges: true,
    };

    const importRevision =
      sourceFileType === "xlsx" || sourceFileType === "xls" || sourceFileType === "csv"
        ? createImportRevision(record)
        : undefined;
    await workbookRepository.createWithRevision(record, importRevision);

    return record;
  }

  async get(id: string): Promise<WorkbookRecord | undefined> {
    return workbookRepository.get(id);
  }

  async require(id: string): Promise<WorkbookRecord> {
    return workbookRepository.require(id);
  }

  async list(options: ListWorkbooksOptions = {}): Promise<WorkbookRecord[]> {
    return workbookRepository.list(options);
  }

  async listTrash(): Promise<WorkbookRecord[]> {
    return workbookRepository.listTrash();
  }

  async save(record: WorkbookRecord): Promise<void> {
    await workbookRepository.save(record);
  }

  async updateSnapshot(
    id: string,
    snapshot: WorkbookSnapshot,
    sheetCount = countSheets(snapshot),
  ): Promise<WorkbookRecord> {
    const current = await workbookRepository.require(id);
    const normalizedSnapshot: WorkbookSnapshot = {
      ...structuredClone(snapshot),
      id: current.id,
      name: current.name,
    };

    return workbookRepository.update(id, {
      snapshot: normalizedSnapshot,
      sheetCount,
      updatedAt: Date.now(),
      hasLocalChanges: true,
    });
  }

  async rename(id: string, name: string): Promise<WorkbookRecord> {
    return workbookRepository.rename(id, name);
  }

  async duplicate(id: string): Promise<WorkbookRecord> {
    return workbookRepository.duplicate(id);
  }

  async moveToTrash(id: string): Promise<WorkbookRecord> {
    return workbookRepository.moveToTrash(id);
  }

  async restore(id: string): Promise<WorkbookRecord> {
    return workbookRepository.restore(id);
  }

  async deletePermanently(id: string): Promise<void> {
    await workbookRepository.deletePermanently(id);
  }

  async markOpened(id: string): Promise<void> {
    await workbookRepository.markOpened(id);
  }

  async markExported(id: string): Promise<void> {
    await workbookRepository.markExported(id);
  }

  async clearAll(): Promise<void> {
    await workbookRepository.clearAll();
  }
}

export const workbookService = new WorkbookService();
