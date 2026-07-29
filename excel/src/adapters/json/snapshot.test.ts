import { describe, expect, it } from "vitest";

import { createBlankWorkbookData } from "../../services/workbook.service";
import { workbookSnapshotToJsonBuffer } from "./snapshot";

describe("工作簿 JSON 适配器", () => {
  it("将最新 Univer snapshot 编码为可读 UTF-8 JSON", () => {
    const snapshot = createBlankWorkbookData("workbook-json", "中文预算");
    const sheetId = snapshot.sheetOrder[0]!;
    snapshot.sheets[sheetId]!.cellData = {
      0: {
        0: { v: "收入" },
        1: { v: 128_600 },
      },
      1: {
        1: { f: "=SUM(B1:B1)", v: 128_600 },
      },
    };

    const buffer = workbookSnapshotToJsonBuffer(snapshot);
    const json = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(json.startsWith("{\n  ")).toBe(true);
    expect(json).toContain('"name": "中文预算"');
    expect(json).toContain('"f": "=SUM(B1:B1)"');
    expect(json.endsWith("\n")).toBe(true);
    expect(parsed).toMatchObject({
      id: "workbook-json",
      name: "中文预算",
      sheetOrder: [sheetId],
    });
    expect(
      (
        (parsed.sheets as Record<string, { cellData: Record<string, unknown> }>)[sheetId]
          ?.cellData as Record<string, unknown>
      )["0"],
    ).toMatchObject({
      0: { v: "收入" },
      1: { v: 128_600 },
    });
  });
});
