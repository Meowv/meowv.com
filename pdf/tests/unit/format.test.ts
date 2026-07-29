import { describe, expect, it } from "vitest";

import { formatDuration, formatFileSize, padPageNumber } from "../../core/pdf/shared/format";

describe("formatFileSize", () => {
  it.each([
    [0, "0 B"],
    [-1, "0 B"],
    [Number.NaN, "0 B"],
    [Number.POSITIVE_INFINITY, "0 B"]
  ])("将无效或非正字节数 %s 格式化为 0 B", (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });

  it.each([
    [1, "1 B"],
    [1023, "1023 B"],
    [1024, "1.00 KB"],
    [10 * 1024, "10.0 KB"],
    [100 * 1024, "100 KB"],
    [1.5 * 1024 ** 2, "1.50 MB"],
    [2.25 * 1024 ** 3, "2.25 GB"]
  ])("按 1024 进制和数值区间格式化 %s 字节", (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "1 毫秒"],
    [499.6, "500 毫秒"],
    [1000, "1.0 秒"],
    [9500, "9.5 秒"],
    [10_000, "10 秒"]
  ])("格式化处理耗时 %s 毫秒", (milliseconds, expected) => {
    expect(formatDuration(milliseconds)).toBe(expected);
  });
});

describe("padPageNumber", () => {
  it("至少使用三位页码", () => {
    expect(padPageNumber(7, 12)).toBe("007");
  });

  it("总页数超过三位时扩展补零宽度", () => {
    expect(padPageNumber(12, 1234)).toBe("0012");
  });
});
