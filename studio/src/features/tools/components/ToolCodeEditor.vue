<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch, type ComponentPublicInstance } from 'vue';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import 'monaco-editor/language/json/monaco.contribution.js';

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
const props = withDefaults(
  defineProps<{
    language?: string;
    readOnly?: boolean;
    wordWrap?: boolean;
    label: string;
    minHeight?: number;
  }>(),
  {
    language: 'plaintext',
    readOnly: false,
    wordWrap: true,
    minHeight: 350,
  },
);

let mountElement: HTMLDivElement | null = null;
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let contentDisposable: monaco.IDisposable | null = null;
let themeObserver: MutationObserver | null = null;
let syncing = false;

function resolveTheme(): string {
  return document.documentElement.dataset.theme === 'dark' ? 'studio-tools-dark' : 'studio-tools-light';
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
}

function mountEditor(element: Element | ComponentPublicInstance | null): void {
  mountElement = element instanceof HTMLDivElement ? element : null;
}

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
    folding: true,
    language: props.language,
    lineNumbers: 'on',
    minimap: { enabled: false },
    padding: { bottom: 14, top: 10 },
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
  themeObserver = new MutationObserver(() => monaco.editor.setTheme(resolveTheme()));
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
});

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

onBeforeUnmount(() => {
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
