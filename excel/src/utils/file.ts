import { AppError } from "../models/app-error";
export const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024;
export const SUPPORTED_SPREADSHEET_EXTENSIONS = ["xlsx", "xls", "csv"] as const;

export type SpreadsheetFileType = (typeof SUPPORTED_SPREADSHEET_EXTENSIONS)[number];
export type WorkbookExportFileType = "xlsx" | "csv" | "json";

export interface ValidatedSpreadsheetFile {
  file: File;
  fileType: SpreadsheetFileType;
  extension: SpreadsheetFileType;
}

export function getFileExtension(fileName: string): string | undefined {
  const normalizedName = fileName.trim();
  const lastDotIndex = normalizedName.lastIndexOf(".");
  if (lastDotIndex <= 0 || lastDotIndex === normalizedName.length - 1) {
    return undefined;
  }

  return normalizedName.slice(lastDotIndex + 1).toLowerCase();
}

export function getSpreadsheetFileType(fileName: string): SpreadsheetFileType | undefined {
  const extension = getFileExtension(fileName);
  return SUPPORTED_SPREADSHEET_EXTENSIONS.find((candidate) => candidate === extension);
}

export function isSupportedSpreadsheetFile(fileOrName: File | string): boolean {
  const fileName = typeof fileOrName === "string" ? fileOrName : fileOrName.name;
  return getSpreadsheetFileType(fileName) !== undefined;
}

export function validateSpreadsheetFile(
  file: File,
  maxFileSize = MAX_IMPORT_FILE_SIZE,
): ValidatedSpreadsheetFile {
  const fileType = getSpreadsheetFileType(file.name);
  if (!fileType) {
    throw new AppError({
      code: "UNSUPPORTED_FILE_TYPE",
      message: "仅支持 .xlsx、.xls 和 .csv 文件。",
      details: { fileName: file.name },
    });
  }

  if (file.size <= 0) {
    throw new AppError({
      code: "INVALID_FILE",
      message: "文件内容为空，无法打开。",
      details: { fileName: file.name },
    });
  }

  if (file.size > maxFileSize) {
    const maxFileSizeInMegabytes = Math.round(maxFileSize / (1024 * 1024));
    throw new AppError({
      code: "FILE_TOO_LARGE",
      message: `文件超过 ${maxFileSizeInMegabytes} MB，暂时无法打开。`,
      details: {
        fileName: file.name,
        fileSize: file.size,
        maxFileSize,
      },
    });
  }

  return { file, fileType, extension: fileType };
}

function replaceInvalidFileNameCharacters(value: string): string {
  const invalidCharacters = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"]);

  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return invalidCharacters.has(character) || code < 32 ? "_" : character;
  }).join("");
}

export function sanitizeFileName(value: string, fallback = "未命名表格"): string {
  const sanitized = replaceInvalidFileNameCharacters(value)
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/g, "")
    .trim()
    .slice(0, 180);
  const safeName = sanitized || fallback;
  const isReservedWindowsName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safeName);

  return isReservedWindowsName ? `_${safeName}` : safeName;
}

export function createExportFileName(
  workbookName: string,
  fileType: WorkbookExportFileType = "xlsx",
): string {
  return `${sanitizeFileName(workbookName)}.${fileType}`;
}
