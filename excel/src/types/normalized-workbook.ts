export type NormalizedCellValue = string | number | boolean | null;

export type NormalizedCellType = "string" | "number" | "boolean" | "date" | "formula" | "empty";

export type NormalizedHorizontalAlignment = "left" | "center" | "right" | "justify" | "distributed";

export type NormalizedVerticalAlignment = "top" | "middle" | "bottom";

export type NormalizedBorderStyle =
  "thin" | "medium" | "thick" | "dotted" | "dashed" | "double" | "hair" | "dashDot" | "dashDotDot";

export interface NormalizedFontStyle {
  family?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
}

export interface NormalizedBorderSide {
  style: NormalizedBorderStyle;
  color?: string;
}

export interface NormalizedCellBorders {
  top?: NormalizedBorderSide;
  right?: NormalizedBorderSide;
  bottom?: NormalizedBorderSide;
  left?: NormalizedBorderSide;
}

export interface NormalizedCellStyle {
  font?: NormalizedFontStyle;
  fillColor?: string;
  horizontalAlignment?: NormalizedHorizontalAlignment;
  verticalAlignment?: NormalizedVerticalAlignment;
  wrapText?: boolean;
  textRotation?: number;
  borders?: NormalizedCellBorders;
}

export interface NormalizedHyperlink {
  target: string;
  tooltip?: string;
}

export interface NormalizedCell {
  value?: NormalizedCellValue;
  /**
   * 统一使用包含开头等号的公式，避免 SheetJS 与 Univer 的表示差异泄漏到业务层。
   */
  formula?: string;
  type?: NormalizedCellType;
  style?: NormalizedCellStyle;
  numberFormat?: string;
  note?: string;
  hyperlink?: NormalizedHyperlink;
}

export interface NormalizedRange {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
}

export interface NormalizedRowConfig {
  height?: number;
  hidden?: boolean;
}

export interface NormalizedColumnConfig {
  width?: number;
  hidden?: boolean;
}

export interface NormalizedFrozenPane {
  rows: number;
  columns: number;
  startRow?: number;
  startColumn?: number;
}

export type NormalizedSheetVisibility = "visible" | "hidden" | "veryHidden";

export interface NormalizedSheet {
  id: string;
  name: string;
  rowCount: number;
  columnCount: number;
  /**
   * 单元格键统一使用 A1 地址，例如 A1、BC42。
   */
  cells: Record<string, NormalizedCell>;
  merges: NormalizedRange[];
  rowConfigs?: Record<number, NormalizedRowConfig>;
  columnConfigs?: Record<number, NormalizedColumnConfig>;
  frozen?: NormalizedFrozenPane;
  hidden?: boolean;
  visibility?: NormalizedSheetVisibility;
  tabColor?: string;
}

export interface NormalizedWorkbook {
  id: string;
  name: string;
  sheets: NormalizedSheet[];
  activeSheetId?: string;
  metadata?: Record<string, unknown>;
}

export interface CompatibilityIssue {
  code: string;
  feature: string;
  detail: string;
  severity: "info" | "warning";
}

export interface CompatibilityReport {
  engine: "SheetJS CE 0.20.3";
  summary: string;
  preserved: string[];
  degraded: string[];
  unsupported: string[];
  ignored: string[];
  issues: CompatibilityIssue[];
  hasWarnings: boolean;
}

export interface ImportStatistics {
  fileSize: number;
  sheetCount: number;
  nonEmptyCellCount: number;
  parseDurationMs: number;
}
