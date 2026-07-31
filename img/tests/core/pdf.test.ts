import { describe, expect, it } from "vitest";

import {
  buildPdfDocument,
  createImagesPdf,
  MAX_PDF_IMAGE_BYTES,
  MAX_PDF_IMAGE_COUNT,
} from "@/core/image/pdf";

function jpeg(payload: number[]): Blob {
  return new Blob(
    [new Uint8Array([0xff, 0xd8, 0xff, ...payload, 0xff, 0xd9])],
    { type: "image/jpeg" },
  );
}

async function pdfText(blob: Blob): Promise<string> {
  return new TextDecoder("windows-1252").decode(await blob.arrayBuffer());
}

function xrefOffsets(source: string): number[] {
  const match = source.match(/xref\n0 (\d+)\n([\s\S]*?)\ntrailer\n/);
  if (!match) {
    throw new Error("PDF xref 不存在");
  }

  return match[2]!
    .split("\n")
    .slice(1)
    .map((line) => Number(line.slice(0, 10)));
}

describe("buildPdfDocument", () => {
  it("生成多页 PDF，并让 xref 精确指向每个对象的字节偏移", async () => {
    const pdf = buildPdfDocument(
      [
        { jpeg: jpeg([0x11, 0x22]), width: 1600, height: 900 },
        { jpeg: jpeg([0x33, 0x44, 0x55]), width: 800, height: 1200 },
      ],
      {
        pageSize: "a4",
        orientation: "portrait",
        marginMm: 12,
      },
    );
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    const source = await pdfText(pdf);

    expect(pdf.type).toBe("application/pdf");
    expect(String.fromCharCode(...bytes.subarray(0, 8))).toBe("%PDF-1.7");
    expect(source).toContain("/Type /Pages /Count 2");
    expect(source).toContain("/Kids [3 0 R 6 0 R]");
    expect(source).toContain("/MediaBox [0 0 595.276 841.89]");

    const offsets = xrefOffsets(source);
    expect(offsets).toHaveLength(8);
    offsets.forEach((offset, index) => {
      const marker = `${index + 1} 0 obj`;
      expect(
        new TextDecoder().decode(bytes.subarray(offset, offset + marker.length)),
      ).toBe(marker);
    });

    const startXref = Number(source.match(/startxref\n(\d+)\n%%EOF/)?.[1]);
    expect(
      String.fromCharCode(...bytes.subarray(startXref, startXref + 4)),
    ).toBe("xref");
  });

  it("在自适应横向页面中保留边距并等比居中", async () => {
    const pdf = buildPdfDocument(
      [{ jpeg: jpeg([0x01]), width: 400, height: 800 }],
      {
        pageSize: "adaptive",
        orientation: "landscape",
        marginMm: 10,
      },
    );
    const source = await pdfText(pdf);

    expect(source).toContain("/MediaBox [0 0 656.693 356.693]");
    expect(source).toMatch(
      /150 0 0 300 253\.346 28\.346 cm\n\/Im1 Do/,
    );
  });

  it.each([
    ["a3", "841.89 1190.551"],
    ["a4", "595.276 841.89"],
    ["a5", "419.528 595.276"],
    ["letter", "612 792"],
  ] as const)("支持 %s 竖向纸张尺寸", async (pageSize, mediaBox) => {
    const pdf = buildPdfDocument(
      [{ jpeg: jpeg([0x01]), width: 800, height: 600 }],
      {
        pageSize,
        orientation: "portrait",
        marginMm: 0,
      },
    );

    expect(await pdfText(pdf)).toContain(`/MediaBox [0 0 ${mediaBox}]`);
  });

  it("支持填充裁切与原始大小两种图片适配方式", async () => {
    const fillPdf = buildPdfDocument(
      [{ jpeg: jpeg([0x01]), width: 400, height: 800 }],
      {
        pageSize: "a4",
        orientation: "portrait",
        marginMm: 0,
        imageFit: "fill",
      },
    );
    const originalPdf = buildPdfDocument(
      [{ jpeg: jpeg([0x01]), width: 400, height: 800 }],
      {
        pageSize: "a4",
        orientation: "portrait",
        marginMm: 0,
        imageFit: "original",
      },
    );
    const fillSource = await pdfText(fillPdf);
    const originalSource = await pdfText(originalPdf);

    expect(fillSource).toContain("0 0 595.276 841.89 re W n");
    expect(fillSource).toMatch(
      /595\.276 0 0 1190\.552 0 -174\.331 cm\n\/Im1 Do/,
    );
    expect(originalSource).toContain("0 0 595.276 841.89 re W n");
    expect(originalSource).toContain(
      "300 0 0 600 147.638 120.945 cm\n/Im1 Do",
    );
  });

  it("拒绝空页面、过多页面和无可用内容的页面", () => {
    const options = {
      pageSize: "a4" as const,
      orientation: "portrait" as const,
      marginMm: 12,
    };

    expect(() => buildPdfDocument([], options)).toThrow("至少需要一张图片");
    expect(() =>
      buildPdfDocument(
        Array.from({ length: MAX_PDF_IMAGE_COUNT + 1 }, () => ({
          jpeg: jpeg([0x01]),
          width: 1,
          height: 1,
        })),
        options,
      ),
    ).toThrow(`一次最多生成 ${MAX_PDF_IMAGE_COUNT} 页`);
    expect(() =>
      buildPdfDocument(
        [{ jpeg: new Blob(), width: 1, height: 1 }],
        options,
      ),
    ).toThrow("无法把空图片写入 PDF");
  });
});

describe("createImagesPdf", () => {
  it("在解码前拒绝超过张数和单张大小限制的输入", async () => {
    const options = {
      pageSize: "a4" as const,
      orientation: "portrait" as const,
      marginMm: 12,
    };
    const tinyFile = { name: "tiny.png", size: 1 } as File;
    const oversizedFile = {
      name: "large.png",
      size: MAX_PDF_IMAGE_BYTES + 1,
    } as File;

    await expect(
      createImagesPdf(
        Array.from({ length: MAX_PDF_IMAGE_COUNT + 1 }, () => tinyFile),
        options,
      ),
    ).rejects.toThrow(`一次最多处理 ${MAX_PDF_IMAGE_COUNT} 张图片`);
    await expect(createImagesPdf([oversizedFile], options)).rejects.toThrow(
      "large.png超过 50 MB",
    );
  });
});
