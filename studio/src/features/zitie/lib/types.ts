export type ExerciseMode =
  | 'hanzi'
  | 'phrase'
  | 'cnParagraph'
  | 'stroke'
  | 'alphabet'
  | 'word'
  | 'enParagraph'
  | 'number'
  | 'pinyin'
  | 'penControl';

export type GridStyle =
  | 'composition'
  | 'tian'
  | 'mi'
  | 'huiGong'
  | 'jiuGong'
  | 'huiTian'
  | 'huiMi'
  | 'square'
  | 'horizontal'
  | 'fourLine'
  | 'none';

export type PenPattern = string;
export type FontWeightOption = 'normal' | 'bold';

export interface LocalFontSelection {
  postscriptName: string;
  family: string;
  fullName: string;
  style: string;
}

export interface PageMarginsPx {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface StrokePracticeItem {
  strokeIndex: number;
  example: string;
}

export interface WorksheetSettings {
  mode: ExerciseMode;
  input: string;
  fontKey: string;
  fontFamily: string;
  fontWeight: FontWeightOption;
  localFont: LocalFontSelection | null;
  gridStyle: GridStyle;
  cellSizeMm: number;
  rowGapMm: number;
  letterSpacingPx: number;
  pageMarginsPx: PageMarginsPx;
  cellsPerRow: number;
  repeatRows: number;
  emptyRows: number;
  emptyColumns: number;
  showPinyin: boolean;
  showStrokeOrder: boolean;
  highlightFirst: boolean;
  traceEnabled: boolean;
  traceOpacity: number;
  traceCount: number;
  traceColor: string;
  lineColor: string;
  fontSizePercent: number;
  verticalOffsetPercent: number;
  insertEmptyRow: boolean;
  insertEmptyColumn: boolean;
  pairedCase: boolean;
  pinyinOverrides: Record<string, string>;
  strokeItems: StrokePracticeItem[];
  penPatterns: string;
  penPattern: PenPattern;
  penStrokeWeight: FontWeightOption;
}

export type DrawCommand =
  | {
      kind: 'grid';
      x: number;
      y: number;
      width: number;
      height: number;
      style: GridStyle;
      color: string;
    }
  | {
      kind: 'text';
      x: number;
      y: number;
      width: number;
      height: number;
      text: string;
      fontSizeMm: number;
      fontFamily: string;
      fontWeight: FontWeightOption;
      color: string;
      opacity: number;
      align: CanvasTextAlign;
      baseline: CanvasTextBaseline;
    }
  | {
      kind: 'stroke';
      x: number;
      y: number;
      width: number;
      height: number;
      character: string;
      progress: number;
      color: string;
      opacity: number;
      fallbackFontFamily: string;
    }
  | {
      kind: 'pattern';
      x: number;
      y: number;
      width: number;
      height: number;
      pattern: PenPattern;
      color: string;
      opacity: number;
      weight: FontWeightOption;
    };

export interface PinyinChoiceControl {
  key: string;
  character: string;
  options: string[];
  selected: string;
  y: number;
}

export interface WorksheetPage {
  index: number;
  total: number;
  commands: DrawCommand[];
  warnings: string[];
  pinyinControls: PinyinChoiceControl[];
}

export interface StoredWorkspaceV1 {
  version: 1;
  settings: WorksheetSettings;
}

export interface WorksheetBuildResult {
  pages: WorksheetPage[];
  inputCount: number;
  inputLimit: number;
  totalPages: number;
  error: string | null;
}
