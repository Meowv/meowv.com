import "fake-indexeddb/auto";

import { ImageSourceType } from "@univerjs/presets";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { localDataRepository } from "./repositories/local-data.repository";
import { revisionRepository } from "./repositories/revision.repository";
import { settingsRepository } from "./repositories/settings.repository";
import { database, DATABASE_VERSION } from "./database";
import type { WorkbookAsset, WorkbookRecord, WorkbookRevision } from "../models/workbook";
import { LocalImageIoService } from "../services/univer-image-io.service";
import { createBlankWorkbookData, workbookService } from "../services/workbook.service";

async function clearDatabase(): Promise<void> {
  await database.transaction("rw", database.tables, async () => {
    await Promise.all(database.tables.map((table) => table.clear()));
  });
}

function revisionFixture(
  id: string,
  type: WorkbookRevision["type"],
  createdAt: number,
  workbookId = "workbook-history",
): WorkbookRevision {
  return {
    id,
    workbookId,
    name: id,
    snapshot: createBlankWorkbookData(workbookId, "历史版本测试", `${workbookId}-sheet`),
    type,
    createdAt,
    schemaVersion: 1,
  };
}

function workbookFixture(id: string, name: string, deletedAt?: number): WorkbookRecord {
  return {
    id,
    name,
    snapshot: createBlankWorkbookData(id, name, `${id}-sheet`),
    sourceFileType: "local",
    sheetCount: 1,
    createdAt: 1,
    updatedAt: 1,
    lastOpenedAt: 1,
    schemaVersion: 1,
    hasLocalChanges: true,
    deletedAt,
  };
}

function assetFixture(id: string, workbookId: string, value: string): WorkbookAsset {
  return {
    id,
    workbookId,
    fileName: `${id}.txt`,
    mimeType: "text/plain",
    size: value.length,
    blob: new Blob([value], { type: "text/plain" }),
    createdAt: 1,
  };
}

beforeAll(async () => {
  await database.open();
});

beforeEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await database.delete();
});

describe("IndexedDB 持久化", () => {
  it("初始化完整的当前数据库结构", () => {
    expect(database.verno).toBe(DATABASE_VERSION);
    expect(database.tables.map((table) => table.name).sort()).toEqual([
      "assets",
      "recentFiles",
      "revisions",
      "settings",
      "trash",
      "workbooks",
    ]);
  });

  it("为连续创建的空白工作簿生成不重复的默认名称", async () => {
    const first = await workbookService.createBlank();
    const second = await workbookService.createBlank();
    const third = await workbookService.createBlank();

    expect([first.name, second.name, third.name]).toEqual([
      "未命名表格",
      "未命名表格 2",
      "未命名表格 3",
    ]);
    expect(await database.workbooks.count()).toBe(3);
  });

  it("允许工作簿重命名为已存在的名称", async () => {
    const first = await workbookService.createBlank("同名工作簿");
    const second = await workbookService.createBlank("待重命名");

    const renamed = await workbookService.rename(second.id, `  ${first.name}  `);
    const activeWorkbooks = await workbookService.list({ sortBy: "createdAt", sortOrder: "asc" });

    expect(renamed.name).toBe(first.name);
    expect(renamed.snapshot.name).toBe(first.name);
    expect(activeWorkbooks.filter((workbook) => workbook.name === first.name)).toHaveLength(2);
  });

  it("从回收站恢复时保留原名称，即使已有同名工作簿", async () => {
    const original = await workbookService.createBlank("恢复同名");
    await workbookService.moveToTrash(original.id);
    const active = await workbookService.createBlank("恢复同名");

    const restored = await workbookService.restore(original.id);

    expect(restored.name).toBe("恢复同名");
    expect(restored.snapshot.name).toBe("恢复同名");
    expect((await workbookService.list()).map((workbook) => workbook.name)).toEqual([
      active.name,
      restored.name,
    ]);
    expect(await database.trash.get(original.id)).toBeUndefined();
  });

  it("历史版本清理只删除超限的旧自动版本", async () => {
    await database.revisions.bulkAdd([
      revisionFixture("manual", "manual", 1),
      revisionFixture("auto-old", "auto", 2),
      revisionFixture("auto-middle", "auto", 3),
      revisionFixture("auto-new", "auto", 4),
    ]);

    const removed = await revisionRepository.pruneAuto("workbook-history", 2);
    const remaining = await revisionRepository.listByWorkbook("workbook-history");

    expect(removed).toBe(1);
    expect(remaining.map((revision) => revision.id)).toEqual(["auto-new", "auto-middle", "manual"]);
  });

  it("将工作表图片保存为独立 Blob 资源，并以本地 UUID 写入快照", async () => {
    const workbook = await workbookService.createBlank("图片持久化");
    const imageService = new LocalImageIoService(workbook.id);
    imageService.setWaitCount(1);

    const result = await imageService.saveImage(
      new File([new Uint8Array([137, 80, 78, 71])], "示意图.png", {
        type: "image/png",
      }),
    );

    expect(result).toMatchObject({
      imageSourceType: ImageSourceType.UUID,
    });
    const asset = result ? await database.assets.get(result.source) : undefined;
    expect(asset).toMatchObject({
      workbookId: workbook.id,
      fileName: "示意图.png",
      mimeType: "image/png",
      size: 4,
    });
    expect(await imageService.getImage(result?.source ?? "")).toMatch(/^blob:/);
    imageService.dispose();
  });

  it("复制工作簿时替换资源 JSON 字符串中的图片 UUID", async () => {
    const source = workbookFixture("workbook-image-source", "图片副本");
    const sourceAsset = assetFixture("asset-original-image", source.id, "image");
    source.snapshot.resources = [
      {
        name: "SHEET_DRAWING_PLUGIN",
        data: JSON.stringify({
          drawings: [
            {
              source: sourceAsset.id,
              metadata: {
                assetId: sourceAsset.id,
              },
            },
          ],
        }),
      },
    ];
    await database.workbooks.add(source);
    await database.assets.add(sourceAsset);

    const duplicate = await workbookService.duplicate(source.id);
    const duplicateAssets = await database.assets
      .where("workbookId")
      .equals(duplicate.id)
      .toArray();
    const duplicateAsset = duplicateAssets[0];
    const duplicateResourceData = duplicate.snapshot.resources?.[0]?.data ?? "";

    expect(duplicateAssets).toHaveLength(1);
    expect(duplicateAsset?.id).toBeTruthy();
    expect(duplicateAsset?.id).not.toBe(sourceAsset.id);
    expect(duplicateResourceData).not.toContain(sourceAsset.id);
    expect(duplicateResourceData).toContain(duplicateAsset?.id ?? "");
    expect(JSON.parse(duplicateResourceData)).toEqual({
      drawings: [
        {
          source: duplicateAsset?.id,
          metadata: {
            assetId: duplicateAsset?.id,
          },
        },
      ],
    });
  });

  it("在同一个事务中恢复工作簿、版本、资源、设置和回收站索引", async () => {
    const targetId = "workbook-restore";
    const existing = workbookFixture(targetId, "恢复前");
    const unrelated = workbookFixture("workbook-unrelated", "不受影响");
    const staleRevision = revisionFixture("revision-stale", "manual", 1, targetId);
    const unrelatedRevision = revisionFixture("revision-unrelated", "manual", 1, unrelated.id);
    const staleAsset = assetFixture("asset-stale", targetId, "旧资源");
    const unrelatedAsset = assetFixture("asset-unrelated", unrelated.id, "保留资源");
    await database.workbooks.bulkAdd([existing, unrelated]);
    await database.revisions.bulkAdd([staleRevision, unrelatedRevision]);
    await database.assets.bulkAdd([staleAsset, unrelatedAsset]);
    await database.trash.put({ workbookId: targetId, deletedAt: 10 });
    await settingsRepository.save({ theme: "dark", showFormulaBar: true });

    const restored = workbookFixture(targetId, "恢复后");
    const restoredTrash = workbookFixture("workbook-restored-trash", "备份回收站", 20);
    const restoredRevision = revisionFixture("revision-restored", "manual", 2, targetId);
    const restoredAsset = assetFixture("asset-restored", targetId, "新资源");

    await localDataRepository.restore({
      workbooks: [restored, restoredTrash],
      revisions: [restoredRevision],
      assets: [restoredAsset],
      settings: {
        theme: "light",
        showFormulaBar: false,
      },
    });

    expect(await database.workbooks.get(targetId)).toMatchObject({ name: "恢复后" });
    expect(await database.workbooks.get(unrelated.id)).toMatchObject({ name: "不受影响" });
    expect(await database.revisions.where("workbookId").equals(targetId).toArray()).toEqual([
      restoredRevision,
    ]);
    expect(await database.revisions.get(unrelatedRevision.id)).toEqual(unrelatedRevision);
    expect(await database.assets.where("workbookId").equals(targetId).primaryKeys()).toEqual([
      restoredAsset.id,
    ]);
    expect(await database.assets.get(unrelatedAsset.id)).toEqual(unrelatedAsset);
    expect(await database.trash.get(targetId)).toBeUndefined();
    expect(await database.trash.get(restoredTrash.id)).toEqual({
      workbookId: restoredTrash.id,
      deletedAt: restoredTrash.deletedAt,
    });
    expect(await settingsRepository.get()).toMatchObject({
      theme: "light",
      showFormulaBar: false,
    });
  });

  it("恢复任一步骤失败时回滚已写入的数据", async () => {
    const targetId = "workbook-rollback";
    const existing = workbookFixture(targetId, "事务前");
    const existingRevision = revisionFixture("revision-existing", "manual", 1, targetId);
    const existingAsset = assetFixture("asset-existing", targetId, "事务前资源");
    await database.workbooks.add(existing);
    await database.revisions.add(existingRevision);
    await database.assets.add(existingAsset);
    await database.trash.put({ workbookId: targetId, deletedAt: 10 });
    await settingsRepository.save({ theme: "dark" });

    const duplicateRevision = revisionFixture("revision-duplicate", "manual", 2, targetId);
    await expect(
      localDataRepository.restore({
        workbooks: [workbookFixture(targetId, "不应保留")],
        revisions: [duplicateRevision, { ...duplicateRevision }],
        assets: [assetFixture("asset-new", targetId, "不应保留")],
        settings: { theme: "light" },
      }),
    ).rejects.toMatchObject({ code: "SAVE_FAILED" });

    expect(await database.workbooks.get(targetId)).toEqual(existing);
    expect(await database.revisions.where("workbookId").equals(targetId).toArray()).toEqual([
      existingRevision,
    ]);
    expect(await database.assets.where("workbookId").equals(targetId).primaryKeys()).toEqual([
      existingAsset.id,
    ]);
    expect(await database.trash.get(targetId)).toEqual({
      workbookId: targetId,
      deletedAt: 10,
    });
    expect(await settingsRepository.get()).toMatchObject({ theme: "dark" });
  });
});
