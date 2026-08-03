import { nanoid } from "nanoid";

import { revisionRepository } from "../db/repositories/revision.repository";
import { settingsRepository } from "../db/repositories/settings.repository";
import { workbookRepository } from "../db/repositories/workbook.repository";
import { AppError } from "../models/app-error";
import type { WorkbookRecord, WorkbookRevision, WorkbookRevisionType } from "../models/workbook";

const revisionDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const revisionTypeLabels: Record<WorkbookRevisionType, string> = {
  auto: "自动版本",
  manual: "手动版本",
  import: "导入版本",
  "before-restore": "恢复前版本",
};

function createRevisionRecord(
  workbook: WorkbookRecord,
  type: WorkbookRevisionType,
  name?: string,
): WorkbookRevision {
  const createdAt = Date.now();
  return {
    id: `revision_${nanoid(12)}`,
    workbookId: workbook.id,
    name:
      name?.trim() || `${revisionTypeLabels[type]} · ${revisionDateFormatter.format(createdAt)}`,
    snapshot: structuredClone(workbook.snapshot),
    type,
    createdAt,
    schemaVersion: workbook.schemaVersion,
  };
}

export class RevisionService {
  async create(
    workbookId: string,
    type: WorkbookRevisionType = "manual",
    name?: string,
  ): Promise<WorkbookRevision> {
    const [workbook, settings] = await Promise.all([
      workbookRepository.require(workbookId),
      settingsRepository.get(),
    ]);
    const revision = createRevisionRecord(workbook, type, name);
    await revisionRepository.create(revision, settings.maxAutoRevisions);
    return revision;
  }

  async createAutoIfDue(
    workbookId: string,
    interval?: number,
  ): Promise<WorkbookRevision | undefined> {
    const settings = await settingsRepository.get();
    const intervalMs = Math.max(0, interval ?? settings.createRevisionInterval);
    const latest = await revisionRepository.latestAuto(workbookId);

    if (latest && Date.now() - latest.createdAt < intervalMs) {
      return undefined;
    }

    return this.create(workbookId, "auto");
  }

  async list(workbookId: string): Promise<WorkbookRevision[]> {
    return revisionRepository.listByWorkbook(workbookId);
  }

  async restore(workbookId: string, revisionId: string): Promise<WorkbookRecord> {
    const [workbook, revision] = await Promise.all([
      workbookRepository.require(workbookId),
      revisionRepository.require(revisionId),
    ]);
    if (revision.workbookId !== workbookId) {
      throw new AppError({
        code: "REVISION_NOT_FOUND",
        message: "该历史版本不属于当前工作簿。",
        details: { workbookId, revisionId },
      });
    }

    await this.create(workbookId, "before-restore");
    const snapshot = {
      ...structuredClone(revision.snapshot),
      id: workbook.id,
      name: workbook.name,
    };

    return workbookRepository.update(workbookId, {
      snapshot,
      sheetCount: snapshot.sheetOrder.length || Object.keys(snapshot.sheets).length,
      schemaVersion: revision.schemaVersion,
      updatedAt: Date.now(),
      hasLocalChanges: true,
    });
  }

  async remove(revisionId: string): Promise<void> {
    await revisionRepository.delete(revisionId);
  }

  async delete(revisionId: string): Promise<void> {
    await this.remove(revisionId);
  }
}

export const revisionService = new RevisionService();
