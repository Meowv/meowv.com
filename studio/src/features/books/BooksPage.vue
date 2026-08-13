<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { BookAudio } from './audio/BookAudio';
import BookWelcome from './components/BookWelcome.vue';
import LoadingBook from './components/LoadingBook.vue';
import ReaderControls from './components/ReaderControls.vue';
import { BookEngine } from './engine/BookEngine';
import { BookStateMachine } from './engine/BookStateMachine';
import { createBookFingerprint } from './persistence/BookFingerprint';
import { loadReadingProgress, saveReadingProgress } from './persistence/ReadingProgress';
import { PdfPageProvider } from './publication/pdf/PdfPageProvider';
import type { BookState, TurnDirection } from './types/reader';
import './books.css';

const root = ref<HTMLElement | null>(null);
const canvasHost = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const state = ref<BookState>('EMPTY');
const readerMounted = ref(false);
const readerReady = ref(false);
const dragging = ref(false);
const uiHidden = ref(false);
const fullscreen = ref(false);
const soundEnabled = ref(true);
const errorMessage = ref('');
const pageCount = ref(0);
const spreadIndex = ref(0);
const canGoForward = ref(false);
const canGoBack = ref(false);
const zoomPercent = ref(100);
const canZoomIn = ref(true);
const canZoomOut = ref(false);
const pageStateMachine = new BookStateMachine();
pageStateMachine.subscribe((snapshot) => {
  state.value = snapshot.state;
});

const audio = new BookAudio({ enabled: soundEnabled.value });
let engine: BookEngine | null = null;
let unsubscribeEngine: (() => void) | null = null;
let loadController: AbortController | null = null;
let bookId = '';
let operationId = 0;
let dragDepth = 0;
let hideTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let hideAt = 0;

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

function syncEngineSnapshot(): void {
  if (!engine) return;
  const snapshot = engine.snapshot;
  state.value = snapshot.state;
  pageCount.value = snapshot.pageCount;
  spreadIndex.value = snapshot.spreadIndex;
  canGoForward.value = engine.canGoForward;
  canGoBack.value = engine.canGoBackward;
  zoomPercent.value = Math.round(engine.zoom * 100);
  canZoomIn.value = engine.canZoomIn;
  canZoomOut.value = engine.canZoomOut;
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
  zoomPercent.value = 100;
  canZoomIn.value = true;
  canZoomOut.value = false;
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

async function openFile(file: File): Promise<void> {
  if (!isPdf(file)) {
    errorMessage.value = '请选择 PDF 文件。';
    return;
  }

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
    scheduleUiHide();
  } catch (reason) {
    await orphanProvider?.dispose().catch(() => undefined);
    if (currentOperation !== operationId || controller.signal.aborted) return;
    await returnHome(pdfErrorMessage(reason));
  }
}

function chooseFile(): void {
  fileInput.value?.click();
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

function onDrop(event: DragEvent): void {
  dragDepth = 0;
  dragging.value = false;
  const file = [...(event.dataTransfer?.files ?? [])].find(isPdf);
  if (file) void openFile(file);
  else errorMessage.value = '这里只能打开本地 PDF。';
}

async function openBook(): Promise<void> {
  if (!engine || state.value !== 'CLOSED') return;
  const activeEngine = engine;
  revealUi();
  void audio.playOpen();
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
  void audio.playClose();
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
  void audio.playTurn(direction);
  if (direction === 'forward') await engine.next();
  else await engine.previous();
}

function toggleSound(): void {
  soundEnabled.value = !soundEnabled.value;
  audio.setEnabled(soundEnabled.value);
  revealUi();
}

function changeZoom(action: 'in' | 'out' | 'reset'): void {
  if (!engine || state.value !== 'OPEN') return;
  if (action === 'in') engine.zoomIn();
  else if (action === 'out') engine.zoomOut();
  else engine.resetZoom();
  syncEngineSnapshot();
  revealUi();
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
});

onBeforeUnmount(() => {
  operationId += 1;
  globalThis.removeEventListener('keydown', onKeydown);
  document.removeEventListener('fullscreenchange', syncFullscreen);
  clearHideTimer();
  loadController?.abort();
  if (document.fullscreenElement === root.value) void document.exitFullscreen();
  void disposeReader();
  void audio.dispose();
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
      <p v-if="readerReady" class="books-reader__hint">
        {{
          bookClosed
            ? '点击封面打开这本书'
            : zoomPercent > 100
              ? '点击左右页切换焦点，滚轮上下移动；纸张外缘仍可翻页'
              : '拖动纸张外侧，或使用方向键翻页'
        }}
      </p>
      <p class="books-orientation-hint">横屏阅读会更舒展</p>
      <ReaderControls
        v-if="readerReady"
        :book-closed="bookClosed"
        :book-open="bookOpen"
        :can-go-back="canGoBack"
        :can-go-forward="canGoForward"
        :current-page="currentPage"
        :page-count="pageCount"
        :sound-enabled="soundEnabled"
        :fullscreen="fullscreen"
        :zoom-percent="zoomPercent"
        :can-zoom-in="canZoomIn"
        :can-zoom-out="canZoomOut"
        @previous="turn('backward')"
        @next="turn('forward')"
        @replace="chooseFile"
        @open="openBook"
        @close="closeBook"
        @toggle-sound="toggleSound"
        @toggle-fullscreen="toggleFullscreen"
        @zoom-in="changeZoom('in')"
        @zoom-out="changeZoom('out')"
        @reset-zoom="changeZoom('reset')"
      />
    </section>

    <div v-if="dragging && readerMounted" class="books-drop-curtain" aria-live="polite">
      <strong>松手，更换这本书</strong>
      <span>新文件仍然只在你的浏览器中处理</span>
    </div>
  </main>
</template>
