import { describe, expect, it } from "vitest";

import type { AppSettings, WorkbookAsset, WorkbookRecord } from "../models/workbook";
import { createBlankWorkbookData } from "./workbook.service";
import { createWorkbookBackup, parseBackup } from "./backup.service";

function workbookFixture(): WorkbookRecord {
  const now = 1_700_000_000_000;
  return {
    id: "workbook-1",
    name: "本地备份",
    snapshot: createBlankWorkbookData("workbook-1", "本地备份"),
    sourceFileType: "local",
    sheetCount: 1,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    schemaVersion: 1,
    hasLocalChanges: true,
  };
}

function settingsFixture(): AppSettings {
  return {
    id: "global",
    theme: "system",
    locale: "zh-CN",
    autoSave: true,
    autoSaveDelay: 1_500,
    createRevisionInterval: 300_000,
    maxAutoRevisions: 20,
    defaultFontSize: 11,
    showGridlines: true,
    showFormulaBar: false,
    showStatusBar: false,
    enablePwa: true,
  };
}

describe("backupService", () => {
  it("完整序列化工作簿、资源和界面设置", async () => {
    const asset: WorkbookAsset = {
      id: "asset-1",
      workbookId: "workbook-1",
      fileName: "图表.png",
      mimeType: "image/png",
      size: 3,
      blob: new Blob([new Uint8Array([1, 2, 3]).buffer], { type: "image/png" }),
      createdAt: 1_700_000_000_000,
    };
    const backup = await createWorkbookBackup(workbookFixture(), {
      assets: [asset],
      revisions: [],
      settings: settingsFixture(),
    });

    expect(backup.format).toBe("meowv-local-sheet");
    expect(backup.assets).toHaveLength(1);
    expect(backup.assets[0]?.base64).toBe("AQID");
    expect(backup.settings).toMatchObject({
      showFormulaBar: false,
      showStatusBar: false,
    });

    const reparsed = await parseBackup(JSON.stringify(backup));
    expect(reparsed.format).toBe("meowv-local-sheet");
  });

  it("拒绝结构不完整的伪备份", async () => {
    await expect(
      parseBackup('{"format":"meowv-local-sheet","formatVersion":1}'),
    ).rejects.toMatchObject({
      code: "INVALID_FILE",
    });
  });
});
