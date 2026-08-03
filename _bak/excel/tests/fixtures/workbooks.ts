import { Buffer } from "node:buffer";

import type { WorkBook } from "xlsx";
import { utils, write } from "xlsx";

export const MULTI_SHEET_FIXTURE_NAME = "multi-sheet-layout.xlsx";

export function createMultiSheetXlsxFixture(): Buffer {
  const summarySheet = utils.aoa_to_sheet([
    ["项目汇总", null, null],
    ["收入", 1200, null],
    ["支出", 450, null],
    ["结余", null, null],
  ]);
  summarySheet.C4 = {
    t: "n",
    f: "B2-B3",
    v: 750,
  };
  summarySheet["!ref"] = "A1:C4";
  summarySheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  summarySheet["!rows"] = [{ hpx: 34 }];
  summarySheet["!cols"] = [{ wpx: 180 }, { wpx: 96 }, { wpx: 108 }];

  const detailSheet = utils.aoa_to_sheet([
    ["日期", "类别", "金额"],
    ["2026-07-01", "收入", 1200],
    ["2026-07-02", "支出", 450],
  ]);

  const workbook: WorkBook = utils.book_new();
  utils.book_append_sheet(workbook, summarySheet, "汇总");
  utils.book_append_sheet(workbook, detailSheet, "明细");

  const output: unknown = write(workbook, {
    type: "array",
    bookType: "xlsx",
    compression: true,
  });
  if (!(output instanceof ArrayBuffer)) {
    throw new Error("无法生成 XLSX 测试夹具。");
  }

  return Buffer.from(output);
}
