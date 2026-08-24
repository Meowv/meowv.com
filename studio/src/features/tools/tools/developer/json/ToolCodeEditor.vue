<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch, type ComponentPublicInstance } from 'vue';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import 'monaco-editor/language/json/monaco.contribution.js';
import { toolsBackgroundPreviewActive } from '@/core/shared/route-state';

interface MonacoWorkerEnvironment {
  getWorker(moduleId: string, label: string): Worker;
}

const monacoGlobal = globalThis as typeof globalThis & {
  MonacoEnvironment?: MonacoWorkerEnvironment;
};

monacoGlobal.MonacoEnvironment ??= {
  getWorker: (_moduleId, label) => (label === 'json' ? new JsonWorker() : new EditorWorker()),
};

const model = defineModel<string>({ required: true });
const emit = defineEmits<{
  'paste-text': [text: string, event: ClipboardEvent];
}>();
const props = withDefaults(
  defineProps<{
    language?: string;
    readOnly?: boolean;
    wordWrap?: boolean;
    lineNumbers?: boolean;
    folding?: boolean;
    label: string;
    minHeight?: number;
    placeholder?: string;
  }>(),
  {
    language: 'plaintext',
    readOnly: false,
    wordWrap: true,
    lineNumbers: true,
    folding: true,
    minHeight: 350,
    placeholder: '',
  },
);

let mountElement: HTMLDivElement | null = null;
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let contentDisposable: monaco.IDisposable | null = null;
let themeObserver: MutationObserver | null = null;
let syncing = false;

function resolveTheme(): string {
  if (toolsBackgroundPreviewActive.value) {
    return document.documentElement.dataset.theme === 'dark'
      ? 'studio-tools-dark-background-preview'
      : 'studio-tools-light-background-preview';
  }
  return document.documentElement.dataset.theme === 'dark'
    ? 'studio-tools-dark'
    : 'studio-tools-light';
}

function registerThemes(): void {
  monaco.editor.defineTheme('studio-tools-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editorGutter.background': '#f8f9fb',
      'editor.lineHighlightBackground': '#f7f8fa',
      'editorLineNumber.foreground': '#a4a9b2',
      'editorLineNumber.activeForeground': '#69707d',
    },
  });
  monaco.editor.defineTheme('studio-tools-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#171b22',
      'editorGutter.background': '#141820',
      'editor.lineHighlightBackground': '#1d222b',
      'editorLineNumber.foreground': '#69717f',
      'editorLineNumber.activeForeground': '#aab1bd',
    },
  });
  monaco.editor.defineTheme('studio-tools-light-background-preview', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff00',
      'editorGutter.background': '#ffffff00',
      'editor.lineHighlightBackground': '#ffffff24',
      'editorLineNumber.foreground': '#747b86',
      'editorLineNumber.activeForeground': '#3f4651',
    },
  });
  monaco.editor.defineTheme('studio-tools-dark-background-preview', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#171b2200',
      'editorGutter.background': '#171b2200',
      'editor.lineHighlightBackground': '#00000030',
      'editorLineNumber.foreground': '#b6bec9',
      'editorLineNumber.activeForeground': '#f3f4f6',
    },
  });
}

function mountEditor(element: Element | ComponentPublicInstance | null): void {
  mountElement = element instanceof HTMLDivElement ? element : null;
}

async function foldAll(): Promise<void> {
  await editor?.getAction('editor.foldAll')?.run();
}

async function unfoldAll(): Promise<void> {
  await editor?.getAction('editor.unfoldAll')?.run();
}

function focus(): void {
  editor?.focus();
}

function handlePaste(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData('text/plain');
  if (!text) return;
  emit('paste-text', text, event);
  if (event.defaultPrevented) event.stopImmediatePropagation();
}

defineExpose({ foldAll, unfoldAll, focus });

onMounted(() => {
  if (!mountElement) return;
  registerThemes();
  editor = monaco.editor.create(mountElement, {
    ariaLabel: props.label,
    automaticLayout: true,
    bracketPairColorization: { enabled: true },
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
    fontLigatures: true,
    fontSize: 12,
    folding: props.folding,
    glyphMargin: props.folding,
    language: props.language,
    lineDecorationsWidth: props.lineNumbers ? 10 : 0,
    lineNumbers: props.lineNumbers ? 'on' : 'off',
    lineNumbersMinChars: props.lineNumbers ? 3 : 0,
    minimap: { enabled: false },
    padding: { bottom: 14, top: 10 },
    placeholder: props.placeholder,
    readOnly: props.readOnly,
    renderLineHighlight: 'line',
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    stickyScroll: { enabled: false },
    tabSize: 2,
    theme: resolveTheme(),
    value: model.value,
    wordWrap: props.wordWrap ? 'on' : 'off',
    wrappingIndent: 'indent',
  });
  contentDisposable = editor.onDidChangeModelContent(() => {
    if (syncing || !editor) return;
    model.value = editor.getValue();
  });
  mountElement.addEventListener('paste', handlePaste, true);
  themeObserver = new MutationObserver(() => monaco.editor.setTheme(resolveTheme()));
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
});

watch(toolsBackgroundPreviewActive, () => monaco.editor.setTheme(resolveTheme()));

watch(model, (value) => {
  if (!editor || editor.getValue() === value) return;
  syncing = true;
  editor.setValue(value);
  syncing = false;
});

watch(
  () => props.wordWrap,
  (enabled) => editor?.updateOptions({ wordWrap: enabled ? 'on' : 'off' }),
);

watch(
  () => props.readOnly,
  (readOnly) => editor?.updateOptions({ readOnly }),
);

watch(
  () => props.placeholder,
  (placeholder) => editor?.updateOptions({ placeholder }),
);

onBeforeUnmount(() => {
  mountElement?.removeEventListener('paste', handlePaste, true);
  contentDisposable?.dispose();
  editor?.dispose();
  themeObserver?.disconnect();
  contentDisposable = null;
  editor = null;
  themeObserver = null;
});
</script>

<template>
  <div
    :ref="mountEditor"
    class="tool-code-editor"
    :class="{ 'tool-code-editor--readonly': readOnly }"
    :style="{ minHeight: `${minHeight}px` }"
  ></div>
</template>
