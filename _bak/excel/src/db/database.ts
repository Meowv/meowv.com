import Dexie, { type Table } from "dexie";

import type {
  AppSettings,
  RecentFileRecord,
  TrashRecord,
  WorkbookAsset,
  WorkbookRecord,
  WorkbookRevision,
} from "../models/workbook";

export const DATABASE_NAME = "MeowvLocalSheets";
export const DATABASE_VERSION = 1;

export class LocalSheetsDatabase extends Dexie {
  workbooks!: Table<WorkbookRecord, string>;
  revisions!: Table<WorkbookRevision, string>;
  settings!: Table<AppSettings, AppSettings["id"]>;
  recentFiles!: Table<RecentFileRecord, string>;
  assets!: Table<WorkbookAsset, string>;
  trash!: Table<TrashRecord, string>;

  constructor() {
    super(DATABASE_NAME);

    this.version(DATABASE_VERSION).stores({
      workbooks: "&id, name, sourceFileName, createdAt, updatedAt, lastOpenedAt, deletedAt",
      revisions: "&id, workbookId, type, createdAt, [workbookId+createdAt], [workbookId+type]",
      settings: "&id",
      recentFiles: "&id, workbookId, lastOpenedAt",
      assets: "&id, workbookId, createdAt, [workbookId+createdAt]",
      trash: "&workbookId, deletedAt",
    });
  }
}

export const database = new LocalSheetsDatabase();
export const db = database;
