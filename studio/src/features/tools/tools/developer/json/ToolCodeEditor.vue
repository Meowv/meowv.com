<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch, type ComponentPublicInstance } from 'vue';
import type { editor as MonacoEditor, IDisposable as MonacoDisposable } from 'monaco-editor';
import { toolsBackgroundPreviewActive } from '@/core/shared/route-state';

type MonacoRuntime = typeof import('monaco-editor');

interface MonacoWorkerEnvironment {
  getWorker(moduleId: string, label: string): Worker;
}

// monaco 本体、它的 worker 与语言贡献加起来是 MB 级产物，静态 import 会把它们钉进工具 chunk 的
// 首屏关键路径。改成挂载前 await 一次：只有真正要建编辑器时才下载。
let monaco!: MonacoRuntime;
let monacoLoading: Promise<MonacoRuntime> | null = null;

function loadMonaco(): Promise<MonacoRuntime> {
  monacoLoading ??= (async () => {
    const [runtime, { default: EditorWorker }, { default: JsonWorker }] = await Promise.all([
      import('monaco-editor'),
      import('monaco-editor/editor/editor.worker.js?worker'),
      import('monaco-editor/language/json/json.worker.js?worker'),
      import('monaco-editor/language/json/monaco.contribution.js'),
    ]);
    const monacoGlobal = globalThis as typeof globalThis & {
      MonacoEnvironment?: MonacoWorkerEnvironment;
    };
    monacoGlobal.MonacoEnvironment ??= {
      getWorker: (_moduleId, label) => (label === 'json' ? new JsonWorker() : new EditorWorker()),
    };
    monaco = runtime;
    return runtime;
  })();
  return monacoLoading;
}

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
let editor: MonacoEditor.IStandaloneCodeEditor | null = null;
let contentDisposable: MonacoDisposable | null = null;
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

onMounted(async () => {
  if (!mountElement) return;
  await loadMonaco();
  // 加载期间组件可能已卸载，此时模板 ref 已被置空，不能往脱离文档的节点上建编辑器。
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

watch(toolsBackgroundPreviewActive, () => {
  if (monaco) monaco.editor.setTheme(resolveTheme());
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
