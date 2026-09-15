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
}

interface DragSession {
  pointerId: number;
  direction: TurnDirection;
  start: Vector3;
  previousProgress: number;
  progress: number;
  velocity: number;
  velocitySamples: Array<{ progress: number; time: number }>;
  lastMotionTime: number;
  pointerV: number;
  verticalDrag: number;
  prepared: Promise<void>;
  ready: boolean;
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

const DRAG_VELOCITY_WINDOW_MS = 90;
const DRAG_VELOCITY_DECAY_MS = 110;
const DRAG_MOTION_EPSILON = 0.0005;
const MAX_DRAG_VELOCITY = 4;

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
  #spreadIndex = 0;
  #currentPage = 1;
  #displayMode: BookDisplayMode = 'spread';
  #appearanceRevision = 0;
  #cameraDistance = 1.8;
  #zoom = 1;
  #focusX = 0;
  #focusY = 0;
  #renderFrame = 0;
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
  #blankPageSource: RenderedPage | null = null;
  #backCoverPageSource: RenderedPage | null = null;
  #blankPageColor = '#fffdf8';
  #publicationCoverCanvas: HTMLCanvasElement | null = null;
  #disposed = false;
  #generation = 0;
  #spreadRevision = 0;
  #lastTurnDirection: TurnDirection = 'forward';
  #closedEdge: 'front' | 'back' = 'front';
  #cornerPreviewKey: string | null = null;
  #cornerPreviewV = 0.82;
  #preparedTurnSpread: PreparedTurnSpread | null = null;
  #interactionStartedAt = 0;
  #lastInteractionLatencyMs: number | null = null;

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
    this.#renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
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
    };
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
        : await this.#getPage(1, 'preview', controller.signal);
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
    this.#pauseBackgroundWork();
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
    this.#renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
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
      this.#renderer.render(this.#scene, this.#camera);
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
    this.#drag = null;
    this.#pinch = null;
    this.#activePointers.clear();
    this.#preparedTurnSpread = null;
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
      spread.leftPage ? this.#getPage(spread.leftPage, quality, signal) : this.#blankPage(),
      spread.rightPage ? this.#getPage(spread.rightPage, quality, signal) : this.#blankPage(),
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
    this.#preparationNoticeTimer = globalThis.setTimeout(() => {
      this.#preparationNoticeTimer = null;
      this.#preparationNoticeVisible = true;
      this.#options.onPagePreparationChange?.(true);
    }, 120);
    try {
      await this.#prepareTurn(direction);
    } finally {
      this.#hidePreparationNotice();
    }
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
    book.setTurnPreparationPage(direction === 'forward' ? 'right' : 'left');
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
      book.pruneSurfaces();
      book.turningSheet.update(0, direction);
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
    this.#markAnimatedShadow();
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
    this.#markAnimatedShadow();
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
    this.#schedulePrefetch(this.#generation);
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
    priority = 0,
  ): Promise<RenderedPage> {
    const provider = this.#provider;
    if (!provider) throw new Error('尚未载入书籍。');
    const targetWidth = this.#targetTextureWidth(quality);
    const key = createPageCacheKey(pageNumber, targetWidth, quality, this.#appearanceRevision);
    const cached = this.#pageCache.get(key);
    if (cached) return cached;
    const pending = this.#pendingPages.get(key);
    if (pending) {
      try {
        return await waitForPage(pending, signal);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === 'AbortError') || signal?.aborted) {
          throw reason;
        }
      }
    }
    const generation = this.#generation;
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
    priority = 0,
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
      const insertionIndex = this.#renderQueue.findIndex((queued) => queued.priority > priority);
      if (insertionIndex < 0) this.#renderQueue.push(job);
      else this.#renderQueue.splice(insertionIndex, 0, job);
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
    const cached = this.#getCachedPage(pageNumber);
    return cached ? Promise.resolve(cached) : this.#getPage(pageNumber, 'reading', signal);
  }

  #getCachedPage(pageNumber: number): RenderedPage | undefined {
    for (const quality of ['reading', 'preview'] as const) {
      const targetWidth = this.#targetTextureWidth(quality);
      const cached = this.#pageCache.get(
        createPageCacheKey(pageNumber, targetWidth, quality, this.#appearanceRevision),
      );
      if (cached) return cached;
    }
    return undefined;
  }

  // 正在展示的静态页不允许被 PageCache 按 LRU 驱逐：被驱逐后阅读升级会
  // 重新渲染（字体已加载的像素与翻页素材不同）并整体替换纹理，造成
  // 翻页完成后的文字弹变。落页时把静态页的缓存项触到队尾保护起来。
  #touchStaticPages(): void {
    const spread = getSpread(this.#spreadIndex, this.pageCount);
    for (const pageNumber of [spread.leftPage, spread.rightPage]) {
      if (!pageNumber) continue;
      this.#getCachedPage(pageNumber);
    }
  }

  #targetTextureWidth(quality: PageRenderQuality): number {
    const width = Math.max(320, this.#host.clientWidth);
    const height = Math.max(260, this.#host.clientHeight);
    const cssWidth = Math.min(width * 0.42, height * 0.61 * this.#pageAspect);
    const ratio = quality === 'reading' ? 1 : this.#memoryLimited ? 0.52 : 0.7;
    const edgeLimit =
      this.#config.maxTextureEdge * (quality === 'reading' && this.#memoryLimited ? 0.72 : 1);
    const rawWidth = Math.max(
      quality === 'reading' ? 640 : 320,
      Math.min(
        edgeLimit * Math.min(1, this.#pageAspect),
        Math.round(cssWidth * Math.min(2, globalThis.devicePixelRatio || 1) * ratio * this.#zoom),
      ),
    );
    const buckets = quality === 'reading' ? [640, 896, 1280, 1536, 2048] : [320, 512, 768, 1024];
    const maximumWidth = Math.max(
      quality === 'reading' ? 640 : 320,
      edgeLimit * Math.min(1, this.#pageAspect),
    );
    const cappedWidth = Math.min(rawWidth, maximumWidth);
    const eligibleBuckets = buckets.filter((bucket) => bucket <= maximumWidth + 0.5);
    return (
      eligibleBuckets.find((bucket) => bucket >= cappedWidth) ??
      eligibleBuckets.at(-1) ??
      Math.round(maximumWidth)
    );
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
    const controller = new AbortController();
    this.#readingUpgradeController = controller;
    this.#idleHandle = idle(() => {
      this.#idleHandle = 0;
      const spreadIndex = this.#spreadIndex;
      const spreadRevision = this.#spreadRevision;
      if (
        this.#disposed ||
        generation !== this.#generation ||
        (this.#stateMachine.state !== 'OPEN' && this.#stateMachine.state !== 'CLOSED')
      ) {
        return;
      }
      const spread = getSpread(spreadIndex, this.pageCount);
      void Promise.all([
        spread.leftPage
          ? this.#getPage(spread.leftPage, 'reading', controller.signal, 12)
          : this.#blankPage(),
        spread.rightPage
          ? this.#getPage(spread.rightPage, 'reading', controller.signal, 12)
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

  #schedulePrefetch(generation: number): void {
    if (this.#prefetchIdleHandle) cancelIdle(this.#prefetchIdleHandle);
    this.#prefetchController?.abort();
    const controller = new AbortController();
    this.#prefetchController = controller;
    this.#prefetchIdleHandle = idle(() => {
      this.#prefetchIdleHandle = 0;
      if (
        this.#disposed ||
        controller.signal.aborted ||
        generation !== this.#generation ||
        (this.#stateMachine.state !== 'OPEN' && this.#stateMachine.state !== 'CLOSED')
      ) {
        return;
      }
      const pageNumbers = new Set<number>();
      const direction = this.#lastTurnDirection === 'forward' ? 1 : -1;
      const spreadQueue = [
        this.#spreadIndex + direction,
        this.#spreadIndex + direction * 2,
        this.#spreadIndex + direction * 3,
        this.#spreadIndex - direction,
      ];
      for (const index of spreadQueue) {
        if (index < 0 || index > getLastSpreadIndex(this.pageCount)) continue;
        const spread = getSpread(index, this.pageCount);
        if (spread.leftPage) pageNumbers.add(spread.leftPage);
        if (spread.rightPage) pageNumbers.add(spread.rightPage);
      }
      const queue = [...pageNumbers].slice(0, this.#memoryLimited ? 2 : 4);
      const work = async (): Promise<void> => {
        while (!this.#disposed && !controller.signal.aborted && generation === this.#generation) {
          const pageNumber = queue.shift();
          if (!pageNumber) return;
          // 与翻页素材同质量预热，翻页时缓存直接命中，避免落页后的质量跳变。
          // 限量渲染避免驱逐正在展示的静态页（由 #touchStaticPages 保护）。
          await this.#getPage(pageNumber, 'reading', controller.signal, 24).catch(() => undefined);
        }
      };
      void Promise.all([work(), work()]);
    });
    this.#armBackgroundDeadline();
  }

  #pauseBackgroundWork(): void {
    if (this.#backgroundDeadlineTimer) {
      globalThis.clearTimeout(this.#backgroundDeadlineTimer);
      this.#backgroundDeadlineTimer = null;
    }
    if (this.#idleHandle) cancelIdle(this.#idleHandle);
    this.#idleHandle = 0;
    if (this.#prefetchIdleHandle) cancelIdle(this.#prefetchIdleHandle);
    this.#prefetchIdleHandle = 0;
    this.#readingUpgradeController?.abort();
    this.#readingUpgradeController = null;
    this.#prefetchController?.abort();
    this.#prefetchController = null;
    this.#preparedTurnSpread = null;
  }

  #armBackgroundDeadline(): void {
    if (this.#backgroundDeadlineTimer) globalThis.clearTimeout(this.#backgroundDeadlineTimer);
    this.#backgroundDeadlineTimer = globalThis.setTimeout(() => {
      this.#backgroundDeadlineTimer = null;
      if (this.#idleHandle) cancelIdle(this.#idleHandle);
      this.#idleHandle = 0;
      if (this.#prefetchIdleHandle) cancelIdle(this.#prefetchIdleHandle);
      this.#prefetchIdleHandle = 0;
      this.#readingUpgradeController?.abort();
      this.#readingUpgradeController = null;
      this.#prefetchController?.abort();
      this.#prefetchController = null;
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
    this.#renderer.render(this.#scene, this.#camera);
  }

  #markAnimatedShadow(): void {
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
    this.#pauseBackgroundWork();
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
      pointerV: clamp(point.y / pageHeight + 0.5, 0, 1),
      verticalDrag: 0,
      prepared,
      ready: false,
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
    this.#updateDragVelocity(drag, progress, now);
    drag.progress = progress;
    drag.pointerV = clamp(point.y / pageHeight + 0.5, 0, 1);
    drag.verticalDrag = clamp((point.y - drag.start.y) / pageHeight, -1, 1);
    if (drag.ready) {
      if (drag.focusOnly) {
        const startFocus = this.#focusXForPage(this.#currentPage);
        const targetFocus = this.#focusXForPage(drag.targetPage ?? this.#currentPage);
        this.#focusX = startFocus + (targetFocus - startFocus) * progress;
        this.#applyCamera();
      } else if (drag.boundaryClose) {
        this.#updateBoundaryTurn(
          progress,
          drag.direction === 'forward' ? 'back' : 'front',
          false,
          drag.pointerV,
          drag.verticalDrag,
        );
      } else this.#updateTurn(progress, drag.direction, drag.pointerV, drag.verticalDrag);
    }
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
    this.#drag = null;
    this.#decayDragVelocity(drag, performance.now());
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
    this.#drag = null;
    this.#decayDragVelocity(drag, performance.now());
    void this.#finishDrag(drag, true);
  }

  #pointerDistance(): number {
    const points = [...this.#activePointers.values()];
    if (points.length < 2) return 1;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  #updateDragVelocity(drag: DragSession, progress: number, now: number): void {
    if (Math.abs(progress - drag.previousProgress) >= DRAG_MOTION_EPSILON) {
      drag.lastMotionTime = now;
    }
    drag.previousProgress = progress;
    drag.velocitySamples.push({ progress, time: now });
    const cutoff = now - DRAG_VELOCITY_WINDOW_MS;
    while (drag.velocitySamples.length > 1 && drag.velocitySamples[0].time <= cutoff) {
      drag.velocitySamples.shift();
    }
    if (drag.velocitySamples.length < 2) {
      drag.velocity = 0;
      return;
    }
    const first = drag.velocitySamples[0];
    const elapsed = Math.max(8, now - first.time) / 1000;
    drag.velocity = clamp(
      (progress - first.progress) / elapsed,
      -MAX_DRAG_VELOCITY,
      MAX_DRAG_VELOCITY,
    );
  }

  #decayDragVelocity(drag: DragSession, now: number): void {
    const idleProgress = clamp((now - drag.lastMotionTime) / DRAG_VELOCITY_DECAY_MS, 0, 1);
    drag.velocity = clamp(
      drag.velocity * (1 - idleProgress),
      -MAX_DRAG_VELOCITY,
      MAX_DRAG_VELOCITY,
    );
  }

  #onPointerLeave = (): void => {
    if (!this.#drag) this.#resetCornerPreview();
  };

  #onWheel = (event: WheelEvent): void => {
    if (this.#stateMachine.state !== 'OPEN') return;
    this.#resetCornerPreview();
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.#host.clientHeight : 1;
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
      const isClick = drag.maxDistancePx <= 8 && performance.now() - drag.startedAt <= 420;
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
          this.#schedulePrefetch(this.#generation);
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
          this.#schedulePrefetch(this.#generation);
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
