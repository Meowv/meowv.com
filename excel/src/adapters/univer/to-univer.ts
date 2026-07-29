import type {
  BooleanNumber,
  CellValueType,
  ICellData,
  IStyleData,
  IWorkbookData,
  IWorksheetData,
  LocaleType,
} from "@univerjs/presets";

import type {
  NormalizedCell,
  NormalizedSheet,
  NormalizedWorkbook,
} from "../../types/normalized-workbook";
import { decodeNormalizedAddress } from "./address";
import { normalizedStyleToUniver } from "./style";

const FALSE = 0 as BooleanNumber;
const TRUE = 1 as BooleanNumber;
const UNIVER_APP_VERSION = "0.25.1";

interface StyleRegistry {
  styles: IWorkbookData["styles"];
  getId(style: IStyleData | undefined): string | undefined;
}

function createStyleRegistry(): StyleRegistry {
  const styles: IWorkbookData["styles"] = {};
  const idsByStyle = new Map<string, string>();

  return {
    styles,
    getId(style) {
      if (!style) {
        return undefined;
      }
      const serialized = JSON.stringify(style);
      const existing = idsByStyle.get(serialized);
      if (existing) {
        return existing;
      }
      const id = `style-${idsByStyle.size + 1}`;
      idsByStyle.set(serialized, id);
      styles[id] = style;
      return id;
    },
  };
}

function cellValueType(cell: NormalizedCell): CellValueType | undefined {
  if (cell.value === null || cell.value === undefined) {
    return undefined;
  }
  if (cell.type === "boolean" || typeof cell.value === "boolean") {
    return 3 as CellValueType;
  }
  if (cell.type === "number" || cell.type === "date" || typeof cell.value === "number") {
    return 2 as CellValueType;
  }
  return 1 as CellValueType;
}

function normalizeFormula(formula: string | undefined): string | undefined {
  if (!formula) {
    return undefined;
  }
  return formula.startsWith("=") ? formula : `=${formula}`;
}

function normalizedCellToUniver(cell: NormalizedCell, styleRegistry: StyleRegistry): ICellData {
  const result: ICellData = {};
  if (cell.value !== null && cell.value !== undefined) {
    result.v = cell.value;
  }
  result.t = cellValueType(cell);
  result.f = normalizeFormula(cell.formula);
  result.s = styleRegistry.getId(normalizedStyleToUniver(cell.style, cell.numberFormat));
  if (cell.note || cell.hyperlink) {
    result.custom = {
      note: cell.note,
      hyperlink: cell.hyperlink,
    };
  }
  return result;
}

function normalizedSheetToUniver(
  sheet: NormalizedSheet,
  styleRegistry: StyleRegistry,
): IWorksheetData {
  const cellData: IWorksheetData["cellData"] = {};
  let maxRow = 0;
  let maxColumn = 0;

  Object.entries(sheet.cells).forEach(([address, cell]) => {
    const position = decodeNormalizedAddress(address);
    if (!position) {
      return;
    }
    maxRow = Math.max(maxRow, position.row);
    maxColumn = Math.max(maxColumn, position.column);
    const row = cellData[position.row] ?? {};
    row[position.column] = normalizedCellToUniver(cell, styleRegistry);
    cellData[position.row] = row;
  });

  const rowData: IWorksheetData["rowData"] = {};
  Object.entries(sheet.rowConfigs ?? {}).forEach(([rowKey, config]) => {
    rowData[Number(rowKey)] = {
      h: config.height,
      hd: config.hidden === undefined ? undefined : config.hidden ? TRUE : FALSE,
    };
  });

  const columnData: IWorksheetData["columnData"] = {};
  Object.entries(sheet.columnConfigs ?? {}).forEach(([columnKey, config]) => {
    columnData[Number(columnKey)] = {
      w: config.width,
      hd: config.hidden === undefined ? undefined : config.hidden ? TRUE : FALSE,
    };
  });

  return {
    id: sheet.id,
    name: sheet.name,
    tabColor: sheet.tabColor ?? "",
    hidden:
      sheet.hidden || sheet.visibility === "hidden" || sheet.visibility === "veryHidden"
        ? TRUE
        : FALSE,
    freeze: {
      xSplit: sheet.frozen?.columns ?? 0,
      ySplit: sheet.frozen?.rows ?? 0,
      startRow: sheet.frozen?.startRow ?? sheet.frozen?.rows ?? 0,
      startColumn: sheet.frozen?.startColumn ?? sheet.frozen?.columns ?? 0,
    },
    rowCount: Math.max(1, sheet.rowCount, maxRow + 1),
    columnCount: Math.max(1, sheet.columnCount, maxColumn + 1),
    zoomRatio: 1,
    scrollTop: 0,
    scrollLeft: 0,
    defaultColumnWidth: 88,
    defaultRowHeight: 24,
    mergeData: sheet.merges.map((range) => ({ ...range })),
    cellData,
    rowData,
    columnData,
    rowHeader: { width: 46 },
    columnHeader: { height: 24 },
    showGridlines: TRUE,
    rightToLeft: FALSE,
  };
}

export function normalizedToUniver(workbook: NormalizedWorkbook): IWorkbookData {
  const styleRegistry = createStyleRegistry();
  const sheets: IWorkbookData["sheets"] = {};
  const sheetOrder = workbook.sheets.map((sheet) => sheet.id);

  workbook.sheets.forEach((sheet) => {
    sheets[sheet.id] = normalizedSheetToUniver(sheet, styleRegistry);
  });

  return {
    id: workbook.id,
    name: workbook.name,
    appVersion: UNIVER_APP_VERSION,
    locale: "zhCN" as LocaleType,
    styles: styleRegistry.styles,
    sheetOrder,
    sheets,
    resources: [],
    custom: {
      activeSheetId: workbook.activeSheetId ?? sheetOrder[0],
    },
  };
}
