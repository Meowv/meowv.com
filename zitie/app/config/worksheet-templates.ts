import type { ExerciseMode, WorksheetSettings } from "../lib/types";

export type WorksheetTemplatePatch = Partial<
  Omit<
    WorksheetSettings,
    | "mode"
    | "input"
    | "localFont"
    | "pinyinOverrides"
    | "strokeItems"
    | "penPatterns"
    | "penPattern"
  >
>;

interface WorksheetTemplateDefinition {
  id: string;
  label: string;
  description: string;
  variants: Partial<Record<ExerciseMode, WorksheetTemplatePatch>>;
}

export interface WorksheetTemplateOption {
  id: string;
  label: string;
  description: string;
  patch: WorksheetTemplatePatch;
}

const WORKSHEET_TEMPLATES: WorksheetTemplateDefinition[] = [
  {
    id: "preschool",
    label: "幼儿启蒙",
    description: "大格、少量描红，留出充分书写空间",
    variants: {
      hanzi: {
        gridStyle: "tian",
        cellSizeMm: 16,
        rowGapMm: 4,
        fontSizePercent: 78,
        traceCount: 3,
        showPinyin: true,
        showStrokeOrder: false,
        highlightFirst: true,
        insertEmptyRow: true,
        insertEmptyColumn: false,
      },
      stroke: {
        gridStyle: "tian",
        cellSizeMm: 16,
        rowGapMm: 4,
        fontSizePercent: 76,
        traceCount: 3,
        highlightFirst: true,
        insertEmptyRow: true,
      },
      alphabet: {
        gridStyle: "fourLine",
        cellSizeMm: 14,
        rowGapMm: 4,
        fontSizePercent: 92,
        traceCount: 3,
        pairedCase: true,
        insertEmptyRow: true,
      },
      number: {
        gridStyle: "fourLine",
        cellSizeMm: 14,
        rowGapMm: 4,
        fontSizePercent: 90,
        traceCount: 3,
        insertEmptyRow: true,
      },
      pinyin: {
        gridStyle: "fourLine",
        cellSizeMm: 14,
        rowGapMm: 4,
        fontSizePercent: 66,
        verticalOffsetPercent: -12,
        traceCount: 3,
        insertEmptyRow: true,
      },
      penControl: {
        gridStyle: "none",
        cellSizeMm: 16,
        rowGapMm: 2,
        traceCount: 3,
        penStrokeWeight: "bold",
        insertEmptyRow: true,
      },
    },
  },
  {
    id: "grade-one",
    label: "一年级生字",
    description: "清晰田字格，兼顾示范与独立练习",
    variants: {
      hanzi: {
        gridStyle: "tian",
        cellSizeMm: 12,
        rowGapMm: 3,
        fontSizePercent: 72,
        traceCount: 5,
        showPinyin: true,
        showStrokeOrder: false,
        highlightFirst: true,
        insertEmptyRow: false,
        insertEmptyColumn: true,
      },
      phrase: {
        gridStyle: "tian",
        cellSizeMm: 12,
        rowGapMm: 3,
        fontSizePercent: 72,
        traceCount: 4,
        showPinyin: false,
        highlightFirst: true,
        insertEmptyRow: true,
        insertEmptyColumn: false,
      },
      stroke: {
        gridStyle: "tian",
        cellSizeMm: 12,
        rowGapMm: 3,
        fontSizePercent: 72,
        traceCount: 5,
        highlightFirst: true,
        insertEmptyRow: true,
      },
      word: {
        gridStyle: "fourLine",
        cellSizeMm: 12,
        rowGapMm: 3,
        fontSizePercent: 86,
        traceCount: 4,
        highlightFirst: true,
        insertEmptyRow: true,
      },
      pinyin: {
        gridStyle: "fourLine",
        cellSizeMm: 12,
        rowGapMm: 3,
        fontSizePercent: 62,
        verticalOffsetPercent: -12,
        traceCount: 5,
        insertEmptyRow: true,
      },
    },
  },
  {
    id: "poetry",
    label: "古诗练习",
    description: "段落横格与舒展留白，适合诗文抄写",
    variants: {
      cnParagraph: {
        gridStyle: "horizontal",
        cellSizeMm: 11,
        rowGapMm: 3,
        fontSizePercent: 70,
        traceCount: 0,
        highlightFirst: false,
        insertEmptyRow: false,
        pageMarginsPx: { top: 48, right: 48, bottom: 48, left: 48 },
      },
    },
  },
  {
    id: "adult-penmanship",
    label: "成人硬笔",
    description: "紧凑克制，减少描红并提高页面利用率",
    variants: {
      hanzi: {
        gridStyle: "tian",
        cellSizeMm: 9,
        rowGapMm: 2,
        fontSizePercent: 64,
        traceCount: 0,
        showPinyin: false,
        highlightFirst: false,
        insertEmptyRow: false,
        insertEmptyColumn: false,
      },
      phrase: {
        gridStyle: "tian",
        cellSizeMm: 9,
        rowGapMm: 2,
        fontSizePercent: 64,
        traceCount: 0,
        showPinyin: false,
        highlightFirst: false,
        insertEmptyRow: false,
        insertEmptyColumn: false,
      },
      cnParagraph: {
        gridStyle: "horizontal",
        cellSizeMm: 9,
        rowGapMm: 2,
        fontSizePercent: 64,
        traceCount: 0,
        highlightFirst: false,
        insertEmptyRow: false,
      },
      alphabet: {
        gridStyle: "fourLine",
        cellSizeMm: 9,
        rowGapMm: 2,
        fontSizePercent: 82,
        traceCount: 0,
        pairedCase: false,
        highlightFirst: false,
        insertEmptyRow: false,
      },
      word: {
        gridStyle: "fourLine",
        cellSizeMm: 9,
        rowGapMm: 2,
        fontSizePercent: 82,
        traceCount: 0,
        highlightFirst: false,
        insertEmptyRow: false,
      },
      enParagraph: {
        gridStyle: "fourLine",
        cellSizeMm: 9,
        rowGapMm: 2,
        fontSizePercent: 80,
        traceCount: 0,
        highlightFirst: false,
        insertEmptyRow: false,
      },
    },
  },
  {
    id: "pinyin-practice",
    label: "拼音练习",
    description: "突出拼音提示与四线三格书写节奏",
    variants: {
      hanzi: {
        gridStyle: "tian",
        cellSizeMm: 13,
        rowGapMm: 4,
        fontSizePercent: 72,
        traceCount: 4,
        showPinyin: true,
        showStrokeOrder: false,
        highlightFirst: true,
        insertEmptyRow: true,
      },
      phrase: {
        gridStyle: "tian",
        cellSizeMm: 13,
        rowGapMm: 4,
        fontSizePercent: 72,
        traceCount: 3,
        showPinyin: true,
        highlightFirst: true,
        insertEmptyRow: true,
      },
      pinyin: {
        gridStyle: "fourLine",
        cellSizeMm: 12,
        rowGapMm: 4,
        fontSizePercent: 62,
        verticalOffsetPercent: -12,
        traceCount: 5,
        insertEmptyRow: true,
      },
    },
  },
];

export function getWorksheetTemplates(mode: ExerciseMode): WorksheetTemplateOption[] {
  return WORKSHEET_TEMPLATES.flatMap((template) => {
    const patch = template.variants[mode];
    return patch
      ? [{
          id: template.id,
          label: template.label,
          description: template.description,
          patch,
        }]
      : [];
  });
}
