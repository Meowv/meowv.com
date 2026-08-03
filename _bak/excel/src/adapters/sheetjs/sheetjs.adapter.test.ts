import { describe, expect, it } from "vitest";
import type { CellObject, WorkBook, WorkSheet } from "xlsx";
import { read, utils, write } from "xlsx";

import { createSheetJsCompatibilityReport } from "./compatibility";
import { sheetJsToNormalized } from "./from-sheetjs";
import { normalizedToSheetJs } from "./to-sheetjs";

function idFactory(): () => string {
  let index = 0;
  return () => `id-${(index += 1)}`;
}

function fixtureWorkbook(): WorkBook {
  const firstSheet = utils.aoa_to_sheet([
    ["项目", "金额", "完成"],
    ["在线 Excel 处理", 1234.5, true],
  ]);
  (firstSheet.B2 as CellObject).z = "#,##0.00";
  firstSheet.C3 = {
    t: "n",
    f: "SUM(B2:B2)",
    v: 1234.5,
  };
  firstSheet["!ref"] = "A1:C3";
  firstSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  firstSheet["!rows"] = [{ hpx: 28 }, { hidden: true }];
  firstSheet["!cols"] = [{ wpx: 160 }, { hidden: true }];

  const hiddenSheet = utils.aoa_to_sheet([["隐藏内容"]]);
  return {
    SheetNames: ["数据", "隐藏页"],
    Sheets: {
      数据: firstSheet,
      隐藏页: hiddenSheet,
    },
    Workbook: {
      Sheets: [
        { name: "数据", Hidden: 0 },
        { name: "隐藏页", Hidden: 1 },
      ],
    },
  };
}

describe("SheetJS 适配器", () => {
  it("将值、公式、合并、尺寸、数字格式和 Sheet 显隐转换为标准模型", () => {
    const normalized = sheetJsToNormalized(fixtureWorkbook(), {
      fileName: "预算.xlsx",
      idFactory: idFactory(),
    });

    expect(normalized.name).toBe("预算");
    expect(normalized.sheets).toHaveLength(2);
    expect(normalized.sheets[0]?.cells.B2).toMatchObject({
      value: 1234.5,
      type: "number",
      numberFormat: "#,##0.00",
    });
    expect(normalized.sheets[0]?.cells.C3).toMatchObject({
      value: 1234.5,
      formula: "=SUM(B2:B2)",
      type: "formula",
    });
    expect(normalized.sheets[0]?.merges[0]).toEqual({
      startRow: 0,
      startColumn: 0,
      endRow: 0,
      endColumn: 1,
    });
    expect(normalized.sheets[0]?.rowConfigs?.[0]?.height).toBe(28);
    expect(normalized.sheets[0]?.rowConfigs?.[1]?.hidden).toBe(true);
    expect(normalized.sheets[0]?.columnConfigs?.[0]?.width).toBe(160);
    expect(normalized.sheets[1]?.visibility).toBe("hidden");
  });

  it("可重新生成常见桌面表格软件能读取的 XLSX", () => {
    const normalized = sheetJsToNormalized(fixtureWorkbook(), {
      fileName: "预算.xlsx",
      idFactory: idFactory(),
    });
    const sheetJsWorkbook = normalizedToSheetJs(normalized);
    const output: unknown = write(sheetJsWorkbook, {
      type: "array",
      bookType: "xlsx",
    });
    expect(output).toBeInstanceOf(ArrayBuffer);

    const reopened = read(output, {
      type: "array",
      cellFormula: true,
      cellNF: true,
    });
    expect(reopened.SheetNames).toEqual(["数据", "隐藏页"]);
    expect((reopened.Sheets.数据 as WorkSheet).C3).toMatchObject({
      f: "SUM(B2:B2)",
      v: 1234.5,
    });
    expect(reopened.Sheets.数据?.["!merges"]).toHaveLength(1);
    expect(reopened.Workbook?.Sheets?.[1]?.Hidden).toBe(1);
  });

  it("兼容性报告明确说明 SheetJS CE 的保真边界", () => {
    const report = createSheetJsCompatibilityReport(fixtureWorkbook());
    const details = [...report.degraded, ...report.unsupported].join(" ");

    expect(report.engine).toBe("SheetJS CE 0.20.3");
    expect(details).toContain("字体");
    expect(details).toContain("颜色");
    expect(details).toContain("边框");
    expect(details).toContain("对齐");
    expect(details).toContain("冻结");
    expect(details).toContain("VBA");
    expect(details).toContain("图表");
  });
});
