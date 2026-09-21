import {
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { PageCache, createPageCacheKey } from '../cache/PageCache';
import { DEFAULT_READER_LAYOUT } from '../publication/defaults';
import { themeColors } from '../reader-theme';
import type {
  BookSnapshot,
  BookStateListener,
  BookDisplayMode,
  PageProvider,
  PageRenderQuality,
  RenderedPage,
  TurnDirection,
} from '../types/reader';
import { resolveBookConfig, type BookConfig } from './BookConfig';
import { BookStateMachine } from './BookStateMachine';
import {
  MAX_DRAG_VELOCITY,
  decayDragVelocity,
  sampleDragVelocity,
  type DragVelocityState,
} from './drag-velocity';
import {
  PAGE_RENDER_PRIORITY,
  insertRenderJob,
  isDroppablePriority,
  shouldRefreshShadow,
} from './render-priority';
import { BookModel } from './book/BookModel';
import {
  getAdjacentSpreadIndex,
  getLastSpreadIndex,
  getSpread,
  getPrimaryPageForSpread,
  getSpreadIndexForPage,
} from './spreads';
import { disposeObject } from './three-utils';
import { progressFromDrag, shouldCommitTurn } from './turn/PageCurl';
import { Spring } from './turn/Spring';

export type BookTheme = 'light' | 'dark';

export interface BookEngineOptions {
  config?: Partial<BookConfig>;
  initialSpreadIndex?: number;
  stateMachine?: BookStateMachine;
  theme?: BookTheme;
  onError?: (error: Error) => void;
  onPagePreparationChange?: (preparing: boolean) => void;
}

export interface BookLoadOptions {
  initialPage?: number;
  initialSpreadIndex?: number;
  publicationCoverCanvas?: HTMLCanvasElement;
}

export interface BookEngineDiagnostics {
  state: BookSnapshot['state'];
  renderFrames: number;
  rendererTextures: number;
  rendererGeometries: number;
  cpuCacheEntries: number;
  cpuCacheBytes: number;
  cpuCacheMaxBytes: number;
  gpuCacheEntries: number;
  gpuCacheBytes: number;
  gpuCacheMaxBytes: number;
  activePageRenders: number;
  queuedPageRenders: number;
  animating: boolean;
  lastInteractionLatencyMs: number | null;
  /** 相邻两次绘制的间隔（指数移动平均，毫秒）；空闲超过 250ms 的间隔不计入。 */
  frameTimeMs: number;
  /** 自上次动画开始以来最长的绘制间隔（毫秒）。 */
  maxFrameMs: number;
  /** 自上次动画开始以来间隔超过 24ms 的帧数。 */
  longFrames: number;
  /** 实际触发阴影贴图重绘的次数。 */
  shadowUpdates: number;
  /** 页面请求被缓存直接满足的次数。 */
  pageCacheHits: number;
  /** 真正发起页面渲染的次数。 */
  pageRenderStarts: number;
  /** 复用进行中渲染（同缓存键）的次数。 */
  pendingPageJoins: number;
}

const LONG_FRAME_MS = 24;
const FRAME_IDLE_GAP_MS = 250;
const FRAME_TIME_SMOOTHING = 0.2;
const READING_WIDTH_BUCKETS = [640, 896, 1280, 1536, 2048] as const;
const PREVIEW_WIDTH_BUCKETS = [320, 512, 768, 1024] as const;

interface DragSession extends DragVelocityState {
  pointerId: number;
  direction: TurnDirection;
  start: Vector3;
  progress: number;
  pointerV: number;
  verticalDrag: number;
  prepared: Promise<void>;
  ready: boolean;
  /** `ready` 首次置位的时刻；用于把页面准备耗时排除在「点击窗口」之外。 */
  readyAt: number | null;
  boundaryClose: boolean;
  focusOnly: boolean;
  targetPage: number | null;
  startedAt: number;
  maxDistancePx: number;
  startClientX: number;
  startClientY: number;
}

interface AnimationHandle {
  frame: number;
  reject: (reason: unknown) => void;
}

interface PageRenderJob {
  priority: number;
  /** 交互让位时可以从队列里摘掉；由 priority 档位推导。 */
  background: boolean;
  signal?: AbortSignal;
  run(): Promise<RenderedPage>;
  resolve(page: RenderedPage): void;
  reject(reason: unknown): void;
}

interface PreparedTurnSpread {
  targetIndex: number;
  left: RenderedPage;
  right: RenderedPage;
}

interface PinchSession {
  startDistance: number;
  startZoom: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const idle = (callback: () => void): number =>
  'requestIdleCallback' in globalThis
    ? globalThis.requestIdleCallback(callback, { timeout: 900 })
    : (globalThis.setTimeout(callback, 180) as unknown as number);

const cancelIdle = (handle: number): void => {
  if ('cancelIdleCallback' in globalThis) globalThis.cancelIdleCallback(handle);
  else globalThis.clearTimeout(handle);
};

function waitForPage<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('书籍页面渲染已取消。', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(new DOMException('书籍页面渲染已取消。', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (reason) => {
        signal.removeEventListener('abort', abort);
        reject(reason);
      },
    );
  });
}

export class BookEngine {
  readonly #host: HTMLElement;
  readonly #options: BookEngineOptions;
  readonly #config: Readonly<BookConfig>;
  readonly #stateMachine: BookStateMachine;
  readonly #memoryLimited: boolean;
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(34, 1, 0.05, 80);
  readonly #renderer: WebGLRenderer;
  readonly #raycaster = new Raycaster();
  readonly #pointerNdc = new Vector2();
  readonly #intersection = new Vector3();
  readonly #bookPlane = new Plane(new Vector3(0, 0, 1), 0);
  readonly #pageCache: PageCache;
  readonly #resizeObserver: ResizeObserver;
  readonly #cleanups: Array<() => void> = [];
  readonly #pendingPages = new Map<string, Promise<RenderedPage>>();
  readonly #renderQueue: PageRenderJob[] = [];
  readonly #activePointers = new Map<number, { x: number; y: number }>();
  #activeRenders = 0;
  #provider: PageProvider | null = null;
  #book: BookModel | null = null;
  #contactShadow: Mesh<PlaneGeometry, MeshBasicMaterial> | null = null;
  #ambientLight: AmbientLight | null = null;
  #keyLight: DirectionalLight | null = null;
  #deskMaterial: MeshStandardMaterial | null = null;
  #theme: BookTheme = 'dark';
  #pageAspect = 0.72;
  #hostWidth = 1;
  #hostHeight = 1;
  #pixelRatio = 1;
  #spreadIndex = 0;
  #currentPage = 1;
  #displayMode: BookDisplayMode = 'spread';
  #appearanceRevision = 0;
  #cameraDistance = 1.8;
  #zoom = 1;
  #focusX = 0;
  #focusY = 0;
  #renderFrame = 0;
  #dragFrame = 0;
  #animation: AnimationHandle | null = null;
  #idleHandle = 0;
  #prefetchIdleHandle = 0;
  #preparationNoticeTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  #backgroundDeadlineTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  #preparationNoticeVisible = false;
  #drag: DragSession | null = null;
  #pinch: PinchSession | null = null;
  #loadController: AbortController | null = null;
  #readingUpgradeController: AbortController | null = null;
  #prefetchController: AbortController | null = null;
  // 后台工作持有两个信号：渲染信号在硬停时才中止，调度信号在交互让位时就会中止。
  // 分开之后「让位」只停止补队，不会打断已经在渲染的那一页（其 promise 仍可被复用）。
  #readingUpgradeScheduleController: AbortController | null = null;
  #prefetchScheduleController: AbortController | null = null;
  #blankPageSource: RenderedPage | null = null;
  #backCoverPageSource: RenderedPage | null = null;
  #blankPageColor = themeColors(DEFAULT_READER_LAYOUT.theme).background;
  #publicationCoverCanvas: HTMLCanvasElement | null = null;
  #disposed = false;
  #generation = 0;
  #spreadRevision = 0;
  #lastTurnDirection: TurnDirection = 'forward';
  #closedEdge: 'front' | 'back' = 'front';
  #cornerPreviewKey: string | null = null;
  #cornerPreviewV = 0.82;
  #preparedTurnSpread: PreparedTurnSpread | null = null;
  #turnPreviewActive = false;
  #interactionStartedAt = 0;
  #lastInteractionLatencyMs: number | null = null;
  #frameTimeMs = 0;
  #maxFrameMs = 0;
  #longFrames = 0;
  #lastFrameAt = 0;
  #shadowUpdates = 0;
  #lastShadowProgress = -1;
  #pageCacheHits = 0;
  #pageRenderStarts = 0;
  #pendingPageJoins = 0;

  constructor(host: HTMLElement, options: BookEngineOptions = {}) {
    this.#host = host;
    this.#options = options;
    this.#config = resolveBookConfig(options.config);
    this.#theme = options.theme ?? 'dark';
    this.#stateMachine = options.stateMachine ?? new BookStateMachine();
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    this.#memoryLimited = deviceMemory < 4;
    this.#pageCache = new PageCache({
      maxBytes: Math.min(
        this.#config.textureBudgetBytes,
        this.#memoryLimited ? 32 * 1024 * 1024 : Infinity,
      ),
      maxEntries: 24,
    });
    this.#scene.background = new Color(0x18191c);
    this.#renderer = new WebGLRenderer({ antialias: true, alpha: false });
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = PCFShadowMap;
    this.#renderer.shadowMap.autoUpdate = false;
    this.#pixelRatio = Math.min(2, globalThis.devicePixelRatio || 1);
    this.#renderer.setPixelRatio(this.#pixelRatio);
    this.#renderer.domElement.tabIndex = 0;
    this.#renderer.domElement.setAttribute('aria-label', '可翻动的仿真书');
    host.append(this.#renderer.domElement);
    this.#createEnvironment();

    this.#resizeObserver = new ResizeObserver(() => this.resize());
    this.#resizeObserver.observe(host);
    this.#listen(this.#renderer.domElement, 'pointerdown', this.#onPointerDown);
    this.#listen(this.#renderer.domElement, 'pointermove', this.#onPointerMove);
    this.#listen(this.#renderer.domElement, 'pointerup', this.#onPointerUp);
    this.#listen(this.#renderer.domElement, 'pointercancel', this.#onPointerCancel);
    this.#listen(this.#renderer.domElement, 'lostpointercapture', this.#onLostPointerCapture);
    this.#listen(this.#renderer.domElement, 'pointerleave', this.#onPointerLeave);
    this.#listen(this.#renderer.domElement, 'wheel', this.#onWheel);
    this.#listen(this.#renderer.domElement, 'contextmenu', (event) => event.preventDefault());
    this.resize();
  }

  get snapshot(): Readonly<BookSnapshot> {
    return this.#stateMachine.snapshot;
  }

  get pageCount(): number {
    return this.#provider?.pageCount ?? 0;
  }

  get spreadIndex(): number {
    return this.#spreadIndex;
  }

  get currentPage(): number {
    return this.#currentPage;
  }

  get displayMode(): BookDisplayMode {
    return this.#displayMode;
  }

  get canGoForward(): boolean {
    return this.#stateMachine.state === 'OPEN' && this.pageCount > 0;
  }

  get canGoBackward(): boolean {
    return this.#stateMachine.state === 'OPEN' && this.pageCount > 0;
  }

  get diagnostics(): Readonly<BookEngineDiagnostics> {
    const surfaces = this.#book?.surfaceMetrics;
    return {
      state: this.#stateMachine.state,
      renderFrames: this.#renderer.info.render.frame,
      rendererTextures: this.#renderer.info.memory.textures,
      rendererGeometries: this.#renderer.info.memory.geometries,
      cpuCacheEntries: this.#pageCache.size,
      cpuCacheBytes: this.#pageCache.byteSize,
      cpuCacheMaxBytes: this.#pageCache.maxBytes,
      gpuCacheEntries: surfaces?.entries ?? 0,
      gpuCacheBytes: surfaces?.byteSize ?? 0,
      gpuCacheMaxBytes: surfaces?.maxBytes ?? 0,
      activePageRenders: this.#activeRenders,
      queuedPageRenders: this.#renderQueue.length,
      animating: this.#animation !== null,
      lastInteractionLatencyMs: this.#lastInteractionLatencyMs,
      frameTimeMs: this.#frameTimeMs,
      maxFrameMs: this.#maxFrameMs,
      longFrames: this.#longFrames,
      shadowUpdates: this.#shadowUpdates,
      pageCacheHits: this.#pageCacheHits,
      pageRenderStarts: this.#pageRenderStarts,
      pendingPageJoins: this.#pendingPageJoins,
    };
  }

  /** 归零累计型诊断计数，便于在一次操作前后对比。 */
  resetDiagnostics(): void {
    this.#frameTimeMs = 0;
    this.#maxFrameMs = 0;
    this.#longFrames = 0;
    this.#lastFrameAt = 0;
    this.#shadowUpdates = 0;
    this.#pageCacheHits = 0;
    this.#pageRenderStarts = 0;
    this.#pendingPageJoins = 0;
  }

  subscribe(listener: BookStateListener): () => void {
    return this.#stateMachine.subscribe(listener);
  }

  async load(provider: PageProvider, options: BookLoadOptions = {}): Promise<void> {
    this.#assertUsable();
    if (this.#stateMachine.state !== 'EMPTY' && this.#stateMachine.state !== 'LOADING') {
      throw new Error('当前书籍尚未释放，无法载入另一本书。');
    }
    if (this.#stateMachine.state === 'EMPTY') {
      this.#stateMachine.transition('LOADING', { pageCount: provider.pageCount });
    } else {
      this.#stateMachine.update({ pageCount: provider.pageCount });
    }
    this.#provider = provider;
    this.#preparedTurnSpread = null;
    this.#publicationCoverCanvas = options.publicationCoverCanvas ?? null;
    const generation = ++this.#generation;
    this.#loadController?.abort();
    const controller = new AbortController();
    this.#loadController = controller;

    try {
      if (provider.pageCount < 1) throw new Error('这本书没有可阅读的页面。');
      const pageSize = await provider.getPageSize(1);
      this.#pageAspect = clamp(pageSize.width / pageSize.height, 0.38, 1.65);
      const initialPage = clamp(Math.trunc(options.initialPage ?? 0), 1, provider.pageCount);
      this.#spreadIndex = options.initialPage
        ? getSpreadIndexForPage(initialPage, provider.pageCount)
        : clamp(
            Math.trunc(options.initialSpreadIndex || this.#options.initialSpreadIndex || 0),
            0,
            getLastSpreadIndex(provider.pageCount),
          );
      this.#currentPage = options.initialPage
        ? initialPage
        : getPrimaryPageForSpread(this.#spreadIndex, provider.pageCount);

      const fallbackCover = options.publicationCoverCanvas
        ? null
        : await this.#getPage(1, 'preview', controller.signal, PAGE_RENDER_PRIORITY.VISIBLE);
      this.#assertGeneration(generation);
      const coverCanvas = options.publicationCoverCanvas ?? fallbackCover?.canvas;
      if (!coverCanvas) throw new Error('无法生成书籍封面。');
      this.#publicationCoverCanvas = coverCanvas;
      this.#blankPageColor = sampleCanvasBackground(coverCanvas, this.#blankPageColor);
      const pageHeight = this.#config.pageHeight;
      const pageWidth = pageHeight * this.#pageAspect;
      this.#book = new BookModel({
        pageWidth,
        pageHeight,
        pageCount: provider.pageCount,
        config: this.#config,
        maxAnisotropy: this.#renderer.capabilities.getMaxAnisotropy(),
        gpuTextureBudgetBytes: Math.min(
          this.#config.gpuTextureBudgetBytes,
          this.#memoryLimited ? 48 * 1024 * 1024 : Infinity,
        ),
      });
      this.resize();
      this.#book.setCover(this.#publicationCoverCanvas);
      this.#scene.add(this.#book.root);
      await this.#showSpread(this.#spreadIndex, 'preview', controller.signal);
      this.#book.setProgress(this.#readingProgress(this.#spreadIndex));
      this.#book.turningSheet.setEdgeKind('paper');
      this.#book.turningSheet.setPages(coverCanvas, this.#blankPage().canvas);
      this.#book.turningSheet.update(0, 'forward');
      this.#setContactOpenProgress(0);
      this.#renderer.shadowMap.needsUpdate = true;
      // WebGL 编译不应继续阻挡正文首屏；给浏览器一个短暂机会完成编译，
      // 超时后让页面先进入可交互状态，后续首帧仍会按需完成编译。
      const compile = this.#renderer.compileAsync(this.#scene, this.#camera).catch(() => undefined);
      await Promise.race([
        compile,
        new Promise<void>((resolve) => globalThis.setTimeout(resolve, 180)),
      ]);
      this.#book.turningSheet.hide();
      this.#assertGeneration(generation);
      this.invalidate();
      this.#stateMachine.transition('CLOSED', {
        pageCount: provider.pageCount,
        spreadIndex: this.#spreadIndex,
        currentPage: this.#currentPage,
        displayMode: this.#displayMode,
      });
      this.#scheduleReadingUpgrade(generation);
      this.#schedulePrefetch(generation);
    } catch (reason) {
      if (controller.signal.aborted || this.#disposed) throw reason;
      const error = reason instanceof Error ? reason : new Error('无法打开这本书。');
      this.#stateMachine.transition('ERROR', { error });
      this.#options.onError?.(error);
      throw error;
    }
  }

  async open(): Promise<void> {
    if (!this.#book || this.#stateMachine.state !== 'CLOSED') return;
    const pointerV = this.#cornerPreviewV;
    this.#resetCornerPreview();
    this.#pauseBackgroundWork();
    this.#stateMachine.transition('OPENING');
    await this.#prepareBoundaryTurn(this.#closedEdge, 0);
    this.#updateBoundaryTurn(0, this.#closedEdge, true, pointerV, 0, false);
    await this.#animate(0, 1, this.#config.clickTurnDuration, (progress) => {
      this.#updateBoundaryTurn(progress, this.#closedEdge, true, pointerV, 0, false);
    });
    this.#settleBoundaryTurn(this.#closedEdge, true);
    this.#stateMachine.transition('OPEN');
    this.invalidate();
    this.#schedulePrefetch(this.#generation);
    this.#scheduleReadingUpgrade(this.#generation);
  }

  async close(edge?: 'front' | 'back'): Promise<void> {
    if (!this.#book || this.#stateMachine.state !== 'OPEN') return;
    const closedEdge = edge ?? this.#closedEdge;
    this.#resetCornerPreview();
    this.#pauseBackgroundWork();
    this.#stateMachine.transition('CLOSING');
    await this.#prepareBoundaryTurn(closedEdge, 1);
    this.#updateBoundaryTurn(0, closedEdge, false, 0.82, 0, false);
    await this.#animate(0, 1, this.#config.clickTurnDuration, (progress) => {
      // 合书时让封面进度提前收敛：前段快速平铺盖住书芯，后段只做书本合拢，
      // 避免动画大部分时间书芯白纸裸露、封面边缘翘起造成的"合上错位"观感。
      const sheetProgress = Math.min(1, progress * 2.2);
      this.#updateBoundaryTurn(progress, closedEdge, false, 0.82, 0, false, sheetProgress);
    });
    this.#settleBoundaryTurn(closedEdge, false);
    this.#closedEdge = closedEdge;
    this.#stateMachine.transition('CLOSED');
    this.invalidate();
  }

  async next(): Promise<void> {
    await this.turn('forward');
  }

  async previous(): Promise<void> {
    await this.turn('backward');
  }

  async goToPage(pageNumber: number): Promise<void> {
    if (!this.#book || this.#stateMachine.state !== 'CLOSED') {
      throw new Error('请先合上书，再切换阅读位置。');
    }
    this.#pauseBackgroundWork();
    const targetIndex = getSpreadIndexForPage(pageNumber, this.pageCount);
    this.#spreadIndex = targetIndex;
    this.#currentPage = pageNumber;
    this.#spreadRevision += 1;
    await this.#showSpreadForInteraction(targetIndex, this.#loadController?.signal);
    this.#book.setProgress(this.#readingProgress(targetIndex));
    this.#stateMachine.update({
      spreadIndex: targetIndex,
      currentPage: pageNumber,
      pageCount: this.pageCount,
    });
    this.#renderer.shadowMap.needsUpdate = true;
    this.invalidate();
    this.#schedulePrefetch(this.#generation);
    this.#scheduleReadingUpgrade(this.#generation);
  }

  #setZoom(zoom: number, focus?: Vector3 | null): void {
    if (this.#disposed) return;
    const nextZoom = clamp(zoom, 1, 2.25);
    if (Math.abs(nextZoom - this.#zoom) < 0.002) return;
    const wasFitted = this.#zoom <= 1.01;
    this.#zoom = nextZoom;
    if (nextZoom <= 1.01) {
      this.#focusX = 0;
      this.#focusY = 0;
    } else if (focus) {
      const pageWidth = this.#config.pageHeight * this.#pageAspect;
      const maximumPanY = this.#config.pageHeight * 0.36 * ((nextZoom - 1) / nextZoom);
      this.#focusX = focus.x < 0 ? -pageWidth / 2 : pageWidth / 2;
      this.#focusY = clamp(focus.y, -maximumPanY, maximumPanY);
    } else if (wasFitted && this.#focusX === 0) {
      this.#focusX = (this.#config.pageHeight * this.#pageAspect) / 2;
    }
    this.#applyCamera();
    this.#scheduleReadingUpgrade(this.#generation);
  }

  async turn(direction: TurnDirection): Promise<void> {
    if (this.#stateMachine.state !== 'OPEN') return;
    this.#resetCornerPreview();
    this.#interactionStartedAt = performance.now();
    if (this.#displayMode === 'focused') {
      const targetPage = this.#currentPage + (direction === 'forward' ? 1 : -1);
      if (targetPage >= 1 && targetPage <= this.pageCount) {
        const targetIndex = getSpreadIndexForPage(targetPage, this.pageCount);
        if (targetIndex === this.#spreadIndex) {
          await this.#focusToPage(targetPage, direction);
          return;
        }
      }
    }
    const target = getAdjacentSpreadIndex(this.#spreadIndex, this.pageCount, direction);
    if (target === null) {
      try {
        await this.close(direction === 'forward' ? 'back' : 'front');
      } catch (reason) {
        this.#handleRuntimeError(reason);
      }
      return;
    }
    this.#yieldBackgroundToInteraction();
    this.#stateMachine.transition('TURNING', { turnDirection: direction });
    try {
      await this.#prepareTurnWithFeedback(direction);
      await this.#animate(0, 1, this.#config.clickTurnDuration, (progress) => {
        this.#updateTurn(progress, direction, 0.82, 0, false);
      });
      await this.#completeTurn(target);
    } catch (reason) {
      this.#handleRuntimeError(reason);
    }
  }

  resize(): void {
    if (this.#disposed) return;
    const width = Math.max(1, this.#host.clientWidth);
    const height = Math.max(1, this.#host.clientHeight);
    this.#hostWidth = width;
    this.#hostHeight = height;
    const pixelRatio = Math.min(2, globalThis.devicePixelRatio || 1);
    if (pixelRatio !== this.#pixelRatio) {
      this.#pixelRatio = pixelRatio;
      this.#renderer.setPixelRatio(pixelRatio);
    }
    this.#renderer.setSize(width, height, false);
    this.#camera.aspect = width / height;
    const nextMode: BookDisplayMode = width <= 760 && height > width ? 'focused' : 'spread';
    const modeChanged = nextMode !== this.#displayMode;
    this.#displayMode = nextMode;
    if (modeChanged && this.#zoom <= 1.05) {
      this.#focusX = this.#displayMode === 'focused' ? this.#focusXForPage(this.#currentPage) : 0;
      this.#focusY = 0;
    }
    const pageWidth = this.#config.pageHeight * this.#pageAspect;
    const bookWidth = this.#displayMode === 'focused' ? pageWidth * 1.16 : pageWidth * 2.16;
    const bookHeight = this.#config.pageHeight * 1.18;
    const verticalFov = (this.#cameraFov() * Math.PI) / 180;
    const safeFrame =
      this.#displayMode === 'focused' ? 1.08 : this.#camera.aspect < 0.9 ? 0.84 : 1.08;
    const fitHeightDistance = bookHeight / (2 * Math.tan(verticalFov / 2) * safeFrame);
    const fitWidthDistance =
      bookWidth / (2 * Math.tan(verticalFov / 2) * this.#camera.aspect * safeFrame);
    this.#cameraDistance = Math.max(fitHeightDistance, fitWidthDistance, 1.58);
    this.#stateMachine.update({
      displayMode: this.#displayMode,
      currentPage: this.#currentPage,
    });
    this.#applyCamera();
  }

  #focusXForPage(pageNumber: number): number {
    if (!this.pageCount || pageNumber < 1) return 0;
    const spread = getSpread(getSpreadIndexForPage(pageNumber, this.pageCount), this.pageCount);
    const pageWidth = this.#config.pageHeight * this.#pageAspect;
    return spread.leftPage === pageNumber ? -pageWidth / 2 : pageWidth / 2;
  }

  async #focusToPage(targetPage: number, direction: TurnDirection): Promise<void> {
    const from = this.#focusX;
    const target = this.#focusXForPage(targetPage);
    this.#pauseBackgroundWork();
    this.#stateMachine.transition('TURNING', { turnDirection: direction });
    try {
      await this.#animate(from, target, 200, (value) => {
        this.#focusX = value;
        this.#applyCamera();
      });
      this.#currentPage = targetPage;
      this.#stateMachine.transition('OPEN', {
        currentPage: targetPage,
        displayMode: this.#displayMode,
      });
      this.invalidate();
      this.#schedulePrefetch(this.#generation);
    } catch (reason) {
      this.#handleRuntimeError(reason);
    }
  }

  #applyCamera(): void {
    const distance = this.#cameraDistance / this.#zoom;
    this.#camera.position.set(this.#focusX, this.#focusY - distance * 0.3, distance);
    this.#camera.lookAt(this.#focusX, this.#focusY, -0.03);
    this.#camera.updateProjectionMatrix();
    this.invalidate();
  }

  invalidate(): void {
    if (this.#disposed || this.#renderFrame) return;
    this.#renderFrame = requestAnimationFrame(() => {
      this.#renderFrame = 0;
      this.#drawScene();
    });
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation += 1;
    this.#loadController?.abort();
    this.#loadController = null;
    this.#readingUpgradeController?.abort();
    this.#readingUpgradeController = null;
    this.#prefetchController?.abort();
    this.#prefetchController = null;
    this.#readingUpgradeScheduleController?.abort();
    this.#readingUpgradeScheduleController = null;
    this.#prefetchScheduleController?.abort();
    this.#prefetchScheduleController = null;
    this.#drag = null;
    this.#cancelDragVisual();
    this.#pinch = null;
    this.#activePointers.clear();
    this.#preparedTurnSpread = null;
    this.#turnPreviewActive = false;
    if (this.#renderFrame) cancelAnimationFrame(this.#renderFrame);
    this.#renderFrame = 0;
    this.#cancelAnimation(new DOMException('仿真书已关闭。', 'AbortError'));
    if (this.#idleHandle) cancelIdle(this.#idleHandle);
    this.#idleHandle = 0;
    if (this.#prefetchIdleHandle) cancelIdle(this.#prefetchIdleHandle);
    this.#prefetchIdleHandle = 0;
    this.#hidePreparationNotice();
    if (this.#backgroundDeadlineTimer) globalThis.clearTimeout(this.#backgroundDeadlineTimer);
    this.#backgroundDeadlineTimer = null;
    this.#resizeObserver.disconnect();
    for (const cleanup of this.#cleanups.splice(0).reverse()) cleanup();
    this.#pageCache.clear();
    this.#pendingPages.clear();
    for (const job of this.#renderQueue.splice(0)) {
      job.reject(new DOMException('书籍页面渲染已取消。', 'AbortError'));
    }
    const provider = this.#provider;
    this.#provider = null;
    const book = this.#book;
    if (book) {
      this.#scene.remove(book.root);
      book.dispose();
    }
    this.#book = null;
    disposeObject(this.#scene);
    this.#blankPageSource?.dispose();
    this.#blankPageSource = null;
    this.#backCoverPageSource?.dispose();
    this.#backCoverPageSource = null;
    if (this.#publicationCoverCanvas) {
      this.#publicationCoverCanvas.width = 1;
      this.#publicationCoverCanvas.height = 1;
      this.#publicationCoverCanvas = null;
    }
    this.#renderer.renderLists.dispose();
    this.#renderer.dispose();
    this.#renderer.forceContextLoss();
    this.#renderer.domElement.remove();
    await provider?.dispose().catch(() => undefined);
  }

  #cameraFov(): number {
    return 34;
  }

  #createEnvironment(): void {
    const ambient = new AmbientLight(0xe4d5c4, 1.24);
    const keyLight = new DirectionalLight(0xffddb3, 1.62);
    keyLight.position.set(-2.8, -2.2, 5.4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 14;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 3;
    keyLight.shadow.camera.bottom = -3;
    keyLight.shadow.bias = -0.00025;
    keyLight.shadow.normalBias = 0.012;
    keyLight.shadow.radius = 3;

    const deskMaterial = new MeshStandardMaterial({
      color: 0x2a211c,
      metalness: 0,
      roughness: 0.92,
    });
    const desk = new Mesh(new PlaneGeometry(22, 16), deskMaterial);
    desk.position.z = -0.24;
    desk.receiveShadow = true;

    const contactTexture = new CanvasTexture(createContactShadowCanvas());
    contactTexture.needsUpdate = true;
    const contact = new Mesh(
      new PlaneGeometry(3.25, 0.64),
      new MeshBasicMaterial({
        map: contactTexture,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
      }),
    );
    contact.position.z = -0.225;
    this.#contactShadow = contact;
    this.#ambientLight = ambient;
    this.#keyLight = keyLight;
    this.#deskMaterial = deskMaterial;
    this.#scene.add(ambient, keyLight, desk, contact);
    this.#applyTheme();
  }

  /** 应用当前主题的环境配色：场景背景、灯光与桌面材质。 */
  #applyTheme(): void {
    const ambient = this.#ambientLight;
    const key = this.#keyLight;
    const deskMaterial = this.#deskMaterial;
    if (this.#theme === 'light') {
      this.#scene.background = new Color(0xe4e2dd);
      ambient?.color.setHex(0xf3f2ee);
      if (ambient) ambient.intensity = 1.1;
      key?.color.setHex(0xffffff);
      if (key) key.intensity = 1.1;
      deskMaterial?.color.setHex(0xd4d3cf);
    } else {
      this.#scene.background = new Color(0x18191c);
      ambient?.color.setHex(0xe2e3e5);
      if (ambient) ambient.intensity = 1.24;
      key?.color.setHex(0xfff8eb);
      if (key) key.intensity = 1.46;
      deskMaterial?.color.setHex(0x292a2d);
    }
  }

  /** 切换阅读环境的主题配色。 */
  setTheme(theme: BookTheme): void {
    if (this.#theme === theme) return;
    this.#theme = theme;
    this.#applyTheme();
    this.invalidate();
  }

  /**
   * 更新占位空白页的纸色（跨页缺页与封面内侧使用）。
   *
   * 载入时这个颜色由封面采样得到，但 `sampleCanvasBackground` 的亮度下限会拒绝深色，
   * 所以暗色阅读主题永远采不到正确值、只能落到纸白默认色。宿主应在载入前与阅读主题
   * 变更时显式调用本方法（`reader-theme.ts` 是纸色的唯一来源）。
   *
   * 缓存的占位页会作废，下一次取用时按新颜色重建；正在展示的占位页要等宿主随后的
   * 重新排版（`refreshPages()`）才会换上新画布。
   */
  setBlankPageColor(color: string): void {
    if (this.#blankPageColor === color) return;
    this.#blankPageColor = color;
    this.#blankPageSource?.dispose();
    this.#blankPageSource = null;
  }

  async refreshPages(): Promise<void> {
    if (!this.#provider || !this.#book || this.#disposed) return;
    this.#pauseBackgroundWork();
    this.#appearanceRevision += 1;
    await this.#showSpreadForInteraction(this.#spreadIndex, this.#loadController?.signal);
    if (this.#displayMode === 'focused' && this.#zoom <= 1.05) {
      this.#focusX = this.#focusXForPage(this.#currentPage);
      this.#focusY = 0;
      this.#applyCamera();
    }
    this.#spreadRevision += 1;
    this.#book.turningSheet.hide();
    this.#touchStaticPages();
    this.invalidate();
    this.#schedulePrefetch(this.#generation);
  }

  #setContactOpenProgress(progress: number): void {
    const contact = this.#contactShadow;
    if (!contact) return;
    const openProgress = clamp(progress, 0, 1);
    contact.scale.x = 0.56 + openProgress * 0.44;
    contact.material.opacity = 0.08 + openProgress * 0.06;
  }

  async #showSpread(
    spreadIndex: number,
    quality: PageRenderQuality,
    signal?: AbortSignal,
  ): Promise<void> {
    const spread = getSpread(spreadIndex, this.pageCount);
    const [left, right] = await Promise.all([
      spread.leftPage
        ? this.#getPage(spread.leftPage, quality, signal, PAGE_RENDER_PRIORITY.VISIBLE)
        : this.#blankPage(),
      spread.rightPage
        ? this.#getPage(spread.rightPage, quality, signal, PAGE_RENDER_PRIORITY.VISIBLE)
        : this.#blankPage(),
    ]);
    this.#book?.setStaticPages(left.canvas, right.canvas);
    this.#touchStaticPages();
    this.invalidate();
  }

  async #showSpreadForInteraction(spreadIndex: number, signal?: AbortSignal): Promise<void> {
    const spread = getSpread(spreadIndex, this.pageCount);
    const [left, right] = await Promise.all([
      spread.leftPage ? this.#getInteractionPage(spread.leftPage, signal) : this.#blankPage(),
      spread.rightPage ? this.#getInteractionPage(spread.rightPage, signal) : this.#blankPage(),
    ]);
    this.#book?.setStaticPages(left.canvas, right.canvas);
    this.#touchStaticPages();
    this.invalidate();
  }

  async #prepareTurnWithFeedback(direction: TurnDirection): Promise<void> {
    this.#hidePreparationNotice();
    // 提示只在准备确实偏慢时出现；正常翻页（含预热命中）应完全看不到它。
    this.#preparationNoticeTimer = globalThis.setTimeout(() => {
      this.#preparationNoticeTimer = null;
      this.#preparationNoticeVisible = true;
      this.#options.onPagePreparationChange?.(true);
    }, 250);
    try {
      await this.#prepareTurn(direction);
    } finally {
      this.#hidePreparationNotice();
    }
  }

  /**
   * 拖拽起手时用现有素材同步摆出纸面姿态：就位时可见的那一面总是当前正在展示的静态页
   * （前翻取右页、后翻取左页），背面优先取缓存、未命中时退回空白纸。
   * 这样纸张在第一帧就跟随指针，不必等 #prepareTurn 渲染完新页面位图。
   * 返回是否成功建立预览；失败时调用方回退到「准备完成才跟手」的原行为。
   */
  #beginTurnPreview(direction: TurnDirection, pointerV: number): boolean {
    const book = this.#book;
    if (!book) return false;
    const targetIndex = getAdjacentSpreadIndex(this.#spreadIndex, this.pageCount, direction);
    if (targetIndex === null) return false;
    const staticPages = book.staticPageCanvases;
    const visibleCanvas = direction === 'forward' ? staticPages.right : staticPages.left;
    if (!visibleCanvas) return false;
    const target = getSpread(targetIndex, this.pageCount);
    const backPageNumber = direction === 'forward' ? target.leftPage : target.rightPage;
    const backCanvas =
      (backPageNumber ? this.#getCachedPage(backPageNumber)?.canvas : null) ??
      this.#blankPage().canvas;
    // 不调用 setTurnPreparationPage：抬高静态页会让它盖住已经可见的翻页纸面。
    book.turningSheet.setEdgeKind('paper');
    if (direction === 'forward') book.turningSheet.setPages(visibleCanvas, backCanvas);
    else book.turningSheet.setPages(backCanvas, visibleCanvas);
    this.#turnPreviewActive = true;
    this.#updateTurn(0, direction, pointerV, 0);
    return true;
  }

  async #prepareTurn(direction: TurnDirection): Promise<void> {
    const targetIndex = getAdjacentSpreadIndex(this.#spreadIndex, this.pageCount, direction);
    const book = this.#book;
    if (targetIndex === null || !book) throw new Error('已经到达书籍边缘。');
    this.#preparedTurnSpread = null;
    const controller = this.#loadController ?? new AbortController();
    const current = getSpread(this.#spreadIndex, this.pageCount);
    const target = getSpread(targetIndex, this.pageCount);
    const frontPage = direction === 'forward' ? current.rightPage : target.rightPage;
    const backPage = direction === 'forward' ? target.leftPage : current.leftPage;
    const underLeftPage = direction === 'forward' ? current.leftPage : target.leftPage;
    const underRightPage = direction === 'forward' ? target.rightPage : current.rightPage;
    // 拖拽预览已经让纸面可见时不能再抬高静态页，否则静态页会盖住正在跟随指针的纸张。
    const previewing = this.#turnPreviewActive;
    this.#turnPreviewActive = false;
    if (!previewing) book.setTurnPreparationPage(direction === 'forward' ? 'right' : 'left');
    this.#markAnimatedShadow();
    this.invalidate();
    try {
      const [front, back, underLeft, underRight] = await Promise.all([
        frontPage ? this.#getInteractionPage(frontPage, controller.signal) : this.#blankPage(),
        backPage ? this.#getInteractionPage(backPage, controller.signal) : this.#blankPage(),
        underLeftPage
          ? this.#getInteractionPage(underLeftPage, controller.signal)
          : this.#blankPage(),
        underRightPage
          ? this.#getInteractionPage(underRightPage, controller.signal)
          : this.#blankPage(),
      ]);
      book.setTurnPreparationPage(null);
      book.setStaticPages(underLeft.canvas, underRight.canvas);
      book.turningSheet.setEdgeKind('paper');
      book.turningSheet.setPages(front.canvas, back.canvas);
      const textures = book.prewarmSurfaces([
        front.canvas,
        back.canvas,
        underLeft.canvas,
        underRight.canvas,
      ]);
      for (const texture of textures) this.#renderer.initTexture(texture);
      this.#preparedTurnSpread = {
        targetIndex,
        left: direction === 'forward' ? back : underLeft,
        right: direction === 'forward' ? underRight : front,
      };
      // 动画期间这 4 页都在用，触到队尾避免被后续渲染挤出缓存后纸面变白。
      this.#touchPageEntries([frontPage, backPage, underLeftPage, underRightPage]);
      book.pruneSurfaces();
      // 素材到位时用户可能已经拖开一段距离，必须沿用当前进度，否则纸张会弹回起点。
      const drag = this.#drag;
      if (drag?.ready) {
        this.#updateTurn(drag.progress, direction, drag.pointerV, drag.verticalDrag, false);
      } else {
        book.turningSheet.update(0, direction);
      }
      // 纸面就绪姿态关闭纸边与投影，需要重绘阴影贴图。
      this.#markAnimatedShadow();
      this.invalidate();
    } catch (reason) {
      book.setTurnPreparationPage(null);
      this.#markAnimatedShadow();
      this.invalidate();
      throw reason;
    }
  }

  async #prepareBoundaryTurn(edge: 'front' | 'back', initialOpenProgress: 0 | 1): Promise<void> {
    const book = this.#book;
    if (!book) throw new Error('仿真书尚未准备完成。');
    const spread = getSpread(this.#spreadIndex, this.pageCount);
    const movingPageNumber = edge === 'front' ? spread.leftPage : spread.rightPage;
    const movingPage = movingPageNumber
      ? await this.#getInteractionPage(movingPageNumber, this.#loadController?.signal)
      : this.#blankPage();
    const coverPage =
      edge === 'front'
        ? (this.#publicationCoverCanvas ?? this.#blankPage().canvas)
        : this.#backCoverPage().canvas;
    if (edge === 'front') book.turningSheet.setPages(coverPage, movingPage.canvas);
    else book.turningSheet.setPages(movingPage.canvas, coverPage);
    book.turningSheet.setEdgeKind('cover', edge === 'front' ? 'front' : 'back');
    book.beginBoundaryTurn(edge, initialOpenProgress);
    book.pruneSurfaces();
    this.invalidate();
  }

  #updateTurn(
    progress: number,
    direction: TurnDirection,
    pointerV: number,
    verticalDrag: number,
    scheduleRender = true,
  ): void {
    this.#markInteractionVisible();
    this.#book?.turningSheet.update(progress, direction, pointerV, verticalDrag);
    const fractionalSpread = this.#spreadIndex + (direction === 'forward' ? progress : -progress);
    this.#book?.setProgress(this.#readingProgress(fractionalSpread));
    this.#markAnimatedShadow(progress);
    if (scheduleRender) this.invalidate();
  }

  #updateBoundaryTurn(
    progress: number,
    edge: 'front' | 'back',
    opening: boolean,
    pointerV = 0.82,
    verticalDrag = 0,
    scheduleRender = true,
    sheetProgress = progress,
  ): void {
    this.#markInteractionVisible();
    const direction: TurnDirection =
      edge === 'front' ? (opening ? 'forward' : 'backward') : opening ? 'backward' : 'forward';
    this.#book?.turningSheet.update(sheetProgress, direction, pointerV, verticalDrag);
    const openProgress = opening ? progress : 1 - progress;
    this.#book?.setBoundaryOpenProgress(openProgress, edge);
    this.#setContactOpenProgress(openProgress);
    this.#markAnimatedShadow(sheetProgress);
    if (scheduleRender) this.invalidate();
  }

  #settleBoundaryTurn(edge: 'front' | 'back', open: boolean): void {
    const book = this.#book;
    if (!book) return;
    book.turningSheet.hide();
    book.settleBoundaryTurn(edge, open);
    this.#renderer.shadowMap.needsUpdate = true;
    // 边界开合会同时切换动态纸张、封面和页束。连续提交两次且不让出绘制时机，
    // 避免浏览器把首个阴影/可见性预热帧呈现给用户。
    this.#renderAnimationFrame();
    this.#renderAnimationFrame();
  }

  async #completeTurn(targetIndex: number): Promise<void> {
    this.#lastTurnDirection = targetIndex >= this.#spreadIndex ? 'forward' : 'backward';
    this.#spreadIndex = targetIndex;
    this.#currentPage =
      this.#displayMode === 'focused'
        ? clamp(
            this.#currentPage + (this.#lastTurnDirection === 'forward' ? 1 : -1),
            1,
            this.pageCount,
          )
        : getPrimaryPageForSpread(targetIndex, this.pageCount);
    this.#spreadRevision += 1;
    const preparedSpread = this.#preparedTurnSpread;
    this.#preparedTurnSpread = null;
    if (preparedSpread?.targetIndex === targetIndex) {
      this.#book?.setStaticPages(preparedSpread.left.canvas, preparedSpread.right.canvas);
    } else {
      await this.#showSpreadForInteraction(targetIndex, this.#loadController?.signal);
    }
    this.#touchStaticPages();
    this.#book?.turningSheet.hide();
    this.#book?.setProgress(this.#readingProgress(targetIndex));
    this.#renderer.shadowMap.needsUpdate = true;
    // 落地静态页和动态纸张在同一绘制提交中交接，避免中间帧同时显示两张纸面。
    this.#renderAnimationFrame();
    this.#stateMachine.transition('OPEN', {
      spreadIndex: targetIndex,
      currentPage: this.#currentPage,
      displayMode: this.#displayMode,
      pageCount: this.pageCount,
    });
    this.#schedulePrefetch(this.#generation, true);
    this.#scheduleReadingUpgrade(this.#generation);
  }

  async #restoreCurrentSpread(): Promise<void> {
    this.#preparedTurnSpread = null;
    await this.#showSpreadForInteraction(this.#spreadIndex, this.#loadController?.signal);
    this.#touchStaticPages();
    this.#book?.turningSheet.hide();
    this.#book?.setProgress(this.#readingProgress(this.#spreadIndex));
    this.#renderer.shadowMap.needsUpdate = true;
    this.invalidate();
  }

  #readingProgress(spreadIndex: number): number {
    const last = getLastSpreadIndex(this.pageCount);
    return last === 0 ? 0 : clamp(spreadIndex / last, 0, 1);
  }

  async #getPage(
    pageNumber: number,
    quality: PageRenderQuality,
    signal?: AbortSignal,
    priority: number = PAGE_RENDER_PRIORITY.BACKGROUND,
  ): Promise<RenderedPage> {
    const provider = this.#provider;
    if (!provider) throw new Error('尚未载入书籍。');
    const targetWidth = this.#targetTextureWidth(quality);
    const key = createPageCacheKey(pageNumber, targetWidth, quality, this.#appearanceRevision);
    const cached = this.#pageCache.get(key);
    if (cached) {
      this.#pageCacheHits += 1;
      return cached;
    }
    const pending = this.#pendingPages.get(key);
    if (pending) {
      this.#pendingPageJoins += 1;
      try {
        return await waitForPage(pending, signal);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === 'AbortError') || signal?.aborted) {
          throw reason;
        }
      }
    }
    const generation = this.#generation;
    this.#pageRenderStarts += 1;
    const render = this.#schedulePageRender(
      () => provider.renderPage(pageNumber, { targetWidth, quality, priority, signal }),
      signal,
      priority,
    )
      .then((page) => {
        if (this.#disposed || generation !== this.#generation || signal?.aborted) {
          page.dispose();
          throw new DOMException('书籍页面渲染已取消。', 'AbortError');
        }
        // 素材还没齐（插图未解码）的临时位图不进缓存：照常交付展示，
        // 下一次请求同页时按完备素材重新渲染，缺图不会以缓存的形式固定下来。
        if (page.provisional) return page;
        this.#pageCache.set(key, page);
        return this.#pageCache.get(key) ?? page;
      })
      .finally(() => {
        if (this.#pendingPages.get(key) === render) this.#pendingPages.delete(key);
      });
    this.#pendingPages.set(key, render);
    return render;
  }

  #schedulePageRender(
    run: () => Promise<RenderedPage>,
    signal?: AbortSignal,
    priority: number = PAGE_RENDER_PRIORITY.BACKGROUND,
  ): Promise<RenderedPage> {
    return new Promise((resolve, reject) => {
      const finish =
        <T>(callback: (value: T) => void) =>
        (value: T): void => {
          signal?.removeEventListener('abort', abort);
          callback(value);
        };
      const job: PageRenderJob = {
        priority,
        background: isDroppablePriority(priority),
        run,
        signal,
        resolve: finish(resolve),
        reject: finish(reject),
      };
      const abort = (): void => {
        const index = this.#renderQueue.indexOf(job);
        if (index < 0) return;
        this.#renderQueue.splice(index, 1);
        job.reject(new DOMException('书籍页面渲染已取消。', 'AbortError'));
      };
      signal?.addEventListener('abort', abort, { once: true });
      insertRenderJob(this.#renderQueue, job);
      this.#drainRenderQueue();
    });
  }

  #drainRenderQueue(): void {
    const concurrency = Math.max(1, Math.trunc(this.#provider?.renderConcurrency ?? 2));
    while (!this.#disposed && this.#activeRenders < concurrency && this.#renderQueue.length) {
      const job = this.#renderQueue.shift();
      if (!job) return;
      if (job.signal?.aborted) {
        job.reject(new DOMException('书籍页面渲染已取消。', 'AbortError'));
        continue;
      }
      this.#activeRenders += 1;
      void job
        .run()
        .then(job.resolve, job.reject)
        .finally(() => {
          this.#activeRenders -= 1;
          this.#drainRenderQueue();
        });
    }
  }

  #getInteractionPage(pageNumber: number, signal?: AbortSignal): Promise<RenderedPage> {
    // 命中计数由 #getCachedPage 负责。
    const cached = this.#getCachedPage(pageNumber);
    if (cached) return Promise.resolve(cached);
    return this.#getPage(pageNumber, 'reading', signal, PAGE_RENDER_PRIORITY.INTERACTION);
  }

  /**
   * 取可用的缓存位图：优先精确键，否则退到同页最宽的可用位图。
   * `countHit` 为 false 时只做 LRU 触碰、不计入诊断命中 ——
   * 内部的触碰型调用（#touchStaticPages / #touchPageEntries）不该抬高命中读数。
   */
  #getCachedPage(pageNumber: number, countHit = true): RenderedPage | undefined {
    for (const quality of ['reading', 'preview'] as const) {
      const targetWidth = this.#targetTextureWidth(quality);
      const cached = this.#pageCache.get(
        createPageCacheKey(pageNumber, targetWidth, quality, this.#appearanceRevision),
      );
      if (cached) {
        if (countHit) this.#pageCacheHits += 1;
        return cached;
      }
    }
    // 精确键未命中时退到同页最宽的可用位图（缩放跨桶、窗口尺寸变化后常见）。
    // 必须限定当前外观版本：换主题后旧位图的配色已失效。再加宽度下限，
    // 避免用明显更小的位图顶替当前目标而掉清晰度。
    const target = this.#targetTextureWidth('reading');
    const best = this.#pageCache.getBest(pageNumber, ['reading'], this.#appearanceRevision);
    if (best && best.targetWidth >= target * 0.7) {
      if (countHit) this.#pageCacheHits += 1;
      return best;
    }
    return undefined;
  }

  /**
   * 把指定页正在使用的缓存项触到 LRU 队尾，保证动画期间不被驱逐 ——
   * 被驱逐会 dispose() 画布，正在使用的 CanvasTexture 会变空白。
   *
   * 必须走 #getCachedPage 解析：展示的位图可能来自跨桶回退（targetWidth 与当前目标不同），
   * 直接 touch 精确键会保护到另一个对象，真正被引用的那张仍可能被驱逐。
   */
  #touchPageEntries(pageNumbers: readonly (number | null)[]): void {
    for (const pageNumber of pageNumbers) {
      if (!pageNumber) continue;
      this.#getCachedPage(pageNumber, false);
    }
  }

  // 正在展示的静态页不允许被 PageCache 按 LRU 驱逐：被驱逐后阅读升级会
  // 重新渲染（字体已加载的像素与翻页素材不同）并整体替换纹理，造成
  // 翻页完成后的文字弹变。落页时把静态页的缓存项触到队尾保护起来。
  #touchStaticPages(): void {
    const spread = getSpread(this.#spreadIndex, this.pageCount);
    for (const pageNumber of [spread.leftPage, spread.rightPage]) {
      if (!pageNumber) continue;
      this.#getCachedPage(pageNumber, false);
    }
  }

  #targetTextureWidth(quality: PageRenderQuality): number {
    const width = Math.max(320, this.#hostWidth);
    const height = Math.max(260, this.#hostHeight);
    const cssWidth = Math.min(width * 0.42, height * 0.61 * this.#pageAspect);
    const ratio = quality === 'reading' ? 1 : this.#memoryLimited ? 0.52 : 0.7;
    const edgeLimit =
      this.#config.maxTextureEdge * (quality === 'reading' && this.#memoryLimited ? 0.72 : 1);
    const rawWidth = Math.max(
      quality === 'reading' ? 640 : 320,
      Math.min(
        edgeLimit * Math.min(1, this.#pageAspect),
        Math.round(cssWidth * this.#pixelRatio * ratio * this.#zoom),
      ),
    );
    const buckets = quality === 'reading' ? READING_WIDTH_BUCKETS : PREVIEW_WIDTH_BUCKETS;
    const maximumWidth = Math.max(
      quality === 'reading' ? 640 : 320,
      edgeLimit * Math.min(1, this.#pageAspect),
    );
    const cappedWidth = Math.min(rawWidth, maximumWidth);
    let fallbackWidth: number | null = null;
    for (const bucket of buckets) {
      if (bucket > maximumWidth + 0.5) break;
      fallbackWidth = bucket;
      if (bucket >= cappedWidth) return bucket;
    }
    return fallbackWidth ?? Math.round(maximumWidth);
  }

  #blankPage(): RenderedPage {
    if (this.#blankPageSource) return this.#blankPageSource;
    const width = Math.round(this.#targetTextureWidth('reading'));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round(width / this.#pageAspect);
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = this.#blankPageColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    this.#blankPageSource = {
      pageNumber: 0,
      canvas,
      width: canvas.width,
      height: canvas.height,
      targetWidth: width,
      quality: 'reading',
      byteSize: canvas.width * canvas.height * 4,
      dispose: () => {
        canvas.width = 0;
        canvas.height = 0;
      },
    };
    return this.#blankPageSource;
  }

  #backCoverPage(): RenderedPage {
    if (this.#backCoverPageSource) return this.#backCoverPageSource;
    const width = Math.round(this.#targetTextureWidth('reading'));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round(width / this.#pageAspect);
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#5d3327';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    this.#backCoverPageSource = {
      pageNumber: -1,
      canvas,
      width: canvas.width,
      height: canvas.height,
      targetWidth: width,
      quality: 'reading',
      byteSize: canvas.width * canvas.height * 4,
      dispose: () => {
        canvas.width = 0;
        canvas.height = 0;
      },
    };
    return this.#backCoverPageSource;
  }

  #scheduleReadingUpgrade(generation: number): void {
    if (this.#idleHandle) cancelIdle(this.#idleHandle);
    this.#readingUpgradeController?.abort();
    this.#readingUpgradeScheduleController?.abort();
    const controller = new AbortController();
    const scheduleController = new AbortController();
    this.#readingUpgradeController = controller;
    this.#readingUpgradeScheduleController = scheduleController;
    this.#idleHandle = idle(() => {
      this.#idleHandle = 0;
      const spreadIndex = this.#spreadIndex;
      const spreadRevision = this.#spreadRevision;
      if (
        this.#disposed ||
        scheduleController.signal.aborted ||
        generation !== this.#generation ||
        (this.#stateMachine.state !== 'OPEN' && this.#stateMachine.state !== 'CLOSED')
      ) {
        return;
      }
      const spread = getSpread(spreadIndex, this.pageCount);
      void Promise.all([
        spread.leftPage
          ? this.#getPage(
              spread.leftPage,
              'reading',
              controller.signal,
              PAGE_RENDER_PRIORITY.UPGRADE,
            )
          : this.#blankPage(),
        spread.rightPage
          ? this.#getPage(
              spread.rightPage,
              'reading',
              controller.signal,
              PAGE_RENDER_PRIORITY.UPGRADE,
            )
          : this.#blankPage(),
      ])
        .then(([left, right]) => {
          if (
            this.#disposed ||
            generation !== this.#generation ||
            spreadRevision !== this.#spreadRevision ||
            spreadIndex !== this.#spreadIndex ||
            controller.signal.aborted ||
            (this.#stateMachine.state !== 'OPEN' && this.#stateMachine.state !== 'CLOSED')
          ) {
            return;
          }
          const current = this.#book?.staticPageCanvases;
          // 升级渲染与翻页素材同源（静态页已在缓存中）时无需替换，
          // 避免无谓的纹理交接帧；仅在放大或重渲染出更高分辨率时更新。
          if (current && left.canvas === current.left && right.canvas === current.right) return;
          this.#book?.setStaticPages(left.canvas, right.canvas);
          this.invalidate();
        })
        .catch(() => undefined);
    });
    this.#armBackgroundDeadline();
  }

  #schedulePrefetch(generation: number, immediate = false): void {
    if (this.#prefetchIdleHandle) cancelIdle(this.#prefetchIdleHandle);
    this.#prefetchIdleHandle = 0;
    this.#prefetchController?.abort();
    this.#prefetchScheduleController?.abort();
    const controller = new AbortController();
    const scheduleController = new AbortController();
    this.#prefetchController = controller;
    this.#prefetchScheduleController = scheduleController;
    const start = (): void => {
      if (
        this.#disposed ||
        scheduleController.signal.aborted ||
        generation !== this.#generation ||
        (this.#stateMachine.state !== 'OPEN' && this.#stateMachine.state !== 'CLOSED')
      ) {
        return;
      }
      const pageNumbers = new Set<number>();
      const direction = this.#lastTurnDirection === 'forward' ? 1 : -1;
      // 队列只取 4 页（= 2 个跨页），排在第三位之后的 spread 永远轮不到预热。
      // 因此把「反方向」放在第二位：否则用户掉头时那一跨页是冷的。实测（慢章节 EPUB、
      // dpr2 的 1280 桶）换序前掉头翻页会多出 4~5 次全页截图（命中 3 次 vs 换序后的
      // 9 次），每次截图约 95ms 且落在主线程上；换序后为 0 次。当前方向 1 个跨页的
      // 深度足够 —— 预热 4 页能在一次 720ms 翻页动画内跑完，用户来不及连翻两次。
      const spreadQueue = [
        this.#spreadIndex + direction,
        this.#spreadIndex - direction,
        this.#spreadIndex + direction * 2,
        this.#spreadIndex + direction * 3,
      ];
      for (const index of spreadQueue) {
        if (index < 0 || index > getLastSpreadIndex(this.pageCount)) continue;
        const spread = getSpread(index, this.pageCount);
        if (spread.leftPage) pageNumbers.add(spread.leftPage);
        if (spread.rightPage) pageNumbers.add(spread.rightPage);
      }
      const queue = [...pageNumbers].slice(0, this.#memoryLimited ? 2 : 4);
      const work = async (): Promise<void> => {
        while (
          !this.#disposed &&
          !scheduleController.signal.aborted &&
          generation === this.#generation
        ) {
          const pageNumber = queue.shift();
          if (!pageNumber) return;
          // 与翻页素材同质量预热，翻页时缓存直接命中，避免落页后的质量跳变。
          // 限量渲染避免驱逐正在展示的静态页（由 #touchStaticPages 保护）。
          await this.#getPage(
            pageNumber,
            'reading',
            controller.signal,
            PAGE_RENDER_PRIORITY.PREFETCH,
          ).catch(() => undefined);
          // 每完成一页就续期，只有连续无进展时才让位，避免慢章节渲染到一半被丢弃。
          this.#armBackgroundDeadline();
        }
      };
      void Promise.all([work(), work()]);
    };
    // 落页后立即起第一页：idle 回调在连续翻页时可能拖到 900ms 之后才执行，
    // 那时下一次翻页已经开始，预热等于白做。
    if (immediate) start();
    else {
      this.#prefetchIdleHandle = idle(() => {
        this.#prefetchIdleHandle = 0;
        start();
      });
    }
    this.#armBackgroundDeadline();
  }

  #pauseBackgroundWork(): void {
    this.#cancelBackgroundSchedule();
    this.#readingUpgradeController?.abort();
    this.#readingUpgradeController = null;
    this.#prefetchController?.abort();
    this.#prefetchController = null;
    this.#readingUpgradeScheduleController?.abort();
    this.#readingUpgradeScheduleController = null;
    this.#prefetchScheduleController?.abort();
    this.#prefetchScheduleController = null;
    this.#preparedTurnSpread = null;
  }

  /**
   * 交互让位：停止后台工作的补队并从队列里摘掉可丢弃任务，
   * 但不打断已经在渲染的那一页 —— 它的 promise 仍留在 #pendingPages 中，
   * 翻页请求同一页时可以直接复用，而不是从头再渲染一遍。
   */
  #yieldBackgroundToInteraction(): void {
    this.#cancelBackgroundSchedule();
    this.#readingUpgradeScheduleController?.abort();
    this.#readingUpgradeScheduleController = null;
    this.#prefetchScheduleController?.abort();
    this.#prefetchScheduleController = null;
    for (let index = this.#renderQueue.length - 1; index >= 0; index -= 1) {
      const job = this.#renderQueue[index];
      if (!job.background) continue;
      this.#renderQueue.splice(index, 1);
      job.reject(new DOMException('书籍页面渲染已取消。', 'AbortError'));
    }
  }

  /** 取消后台工作的排队时机：idle 回调与硬截止计时器。 */
  #cancelBackgroundSchedule(): void {
    if (this.#backgroundDeadlineTimer) {
      globalThis.clearTimeout(this.#backgroundDeadlineTimer);
      this.#backgroundDeadlineTimer = null;
    }
    if (this.#idleHandle) cancelIdle(this.#idleHandle);
    this.#idleHandle = 0;
    if (this.#prefetchIdleHandle) cancelIdle(this.#prefetchIdleHandle);
    this.#prefetchIdleHandle = 0;
  }

  #armBackgroundDeadline(): void {
    if (this.#backgroundDeadlineTimer) globalThis.clearTimeout(this.#backgroundDeadlineTimer);
    this.#backgroundDeadlineTimer = globalThis.setTimeout(() => {
      this.#backgroundDeadlineTimer = null;
      this.#yieldBackgroundToInteraction();
    }, 1850);
  }

  #hidePreparationNotice(): void {
    if (this.#preparationNoticeTimer) globalThis.clearTimeout(this.#preparationNoticeTimer);
    this.#preparationNoticeTimer = null;
    if (!this.#preparationNoticeVisible) return;
    this.#preparationNoticeVisible = false;
    this.#options.onPagePreparationChange?.(false);
  }

  #animate(
    from: number,
    to: number,
    duration: number,
    update: (value: number) => void,
    useDefaultEasing = true,
  ): Promise<void> {
    this.#cancelAnimation(new DOMException('动画已被新操作替换。', 'AbortError'));
    this.#resetFrameWindow();
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const safeDuration = reduced ? 1 : Math.max(1, duration);
    return new Promise((resolve, reject) => {
      const startedAt = performance.now();
      const frame = (now: number): void => {
        const progress = clamp((now - startedAt) / safeDuration, 0, 1);
        const eased = useDefaultEasing
          ? progress < 0.5
            ? 4 * progress ** 3
            : 1 - (-2 * progress + 2) ** 3 / 2
          : progress;
        update(from + (to - from) * eased);
        this.#renderAnimationFrame();
        if (progress < 1 && !this.#disposed) {
          const nextFrame = requestAnimationFrame(frame);
          if (this.#animation) this.#animation.frame = nextFrame;
          return;
        }
        this.#animation = null;
        resolve();
      };
      this.#animation = { frame: requestAnimationFrame(frame), reject };
    });
  }

  #animateSpring(
    from: number,
    target: number,
    velocity: number,
    update: (value: number) => void,
  ): Promise<void> {
    this.#cancelAnimation(new DOMException('动画已被新操作替换。', 'AbortError'));
    this.#resetFrameWindow();
    const maximumInitialVelocity = Math.min(MAX_DRAG_VELOCITY, Math.abs(target - from) * 8);
    const spring = new Spring({
      initialPosition: from,
      initialVelocity: clamp(velocity, -maximumInitialVelocity, maximumInitialVelocity),
      target,
    });
    const advances = target >= from;
    return new Promise((resolve, reject) => {
      let previous = performance.now();
      const frame = (now: number): void => {
        const value = spring.step((now - previous) / 1000);
        previous = now;
        if ((advances && value >= target) || (!advances && value <= target)) {
          spring.settle();
          update(target);
          this.#renderAnimationFrame();
          this.#animation = null;
          resolve();
          return;
        }
        update(clamp(value, 0, 1));
        this.#renderAnimationFrame();
        if (!spring.isSettled() && !this.#disposed) {
          const nextFrame = requestAnimationFrame(frame);
          if (this.#animation) this.#animation.frame = nextFrame;
          return;
        }
        spring.settle();
        update(target);
        this.#renderAnimationFrame();
        this.#animation = null;
        resolve();
      };
      this.#animation = { frame: requestAnimationFrame(frame), reject };
    });
  }

  #cancelAnimation(reason: unknown): void {
    if (!this.#animation) return;
    cancelAnimationFrame(this.#animation.frame);
    this.#animation.reject(reason);
    this.#animation = null;
  }

  #renderAnimationFrame(): void {
    if (this.#renderFrame) cancelAnimationFrame(this.#renderFrame);
    this.#renderFrame = 0;
    this.#drawScene();
  }

  /**
   * 绘制一帧并采样绘制间隔。间隔反映主线程是否被阻塞，比单次 render 调用耗时更有意义；
   * 超过 FRAME_IDLE_GAP_MS 的间隔来自空闲等待，不计入统计。
   */
  #drawScene(): void {
    const now = performance.now();
    this.#renderer.render(this.#scene, this.#camera);
    const previous = this.#lastFrameAt;
    this.#lastFrameAt = now;
    if (!previous) return;
    const delta = now - previous;
    if (delta <= 0 || delta > FRAME_IDLE_GAP_MS) return;
    this.#frameTimeMs =
      this.#frameTimeMs === 0
        ? delta
        : this.#frameTimeMs + (delta - this.#frameTimeMs) * FRAME_TIME_SMOOTHING;
    if (delta > this.#maxFrameMs) this.#maxFrameMs = delta;
    if (delta > LONG_FRAME_MS) this.#longFrames += 1;
  }

  /** 动画开始前重置帧窗口统计，让 maxFrameMs / longFrames 描述单次动画。 */
  #resetFrameWindow(): void {
    this.#maxFrameMs = 0;
    this.#longFrames = 0;
    this.#lastFrameAt = 0;
    this.#lastShadowProgress = -1;
  }

  /**
   * 请求重绘阴影贴图。传入动画进度时按 SHADOW_PROGRESS_STEP 节流：一次 720ms 翻页原本要
   * 重绘 43 次 1024² 阴影，节流后约 13 次。传 undefined 表示强制重绘并重置节奏。
   */
  #markAnimatedShadow(progress?: number): void {
    if (progress !== undefined && !shouldRefreshShadow(progress, this.#lastShadowProgress)) return;
    this.#lastShadowProgress = progress ?? -1;
    this.#shadowUpdates += 1;
    this.#renderer.shadowMap.needsUpdate = true;
  }

  #onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      this.#activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.#activePointers.size >= 2) {
        event.preventDefault();
        this.#renderer.domElement.setPointerCapture(event.pointerId);
        const drag = this.#drag;
        if (drag) {
          this.#drag = null;
          void this.#finishDrag(drag, true);
        }
        this.#pinch = {
          startDistance: Math.max(1, this.#pointerDistance()),
          startZoom: this.#zoom,
        };
        return;
      }
    }
    if (event.button !== 0 || this.#stateMachine.state !== 'OPEN' || !this.#book) return;
    const point = this.#localBookPoint(event);
    if (!point) return;
    this.#resetCornerPreview();
    const pageWidth = this.#config.pageHeight * this.#pageAspect;
    const pageHeight = this.#config.pageHeight;
    if (Math.abs(point.y) > pageHeight * 0.55 || Math.abs(point.x) > pageWidth * 1.04) return;
    const focusedSpread =
      this.#displayMode === 'focused'
        ? getSpread(getSpreadIndexForPage(this.#currentPage, this.pageCount), this.pageCount)
        : null;
    const focusedOnLeft = focusedSpread?.leftPage === this.#currentPage;
    const forwardThreshold =
      this.#displayMode === 'focused'
        ? focusedOnLeft
          ? -0.18
          : 0.72
        : this.#zoom > 1.05
          ? 0.76
          : 0.28;
    const backwardThreshold =
      this.#displayMode === 'focused'
        ? focusedOnLeft
          ? -0.72
          : 0.18
        : this.#zoom > 1.05
          ? 0.76
          : 0.28;
    const direction: TurnDirection | null =
      this.#displayMode === 'focused'
        ? point.x > pageWidth * forwardThreshold && this.canGoForward
          ? 'forward'
          : point.x < pageWidth * backwardThreshold && this.canGoBackward
            ? 'backward'
            : null
        : point.x > pageWidth * forwardThreshold && this.canGoForward
          ? 'forward'
          : point.x < -pageWidth * backwardThreshold && this.canGoBackward
            ? 'backward'
            : null;
    if (!direction) {
      if (this.#zoom > 1.05 && Math.abs(point.x) <= pageWidth) {
        event.preventDefault();
        this.#focusX = point.x < 0 ? -pageWidth / 2 : pageWidth / 2;
        this.#applyCamera();
      }
      return;
    }

    event.preventDefault();
    this.#interactionStartedAt = performance.now();
    this.#renderer.domElement.setPointerCapture(event.pointerId);
    this.#stateMachine.transition('DRAGGING', { turnDirection: direction });
    this.#yieldBackgroundToInteraction();
    const targetPage =
      this.#displayMode === 'focused'
        ? clamp(this.#currentPage + (direction === 'forward' ? 1 : -1), 1, this.pageCount)
        : null;
    const focusOnly =
      targetPage !== null &&
      getSpreadIndexForPage(targetPage, this.pageCount) === this.#spreadIndex;
    const boundaryClose =
      !focusOnly && getAdjacentSpreadIndex(this.#spreadIndex, this.pageCount, direction) === null;
    const boundaryEdge = direction === 'forward' ? 'back' : 'front';
    const pointerV = clamp(point.y / pageHeight + 0.5, 0, 1);
    // 普通翻页先同步摆出预览姿态，让纸张在第一帧就跟随指针；聚焦位移与边界开合没有纸张。
    const previewReady =
      !focusOnly && !boundaryClose && this.#beginTurnPreview(direction, pointerV);
    const prepared = focusOnly
      ? Promise.resolve()
      : boundaryClose
        ? this.#prepareBoundaryTurn(boundaryEdge, 1)
        : this.#prepareTurnWithFeedback(direction);
    const startedAt = performance.now();
    const drag: DragSession = {
      pointerId: event.pointerId,
      direction,
      start: point.clone(),
      previousProgress: 0,
      progress: 0,
      velocity: 0,
      velocitySamples: [{ progress: 0, time: performance.now() }],
      lastMotionTime: performance.now(),
      pointerV,
      verticalDrag: 0,
      prepared,
      ready: previewReady,
      readyAt: previewReady ? performance.now() : null,
      boundaryClose,
      focusOnly,
      targetPage,
      startedAt,
      maxDistancePx: 0,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
    this.#drag = drag;
    void prepared
      .then(() => {
        if (this.#drag === drag) {
          drag.ready = true;
          drag.readyAt ??= performance.now();
          if (drag.focusOnly) {
            const startFocus = this.#focusXForPage(this.#currentPage);
            const targetFocus = this.#focusXForPage(drag.targetPage ?? this.#currentPage);
            this.#focusX = startFocus + (targetFocus - startFocus) * drag.progress;
            this.#applyCamera();
          } else if (drag.boundaryClose) {
            this.#updateBoundaryTurn(
              drag.progress,
              drag.direction === 'forward' ? 'back' : 'front',
              false,
              drag.pointerV,
              drag.verticalDrag,
            );
          } else this.#updateTurn(drag.progress, drag.direction, drag.pointerV, drag.verticalDrag);
        }
      })
      .catch((reason) => this.#handleRuntimeError(reason));
  };

  #onPointerMove = (event: PointerEvent): void => {
    if (this.#activePointers.has(event.pointerId)) {
      this.#activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (this.#pinch && this.#activePointers.size >= 2) {
      event.preventDefault();
      const points = [...this.#activePointers.values()];
      const midpoint = {
        clientX: (points[0].x + points[1].x) / 2,
        clientY: (points[0].y + points[1].y) / 2,
      } as MouseEvent;
      this.#setZoom(
        this.#pinch.startZoom * (this.#pointerDistance() / this.#pinch.startDistance),
        this.#localBookPoint(midpoint),
      );
      return;
    }
    const drag = this.#drag;
    if (!drag) {
      this.#updateCornerPreview(event);
      return;
    }
    if (drag.pointerId !== event.pointerId) return;
    const point = this.#localBookPoint(event);
    if (!point) return;
    event.preventDefault();
    const pageWidth = this.#config.pageHeight * this.#pageAspect;
    const pageHeight = this.#config.pageHeight;
    const progress = progressFromDrag(drag.start.x, point.x, pageWidth * 1.55, drag.direction);
    const now = performance.now();
    drag.maxDistancePx = Math.max(
      drag.maxDistancePx,
      Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY),
    );
    sampleDragVelocity(drag, progress, now);
    drag.progress = progress;
    drag.pointerV = clamp(point.y / pageHeight + 0.5, 0, 1);
    drag.verticalDrag = clamp((point.y - drag.start.y) / pageHeight, -1, 1);
    // 视觉更新交给 rAF 合并；采样语义（速度窗口、最大位移）保持原样。
    this.#requestDragVisual();
  };

  #onPointerUp = (event: PointerEvent): void => {
    this.#activePointers.delete(event.pointerId);
    if (this.#pinch) {
      if (this.#activePointers.size < 2) this.#pinch = null;
      if (this.#renderer.domElement.hasPointerCapture(event.pointerId)) {
        this.#renderer.domElement.releasePointerCapture(event.pointerId);
      }
      return;
    }
    const drag = this.#drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    this.#flushDragVisual();
    this.#drag = null;
    decayDragVelocity(drag, performance.now());
    if (this.#renderer.domElement.hasPointerCapture(event.pointerId)) {
      this.#renderer.domElement.releasePointerCapture(event.pointerId);
    }
    void this.#finishDrag(drag);
  };

  #onPointerCancel = (event: PointerEvent): void => {
    this.#activePointers.delete(event.pointerId);
    if (this.#activePointers.size < 2) this.#pinch = null;
    this.#cancelPointerDrag(event);
  };

  #onLostPointerCapture = (event: PointerEvent): void => {
    this.#activePointers.delete(event.pointerId);
    if (this.#activePointers.size < 2) this.#pinch = null;
    this.#cancelPointerDrag(event);
  };

  #cancelPointerDrag(event: PointerEvent): void {
    const drag = this.#drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.#cancelDragVisual();
    this.#drag = null;
    decayDragVelocity(drag, performance.now());
    void this.#finishDrag(drag, true);
  }

  #pointerDistance(): number {
    const points = [...this.#activePointers.values()];
    if (points.length < 2) return 1;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  /** 用当前拖拽状态刷新纸面视觉；采样留在 pointermove 里，这里只负责呈现。 */
  #applyDragVisual(drag: DragSession): void {
    const progress = drag.progress;
    if (drag.focusOnly) {
      const startFocus = this.#focusXForPage(this.#currentPage);
      const targetFocus = this.#focusXForPage(drag.targetPage ?? this.#currentPage);
      this.#focusX = startFocus + (targetFocus - startFocus) * progress;
      this.#applyCamera();
      return;
    }
    if (drag.boundaryClose) {
      this.#updateBoundaryTurn(
        progress,
        drag.direction === 'forward' ? 'back' : 'front',
        false,
        drag.pointerV,
        drag.verticalDrag,
      );
      return;
    }
    this.#updateTurn(progress, drag.direction, drag.pointerV, drag.verticalDrag);
  }

  /** 把一帧内的多次 pointermove 合并为一次纸面更新。 */
  #requestDragVisual(): void {
    if (this.#dragFrame) return;
    this.#dragFrame = requestAnimationFrame(() => {
      this.#dragFrame = 0;
      const drag = this.#drag;
      if (drag?.ready) this.#applyDragVisual(drag);
    });
  }

  /** 同步补上最后一帧，避免松手瞬间视觉停在上一帧。 */
  #flushDragVisual(): void {
    this.#cancelDragVisual();
    const drag = this.#drag;
    if (drag?.ready) this.#applyDragVisual(drag);
  }

  #cancelDragVisual(): void {
    if (!this.#dragFrame) return;
    cancelAnimationFrame(this.#dragFrame);
    this.#dragFrame = 0;
  }

  #onPointerLeave = (): void => {
    if (!this.#drag) this.#resetCornerPreview();
  };

  #onWheel = (event: WheelEvent): void => {
    if (this.#stateMachine.state !== 'OPEN') return;
    this.#resetCornerPreview();
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.#hostHeight : 1;
    const delta = clamp(event.deltaY * unit, -240, 240);
    const focus = this.#localBookPoint(event);
    this.#setZoom(this.#zoom * Math.exp(-delta * 0.0018), focus);
  };

  #updateCornerPreview(event: PointerEvent): void {
    const state = this.#stateMachine.state;
    const book = this.#book;
    if (!book || (state !== 'OPEN' && state !== 'CLOSED') || this.#animation) {
      this.#resetCornerPreview();
      return;
    }
    const point = this.#localBookPoint(event);
    if (!point) {
      this.#resetCornerPreview();
      return;
    }
    const pageWidth = this.#config.pageHeight * this.#pageAspect;
    const pageHeight = this.#config.pageHeight;
    const vertical = Math.abs(point.y);
    if (
      vertical < pageHeight * 0.27 ||
      vertical > pageHeight * 0.54 ||
      Math.abs(point.x) > pageWidth * this.#config.coverOversize * 1.02
    ) {
      this.#resetCornerPreview();
      return;
    }
    const corner = point.y >= 0 ? 'top' : 'bottom';
    let target: 'left' | 'right' | 'front-cover' | 'back-cover' | null = null;
    if (state === 'OPEN') {
      if (point.x > pageWidth * 0.68) target = 'right';
      else if (point.x < -pageWidth * 0.68) target = 'left';
    } else if (this.#closedEdge === 'front' && point.x > pageWidth * 0.62) {
      target = 'front-cover';
    } else if (this.#closedEdge === 'back' && point.x < -pageWidth * 0.62) {
      target = 'back-cover';
    }
    if (!target) {
      this.#resetCornerPreview();
      return;
    }
    const key = `${target}:${corner}`;
    this.#cornerPreviewV = clamp(point.y / pageHeight + 0.5, 0, 1);
    if (this.#cornerPreviewKey === key) return;
    book.setCornerLift(target, corner);
    this.#cornerPreviewKey = key;
    this.#renderer.domElement.style.cursor = 'grab';
    this.#renderer.shadowMap.needsUpdate = true;
    this.invalidate();
  }

  #resetCornerPreview(): void {
    if (!this.#cornerPreviewKey) return;
    this.#book?.clearCornerLift();
    this.#cornerPreviewKey = null;
    this.#cornerPreviewV = 0.82;
    this.#renderer.domElement.style.removeProperty('cursor');
    this.#renderer.shadowMap.needsUpdate = true;
    this.invalidate();
  }

  #markInteractionVisible(): void {
    if (!this.#interactionStartedAt) return;
    this.#lastInteractionLatencyMs = performance.now() - this.#interactionStartedAt;
    this.#interactionStartedAt = 0;
  }

  async #finishDrag(drag: DragSession, cancelled = false): Promise<void> {
    try {
      await drag.prepared;
      if (this.#stateMachine.state !== 'DRAGGING') return;
      // 页面准备耗时不计入「点击窗口」，否则准备偏慢时一次干净的点击会被判成拖拽。
      const elapsed = performance.now() - (drag.readyAt ?? drag.startedAt);
      const isClick = drag.maxDistancePx <= 8 && elapsed <= 420;
      const commit =
        !cancelled &&
        (isClick || shouldCommitTurn({ progress: drag.progress, velocity: drag.velocity }));
      if (drag.focusOnly) {
        const targetPage = drag.targetPage;
        if (!targetPage) throw new Error('移动端聚焦翻页缺少目标页。');
        const startFocus = this.#focusXForPage(this.#currentPage);
        const targetFocus = this.#focusXForPage(targetPage);
        if (commit) {
          this.#stateMachine.transition('TURNING', { turnDirection: drag.direction });
          const update = (value: number): void => {
            this.#focusX = startFocus + (targetFocus - startFocus) * value;
            this.#applyCamera();
          };
          if (isClick) {
            await this.#animate(drag.progress, 1, 200 * (1 - drag.progress), update);
          } else {
            await this.#animateSpring(drag.progress, 1, Math.max(0, drag.velocity), update);
          }
          this.#currentPage = targetPage;
          this.#stateMachine.transition('OPEN', {
            currentPage: targetPage,
            displayMode: this.#displayMode,
          });
          // 聚焦翻页同样要在交互结束后把被掐断的预热接回来。
          this.#schedulePrefetch(this.#generation, true);
        } else {
          this.#stateMachine.transition('SNAPPING_BACK', { turnDirection: drag.direction });
          const update = (value: number): void => {
            this.#focusX = startFocus + (targetFocus - startFocus) * value;
            this.#applyCamera();
          };
          await this.#animateSpring(drag.progress, 0, Math.min(0, drag.velocity), update);
          this.#focusX = startFocus;
          this.#stateMachine.transition('OPEN', {
            currentPage: this.#currentPage,
            displayMode: this.#displayMode,
          });
          // 原来这里没有任何重排，聚焦模式下拉一下又松手会永久停掉后台预热。
          this.#schedulePrefetch(this.#generation, true);
        }
        return;
      }
      if (drag.boundaryClose) {
        const edge = drag.direction === 'forward' ? 'back' : 'front';
        if (commit) {
          this.#stateMachine.transition('CLOSING');
          if (isClick) {
            await this.#animate(
              drag.progress,
              1,
              this.#config.clickTurnDuration * (1 - drag.progress),
              (progress) =>
                this.#updateBoundaryTurn(
                  progress,
                  edge,
                  false,
                  drag.pointerV,
                  drag.verticalDrag,
                  false,
                ),
            );
          } else {
            await this.#animateSpring(drag.progress, 1, Math.max(0, drag.velocity), (progress) =>
              this.#updateBoundaryTurn(
                progress,
                edge,
                false,
                drag.pointerV,
                drag.verticalDrag,
                false,
              ),
            );
          }
          this.#settleBoundaryTurn(edge, false);
          this.#closedEdge = edge;
          this.#stateMachine.transition('CLOSED');
          this.invalidate();
          // 拖拽开始时预热被让位掐断，合书后同样要接上，否则重新翻开时第一跨页是冷的。
          // 这里保持 idle：刚合上书，用户下一步多半不是翻页。
          this.#schedulePrefetch(this.#generation);
        } else {
          this.#stateMachine.transition('SNAPPING_BACK', { turnDirection: drag.direction });
          await this.#animateSpring(drag.progress, 0, Math.min(0, drag.velocity), (progress) =>
            this.#updateBoundaryTurn(
              progress,
              edge,
              false,
              drag.pointerV,
              drag.verticalDrag,
              false,
            ),
          );
          this.#settleBoundaryTurn(edge, true);
          this.#stateMachine.transition('OPEN', {
            spreadIndex: this.#spreadIndex,
            currentPage: this.#currentPage,
            displayMode: this.#displayMode,
          });
          // 与普通翻页回弹同理：拖拽起手掐断了预热，这里的落回点虽然没换跨页，
          // 但被打断的那几页还没补上，必须立刻接上而不是等 idle（可拖到 900ms）。
          this.#schedulePrefetch(this.#generation, true);
          this.#scheduleReadingUpgrade(this.#generation);
        }
        return;
      }
      if (commit) {
        this.#stateMachine.transition('TURNING', { turnDirection: drag.direction });
        if (isClick) {
          await this.#animate(
            drag.progress,
            1,
            this.#config.clickTurnDuration * (1 - drag.progress),
            (progress) => {
              this.#updateTurn(progress, drag.direction, drag.pointerV, drag.verticalDrag, false);
            },
          );
        } else {
          await this.#animateSpring(drag.progress, 1, Math.max(0, drag.velocity), (progress) => {
            this.#updateTurn(progress, drag.direction, drag.pointerV, drag.verticalDrag, false);
          });
        }
        const target = getAdjacentSpreadIndex(this.#spreadIndex, this.pageCount, drag.direction);
        if (target === null) throw new Error('已经到达书籍边缘。');
        await this.#completeTurn(target);
      } else {
        this.#stateMachine.transition('SNAPPING_BACK', { turnDirection: drag.direction });
        await this.#animateSpring(drag.progress, 0, Math.min(0, drag.velocity), (progress) => {
          this.#updateTurn(progress, drag.direction, drag.pointerV, drag.verticalDrag, false);
        });
        await this.#restoreCurrentSpread();
        this.#stateMachine.transition('OPEN', {
          spreadIndex: this.#spreadIndex,
          currentPage: this.#currentPage,
          displayMode: this.#displayMode,
        });
        // 拖拽开始时预热被让位掐断，回弹落回原跨页后要重新接上，否则下一次翻页是冷渲染。
        this.#schedulePrefetch(this.#generation, true);
      }
    } catch (reason) {
      this.#handleRuntimeError(reason);
    }
  }

  #localBookPoint(event: MouseEvent): Vector3 | null {
    const rect = this.#renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.#pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.#raycaster.setFromCamera(this.#pointerNdc, this.#camera);
    const point = this.#raycaster.ray.intersectPlane(this.#bookPlane, this.#intersection);
    if (!point) return null;
    this.#book?.root.updateMatrixWorld(true);
    return this.#book?.root.worldToLocal(point) ?? null;
  }

  #listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
  ): void {
    target.addEventListener(type, listener as EventListener);
    this.#cleanups.push(() => target.removeEventListener(type, listener as EventListener));
  }

  #handleRuntimeError(reason: unknown): void {
    if (this.#disposed || (reason instanceof DOMException && reason.name === 'AbortError')) return;
    const error = reason instanceof Error ? reason : new Error('仿真书运行失败。');
    if (this.#stateMachine.state !== 'ERROR' && this.#stateMachine.canTransition('ERROR')) {
      this.#stateMachine.transition('ERROR', { error });
    }
    this.#options.onError?.(error);
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error('仿真书引擎已释放。');
  }

  #assertGeneration(generation: number): void {
    if (this.#disposed || generation !== this.#generation) {
      throw new DOMException('书籍加载已被替换。', 'AbortError');
    }
  }
}

function createContactShadowCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  const gradient = context.createRadialGradient(128, 64, 2, 128, 64, 106);
  gradient.addColorStop(0, 'rgba(0,0,0,0.52)');
  gradient.addColorStop(0.34, 'rgba(0,0,0,0.22)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function sampleCanvasBackground(canvas: HTMLCanvasElement, fallback: string): string {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || canvas.width < 2 || canvas.height < 2) return fallback;
  try {
    const insetX = Math.max(1, Math.round(canvas.width * 0.018));
    const insetY = Math.max(1, Math.round(canvas.height * 0.018));
    const points = [
      [insetX, insetY],
      [canvas.width - insetX - 1, insetY],
      [insetX, canvas.height - insetY - 1],
      [canvas.width - insetX - 1, canvas.height - insetY - 1],
    ] as const;
    const samples = points.map(([x, y]) => context.getImageData(x, y, 1, 1).data);
    const red = Math.round(samples.reduce((sum, sample) => sum + sample[0], 0) / samples.length);
    const green = Math.round(samples.reduce((sum, sample) => sum + sample[1], 0) / samples.length);
    const blue = Math.round(samples.reduce((sum, sample) => sum + sample[2], 0) / samples.length);
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    if (luminance < 155 || chroma > 72) return fallback;
    return `rgb(${red} ${green} ${blue})`;
  } catch {
    return fallback;
  }
}
