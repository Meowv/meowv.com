export const SUPPORTED_FILE_EXTENSIONS = ["xlsx", "xls", "csv"] as const;
export const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024;

export const IMPORT_FILE_ACCEPT =
  ".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv";
