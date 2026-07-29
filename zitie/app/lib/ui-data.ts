import type { ExerciseMode, GridStyle } from "./types";
import { BUILT_IN_FONT_FAMILIES } from "./worksheet";

export const MODE_ROUTES: Record<ExerciseMode, string> = {
  hanzi: "/hanzi",
  phrase: "/cizu",
  cnParagraph: "/duanluo",
  stroke: "/bihua",
  alphabet: "/alphabet",
  word: "/word",
  enParagraph: "/paragraph",
  number: "/number",
  pinyin: "/pinyin",
  penControl: "/pen-control",
};

export const MODE_LABELS: Record<ExerciseMode, string> = {
  hanzi: "汉字字帖",
  phrase: "词组字帖",
  cnParagraph: "中文段落",
  stroke: "笔画字帖",
  alphabet: "英文字母",
  word: "英文单词",
  enParagraph: "英文段落",
  number: "数字字帖",
  pinyin: "拼音字帖",
  penControl: "控笔练习",
};

export const CHINESE_MODES: ExerciseMode[] = [
  "hanzi",
  "phrase",
  "cnParagraph",
  "stroke",
];

export const ENGLISH_MODES: ExerciseMode[] = [
  "alphabet",
  "word",
  "enParagraph",
];

export const GRID_OPTIONS: Array<{ value: GridStyle; label: string }> = [
  { value: "composition", label: "作文格" },
  { value: "tian", label: "田字格" },
  { value: "mi", label: "米字格" },
  { value: "huiGong", label: "回宫格" },
  { value: "jiuGong", label: "九宫格" },
  { value: "huiTian", label: "回田格" },
  { value: "huiMi", label: "回米格" },
];

export const FONT_OPTIONS = [
  { value: "kaiti", label: "楷体", family: BUILT_IN_FONT_FAMILIES.kaiti },
  { value: "songti", label: "宋体", family: BUILT_IN_FONT_FAMILIES.songti },
  { value: "heiti", label: "黑体", family: BUILT_IN_FONT_FAMILIES.heiti },
  { value: "enItalic", label: "英文斜体", family: BUILT_IN_FONT_FAMILIES.latin },
  { value: "pinyin1", label: "拼音字体-1", family: BUILT_IN_FONT_FAMILIES.pinyin },
] as const;

export const PINYIN_KEYS = [
  "ā", "á", "ǎ", "à", "ō", "ó", "ǒ", "ò", "ē", "é", "ě", "è",
  "ī", "í", "ǐ", "ì", "ū", "ú", "ǔ", "ù", "ǖ", "ǘ", "ǚ", "ǜ", "ü",
];

export const PEN_PATTERN_KEYS = "123456789ABCDEFGHIJKLMNOPQRSTUVW";

export const COLOR_PALETTE = [
  "#0f172a", "#334155", "#64748b", "#94a3b8", "#cbd5e1", "#f1f5f9",
  "#7f1d1d", "#b91c1c", "#ef4444", "#fca5a5", "#fecaca", "#fff1f2",
  "#7c2d12", "#c2410c", "#f97316", "#fdba74", "#fed7aa", "#fff7ed",
  "#713f12", "#ca8a04", "#eab308", "#fde047", "#fef08a", "#fefce8",
  "#14532d", "#15803d", "#22c55e", "#86efac", "#bbf7d0", "#f0fdf4",
  "#1e3a8a", "#2563eb", "#60a5fa", "#93c5fd", "#bfdbfe", "#eff6ff",
];

export const STROKE_NAMES = [
  "右点", "相向点", "合三点", "左点", "相背点", "连四点", "上下点",
  "长横", "斜横", "短横", "横折", "横折2", "横折折", "横折折折",
  "横撇", "横撇2", "横折折撇", "横折折折钩", "横折弯", "横折提",
  "右横撇弯钩", "左横撇弯钩", "垂露竖", "悬针竖", "斜竖",
  "竖提", "竖折", "竖折2", "竖折折", "竖弯", "竖折撇",
  "斜撇", "竖撇", "短撇", "平撇", "撇提", "撇折", "撇点",
  "长捺", "中捺", "短捺", "平捺", "斜提", "挑提",
  "横钩", "竖钩", "弯钩", "斜钩", "卧钩", "竖弯钩",
  "横斜钩", "横折钩", "横折钩2", "横折弯钩", "横折弯钩2",
  "斜横折钩", "竖折折钩", "横折折折钩",
] as const;
