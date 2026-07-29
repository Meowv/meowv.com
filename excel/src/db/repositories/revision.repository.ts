import { database } from "../database";
import { AppError, toPersistenceError } from "../../models/app-error";
import type { WorkbookRevision } from "../../models/workbook";
import { DEFAULT_AUTO_REVISION_LIMIT } from "../../models/workbook";

export class RevisionRepository {
  async get(id: string): Promise<WorkbookRevision | undefined> {
    try {
      return await database.revisions.get(id);
    } catch (error) {
      throw toPersistenceError(error, "读取历史版本失败。");
    }
  }

  async require(id: string): Promise<WorkbookRevision> {
    const revision = await this.get(id);
    if (!revision) {
      throw new AppError({
        code: "REVISION_NOT_FOUND",
        message: "找不到指定的历史版本。",
        details: { revisionId: id },
      });
    }

    return revision;
  }

  async listByWorkbook(workbookId: string): Promise<WorkbookRevision[]> {
    try {
      return (await database.revisions.where("workbookId").equals(workbookId).toArray()).sort(
        (left, right) => right.createdAt - left.createdAt,
      );
    } catch (error) {
      throw toPersistenceError(error, "读取历史版本列表失败。");
    }
  }

  async latestAuto(workbookId: string): Promise<WorkbookRevision | undefined> {
    const revisions = await this.listByWorkbook(workbookId);
    return revisions.find((revision) => revision.type === "auto");
  }

  async create(
    revision: WorkbookRevision,
    maxAutoRevisions = DEFAULT_AUTO_REVISION_LIMIT,
  ): Promise<void> {
    try {
      await database.transaction("rw", database.revisions, async () => {
        await database.revisions.add(revision);
        if (revision.type === "auto") {
          await this.pruneAuto(revision.workbookId, maxAutoRevisions);
        }
      });
    } catch (error) {
      throw toPersistenceError(error, "创建历史版本失败。");
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await database.revisions.delete(id);
    } catch (error) {
      throw toPersistenceError(error, "删除历史版本失败。");
    }
  }

  async deleteByWorkbook(workbookId: string): Promise<void> {
    try {
      await database.revisions.where("workbookId").equals(workbookId).delete();
    } catch (error) {
      throw toPersistenceError(error, "清理工作簿历史版本失败。");
    }
  }

  async pruneAuto(
    workbookId: string,
    maxAutoRevisions = DEFAULT_AUTO_REVISION_LIMIT,
  ): Promise<number> {
    const safeLimit = Number.isFinite(maxAutoRevisions)
      ? Math.max(0, Math.floor(maxAutoRevisions))
      : DEFAULT_AUTO_REVISION_LIMIT;

    try {
      const automaticRevisions = (
        await database.revisions.where("workbookId").equals(workbookId).toArray()
      )
        .filter((revision) => revision.type === "auto")
        .sort((left, right) => right.createdAt - left.createdAt);
      const staleRevisionIds = automaticRevisions.slice(safeLimit).map((revision) => revision.id);

      if (staleRevisionIds.length > 0) {
        await database.revisions.bulkDelete(staleRevisionIds);
      }

      return staleRevisionIds.length;
    } catch (error) {
      throw toPersistenceError(error, "清理过期自动版本失败。");
    }
  }
}

export const revisionRepository = new RevisionRepository();
