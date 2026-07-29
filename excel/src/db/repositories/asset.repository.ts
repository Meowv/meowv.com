import { database } from "../database";
import { AppError, toPersistenceError } from "../../models/app-error";
import type { WorkbookAsset } from "../../models/workbook";

export class AssetRepository {
  async get(id: string): Promise<WorkbookAsset | undefined> {
    try {
      return await database.assets.get(id);
    } catch (error) {
      throw toPersistenceError(error, "读取本地资源失败。");
    }
  }

  async require(id: string): Promise<WorkbookAsset> {
    const asset = await this.get(id);
    if (!asset) {
      throw new AppError({
        code: "ASSET_NOT_FOUND",
        message: "找不到指定的本地资源。",
        details: { assetId: id },
      });
    }

    return asset;
  }

  async listByWorkbook(workbookId: string): Promise<WorkbookAsset[]> {
    try {
      return (await database.assets.where("workbookId").equals(workbookId).toArray()).sort(
        (left, right) => left.createdAt - right.createdAt,
      );
    } catch (error) {
      throw toPersistenceError(error, "读取工作簿资源失败。");
    }
  }

  async save(asset: WorkbookAsset): Promise<void> {
    try {
      await database.assets.put(asset);
    } catch (error) {
      throw toPersistenceError(error, "保存本地资源失败。");
    }
  }

  async saveMany(assets: readonly WorkbookAsset[]): Promise<void> {
    if (assets.length === 0) {
      return;
    }

    try {
      await database.assets.bulkPut([...assets]);
    } catch (error) {
      throw toPersistenceError(error, "批量保存本地资源失败。");
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await database.assets.delete(id);
    } catch (error) {
      throw toPersistenceError(error, "删除本地资源失败。");
    }
  }

  async deleteByWorkbook(workbookId: string): Promise<void> {
    try {
      await database.assets.where("workbookId").equals(workbookId).delete();
    } catch (error) {
      throw toPersistenceError(error, "清理工作簿资源失败。");
    }
  }
}

export const assetRepository = new AssetRepository();
