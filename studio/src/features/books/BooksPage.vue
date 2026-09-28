<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useTheme, type ThemePreference } from '@/composables/useTheme';
import { receiveWindowFileHandoff, useFileHandoff } from '@/core/browser/file-handoff';
import BookshelfView from './components/BookshelfView.vue';
import BookWelcome from './components/BookWelcome.vue';
import LoadingBook from './components/LoadingBook.vue';
import ReaderControls from './components/ReaderControls.vue';
import ReaderPanel from './components/ReaderPanel.vue';
import type { BookEngine } from './engine/BookEngine';
import { BookStateMachine } from './engine/BookStateMachine';
import { getSpreadIndexForPage } from './engine/spreads';
import { BUILTIN_ID_PREFIX, markBuiltinRemoved, mergeBuiltinEntries } from './builtin/BuiltinShelf';
import { probeBuiltinBooks } from './builtin/probe';
import { createBookFingerprint } from './persistence/BookFingerprint';
import { drawCoverThumbnail } from './persistence/coverThumbnail';
import {
  BookshelfRepository,
  rememberBookshelfSessionFile,
  resolveBookshelfFile,
  type BookshelfEntry,
} from './persistence/BookshelfRepository';
import {
  loadReadingProgress,
  saveReadingProgress,
  type ReadingProgressV2,
} from './persistence/ReadingProgress';
import { createProgressSaveCoalescer } from './persistence/progress-save-coalescer';
import {
  DEFAULT_READER_LAYOUT,
  normalizeReaderLayout,
  readerLayoutKey,
} from './publication/defaults';
import { themeColors } from './reader-theme';
import { BOOK_FILE_ACCEPT, PublicationLoader } from './publication/PublicationLoader';
import type {
  BookLocator,
  BookState,
  PageProvider,
  Publication,
  ReaderLayoutProfile,
  TurnDirection,
} from './types/reader';
import './books.css';

type BookOpenPicker = (options?: {
  multiple?: boolean;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}) => Promise<FileSystemFileHandle[]>;

type HandleDropItem = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
};

interface OpenBookOptions {
  autoOpen?: boolean;
  locator?: BookLocator;
  existingEntry?: BookshelfEntry;
  reflowing?: boolean;
}

const READER_TIP_KEY = 'meowv-studio:books:reader-tip:v2';
const READER_LAYOUT_KEY = 'meowv-studio:books:layout:v2';
const bookshelf = new BookshelfRepository();
const root = ref<HTMLElement | null>(null);
const canvasHost = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const { takeHandoff } = useFileHandoff();
const state = ref<BookState>('EMPTY');
const readerMounted = ref(false);
const readerReady = ref(false);
const dragging = ref(false);
const uiHidden = ref(false);
const fullscreen = ref(false);
const errorMessage = ref('');
const errorVisible = ref(false);
let errorHideTimer: number | null = null;

/** 回到书架标记：手动返回书架后，刷新页面不再自动恢复上次打开的书籍，直到再次打开任意书籍。 */
const SHELF_RETURN_KEY = 'meowv-studio:books:returned-to-shelf:v1';

function markReturnedToShelf(): void {
  try {
    localStorage.setItem(SHELF_RETURN_KEY, '1');
  } catch {
    // 隐私模式仅当前会话生效。
  }
}

function clearReturnedToShelf(): void {
  try {
    localStorage.removeItem(SHELF_RETURN_KEY);
  } catch {
    // 隐私模式仅当前会话生效。
  }
}

function returnedToShelf(): boolean {
  try {
    return localStorage.getItem(SHELF_RETURN_KEY) !== null;
  } catch {
    return false;
  }
}

function showError(message: string): void {
  errorMessage.value = message;
  if (errorHideTimer !== null) {
    window.clearTimeout(errorHideTimer);
    errorHideTimer = null;
  }
  if (!message) {
    errorVisible.value = false;
    return;
  }
  errorVisible.value = true;
  errorHideTimer = window.setTimeout(() => {
    errorVisible.value = false;
    errorHideTimer = null;
  }, 4000);
}

function hideError(): void {
  showError('');
}
const loadMessage = ref('正在识别书籍…');
const loadProgress = ref(0);
const pageCount = ref(0);
const spreadIndex = ref(0);
const currentPageValue = ref(0);
const canGoForward = ref(false);
const canGoBack = ref(false);
const showReaderTip = ref(false);
const pagePreparing = ref(false);
const shelfEntries = ref<BookshelfEntry[]>([]);
const persistentShelf = ref(bookshelf.persistentHandles);
const readerPanel = ref<'toc' | 'settings' | null>(null);
const currentTitle = ref('Books');
const currentLayout = ref<'fixed' | 'reflowable'>('fixed');
const currentToc = ref<Publication['toc']>([]);
const readerProfile = ref<ReaderLayoutProfile>(loadReaderLayout());
const pageStateMachine = new BookStateMachine();
const {
  preference: themePreference,
  resolved: resolvedTheme,
  setPreference,
  setWithoutPersist,
} = useTheme();
let previousThemePreference: ThemePreference = 'system';

let engine: BookEngine | null = null;
let publication: Publication | null = null;
let pageProvider: PageProvider | null = null;
let unsubscribeEngine: (() => void) | null = null;
let loadController: AbortController | null = null;
let currentFile: File | null = null;
let currentHandle: FileSystemFileHandle | undefined;
let currentEntry: BookshelfEntry | null = null;
let pendingRelinkEntry: BookshelfEntry | null = null;
let bookId = '';
let operationId = 0;
let restoreId = 0;
let dragDepth = 0;
let pendingTurn: TurnDirection | null = null;
const heldTurnDirections = new Set<TurnDirection>();
let lastHeldTurnDirection: TurnDirection | null = null;
let hideTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let tipTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let hideAt = 0;
let shelfActive = false;
let stopWindowFileHandoff: (() => void) | null = null;
let builtinProbeTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
/** 收到外部文件交接后，阻止自动恢复上次阅读的书籍覆盖新打开的书。 */
let handoffArrived = false;

/** 指针是否悬停在阅读进度条（底部控制条）上；悬停期间不自动隐藏。 */
function pointerOverControls(): boolean {
  return document.querySelector('.books-reader-controls__bottom')?.matches(':hover') ?? false;
}

pageStateMachine.subscribe((snapshot) => {
  state.value = snapshot.state;
  if (snapshot.state === 'CLOSED' || snapshot.state === 'LOADING' || snapshot.state === 'ERROR') {
    pendingTurn = null;
  }
});

const bookClosed = computed(() => state.value === 'CLOSED');
const bookOpen = computed(() => state.value === 'OPEN');
const currentPage = computed(() => currentPageValue.value);
const sortedShelfEntries = computed(() => {
  return [...shelfEntries.value].sort((left, right) => right.lastOpenedAt - left.lastOpenedAt);
});

function loadReaderLayout(): ReaderLayoutProfile {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(READER_LAYOUT_KEY) ?? 'null');
    return normalizeReaderLayout(value as Partial<ReaderLayoutProfile>);
  } catch {
    return { ...DEFAULT_READER_LAYOUT };
  }
}

function persistReaderLayout(profile: ReaderLayoutProfile): void {
  try {
    localStorage.setItem(READER_LAYOUT_KEY, JSON.stringify(profile));
  } catch {
    // 隐私模式下仅保留当前会话设置。
  }
}

function clearHideTimer(): void {
  if (!hideTimer) return;
  globalThis.clearTimeout(hideTimer);
  hideTimer = null;
  hideAt = 0;
}

function scheduleUiHide(): void {
  if ((state.value !== 'OPEN' && state.value !== 'CLOSED') || readerPanel.value) return;
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
    if (!document.hidden && !readerPanel.value && !pointerOverControls()) uiHidden.value = true;
  };
  hideTimer = globalThis.setTimeout(check, 2600);
}

function revealUi(): void {
  if (uiHidden.value) uiHidden.value = false;
  // 热路径（pointermove / pointerdown）不做 DOM 查询；悬停判定交给 scheduleUiHide 的
  // check —— 那里本就是每 2.6s 才跑一次，且已带 !pointerOverControls() 守卫。
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
  currentPageValue.value = snapshot.currentPage;
  canGoForward.value = engine.canGoForward;
  canGoBack.value = engine.canGoBackward;
}

let builtinProbeController: AbortController | null = null;

function cancelBuiltinProbe(): void {
  builtinProbeController?.abort();
  builtinProbeController = null;
  if (builtinProbeTimer === null) return;
  globalThis.clearTimeout(builtinProbeTimer);
  builtinProbeTimer = null;
}

function scheduleBuiltinProbe(stored: BookshelfEntry[]): void {
  cancelBuiltinProbe();
  // 内置书探测会解压 ZIP 并生成缩略图，不能和恢复上次书籍争用主线程。
  builtinProbeTimer = globalThis.setTimeout(() => {
    builtinProbeTimer = null;
    if (!shelfActive || readerMounted.value || loadController) return;
    const controller = new AbortController();
    builtinProbeController = controller;
    let refreshTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    const clearRefresh = (): void => {
      if (refreshTimer !== null) globalThis.clearTimeout(refreshTimer);
      refreshTimer = null;
    };
    const onUpdated = (): void => {
      if (refreshTimer !== null || controller.signal.aborted) return;
      refreshTimer = globalThis.setTimeout(() => {
        refreshTimer = null;
        if (!controller.signal.aborted) void refreshShelf(false);
      }, 250);
    };
    controller.signal.addEventListener('abort', clearRefresh, { once: true });
    void probeBuiltinBooks(bookshelf, stored, onUpdated, controller.signal)
      .then(() => {
        clearRefresh();
        if (!controller.signal.aborted) return refreshShelf(false);
      })
      .catch(() => undefined)
      .finally(() => {
        clearRefresh();
        controller.signal.removeEventListener('abort', clearRefresh);
      });
  }, 8000);
}

async function refreshShelf(probe = true): Promise<void> {
  const stored = await bookshelf.list();
  shelfEntries.value = await mergeBuiltinEntries(stored);
  persistentShelf.value = bookshelf.persistentHandles;
  if (probe && shelfActive && !readerMounted.value && !loadController) scheduleBuiltinProbe(stored);
}

function newestProgress(
  local: ReadingProgressV2 | null,
  stored: ReadingProgressV2 | undefined,
): ReadingProgressV2 | null {
  if (!local) return stored ?? null;
  if (!stored) return local;
  return local.updatedAt >= stored.updatedAt ? local : stored;
}

function pageForProgress(
  activePublication: Publication,
  provider: PageProvider,
  progress: ReadingProgressV2 | null,
): number {
  if (!progress) return 1;
  const expectedLocator = activePublication.layout === 'fixed' ? 'fixed' : 'reflowable';
  if (progress.format === activePublication.format && progress.locator.kind === expectedLocator) {
    try {
      return provider.pageForLocator(progress.locator);
    } catch {
      // 分页结构变化时使用格式无关的兜底进度。
    }
  }
  return Math.min(
    provider.pageCount,
    Math.max(1, Math.round(progress.fallbackProgress * (provider.pageCount - 1)) + 1),
  );
}

async function saveCurrentProgress(): Promise<void> {
  if (!bookId || !publication || !pageProvider || !currentEntry || pageCount.value < 1) return;
  try {
    const pageNumber = Math.min(pageCount.value, Math.max(1, currentPage.value));
    const progress = saveReadingProgress(bookId, {
      format: publication.format,
      locator: pageProvider.locatorForPage(pageNumber),
      fallbackProgress: pageCount.value <= 1 ? 0 : (pageNumber - 1) / (pageCount.value - 1),
      layoutKey: publication.layout === 'fixed' ? 'fixed' : readerLayoutKey(readerProfile.value),
    });
    currentEntry = { ...currentEntry, progress, lastOpenedAt: Date.now() };
    await bookshelf.upsert(currentEntry);
  } catch {
    // 存储失败不应中断本地阅读。
  }
}

/**
 * 落页时的进度写入会被合并到一次防抖写入，离开阅读器时再 flush 补齐。
 * 写入本身仍由 saveCurrentProgress 串行执行，不会并行打开多个 IndexedDB 事务。
 */
const progressSave = createProgressSaveCoalescer(() => saveCurrentProgress());

async function disposeReader(): Promise<void> {
  pendingTurn = null;
  heldTurnDirections.clear();
  lastHeldTurnDirection = null;
  clearHideTimer();
  loadController?.abort();
  loadController = null;
  unsubscribeEngine?.();
  unsubscribeEngine = null;
  const activeEngine = engine;
  const activePublication = publication;
  engine = null;
  publication = null;
  pageProvider = null;
  await activeEngine?.dispose().catch(() => undefined);
  await activePublication?.dispose().catch(() => undefined);
  currentFile = null;
  currentHandle = undefined;
  currentEntry = null;
  bookId = '';
}

function resetReaderView(): void {
  if (pageStateMachine.state !== 'EMPTY') pageStateMachine.reset();
  readerReady.value = false;
  readerMounted.value = false;
  pageCount.value = 0;
  spreadIndex.value = 0;
  currentPageValue.value = 0;
  canGoForward.value = false;
  canGoBack.value = false;
  showReaderTip.value = false;
  pagePreparing.value = false;
  pendingThumbnail = null;
  pendingTurn = null;
  readerPanel.value = null;
  uiHidden.value = false;
}

async function returnToShelf(message = ''): Promise<void> {
  const currentOperation = ++operationId;
  await progressSave.flush();
  if (engine?.snapshot.state === 'OPEN') await engine.close().catch(() => undefined);
  await disposeReader();
  if (currentOperation !== operationId) return;
  markReturnedToShelf();
  resetReaderView();
  showError(message);
  await refreshShelf();
}

function bookErrorMessage(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === 'AbortError') return '';
  if (reason instanceof Error) {
    if (reason.name === 'PasswordException') return '暂不支持受密码保护的 PDF。';
    if (reason.name === 'InvalidPDFException') return '这份 PDF 已损坏或格式不受支持。';
    if (/DRM|encrypt|encryption/i.test(reason.message))
      return '这本书受 DRM 或加密保护，无法打开。';
    if (reason.message) return reason.message;
  }
  return '无法打开这本书，请确认文件完整后再试。';
}

async function renderPublicationCover(
  activePublication: Publication,
  provider: PageProvider,
  signal: AbortSignal,
): Promise<HTMLCanvasElement | undefined> {
  if (!activePublication.cover || typeof createImageBitmap !== 'function') return undefined;
  const [bitmap, pageSize] = await Promise.all([
    createImageBitmap(activePublication.cover),
    provider.getPageSize(1),
  ]);
  try {
    if (signal.aborted) throw new DOMException('封面准备已取消。', 'AbortError');
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = Math.max(1, Math.round(canvas.width * (pageSize.height / pageSize.width)));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return undefined;
    context.fillStyle = '#ead0aa';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(
      bitmap,
      (canvas.width - width) / 2,
      (canvas.height - height) / 2,
      width,
      height,
    );
    return canvas;
  } finally {
    bitmap.close();
  }
}

async function createCoverThumbnail(
  activePublication: Publication,
  provider: PageProvider,
  signal: AbortSignal,
): Promise<Blob | undefined> {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let rendered: Awaited<ReturnType<PageProvider['renderPage']>> | null = null;
  let bitmap: ImageBitmap | null = null;
  try {
    if (activePublication.cover && typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(activePublication.cover);
      source = bitmap;
      width = bitmap.width;
      height = bitmap.height;
    } else {
      rendered = await provider.renderPage(1, {
        targetWidth: 240,
        quality: 'preview',
        signal,
      });
      source = rendered.canvas;
      width = rendered.width;
      height = rendered.height;
    }
    if (signal.aborted) return undefined;
    return drawCoverThumbnail(source, width, height);
  } finally {
    bitmap?.close();
    rendered?.dispose();
  }
}

const THUMBNAIL_IDLE_TIMEOUT_MS = 4000;

interface ThumbnailContext {
  publication: Publication;
  provider: PageProvider;
  signal: AbortSignal;
  operation: number;
}

/** 被推迟的缩略图请求；就绪后由 watch(pagePreparing) 补触发。 */
let pendingThumbnail: ThumbnailContext | null = null;

async function runCoverThumbnail(context: ThumbnailContext): Promise<void> {
  const cover = await createCoverThumbnail(context.publication, context.provider, context.signal);
  if (!cover || context.operation !== operationId || !currentEntry) return;
  currentEntry = {
    ...currentEntry,
    coverThumbnail: cover,
    coverThumbnailPlaceholder: undefined,
  };
  await bookshelf.upsert(currentEntry);
}

/**
 * 生成封面缩略图需要页面提供器渲染第 1 页，而 HTML 提供器只有一条串行渲染链，
 * 立刻发起会挡在首次翻页前面。因此放到浏览器空闲时再做。
 *
 * 若此刻还在准备书页，不能按固定次数重试 —— 大书的首次渲染可能远超重试窗口，
 * 那样缩略图会被永久放弃，书架卡片一直停在占位图。改为登记待办，
 * 等准备结束后补触发一次（见下方 watch）。
 */
function scheduleCoverThumbnail(
  activePublication: Publication,
  provider: PageProvider,
  signal: AbortSignal,
  operation: number,
): void {
  const context: ThumbnailContext = {
    publication: activePublication,
    provider,
    signal,
    operation,
  };
  const run = (): void => {
    if (operation !== operationId || signal.aborted) return;
    if (!readerReady.value || pagePreparing.value) {
      pendingThumbnail = context;
      return;
    }
    void runCoverThumbnail(context).catch(() => undefined);
  };
  if ('requestIdleCallback' in globalThis) {
    globalThis.requestIdleCallback(run, { timeout: THUMBNAIL_IDLE_TIMEOUT_MS });
  } else {
    globalThis.setTimeout(run, 1500);
  }
}

// 阅读器就绪且不再准备书页时，补上被推迟的缩略图。
watch([pagePreparing, readerReady], () => {
  const context = pendingThumbnail;
  if (!context || pagePreparing.value || !readerReady.value) return;
  pendingThumbnail = null;
  if (context.operation !== operationId || context.signal.aborted) return;
  void runCoverThumbnail(context).catch(() => undefined);
});

async function openFile(
  file: File,
  handle?: FileSystemFileHandle,
  options: OpenBookOptions = {},
): Promise<void> {
  cancelBuiltinProbe();
  pendingTurn = null;
  restoreId += 1;
  const currentOperation = ++operationId;
  await progressSave.flush();
  if (engine?.snapshot.state === 'OPEN') await engine.close().catch(() => undefined);
  await disposeReader();
  if (currentOperation !== operationId) return;

  if (pageStateMachine.state !== 'EMPTY') pageStateMachine.reset();
  pageStateMachine.transition('LOADING');

  hideError();
  loadMessage.value = options.reflowing ? '正在重新排版…' : '正在识别书籍…';
  loadProgress.value = 0.03;
  readerMounted.value = true;
  readerReady.value = false;
  uiHidden.value = false;
  await nextTick();

  const host = canvasHost.value;
  if (!host) {
    await returnToShelf('无法创建仿真书画布，请刷新页面后重试。');
    return;
  }

  const controller = new AbortController();
  loadController = controller;
  let orphanPublication: Publication | null = null;
  let instance: BookEngine | null = null;
  try {
    const { BookEngine: BookEngineRuntime } = await import('./engine/BookEngine');
    if (controller.signal.aborted || currentOperation !== operationId) return;
    instance = new BookEngineRuntime(host, {
      stateMachine: pageStateMachine,
      theme: 'dark',
      onError: (error) => {
        if (currentOperation === operationId) void returnToShelf(bookErrorMessage(error));
      },
      onPagePreparationChange: (preparing) => {
        if (currentOperation === operationId && engine === instance)
          pagePreparing.value = preparing;
      },
    });
  } catch (error) {
    await returnToShelf(
      error instanceof Error && /webgl|context/i.test(error.message)
        ? '无法创建仿真书 3D 画布，请检查浏览器硬件加速设置后重试。'
        : bookErrorMessage(error),
    );
    return;
  }
  engine = instance;
  unsubscribeEngine = instance.subscribe((snapshot, previousSnapshot) => {
    if (currentOperation !== operationId) return;
    syncEngineSnapshot();
    if (snapshot.state === 'OPEN' && previousSnapshot.state === 'TURNING') {
      progressSave.schedule();
    }
    if (
      snapshot.state === 'OPEN' &&
      (previousSnapshot.state === 'TURNING' || previousSnapshot.state === 'SNAPPING_BACK') &&
      pendingTurn
    ) {
      const direction = pendingTurn;
      pendingTurn = null;
      queueMicrotask(() => {
        if (currentOperation !== operationId || engine !== instance || state.value !== 'OPEN')
          return;
        void turn(direction);
      });
    }
    scheduleUiHide();
  });

  try {
    const fingerprint = await createBookFingerprint(file);
    if (
      options.existingEntry &&
      !options.existingEntry.builtIn &&
      options.existingEntry.id !== fingerprint
    ) {
      throw new Error('所选文件与书架记录不一致，请重新选择原文件。');
    }
    orphanPublication = await PublicationLoader.open(file, {
      signal: controller.signal,
      onProgress: (progress) => {
        loadMessage.value = options.reflowing ? '正在重新排版…' : progress.message;
        loadProgress.value = progress.value;
      },
    });
    const openedPublication = orphanPublication;
    const provider = await openedPublication.paginate(readerProfile.value, {
      signal: controller.signal,
      // v4：v3 的分页索引是在「未归一化」布局下算出的，页数被低估（三体 1096 vs 真值 1293）。
      // 换 key 让存量错误索引自动失效，无需清理数据。
      paginationKey: `${fingerprint}:books-renderer-v4:${
        openedPublication.layout === 'fixed' ? 'fixed' : readerLayoutKey(readerProfile.value)
      }`,
      onProgress: (progress) => {
        loadMessage.value = options.reflowing ? '正在重新排版…' : progress.message;
        loadProgress.value = progress.value;
      },
    });
    if (currentOperation !== operationId) {
      await openedPublication.dispose();
      return;
    }

    loadMessage.value = options.reflowing ? '正在重新排版…' : '正在准备封面…';
    loadProgress.value = 0.82;
    const previous = options.existingEntry ?? (await bookshelf.get(fingerprint));
    const restoredProgress = options.locator
      ? null
      : newestProgress(loadReadingProgress(fingerprint), previous?.progress);
    const entryProgress = restoredProgress ?? previous?.progress;
    const initialPage = options.locator
      ? provider.pageForLocator(options.locator)
      : pageForProgress(openedPublication, provider, restoredProgress);
    const initialSpread = getSpreadIndexForPage(initialPage, provider.pageCount);
    const publicationCover = await renderPublicationCover(
      openedPublication,
      provider,
      controller.signal,
    ).catch(() => undefined);
    loadMessage.value = options.reflowing ? '正在重新排版…' : '正在生成书页…';
    loadProgress.value = 0.9;
    publication = openedPublication;
    pageProvider = provider;
    orphanPublication = null;
    currentFile = file;
    currentHandle = handle;
    bookId = fingerprint;
    currentTitle.value = openedPublication.metadata.title;
    currentLayout.value = openedPublication.layout;
    currentToc.value = openedPublication.toc;
    const now = Date.now();
    currentEntry = {
      id: fingerprint,
      format: openedPublication.format,
      metadata: openedPublication.metadata,
      ...(previous?.coverThumbnail
        ? {
            coverThumbnail: previous.coverThumbnail,
            ...(previous.coverThumbnailPlaceholder ? { coverThumbnailPlaceholder: true } : {}),
          }
        : {}),
      ...(handle ? { handle } : previous?.handle ? { handle: previous.handle } : {}),
      ...(previous?.builtIn && previous.builtinSlug
        ? { builtIn: true, builtinSlug: previous.builtinSlug }
        : {}),
      availability: 'available',
      ...(entryProgress ? { progress: entryProgress } : {}),
      addedAt: previous?.addedAt ?? now,
      lastOpenedAt: now,
    };
    if (!currentEntry.builtIn) rememberBookshelfSessionFile(fingerprint, file);
    await bookshelf.upsert(currentEntry);
    clearReturnedToShelf();

    // 占位空白页要与阅读主题一致。载入时的封面采样对深色主题无效（亮度下限会拒绝），
    // 所以这里先按主题设定，采样只当浅色主题下的精修。固定版式没有 setAppearance，
    // 页色不受阅读主题影响，保持采样值。
    if (provider.setAppearance) {
      instance.setBlankPageColor(themeColors(readerProfile.value.theme).background);
    }
    await instance.load(provider, {
      initialPage,
      initialSpreadIndex: initialSpread,
      publicationCoverCanvas: publicationCover,
    });
    if (currentOperation !== operationId) return;
    syncEngineSnapshot();
    readerReady.value = true;
    loadProgress.value = 1;
    showReaderTipOnce();
    scheduleUiHide();
    if (!currentEntry.coverThumbnail || currentEntry.coverThumbnailPlaceholder) {
      scheduleCoverThumbnail(openedPublication, provider, controller.signal, currentOperation);
    }
    if (options.autoOpen) {
      await instance.open();
      // 自动恢复、从书架打开和重新排版也可能将阅读位置设到非首页。
      progressSave.schedule();
      await progressSave.flush();
    }
  } catch (reason) {
    await orphanPublication?.dispose().catch(() => undefined);
    if (currentOperation !== operationId || controller.signal.aborted) return;
    await returnToShelf(bookErrorMessage(reason));
  }
}

function pickerOptions(): Parameters<BookOpenPicker>[0] {
  return {
    multiple: false,
    types: [
      {
        description: '本地书籍',
        accept: {
          'application/pdf': ['.pdf'],
          'application/epub+zip': ['.epub'],
          'text/plain': ['.txt'],
          'application/octet-stream': ['.mobi', '.azw3', '.fb2', '.cbz'],
        },
      },
    ],
  };
}

async function pickHandle(): Promise<FileSystemFileHandle | null> {
  const picker = (globalThis as typeof globalThis & { showOpenFilePicker?: BookOpenPicker })
    .showOpenFilePicker;
  if (typeof picker !== 'function') return null;
  const [handle] = await picker(pickerOptions());
  return handle ?? null;
}

async function chooseFile(): Promise<void> {
  restoreId += 1;
  pendingRelinkEntry = null;
  try {
    const handle = await pickHandle();
    if (!handle) {
      fileInput.value?.click();
      return;
    }
    await openFile(await handle.getFile(), handle);
  } catch (reason) {
    if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
      showError('无法读取所选书籍，请重新选择。');
    }
  }
}

async function openShelfEntry(entry: BookshelfEntry): Promise<void> {
  // 书架点击是用户的明确选择，立即让启动时的自动恢复失效。
  restoreId += 1;
  cancelBuiltinProbe();
  hideError();
  const file = await resolveBookshelfFile(entry, true);
  if (!file) {
    if (entry.builtIn) {
      showError('内置书籍暂时无法访问，请稍后再试。');
      return;
    }
    await bookshelf.upsert({
      ...entry,
      availability: entry.handle ? 'permission-required' : 'missing',
    });
    await refreshShelf();
    await relinkShelfEntry(entry);
    return;
  }
  try {
    const fingerprint = await createBookFingerprint(file);
    if (!entry.builtIn && fingerprint !== entry.id) throw new Error('文件内容已经变化');
    await openFile(file, entry.handle, { autoOpen: true, existingEntry: entry });
  } catch {
    if (entry.builtIn) {
      showError('内置书籍打开失败，请稍后再试。');
      return;
    }
    await bookshelf.upsert({ ...entry, availability: 'missing' });
    await refreshShelf();
    await relinkShelfEntry(entry);
  }
}

async function finishRelink(
  entry: BookshelfEntry,
  file: File,
  handle?: FileSystemFileHandle,
): Promise<void> {
  if ((await createBookFingerprint(file)) !== entry.id) {
    showError('所选文件不是书架中的原文件，记录未被替换。');
    return;
  }
  const relinkedEntry: BookshelfEntry = {
    ...entry,
    ...(handle ? { handle } : {}),
    availability: 'available',
    lastOpenedAt: Date.now(),
  };
  if (handle) await bookshelf.relink(entry.id, handle);
  else await bookshelf.upsert(relinkedEntry);
  rememberBookshelfSessionFile(entry.id, file);
  await refreshShelf();
  await openFile(file, handle, {
    autoOpen: true,
    existingEntry: relinkedEntry,
  });
}

async function relinkShelfEntry(entry: BookshelfEntry): Promise<void> {
  hideError();
  const picker = (globalThis as typeof globalThis & { showOpenFilePicker?: BookOpenPicker })
    .showOpenFilePicker;
  if (typeof picker !== 'function') {
    pendingRelinkEntry = entry;
    fileInput.value?.click();
    return;
  }
  try {
    const handle = await pickHandle();
    if (handle) await finishRelink(entry, await handle.getFile(), handle);
  } catch (reason) {
    if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
      showError('重新添加失败，请确认文件仍然可读。');
    }
  }
}

async function removeShelfEntry(entry: BookshelfEntry, removeProgress: boolean): Promise<void> {
  restoreId += 1;
  const hint = entry.builtIn
    ? '内置书籍将从书架隐藏，阅读进度会保留。'
    : '只会从书架移除，不会删除电脑上的原文件。';
  if (!window.confirm(`将“${entry.metadata.title}”移出书架？${hint}`)) return;
  // 内置书籍删除即移出书架：记录移出状态并移除持久化条目，阅读进度保留。
  if (entry.builtIn && entry.builtinSlug) markBuiltinRemoved(entry.builtinSlug, entry.format);
  await bookshelf.remove(entry.id, { removeProgress });
  await refreshShelf();
}

function onCanvasClick(): void {
  if (state.value === 'CLOSED') void openBook();
}

function onFileChange(event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  const relinkEntry = pendingRelinkEntry;
  pendingRelinkEntry = null;
  if (!file) return;
  if (relinkEntry) void finishRelink(relinkEntry, file);
  else void openFile(file);
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
  const item = [...(dataTransfer?.items ?? [])].find((candidate) => candidate.kind === 'file') as
    HandleDropItem | undefined;
  const fallbackFile = dataTransfer?.files?.[0];
  if (!item && !fallbackFile) return;
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
      await returnToShelf(bookErrorMessage(reason));
    }
  }
}

async function closeBook(): Promise<void> {
  if (!engine || state.value !== 'OPEN') return;
  const activeEngine = engine;
  revealUi();
  try {
    await activeEngine.close();
    await progressSave.flush();
  } catch (reason) {
    if (
      !(reason instanceof DOMException && reason.name === 'AbortError') &&
      engine === activeEngine
    ) {
      await returnToShelf(bookErrorMessage(reason));
    }
  }
}

async function turn(direction: TurnDirection): Promise<void> {
  if (!engine) return;
  if (state.value !== 'OPEN') {
    if (
      state.value === 'TURNING' ||
      state.value === 'DRAGGING' ||
      state.value === 'SNAPPING_BACK'
    ) {
      pendingTurn = direction;
    }
    return;
  }
  revealUi();
  if (direction === 'forward') await engine.next();
  else await engine.previous();
}

async function navigateTo(locator: BookLocator): Promise<void> {
  if (!engine || !pageProvider || !readerReady.value) return;
  readerPanel.value = null;
  try {
    if (engine.snapshot.state === 'OPEN') await engine.close();
    await engine.goToPage(pageProvider.pageForLocator(locator));
    await engine.open();
    progressSave.schedule();
    await progressSave.flush();
  } catch (reason) {
    await returnToShelf(bookErrorMessage(reason));
  }
}

async function applyReaderProfile(profile: ReaderLayoutProfile): Promise<void> {
  if (currentLayout.value !== 'reflowable' || !currentFile || !pageProvider) return;
  const file = currentFile;
  const handle = currentHandle;
  const entry = currentEntry ?? undefined;
  const previousProfile = readerProfile.value;
  const themeOnly =
    previousProfile.fontFamily === profile.fontFamily &&
    previousProfile.fontSize === profile.fontSize &&
    previousProfile.lineHeight === profile.lineHeight &&
    previousProfile.pageMargin === profile.pageMargin &&
    previousProfile.theme !== profile.theme;
  if (themeOnly && engine) {
    readerProfile.value = normalizeReaderLayout(profile);
    persistReaderLayout(readerProfile.value);
    await pageProvider.setAppearance?.(readerProfile.value.theme);
    engine.setBlankPageColor(themeColors(readerProfile.value.theme).background);
    await engine.refreshPages();
    return;
  }
  const locator = pageProvider.locatorForPage(Math.max(1, currentPage.value));
  readerProfile.value = normalizeReaderLayout(profile);
  persistReaderLayout(readerProfile.value);
  await openFile(file, handle, {
    autoOpen: true,
    locator,
    existingEntry: entry,
    reflowing: true,
  });
}

async function toggleFullscreen(): Promise<void> {
  const page = root.value;
  if (!page) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await page.requestFullscreen();
  } catch {
    showError('当前浏览器无法进入全屏模式。');
  }
  revealUi();
}

function syncFullscreen(): void {
  fullscreen.value = document.fullscreenElement === root.value;
  revealUi();
}

function toggleReaderPanel(mode: 'toc' | 'settings'): void {
  readerPanel.value = readerPanel.value === mode ? null : mode;
  uiHidden.value = false;
  clearHideTimer();
}

function turnDirectionForKey(key: string): TurnDirection | null {
  if (key === 'ArrowRight' || key === 'PageDown' || key === ' ') return 'forward';
  if (key === 'ArrowLeft' || key === 'PageUp') return 'backward';
  return null;
}

function rememberHeldTurnDirection(direction: TurnDirection): void {
  heldTurnDirections.delete(direction);
  heldTurnDirections.add(direction);
  lastHeldTurnDirection = direction;
}

function releaseHeldTurnDirection(direction: TurnDirection): void {
  heldTurnDirections.delete(direction);
  if (lastHeldTurnDirection === direction) {
    lastHeldTurnDirection = Array.from(heldTurnDirections).at(-1) ?? null;
  }
  if (pendingTurn === direction) pendingTurn = lastHeldTurnDirection;
}

function clearHeldTurnDirections(): void {
  heldTurnDirections.clear();
  lastHeldTurnDirection = null;
  pendingTurn = null;
}

function onKeydown(event: KeyboardEvent): void {
  // 监听挂在 globalThis 上，派发到 window 时 event.target 就是 window（非元素），
  // 直接调 matches() 会抛 TypeError。键盘输入的真实路径下 target 恒为元素，这里只是兜底。
  const target = event.target;
  if (
    (target instanceof HTMLElement &&
      target.matches('input, textarea, select, button, [contenteditable="true"]')) ||
    !readerReady.value
  )
    return;
  const direction = turnDirectionForKey(event.key);
  if (direction) {
    event.preventDefault();
    rememberHeldTurnDirection(direction);
    void turn(direction);
  } else if (event.key.toLowerCase() === 'f') {
    event.preventDefault();
    void toggleFullscreen();
  } else if (event.key === 'Escape') {
    readerPanel.value = null;
    uiHidden.value = false;
    if (document.fullscreenElement) void document.exitFullscreen();
  }
}

function onKeyup(event: KeyboardEvent): void {
  const direction = turnDirectionForKey(event.key);
  if (direction) releaseHeldTurnDirection(direction);
}

async function restoreLastBook(restoreOperation: number): Promise<void> {
  if (restoreOperation !== restoreId) return;
  await refreshShelf();
  if (restoreOperation !== restoreId || returnedToShelf()) return;
  const candidate = [...shelfEntries.value].sort(
    (left, right) => right.lastOpenedAt - left.lastOpenedAt,
  )[0];
  if (!candidate) return;
  if (candidate.builtIn && candidate.id.startsWith(BUILTIN_ID_PREFIX)) return;
  const file = await resolveBookshelfFile(candidate, false);
  if (restoreOperation !== restoreId || handoffArrived) return;
  if (!file) {
    if (candidate.builtIn) return;
    if (candidate.availability === 'available') {
      await bookshelf.upsert({ ...candidate, availability: 'permission-required' });
      await refreshShelf();
    }
    return;
  }
  const fingerprint = await createBookFingerprint(file);
  if (restoreOperation !== restoreId || handoffArrived) return;
  if (fingerprint !== candidate.id) {
    await bookshelf.upsert({ ...candidate, availability: 'missing' });
    await refreshShelf();
    return;
  }
  await openFile(file, candidate.handle, { autoOpen: true, existingEntry: candidate });
}

onMounted(() => {
  shelfActive = true;
  previousThemePreference = themePreference.value;
  if (resolvedTheme.value !== 'dark') setWithoutPersist('dark');
  globalThis.addEventListener('keydown', onKeydown);
  globalThis.addEventListener('keyup', onKeyup);
  globalThis.addEventListener('blur', clearHeldTurnDirections);
  document.addEventListener('fullscreenchange', syncFullscreen);
  const restoreOperation = ++restoreId;
  const handoff = takeHandoff('book');
  if (handoff) {
    handoffArrived = true;
    restoreId += 1;
    void openFile(handoff.file, handoff.handle, { autoOpen: true });
  }
  void restoreLastBook(restoreOperation).catch(() => undefined);
  stopWindowFileHandoff = receiveWindowFileHandoff('book', (file, handle) => {
    handoffArrived = true;
    restoreId += 1;
    void openFile(file, handle, { autoOpen: true });
  });
});

onBeforeUnmount(() => {
  shelfActive = false;
  operationId += 1;
  restoreId += 1;
  stopWindowFileHandoff?.();
  stopWindowFileHandoff = null;
  if (themePreference.value !== previousThemePreference) {
    setPreference(previousThemePreference);
  }
  globalThis.removeEventListener('keydown', onKeydown);
  globalThis.removeEventListener('keyup', onKeyup);
  globalThis.removeEventListener('blur', clearHeldTurnDirections);
  document.removeEventListener('fullscreenchange', syncFullscreen);
  clearHideTimer();
  if (errorHideTimer !== null) window.clearTimeout(errorHideTimer);
  if (tipTimer) globalThis.clearTimeout(tipTimer);
  cancelBuiltinProbe();
  loadController?.abort();
  if (document.fullscreenElement === root.value) void document.exitFullscreen();
  void progressSave.flush().finally(() => disposeReader());
});
</script>

<template>
  <main
    ref="root"
    class="books-page"
    :class="{
      'books-page--dragging': dragging,
      'books-page--ui-hidden': uiHidden,
      'books-page--shelf': !readerMounted,
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
      :accept="BOOK_FILE_ACCEPT"
      aria-label="选择本地书籍"
      @change="onFileChange"
    />

    <BookWelcome
      v-if="!readerMounted && !shelfEntries.length"
      :dragging="dragging"
      @pick="chooseFile"
    />
    <BookshelfView
      v-else-if="!readerMounted"
      :entries="sortedShelfEntries"
      :persistent="persistentShelf"
      @pick="chooseFile"
      @open="openShelfEntry"
      @remove="removeShelfEntry"
    />

    <LoadingBook
      v-if="state === 'LOADING'"
      :message="loadMessage"
      :progress="loadProgress"
      @cancel="returnToShelf()"
    />

    <Transition name="books-toast">
      <p v-if="errorVisible && errorMessage" class="books-toast" role="alert">
        {{ errorMessage }}
      </p>
    </Transition>

    <section
      v-if="readerMounted"
      class="books-reader"
      :class="{ 'books-reader--ready': readerReady }"
      :aria-busy="state === 'LOADING' || pagePreparing"
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
      <div
        v-if="readerReady && pagePreparing"
        class="books-reader__preparing"
        role="status"
        aria-live="polite"
      >
        <span aria-hidden="true"></span>正在整理书页…
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
        :title="currentTitle"
        :can-configure="currentLayout === 'reflowable'"
        @previous="turn('backward')"
        @next="turn('forward')"
        @replace="chooseFile"
        @open="openBook"
        @close="closeBook"
        @shelf="returnToShelf()"
        @toc="toggleReaderPanel('toc')"
        @settings="toggleReaderPanel('settings')"
        @toggle-fullscreen="toggleFullscreen"
      />
      <ReaderPanel
        v-if="readerPanel"
        :mode="readerPanel"
        :toc="currentToc"
        :layout="currentLayout"
        :profile="readerProfile"
        @close="readerPanel = null"
        @navigate="navigateTo"
        @apply="applyReaderProfile"
      />
    </section>

    <div v-if="dragging && readerMounted" class="books-drop-curtain" aria-live="polite">
      <strong>松手，更换这本书</strong>
      <span>新文件仍然只在你的浏览器中处理</span>
    </div>
  </main>
</template>
