<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch, type ComponentPublicInstance } from 'vue';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import 'monaco-editor/basic-languages/monaco.contribution.js';
import { toolsBackgroundPreviewActive } from '@/core/shared/route-state';

interface MonacoWorkerEnvironment {
  getWorker(moduleId: string, label: string): Worker;
}

const model = defineModel<string>({ required: true });
const emit = defineEmits<{ run: [] }>();
const props = withDefaults(defineProps<{ label?: string }>(), { label: 'SQL 编辑器' });
const monacoGlobal = globalThis as typeof globalThis & {
  MonacoEnvironment?: MonacoWorkerEnvironment;
};

let mountElement: HTMLDivElement | null = null;
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let contentDisposable: monaco.IDisposable | null = null;
let observer: MutationObserver | null = null;
let syncing = false;

function setMountElement(element: Element | ComponentPublicInstance | null): void {
  mountElement = element instanceof HTMLDivElement ? element : null;
}

function theme(): string {
  if (toolsBackgroundPreviewActive.value) {
    return document.documentElement.dataset.theme === 'dark'
      ? 'studio-sql-dark-background-preview'
      : 'studio-sql-light-background-preview';
  }
  return document.documentElement.dataset.theme === 'dark' ? 'studio-sql-dark' : 'studio-sql-light';
}

function registerThemes(): void {
  monaco.editor.defineTheme('studio-sql-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: { 'editor.background': '#ffffff', 'editorGutter.background': '#f8f9fb' },
  });
  monaco.editor.defineTheme('studio-sql-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: { 'editor.background': '#171b22', 'editorGutter.background': '#141820' },
  });
  monaco.editor.defineTheme('studio-sql-light-background-preview', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff00',
      'editorGutter.background': '#ffffff00',
      'editor.lineHighlightBackground': '#ffffff24',
    },
  });
  monaco.editor.defineTheme('studio-sql-dark-background-preview', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#171b2200',
      'editorGutter.background': '#171b2200',
      'editor.lineHighlightBackground': '#00000030',
    },
  });
}

function run(): void {
  emit('run');
}

defineExpose({ focus: () => editor?.focus(), run });

onMounted(() => {
  if (!mountElement) return;
  monacoGlobal.MonacoEnvironment ??= { getWorker: () => new EditorWorker() };
  registerThemes();
  editor = monaco.editor.create(mountElement, {
    ariaLabel: props.label,
    automaticLayout: true,
    bracketPairColorization: { enabled: true },
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
    fontSize: 13,
    language: 'sql',
    lineNumbersMinChars: 3,
    minimap: { enabled: false },
    padding: { top: 12, bottom: 12 },
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    tabSize: 2,
    theme: theme(),
    value: model.value,
    wordWrap: 'on',
  });
  contentDisposable = editor.onDidChangeModelContent(() => {
    if (!syncing && editor) model.value = editor.getValue();
  });
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run);
  observer = new MutationObserver(() => monaco.editor.setTheme(theme()));
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
});

watch(toolsBackgroundPreviewActive, () => monaco.editor.setTheme(theme()));

watch(model, (value) => {
  if (!editor || editor.getValue() === value) return;
  syncing = true;
  editor.setValue(value);
  syncing = false;
});

onBeforeUnmount(() => {
  contentDisposable?.dispose();
  editor?.dispose();
  observer?.disconnect();
});
</script>

<template>
  <div :ref="setMountElement" class="sqlite-sql-editor"></div>
</template>

<style scoped>
.sqlite-sql-editor {
  height: 100%;
  min-height: 260px;
}
</style>
