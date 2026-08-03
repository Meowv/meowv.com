import { nanoid } from "nanoid";

import { database } from "../database";
import { AppError, toPersistenceError } from "../../models/app-error";
import type {
  ListWorkbooksOptions,
  RecentFileRecord,
  WorkbookAsset,
  WorkbookRecord,
  WorkbookRevision,
  WorkbookSnapshot,
} from "../../models/workbook";
import { DEFAULT_WORKBOOK_NAME } from "../../models/workbook";

function normalizeWorkbookName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new AppError({
      code: "INVALID_WORKBOOK_NAME",
      message: "工作簿名称不能为空。",
    });
  }

  return normalized;
}

function compareWorkbooks(
  left: WorkbookRecord,
  right: WorkbookRecord,
  options: ListWorkbooksOptions,
): number {
  const sortBy = options.sortBy ?? "lastOpenedAt";
  const sortOrder = options.sortOrder ?? (sortBy === "name" ? "asc" : "desc");
  let result: number;

  if (sortBy === "name") {
    result = left.name.localeCompare(right.name, "zh-CN", {
      numeric: true,
      sensitivity: "base",
    });
  } else {
    result = left[sortBy] - right[sortBy];
  }

  return sortOrder === "asc" ? result : -result;
}

function replaceAssetReferences(
  value: unknown,
  replacements: ReadonlyMap<string, string>,
): unknown {
  if (typeof value === "string") {
    return replacements.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceAssetReferences(item, replacements));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, replaceAssetReferences(item, replacements)]),
  );
}

function replaceSerializedAssetReferences(
  value: string,
  replacements: ReadonlyMap<string, string>,
): string {
  try {
    return JSON.stringify(replaceAssetReferences(JSON.parse(value), replacements));
  } catch {
    return replacements.get(value) ?? value;
  }
}

function replaceWorkbookAssetReferences(
  snapshot: WorkbookSnapshot,
  replacements: ReadonlyMap<string, string>,
): WorkbookSnapshot {
  const replaced = replaceAssetReferences(snapshot, replacements) as WorkbookSnapshot;
  if (!replaced.resources) {
    return replaced;
  }

  return {
    ...replaced,
    resources: replaced.resources.map((resource) => ({
      ...resource,
      data: replaceSerializedAssetReferences(resource.data, replacements),
    })),
  };
}

export class WorkbookRepository {
  async get(id: string): Promise<WorkbookRecord | undefined> {
    try {
      return await database.workbooks.get(id);
    } catch (error) {
      throw toPersistenceError(error, "读取工作簿失败。");
    }
  }

  async require(id: string): Promise<WorkbookRecord> {
    const record = await this.get(id);
    if (!record) {
      throw new AppError({
        code: "WORKBOOK_NOT_FOUND",
        message: "找不到指定的工作簿。",
        details: { workbookId: id },
      });
    }

    return record;
  }

  async list(options: ListWorkbooksOptions = {}): Promise<WorkbookRecord[]> {
    try {
      const search = options.search?.trim().toLocaleLowerCase("zh-CN");
      const records = (await database.workbooks.toArray())
        .filter((record) => record.deletedAt === undefined)
        .filter((record) => {
          if (!search) {
            return true;
          }

          return (
            record.name.toLocaleLowerCase("zh-CN").includes(search) ||
            record.sourceFileName?.toLocaleLowerCase("zh-CN").includes(search) ||
            false
          );
        });

      return records.sort((left, right) => compareWorkbooks(left, right, options));
    } catch (error) {
      throw toPersistenceError(error, "读取工作簿列表失败。");
    }
  }

  async listTrash(): Promise<WorkbookRecord[]> {
    try {
      return (await database.workbooks.toArray())
        .filter((record) => record.deletedAt !== undefined)
        .sort((left, right) => (right.deletedAt ?? 0) - (left.deletedAt ?? 0));
    } catch (error) {
      throw toPersistenceError(error, "读取回收站失败。");
    }
  }

  async save(record: WorkbookRecord): Promise<void> {
    const normalizedRecord = {
      ...record,
      name: normalizeWorkbookName(record.name),
    };

    try {
      await database.transaction("rw", database.workbooks, database.trash, async () => {
        await database.workbooks.put(normalizedRecord);
        if (normalizedRecord.deletedAt === undefined) {
          await database.trash.delete(normalizedRecord.id);
        } else {
          await database.trash.put({
            workbookId: normalizedRecord.id,
            deletedAt: normalizedRecord.deletedAt,
          });
        }
      });
    } catch (error) {
      throw toPersistenceError(error);
    }
  }

  async create(record: WorkbookRecord): Promise<void> {
    const normalizedRecord = {
      ...record,
      name: normalizeWorkbookName(record.name),
    };

    try {
      await database.workbooks.add(normalizedRecord);
    } catch (error) {
      throw toPersistenceError(error, "创建工作簿失败。");
    }
  }

  async createWithRevision(record: WorkbookRecord, revision?: WorkbookRevision): Promise<void> {
    const normalizedRecord = {
      ...record,
      name: normalizeWorkbookName(record.name),
    };

    try {
      await database.transaction("rw", database.workbooks, database.revisions, async () => {
        await database.workbooks.add(normalizedRecord);
        if (revision) await database.revisions.add(revision);
      });
    } catch (error) {
      throw toPersistenceError(error, "创建工作簿失败。");
    }
  }

  async update(id: string, changes: Partial<WorkbookRecord>): Promise<WorkbookRecord> {
    try {
      return await database.transaction("rw", database.workbooks, async () => {
        const current = await database.workbooks.get(id);
        if (!current) {
          throw new AppError({
            code: "WORKBOOK_NOT_FOUND",
            message: "找不到指定的工作簿。",
            details: { workbookId: id },
          });
        }

        const updated: WorkbookRecord = {
          ...current,
          ...changes,
          id: current.id,
          name: changes.name === undefined ? current.name : normalizeWorkbookName(changes.name),
        };
        await database.workbooks.put(updated);
        return updated;
      });
    } catch (error) {
      throw toPersistenceError(error, "更新工作簿失败。");
    }
  }

  async existsName(name: string, excludeId?: string): Promise<boolean> {
    const normalizedName = normalizeWorkbookName(name);

    try {
      const matches = await database.workbooks.where("name").equals(normalizedName).toArray();
      return matches.some((record) => record.deletedAt === undefined && record.id !== excludeId);
    } catch (error) {
      throw toPersistenceError(error, "检查工作簿名称失败。");
    }
  }

  async nextAvailableName(
    requestedName = DEFAULT_WORKBOOK_NAME,
    excludeId?: string,
  ): Promise<string> {
    const baseName = normalizeWorkbookName(requestedName);

    try {
      const occupiedNames = new Set(
        (await database.workbooks.toArray())
          .filter((record) => record.deletedAt === undefined && record.id !== excludeId)
          .map((record) => record.name),
      );

      if (!occupiedNames.has(baseName)) {
        return baseName;
      }

      let suffix = 2;
      while (occupiedNames.has(`${baseName} ${suffix}`)) {
        suffix += 1;
      }

      return `${baseName} ${suffix}`;
    } catch (error) {
      throw toPersistenceError(error, "生成工作簿名称失败。");
    }
  }

  async rename(id: string, name: string): Promise<WorkbookRecord> {
    const normalizedName = normalizeWorkbookName(name);

    try {
      return await database.transaction("rw", database.workbooks, async () => {
        const current = await database.workbooks.get(id);
        if (!current) {
          throw new AppError({
            code: "WORKBOOK_NOT_FOUND",
            message: "找不到指定的工作簿。",
            details: { workbookId: id },
          });
        }

        const now = Date.now();
        const renamed: WorkbookRecord = {
          ...current,
          name: normalizedName,
          snapshot: {
            ...current.snapshot,
            name: normalizedName,
          },
          updatedAt: now,
          hasLocalChanges: true,
        };
        await database.workbooks.put(renamed);
        return renamed;
      });
    } catch (error) {
      throw toPersistenceError(error, "重命名工作簿失败。");
    }
  }

  async duplicate(id: string): Promise<WorkbookRecord> {
    try {
      return await database.transaction("rw", database.workbooks, database.assets, async () => {
        const source = await database.workbooks.get(id);
        if (!source || source.deletedAt !== undefined) {
          throw new AppError({
            code: "WORKBOOK_NOT_FOUND",
            message: "找不到要复制的工作簿。",
            details: { workbookId: id },
          });
        }

        const name = await this.nextAvailableName(`${source.name} 副本`);
        const duplicateId = `workbook_${nanoid(12)}`;
        const now = Date.now();
        const sourceAssets = await database.assets.where("workbookId").equals(id).toArray();
        const assetIdMap = new Map(sourceAssets.map((asset) => [asset.id, `asset_${nanoid(12)}`]));
        const duplicatedAssets: WorkbookAsset[] = sourceAssets.map((asset) => ({
          ...asset,
          id: assetIdMap.get(asset.id) ?? `asset_${nanoid(12)}`,
          workbookId: duplicateId,
          createdAt: now,
        }));
        const snapshot = replaceWorkbookAssetReferences(
          structuredClone(source.snapshot),
          assetIdMap,
        );
        const duplicate: WorkbookRecord = {
          id: duplicateId,
          name,
          snapshot: {
            ...snapshot,
            id: duplicateId,
            name,
          },
          sourceFileType: "local",
          sheetCount: source.sheetCount,
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now,
          schemaVersion: source.schemaVersion,
          hasLocalChanges: true,
          thumbnail: source.thumbnail,
        };
        await database.workbooks.add(duplicate);
        if (duplicatedAssets.length > 0) {
          await database.assets.bulkAdd(duplicatedAssets);
        }
        return duplicate;
      });
    } catch (error) {
      throw toPersistenceError(error, "复制工作簿失败。");
    }
  }

  async moveToTrash(id: string): Promise<WorkbookRecord> {
    try {
      return await database.transaction(
        "rw",
        database.workbooks,
        database.trash,
        database.recentFiles,
        async () => {
          const record = await database.workbooks.get(id);
          if (!record) {
            throw new AppError({
              code: "WORKBOOK_NOT_FOUND",
              message: "找不到要删除的工作簿。",
              details: { workbookId: id },
            });
          }

          const deletedAt = Date.now();
          const trashed = { ...record, deletedAt };
          await database.workbooks.put(trashed);
          await database.trash.put({ workbookId: id, deletedAt });
          await database.recentFiles.where("workbookId").equals(id).delete();
          return trashed;
        },
      );
    } catch (error) {
      throw toPersistenceError(error, "工作簿移入回收站失败。");
    }
  }

  async delete(id: string): Promise<WorkbookRecord> {
    return this.moveToTrash(id);
  }

  async restore(id: string): Promise<WorkbookRecord> {
    try {
      return await database.transaction("rw", database.workbooks, database.trash, async () => {
        const record = await database.workbooks.get(id);
        if (!record || record.deletedAt === undefined) {
          throw new AppError({
            code: "WORKBOOK_NOT_FOUND",
            message: "回收站中找不到指定的工作簿。",
            details: { workbookId: id },
          });
        }

        const restored: WorkbookRecord = {
          ...record,
          snapshot: {
            ...record.snapshot,
            name: record.name,
          },
        };
        delete restored.deletedAt;
        await database.workbooks.put(restored);
        await database.trash.delete(id);
        return restored;
      });
    } catch (error) {
      throw toPersistenceError(error, "恢复工作簿失败。");
    }
  }

  async deletePermanently(id: string): Promise<void> {
    try {
      await database.transaction(
        "rw",
        database.workbooks,
        database.revisions,
        database.assets,
        database.recentFiles,
        database.trash,
        async () => {
          await Promise.all([
            database.workbooks.delete(id),
            database.revisions.where("workbookId").equals(id).delete(),
            database.assets.where("workbookId").equals(id).delete(),
            database.recentFiles.where("workbookId").equals(id).delete(),
            database.trash.delete(id),
          ]);
        },
      );
    } catch (error) {
      throw toPersistenceError(error, "彻底删除工作簿失败。");
    }
  }

  async markOpened(id: string, openedAt = Date.now()): Promise<void> {
    await this.update(id, { lastOpenedAt: openedAt });
  }

  async markExported(id: string, exportedAt = Date.now()): Promise<void> {
    await this.update(id, {
      lastExportedAt: exportedAt,
      hasLocalChanges: false,
    });
  }

  async saveRecentFile(record: RecentFileRecord): Promise<void> {
    try {
      await database.recentFiles.put(record);
    } catch (error) {
      throw toPersistenceError(error, "保存最近文件记录失败。");
    }
  }

  async listRecentFiles(limit = 10): Promise<RecentFileRecord[]> {
    try {
      return await database.recentFiles
        .orderBy("lastOpenedAt")
        .reverse()
        .limit(Math.max(0, limit))
        .toArray();
    } catch (error) {
      throw toPersistenceError(error, "读取最近文件记录失败。");
    }
  }

  async deleteRecentFile(id: string): Promise<void> {
    try {
      await database.recentFiles.delete(id);
    } catch (error) {
      throw toPersistenceError(error, "删除最近文件记录失败。");
    }
  }

  async clearAll(): Promise<void> {
    try {
      await database.transaction(
        "rw",
        [
          database.workbooks,
          database.revisions,
          database.settings,
          database.recentFiles,
          database.assets,
          database.trash,
        ],
        async () => {
          await Promise.all([
            database.workbooks.clear(),
            database.revisions.clear(),
            database.settings.clear(),
            database.recentFiles.clear(),
            database.assets.clear(),
            database.trash.clear(),
          ]);
        },
      );
    } catch (error) {
      throw toPersistenceError(error, "清理本地数据失败。");
    }
  }
}

export const workbookRepository = new WorkbookRepository();
