<script setup lang="ts">
import {
  Bold,
  Code2,
  FileText,
  Heading1,
  Eye,
  EyeOff,
  Image,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Quote,
  Redo2,
  Table2,
  Undo2,
} from "@lucide/vue";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import * as monaco from "monaco-editor/editor/editor.api.js";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import "monaco-editor/languages/definitions/markdown/register.js";
import { useWorkspaceStore } from "@/stores/workspace";

interface MonacoWorkerEnvironment {
  getWorker(moduleId: string, label: string): Worker;
}

interface TextReplacement {
  text: string;
  selectionStart?: number;
  selectionEnd?: number;
}

const monacoGlobal = globalThis as typeof globalThis & {
  MonacoEnvironment?: MonacoWorkerEnvironment;
};

monacoGlobal.MonacoEnvironment ??= {
  getWorker: () => new EditorWorker(),
};

const store = useWorkspaceStore();
const editorMount = ref<HTMLDivElement | null>(null);
const imageInput = ref<HTMLInputElement | null>(null);
const remoteImageInput = ref<HTMLInputElement | null>(null);
const dragDepth = ref(0);
const importingImages = ref(false);
const remoteImageDialogOpen = ref(false);
const remoteImageUrl = ref("");
const toolbarDisabled = computed(
  () => !store.activePath || importingImages.value,
);
const isDraggingImage = computed(
  () => dragDepth.value > 0 && Boolean(store.activePath),
);
const isFullscreen = computed(() => store.fullscreenPane !== null);

function togglePreview(): void {
  void store.updatePreferences({
    previewEnabled: !store.preferences.previewEnabled,
  });
}

function toggleFullscreen(): void {
  if (store.fullscreenPane) {
    store.fullscreenPane = null;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    }
    return;
  }
  store.toggleFullscreen(
    store.preferences.previewEnabled ? "workspace" : "editor",
  );
  const workspace = document.querySelector<HTMLElement>(".workspace-shell");
  if (workspace?.requestFullscreen) {
    void workspace.requestFullscreen().catch(() => undefined);
  }
}

let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null;
let syncingFromStore = false;
let syncingScroll = false;
const editorDisposables: Array<{ dispose(): void }> = [];

const EDITOR_LIGHT_THEME = "markdown-light";
const EDITOR_DARK_THEME = "markdown-dark";

function editorThemeName(theme: "light" | "dark"): string {
  return theme === "dark" ? EDITOR_DARK_THEME : EDITOR_LIGHT_THEME;
}

function registerEditorThemes(): void {
  monaco.editor.defineTheme(EDITOR_LIGHT_THEME, {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#ffffff",
      "editorGutter.background": "#ffffff",
      "editor.lineHighlightBackground": "#f9fafb",
    },
  });
  monaco.editor.defineTheme(EDITOR_DARK_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#171b22",
      "editorGutter.background": "#171b22",
      "editor.lineHighlightBackground": "#1d222b",
      "editorIndentGuide.background1": "#2b313b",
      "editorIndentGuide.activeBackground1": "#3a424f",
    },
  });
}

function editorOptions(): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    ariaLabel: "Markdown 编辑器",
    automaticLayout: true,
    bracketPairColorization: { enabled: false },
    cursorBlinking: "smooth",
    cursorSmoothCaretAnimation: "on",
    fontFamily:
      '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
    fontLigatures: true,
    fontSize: store.preferences.editorFontSize,
    language: "markdown",
    lineNumbers: store.preferences.lineNumbers ? "on" : "off",
    minimap: { enabled: false },
    padding: { bottom: 24, top: 18 },
    readOnly: !store.activePath,
    renderLineHighlight: "line",
    renderWhitespace: "selection",
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    stickyScroll: { enabled: false },
    tabSize: 2,
    theme: editorThemeName(store.resolvedTheme),
    value: store.activeContent,
    wordWrap: store.preferences.wordWrap ? "on" : "off",
    wrappingIndent: "indent",
  };
}

function syncEditorFromStore(): void {
  const editor = editorInstance;
  const model = editor?.getModel();
  if (!editor || !model) {
    return;
  }

  editor.updateOptions({ readOnly: !store.activePath });
  if (model.getValue() === store.activeContent) {
    return;
  }

  syncingFromStore = true;
  editor.setValue(store.activeContent);
  const lineNumber = Math.min(
    Math.max(store.cursorLine, 1),
    model.getLineCount(),
  );
  const column = Math.min(
    Math.max(store.cursorColumn, 1),
    model.getLineMaxColumn(lineNumber),
  );
  editor.setPosition({ column, lineNumber });
  editor.revealPositionInCenterIfOutsideViewport({ column, lineNumber });
  syncingFromStore = false;
}

function replaceSelection(
  createReplacement: (selectedText: string) => TextReplacement,
): void {
  const editor = editorInstance;
  const model = editor?.getModel();
  const selection = editor?.getSelection();
  if (!editor || !model || !selection || toolbarDisabled.value) {
    return;
  }

  const selectedText = model.getValueInRange(selection);
  const replacement = createReplacement(selectedText);
  const startOffset = model.getOffsetAt(selection.getStartPosition());
  const selectionStart = replacement.selectionStart ?? replacement.text.length;
  const selectionEnd = replacement.selectionEnd ?? selectionStart;

  editor.pushUndoStop();
  editor.executeEdits("markdown-toolbar", [
    {
      forceMoveMarkers: true,
      range: selection,
      text: replacement.text,
    },
  ]);
  editor.pushUndoStop();

  const start = model.getPositionAt(startOffset + selectionStart);
  const end = model.getPositionAt(startOffset + selectionEnd);
  editor.setSelection(
    new monaco.Selection(
      start.lineNumber,
      start.column,
      end.lineNumber,
      end.column,
    ),
  );
  editor.revealPositionInCenterIfOutsideViewport(end);
  editor.focus();
}

function wrapSelection(
  before: string,
  after: string,
  placeholder: string,
): void {
  replaceSelection((selectedText) => {
    const content = selectedText || placeholder;
    return {
      text: `${before}${content}${after}`,
      selectionEnd: before.length + content.length,
      selectionStart: before.length,
    };
  });
}

function selectedLineRange(
  editor: monaco.editor.IStandaloneCodeEditor,
  model: monaco.editor.ITextModel,
): monaco.Range | null {
  const selection = editor.getSelection();
  if (!selection) {
    return null;
  }

  const endLineNumber =
    selection.endColumn === 1 &&
    selection.endLineNumber > selection.startLineNumber
      ? selection.endLineNumber - 1
      : selection.endLineNumber;

  return new monaco.Range(
    selection.startLineNumber,
    1,
    endLineNumber,
    model.getLineMaxColumn(endLineNumber),
  );
}

function transformSelectedLines(
  transform: (lines: string[]) => string[],
): void {
  const editor = editorInstance;
  const model = editor?.getModel();
  if (!editor || !model || toolbarDisabled.value) {
    return;
  }

  const range = selectedLineRange(editor, model);
  if (!range) {
    return;
  }

  const startOffset = model.getOffsetAt(range.getStartPosition());
  const replacement = transform(model.getValueInRange(range).split("\n")).join(
    "\n",
  );

  editor.pushUndoStop();
  editor.executeEdits("markdown-toolbar", [
    {
      forceMoveMarkers: true,
      range,
      text: replacement,
    },
  ]);
  editor.pushUndoStop();

  const end = model.getPositionAt(startOffset + replacement.length);
  editor.setSelection(
    new monaco.Selection(range.startLineNumber, 1, end.lineNumber, end.column),
  );
  editor.revealPositionInCenterIfOutsideViewport(end);
  editor.focus();
}

function toggleHeading(): void {
  transformSelectedLines((lines) => {
    const allHeadings = lines.every((line) => /^\s{0,3}#\s+/u.test(line));
    return lines.map((line) => {
      if (allHeadings) {
        return line.replace(/^(\s{0,3})#\s+/u, "$1");
      }
      return `# ${line.replace(/^\s{0,3}#{1,6}\s+/u, "")}`;
    });
  });
}

function toggleQuote(): void {
  transformSelectedLines((lines) => {
    const allQuoted = lines.every((line) => /^\s*>\s?/u.test(line));
    return lines.map((line) =>
      allQuoted ? line.replace(/^(\s*)>\s?/u, "$1") : `> ${line}`,
    );
  });
}

function toggleUnorderedList(): void {
  transformSelectedLines((lines) => {
    const allListItems = lines.every((line) => /^\s*[-+*]\s+/u.test(line));
    return lines.map((line) =>
      allListItems ? line.replace(/^(\s*)[-+*]\s+/u, "$1") : `- ${line}`,
    );
  });
}

function toggleOrderedList(): void {
  transformSelectedLines((lines) => {
    const allListItems = lines.every((line) => /^\s*\d+\.\s+/u.test(line));
    return lines.map((line, index) =>
      allListItems
        ? line.replace(/^(\s*)\d+\.\s+/u, "$1")
        : `${index + 1}. ${line}`,
    );
  });
}

function insertCode(): void {
  replaceSelection((selectedText) => {
    if (selectedText.includes("\n")) {
      return {
        text: `\`\`\`\n${selectedText}\n\`\`\``,
        selectionEnd: 4 + selectedText.length,
        selectionStart: 4,
      };
    }
    const content = selectedText || "代码";
    return {
      text: `\`${content}\``,
      selectionEnd: 1 + content.length,
      selectionStart: 1,
    };
  });
}

function insertLink(): void {
  replaceSelection((selectedText) => {
    const label = selectedText || "链接文字";
    const destination = "https://";
    const destinationStart = label.length + 3;
    return {
      text: `[${label}](${destination})`,
      selectionEnd: selectedText
        ? destinationStart + destination.length
        : 1 + label.length,
      selectionStart: selectedText ? destinationStart : 1,
    };
  });
}

function insertTable(): void {
  replaceSelection(() => {
    const table =
      "| 列 1 | 列 2 | 列 3 |\n" +
      "| --- | --- | --- |\n" +
      "| 内容 | 内容 | 内容 |";
    return {
      text: table,
      selectionEnd: 5,
      selectionStart: 2,
    };
  });
}

function triggerEditorCommand(command: "undo" | "redo"): void {
  if (!editorInstance || toolbarDisabled.value) {
    return;
  }
  editorInstance.trigger("markdown-toolbar", command, null);
  editorInstance.focus();
}

function openImagePicker(): void {
  if (!toolbarDisabled.value) {
    imageInput.value?.click();
  }
}

function openRemoteImageDialog(): void {
  if (toolbarDisabled.value) {
    return;
  }
  remoteImageUrl.value = "";
  remoteImageDialogOpen.value = true;
  void nextTick(() => remoteImageInput.value?.focus());
}

function closeRemoteImageDialog(): void {
  remoteImageDialogOpen.value = false;
  remoteImageUrl.value = "";
}

function insertRemoteImage(): void {
  const source = remoteImageUrl.value.trim();
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    store.notify("error", "图片地址无效", "请输入完整的 HTTPS 图片地址。");
    return;
  }
  if (url.protocol !== "https:") {
    store.notify("error", "图片地址无效", "仅支持 HTTPS 图片地址。");
    return;
  }

  insertImageReferences([`![在线图片](${markdownImagePath(url.href)})`]);
  closeRemoteImageDialog();
}

function imageAltText(file: File): string {
  return (
    file.name
      .replace(/\.[^.]+$/u, "")
      .replace(/([\\\]])/gu, "\\$1")
      .trim() || "图片"
  );
}

function markdownImagePath(path: string): string {
  return path.replace(/([\\()])/gu, "\\$1");
}

function insertImageReferences(references: string[]): void {
  if (!references.length) {
    return;
  }

  const editor = editorInstance;
  const model = editor?.getModel();
  const selection = editor?.getSelection();
  if (!editor || !model || !selection) {
    return;
  }

  const before =
    selection.startColumn > 1 || model.getValueInRange(selection) ? "\n\n" : "";
  const after =
    selection.endColumn < model.getLineMaxColumn(selection.endLineNumber)
      ? "\n\n"
      : "";
  const content = `${before}${references.join("\n\n")}${after}`;
  const startOffset = model.getOffsetAt(selection.getStartPosition());

  editor.pushUndoStop();
  editor.executeEdits("markdown-image-import", [
    {
      forceMoveMarkers: true,
      range: selection,
      text: content,
    },
  ]);
  editor.pushUndoStop();

  const end = model.getPositionAt(startOffset + content.length);
  editor.setPosition(end);
  editor.revealPositionInCenterIfOutsideViewport(end);
  editor.focus();
}

async function importImages(files: readonly File[]): Promise<void> {
  if (!store.activePath || !files.length || importingImages.value) {
    return;
  }

  importingImages.value = true;
  const references: string[] = [];
  try {
    for (const file of files) {
      const relativePath = await store.saveImageAsset(file);
      if (relativePath) {
        references.push(
          `![${imageAltText(file)}](${markdownImagePath(relativePath)})`,
        );
      }
    }
    insertImageReferences(references);
  } finally {
    importingImages.value = false;
  }
}

function onImageInput(event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  void importImages(files);
}

function onPaste(event: ClipboardEvent): void {
  const files = Array.from(event.clipboardData?.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);

  if (!files.length) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  void importImages(files);
}

function containsFiles(dataTransfer: DataTransfer | null): boolean {
  return Boolean(
    dataTransfer && Array.from(dataTransfer.types).includes("Files"),
  );
}

function onDragEnter(event: DragEvent): void {
  if (!containsFiles(event.dataTransfer)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  dragDepth.value += 1;
}

function onDragOver(event: DragEvent): void {
  if (!containsFiles(event.dataTransfer)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
}

function onDragLeave(event: DragEvent): void {
  if (dragDepth.value === 0) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  dragDepth.value = Math.max(0, dragDepth.value - 1);
}

function onDrop(event: DragEvent): void {
  dragDepth.value = 0;
  if (!containsFiles(event.dataTransfer)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  void importImages(Array.from(event.dataTransfer?.files ?? []));
}

function handlePreviewScroll(event: Event): void {
  if (!store.preferences.syncScroll || !editorInstance) {
    return;
  }
  const ratio = (event as CustomEvent<number>).detail;
  if (!Number.isFinite(ratio)) {
    return;
  }
  const editor = editorInstance;
  const maximum = editor.getScrollHeight() - editor.getLayoutInfo().height;
  syncingScroll = true;
  editor.setScrollTop(Math.max(0, maximum) * Math.min(1, Math.max(0, ratio)));
  globalThis.requestAnimationFrame(() => {
    syncingScroll = false;
  });
}

onMounted(() => {
  if (!editorMount.value) {
    return;
  }

  registerEditorThemes();
  editorInstance = monaco.editor.create(editorMount.value, editorOptions());
  editorInstance.addCommand(
    monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
    () => void store.saveActiveDocument(),
  );

  editorDisposables.push(
    editorInstance.onDidChangeModelContent(() => {
      if (!syncingFromStore && editorInstance) {
        store.updateContent(editorInstance.getValue());
      }
    }),
    editorInstance.onDidChangeCursorPosition(({ position }) => {
      store.setCursor(position.lineNumber, position.column);
    }),
    editorInstance.onDidScrollChange(({ scrollTopChanged }) => {
      if (
        !scrollTopChanged ||
        syncingScroll ||
        !store.preferences.syncScroll ||
        !editorInstance
      ) {
        return;
      }
      const maximum =
        editorInstance.getScrollHeight() -
        editorInstance.getLayoutInfo().height;
      if (maximum <= 0) {
        return;
      }
      globalThis.dispatchEvent(
        new CustomEvent("markdown-editor-scroll", {
          detail: editorInstance.getScrollTop() / maximum,
        }),
      );
    }),
  );
  globalThis.addEventListener("markdown-preview-scroll", handlePreviewScroll);
});

watch(
  [() => store.activePath, () => store.activeContent],
  () => syncEditorFromStore(),
  { flush: "post" },
);

watch(
  () => store.resolvedTheme,
  (theme) => {
    monaco.editor.setTheme(editorThemeName(theme));
  },
);

watch(
  () =>
    [
      store.preferences.editorFontSize,
      store.preferences.lineNumbers,
      store.preferences.wordWrap,
    ] as const,
  ([fontSize, lineNumbers, wordWrap]) => {
    editorInstance?.updateOptions({
      fontSize,
      lineNumbers: lineNumbers ? "on" : "off",
      wordWrap: wordWrap ? "on" : "off",
    });
  },
);

onBeforeUnmount(() => {
  globalThis.removeEventListener(
    "markdown-preview-scroll",
    handlePreviewScroll,
  );
  editorDisposables.forEach((disposable) => disposable.dispose());
  editorDisposables.length = 0;
  editorInstance?.dispose();
  editorInstance = null;
});
</script>

<template>
  <section class="editor-pane" aria-label="Markdown 编辑区">
    <div class="editor-tabbar">
      <div class="editor-tab" :title="store.activePath || '未打开文档'">
        <FileText :size="16" aria-hidden="true" />
        <span class="editor-tab__name">
          {{ store.activeName || "未打开文档" }}
        </span>
        <span
          v-if="store.saveState === 'dirty' || store.saveState === 'error'"
          class="editor-tab__dirty"
          aria-label="有未保存更改"
        />
      </div>
    </div>

    <div class="format-toolbar" role="toolbar" aria-label="Markdown 格式工具">
      <button
        class="toolbar-button"
        type="button"
        title="撤销"
        aria-label="撤销"
        :disabled="toolbarDisabled"
        @mousedown.prevent
        @click="triggerEditorCommand('undo')"
      >
        <Undo2 aria-hidden="true" />
      </button>
      <button
        class="toolbar-button"
        type="button"
        title="重做"
        aria-label="重做"
        :disabled="toolbarDisabled"
        @mousedown.prevent
        @click="triggerEditorCommand('redo')"
      >
        <Redo2 aria-hidden="true" />
      </button>

      <span class="toolbar-divider" aria-hidden="true" />

      <button
        class="toolbar-button"
        type="button"
        title="一级标题"
        aria-label="一级标题"
        :disabled="toolbarDisabled"
        @mousedown.prevent
        @click="toggleHeading"
      >
        <Heading1 aria-hidden="true" />
      </button>
      <button
        class="toolbar-button"
        type="button"
        title="加粗"
        aria-label="加粗"
        :disabled="toolbarDisabled"
        @mousedown.prevent
        @click="wrapSelection('**', '**', '粗体文字')"
      >
        <Bold aria-hidden="true" />
      </button>
      <button
        class="toolbar-button"
        type="button"
        title="斜体"
        aria-label="斜体"
        :disabled="toolbarDisabled"
        @mousedown.prevent
        @click="wrapSelection('*', '*', '斜体文字')"
      >
        <Italic aria-hidden="true" />
      </button>

      <span class="toolbar-divider" aria-hidden="true" />

      <button
        class="toolbar-button"
        type="button"
        title="引用"
        aria-label="引用"
        :disabled="toolbarDisabled"
        @mousedown.prevent
        @click="toggleQuote"
      >
        <Quote aria-hidden="true" />
      </button>
      <button
        class="toolbar-button"
        type="button"
        title="无序列表"
        aria-label="无序列表"
        :disabled="toolbarDisabled"
        @mousedown.prevent
        @click="toggleUnorderedList"
      >
        <List aria-hidden="true" />
      </button>
      <button
        class="toolbar-button"
        type="button"
        title="有序列表"
        aria-label="有序列表"
        :disabled="toolbarDisabled"
        @mousedown.prevent
        @click="toggleOrderedList"
      >
        <ListOrdered aria-hidden="true" />
      </button>
      <button
        class="toolbar-button"
        type="button"
        title="插入表格"
        aria-label="插入表格"
        :disabled="toolbarDisabled"
        @mousedown.prevent
        @click="insertTable"
      >
        <Table2 aria-hidden="true" />
      </button>

      <span class="toolbar-divider" aria-hidden="true" />

      <button
        class="toolbar-button"
        type="button"
        title="行内代码或代码块"
        aria-label="行内代码或代码块"
        :disabled="toolbarDisabled"
        @mousedown.prevent
        @click="insertCode"
      >
        <Code2 aria-hidden="true" />
      </button>
      <button
        class="toolbar-button"
        type="button"
        title="插入链接"
        aria-label="插入链接"
        :disabled="toolbarDisabled"
        @mousedown.prevent
        @click="insertLink"
      >
        <Link2 aria-hidden="true" />
      </button>
      <button
        class="toolbar-button"
        type="button"
        :title="importingImages ? '正在保存图片…' : '插入本地图片'"
        aria-label="插入本地图片"
        :disabled="toolbarDisabled"
        @mousedown.prevent
        @click="openImagePicker"
      >
        <Image aria-hidden="true" />
      </button>
      <button
        class="toolbar-button"
        type="button"
        title="添加线上图片地址"
        aria-label="添加线上图片地址"
        :disabled="toolbarDisabled"
        @mousedown.prevent
        @click="openRemoteImageDialog"
      >
        <ImagePlus aria-hidden="true" />
      </button>
      <button
        class="toolbar-button"
        type="button"
        :title="
          store.preferences.previewEnabled
            ? '实时预览已开启，点击关闭'
            : '实时预览已关闭，点击开启'
        "
        :aria-label="
          store.preferences.previewEnabled ? '关闭实时预览' : '显示实时预览'
        "
        @mousedown.prevent
        @click="togglePreview"
      >
        <Eye v-if="store.preferences.previewEnabled" aria-hidden="true" />
        <EyeOff v-else aria-hidden="true" />
      </button>
      <button
        class="toolbar-button"
        type="button"
        :title="isFullscreen ? '退出全屏' : '全屏'"
        :aria-label="isFullscreen ? '退出全屏' : '全屏'"
        @mousedown.prevent
        @click="toggleFullscreen"
      >
        <Minimize2 v-if="isFullscreen" aria-hidden="true" />
        <Maximize2 v-else aria-hidden="true" />
      </button>
    </div>

    <div
      class="editor-host"
      @paste.capture="onPaste"
      @dragenter.capture="onDragEnter"
      @dragover.capture="onDragOver"
      @dragleave.capture="onDragLeave"
      @drop.capture="onDrop"
    >
      <div ref="editorMount" class="editor-host__mount" />
      <div v-if="isDraggingImage" class="editor-drop-overlay">
        松开即可保存到 assets 并插入 Markdown 引用
      </div>
      <input
        ref="imageInput"
        hidden
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        @change="onImageInput"
      />
    </div>

    <Teleport to="body">
      <div
        v-if="remoteImageDialogOpen"
        class="modal-backdrop"
        role="presentation"
        @mousedown.self="closeRemoteImageDialog"
      >
        <form
          class="modal remote-image-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remote-image-dialog-title"
          @submit.prevent="insertRemoteImage"
        >
          <header class="modal__header">
            <h2 id="remote-image-dialog-title">添加线上图片</h2>
          </header>
          <div class="modal__body">
            <p class="remote-image-dialog__hint">
              请输入图片地址。预览时，浏览器会直接向图片来源请求资源。
            </p>
            <label class="field">
              <span class="sr-only">图片地址</span>
              <input
                ref="remoteImageInput"
                v-model="remoteImageUrl"
                type="url"
                inputmode="url"
                autocomplete="url"
                placeholder="https://example.com/image.png"
              />
            </label>
          </div>
          <footer class="modal__footer">
            <button
              class="secondary-button button--small"
              type="button"
              @click="closeRemoteImageDialog"
            >
              取消
            </button>
            <button
              class="primary-button button--small"
              type="submit"
              :disabled="!remoteImageUrl.trim()"
            >
              添加图片
            </button>
          </footer>
        </form>
      </div>
    </Teleport>
  </section>
</template>
