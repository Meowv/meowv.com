import type { CellObject, ColInfo, RowInfo, WorkBook, WorkSheet } from "xlsx";
import { utils } from "xlsx";

import type {
  NormalizedBorderSide,
  NormalizedCell,
  NormalizedCellStyle,
  NormalizedSheet,
  NormalizedWorkbook,
} from "../../types/normalized-workbook";

const CELL_ADDRESS_PATTERN = /^[A-Z]{1,3}[1-9]\d*$/i;

function excelColor(color: string | undefined): { rgb: string } | undefined {
  if (!color) {
    return undefined;
  }

  const rgb = color.replace(/^#/, "").toUpperCase();
  return /^[0-9A-F]{6}$/.test(rgb) ? { rgb: `FF${rgb}` } : undefined;
}

function sheetJsBorder(
  side: NormalizedBorderSide | undefined,
): Record<string, unknown> | undefined {
  if (!side) {
    return undefined;
  }

  return {
    style: side.style,
    color: excelColor(side.color),
  };
}

function sheetJsStyle(style: NormalizedCellStyle | undefined): Record<string, unknown> | undefined {
  if (!style) {
    return undefined;
  }

  const font = style.font
    ? {
        name: style.font.family,
        sz: style.font.size,
        bold: style.font.bold,
        italic: style.font.italic,
        underline: style.font.underline,
        strike: style.font.strike,
        color: excelColor(style.font.color),
      }
    : undefined;
  const fill = style.fillColor
    ? {
        patternType: "solid",
        fgColor: excelColor(style.fillColor),
      }
    : undefined;
  const alignment =
    style.horizontalAlignment ||
    style.verticalAlignment ||
    style.wrapText !== undefined ||
    style.textRotation !== undefined
      ? {
          horizontal: style.horizontalAlignment,
          vertical: style.verticalAlignment === "middle" ? "center" : style.verticalAlignment,
          wrapText: style.wrapText,
          textRotation: style.textRotation,
        }
      : undefined;
  const border = style.borders
    ? {
        top: sheetJsBorder(style.borders.top),
        right: sheetJsBorder(style.borders.right),
        bottom: sheetJsBorder(style.borders.bottom),
        left: sheetJsBorder(style.borders.left),
      }
    : undefined;

  const result: Record<string, unknown> = { font, fill, alignment, border };
  return Object.values(result).some((value) => value !== undefined) ? result : undefined;
}

function cellType(cell: NormalizedCell): CellObject["t"] {
  if (cell.type === "empty" || cell.value === null || cell.value === undefined) {
    return cell.formula ? "n" : "z";
  }
  if (cell.type === "boolean" || typeof cell.value === "boolean") {
    return "b";
  }
  if (cell.type === "number" || cell.type === "date" || typeof cell.value === "number") {
    return "n";
  }
  return "s";
}

function stripFormulaEquals(formula: string | undefined): string | undefined {
  return formula?.startsWith("=") ? formula.slice(1) : formula;
}

function normalizedCellToSheetJs(cell: NormalizedCell): CellObject {
  const result: CellObject = {
    t: cellType(cell),
  };

  if (cell.value !== undefined && cell.value !== null) {
    result.v = cell.value;
  }
  const formula = stripFormulaEquals(cell.formula);
  if (formula) {
    result.f = formula;
  }
  if (cell.numberFormat) {
    result.z = cell.numberFormat;
  }
  const style = sheetJsStyle(cell.style);
  if (style) {
    result.s = style;
  }
  if (cell.note) {
    result.c = [{ a: "在线 Excel 处理", t: cell.note }];
  }
  if (cell.hyperlink) {
    result.l = {
      Target: cell.hyperlink.target,
      Tooltip: cell.hyperlink.tooltip,
    };
  }

  return result;
}

function buildRows(sheet: NormalizedSheet): RowInfo[] | undefined {
  if (!sheet.rowConfigs) {
    return undefined;
  }

  const rows: RowInfo[] = [];
  Object.entries(sheet.rowConfigs).forEach(([rowIndex, config]) => {
    rows[Number(rowIndex)] = {
      hpx: config.height,
      hidden: config.hidden,
    };
  });
  return rows;
}

function buildColumns(sheet: NormalizedSheet): ColInfo[] | undefined {
  if (!sheet.columnConfigs) {
    return undefined;
  }

  const columns: ColInfo[] = [];
  Object.entries(sheet.columnConfigs).forEach(([columnIndex, config]) => {
    columns[Number(columnIndex)] = {
      wpx: config.width,
      hidden: config.hidden,
    };
  });
  return columns;
}

function updateMaxPosition(address: string, current: { row: number; column: number }): void {
  if (!CELL_ADDRESS_PATTERN.test(address)) {
    return;
  }
  const position = utils.decode_cell(address);
  current.row = Math.max(current.row, position.r);
  current.column = Math.max(current.column, position.c);
}

function normalizedSheetToSheetJs(sheet: NormalizedSheet): WorkSheet {
  const worksheet: WorkSheet = {};
  const maxPosition = { row: 0, column: 0 };

  Object.entries(sheet.cells).forEach(([address, cell]) => {
    if (!CELL_ADDRESS_PATTERN.test(address)) {
      return;
    }
    const normalizedAddress = utils.encode_cell(utils.decode_cell(address));
    worksheet[normalizedAddress] = normalizedCellToSheetJs(cell);
    updateMaxPosition(normalizedAddress, maxPosition);
  });

  sheet.merges.forEach((range) => {
    maxPosition.row = Math.max(maxPosition.row, range.endRow);
    maxPosition.column = Math.max(maxPosition.column, range.endColumn);
  });

  worksheet["!ref"] = utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxPosition.row, c: maxPosition.column },
  });
  worksheet["!merges"] = sheet.merges.map((range) => ({
    s: { r: range.startRow, c: range.startColumn },
    e: { r: range.endRow, c: range.endColumn },
  }));
  worksheet["!rows"] = buildRows(sheet);
  worksheet["!cols"] = buildColumns(sheet);

  if (sheet.frozen && (sheet.frozen.rows > 0 || sheet.frozen.columns > 0)) {
    worksheet["!freeze"] = {
      xSplit: sheet.frozen.columns,
      ySplit: sheet.frozen.rows,
      startRow: sheet.frozen.startRow ?? sheet.frozen.rows,
      startColumn: sheet.frozen.startColumn ?? sheet.frozen.columns,
    };
  }
  if (sheet.tabColor) {
    worksheet["!tabColor"] = excelColor(sheet.tabColor);
  }

  return worksheet;
}

export function normalizedToSheetJs(workbook: NormalizedWorkbook): WorkBook {
  const result: WorkBook = {
    SheetNames: [],
    Sheets: {},
    Props: {
      Title: workbook.name,
      Application: "在线 Excel 处理",
    },
    Workbook: {
      Sheets: [],
    },
  };

  workbook.sheets.forEach((sheet) => {
    result.SheetNames.push(sheet.name);
    result.Sheets[sheet.name] = normalizedSheetToSheetJs(sheet);
    result.Workbook?.Sheets?.push({
      name: sheet.name,
      Hidden:
        sheet.visibility === "veryHidden"
          ? 2
          : sheet.visibility === "hidden" || sheet.hidden
            ? 1
            : 0,
    });
  });

  return result;
}
