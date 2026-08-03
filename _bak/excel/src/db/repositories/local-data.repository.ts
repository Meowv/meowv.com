import { database } from "../database";
import { toPersistenceError } from "../../models/app-error";
import type {
  AppSettings,
  TrashRecord,
  WorkbookAsset,
  WorkbookRecord,
  WorkbookRevision,
} from "../../models/workbook";
import { normalizeAppSettings } from "./settings.repository";

export interface RestoreLocalDataInput {
  workbooks: readonly WorkbookRecord[];
  revisions: readonly WorkbookRevision[];
  assets: readonly WorkbookAsset[];
  settings?: Partial<AppSettings>;
  assertCanContinue?: () => void;
}

export class LocalDataRepository {
  async restore(input: RestoreLocalDataInput): Promise<void> {
    const workbooks = [...input.workbooks];
    const workbookIds = [...new Set(workbooks.map((workbook) => workbook.id))];
    const revisions = [...input.revisions];
    const assets = [...input.assets];

    try {
      await database.transaction(
        "rw",
        [
          database.workbooks,
          database.revisions,
          database.assets,
          database.settings,
          database.trash,
        ],
        async () => {
          input.assertCanContinue?.();
          if (workbooks.length > 0) {
            await database.workbooks.bulkPut(workbooks);
          }
          input.assertCanContinue?.();

          if (workbookIds.length > 0) {
            await database.revisions.where("workbookId").anyOf(workbookIds).delete();
            await database.assets.where("workbookId").anyOf(workbookIds).delete();
            await database.trash.bulkDelete(workbookIds);
          }
          input.assertCanContinue?.();

          if (input.settings) {
            const currentSettings = await database.settings.get("global");
            await database.settings.put(
              normalizeAppSettings({
                ...currentSettings,
                ...input.settings,
              }),
            );
          }
          input.assertCanContinue?.();

          if (revisions.length > 0) {
            await database.revisions.bulkAdd(revisions);
          }
          input.assertCanContinue?.();
          if (assets.length > 0) {
            await database.assets.bulkAdd(assets);
          }
          input.assertCanContinue?.();

          const trashRecords: TrashRecord[] = workbooks.flatMap((workbook) =>
            workbook.deletedAt === undefined
              ? []
              : [{ workbookId: workbook.id, deletedAt: workbook.deletedAt }],
          );
          if (trashRecords.length > 0) {
            await database.trash.bulkPut(trashRecords);
          }
          input.assertCanContinue?.();
        },
      );
    } catch (error) {
      throw toPersistenceError(error, "恢复本地备份失败。");
    }
  }
}

export const localDataRepository = new LocalDataRepository();
