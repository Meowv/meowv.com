import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mergePdfFiles } from "../../core/pdf/merge";
import { readPdfMetadata, updatePdfMetadata } from "../../core/pdf/metadata";
import {
  createPageStates,
  duplicatePageStates,
  exportPageStates,
  markPagesDeleted,
  reorderPages,
  rotatePageStates
} from "../../core/pdf/organize";
import { addPageNumbers } from "../../core/pdf/page-number";
import { splitPdf } from "../../core/pdf/split";
import type { LoadedPdfFile, PdfOperationResult } from "../../core/pdf/types";
import { addWatermark } from "../../core/pdf/watermark";
import { createPdfFixtures } from "../fixtures/create-pdfs";

const fixtureBytes = new Map<string, Uint8Array>();
let fixtureDirectory = "";

beforeAll(async () => {
  fixtureDirectory = await mkdtemp(join(tmpdir(), "pdf-meowv-integration-"));
  const fixturePaths = await createPdfFixtures(fixtureDirectory);

  await Promise.all(
    fixturePaths.map(async (path) => {
      fixtureBytes.set(basename(path), new Uint8Array(await readFile(path)));
    })
  );
});

afterAll(async () => {
  if (fixtureDirectory) {
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
});

function fixture(name: string): Uint8Array {
  const bytes = fixtureBytes.get(name);
  if (!bytes) {
    throw new Error(`找不到测试夹具：${name}`);
  }
  return bytes;
}

function loadedFile(name: string): LoadedPdfFile {
  const bytes = fixture(name);
  const file = new File([new Uint8Array(bytes)], name, {
    type: "application/pdf"
  });

  return {
    id: name,
    file,
    name,
    size: file.size,
    bytes,
    pageCount: 0,
    status: "ready"
  };
}

async function loadGeneratedPdf(result: PdfOperationResult, fileIndex = 0): Promise<PDFDocument> {
  const file = result.files[fileIndex];
  if (!file) {
    throw new Error(`处理结果中不存在第 ${fileIndex + 1} 个文件`);
  }

  return PDFDocument.load(await file.blob.arrayBuffer(), {
    ignoreEncryption: false,
    updateMetadata: false
  });
}

function pageGeometry(pdf: PDFDocument): Array<{
  width: number;
  height: number;
  rotation: number;
}> {
  return pdf.getPages().map((page) => {
    const { width, height } = page.getSize();
    return {
      width,
      height,
      rotation: page.getRotation().angle
    };
  });
}

function xObjectCount(pdf: PDFDocument, pageIndex: number): number {
  const resources = pdf.getPage(pageIndex).node.Resources();
  const xObjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  return xObjects?.keys().length ?? 0;
}

function canvasIsAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return canvas.getContext("2d") !== null && typeof canvas.toBlob === "function";
  } catch {
    return false;
  }
}

describe("PDF 合并与拆分集成", () => {
  it("按文件及源页顺序合并 PDF，并生成可重新读取的文件", async () => {
    const mixedSource = await PDFDocument.load(fixture("mixed-page-sizes.pdf"));
    const landscapeSource = await PDFDocument.load(fixture("landscape-page.pdf"));

    const result = await mergePdfFiles(
      [loadedFile("mixed-page-sizes.pdf"), loadedFile("landscape-page.pdf")],
      "合并/结果.PDF"
    );
    const merged = await loadGeneratedPdf(result);

    expect(result.success).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.name).toBe("合并-结果.pdf");
    expect(result.files[0]?.mimeType).toBe("application/pdf");
    expect(result.files[0]?.size).toBeGreaterThan(0);
    expect(pageGeometry(merged)).toEqual([
      ...pageGeometry(mixedSource),
      ...pageGeometry(landscapeSource)
    ]);
    expect(merged.getProducer()).toBe("Meowv PDF");
  });

  it("按分组页码及组内顺序拆分 PDF", async () => {
    const result = await splitPdf(
      fixture("mixed-page-sizes.pdf"),
      [
        { label: "reverse", pages: [3, 1] },
        { label: "letter", pages: [2] }
      ],
      "项目/拆分.PDF"
    );
    const reverse = await loadGeneratedPdf(result, 0);
    const letter = await loadGeneratedPdf(result, 1);

    expect(result.files.map((file) => file.name)).toEqual([
      "项目-拆分-reverse.pdf",
      "项目-拆分-letter.pdf"
    ]);
    expect(pageGeometry(reverse)).toEqual([
      { width: 500, height: 500, rotation: 0 },
      { width: 595.28, height: 841.89, rotation: 0 }
    ]);
    expect(pageGeometry(letter)).toEqual([{ width: 612, height: 792, rotation: 0 }]);
    expect(reverse.getProducer()).toBe("Meowv PDF");
    expect(letter.getProducer()).toBe("Meowv PDF");
  });
});

describe("PDF 页面编排集成", () => {
  it("导出时保留排序、删除、旋转和复制后的页面状态", async () => {
    const initial = createPageStates(3);
    const reordered = reorderPages(initial, 0, 2);
    const deleted = markPagesDeleted(reordered, new Set([initial[0]!.id]));
    const rotated = rotatePageStates(deleted, new Set([initial[1]!.id]), 90);
    const duplicated = duplicatePageStates(rotated, new Set([initial[2]!.id]));

    const result = await exportPageStates(
      fixture("mixed-page-sizes.pdf"),
      duplicated,
      "编排/结果.PDF"
    );
    const exported = await loadGeneratedPdf(result);

    expect(duplicated.map((page) => page.originalPageNumber)).toEqual([2, 3, 3, 1]);
    expect(duplicated.filter((page) => page.deleted)).toHaveLength(1);
    expect(result.files[0]?.name).toBe("编排-结果.pdf");
    expect(pageGeometry(exported)).toEqual([
      { width: 612, height: 792, rotation: 90 },
      { width: 500, height: 500, rotation: 0 },
      { width: 500, height: 500, rotation: 0 }
    ]);
    expect(exported.getProducer()).toBe("Meowv PDF");
  });

  it("删除模式按已应用的 deleted 状态导出，并拒绝删除全部页面", async () => {
    const initial = createPageStates(3);
    const applied = markPagesDeleted(initial, new Set([initial[0]!.id, initial[2]!.id]));
    const result = await exportPageStates(
      fixture("mixed-page-sizes.pdf"),
      applied,
      "删除/结果.PDF"
    );
    const exported = await loadGeneratedPdf(result);

    expect(applied.filter((page) => page.deleted)).toHaveLength(2);
    expect(pageGeometry(exported)).toEqual([{ width: 612, height: 792, rotation: 0 }]);

    const allDeleted = markPagesDeleted(initial, new Set(initial.map((page) => page.id)));
    await expect(
      exportPageStates(fixture("mixed-page-sizes.pdf"), allDeleted, "不能全部删除.pdf")
    ).rejects.toThrow("至少需要保留一页");
  });
});

describe("PDF 元数据集成", () => {
  it("读取 PDF 版本、页面尺寸和基础元数据", async () => {
    const metadata = await readPdfMetadata(fixture("mixed-page-sizes.pdf"));

    expect(metadata).toMatchObject({
      pdfVersion: "1.7",
      pageSizes: "210 × 297 mm、216 × 279 mm、176 × 176 mm",
      title: "",
      author: "",
      subject: "",
      keywords: "",
      pageCount: 3
    });
    expect(metadata.creator).toContain("pdf-lib");
    expect(metadata.producer).toContain("pdf-lib");
    expect(new Date(metadata.creationDate).toISOString()).toBe(metadata.creationDate);
    expect(new Date(metadata.modificationDate).toISOString()).toBe(metadata.modificationDate);
  });

  it("更新可编辑元数据后可从生成文件完整读回", async () => {
    const originalMetadata = await readPdfMetadata(fixture("mixed-page-sizes.pdf"));
    const result = await updatePdfMetadata(
      fixture("mixed-page-sizes.pdf"),
      {
        title: "年度报告",
        author: "Meowv",
        subject: "浏览器端 PDF 集成测试",
        keywords: "PDF, 浏览器，离线; 安全",
        creationDate: "2024-01-02T03:04:05.000Z",
        modificationDate: "2025-06-07T08:09:10.000Z"
      },
      "元数据/结果.PDF"
    );
    const generatedBytes = new Uint8Array(await result.files[0]!.blob.arrayBuffer());
    const metadata = await readPdfMetadata(generatedBytes);

    expect(result.files[0]?.name).toBe("元数据-结果.pdf");
    expect(metadata).toMatchObject({
      title: "年度报告",
      author: "Meowv",
      subject: "浏览器端 PDF 集成测试",
      keywords: "PDF 浏览器 离线 安全",
      creationDate: "2024-01-02T03:04:05.000Z",
      modificationDate: "2025-06-07T08:09:10.000Z",
      creator: originalMetadata.creator,
      producer: originalMetadata.producer,
      pageCount: 3,
      pageSizes: "210 × 297 mm、216 × 279 mm、176 × 176 mm"
    });
  });

  it("清除可编辑元数据会删除 Info 键，并保留 Creator 与 Producer", async () => {
    const source = await PDFDocument.load(fixture("single-page.pdf"), {
      updateMetadata: false
    });
    source.setTitle("旧标题");
    source.setAuthor("旧作者");
    source.setSubject("旧主题");
    source.setKeywords(["旧关键词"]);
    source.setCreationDate(new Date("2020-01-02T03:04:05.000Z"));
    source.setModificationDate(new Date("2021-02-03T04:05:06.000Z"));
    source.setCreator("Original Creator");
    source.setProducer("Original Producer");
    const sourceBytes = await source.save();

    const result = await updatePdfMetadata(
      sourceBytes,
      {
        title: "",
        author: "",
        subject: "",
        keywords: "",
        creationDate: "",
        modificationDate: ""
      },
      "清理结果.pdf"
    );
    const generatedBytes = new Uint8Array(await result.files[0]!.blob.arrayBuffer());
    const metadata = await readPdfMetadata(generatedBytes);
    const generated = await PDFDocument.load(generatedBytes, { updateMetadata: false });
    const info = generated.context.lookup(generated.context.trailerInfo.Info, PDFDict);

    expect(metadata).toMatchObject({
      title: "",
      author: "",
      subject: "",
      keywords: "",
      creationDate: "",
      modificationDate: "",
      creator: "Original Creator",
      producer: "Original Producer"
    });
    expect(
      [
        PDFName.Title,
        PDFName.Author,
        PDFName.Subject,
        PDFName.Keywords,
        PDFName.CreationDate,
        PDFName.ModDate
      ].every((key) => !info.has(key))
    ).toBe(true);
    expect(info.has(PDFName.Creator)).toBe(true);
    expect(info.has(PDFName.Producer)).toBe(true);
  });
});

describe.skipIf(!canvasIsAvailable())("依赖 Canvas 的 PDF 页面叠加集成", () => {
  it("只在选定页面添加连续页码", async () => {
    const progress: Array<[number, number]> = [];
    const result = await addPageNumbers(
      fixture("multi-page.pdf"),
      {
        format: "ratio",
        startNumber: 7,
        pages: [1, 3],
        fontSize: 12,
        color: "#334155",
        opacity: 0.8,
        horizontalMargin: 24,
        verticalMargin: 24,
        position: "bottom-center",
        outputName: "页码结果.pdf"
      },
      undefined,
      (current, total) => progress.push([current, total])
    );
    const numbered = await loadGeneratedPdf(result);

    expect(numbered.getPageCount()).toBe(3);
    expect([0, 1, 2].map((index) => xObjectCount(numbered, index))).toEqual([1, 0, 1]);
    expect(progress).toEqual([
      [1, 2],
      [2, 2]
    ]);
    expect(result.files[0]?.name).toBe("页码结果.pdf");
  });

  it("只在选定页面添加文字水印", async () => {
    const progress: Array<[number, number]> = [];
    const result = await addWatermark(
      fixture("multi-page.pdf"),
      {
        type: "text",
        text: "Meowv",
        fontSize: 28,
        color: "#2563eb",
        opacity: 0.25,
        rotation: -30,
        tiled: false,
        horizontalGap: 80,
        verticalGap: 80,
        position: "center",
        scale: 1,
        pages: [2],
        outputName: "水印结果.pdf"
      },
      undefined,
      (current, total) => progress.push([current, total])
    );
    const watermarked = await loadGeneratedPdf(result);

    expect(watermarked.getPageCount()).toBe(3);
    expect([0, 1, 2].map((index) => xObjectCount(watermarked, index))).toEqual([0, 1, 0]);
    expect(progress).toEqual([[1, 1]]);
    expect(result.files[0]?.name).toBe("水印结果.pdf");
  });
});
