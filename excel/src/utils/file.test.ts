import { describe, expect, it } from "vitest";

import {
  createExportFileName,
  getSpreadsheetFileType,
  sanitizeFileName,
  validateSpreadsheetFile,
} from "./file";

function fileLike(name: string, size: number): File {
  return { name, size } as File;
}

describe("文件工具", () => {
  it("清理跨平台非法字符、尾部句点和 Windows 保留名", () => {
    expect(sanitizeFileName('  预算<草案>:"2026"  . ')).toBe("预算_草案___2026_");
    expect(sanitizeFileName("CON")).toBe("_CON");
    expect(sanitizeFileName("   ")).toBe("未命名表格");
  });

  it("生成安全的导出文件名", () => {
    expect(createExportFileName("项目/预算", "xlsx")).toBe("项目_预算.xlsx");
    expect(createExportFileName("季度数据", "csv")).toBe("季度数据.csv");
    expect(createExportFileName("项目/预算?", "json")).toBe("项目_预算_.json");
  });

  it("大小写不敏感地识别支持格式", () => {
    expect(getSpreadsheetFileType("预算.XLSX")).toBe("xlsx");
    expect(getSpreadsheetFileType("明细.xls")).toBe("xls");
    expect(getSpreadsheetFileType("数据.csv")).toBe("csv");
    expect(getSpreadsheetFileType("说明.pdf")).toBeUndefined();
  });

  it("拒绝空文件、超大文件和不支持格式", () => {
    expect(() => validateSpreadsheetFile(fileLike("空表.xlsx", 0))).toThrowError(
      expect.objectContaining({ code: "INVALID_FILE" }),
    );
    expect(() => validateSpreadsheetFile(fileLike("超大.xlsx", 1025), 1024)).toThrowError(
      expect.objectContaining({ code: "FILE_TOO_LARGE" }),
    );
    expect(() => validateSpreadsheetFile(fileLike("说明.pdf", 10))).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_FILE_TYPE" }),
    );
  });
});
