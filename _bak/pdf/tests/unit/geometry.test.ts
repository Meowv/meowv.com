import { describe, expect, it } from "vitest";

import {
  calculatePageNumberPosition,
  calculatePageNumberSequenceEnd,
  formatPageNumber
} from "../../core/pdf/page-number";
import { calculateWatermarkPosition } from "../../core/pdf/watermark";

describe("PDF 叠加元素定位", () => {
  it("把居中水印放在页面正中", () => {
    expect(calculateWatermarkPosition("center", 600, 800, 120, 60)).toEqual({
      x: 240,
      y: 370
    });
  });

  it("按给定边距放置右上角水印", () => {
    expect(calculateWatermarkPosition("top-right", 600, 800, 120, 60, 30)).toEqual({
      x: 450,
      y: 710
    });
  });

  it("格式化常用页码样式", () => {
    expect(formatPageNumber(7, 12, "plain")).toBe("7");
    expect(formatPageNumber(7, 12, "two")).toBe("07");
    expect(formatPageNumber(7, 12, "three")).toBe("007");
    expect(formatPageNumber(7, 12, "chinese")).toBe("第 7 页");
    expect(formatPageNumber(7, 12, "ratio")).toBe("7 / 12");
    expect(formatPageNumber(7, 12, "chinese-ratio")).toBe("第 7 页，共 12 页");
  });

  it("把比例格式的分母设为编号序列的末尾编号", () => {
    const sequenceEnd = calculatePageNumberSequenceEnd(7, 2);

    expect(sequenceEnd).toBe(8);
    expect(formatPageNumber(7, sequenceEnd, "ratio")).toBe("7 / 8");
    expect(formatPageNumber(8, sequenceEnd, "ratio")).toBe("8 / 8");
    expect(formatPageNumber(7, sequenceEnd, "chinese-ratio")).toBe("第 7 页，共 8 页");
  });

  it("按边距放置页码", () => {
    expect(
      calculatePageNumberPosition({
        pageWidth: 600,
        pageHeight: 800,
        width: 80,
        height: 20,
        horizontalMargin: 24,
        verticalMargin: 36,
        position: "bottom-right"
      })
    ).toEqual({ x: 496, y: 36 });
  });
});
