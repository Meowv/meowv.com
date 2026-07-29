import { pinyin, polyphonic } from "pinyin-pro";
import type {
  DrawCommand,
  ExerciseMode,
  GridStyle,
  PinyinChoiceControl,
  StoredWorkspaceV1,
  StrokePracticeItem,
  WorksheetBuildResult,
  WorksheetPage,
  WorksheetSettings,
} from "./types";

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const MAX_PAGES = 20;
export const REPEAT_INPUT_LIMIT = 200;
export const PARAGRAPH_INPUT_LIMIT = 2_000;
export const WORKSPACE_KEY = "meowv-zitie:workspace:v1";
export const CSS_PX_PER_INCH = 96;

export const BUILT_IN_FONT_FAMILIES = {
  kaiti: 'KaiTi, STKaiti, "Kaiti SC", serif',
  songti: 'SimSun, STSong, "Songti SC", serif',
  heiti: 'SimHei, "PingFang SC", "Microsoft YaHei", sans-serif',
  latin: '"Practice En Italic", "Times New Roman", Georgia, serif',
  pinyin: '"Practice Pinyin", Arial, "PingFang SC", sans-serif',
  bihua: '"Practice Strokes", KaiTi, STKaiti, serif',
  penControl: '"Practice Pen Control", sans-serif',
} as const;

export const MODE_EXAMPLES: Record<ExerciseMode, string> = {
  hanzi: "春风又绿江南岸",
  phrase: "春风 江南 明月",
  cnParagraph:
    "昨夜雨疏风骤，浓睡不消残酒，试问卷帘人，却道海棠依旧。知否，知否，应是绿肥红瘦。",
  stroke: "",
  alphabet: "ABCDEFGH",
  word: "Lily book, pencil, ruler, bag",
  enParagraph:
    "If you can do what you do best and be happy, you're further along in life than most people.",
  number: "1 2 3 4 5 6 7 8 9 0 1234567890",
  pinyin: "a o e i u ü ā á ǎ à nǐ wǒ",
  penControl: "123456",
};

export const DEFAULT_STROKE_ITEMS: StrokePracticeItem[] = [
  { strokeIndex: 0, example: "主" },
  { strokeIndex: 7, example: "一" },
  { strokeIndex: 23, example: "十" },
  { strokeIndex: 31, example: "人" },
  { strokeIndex: 38, example: "八" },
];

const BASE_SETTINGS: WorksheetSettings = {
  mode: "hanzi",
  input: MODE_EXAMPLES.hanzi,
  fontKey: "kaiti",
  fontFamily: BUILT_IN_FONT_FAMILIES.kaiti,
  fontWeight: "normal",
  localFont: null,
  gridStyle: "tian",
  cellSizeMm: 10,
  rowGapMm: 2,
  letterSpacingPx: 0,
  pageMarginsPx: { top: 36, right: 36, bottom: 36, left: 36 },
  cellsPerRow: 0,
  repeatRows: 1,
  emptyRows: 0,
  emptyColumns: 0,
  showPinyin: true,
  showStrokeOrder: false,
  highlightFirst: true,
  traceEnabled: true,
  traceOpacity: 0.82,
  traceCount: 20,
  traceColor: "#94a3b8",
  lineColor: "#64748b",
  fontSizePercent: 68,
  verticalOffsetPercent: 0,
  insertEmptyRow: false,
  insertEmptyColumn: false,
  pairedCase: false,
  pinyinOverrides: {},
  strokeItems: DEFAULT_STROKE_ITEMS,
  penPatterns: MODE_EXAMPLES.penControl,
  penPattern: "1",
  penStrokeWeight: "bold",
};

export const DEFAULT_SETTINGS: WorksheetSettings = BASE_SETTINGS;

const PARAGRAPH_MODES = new Set<ExerciseMode>(["cnParagraph", "enParagraph"]);
const FOUR_LINE_MODES = new Set<ExerciseMode>([
  "alphabet",
  "word",
  "enParagraph",
  "number",
  "pinyin",
]);
const CHINESE_REPEATED_MODES = new Set<ExerciseMode>(["hanzi", "phrase"]);
const CHINESE_GRID_STYLES: GridStyle[] = [
  "composition",
  "tian",
  "mi",
  "huiGong",
  "jiuGong",
  "huiTian",
  "huiMi",
  "square",
  "horizontal",
];

export function getModeDefaults(mode: ExerciseMode): WorksheetSettings {
  const common: WorksheetSettings = {
    ...BASE_SETTINGS,
    pageMarginsPx: { ...BASE_SETTINGS.pageMarginsPx },
    pinyinOverrides: {},
    strokeItems: DEFAULT_STROKE_ITEMS.map((item) => ({ ...item })),
    mode,
    input: MODE_EXAMPLES[mode],
  };

  if (mode === "phrase") {
    return { ...common, showPinyin: false };
  }
  if (mode === "cnParagraph") {
    return {
      ...common,
      gridStyle: "horizontal",
      showPinyin: false,
      highlightFirst: false,
      traceCount: 0,
    };
  }
  if (mode === "stroke") {
    return {
      ...common,
      input: "",
      showPinyin: false,
      traceCount: 5,
      fontFamily: BUILT_IN_FONT_FAMILIES.kaiti,
    };
  }
  if (mode === "alphabet" || mode === "word" || mode === "enParagraph") {
    return {
      ...common,
      gridStyle: "fourLine",
      showPinyin: false,
      highlightFirst: mode !== "enParagraph",
      fontKey: "enItalic",
      fontFamily: BUILT_IN_FONT_FAMILIES.latin,
      fontSizePercent: 85,
    };
  }
  if (mode === "number") {
    return {
      ...common,
      gridStyle: "fourLine",
      showPinyin: false,
      fontKey: "enItalic",
      fontFamily: BUILT_IN_FONT_FAMILIES.latin,
      fontSizePercent: 85,
      verticalOffsetPercent: 20,
    };
  }
  if (mode === "pinyin") {
    return {
      ...common,
      gridStyle: "fourLine",
      showPinyin: false,
      fontKey: "pinyin1",
      fontFamily: BUILT_IN_FONT_FAMILIES.pinyin,
      fontSizePercent: 60,
      verticalOffsetPercent: -12,
    };
  }
  if (mode === "penControl") {
    return {
      ...common,
      input: MODE_EXAMPLES.penControl,
      gridStyle: "none",
      showPinyin: false,
      highlightFirst: false,
      rowGapMm: 0,
      fontKey: "penControl",
      fontFamily: BUILT_IN_FONT_FAMILIES.penControl,
      penPatterns: MODE_EXAMPLES.penControl,
    };
  }
  return common;
}

export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm * dpi) / 25.4);
}

export function cssPxToMm(px: number): number {
  return (px * 25.4) / CSS_PX_PER_INCH;
}

export function getInputLimit(mode: ExerciseMode): number {
  return PARAGRAPH_MODES.has(mode) ? PARAGRAPH_INPUT_LIMIT : REPEAT_INPUT_LIMIT;
}

export function countInput(input: string): number {
  return Array.from(input).length;
}

export function getPinyinForText(input: string): string[] {
  return pinyin(input, {
    type: "array",
    toneType: "symbol",
    nonZh: "consecutive",
    toneSandhi: false,
  });
}

export function getPinyinOptionsForText(input: string): string[][] {
  return polyphonic(input, {
    type: "array",
    toneType: "symbol",
    nonZh: "consecutive",
  }).map((options) => Array.from(new Set(options.filter(Boolean))));
}

export function tokenizeExercise(input: string, mode: ExerciseMode): string[] {
  if (mode === "penControl" || mode === "stroke") return [];
  if (mode === "phrase") {
    return input
      .split(/[\s，,、；;。.!！？?]+/u)
      .map((token) => token.trim())
      .filter(Boolean);
  }
  if (mode === "word") {
    return input
      .split(/[\s，,]+/u)
      .map((token) => token.trim())
      .filter(Boolean);
  }
  if (mode === "pinyin") {
    return input
      .split(/[\s，,]+/u)
      .map((token) => token.trim())
      .filter(Boolean);
  }
  if (mode === "alphabet") {
    return Array.from(input).filter((character) => /[a-z]/iu.test(character));
  }
  if (mode === "number") {
    const spaced = input
      .split(/[\s，,]+/u)
      .map((token) => token.trim())
      .filter(Boolean);
    return spaced.length > 1
      ? spaced
      : Array.from(input).filter((character) => /\S/u.test(character));
  }
  if (mode === "enParagraph") {
    return input.trim().split(/\s+/u).filter(Boolean);
  }
  return Array.from(input).filter((character) => !/\s/u.test(character));
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, number))
    : fallback;
}

function normalizeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value)
    ? value
    : fallback;
}

function normalizeGrid(
  style: GridStyle | undefined,
  mode: ExerciseMode,
): GridStyle {
  if (mode === "penControl") return "none";
  if (FOUR_LINE_MODES.has(mode)) return "fourLine";
  if (mode === "cnParagraph" && !style) return "horizontal";
  return style && CHINESE_GRID_STYLES.includes(style) ? style : "tian";
}

function normalizeStrokeItems(value: unknown): StrokePracticeItem[] {
  if (!Array.isArray(value))
    return DEFAULT_STROKE_ITEMS.map((item) => ({ ...item }));
  const items = value
    .filter(
      (item): item is Partial<StrokePracticeItem> =>
        !!item && typeof item === "object",
    )
    .map((item) => ({
      strokeIndex: Math.round(clampNumber(item.strokeIndex, 0, 57, 0)),
      example:
        typeof item.example === "string"
          ? Array.from(item.example).slice(0, 4).join("")
          : "",
    }))
    .slice(0, 20);
  return items.length
    ? items
    : DEFAULT_STROKE_ITEMS.map((item) => ({ ...item }));
}

export function normalizeSettings(
  value: Partial<WorksheetSettings> | null | undefined,
): WorksheetSettings {
  const mode =
    value?.mode && value.mode in MODE_EXAMPLES ? value.mode : "hanzi";
  const defaults = getModeDefaults(mode);
  const isLegacy = !!value && !("pageMarginsPx" in value);
  const margins = value?.pageMarginsPx;
  const storedFontFamily =
    typeof value?.fontFamily === "string"
      ? value.fontFamily
      : defaults.fontFamily;

  return {
    ...defaults,
    ...value,
    mode,
    input: typeof value?.input === "string" ? value.input : defaults.input,
    fontKey:
      typeof value?.fontKey === "string" ? value.fontKey : defaults.fontKey,
    fontFamily:
      value?.fontKey === "local" ? defaults.fontFamily : storedFontFamily,
    fontWeight: value?.fontWeight === "bold" ? "bold" : "normal",
    localFont: value?.localFont ?? null,
    gridStyle: normalizeGrid(value?.gridStyle, mode),
    cellSizeMm: clampNumber(value?.cellSizeMm, 6, 40, defaults.cellSizeMm),
    rowGapMm: clampNumber(value?.rowGapMm, 0, 10, defaults.rowGapMm),
    letterSpacingPx: clampNumber(value?.letterSpacingPx, 0, 24, 0),
    pageMarginsPx: {
      top: clampNumber(margins?.top, 0, 96, 36),
      right: clampNumber(margins?.right, 0, 96, 36),
      bottom: clampNumber(margins?.bottom, 0, 96, 36),
      left: clampNumber(margins?.left, 0, 96, 36),
    },
    cellsPerRow: isLegacy
      ? 0
      : Math.round(
          clampNumber(value?.cellsPerRow, 0, 40, defaults.cellsPerRow),
        ),
    repeatRows: Math.round(clampNumber(value?.repeatRows, 1, 10, 1)),
    emptyRows: Math.round(clampNumber(value?.emptyRows, 0, 10, 0)),
    emptyColumns: Math.round(clampNumber(value?.emptyColumns, 0, 6, 0)),
    showPinyin:
      typeof value?.showPinyin === "boolean"
        ? value.showPinyin
        : defaults.showPinyin,
    showStrokeOrder:
      typeof value?.showStrokeOrder === "boolean"
        ? value.showStrokeOrder
        : defaults.showStrokeOrder,
    highlightFirst:
      typeof value?.highlightFirst === "boolean"
        ? value.highlightFirst
        : defaults.highlightFirst,
    traceEnabled:
      typeof value?.traceEnabled === "boolean" ? value.traceEnabled : true,
    traceOpacity: clampNumber(
      value?.traceOpacity,
      0.08,
      1,
      defaults.traceOpacity,
    ),
    traceCount: Math.round(
      clampNumber(value?.traceCount, 0, 20, defaults.traceCount),
    ),
    traceColor: normalizeColor(value?.traceColor, defaults.traceColor),
    lineColor: normalizeColor(value?.lineColor, defaults.lineColor),
    fontSizePercent: clampNumber(
      value?.fontSizePercent,
      48,
      128,
      defaults.fontSizePercent,
    ),
    verticalOffsetPercent: clampNumber(
      value?.verticalOffsetPercent,
      -50,
      50,
      defaults.verticalOffsetPercent,
    ),
    insertEmptyRow:
      typeof value?.insertEmptyRow === "boolean"
        ? value.insertEmptyRow
        : (value?.emptyRows ?? 0) > 0,
    insertEmptyColumn:
      typeof value?.insertEmptyColumn === "boolean"
        ? value.insertEmptyColumn
        : (value?.emptyColumns ?? 0) > 0,
    pairedCase: value?.pairedCase === true,
    pinyinOverrides:
      value?.pinyinOverrides && typeof value.pinyinOverrides === "object"
        ? value.pinyinOverrides
        : {},
    strokeItems: normalizeStrokeItems(value?.strokeItems),
    penPatterns:
      typeof value?.penPatterns === "string" && value.penPatterns
        ? Array.from(value.penPatterns)
            .filter((character) => /^[1-9A-W]$/u.test(character))
            .slice(0, 32)
            .join("") || defaults.penPatterns
        : defaults.penPatterns,
    penPattern:
      typeof value?.penPattern === "string" && value.penPattern
        ? value.penPattern
        : defaults.penPattern,
    penStrokeWeight: value?.penStrokeWeight === "normal" ? "normal" : "bold",
  };
}

export function loadStoredWorkspace(raw: string | null): StoredWorkspaceV1 {
  if (!raw) return { version: 1, settings: DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<StoredWorkspaceV1>;
    if (parsed.version !== 1 || !parsed.settings)
      throw new Error("invalid workspace");
    return { version: 1, settings: normalizeSettings(parsed.settings) };
  } catch {
    return { version: 1, settings: DEFAULT_SETTINGS };
  }
}

export function serializeWorkspace(settings: WorksheetSettings): string {
  const storedSettings = {
    ...settings,
    fontFamily:
      settings.fontKey === "local"
        ? getModeDefaults(settings.mode).fontFamily
        : settings.fontFamily,
  };
  const workspace: StoredWorkspaceV1 = { version: 1, settings: storedSettings };
  return JSON.stringify(workspace);
}

interface WorksheetRow {
  height: number;
  gapAfter: number;
  commandsAt: (y: number) => DrawCommand[];
  controlsAt?: (y: number) => PinyinChoiceControl[];
}

export function createWorksheet(
  settingsInput: WorksheetSettings,
): WorksheetBuildResult {
  const settings = normalizeSettings(settingsInput);
  const inputCount =
    settings.mode === "stroke"
      ? settings.strokeItems.length
      : countInput(settings.input);
  const inputLimit = getInputLimit(settings.mode);
  const warnings: string[] = [];
  let error: string | null = null;

  if (inputCount > inputLimit) {
    error = `当前内容为 ${inputCount} 个字符，${PARAGRAPH_MODES.has(settings.mode) ? "段落" : "重复练习"}最多支持 ${inputLimit} 个。`;
  }

  const rows = buildRows(settings, warnings);
  const pages = paginateRows(rows, settings, warnings);
  const totalPages = pages.length;
  if (totalPages > MAX_PAGES) {
    error = `当前设置会生成 ${totalPages} 页，最多支持 ${MAX_PAGES} 页。请减少内容或调整字格大小。`;
  }

  const visiblePages = pages.slice(0, MAX_PAGES);
  const normalizedPages = (
    visiblePages.length ? visiblePages : [emptyPage()]
  ).map((page, index, list) => ({ ...page, index, total: list.length }));

  return {
    pages: normalizedPages,
    inputCount,
    inputLimit,
    totalPages,
    error,
  };
}

function buildRows(
  settings: WorksheetSettings,
  warnings: string[],
): WorksheetRow[] {
  if (settings.mode === "penControl") return buildPenRows(settings);
  if (settings.mode === "stroke") return buildStrokeRows(settings);
  if (settings.mode === "cnParagraph")
    return buildChineseParagraphRows(settings);
  if (settings.mode === "enParagraph")
    return buildEnglishParagraphRows(settings);
  if (CHINESE_REPEATED_MODES.has(settings.mode))
    return buildRepeatedChineseRows(settings, warnings);
  if (FOUR_LINE_MODES.has(settings.mode))
    return buildRepeatedFourLineRows(settings);
  return [];
}

function contentBounds(settings: WorksheetSettings) {
  const left = cssPxToMm(settings.pageMarginsPx.left);
  const right = cssPxToMm(settings.pageMarginsPx.right);
  return {
    left,
    width: Math.max(settings.cellSizeMm, A4_WIDTH_MM - left - right),
  };
}

function cellsFor(
  settings: WorksheetSettings,
  width: number,
  advance = settings.cellSizeMm,
) {
  const automatic = Math.max(1, Math.floor((width + 0.001) / advance));
  return settings.cellsPerRow > 0
    ? Math.min(automatic, settings.cellsPerRow)
    : automatic;
}

function buildRepeatedChineseRows(
  settings: WorksheetSettings,
  warnings: string[],
): WorksheetRow[] {
  const units = tokenizeExercise(settings.input, settings.mode);
  if (!units.length) warnings.push("请输入至少一个可练习的内容。");
  const { left, width } = contentBounds(settings);
  const cells = cellsFor(settings, width);
  const pinyinHeight = settings.showPinyin
    ? Math.max(4.5, settings.cellSizeMm * 0.32)
    : 0;
  const practiceHeight = settings.cellSizeMm + pinyinHeight;
  const rows: WorksheetRow[] = [];
  let sourceIndex = 0;

  units.forEach((unit) => {
    const characters = Array.from(unit);
    const pronunciations = getPinyinForText(unit);
    const optionSets =
      settings.mode === "hanzi" ? getPinyinOptionsForText(unit) : [];
    const strokeHeight =
      settings.showStrokeOrder && characters.length === 1 ? 6 : 0;
    const key = String(sourceIndex);
    const selectedPinyin =
      settings.pinyinOverrides[key] ?? pronunciations[0] ?? "";
    const pinyinOptions = optionSets[0] ?? [];
    const offset = settings.insertEmptyColumn ? 1 : 0;

    rows.push({
      height: strokeHeight + practiceHeight,
      gapAfter: settings.rowGapMm,
      commandsAt: (y) => {
        const commands: DrawCommand[] = [];
        if (strokeHeight && characters[0]) {
          for (let column = 0; column < cells; column += 1) {
            const x = left + column * settings.cellSizeMm;
            commands.push(
              gridCommand(
                x,
                y,
                settings.cellSizeMm,
                "horizontal",
                settings.lineColor,
                strokeHeight,
              ),
            );
            commands.push({
              kind: "stroke",
              x,
              y,
              width: settings.cellSizeMm,
              height: strokeHeight,
              character: characters[0],
              progress: (column + 1) / Math.min(cells, 12),
              color: column < Math.min(4, cells) ? "#b91c1c" : "#111827",
              opacity: 0.94,
              fallbackFontFamily: settings.fontFamily,
            });
          }
        }

        const practiceY = y + strokeHeight;
        if (pinyinHeight > 0) {
          commands.push(
            gridCommand(
              left,
              practiceY,
              cells * settings.cellSizeMm,
              "fourLine",
              settings.lineColor,
              pinyinHeight,
            ),
          );
        }
        for (let column = 0; column < cells; column += 1) {
          const x = left + column * settings.cellSizeMm;
          commands.push(
            gridCommand(
              x,
              practiceY + pinyinHeight,
              settings.cellSizeMm,
              settings.gridStyle,
              settings.lineColor,
            ),
          );
          if (column < offset) continue;
          const contentIndex = column - offset;
          if (contentIndex >= Math.max(characters.length, settings.traceCount))
            continue;
          const characterIndex = contentIndex % Math.max(1, characters.length);
          const character = characters[characterIndex];
          if (!character) continue;
          const firstCopy = contentIndex < characters.length;
          if (settings.showPinyin) {
            const pronunciation =
              characters.length === 1
                ? selectedPinyin
                : (pronunciations[characterIndex] ?? "");
            commands.push(
              textCommand({
                x: x + settings.cellSizeMm / 2,
                y: practiceY + pinyinHeight * 0.62,
                width: settings.cellSizeMm,
                height: pinyinHeight,
                text: pronunciation,
                fontSizeMm: Math.min(4.4, pinyinHeight * 0.72),
                fontFamily: 'Arial, "PingFang SC", sans-serif',
                fontWeight: "normal",
                color:
                  firstCopy && settings.highlightFirst
                    ? "#111827"
                    : settings.traceColor,
                opacity:
                  firstCopy && settings.highlightFirst
                    ? 1
                    : settings.traceOpacity,
              }),
            );
          }
          commands.push(
            textCommand({
              x: x + settings.cellSizeMm / 2,
              y:
                practiceY +
                pinyinHeight +
                settings.cellSizeMm / 2 +
                (settings.verticalOffsetPercent / 100) *
                  settings.cellSizeMm *
                  0.25,
              width: settings.cellSizeMm,
              height: settings.cellSizeMm,
              text: character,
              fontSizeMm:
                settings.cellSizeMm * (settings.fontSizePercent / 100),
              fontFamily: settings.fontFamily,
              fontWeight: settings.fontWeight,
              color:
                firstCopy && settings.highlightFirst
                  ? "#111827"
                  : settings.traceColor,
              opacity:
                firstCopy && settings.highlightFirst
                  ? 1
                  : settings.traceOpacity,
            }),
          );
        }
        return commands;
      },
      controlsAt:
        pinyinOptions.length > 1
          ? (y) => [
              {
                key,
                character: characters[0],
                options: pinyinOptions,
                selected: selectedPinyin,
                y: y + strokeHeight + pinyinHeight + settings.cellSizeMm / 2,
              },
            ]
          : undefined,
    });

    if (settings.insertEmptyRow) {
      rows.push(blankGridRow(settings, left, cells, pinyinHeight));
    }
    sourceIndex += characters.length;
  });
  return rows;
}

function buildChineseParagraphRows(
  settings: WorksheetSettings,
): WorksheetRow[] {
  const { left, width } = contentBounds(settings);
  const advance = settings.cellSizeMm + cssPxToMm(settings.letterSpacingPx);
  const cells = cellsFor(settings, width, advance);
  const logicalLines = settings.input.split(/\r?\n/u);
  const chunks = logicalLines.flatMap((line, lineIndex) => {
    const characters = Array.from(line);
    const result = chunk(characters, cells);
    if (!result.length) result.push([]);
    if (lineIndex < logicalLines.length - 1) result.push([]);
    return result;
  });
  const rows: WorksheetRow[] = [];
  chunks.forEach((characters) => {
    rows.push({
      height: settings.cellSizeMm,
      gapAfter: settings.rowGapMm,
      commandsAt: (y) =>
        Array.from({ length: cells }, (_, column) => {
          const x = left + column * advance;
          const commands: DrawCommand[] = [
            gridCommand(
              x,
              y,
              settings.cellSizeMm,
              settings.gridStyle,
              settings.lineColor,
            ),
          ];
          const character = characters[column];
          if (character) {
            commands.push(
              textCommand({
                x: x + settings.cellSizeMm / 2,
                y:
                  y +
                  settings.cellSizeMm / 2 +
                  (settings.verticalOffsetPercent / 100) *
                    settings.cellSizeMm *
                    0.25,
                width: settings.cellSizeMm,
                height: settings.cellSizeMm,
                text: character,
                fontSizeMm:
                  settings.cellSizeMm * (settings.fontSizePercent / 100),
                fontFamily: settings.fontFamily,
                fontWeight: settings.fontWeight,
                color: settings.traceColor,
                opacity: settings.traceOpacity,
              }),
            );
          }
          return commands;
        }).flat(),
    });
    if (settings.insertEmptyRow)
      rows.push(blankGridRow(settings, left, cells, 0, advance));
  });
  return rows;
}

function buildStrokeRows(settings: WorksheetSettings): WorksheetRow[] {
  const { left, width } = contentBounds(settings);
  const cells = cellsFor(settings, width);
  const offset = settings.insertEmptyColumn ? 1 : 0;
  const rows: WorksheetRow[] = [];
  settings.strokeItems.forEach((item) => {
    const glyph = String.fromCodePoint(0xe900 + item.strokeIndex);
    rows.push({
      height: settings.cellSizeMm,
      gapAfter: settings.rowGapMm,
      commandsAt: (y) =>
        Array.from({ length: cells }, (_, column) => {
          const x = left + column * settings.cellSizeMm;
          const commands: DrawCommand[] = [
            gridCommand(
              x,
              y,
              settings.cellSizeMm,
              settings.gridStyle,
              settings.lineColor,
            ),
          ];
          if (column < offset || column - offset >= settings.traceCount)
            return commands;
          const first = column === offset;
          commands.push(
            textCommand({
              x: x + settings.cellSizeMm / 2,
              y: y + settings.cellSizeMm / 2,
              width: settings.cellSizeMm,
              height: settings.cellSizeMm,
              text: glyph,
              fontSizeMm:
                settings.cellSizeMm * (settings.fontSizePercent / 100),
              fontFamily: BUILT_IN_FONT_FAMILIES.bihua,
              fontWeight: settings.fontWeight,
              color:
                first && settings.highlightFirst
                  ? "#111827"
                  : settings.traceColor,
              opacity:
                first && settings.highlightFirst ? 1 : settings.traceOpacity,
            }),
          );
          if (first && item.example) {
            commands.push(
              textCommand({
                x: x + settings.cellSizeMm * 0.78,
                y: y + settings.cellSizeMm * 0.2,
                width: settings.cellSizeMm * 0.3,
                height: settings.cellSizeMm * 0.3,
                text: Array.from(item.example)[0],
                fontSizeMm: settings.cellSizeMm * 0.2,
                fontFamily: settings.fontFamily,
                fontWeight: "normal",
                color: "#64748b",
                opacity: 0.9,
              }),
            );
          }
          return commands;
        }).flat(),
    });
    if (settings.insertEmptyRow)
      rows.push(blankGridRow(settings, left, cells, 0));
  });
  return rows;
}

function buildRepeatedFourLineRows(
  settings: WorksheetSettings,
): WorksheetRow[] {
  const { left, width } = contentBounds(settings);
  const units = tokenizeExercise(settings.input, settings.mode);
  const rows: WorksheetRow[] = [];
  units.forEach((unit) => {
    const text =
      settings.mode === "alphabet" && settings.pairedCase
        ? `${unit.toUpperCase()}${unit.toLowerCase()}`
        : unit;
    const unitWidth = Math.max(
      settings.cellSizeMm,
      Math.min(width, Array.from(text).length * settings.cellSizeMm * 0.58 + 4),
    );
    const copies = Math.max(
      1,
      Math.min(settings.traceCount, Math.floor(width / unitWidth)),
    );
    rows.push({
      height: settings.cellSizeMm,
      gapAfter: settings.rowGapMm,
      commandsAt: (y) => {
        const commands: DrawCommand[] = [
          gridCommand(
            left,
            y,
            width,
            "fourLine",
            settings.lineColor,
            settings.cellSizeMm,
          ),
        ];
        for (let copy = 0; copy < copies; copy += 1) {
          const x = left + copy * unitWidth + 2;
          const first = copy === 0;
          commands.push(
            textCommand({
              x,
              y:
                y +
                settings.cellSizeMm * 0.72 +
                (settings.verticalOffsetPercent / 100) *
                  settings.cellSizeMm *
                  0.28,
              width: Math.max(1, unitWidth - 3),
              height: settings.cellSizeMm,
              text,
              fontSizeMm:
                settings.cellSizeMm * (settings.fontSizePercent / 100),
              fontFamily: settings.fontFamily,
              fontWeight: settings.fontWeight,
              color:
                first && settings.highlightFirst
                  ? "#111827"
                  : settings.traceColor,
              opacity:
                first && settings.highlightFirst ? 1 : settings.traceOpacity,
              align: "left",
              baseline: "alphabetic",
            }),
          );
        }
        return commands;
      },
    });
    if (settings.insertEmptyRow) {
      rows.push({
        height: settings.cellSizeMm,
        gapAfter: settings.rowGapMm,
        commandsAt: (y) => [
          gridCommand(
            left,
            y,
            width,
            "fourLine",
            settings.lineColor,
            settings.cellSizeMm,
          ),
        ],
      });
    }
  });
  return rows;
}

function buildEnglishParagraphRows(
  settings: WorksheetSettings,
): WorksheetRow[] {
  const { left, width } = contentBounds(settings);
  const approximateCharacters = Math.max(
    12,
    Math.floor(width / (settings.cellSizeMm * 0.46)),
  );
  const lines = wrapEnglishTokens(
    tokenizeExercise(settings.input, "enParagraph"),
    approximateCharacters,
  );
  const rows: WorksheetRow[] = [];
  lines.forEach((line) => {
    rows.push({
      height: settings.cellSizeMm,
      gapAfter: settings.rowGapMm,
      commandsAt: (y) => [
        gridCommand(
          left,
          y,
          width,
          "fourLine",
          settings.lineColor,
          settings.cellSizeMm,
        ),
        textCommand({
          x: left + 2,
          y:
            y +
            settings.cellSizeMm * 0.72 +
            (settings.verticalOffsetPercent / 100) * settings.cellSizeMm * 0.28,
          width: width - 4,
          height: settings.cellSizeMm,
          text: line,
          fontSizeMm: settings.cellSizeMm * (settings.fontSizePercent / 100),
          fontFamily: settings.fontFamily,
          fontWeight: settings.fontWeight,
          color: settings.traceColor,
          opacity: settings.traceOpacity,
          align: "left",
          baseline: "alphabetic",
        }),
      ],
    });
    if (settings.insertEmptyRow) {
      rows.push({
        height: settings.cellSizeMm,
        gapAfter: settings.rowGapMm,
        commandsAt: (y) => [
          gridCommand(
            left,
            y,
            width,
            "fourLine",
            settings.lineColor,
            settings.cellSizeMm,
          ),
        ],
      });
    }
  });
  return rows;
}

function buildPenRows(settings: WorksheetSettings): WorksheetRow[] {
  const { left, width } = contentBounds(settings);
  const cells = cellsFor(settings, width);
  const patterns = Array.from(settings.penPatterns);
  const rows: WorksheetRow[] = [];
  patterns.forEach((pattern) => {
    rows.push({
      height: settings.cellSizeMm,
      gapAfter: settings.rowGapMm,
      commandsAt: (y) =>
        Array.from({ length: cells }, (_, column) => {
          const x = left + column * settings.cellSizeMm;
          const commands: DrawCommand[] = [
            gridCommand(
              x,
              y,
              settings.cellSizeMm,
              "square",
              settings.lineColor,
            ),
          ];
          if (column < settings.traceCount) {
            commands.push({
              kind: "pattern",
              x,
              y,
              width: settings.cellSizeMm,
              height: settings.cellSizeMm,
              pattern,
              color: settings.traceColor,
              opacity: settings.traceOpacity,
              weight: settings.penStrokeWeight,
            });
          }
          return commands;
        }).flat(),
    });
    if (settings.insertEmptyRow) {
      rows.push(blankGridRow(settings, left, cells, 0));
    }
  });
  return rows;
}

function blankGridRow(
  settings: WorksheetSettings,
  left: number,
  cells: number,
  pinyinHeight: number,
  advance = settings.cellSizeMm,
): WorksheetRow {
  return {
    height: settings.cellSizeMm + pinyinHeight,
    gapAfter: settings.rowGapMm,
    commandsAt: (y) => {
      const commands = Array.from({ length: cells }, (_, column) =>
        gridCommand(
          left + column * advance,
          y + pinyinHeight,
          settings.cellSizeMm,
          settings.gridStyle,
          settings.lineColor,
        ),
      );
      if (pinyinHeight > 0) {
        commands.unshift(
          gridCommand(
            left,
            y,
            cells * advance,
            "fourLine",
            settings.lineColor,
            pinyinHeight,
          ),
        );
      }
      return commands;
    },
  };
}

function fillerRowFor(settings: WorksheetSettings): WorksheetRow {
  const { left, width } = contentBounds(settings);
  if (FOUR_LINE_MODES.has(settings.mode)) {
    return {
      height: settings.cellSizeMm,
      gapAfter: settings.rowGapMm,
      commandsAt: (y) => [
        gridCommand(
          left,
          y,
          width,
          "fourLine",
          settings.lineColor,
          settings.cellSizeMm,
        ),
      ],
    };
  }

  const cells = cellsFor(settings, width);
  if (settings.mode === "penControl") {
    return {
      height: settings.cellSizeMm,
      gapAfter: settings.rowGapMm,
      commandsAt: (y) =>
        Array.from({ length: cells }, (_, column) =>
          gridCommand(
            left + column * settings.cellSizeMm,
            y,
            settings.cellSizeMm,
            "square",
            settings.lineColor,
          ),
        ),
    };
  }

  const pinyinHeight =
    settings.showPinyin && CHINESE_REPEATED_MODES.has(settings.mode)
      ? Math.max(4.5, settings.cellSizeMm * 0.32)
      : 0;
  return blankGridRow(settings, left, cells, pinyinHeight);
}

function paginateRows(
  rows: WorksheetRow[],
  settings: WorksheetSettings,
  warnings: string[],
): WorksheetPage[] {
  const top = cssPxToMm(settings.pageMarginsPx.top);
  const maxY = A4_HEIGHT_MM - cssPxToMm(settings.pageMarginsPx.bottom);
  const pages: WorksheetPage[] = [];
  let commands: DrawCommand[] = [];
  let pinyinControls: PinyinChoiceControl[] = [];
  let y = top;
  const filler = fillerRowFor(settings);

  const fillCurrentPage = () => {
    while (y + filler.height <= maxY + 0.001) {
      commands.push(...filler.commandsAt(y));
      y += filler.height + filler.gapAfter;
    }
  };

  const pushCurrentPage = () => {
    fillCurrentPage();
    pages.push({
      index: pages.length,
      total: 0,
      commands,
      warnings: [...warnings],
      pinyinControls,
    });
    commands = [];
    pinyinControls = [];
    y = top;
  };

  rows.forEach((row) => {
    if (y + row.height > maxY && commands.length) {
      pushCurrentPage();
    }
    commands.push(...row.commandsAt(y));
    pinyinControls.push(...(row.controlsAt?.(y) ?? []));
    y += row.height + row.gapAfter;
  });

  if (commands.length || !pages.length) {
    pushCurrentPage();
  }
  return pages;
}

function emptyPage(): WorksheetPage {
  return { index: 0, total: 1, commands: [], warnings: [], pinyinControls: [] };
}

function gridCommand(
  x: number,
  y: number,
  width: number,
  style: GridStyle,
  color: string,
  height = width,
): DrawCommand {
  return { kind: "grid", x, y, width, height, style, color };
}

function textCommand(
  command: Omit<
    Extract<DrawCommand, { kind: "text" }>,
    "kind" | "align" | "baseline"
  > & {
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
  },
): DrawCommand {
  return {
    kind: "text",
    align: command.align ?? "center",
    baseline: command.baseline ?? "middle",
    ...command,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  if (!items.length) return [];
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function wrapEnglishTokens(tokens: string[], maxCharacters: number): string[] {
  const lines: string[] = [];
  let current = "";
  tokens.forEach((token) => {
    const candidate = current ? `${current} ${token}` : token;
    if (candidate.length > maxCharacters && current) {
      lines.push(current);
      current = token;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export function pagePngFilename(index: number, total: number): string {
  const width = Math.max(2, String(total).length);
  return `zitie-${String(index + 1).padStart(width, "0")}.png`;
}

export function clampPageIndex(index: number, total: number): number {
  return Math.min(Math.max(0, index), Math.max(0, total - 1));
}
