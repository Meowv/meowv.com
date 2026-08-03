import { describe, expect, it } from "vitest";

import { chunkPages, pagesByParity, parsePageRanges } from "../../core/pdf/shared/ranges";

describe("parsePageRanges", () => {
  it("按逗号解析分段范围并自动移除空格", () => {
    expect(parsePageRanges(" 1 - 3, 5, 8 - 10 ", 10)).toEqual({
      valid: true,
      groups: [
        { label: "pages-1-3", pages: [1, 2, 3] },
        { label: "page-5", pages: [5] },
        { label: "pages-8-10", pages: [8, 9, 10] }
      ],
      error: ""
    });
  });

  it("按分号解析自定义分组，并在组内保持首次出现的页码顺序", () => {
    expect(parsePageRanges("1-3,3; 4, 6-7", 8, "groups")).toEqual({
      valid: true,
      groups: [
        { label: "group-1", pages: [1, 2, 3] },
        { label: "group-2", pages: [4, 6, 7] }
      ],
      error: ""
    });
  });

  it("拒绝空白表达式", () => {
    expect(parsePageRanges(" \n\t ", 5)).toEqual({
      valid: false,
      groups: [],
      error: "请输入页码范围"
    });
  });

  it.each([
    ["1--3", "“1--3”不是有效页码"],
    ["0", "页码必须在 1 到 5 之间"],
    ["6", "页码必须在 1 到 5 之间"],
    ["4-2", "起始页 4 不能大于结束页 2"]
  ])("拒绝无效分段表达式 %s", (input, error) => {
    expect(parsePageRanges(input, 5)).toEqual({
      valid: false,
      groups: [],
      error
    });
  });

  it("拒绝自定义分组中的空组", () => {
    expect(parsePageRanges("1-2;;4", 5, "groups")).toEqual({
      valid: false,
      groups: [],
      error: "第 2 组为空"
    });
  });
});

describe("pagesByParity", () => {
  it("返回奇数页和偶数页", () => {
    expect(pagesByParity(7, "odd")).toEqual([1, 3, 5, 7]);
    expect(pagesByParity(7, "even")).toEqual([2, 4, 6]);
  });

  it("空文档不返回页码", () => {
    expect(pagesByParity(0, "odd")).toEqual([]);
  });
});

describe("chunkPages", () => {
  it("按指定页数分组，并保留最后一个不足整组的范围", () => {
    expect(chunkPages(12, 5)).toEqual([
      { label: "pages-1-5", pages: [1, 2, 3, 4, 5] },
      { label: "pages-6-10", pages: [6, 7, 8, 9, 10] },
      { label: "pages-11-12", pages: [11, 12] }
    ]);
  });

  it.each([0, -1, 1.5, Number.NaN])("无效分组大小 %s 返回空数组", (chunkSize) => {
    expect(chunkPages(10, chunkSize)).toEqual([]);
  });
});
