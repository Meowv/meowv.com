<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import BookWelcome from './components/BookWelcome.vue';
import LoadingBook from './components/LoadingBook.vue';
import ReaderControls from './components/ReaderControls.vue';
import { BookEngine } from './engine/BookEngine';
import { BookStateMachine } from './engine/BookStateMachine';
import { createBookFingerprint } from './persistence/BookFingerprint';
import { rememberRecentBook, restoreRecentBook } from './persistence/RecentBook';
import { loadReadingProgress, saveReadingProgress } from './persistence/ReadingProgress';
import { PdfPageProvider } from './publication/pdf/PdfPageProvider';
import type { BookState, TurnDirection } from './types/reader';
import './books.css';

type BookOpenPicker = (options?: {
  multiple?: boolean;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}) => Promise<FileSystemFileHandle[]>;

type HandleDropItem = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
};

const root = ref<HTMLElement | null>(null);
const canvasHost = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const state = ref<BookState>('EMPTY');
const readerMounted = ref(false);
const readerReady = ref(false);
const dragging = ref(false);
const uiHidden = ref(false);
const fullscreen = ref(false);
const errorMessage = ref('');
const pageCount = ref(0);
const spreadIndex = ref(0);
const canGoForward = ref(false);
const canGoBack = ref(false);
const showReaderTip = ref(false);
const pagePreparing = ref(false);
const pageStateMachine = new BookStateMachine();
pageStateMachine.subscribe((snapshot) => {
  state.value = snapshot.state;
});

let engine: BookEngine | null = null;
let unsubscribeEngine: (() => void) | null = null;
let loadController: AbortController | null = null;
let bookId = '';
let operationId = 0;
let restoreId = 0;
let dragDepth = 0;
let hideTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let tipTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let hideAt = 0;

const READER_TIP_KEY = 'meowv-studio:books:reader-tip:v2';

const bookClosed = computed(() => state.value === 'CLOSED');
const bookOpen = computed(() => state.value === 'OPEN');
const currentPage = computed(() => {
  if (pageCount.value < 1) return 0;
  return spreadIndex.value === 0 ? 1 : Math.min(pageCount.value, spreadIndex.value * 2);
});

function clearHideTimer(): void {
  if (!hideTimer) return;
  globalThis.clearTimeout(hideTimer);
  hideTimer = null;
  hideAt = 0;
}

function scheduleUiHide(): void {
  if (state.value !== 'OPEN' && state.value !== 'CLOSED') return;
  hideAt = performance.now() + 2600;
  if (hideTimer) return;
  const check = (): void => {
    const remaining = hideAt - performance.now();
    if (remaining > 0) {
      hideTimer = globalThis.setTimeout(check, remaining);
      return;
    }
    hideTimer = null;
    hideAt = 0;
    if (!document.hidden) uiHidden.value = true;
  };
  hideTimer = globalThis.setTimeout(check, 2600);
}

function revealUi(): void {
  if (uiHidden.value) uiHidden.value = false;
  scheduleUiHide();
}

function showReaderTipOnce(): void {
  if (showReaderTip.value || tipTimer) return;
  try {
    if (localStorage.getItem(READER_TIP_KEY) === 'true') return;
    localStorage.setItem(READER_TIP_KEY, 'true');
  } catch {
    // 本地偏好不可用时，当前页面内仍只展示一次。
  }
  showReaderTip.value = true;
  tipTimer = globalThis.setTimeout(() => {
    showReaderTip.value = false;
    tipTimer = null;
  }, 5200);
}

function syncEngineSnapshot(): void {
  if (!engine) return;
  const snapshot = engine.snapshot;
  state.value = snapshot.state;
  pageCount.value = snapshot.pageCount;
  spreadIndex.value = snapshot.spreadIndex;
  canGoForward.value = engine.canGoForward;
  canGoBack.value = engine.canGoBackward;
}

async function disposeReader(): Promise<void> {
  clearHideTimer();
  loadController?.abort();
  loadController = null;
  unsubscribeEngine?.();
  unsubscribeEngine = null;
  const activeEngine = engine;
  engine = null;
  await activeEngine?.dispose().catch(() => undefined);
  bookId = '';
}

async function returnHome(message = ''): Promise<void> {
  const currentOperation = ++operationId;
  await disposeReader();
  if (currentOperation !== operationId) return;
  if (pageStateMachine.state !== 'EMPTY' && pageStateMachine.canTransition('EMPTY')) {
    pageStateMachine.transition('EMPTY');
  }
  readerReady.value = false;
  readerMounted.value = false;
  pageCount.value = 0;
  spreadIndex.value = 0;
  canGoForward.value = false;
  canGoBack.value = false;
  showReaderTip.value = false;
  pagePreparing.value = false;
  uiHidden.value = false;
  errorMessage.value = message;
}

function pdfErrorMessage(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === 'AbortError') return '';
  if (reason instanceof Error) {
    if (reason.name === 'PasswordException') return '暂不支持受密码保护的 PDF。';
    if (reason.name === 'InvalidPDFException') return '这份 PDF 已损坏或格式不受支持。';
  }
  return '无法打开这份 PDF，请确认文件完整后再试。';
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

async function openFile(file: File, handle?: FileSystemFileHandle): Promise<void> {
  if (!isPdf(file)) {
    errorMessage.value = '请选择 PDF 文件。';
    return;
  }

  restoreId += 1;
  const currentOperation = ++operationId;
  await disposeReader();
  if (currentOperation !== operationId) return;

  try {
    if (pageStateMachine.state !== 'EMPTY') {
      if (pageStateMachine.canTransition('EMPTY')) pageStateMachine.transition('EMPTY');
      else throw new Error('页面状态尚未完成清理。');
    }
    pageStateMachine.transition('LOADING');
  } catch {
    await returnHome('当前书籍尚未完成清理，请刷新页面后重试。');
    return;
  }
  errorMessage.value = '';
  readerMounted.value = true;
  readerReady.value = false;
  uiHidden.value = false;
  await nextTick();

  const host = canvasHost.value;
  if (!host) {
    await returnHome('无法创建仿真书画布，请刷新页面后重试。');
    return;
  }

  const controller = new AbortController();
  loadController = controller;
  let orphanProvider: PdfPageProvider | null = null;

  try {
    const fingerprint = await createBookFingerprint(file);
    if (currentOperation !== operationId) return;
    orphanProvider = await PdfPageProvider.open(file, { signal: controller.signal });
    if (currentOperation !== operationId) {
      await orphanProvider.dispose();
      return;
    }

    const provider = orphanProvider;
    const restoredProgress = loadReadingProgress(fingerprint);
    const instance = new BookEngine(host, {
      onError: (error) => {
        if (currentOperation === operationId) void returnHome(pdfErrorMessage(error));
      },
      onPagePreparationChange: (preparing) => {
        if (currentOperation === operationId && engine === instance) {
          pagePreparing.value = preparing;
        }
      },
    });
    engine = instance;
    orphanProvider = null;
    bookId = fingerprint;
    unsubscribeEngine = instance.subscribe((snapshot, previousSnapshot) => {
      if (currentOperation !== operationId) return;
      syncEngineSnapshot();
      if (snapshot.state === 'OPEN' && previousSnapshot.state === 'TURNING' && bookId) {
        try {
          saveReadingProgress(bookId, snapshot.spreadIndex);
        } catch {
          // 隐私模式或存储配额不足时，阅读本身仍应继续工作。
        }
      }
      scheduleUiHide();
    });

    await instance.load(provider, restoredProgress?.spreadIndex ?? 0);
    if (currentOperation !== operationId) return;
    syncEngineSnapshot();
    readerReady.value = true;
    void rememberRecentBook({ file, fingerprint, ...(handle ? { handle } : {}) });
    showReaderTipOnce();
    scheduleUiHide();
  } catch (reason) {
    await orphanProvider?.dispose().catch(() => undefined);
    if (currentOperation !== operationId || controller.signal.aborted) return;
    await returnHome(pdfErrorMessage(reason));
  }
}

async function chooseFile(): Promise<void> {
  restoreId += 1;
  const picker = (globalThis as typeof globalThis & { showOpenFilePicker?: BookOpenPicker })
    .showOpenFilePicker;
  if (typeof picker !== 'function') {
    fileInput.value?.click();
    return;
  }
  try {
    const [handle] = await picker({
      multiple: false,
      types: [
        {
          description: 'PDF 文档',
          accept: { 'application/pdf': ['.pdf'] },
        },
      ],
    });
    if (!handle) return;
    await openFile(await handle.getFile(), handle);
  } catch (reason) {
    if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
      errorMessage.value = '无法读取所选 PDF，请重新选择。';
    }
  }
}

function onCanvasClick(): void {
  if (state.value === 'CLOSED') void openBook();
}

function onFileChange(event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) void openFile(file);
}

function onDragEnter(event: DragEvent): void {
  if (!event.dataTransfer?.types.includes('Files')) return;
  dragDepth += 1;
  dragging.value = true;
  revealUi();
}

function onDragOver(event: DragEvent): void {
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}

function onDragLeave(): void {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dragging.value = false;
}

async function onDrop(event: DragEvent): Promise<void> {
  restoreId += 1;
  dragDepth = 0;
  dragging.value = false;
  const dataTransfer = event.dataTransfer;
  const item = [...(dataTransfer?.items ?? [])].find((candidate) => {
    const file = candidate.kind === 'file' ? candidate.getAsFile() : null;
    return file ? isPdf(file) : false;
  }) as HandleDropItem | undefined;
  const fallbackFile = [...(dataTransfer?.files ?? [])].find(isPdf);
  if (!item && !fallbackFile) {
    errorMessage.value = '这里只能打开本地 PDF。';
    return;
  }

  try {
    const handle = await item?.getAsFileSystemHandle?.();
    if (handle?.kind === 'file') {
      const fileHandle = handle as FileSystemFileHandle;
      await openFile(await fileHandle.getFile(), fileHandle);
      return;
    }
  } catch {
    // 无法取得句柄时仍可用拖入的 File 完成本次阅读。
  }
  if (fallbackFile) await openFile(fallbackFile);
}

async function openBook(): Promise<void> {
  if (!engine || state.value !== 'CLOSED') return;
  const activeEngine = engine;
  revealUi();
  try {
    await activeEngine.open();
  } catch (reason) {
    if (
      !(reason instanceof DOMException && reason.name === 'AbortError') &&
      engine === activeEngine
    ) {
      await returnHome(pdfErrorMessage(reason));
    }
  }
}

async function closeBook(): Promise<void> {
  if (!engine || state.value !== 'OPEN') return;
  const activeEngine = engine;
  revealUi();
  try {
    await activeEngine.close();
  } catch (reason) {
    if (
      !(reason instanceof DOMException && reason.name === 'AbortError') &&
      engine === activeEngine
    ) {
      await returnHome(pdfErrorMessage(reason));
    }
  }
}

async function turn(direction: TurnDirection): Promise<void> {
  if (!engine || state.value !== 'OPEN') return;
  const allowed = direction === 'forward' ? engine.canGoForward : engine.canGoBackward;
  if (!allowed) return;
  revealUi();
  if (direction === 'forward') await engine.next();
  else await engine.previous();
}

async function toggleFullscreen(): Promise<void> {
  const page = root.value;
  if (!page) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await page.requestFullscreen();
  } catch {
    errorMessage.value = '当前浏览器无法进入全屏模式。';
  }
  revealUi();
}

function syncFullscreen(): void {
  fullscreen.value = document.fullscreenElement === root.value;
  revealUi();
}

function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (
    target?.matches('input, textarea, select, button, [contenteditable="true"]') ||
    !readerReady.value
  ) {
    return;
  }

  if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
    event.preventDefault();
    void turn('forward');
  } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
    event.preventDefault();
    void turn('backward');
  } else if (event.key.toLowerCase() === 'f') {
    event.preventDefault();
    void toggleFullscreen();
  } else if (event.key === 'Escape') {
    uiHidden.value = false;
    if (document.fullscreenElement) void document.exitFullscreen();
  }
}

onMounted(() => {
  globalThis.addEventListener('keydown', onKeydown);
  document.addEventListener('fullscreenchange', syncFullscreen);
  const restoreOperation = ++restoreId;
  void restoreRecentBook().then((source) => {
    if (!source || restoreOperation !== restoreId) return;
    void openFile(source.file, source.handle);
  });
});

onBeforeUnmount(() => {
  operationId += 1;
  restoreId += 1;
  globalThis.removeEventListener('keydown', onKeydown);
  document.removeEventListener('fullscreenchange', syncFullscreen);
  clearHideTimer();
  if (tipTimer) globalThis.clearTimeout(tipTimer);
  loadController?.abort();
  if (document.fullscreenElement === root.value) void document.exitFullscreen();
  void disposeReader();
});
</script>

<template>
  <main
    ref="root"
    class="books-page"
    :class="{
      'books-page--dragging': dragging,
      'books-page--ui-hidden': uiHidden,
    }"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
    @pointermove="revealUi"
    @pointerdown="revealUi"
  >
    <input
      ref="fileInput"
      class="books-file-input"
      type="file"
      accept="application/pdf,.pdf"
      aria-label="选择本地 PDF"
      @change="onFileChange"
    />

    <BookWelcome
      v-if="!readerMounted"
      :dragging="dragging"
      :error="errorMessage"
      @pick="chooseFile"
    />

    <LoadingBook v-if="state === 'LOADING'" />

    <section
      v-if="readerMounted"
      class="books-reader"
      :class="{ 'books-reader--ready': readerReady }"
      :aria-busy="state === 'LOADING'"
      aria-label="仿真书阅读器"
    >
      <div
        ref="canvasHost"
        class="books-reader__canvas"
        :class="{ 'books-reader__canvas--closed': bookClosed }"
        @click="onCanvasClick"
      ></div>
      <p v-if="readerReady && showReaderTip" class="books-reader__hint">
        点击封面打开；滚轮缩放页面；拖动纸张外侧或使用方向键翻页
      </p>
      <div v-if="readerReady && pagePreparing" class="books-reader__preparing" role="status">
        <span aria-hidden="true"></span>
        正在整理书页…
      </div>
      <p class="books-orientation-hint">横屏阅读会更舒展</p>
      <ReaderControls
        v-if="readerReady"
        :book-closed="bookClosed"
        :book-open="bookOpen"
        :can-go-back="canGoBack"
        :can-go-forward="canGoForward"
        :current-page="currentPage"
        :page-count="pageCount"
        :fullscreen="fullscreen"
        @previous="turn('backward')"
        @next="turn('forward')"
        @replace="chooseFile"
        @open="openBook"
        @close="closeBook"
        @toggle-fullscreen="toggleFullscreen"
      />
    </section>

    <div v-if="dragging && readerMounted" class="books-drop-curtain" aria-live="polite">
      <strong>松手，更换这本书</strong>
      <span>新文件仍然只在你的浏览器中处理</span>
    </div>
  </main>
</template>
