import type { PdfErrorCode } from "../types";

export class PdfProcessingError extends Error {
  readonly code: PdfErrorCode;
  override readonly cause: unknown;

  constructor(code: PdfErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "PdfProcessingError";
    this.code = code;
    this.cause = cause;
  }
}

const ERROR_MESSAGES: Record<PdfErrorCode, string> = {
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

export function mapPdfError(error: unknown): PdfProcessingError {
  if (error instanceof PdfProcessingError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("password") || normalized.includes("encrypted")) {
    return new PdfProcessingError("ENCRYPTED_PDF", ERROR_MESSAGES.ENCRYPTED_PDF, error);
  }

  if (
    normalized.includes("out of memory") ||
    normalized.includes("allocation failed") ||
    normalized.includes("array buffer")
  ) {
    return new PdfProcessingError("OUT_OF_MEMORY", ERROR_MESSAGES.OUT_OF_MEMORY, error);
  }

  if (
    normalized.includes("invalid pdf") ||
    normalized.includes("no pdf header") ||
    normalized.includes("failed to parse")
  ) {
    return new PdfProcessingError("CORRUPTED_PDF", ERROR_MESSAGES.CORRUPTED_PDF, error);
  }

  if (normalized.includes("abort")) {
    return new PdfProcessingError("PROCESS_ABORTED", ERROR_MESSAGES.PROCESS_ABORTED, error);
  }

  return new PdfProcessingError("UNKNOWN_ERROR", ERROR_MESSAGES.UNKNOWN_ERROR, error);
}

export function getPdfErrorMessage(code: PdfErrorCode): string {
  return ERROR_MESSAGES[code];
}
