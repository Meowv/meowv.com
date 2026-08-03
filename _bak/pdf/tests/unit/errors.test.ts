import { describe, expect, it } from "vitest";

import { getPdfErrorMessage, mapPdfError, PdfProcessingError } from "../../core/pdf/shared/errors";
import type { PdfErrorCode } from "../../core/pdf/types";

const expectedMessages: Record<PdfErrorCode, string> = {
  INVALID_FILE: "请选择有效的 PDF 或受支持的图片文件。",
  CORRUPTED_PDF: "无法读取这个 PDF，文件可能已损坏或格式不完整。",
  ENCRYPTED_PDF: "这个 PDF 受密码保护，当前工具暂不支持处理加密文件。",
  UNSUPPORTED_PDF: "当前浏览器无法处理这个 PDF 的部分特性。",
  OUT_OF_MEMORY:
    "当前设备可能没有足够内存处理这个文件。请减少页面数量、降低输出清晰度，或在桌面浏览器中重试。",
  PROCESS_ABORTED: "处理已取消，临时资源已经释放。",
  RENDER_FAILED: "页面预览失败，但你可以移除异常文件后继续。",
  EXPORT_FAILED: "生成结果失败。原始文件未被修改，请调整设置后重试。",
  UNKNOWN_ERROR: "处理时发生未知错误，请重新选择文件后再试。"
};

describe("PdfProcessingError", () => {
  it("保留错误码、原始原因和自定义错误名称", () => {
    const cause = new Error("source");
    const error = new PdfProcessingError("EXPORT_FAILED", "导出失败", cause);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PdfProcessingError");
    expect(error.code).toBe("EXPORT_FAILED");
    expect(error.message).toBe("导出失败");
    expect(error.cause).toBe(cause);
  });
});

describe("mapPdfError", () => {
  it("直接返回已经标准化的 PDF 错误", () => {
    const source = new PdfProcessingError("INVALID_FILE", "文件无效");

    expect(mapPdfError(source)).toBe(source);
  });

  it.each([
    ["Password required", "ENCRYPTED_PDF"],
    ["document is ENCRYPTED", "ENCRYPTED_PDF"],
    ["Out of memory", "OUT_OF_MEMORY"],
    ["Allocation failed", "OUT_OF_MEMORY"],
    ["Cannot allocate Array Buffer", "OUT_OF_MEMORY"],
    ["Invalid PDF structure", "CORRUPTED_PDF"],
    ["No PDF header found", "CORRUPTED_PDF"],
    ["Failed to parse number", "CORRUPTED_PDF"],
    ["AbortError: operation stopped", "PROCESS_ABORTED"]
  ] satisfies Array<[string, PdfErrorCode]>)("将 %s 映射为 %s", (message, code) => {
    const source = new Error(message);
    const mapped = mapPdfError(source);

    expect(mapped.code).toBe(code);
    expect(mapped.message).toBe(expectedMessages[code]);
    expect(mapped.cause).toBe(source);
  });

  it("未知 Error 使用通用错误，并保留原始错误", () => {
    const source = new TypeError("unexpected parser state");
    const mapped = mapPdfError(source);

    expect(mapped.code).toBe("UNKNOWN_ERROR");
    expect(mapped.message).toBe(expectedMessages.UNKNOWN_ERROR);
    expect(mapped.cause).toBe(source);
  });

  it("非 Error 值也映射为通用错误", () => {
    const mapped = mapPdfError({ reason: "unexpected" });

    expect(mapped.code).toBe("UNKNOWN_ERROR");
    expect(mapped.message).toBe(expectedMessages.UNKNOWN_ERROR);
    expect(mapped.cause).toEqual({ reason: "unexpected" });
  });
});

describe("getPdfErrorMessage", () => {
  it.each(Object.entries(expectedMessages) as Array<[PdfErrorCode, string]>)(
    "返回 %s 的用户提示",
    (code, message) => {
      expect(getPdfErrorMessage(code)).toBe(message);
    }
  );
});
