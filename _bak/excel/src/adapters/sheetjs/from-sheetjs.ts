import type { CellObject, ColInfo, RowInfo, WorkBook, WorkSheet } from "xlsx";
import { utils } from "xlsx";

import type {
  NormalizedBorderSide,
  NormalizedBorderStyle,
  NormalizedCell,
  NormalizedCellBorders,
  NormalizedCellStyle,
  NormalizedColumnConfig,
  NormalizedFrozenPane,
  NormalizedHorizontalAlignment,
  NormalizedRowConfig,
  NormalizedSheet,
  NormalizedVerticalAlignment,
  NormalizedWorkbook,
} from "../../types/normalized-workbook";

const MAX_EXCEL_ROWS = 1_048_576;
const MAX_EXCEL_COLUMNS = 16_384;
const CELL_ADDRESS_PATTERN = /^[A-Z]{1,3}[1-9]\d*$/i;
const DATE_FORMAT_PATTERN = /(^|[^\\])(?:y{1,4}|m{1,4}|d{1,4}|h{1,2}|s{1,2}|am\/pm)(?![^[]*\])/i;

export interface SheetJsToNormalizedOptions {
  fileName?: string;
  workbookName?: string;
  idFactory?: () => string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCellObject(value: unknown): value is CellObject {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.t === "string" && ["b", "n", "e", "s", "d", "z"].includes(value.t);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function normalizeColor(value: unknown): string | undefined {
  if (typeof value === "string") {
    const color = value.startsWith("#") ? value : `#${value}`;
    return /^#[0-9A-F]{6}$/i.test(color) ? color.toUpperCase() : undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const rgb = readString(value, "rgb");
  if (!rgb) {
    return undefined;
  }

  const normalized = rgb.replace(/^#/, "").replace(/^[0-9A-F]{2}(?=[0-9A-F]{6}$)/i, "");
  return /^[0-9A-F]{6}$/i.test(normalized) ? `#${normalized.toUpperCase()}` : undefined;
}

function normalizeBorderStyle(value: string | undefined): NormalizedBorderStyle | undefined {
  switch (value) {
    case "thin":
    case "medium":
    case "thick":
    case "dotted":
    case "dashed":
    case "double":
    case "hair":
    case "dashDot":
    case "dashDotDot":
      return value;
    case "mediumDashed":
      return "dashed";
    case "mediumDashDot":
      return "dashDot";
    case "mediumDashDotDot":
      return "dashDotDot";
    default:
      return undefined;
  }
}

function normalizeBorderSide(value: unknown): NormalizedBorderSide | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const style = normalizeBorderStyle(readString(value, "style"));
  if (!style) {
    return undefined;
  }

  return {
    style,
    color: normalizeColor(value.color),
  };
}

function normalizeBorders(value: unknown): NormalizedCellBorders | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const borders: NormalizedCellBorders = {
    top: normalizeBorderSide(value.top),
    right: normalizeBorderSide(value.right),
    bottom: normalizeBorderSide(value.bottom),
    left: normalizeBorderSide(value.left),
  };

  return Object.values(borders).some(Boolean) ? borders : undefined;
}

function normalizeHorizontalAlignment(
  value: string | undefined,
): NormalizedHorizontalAlignment | undefined {
  switch (value) {
    case "left":
    case "center":
    case "right":
    case "justify":
    case "distributed":
      return value;
    default:
      return undefined;
  }
}

function normalizeVerticalAlignment(
  value: string | undefined,
): NormalizedVerticalAlignment | undefined {
  switch (value) {
    case "top":
    case "bottom":
      return value;
    case "center":
      return "middle";
    default:
      return undefined;
  }
}

function normalizeCellStyle(value: unknown): NormalizedCellStyle | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const font = isRecord(value.font) ? value.font : undefined;
  const fill = isRecord(value.fill) ? value.fill : undefined;
  const alignment = isRecord(value.alignment) ? value.alignment : undefined;
  const normalized: NormalizedCellStyle = {};

  if (font) {
    const normalizedFont = {
      family: readString(font, "name"),
      size: readNumber(font, "sz"),
      bold: readBoolean(font, "bold"),
      italic: readBoolean(font, "italic"),
      underline:
        readBoolean(font, "underline") ??
        (readString(font, "underline") !== undefined ? true : undefined),
      strike: readBoolean(font, "strike"),
      color: normalizeColor(font.color),
    };

    if (Object.values(normalizedFont).some((item) => item !== undefined)) {
      normalized.font = normalizedFont;
    }
  }

  if (fill) {
    normalized.fillColor = normalizeColor(fill.fgColor ?? fill.bgColor);
  }

  if (alignment) {
    normalized.horizontalAlignment = normalizeHorizontalAlignment(
      readString(alignment, "horizontal"),
    );
    normalized.verticalAlignment = normalizeVerticalAlignment(readString(alignment, "vertical"));
    normalized.wrapText = readBoolean(alignment, "wrapText");
    normalized.textRotation = readNumber(alignment, "textRotation");
  }

  normalized.borders = normalizeBorders(value.border);
  return Object.values(normalized).some((item) => item !== undefined) ? normalized : undefined;
}

function excelDateToSerial(date: Date): number {
  const excelEpoch = Date.UTC(1899, 11, 30);
  return (date.getTime() - excelEpoch) / 86_400_000;
}

function normalizeNumberFormat(cell: CellObject): string | undefined {
  if (typeof cell.z === "string") {
    return cell.z;
  }

  return typeof cell.z === "number" ? String(cell.z) : undefined;
}

function looksLikeDateFormat(numberFormat: string | undefined): boolean {
  return numberFormat !== undefined && DATE_FORMAT_PATTERN.test(numberFormat);
}

function normalizeFormula(formula: string | undefined): string | undefined {
  if (!formula) {
    return undefined;
  }

  return formula.startsWith("=") ? formula : `=${formula}`;
}

function normalizeCell(cell: CellObject): NormalizedCell {
  const formula = normalizeFormula(cell.f);
  const numberFormat = normalizeNumberFormat(cell);
  const result: NormalizedCell = {
    formula,
    numberFormat,
    style: normalizeCellStyle(cell.s),
  };

  if (cell.v instanceof Date) {
    result.value = excelDateToSerial(cell.v);
    result.type = formula ? "formula" : "date";
  } else if (cell.v === undefined || cell.v === null || cell.t === "z") {
    result.value = null;
    result.type = formula ? "formula" : "empty";
  } else if (cell.t === "b") {
    result.value = Boolean(cell.v);
    result.type = formula ? "formula" : "boolean";
  } else if (cell.t === "n" && typeof cell.v === "number") {
    result.value = cell.v;
    result.type = formula ? "formula" : looksLikeDateFormat(numberFormat) ? "date" : "number";
  } else if (cell.t === "e") {
    result.value = cell.w ?? String(cell.v);
    result.type = formula ? "formula" : "string";
  } else {
    result.value = String(cell.v);
    result.type = formula ? "formula" : "string";
  }

  if (cell.c?.length) {
    result.note = cell.c.map((comment) => comment.t).join("\n");
  }

  if (cell.l?.Target) {
    result.hyperlink = {
      target: cell.l.Target,
      tooltip: cell.l.Tooltip,
    };
  }

  return result;
}

function safeDecodeRange(reference: unknown): {
  endRow: number;
  endColumn: number;
} {
  if (typeof reference !== "string" || reference.length === 0) {
    return { endRow: 0, endColumn: 0 };
  }

  try {
    const range = utils.decode_range(reference);
    if (range.e.r >= MAX_EXCEL_ROWS || range.e.c >= MAX_EXCEL_COLUMNS) {
      throw new Error("工作表范围超过 Excel 支持的最大行列数。");
    }
    return { endRow: range.e.r, endColumn: range.e.c };
  } catch (error) {
    if (error instanceof Error && error.message.includes("超过 Excel")) {
      throw error;
    }
    return { endRow: 0, endColumn: 0 };
  }
}

function normalizeRows(
  rows: RowInfo[] | undefined,
): Record<number, NormalizedRowConfig> | undefined {
  if (!rows) {
    return undefined;
  }

  const configs: Record<number, NormalizedRowConfig> = {};
  rows.forEach((row, index) => {
    if (!row) {
      return;
    }

    const height = row.hpx ?? (row.hpt === undefined ? undefined : (row.hpt * 96) / 72);
    if (height !== undefined || row.hidden !== undefined) {
      configs[index] = { height, hidden: row.hidden };
    }
  });

  return Object.keys(configs).length > 0 ? configs : undefined;
}

function columnWidthInPixels(column: ColInfo): number | undefined {
  if (column.wpx !== undefined) {
    return column.wpx;
  }
  if (column.wch !== undefined) {
    return Math.round(column.wch * 7 + 5);
  }
  return column.width === undefined ? undefined : Math.round(column.width * 7);
}

function normalizeColumns(
  columns: ColInfo[] | undefined,
): Record<number, NormalizedColumnConfig> | undefined {
  if (!columns) {
    return undefined;
  }

  const configs: Record<number, NormalizedColumnConfig> = {};
  columns.forEach((column, index) => {
    if (!column) {
      return;
    }

    const width = columnWidthInPixels(column);
    if (width !== undefined || column.hidden !== undefined) {
      configs[index] = { width, hidden: column.hidden };
    }
  });

  return Object.keys(configs).length > 0 ? configs : undefined;
}

function normalizeFrozenPane(worksheet: WorkSheet): NormalizedFrozenPane | undefined {
  const rawFreeze: unknown = worksheet["!freeze"];
  if (!isRecord(rawFreeze)) {
    return undefined;
  }

  const rows = readNumber(rawFreeze, "ySplit") ?? readNumber(rawFreeze, "rows") ?? 0;
  const columns = readNumber(rawFreeze, "xSplit") ?? readNumber(rawFreeze, "columns") ?? 0;
  if (rows <= 0 && columns <= 0) {
    return undefined;
  }

  return {
    rows: Math.max(0, Math.floor(rows)),
    columns: Math.max(0, Math.floor(columns)),
    startRow: readNumber(rawFreeze, "startRow"),
    startColumn: readNumber(rawFreeze, "startColumn"),
  };
}

function defaultIdFactory(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function workbookNameFromFile(fileName: string | undefined): string {
  const fallback = "导入的工作簿";
  if (!fileName) {
    return fallback;
  }

  const withoutExtension = fileName.replace(/\.(xlsx|xls|csv)$/i, "").trim();
  return withoutExtension || fallback;
}

function normalizeSheet(
  workbook: WorkBook,
  worksheet: WorkSheet,
  sheetName: string,
  sheetIndex: number,
  idFactory: () => string,
): NormalizedSheet {
  const declaredRange = safeDecodeRange(worksheet["!ref"]);
  let maxRow = declaredRange.endRow;
  let maxColumn = declaredRange.endColumn;
  const cells: Record<string, NormalizedCell> = {};

  Object.keys(worksheet).forEach((address) => {
    if (!CELL_ADDRESS_PATTERN.test(address)) {
      return;
    }

    const rawCell: unknown = worksheet[address];
    if (!isCellObject(rawCell)) {
      return;
    }

    const position = utils.decode_cell(address);
    if (position.r >= MAX_EXCEL_ROWS || position.c >= MAX_EXCEL_COLUMNS) {
      throw new Error("工作表单元格地址超过 Excel 支持的最大行列数。");
    }
    maxRow = Math.max(maxRow, position.r);
    maxColumn = Math.max(maxColumn, position.c);
    cells[utils.encode_cell(position)] = normalizeCell(rawCell);
  });

  const visibilityCode = workbook.Workbook?.Sheets?.[sheetIndex]?.Hidden ?? 0;
  const visibility =
    visibilityCode === 2 ? "veryHidden" : visibilityCode === 1 ? "hidden" : "visible";
  const rawTabColor: unknown = worksheet["!tabColor"];

  return {
    id: idFactory(),
    name: sheetName,
    rowCount: Math.max(1, maxRow + 1),
    columnCount: Math.max(1, maxColumn + 1),
    cells,
    merges: (worksheet["!merges"] ?? []).map((range) => ({
      startRow: range.s.r,
      startColumn: range.s.c,
      endRow: range.e.r,
      endColumn: range.e.c,
    })),
    rowConfigs: normalizeRows(worksheet["!rows"]),
    columnConfigs: normalizeColumns(worksheet["!cols"]),
    frozen: normalizeFrozenPane(worksheet),
    hidden: visibility !== "visible",
    visibility,
    tabColor: normalizeColor(rawTabColor),
  };
}

export function countSheetJsNonEmptyCells(workbook: WorkBook): number {
  return workbook.SheetNames.reduce((total, sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      return total;
    }

    return (
      total +
      Object.keys(worksheet).filter((address) => {
        if (!CELL_ADDRESS_PATTERN.test(address)) {
          return false;
        }
        const rawCell: unknown = worksheet[address];
        return (
          isCellObject(rawCell) &&
          (rawCell.v !== undefined || (typeof rawCell.f === "string" && rawCell.f.length > 0))
        );
      }).length
    );
  }, 0);
}

export function sheetJsToNormalized(
  workbook: WorkBook,
  options: SheetJsToNormalizedOptions = {},
): NormalizedWorkbook {
  const idFactory = options.idFactory ?? defaultIdFactory;
  const sheets = workbook.SheetNames.map((sheetName, index) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error(`工作表“${sheetName}”缺少数据。`);
    }
    return normalizeSheet(workbook, worksheet, sheetName, index, idFactory);
  });

  if (sheets.length === 0) {
    throw new Error("文件中没有可打开的工作表。");
  }

  return {
    id: idFactory(),
    name: options.workbookName?.trim() || workbookNameFromFile(options.fileName),
    sheets,
    activeSheetId: sheets[0]?.id,
    metadata: {
      sourceFileName: options.fileName,
      sourceEngine: "SheetJS CE 0.20.3",
      importedAt: Date.now(),
    },
  };
}
