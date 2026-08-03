// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { workbookSnapshotToJsonBuffer } from "../adapters/json";
import type { ExportWorkerRequest, ExportWorkerResponse } from "../types/worker";
import { createBlankWorkbookData } from "./workbook.service";
import { downloadExport, exportWorkbook } from "./export.service";

class FakeWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminateCount = 0;
  messages: unknown[] = [];

  constructor(private readonly response: ExportWorkerResponse) {}

  postMessage(message: unknown): void {
    this.messages.push(message);
    queueMicrotask(() => {
      this.onmessage?.(new MessageEvent("message", { data: this.response }));
    });
  }

  terminate(): void {
    this.terminateCount += 1;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("exportService", () => {
  it("接收 Worker 的 ArrayBuffer，在主线程创建 Blob 并释放 Worker", async () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    const worker = new FakeWorker({
      type: "success",
      buffer,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
    });
    const result = await exportWorkbook(createBlankWorkbookData("workbook-1", "月度预算"), {
      format: "xlsx",
      workerFactory: () => worker as unknown as Worker,
    });

    expect(result.fileName).toBe("月度预算.xlsx");
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.size).toBe(3);
    expect(worker.terminateCount).toBe(1);
  });

  it("将原始 Univer snapshot 作为 UTF-8 JSON 导出，并生成安全文件名", async () => {
    const snapshot = createBlankWorkbookData("workbook-json", "项目预算");
    const sheetId = snapshot.sheetOrder[0]!;
    snapshot.sheets[sheetId]!.cellData = {
      0: { 0: { v: "中文内容" } },
    };
    const buffer = workbookSnapshotToJsonBuffer(snapshot);
    const worker = new FakeWorker({
      type: "success",
      buffer,
      mimeType: "application/json;charset=utf-8",
      extension: "json",
    });

    const result = await exportWorkbook(snapshot, {
      format: "json",
      fileName: "项目/预算?.json",
      workerFactory: () => worker as unknown as Worker,
    });
    const request = worker.messages[0] as ExportWorkerRequest;

    expect(result).toMatchObject({
      fileName: "项目_预算_.json",
      mimeType: "application/json;charset=utf-8",
      extension: "json",
      size: buffer.byteLength,
    });
    expect(request).toMatchObject({
      type: "export",
      format: "json",
      snapshot,
    });
    expect(request.workbook).toBeUndefined();
    expect(request.backup).toBeUndefined();
    expect(new TextDecoder().decode(buffer)).toContain('"name": "项目预算"');
  });

  it("下载后立即释放 Object URL", () => {
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    downloadExport({
      blob: new Blob(["test"]),
      fileName: "测试.xlsx",
      mimeType: "application/octet-stream",
      extension: "xlsx",
      size: 4,
    });

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
