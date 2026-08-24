<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch, type ComponentPublicInstance } from 'vue';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import 'monaco-editor/language/json/monaco.contribution.js';
import { toolsBackgroundPreviewActive } from '@/core/shared/route-state';

interface MonacoWorkerEnvironment {
  getWorker?(moduleId: string, label: string): Worker | Promise<Worker>;
}

const monacoGlobal = globalThis as typeof globalThis & {
  MonacoEnvironment?: MonacoWorkerEnvironment;
};

const existingWorkerEnvironment = monacoGlobal.MonacoEnvironment;
const existingGetWorker = existingWorkerEnvironment?.getWorker?.bind(existingWorkerEnvironment);

monacoGlobal.MonacoEnvironment = {
  ...existingWorkerEnvironment,
  getWorker: (moduleId, label) => {
    if (label === 'json') return new JsonWorker();
    return existingGetWorker?.(moduleId, label) ?? new EditorWorker();
  },
};

const original = defineModel<string>('original', { required: true });
const modified = defineModel<string>('modified', { required: true });
const props = withDefaults(
  defineProps<{
    language?: 'plaintext' | 'json';
    granularity?: 'line' | 'word' | 'character';
    ignoreCase?: boolean;
    ignoreWhitespace?: boolean;
    ignoreBlankLines?: boolean;
    ignoreTrimWhitespace?: boolean;
    renderSideBySide?: boolean;
  }>(),
  {
    language: 'plaintext',
    granularity: 'line',
    ignoreCase: false,
    ignoreWhitespace: false,
    ignoreBlankLines: false,
    ignoreTrimWhitespace: false,
    renderSideBySide: true,
  },
);

let mountElement: HTMLDivElement | null = null;
let editor: monaco.editor.IStandaloneDiffEditor | null = null;
let originalModel: monaco.editor.ITextModel | null = null;
let modifiedModel: monaco.editor.ITextModel | null = null;
let originalDisposable: monaco.IDisposable | null = null;
let modifiedDisposable: monaco.IDisposable | null = null;
let themeObserver: MutationObserver | null = null;
let syncing = false;
let originalDecorations: monaco.editor.IEditorDecorationsCollection | null = null;
let modifiedDecorations: monaco.editor.IEditorDecorationsCollection | null = null;
let customDifferences: Array<{ original: monaco.Range; modified: monaco.Range }> = [];
let customDifferenceIndex = -1;
let decorationTimer: ReturnType<typeof setTimeout> | null = null;

interface VisualToken {
  key: string;
  start: number;
  end: number;
}

const MAX_VISUAL_LCS_CELLS = 500_000;

function visualTokens(
  value: string,
  granularity: 'line' | 'word' | 'character' = props.granularity,
): VisualToken[] {
  const result: VisualToken[] = [];
  const blankLineSpans: Array<{ start: number; end: number }> = [];
  if (props.ignoreBlankLines) {
    let lineStart = 0;
    while (lineStart <= value.length) {
      const newline = value.indexOf('\n', lineStart);
      const lineEnd = newline === -1 ? value.length : newline;
      if (value.slice(lineStart, lineEnd).trim() === '') {
        blankLineSpans.push({ start: lineStart, end: newline === -1 ? lineEnd : lineEnd + 1 });
      }
      if (newline === -1) break;
      lineStart = newline + 1;
    }
  }
  const pattern =
    granularity === 'line'
      ? /.*(?:\n|$)/g
      : granularity === 'word'
        ? /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu
        : /[\s\S]/gu;
  let blankLineIndex = 0;
  for (const match of value.matchAll(pattern)) {
    const raw = match[0];
    if (!raw) continue;
    const end = match.index + raw.length;
    while (blankLineSpans[blankLineIndex]?.end <= match.index) blankLineIndex += 1;
    const blankLine = blankLineSpans[blankLineIndex];
    if (blankLine && match.index >= blankLine.start && end <= blankLine.end) continue;
    if (granularity !== 'line' && props.ignoreWhitespace && /^\s+$/.test(raw)) continue;
    let key = props.ignoreWhitespace ? raw.replace(/\s+/g, ' ').trim() : raw;
    if (props.ignoreCase) key = key.toLocaleLowerCase();
    result.push({ key, start: match.index, end });
  }
  return result;
}

function rangeFromOffsets(
  model: monaco.editor.ITextModel,
  start: number,
  end: number,
): monaco.Range {
  const from = model.getPositionAt(start);
  const to = model.getPositionAt(Math.max(start, end));
  return new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column);
}

function wholeLineRange(model: monaco.editor.ITextModel, start: number, end: number): monaco.Range {
  const startLine = model.getPositionAt(start).lineNumber;
  const endLine = model.getPositionAt(Math.max(start, end - 1)).lineNumber;
  return new monaco.Range(startLine, 1, endLine, model.getLineMaxColumn(endLine));
}

function windowedLineDifferences(
  left: VisualToken[],
  right: VisualToken[],
): Array<{ original: monaco.Range; modified: monaco.Range }> {
  if (!originalModel || !modifiedModel) return [];
  const result: Array<{ original: monaco.Range; modified: monaco.Range }> = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i]!.key === right[j]!.key) {
      i += 1;
      j += 1;
      continue;
    }
    const leftStart = i;
    const rightStart = j;
    let anchor: { left: number; right: number; distance: number } | null = null;
    const leftEnd = Math.min(left.length, i + 97);
    const rightEnd = Math.min(right.length, j + 97);
    for (let candidateLeft = i; candidateLeft < leftEnd; candidateLeft += 1) {
      for (let candidateRight = j; candidateRight < rightEnd; candidateRight += 1) {
        if (candidateLeft === i && candidateRight === j) continue;
        if (left[candidateLeft]!.key !== right[candidateRight]!.key) continue;
        const distance = candidateLeft - i + (candidateRight - j);
        if (!anchor || distance < anchor.distance) {
          anchor = { left: candidateLeft, right: candidateRight, distance };
        }
      }
    }
    i = anchor?.left ?? left.length;
    j = anchor?.right ?? right.length;
    const leftOffset = left[leftStart]?.start ?? left.at(-1)?.end ?? 0;
    const rightOffset = right[rightStart]?.start ?? right.at(-1)?.end ?? 0;
    const hasOriginal = i > leftStart;
    const hasModified = j > rightStart;
    const originalRange = hasOriginal
      ? wholeLineRange(originalModel, leftOffset, left[i - 1]!.end)
      : rangeFromOffsets(originalModel, leftOffset, leftOffset);
    const modifiedRange = hasModified
      ? wholeLineRange(modifiedModel, rightOffset, right[j - 1]!.end)
      : rangeFromOffsets(modifiedModel, rightOffset, rightOffset);
    result.push({
      original: originalRange,
      modified: modifiedRange,
    });
  }
  return result;
}

function visualDifferences(): Array<{ original: monaco.Range; modified: monaco.Range }> {
  if (!originalModel || !modifiedModel || props.language !== 'plaintext') return [];
  const left = visualTokens(originalModel.getValue());
  const right = visualTokens(modifiedModel.getValue());
  if ((left.length + 1) * (right.length + 1) > MAX_VISUAL_LCS_CELLS) {
    return windowedLineDifferences(
      visualTokens(originalModel.getValue(), 'line'),
      visualTokens(modifiedModel.getValue(), 'line'),
    );
  }

  const columns = right.length + 1;
  const table = new Uint32Array((left.length + 1) * columns);
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i * columns + j] =
        left[i]!.key === right[j]!.key
          ? table[(i + 1) * columns + j + 1]! + 1
          : Math.max(table[(i + 1) * columns + j]!, table[i * columns + j + 1]!);
    }
  }
  const result: Array<{ original: monaco.Range; modified: monaco.Range }> = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i]!.key === right[j]!.key) {
      i += 1;
      j += 1;
      continue;
    }
    const leftStart = i;
    const rightStart = j;
    while (i < left.length || j < right.length) {
      if (i < left.length && j < right.length && left[i]!.key === right[j]!.key) break;
      if (
        j >= right.length ||
        (i < left.length && table[(i + 1) * columns + j]! >= table[i * columns + j + 1]!)
      )
        i += 1;
      else j += 1;
    }
    const leftOffset = left[leftStart]?.start ?? left.at(-1)?.end ?? 0;
    const rightOffset = right[rightStart]?.start ?? right.at(-1)?.end ?? 0;
    const hasOriginal = i > leftStart;
    const hasModified = j > rightStart;
    result.push({
      original:
        props.granularity === 'line' && hasOriginal
          ? wholeLineRange(originalModel, leftOffset, left[i - 1]!.end)
          : rangeFromOffsets(originalModel, leftOffset, left[i - 1]?.end ?? leftOffset),
      modified:
        props.granularity === 'line' && hasModified
          ? wholeLineRange(modifiedModel, rightOffset, right[j - 1]!.end)
          : rangeFromOffsets(modifiedModel, rightOffset, right[j - 1]?.end ?? rightOffset),
    });
  }
  return result;
}

function refreshDecorations(): void {
  if (!originalDecorations || !modifiedDecorations) return;
  customDifferences = visualDifferences();
  customDifferenceIndex = -1;
  const makeDecorations = (side: 'original' | 'modified') =>
    customDifferences.map((difference) => ({
      range: difference[side],
      options: {
        className: `studio-custom-diff-line studio-custom-diff-line-${side}`,
        inlineClassName:
          props.granularity === 'line' ? undefined : `studio-custom-diff-text-${side}`,
        isWholeLine: props.granularity === 'line' && !difference[side].isEmpty(),
      },
    }));
  originalDecorations.set(makeDecorations('original'));
  modifiedDecorations.set(makeDecorations('modified'));
}

function scheduleDecorations(): void {
  if (decorationTimer) clearTimeout(decorationTimer);
  decorationTimer = setTimeout(refreshDecorations, 120);
}

function refreshOverviewRuler(): void {
  const hasBothContent = Boolean(
    originalModel?.getValue().trim() && modifiedModel?.getValue().trim(),
  );
  editor?.updateOptions({ renderOverviewRuler: hasBothContent });
}

function resolveTheme(): string {
  if (toolsBackgroundPreviewActive.value) {
    return document.documentElement.dataset.theme === 'dark'
      ? 'studio-diff-dark-background-preview'
      : 'studio-diff-light-background-preview';
  }
  return document.documentElement.dataset.theme === 'dark'
    ? 'studio-diff-dark'
    : 'studio-diff-light';
}

function registerThemes(): void {
  monaco.editor.defineTheme('studio-diff-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editorGutter.background': '#f8f9fb',
      'editor.lineHighlightBackground': '#f7f8fa',
      'diffEditor.insertedTextBackground': '#b7e4a466',
      'diffEditor.removedTextBackground': '#ffb4ad66',
      'diffEditor.insertedLineBackground': '#eaf7e566',
      'diffEditor.removedLineBackground': '#fff0ee66',
      'diffEditorGutter.insertedLineBackground': '#5a960055',
      'diffEditorGutter.removedLineBackground': '#ef444455',
      'diffEditorOverview.insertedForeground': '#5a960099',
      'diffEditorOverview.removedForeground': '#ef444499',
    },
  });
  monaco.editor.defineTheme('studio-diff-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#171b22',
      'editorGutter.background': '#141820',
      'editor.lineHighlightBackground': '#1d222b',
      'diffEditor.insertedTextBackground': '#347a3f70',
      'diffEditor.removedTextBackground': '#9b3d3d70',
      'diffEditor.insertedLineBackground': '#234b2d55',
      'diffEditor.removedLineBackground': '#572b2b55',
      'diffEditorGutter.insertedLineBackground': '#5a960077',
      'diffEditorGutter.removedLineBackground': '#ef444477',
      'diffEditorOverview.insertedForeground': '#5a9600bb',
      'diffEditorOverview.removedForeground': '#ef4444bb',
    },
  });
  monaco.editor.defineTheme('studio-diff-light-background-preview', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff00',
      'editorGutter.background': '#ffffff00',
      'editor.lineHighlightBackground': '#ffffff24',
      'diffEditor.insertedTextBackground': '#b7e4a466',
      'diffEditor.removedTextBackground': '#ffb4ad66',
      'diffEditor.insertedLineBackground': '#eaf7e566',
      'diffEditor.removedLineBackground': '#fff0ee66',
      'diffEditorGutter.insertedLineBackground': '#5a960055',
      'diffEditorGutter.removedLineBackground': '#ef444455',
      'diffEditorOverview.insertedForeground': '#5a960099',
      'diffEditorOverview.removedForeground': '#ef444499',
    },
  });
  monaco.editor.defineTheme('studio-diff-dark-background-preview', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#171b2200',
      'editorGutter.background': '#171b2200',
      'editor.lineHighlightBackground': '#00000030',
      'diffEditor.insertedTextBackground': '#347a3f70',
      'diffEditor.removedTextBackground': '#9b3d3d70',
      'diffEditor.insertedLineBackground': '#234b2d55',
      'diffEditor.removedLineBackground': '#572b2b55',
      'diffEditorGutter.insertedLineBackground': '#5a960077',
      'diffEditorGutter.removedLineBackground': '#ef444477',
      'diffEditorOverview.insertedForeground': '#5a9600bb',
      'diffEditorOverview.removedForeground': '#ef4444bb',
    },
  });
}

function refreshTheme(): void {
  const dark = document.documentElement.dataset.theme === 'dark';
  const backgroundPreview = toolsBackgroundPreviewActive.value;
  monaco.editor.defineTheme('studio-diff-custom-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': backgroundPreview ? '#ffffff00' : '#ffffff',
      'editorGutter.background': backgroundPreview ? '#ffffff00' : '#f8f9fb',
      'editor.lineHighlightBackground': backgroundPreview ? '#ffffff24' : '#f7f8fa',
      'diffEditor.insertedTextBackground': '#b7e4a466',
      'diffEditor.removedTextBackground': '#ffb4ad66',
      'diffEditor.insertedLineBackground': '#00000000',
      'diffEditor.removedLineBackground': '#00000000',
    },
  });
  monaco.editor.defineTheme('studio-diff-custom-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': backgroundPreview ? '#171b2200' : '#171b22',
      'editorGutter.background': backgroundPreview ? '#171b2200' : '#141820',
      'editor.lineHighlightBackground': backgroundPreview ? '#00000030' : '#1d222b',
      'diffEditor.insertedTextBackground': '#347a3f70',
      'diffEditor.removedTextBackground': '#9b3d3d70',
      'diffEditor.insertedLineBackground': '#00000000',
      'diffEditor.removedLineBackground': '#00000000',
    },
  });
  const customLineMode =
    props.language === 'plaintext' &&
    props.granularity === 'line' &&
    !props.ignoreCase &&
    !props.ignoreWhitespace &&
    !props.ignoreBlankLines;
  monaco.editor.setTheme(
    customLineMode
      ? dark
        ? 'studio-diff-custom-dark'
        : 'studio-diff-custom-light'
      : resolveTheme(),
  );
}

function mountEditor(element: Element | ComponentPublicInstance | null): void {
  mountElement = element instanceof HTMLDivElement ? element : null;
}

function reveal(originalLine: number, modifiedLine: number): void {
  if (!editor) return;
  const originalEditor = editor.getOriginalEditor();
  const modifiedEditor = editor.getModifiedEditor();
  originalEditor.revealLineInCenter(Math.max(1, originalLine));
  modifiedEditor.revealLineInCenter(Math.max(1, modifiedLine));
  modifiedEditor.setPosition({ lineNumber: Math.max(1, modifiedLine), column: 1 });
  modifiedEditor.focus();
}

function goToDiff(direction: 'next' | 'previous'): void {
  if (props.language !== 'plaintext' || !customDifferences.length) {
    editor?.goToDiff(direction);
    return;
  }
  customDifferenceIndex =
    direction === 'next'
      ? (customDifferenceIndex + 1) % customDifferences.length
      : (customDifferenceIndex - 1 + customDifferences.length) % customDifferences.length;
  const difference = customDifferences[customDifferenceIndex]!;
  reveal(difference.original.startLineNumber, difference.modified.startLineNumber);
}

defineExpose({ reveal, goToDiff });

onMounted(() => {
  if (!mountElement) return;
  registerThemes();
  originalModel = monaco.editor.createModel(original.value, props.language);
  modifiedModel = monaco.editor.createModel(modified.value, props.language);
  editor = monaco.editor.createDiffEditor(mountElement, {
    ariaLabel: '文本与 JSON 对比编辑器',
    automaticLayout: true,
    diffAlgorithm: 'advanced',
    diffWordWrap: 'on',
    enableSplitViewResizing: true,
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
    fontLigatures: true,
    fontSize: 12,
    ignoreTrimWhitespace: props.ignoreTrimWhitespace,
    minimap: { enabled: false },
    originalAriaLabel: '原始内容',
    originalEditable: true,
    padding: { top: 10, bottom: 12 },
    renderMarginRevertIcon: false,
    renderOverviewRuler: Boolean(original.value.trim() && modified.value.trim()),
    renderSideBySide: props.renderSideBySide,
    renderSideBySideInlineBreakpoint: 700,
    scrollBeyondLastLine: false,
    stickyScroll: { enabled: false },
    theme: resolveTheme(),
    useInlineViewWhenSpaceIsLimited: true,
  });
  editor.setModel({ original: originalModel, modified: modifiedModel });
  originalDecorations = editor.getOriginalEditor().createDecorationsCollection();
  modifiedDecorations = editor.getModifiedEditor().createDecorationsCollection();
  originalDisposable = originalModel.onDidChangeContent(() => {
    if (!syncing && originalModel) original.value = originalModel.getValue();
    scheduleDecorations();
    refreshOverviewRuler();
  });
  modifiedDisposable = modifiedModel.onDidChangeContent(() => {
    if (!syncing && modifiedModel) modified.value = modifiedModel.getValue();
    scheduleDecorations();
    refreshOverviewRuler();
  });
  themeObserver = new MutationObserver(refreshTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  refreshDecorations();
  refreshTheme();
});

watch(original, (value) => {
  if (!originalModel || originalModel.getValue() === value) return;
  const selections = editor?.getOriginalEditor().getSelections() ?? null;
  syncing = true;
  originalModel.pushStackElement();
  originalModel.pushEditOperations(
    selections,
    [{ range: originalModel.getFullModelRange(), text: value }],
    () => selections,
  );
  originalModel.pushStackElement();
  syncing = false;
});

watch(modified, (value) => {
  if (!modifiedModel || modifiedModel.getValue() === value) return;
  const selections = editor?.getModifiedEditor().getSelections() ?? null;
  syncing = true;
  modifiedModel.pushStackElement();
  modifiedModel.pushEditOperations(
    selections,
    [{ range: modifiedModel.getFullModelRange(), text: value }],
    () => selections,
  );
  modifiedModel.pushStackElement();
  syncing = false;
});

watch(
  () => props.language,
  (language) => {
    if (originalModel) monaco.editor.setModelLanguage(originalModel, language);
    if (modifiedModel) monaco.editor.setModelLanguage(modifiedModel, language);
    refreshDecorations();
    refreshTheme();
  },
);

watch(
  () => [props.granularity, props.ignoreCase, props.ignoreWhitespace, props.ignoreBlankLines],
  () => {
    refreshDecorations();
    refreshTheme();
  },
);

watch(
  () => props.ignoreTrimWhitespace,
  (ignoreTrimWhitespace) => editor?.updateOptions({ ignoreTrimWhitespace }),
);

watch(
  () => props.renderSideBySide,
  (renderSideBySide) => editor?.updateOptions({ renderSideBySide }),
);

watch(toolsBackgroundPreviewActive, refreshTheme);

onBeforeUnmount(() => {
  if (decorationTimer) clearTimeout(decorationTimer);
  originalDecorations?.clear();
  modifiedDecorations?.clear();
  originalDisposable?.dispose();
  modifiedDisposable?.dispose();
  editor?.dispose();
  originalModel?.dispose();
  modifiedModel?.dispose();
  themeObserver?.disconnect();
});
</script>

<template>
  <div
    :ref="mountEditor"
    class="monaco-diff-editor"
    :class="{
      'uses-custom-diff': props.language === 'plaintext',
      'uses-native-inline':
        props.language === 'plaintext' &&
        props.granularity === 'line' &&
        !props.ignoreCase &&
        !props.ignoreWhitespace &&
        !props.ignoreBlankLines,
    }"
  ></div>
</template>

<style scoped>
.monaco-diff-editor {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.uses-custom-diff,
.uses-custom-diff :deep(.monaco-editor),
.uses-custom-diff :deep(.monaco-diff-editor) {
  --vscode-diffEditor-insertedLineBackground: transparent;
  --vscode-diffEditor-removedLineBackground: transparent;
  --vscode-diffEditorGutter-insertedLineBackground: transparent;
  --vscode-diffEditorGutter-removedLineBackground: transparent;
  --vscode-diffEditorOverview-insertedForeground: transparent;
  --vscode-diffEditorOverview-removedForeground: transparent;
}

.uses-custom-diff:not(.uses-native-inline),
.uses-custom-diff:not(.uses-native-inline) :deep(.monaco-editor),
.uses-custom-diff:not(.uses-native-inline) :deep(.monaco-diff-editor) {
  --vscode-diffEditor-insertedTextBackground: transparent;
  --vscode-diffEditor-removedTextBackground: transparent;
}

.uses-custom-diff :deep(.studio-custom-diff-line-original) {
  background: color-mix(in srgb, #ef4444 12%, transparent);
}

.uses-custom-diff :deep(.studio-custom-diff-line-modified) {
  background: color-mix(in srgb, #5a9600 12%, transparent);
}

.uses-custom-diff :deep(.studio-custom-diff-text-original) {
  background: color-mix(in srgb, #ef4444 32%, transparent);
}

.uses-custom-diff :deep(.studio-custom-diff-text-modified) {
  background: color-mix(in srgb, #5a9600 32%, transparent);
}

.uses-custom-diff :deep(.studio-custom-diff-line-original)::before,
.uses-custom-diff :deep(.studio-custom-diff-line-modified)::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 2px;
  content: '';
}

.uses-custom-diff :deep(.studio-custom-diff-line-original)::before {
  background: #ef4444;
}

.uses-custom-diff :deep(.studio-custom-diff-line-modified)::before {
  background: #5a9600;
}
</style>
