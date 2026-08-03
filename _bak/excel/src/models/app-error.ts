export type AppErrorCode =
  | "DATABASE_UNAVAILABLE"
  | "STORAGE_QUOTA_EXCEEDED"
  | "WORKBOOK_NOT_FOUND"
  | "REVISION_NOT_FOUND"
  | "ASSET_NOT_FOUND"
  | "DUPLICATE_WORKBOOK_NAME"
  | "INVALID_WORKBOOK_NAME"
  | "INVALID_FILE"
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "SAVE_FAILED"
  | "OPERATION_CANCELLED"
  | "UNKNOWN";

export interface AppErrorOptions {
  code: AppErrorCode;
  message: string;
  cause?: unknown;
  details?: Readonly<Record<string, unknown>>;
  recoverable?: boolean;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly recoverable: boolean;
  override readonly cause?: unknown;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = "AppError";
    this.code = options.code;
    this.cause = options.cause;
    this.details = options.details;
    this.recoverable = options.recoverable ?? true;
  }

  static from(
    error: unknown,
    fallbackCode: AppErrorCode = "UNKNOWN",
    fallbackMessage = "操作失败，请稍后重试。",
  ): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (isQuotaExceededError(error)) {
      return new AppError({
        code: "STORAGE_QUOTA_EXCEEDED",
        message: "浏览器本地存储空间不足，请导出备份后清理不需要的工作簿。",
        cause: error,
      });
    }

    if (isDatabaseUnavailableError(error)) {
      return new AppError({
        code: "DATABASE_UNAVAILABLE",
        message: "当前浏览器无法使用本地数据库，请检查隐私模式或存储权限。",
        cause: error,
      });
    }

    return new AppError({
      code: fallbackCode,
      message: fallbackMessage,
      cause: error,
    });
  }
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED";
}

export function isDatabaseUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return ["DatabaseClosedError", "InvalidStateError", "MissingAPIError", "SecurityError"].includes(
    error.name,
  );
}

export function toPersistenceError(
  error: unknown,
  fallbackMessage = "本地数据保存失败。",
): AppError {
  return AppError.from(error, "SAVE_FAILED", fallbackMessage);
}
