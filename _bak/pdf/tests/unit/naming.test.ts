import { describe, expect, it } from "vitest";

import { sanitizeFileName, stripFileExtension } from "../../core/pdf/shared/naming";

describe("sanitizeFileName", () => {
  it("替换路径字符并保留合法中文", () => {
    expect(sanitizeFileName(" 项目/最终稿?.PDF ", ".pdf")).toBe("项目-最终稿-.pdf");
  });

  it("过滤不可见字符并合并连续空白", () => {
    expect(sanitizeFileName("年\u200b度\uFEFF  报告", "pdf")).toBe("年度 报告.pdf");
  });

  it("移除大小写混合的重复扩展名", () => {
    expect(sanitizeFileName("归档.PDF.pdf.PdF", "pdf")).toBe("归档.pdf");
  });

  it("空文件名使用默认名称", () => {
    expect(sanitizeFileName(" ... \u200b", "pdf")).toBe("processed.pdf");
    expect(sanitizeFileName("", "png", "preview")).toBe("preview.png");
  });

  it("移除文件名末尾的点和空格", () => {
    expect(sanitizeFileName("result.  ", "pdf")).toBe("result.pdf");
  });
});

describe("stripFileExtension", () => {
  it.each([
    ["report.final.pdf", "report.final"],
    ["report", "report"],
    [".gitignore", ".gitignore"],
    ["报告.PDF", "报告"]
  ])("从 %s 中移除最后一个扩展名", (name, expected) => {
    expect(stripFileExtension(name)).toBe(expected);
  });
});
