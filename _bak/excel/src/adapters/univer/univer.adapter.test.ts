import { describe, expect, it } from "vitest";

import type { NormalizedWorkbook } from "../../types/normalized-workbook";
import { univerToNormalized } from "./from-univer";
import { normalizedToUniver } from "./to-univer";

function fixture(): NormalizedWorkbook {
  return {
    id: "workbook-1",
    name: "转换测试",
    activeSheetId: "sheet-1",
    sheets: [
      {
        id: "sheet-1",
        name: "数据",
        rowCount: 20,
        columnCount: 10,
        cells: {
          A1: {
            value: "标题",
            type: "string",
            style: {
              font: {
                family: "Arial",
                size: 14,
                bold: true,
                color: "#123456",
              },
              fillColor: "#FFF2CC",
              horizontalAlignment: "center",
              verticalAlignment: "middle",
              wrapText: true,
              borders: {
                bottom: { style: "thin", color: "#000000" },
              },
            },
          },
          B2: {
            value: 25,
            formula: "=SUM(B1:B1)",
            type: "formula",
            numberFormat: "#,##0.00",
            note: "备注",
          },
        },
        merges: [
          {
            startRow: 0,
            startColumn: 0,
            endRow: 0,
            endColumn: 1,
          },
        ],
        rowConfigs: { 0: { height: 32 }, 4: { hidden: true } },
        columnConfigs: { 0: { width: 140 }, 3: { hidden: true } },
        frozen: { rows: 1, columns: 1 },
        visibility: "visible",
      },
      {
        id: "sheet-2",
        name: "隐藏",
        rowCount: 1,
        columnCount: 1,
        cells: {},
        merges: [],
        visibility: "hidden",
        hidden: true,
      },
    ],
  };
}

describe("Univer 适配器", () => {
  it("保留标准模型中的核心表格语义", () => {
    const snapshot = normalizedToUniver(fixture());
    const restored = univerToNormalized(snapshot);

    expect(snapshot.sheetOrder).toEqual(["sheet-1", "sheet-2"]);
    expect(snapshot.sheets["sheet-2"]?.hidden).toBe(1);
    expect(restored.activeSheetId).toBe("sheet-1");
    expect(restored.sheets[0]?.cells.B2).toMatchObject({
      value: 25,
      formula: "=SUM(B1:B1)",
      type: "formula",
      numberFormat: "#,##0.00",
      note: "备注",
    });
    expect(restored.sheets[0]?.cells.A1?.style).toMatchObject({
      font: {
        family: "Arial",
        size: 14,
        bold: true,
        color: "#123456",
      },
      fillColor: "#FFF2CC",
      horizontalAlignment: "center",
      verticalAlignment: "middle",
      wrapText: true,
    });
    expect(restored.sheets[0]?.merges).toEqual(fixture().sheets[0]?.merges);
    expect(restored.sheets[0]?.rowConfigs?.[0]?.height).toBe(32);
    expect(restored.sheets[0]?.columnConfigs?.[3]?.hidden).toBe(true);
    expect(restored.sheets[0]?.frozen).toMatchObject({ rows: 1, columns: 1 });
  });
});
