import { describe, expect, it } from "vitest";

import {
  getToolBySlug,
  getToolsByCategory,
  pdfTools,
  toolCategories
} from "../../app/config/tools";

describe("PDF 工具配置", () => {
  it("包含产品文档要求的 11 个唯一工具", () => {
    expect(pdfTools).toHaveLength(11);
    expect(new Set(pdfTools.map((tool) => tool.slug)).size).toBe(11);
    expect(pdfTools.map((tool) => tool.slug)).toEqual([
      "merge-pdf",
      "split-pdf",
      "organize-pdf",
      "delete-pdf-pages",
      "extract-pdf-pages",
      "rotate-pdf",
      "images-to-pdf",
      "pdf-to-images",
      "watermark-pdf",
      "add-pdf-page-numbers",
      "pdf-metadata"
    ]);
  });

  it("每个工具都包含可索引的 SEO 内容", () => {
    for (const tool of pdfTools) {
      expect(tool.name.trim()).not.toBe("");
      expect(tool.description.trim()).not.toBe("");
      expect(tool.seo.title.trim()).not.toBe("");
      expect(tool.seo.description.trim()).not.toBe("");
      expect(getToolBySlug(tool.slug)).toBe(tool);
    }
  });

  it("分类能完整覆盖工具且不重复", () => {
    const grouped = toolCategories.flatMap((category) =>
      getToolsByCategory(category.id).map((tool) => tool.slug)
    );

    expect(grouped).toHaveLength(pdfTools.length);
    expect(new Set(grouped)).toEqual(new Set(pdfTools.map((tool) => tool.slug)));
  });
});
