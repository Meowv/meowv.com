import type { MermaidConfig } from 'mermaid';
import type { MermaidDocumentConfig } from '@/features/mermaid/types';

export const MERMAID_FONT_FAMILY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

export const MERMAID_THEME_OPTIONS = [
  { value: 'default', label: '默认', description: '随界面主题适配' },
  { value: 'dark', label: '深色', description: '深色背景和高对比文字' },
  { value: 'forest', label: '森林', description: '绿色调' },
  { value: 'neutral', label: '中性', description: '低饱和灰阶' },
  { value: 'base', label: '基础', description: '可配合主题变量微调' },
] as const;

export const MERMAID_CURVE_OPTIONS = [
  { value: 'basis', label: '平滑' },
  { value: 'linear', label: '直线' },
  { value: 'cardinal', label: '卡迪纳尔' },
  { value: 'monotone', label: '单调' },
  { value: 'step', label: '阶梯' },
] as const;

/** `auto` 仅用于兼容旧文档，不在配置面板中展示。 */
export type MermaidThemeChoice = (typeof MERMAID_THEME_OPTIONS)[number]['value'] | 'auto';
export type MermaidCurveChoice = (typeof MERMAID_CURVE_OPTIONS)[number]['value'];

export interface MermaidVisualConfig {
  theme: MermaidThemeChoice;
  look: 'classic' | 'handDrawn';
  fontFamily: string;
  fontSize: number;
  htmlLabels: boolean;
  useMaxWidth: boolean;
  curve: MermaidCurveChoice;
  nodeSpacing: number;
  rankSpacing: number;
}

export interface ParsedMermaidConfig {
  value: MermaidDocumentConfig;
  error: string | null;
}

export const DEFAULT_VISUAL_CONFIG: MermaidVisualConfig = {
  theme: 'default',
  look: 'classic',
  fontFamily: MERMAID_FONT_FAMILY,
  fontSize: 16,
  htmlLabels: true,
  useMaxWidth: true,
  curve: 'basis',
  nodeSpacing: 50,
  rankSpacing: 50,
};

const SAFE_THEMES = new Set<string>([
  ...MERMAID_THEME_OPTIONS.map((option) => option.value),
  'auto',
]);
const SAFE_CURVES = new Set<string>(MERMAID_CURVE_OPTIONS.map((option) => option.value));

/**
 * Mermaid accepts a very broad configuration object.  A document can come
 * from a file or a share URL, so do not pass arbitrary JSON through to the
 * renderer.  Keep the documented diagram sections while bounding nested
 * values and removing CSS/DOMPurify escape hatches.
 */
const SAFE_CONFIG_KEYS = new Set([
  'theme',
  'themeVariables',
  'title',
  'look',
  'handDrawn',
  'handDrawnSeed',
  'fontSize',
  'useMaxWidth',
  'layout',
  'maxTextSize',
  'maxEdges',
  'darkMode',
  'htmlLabels',
  'fontFamily',
  'altFontFamily',
  'logLevel',
  'arrowMarkerAbsolute',
  'legacyMathML',
  'forceLegacyMathML',
  'deterministicIds',
  'deterministicIDSeed',
  'elk',
  'flowchart',
  'swimlane',
  'sequence',
  'gantt',
  'journey',
  'timeline',
  'class',
  'state',
  'er',
  'pie',
  'quadrantChart',
  'xyChart',
  'requirement',
  'architecture',
  'mindmap',
  'ishikawa',
  'kanban',
  'gitGraph',
  'c4',
  'sankey',
  'packet',
  'block',
  'eventmodeling',
  'treeView',
  'radar',
  'venn',
  'wardley-beta',
  'cynefin',
  'railroad',
  'wrap',
  'markdownAutoWrap',
]);
const BLOCKED_CONFIG_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'themeCSS',
  'dompurifyConfig',
  'secure',
  'securityLevel',
  'startOnLoad',
  'suppressErrorRendering',
]);
const MAX_CONFIG_DEPTH = 8;
const MAX_CONFIG_KEYS = 160;
const MAX_CONFIG_ARRAY_ITEMS = 160;
const MAX_CONFIG_STRING = 8_192;
const MAX_THEME_VARIABLE_STRING = 1_024;
const MAX_SOURCE_TEXT_SIZE = 200_000;
const MAX_EDGE_COUNT = 10_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeCssValue(value: string, maxLength = MAX_THEME_VARIABLE_STRING): string | undefined {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    /(?:url\s*\(|@(?:import|font-face)\b|expression\s*\(|javascript\s*:|data\s*:|\/\/)/iu.test(
      normalized,
    )
  ) {
    return undefined;
  }
  return normalized;
}

function cloneConfigValue(
  value: unknown,
  depth: number,
  context: 'generic' | 'themeVariables' | 'fontFamily' = 'generic',
): unknown {
  if (depth > MAX_CONFIG_DEPTH) return undefined;
  if (typeof value === 'string') {
    const limit = context === 'themeVariables' ? MAX_THEME_VARIABLE_STRING : MAX_CONFIG_STRING;
    if (context === 'fontFamily' || context === 'themeVariables') {
      return safeCssValue(value, limit);
    }
    return value.length > limit ? value.slice(0, limit) : value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? Math.max(-1_000_000_000, Math.min(1_000_000_000, value))
      : undefined;
  }
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_CONFIG_ARRAY_ITEMS)
      .map((item) => cloneConfigValue(item, depth + 1, context))
      .filter((item): item is Exclude<typeof item, undefined> => item !== undefined);
  }
  if (!isPlainObject(value)) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, MAX_CONFIG_KEYS)) {
    if (BLOCKED_CONFIG_KEYS.has(key) || !/^[\w-]{1,80}$/u.test(key)) continue;
    const childContext =
      context === 'generic' && key === 'themeVariables'
        ? 'themeVariables'
        : context === 'generic' && (key === 'fontFamily' || key === 'altFontFamily')
          ? 'fontFamily'
          : context;
    const cloned = cloneConfigValue(item, depth + 1, childContext);
    if (cloned !== undefined) result[key] = cloned;
  }
  return result;
}

/** Return a bounded, renderer-safe copy of an imported or shared config. */
export function sanitizeMermaidConfig(config: MermaidDocumentConfig): MermaidDocumentConfig {
  const source = isPlainObject(config) ? config : {};
  const result: MermaidDocumentConfig = {};
  for (const key of SAFE_CONFIG_KEYS) {
    if (!(key in source) || BLOCKED_CONFIG_KEYS.has(key)) continue;
    const cloned = cloneConfigValue(
      source[key],
      0,
      key === 'themeVariables'
        ? 'themeVariables'
        : key === 'fontFamily' || key === 'altFontFamily'
          ? 'fontFamily'
          : 'generic',
    );
    if (cloned !== undefined) result[key] = cloned;
  }
  if (typeof result.maxTextSize === 'number') {
    result.maxTextSize = Math.min(MAX_SOURCE_TEXT_SIZE, Math.max(1_000, result.maxTextSize));
  }
  if (typeof result.maxEdges === 'number') {
    result.maxEdges = Math.min(MAX_EDGE_COUNT, Math.max(0, result.maxEdges));
  }
  return result;
}

export function parseMermaidConfig(text: string): ParsedMermaidConfig {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { value: {}, error: '配置必须是 JSON 对象。' };
    }
    return { value: parsed as MermaidDocumentConfig, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'JSON 格式无效。';
    return { value: {}, error: `配置 JSON 无效：${message}` };
  }
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function visualConfigFromDocument(config: MermaidDocumentConfig): MermaidVisualConfig {
  const flowchart = isPlainObject(config.flowchart) ? config.flowchart : undefined;
  const curve =
    flowchart && typeof flowchart === 'object' && typeof flowchart.curve === 'string'
      ? flowchart.curve
      : DEFAULT_VISUAL_CONFIG.curve;
  const configuredTheme = typeof config.theme === 'string' ? config.theme : 'default';
  const normalizedTheme = configuredTheme === 'auto' ? 'default' : configuredTheme;
  const configuredLook = config.look === 'handDrawn' || config.handDrawn === true;
  const configuredUseMaxWidth =
    flowchart && typeof flowchart.useMaxWidth === 'boolean'
      ? flowchart.useMaxWidth
      : typeof config.useMaxWidth === 'boolean'
        ? config.useMaxWidth
        : DEFAULT_VISUAL_CONFIG.useMaxWidth;
  return {
    theme: SAFE_THEMES.has(normalizedTheme)
      ? (normalizedTheme as MermaidThemeChoice)
      : DEFAULT_VISUAL_CONFIG.theme,
    look: configuredLook ? 'handDrawn' : 'classic',
    fontFamily:
      typeof config.fontFamily === 'string' && config.fontFamily.trim()
        ? config.fontFamily
        : DEFAULT_VISUAL_CONFIG.fontFamily,
    fontSize: finiteNumber(config.fontSize, DEFAULT_VISUAL_CONFIG.fontSize, 10, 48),
    htmlLabels:
      typeof config.htmlLabels === 'boolean' ? config.htmlLabels : DEFAULT_VISUAL_CONFIG.htmlLabels,
    useMaxWidth: configuredUseMaxWidth,
    curve: SAFE_CURVES.has(curve) ? (curve as MermaidCurveChoice) : DEFAULT_VISUAL_CONFIG.curve,
    nodeSpacing:
      flowchart && typeof flowchart === 'object'
        ? finiteNumber(flowchart.nodeSpacing, DEFAULT_VISUAL_CONFIG.nodeSpacing, 0, 240)
        : DEFAULT_VISUAL_CONFIG.nodeSpacing,
    rankSpacing:
      flowchart && typeof flowchart === 'object'
        ? finiteNumber(flowchart.rankSpacing, DEFAULT_VISUAL_CONFIG.rankSpacing, 0, 240)
        : DEFAULT_VISUAL_CONFIG.rankSpacing,
  };
}

function withFlowchart(
  config: MermaidDocumentConfig,
  patch: Record<string, unknown>,
): MermaidDocumentConfig {
  const current =
    config.flowchart && typeof config.flowchart === 'object' && !Array.isArray(config.flowchart)
      ? config.flowchart
      : {};
  return { ...config, flowchart: { ...current, ...patch } };
}

export function updateDocumentVisualConfig(
  config: MermaidDocumentConfig,
  patch: Partial<MermaidVisualConfig>,
): MermaidDocumentConfig {
  let next: MermaidDocumentConfig = { ...config };
  if (patch.theme !== undefined) next.theme = patch.theme;
  if (patch.look !== undefined) {
    next.look = patch.look;
    delete next.handDrawn;
  }
  if (patch.fontFamily !== undefined) next.fontFamily = patch.fontFamily;
  if (patch.fontSize !== undefined) next.fontSize = patch.fontSize;
  if (patch.htmlLabels !== undefined) next.htmlLabels = patch.htmlLabels;
  if (patch.useMaxWidth !== undefined) {
    next.useMaxWidth = patch.useMaxWidth;
    next = withFlowchart(next, { useMaxWidth: patch.useMaxWidth });
  }
  const flowchartPatch: Record<string, unknown> = {};
  if (patch.curve !== undefined) flowchartPatch.curve = patch.curve;
  if (patch.nodeSpacing !== undefined) flowchartPatch.nodeSpacing = patch.nodeSpacing;
  if (patch.rankSpacing !== undefined) flowchartPatch.rankSpacing = patch.rankSpacing;
  if (Object.keys(flowchartPatch).length) next = withFlowchart(next, flowchartPatch);
  return next;
}

export function serializeMermaidConfig(config: MermaidDocumentConfig): string {
  return JSON.stringify(config, null, 2);
}

const DARK_THEME_VARIABLES: Record<string, string> = {
  background: '#141820',
  primaryColor: '#2f4b63',
  primaryTextColor: '#f8fafc',
  primaryBorderColor: '#8fb5d6',
  lineColor: '#a7b8ca',
  textColor: '#e5e7eb',
  mainBkg: '#1f2937',
  secondaryColor: '#334155',
  tertiaryColor: '#273449',
  clusterBkg: '#202b3a',
  clusterBorder: '#718096',
  edgeLabelBackground: '#202733',
  pie1: '#38bdf8',
  pie2: '#34d399',
  pie3: '#fbbf24',
  pie4: '#f472b6',
  pie5: '#a78bfa',
  pie6: '#fb7185',
  pie7: '#22d3ee',
  pie8: '#4ade80',
  pie9: '#facc15',
  pie10: '#c084fc',
  pie11: '#fb923c',
  pieStrokeColor: '#0f172a',
  pieOuterStrokeColor: '#0f172a',
  pieTitleTextColor: '#f8fafc',
  pieSectionTextColor: '#f8fafc',
  pieLegendTextColor: '#e5e7eb',
  quadrant1Fill: '#1e3a5f',
  quadrant2Fill: '#164e63',
  quadrant3Fill: '#3f2b63',
  quadrant4Fill: '#4a2c36',
  quadrant1TextFill: '#f8fafc',
  quadrant2TextFill: '#f8fafc',
  quadrant3TextFill: '#f8fafc',
  quadrant4TextFill: '#f8fafc',
  quadrantXAxisTextFill: '#e5e7eb',
  quadrantYAxisTextFill: '#e5e7eb',
  quadrantPointTextFill: '#f8fafc',
  quadrantInternalBorderStrokeFill: '#94a3b8',
  quadrantExternalBorderStrokeFill: '#cbd5e1',
  quadrantTitleFill: '#f8fafc',
  classText: '#f8fafc',
  relationColor: '#cbd5e1',
  relationLabelBackground: '#273449',
  relationLabelColor: '#f8fafc',
  requirementBackground: '#243b53',
  requirementTextColor: '#f8fafc',
  requirementBorderColor: '#8fb5d6',
  stateBkg: '#1f2937',
  stateLabelColor: '#f8fafc',
  labelBackgroundColor: '#202733',
  transitionColor: '#cbd5e1',
  transitionLabelColor: '#f8fafc',
  taskBkgColor: '#28536b',
  taskBorderColor: '#8fb5d6',
  taskTextColor: '#f8fafc',
  taskTextLightColor: '#f8fafc',
  taskTextOutsideColor: '#e5e7eb',
  activeTaskBkgColor: '#3b82a0',
  activeTaskBorderColor: '#bae6fd',
  doneTaskBkgColor: '#365d4a',
  doneTaskBorderColor: '#86efac',
  gridColor: '#475569',
  todayLineColor: '#fb7185',
  rowOdd: '#202b3a',
  rowEven: '#17202d',
  archEdgeColor: '#cbd5e1',
  archEdgeArrowColor: '#cbd5e1',
  archGroupBorderColor: '#94a3b8',
  packetStartByteColor: '#e5e7eb',
  packetEndByteColor: '#e5e7eb',
  packetLabelColor: '#f8fafc',
  packetTitleColor: '#f8fafc',
  packetBlockStrokeColor: '#94a3b8',
  packetBlockFillColor: '#202b3a',
  scaleLabelColor: '#e5e7eb',
  labelColor: '#f8fafc',
};

export function renderConfigForTheme(
  config: MermaidDocumentConfig,
  resolvedTheme: 'light' | 'dark',
): MermaidConfig {
  const safeConfig = sanitizeMermaidConfig(config);
  const visual = visualConfigFromDocument(safeConfig);
  const configuredTheme = typeof safeConfig.theme === 'string' ? safeConfig.theme : visual.theme;
  const effectiveTheme =
    configuredTheme === 'auto' ||
    (resolvedTheme === 'dark' && (configuredTheme === 'default' || !configuredTheme))
      ? resolvedTheme === 'dark'
        ? 'dark'
        : 'default'
      : visual.theme;
  const configuredThemeVariables = isPlainObject(safeConfig.themeVariables)
    ? safeConfig.themeVariables
    : undefined;
  const themeVariables = {
    ...(effectiveTheme === 'dark' ? DARK_THEME_VARIABLES : {}),
    ...configuredThemeVariables,
    // Mermaid 的图表 CSS 从 themeVariables.fontSize 读取字号，顶层
    // fontSize 只会影响部分图表配置，因此这里始终同步滑块值。
    fontSize: `${visual.fontSize}px`,
  };
  const base: MermaidDocumentConfig = {
    startOnLoad: false,
    suppressErrorRendering: true,
    securityLevel: 'strict',
    theme: effectiveTheme,
    look: visual.look,
    fontFamily: visual.fontFamily,
    fontSize: visual.fontSize,
    htmlLabels: visual.htmlLabels,
    useMaxWidth: visual.useMaxWidth,
    flowchart: {
      curve: visual.curve,
      nodeSpacing: visual.nodeSpacing,
      rankSpacing: visual.rankSpacing,
      useMaxWidth: visual.useMaxWidth,
    },
    ...safeConfig,
  };
  if (themeVariables) base.themeVariables = themeVariables;
  // 这些选项属于平台安全边界，任何文档配置都不能覆盖。
  base.startOnLoad = false;
  base.suppressErrorRendering = true;
  base.securityLevel = 'strict';
  base.secure = [
    'secure',
    'securityLevel',
    'startOnLoad',
    'suppressErrorRendering',
    'themeCSS',
    'themeVariables',
    'fontFamily',
    'altFontFamily',
    'maxTextSize',
    'maxEdges',
    'dompurifyConfig',
  ];
  base.theme = effectiveTheme;
  base.look = visual.look;
  base.fontFamily = visual.fontFamily;
  base.fontSize = visual.fontSize;
  base.htmlLabels = visual.htmlLabels;
  base.useMaxWidth = visual.useMaxWidth;
  base.flowchart = {
    ...(isPlainObject(safeConfig.flowchart) ? safeConfig.flowchart : {}),
    curve: visual.curve,
    nodeSpacing: visual.nodeSpacing,
    rankSpacing: visual.rankSpacing,
    useMaxWidth: visual.useMaxWidth,
  };
  return base as MermaidConfig;
}

export function sourceHasInlineConfig(source: string): boolean {
  return /(?:^|\n)\s*---[\s\S]*?\nconfig\s*:|%%\{\s*init\s*:/iu.test(source);
}
