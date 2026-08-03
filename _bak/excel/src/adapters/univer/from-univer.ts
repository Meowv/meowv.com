import type { ICellData, IStyleData, IWorkbookData, IWorksheetData } from "@univerjs/presets";

import type {
  NormalizedCell,
  NormalizedSheet,
  NormalizedWorkbook,
} from "../../types/normalized-workbook";
import { encodeNormalizedAddress } from "./address";
import { univerStyleToNormalized } from "./style";

const DATE_FORMAT_PATTERN = /(^|[^\\])(?:y{1,4}|m{1,4}|d{1,4}|h{1,2}|s{1,2}|am\/pm)(?![^[]*\])/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveStyle(
  workbook: IWorkbookData,
  style: ICellData["s"],
): IStyleData | null | undefined | void {
  if (typeof style === "string") {
    return workbook.styles[style];
  }
  return style;
}

function normalizeCell(workbook: IWorkbookData, cell: ICellData): NormalizedCell {
  const resolvedStyle = univerStyleToNormalized(resolveStyle(workbook, cell.s));
  const formula = typeof cell.f === "string" && cell.f.length > 0 ? cell.f : undefined;
  const value = cell.v ?? null;
  let type: NormalizedCell["type"];

  if (formula) {
    type = "formula";
  } else if (value === null) {
    type = "empty";
  } else if (cell.t === 3 || typeof value === "boolean") {
    type = "boolean";
  } else if (cell.t === 2 || typeof value === "number") {
    type =
      resolvedStyle.numberFormat && DATE_FORMAT_PATTERN.test(resolvedStyle.numberFormat)
        ? "date"
        : "number";
  } else {
    type = "string";
  }

  const custom: unknown = cell.custom;
  const note = isRecord(custom) && typeof custom.note === "string" ? custom.note : undefined;
  const hyperlink =
    isRecord(custom) && isRecord(custom.hyperlink) && typeof custom.hyperlink.target === "string"
      ? {
          target: custom.hyperlink.target,
          tooltip:
            typeof custom.hyperlink.tooltip === "string" ? custom.hyperlink.tooltip : undefined,
        }
      : undefined;

  return {
    value,
    formula,
    type,
    style: resolvedStyle.style,
    numberFormat: resolvedStyle.numberFormat,
    note,
    hyperlink,
  };
}

function normalizeSheet(
  workbook: IWorkbookData,
  worksheet: Partial<IWorksheetData>,
): NormalizedSheet {
  const cells: NormalizedSheet["cells"] = {};
  let maxRow = 0;
  let maxColumn = 0;

  Object.entries(worksheet.cellData ?? {}).forEach(([rowKey, row]) => {
    const rowIndex = Number(rowKey);
    if (!row || !Number.isInteger(rowIndex) || rowIndex < 0) {
      return;
    }

    Object.entries(row).forEach(([columnKey, cell]) => {
      const columnIndex = Number(columnKey);
      if (!cell || !Number.isInteger(columnIndex) || columnIndex < 0) {
        return;
      }
      maxRow = Math.max(maxRow, rowIndex);
      maxColumn = Math.max(maxColumn, columnIndex);
      cells[encodeNormalizedAddress(rowIndex, columnIndex)] = normalizeCell(workbook, cell);
    });
  });

  const rowConfigs: NonNullable<NormalizedSheet["rowConfigs"]> = {};
  Object.entries(worksheet.rowData ?? {}).forEach(([rowKey, row]) => {
    if (!row) {
      return;
    }
    const rowIndex = Number(rowKey);
    rowConfigs[rowIndex] = {
      height: row.h,
      hidden: row.hd === 1,
    };
  });

  const columnConfigs: NonNullable<NormalizedSheet["columnConfigs"]> = {};
  Object.entries(worksheet.columnData ?? {}).forEach(([columnKey, column]) => {
    if (!column) {
      return;
    }
    const columnIndex = Number(columnKey);
    columnConfigs[columnIndex] = {
      width: column.w,
      hidden: column.hd === 1,
    };
  });

  const freeze = worksheet.freeze;
  return {
    id: worksheet.id ?? "",
    name: worksheet.name ?? "Sheet",
    rowCount: Math.max(1, worksheet.rowCount ?? maxRow + 1),
    columnCount: Math.max(1, worksheet.columnCount ?? maxColumn + 1),
    cells,
    merges: (worksheet.mergeData ?? []).map((range) => ({
      startRow: range.startRow,
      startColumn: range.startColumn,
      endRow: range.endRow,
      endColumn: range.endColumn,
    })),
    rowConfigs: Object.keys(rowConfigs).length > 0 ? rowConfigs : undefined,
    columnConfigs: Object.keys(columnConfigs).length > 0 ? columnConfigs : undefined,
    frozen:
      freeze && (freeze.xSplit > 0 || freeze.ySplit > 0)
        ? {
            rows: freeze.ySplit,
            columns: freeze.xSplit,
            startRow: freeze.startRow,
            startColumn: freeze.startColumn,
          }
        : undefined,
    hidden: worksheet.hidden === 1,
    visibility: worksheet.hidden === 1 ? "hidden" : "visible",
    tabColor: worksheet.tabColor || undefined,
  };
}

function activeSheetIdFromCustom(workbook: IWorkbookData): string | undefined {
  const custom: unknown = workbook.custom;
  return isRecord(custom) && typeof custom.activeSheetId === "string"
    ? custom.activeSheetId
    : undefined;
}

export function univerToNormalized(workbook: IWorkbookData): NormalizedWorkbook {
  const orderedSheetIds =
    workbook.sheetOrder.length > 0 ? workbook.sheetOrder : Object.keys(workbook.sheets);
  const sheets = orderedSheetIds
    .map((sheetId) => workbook.sheets[sheetId])
    .filter((worksheet): worksheet is Partial<IWorksheetData> => worksheet !== undefined)
    .map((worksheet) => normalizeSheet(workbook, worksheet));

  return {
    id: workbook.id,
    name: workbook.name,
    sheets,
    activeSheetId: activeSheetIdFromCustom(workbook) ?? sheets[0]?.id,
    metadata: {
      sourceEngine: "Univer",
      univerAppVersion: workbook.appVersion,
    },
  };
}
