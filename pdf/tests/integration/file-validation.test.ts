import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPdfFile } from "../../core/pdf/shared/file";
import type { PdfProcessingError } from "../../core/pdf/shared/errors";

const { destroyDocument, openPdfDocument } = vi.hoisted(() => ({
  destroyDocument: vi.fn(async () => undefined),
  openPdfDocument: vi.fn(async () => ({
    numPages: 1,
    destroyDocument
  }))
}));

vi.mock("../../core/pdf/render/pdfjs", () => ({
  openPdfDocument
}));

async function createPdfFile(name = "valid.pdf"): Promise<File> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595.28, 841.89]);
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], name, { type: "application/pdf" });
}

describe("PDF 文件双重校验", () => {
  beforeEach(() => {
    openPdfDocument.mockClear();
    destroyDocument.mockClear();
  });

  it("通过 pdf-lib 与 PDF.js 后返回可用页数", async () => {
    const loaded = await loadPdfFile(await createPdfFile());

    expect(loaded.name).toBe("valid.pdf");
    expect(loaded.pageCount).toBe(1);
    expect(loaded.status).toBe("ready");
    expect(openPdfDocument).toHaveBeenCalledOnce();
    expect(destroyDocument).toHaveBeenCalledOnce();
  });

  it("拒绝伪造 PDF 文件头的损坏文件", async () => {
    const file = new File(["%PDF-not-a-document"], "broken.pdf", {
      type: "application/pdf"
    });

    await expect(loadPdfFile(file)).rejects.toMatchObject<PdfProcessingError>({
      code: "CORRUPTED_PDF"
    });
  });

  it("拒绝错误扩展名", async () => {
    await expect(
      loadPdfFile(await createPdfFile("valid.txt"))
    ).rejects.toMatchObject<PdfProcessingError>({
      code: "INVALID_FILE"
    });
  });
});
