import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkbookRecord } from "../models/workbook";
import type { NormalizedWorkbook } from "../types/normalized-workbook";
import type { ImportWorkerResponse } from "../types/worker";
import { workbookService } from "./workbook.service";
import { importWorkbookFile, type ImportFileOptions } from "./import.service";

class FakeWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminateCount = 0;
  transfer: unknown;

  constructor(
    private readonly responder: (message: unknown) => ImportWorkerResponse | undefined,
    private readonly onPost?: () => void,
  ) {}

  postMessage(message: unknown, transfer?: unknown): void {
    this.transfer = transfer;
    this.onPost?.();
    const response = this.responder(message);
    if (response) {
      queueMicrotask(() => {
        this.onmessage?.(new MessageEvent("message", { data: response }));
      });
    }
  }

  terminate(): void {
    this.terminateCount += 1;
  }
}

function fileLike(name = "预算.xlsx", type = "application/octet-stream"): File {
  const bytes = new Uint8Array([80, 75, 3, 4]);
  return {
    name,
    type,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  } as unknown as File;
}

function normalizedFixture(): NormalizedWorkbook {
  return {
    id: "imported",
    name: "预算",
    activeSheetId: "sheet-1",
    sheets: [
      {
        id: "sheet-1",
        name: "Sheet1",
        rowCount: 2,
        columnCount: 2,
        cells: {
          A1: { value: "项目", type: "string" },
          B2: { value: 10, type: "number" },
        },
        merges: [],
      },
    ],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("importService", () => {
  it("使用 Transferable 交给 Worker，转换后持久化并终止 Worker", async () => {
    const worker = new FakeWorker(() => ({
      type: "success",
      workbook: normalizedFixture(),
      compatibility: {
        engine: "SheetJS CE 0.20.3",
        summary: "已打开",
        preserved: ["值"],
        degraded: ["样式"],
        unsupported: ["VBA"],
        ignored: [],
        issues: [],
        hasWarnings: true,
      },
      statistics: {
        fileSize: 4,
        sheetCount: 1,
        nonEmptyCellCount: 2,
        parseDurationMs: 12,
      },
    }));
    vi.spyOn(workbookService, "createFromSnapshot").mockImplementation(
      async (snapshot, name, sourceFileName, sourceFileType) => {
        const now = Date.now();
        const record: WorkbookRecord = {
          id: "saved-id",
          name,
          snapshot: { ...snapshot, id: "saved-id" },
          sourceFileName,
          sourceFileType,
          sheetCount: 1,
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now,
          schemaVersion: 1,
          hasLocalChanges: true,
        };
        return record;
      },
    );
    const stages: string[] = [];
    const options: ImportFileOptions = {
      workerFactory: () => worker as unknown as Worker,
      onProgress: (progress) => stages.push(progress.stage),
    };

    const result = await importWorkbookFile(fileLike(), options);

    expect(result.record.id).toBe("saved-id");
    expect(result.snapshot.id).toBe("saved-id");
    expect(result.normalized.id).toBe("saved-id");
    expect(worker.transfer).toBeInstanceOf(Array);
    expect(worker.terminateCount).toBe(1);
    expect(stages).toContain("reading");
    expect(stages).toContain("persisting");
    expect(stages.at(-1)).toBe("complete");
  });

  it("取消时 terminate Worker 并返回明确错误", async () => {
    const controller = new AbortController();
    const worker = new FakeWorker(
      () => undefined,
      () => controller.abort(),
    );

    await expect(
      importWorkbookFile(fileLike(), {
        signal: controller.signal,
        workerFactory: () => worker as unknown as Worker,
      }),
    ).rejects.toMatchObject({
      code: "OPERATION_CANCELLED",
    });
    expect(worker.terminateCount).toBe(1);
  });

  it("在创建 Worker 前拒绝不支持的扩展名", async () => {
    const workerFactory = vi.fn();
    await expect(
      importWorkbookFile(fileLike("图片.png", "image/png"), {
        workerFactory,
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_FILE_TYPE",
    });
    expect(workerFactory).not.toHaveBeenCalled();
  });
});
