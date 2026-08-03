import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkbookRecord } from "../models/workbook";
import { createBlankWorkbookData } from "./workbook.service";

const mocks = vi.hoisted(() => ({
  createAutoIfDue: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../db/repositories/workbook.repository", () => ({
  workbookRepository: {
    update: mocks.update,
  },
}));

vi.mock("./revision.service", () => ({
  revisionService: {
    createAutoIfDue: mocks.createAutoIfDue,
  },
}));

import { AutoSaveService } from "./autosave.service";

function recordFixture(value: string): WorkbookRecord {
  const snapshot = createBlankWorkbookData("workbook-1", "自动保存测试", "sheet-1");
  snapshot.sheets["sheet-1"]!.cellData = {
    0: {
      0: { v: value },
    },
  };
  return {
    id: "workbook-1",
    name: "自动保存测试",
    snapshot,
    sourceFileType: "local",
    sheetCount: 1,
    createdAt: 1,
    updatedAt: 1,
    lastOpenedAt: 1,
    schemaVersion: 1,
    hasLocalChanges: true,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.createAutoIfDue.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AutoSaveService", () => {
  it("在防抖窗口内只保存最后一份快照", async () => {
    const service = new AutoSaveService({ delay: 100, maxWait: 1_000 });
    const first = service.schedule(recordFixture("第一次"));
    const second = service.schedule(recordFixture("最后一次"));

    await vi.advanceTimersByTimeAsync(99);
    expect(mocks.update).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([first, second]);

    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0]?.[1].snapshot.sheets["sheet-1"]?.cellData?.[0]?.[0]?.v).toBe(
      "最后一次",
    );
    expect(service.getState().status).toBe("saved");
    service.dispose();
  });

  it("串行执行连续保存，不让较早请求覆盖较新快照", async () => {
    let resolveFirstSave: (() => void) | undefined;
    mocks.update
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstSave = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);

    const service = new AutoSaveService({ delay: 0, maxWait: 0 });
    const first = service.schedule(recordFixture("队列一"));
    await vi.advanceTimersByTimeAsync(0);
    const second = service.schedule(recordFixture("队列二"));
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.update).toHaveBeenCalledTimes(1);
    resolveFirstSave?.();
    await first;
    await service.flush();
    await second;

    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.update.mock.calls[1]?.[1].snapshot.sheets["sheet-1"]?.cellData?.[0]?.[0]?.v).toBe(
      "队列二",
    );
    service.dispose();
  });

  it("持久化失败时进入错误状态并向调用方返回统一错误", async () => {
    mocks.update.mockRejectedValueOnce(new Error("quota exceeded"));
    const service = new AutoSaveService({ delay: 0, maxWait: 0 });
    const scheduled = service.schedule(recordFixture("失败内容"));
    const rejection = expect(scheduled).rejects.toMatchObject({ code: "SAVE_FAILED" });

    await vi.advanceTimersByTimeAsync(0);
    await rejection;
    expect(service.getState()).toMatchObject({
      status: "error",
      workbookId: "workbook-1",
    });
    service.dispose();
  });

  it("失败后的下一次保存成功时清除旧错误", async () => {
    mocks.update
      .mockRejectedValueOnce(new Error("quota exceeded"))
      .mockResolvedValueOnce(undefined);
    const service = new AutoSaveService({ delay: 0, maxWait: 0 });
    const failed = service.schedule(recordFixture("第一次失败"));
    const failedExpectation = expect(failed).rejects.toMatchObject({ code: "SAVE_FAILED" });

    await vi.advanceTimersByTimeAsync(0);
    await failedExpectation;

    const succeeded = service.schedule(recordFixture("第二次成功"));
    await vi.advanceTimersByTimeAsync(0);
    await succeeded;

    await expect(service.flush()).resolves.toBeUndefined();
    expect(service.getState().status).toBe("saved");
    service.dispose();
  });
});
