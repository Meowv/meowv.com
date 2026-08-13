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
  PageProvider,
  PageRenderQuality,
  RenderedPage,
  TurnDirection,
} from '../types/reader';
import { resolveBookConfig, type BookConfig } from './BookConfig';
import { BookStateMachine } from './BookStateMachine';
import { BookModel } from './book/BookModel';
import {
  canTurnBackward,
  canTurnForward,
  getAdjacentSpreadIndex,
  getLastSpreadIndex,
  getSpread,
} from './spreads';
import { disposeObject } from './three-utils';
import { progressFromDrag, shouldCommitTurn } from './turn/PageCurl';
import { Spring } from './turn/Spring';

export interface BookEngineOptions {
  config?: Partial<BookConfig>;
  initialSpreadIndex?: number;
  onError?: (error: Error) => void;
}

interface DragSession {
  pointerId: number;
  direction: TurnDirection;
  start: Vector3;
  previousProgress: number;
  previousTime: number;
  progress: number;
  velocity: number;
  pointerV: number;
  verticalDrag: number;
  prepared: Promise<void>;
  ready: boolean;
}

interface AnimationHandle {
  frame: number;
  reject: (reason: unknown) => void;
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

export class BookEngine {
  readonly #host: HTMLElement;
  readonly #options: BookEngineOptions;
  readonly #config: Readonly<BookConfig>;
  readonly #stateMachine = new BookStateMachine();
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
  #provider: PageProvider | null = null;
  #book: BookModel | null = null;
  #pageAspect = 0.72;
  #spreadIndex = 0;
  #cameraDistance = 1.8;
  #zoom = 1;
  #focusX = 0;
  #focusY = 0;
  #renderFrame = 0;
  #animation: AnimationHandle | null = null;
  #idleHandle = 0;
  #drag: DragSession | null = null;
  #loadController: AbortController | null = null;
  #prefetchController: AbortController | null = null;
  #blankPageSource: RenderedPage | null = null;
  #disposed = false;
  #generation = 0;
  #spreadRevision = 0;

  constructor(host: HTMLElement, options: BookEngineOptions = {}) {
    this.#host = host;
    this.#options = options;
    this.#config = resolveBookConfig(options.config);
    this.#pageCache = new PageCache({
      maxBytes: this.#config.textureBudgetBytes,
      maxEntries: 24,
    });
    this.#scene.background = new Color(0x171311);
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

  get canGoForward(): boolean {
    return canTurnForward(this.#spreadIndex, this.pageCount);
  }

  get canGoBackward(): boolean {
    return canTurnBackward(this.#spreadIndex, this.pageCount);
  }

  subscribe(listener: BookStateListener): () => void {
    return this.#stateMachine.subscribe(listener);
  }

  async load(provider: PageProvider, initialSpreadIndex = 0): Promise<void> {
    this.#assertUsable();
    if (this.#stateMachine.state !== 'EMPTY') {
      throw new Error('当前书籍尚未释放，无法载入另一份 PDF。');
    }
    this.#stateMachine.transition('LOADING', { pageCount: provider.pageCount });
    this.#provider = provider;
    const generation = ++this.#generation;
    this.#loadController?.abort();
    const controller = new AbortController();
    this.#loadController = controller;

    try {
      if (provider.pageCount < 1) throw new Error('这份 PDF 没有可阅读的页面。');
      const pageSize = await provider.getPageSize(1);
      this.#pageAspect = clamp(pageSize.width / pageSize.height, 0.38, 1.65);
      this.#spreadIndex = clamp(
        Math.trunc(initialSpreadIndex || this.#options.initialSpreadIndex || 0),
        0,
        getLastSpreadIndex(provider.pageCount),
      );

      const cover = await this.#getPage(1, 'preview', controller.signal);
      this.#assertGeneration(generation);
      const pageHeight = this.#config.pageHeight;
      const pageWidth = pageHeight * this.#pageAspect;
      this.#book = new BookModel({
        pageWidth,
        pageHeight,
        pageCount: provider.pageCount,
        config: this.#config,
        maxAnisotropy: this.#renderer.capabilities.getMaxAnisotropy(),
      });
      this.#book.setCover(cover.canvas);
      this.#scene.add(this.#book.root);
      await this.#showSpread(this.#spreadIndex, 'preview', controller.signal);
      this.#book.setProgress(this.#readingProgress(this.#spreadIndex));
      this.#renderer.shadowMap.needsUpdate = true;
      this.invalidate();
      this.#stateMachine.transition('CLOSED', {
        pageCount: provider.pageCount,
        spreadIndex: this.#spreadIndex,
      });
      this.#scheduleReadingUpgrade(generation);
      this.#schedulePrefetch(generation);
    } catch (reason) {
      if (controller.signal.aborted || this.#disposed) throw reason;
      const error = reason instanceof Error ? reason : new Error('无法打开这份 PDF。');
      this.#stateMachine.transition('ERROR', { error });
      this.#options.onError?.(error);
      throw error;
    }
  }

  async open(): Promise<void> {
    if (!this.#book || this.#stateMachine.state !== 'CLOSED') return;
    this.#stateMachine.transition('OPENING');
    await this.#animate(0, 1, this.#config.openDuration, (progress) => {
      this.#book?.setOpenProgress(progress);
      this.#renderer.shadowMap.needsUpdate = true;
    });
    this.#stateMachine.transition('OPEN');
    this.invalidate();
  }

  async close(): Promise<void> {
    if (!this.#book || this.#stateMachine.state !== 'OPEN') return;
    this.#stateMachine.transition('CLOSING');
    await this.#animate(0, 1, this.#config.closeDuration, (progress) => {
      this.#book?.setClosedFromOpenProgress(progress);
      this.#renderer.shadowMap.needsUpdate = true;
    });
    this.#stateMachine.transition('CLOSED');
    this.invalidate();
  }

  async next(): Promise<void> {
    await this.turn('forward');
  }

  async previous(): Promise<void> {
    await this.turn('backward');
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
    const target = getAdjacentSpreadIndex(this.#spreadIndex, this.pageCount, direction);
    if (target === null) return;
    this.#stateMachine.transition('TURNING', { turnDirection: direction });
    try {
      await this.#prepareTurn(direction);
      await this.#animate(0, 1, this.#config.clickTurnDuration, (progress) => {
        this.#updateTurn(progress, direction, 0.82, 0);
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
    const bookWidth = this.#config.pageHeight * this.#pageAspect * 2.16;
    const bookHeight = this.#config.pageHeight * 1.18;
    const verticalFov = (this.#cameraFov() * Math.PI) / 180;
    const safeFrame = this.#camera.aspect < 0.9 ? 0.84 : 1.04;
    const fitHeightDistance = bookHeight / (2 * Math.tan(verticalFov / 2) * safeFrame);
    const fitWidthDistance =
      bookWidth / (2 * Math.tan(verticalFov / 2) * this.#camera.aspect * safeFrame);
    this.#cameraDistance = Math.max(fitHeightDistance, fitWidthDistance, 1.58);
    this.#applyCamera();
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
    this.#prefetchController?.abort();
    this.#prefetchController = null;
    this.#drag = null;
    if (this.#renderFrame) cancelAnimationFrame(this.#renderFrame);
    this.#renderFrame = 0;
    this.#cancelAnimation(new DOMException('仿真书已关闭。', 'AbortError'));
    if (this.#idleHandle) cancelIdle(this.#idleHandle);
    this.#idleHandle = 0;
    this.#resizeObserver.disconnect();
    for (const cleanup of this.#cleanups.splice(0).reverse()) cleanup();
    this.#pageCache.clear();
    this.#pendingPages.clear();
    const provider = this.#provider;
    this.#provider = null;
    disposeObject(this.#scene);
    this.#book = null;
    this.#blankPageSource?.dispose();
    this.#blankPageSource = null;
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
    const ambient = new AmbientLight(0xd9c7b2, 0.88);
    const keyLight = new DirectionalLight(0xffddb3, 2.15);
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
    keyLight.shadow.bias = -0.0006;

    const desk = new Mesh(
      new PlaneGeometry(22, 16),
      new MeshStandardMaterial({ color: 0x2a211c, metalness: 0, roughness: 0.92 }),
    );
    desk.position.z = -0.24;
    desk.receiveShadow = true;

    const contactTexture = new CanvasTexture(createContactShadowCanvas());
    contactTexture.needsUpdate = true;
    const contact = new Mesh(
      new PlaneGeometry(4.9, 2.5),
      new MeshBasicMaterial({
        map: contactTexture,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    );
    contact.position.z = -0.225;
    this.#scene.add(ambient, keyLight, desk, contact);
  }

  async #showSpread(
    spreadIndex: number,
    quality: PageRenderQuality,
    signal?: AbortSignal,
  ): Promise<void> {
    const spread = getSpread(spreadIndex, this.pageCount);
    const [left, right] = await Promise.all([
      spread.leftPage ? this.#getPage(spread.leftPage, quality, signal) : null,
      spread.rightPage ? this.#getPage(spread.rightPage, quality, signal) : null,
    ]);
    this.#book?.setStaticPages(left?.canvas ?? null, right?.canvas ?? null);
    this.invalidate();
  }

  async #prepareTurn(direction: TurnDirection): Promise<void> {
    const targetIndex = getAdjacentSpreadIndex(this.#spreadIndex, this.pageCount, direction);
    if (targetIndex === null || !this.#book) throw new Error('已经到达书籍边缘。');
    const controller = this.#loadController ?? new AbortController();
    const current = getSpread(this.#spreadIndex, this.pageCount);
    const target = getSpread(targetIndex, this.pageCount);
    const frontPage = direction === 'forward' ? current.rightPage : target.rightPage;
    const backPage = direction === 'forward' ? target.leftPage : current.leftPage;
    const [front, back, underLeft, underRight] = await Promise.all([
      frontPage ? this.#getPage(frontPage, 'reading', controller.signal) : this.#blankPage(),
      backPage ? this.#getPage(backPage, 'reading', controller.signal) : this.#blankPage(),
      (direction === 'forward' ? current.leftPage : target.leftPage)
        ? this.#getPage(
            (direction === 'forward' ? current.leftPage : target.leftPage) as number,
            'reading',
            controller.signal,
          )
        : null,
      (direction === 'forward' ? target.rightPage : current.rightPage)
        ? this.#getPage(
            (direction === 'forward' ? target.rightPage : current.rightPage) as number,
            'reading',
            controller.signal,
          )
        : null,
    ]);
    this.#book.setStaticPages(underLeft?.canvas ?? null, underRight?.canvas ?? null);
    this.#book.turningSheet.setPages(
      front.canvas,
      back.canvas,
      this.#renderer.capabilities.getMaxAnisotropy(),
    );
    this.#book.turningSheet.update(0, direction);
    this.invalidate();
  }

  #updateTurn(
    progress: number,
    direction: TurnDirection,
    pointerV: number,
    verticalDrag: number,
  ): void {
    this.#book?.turningSheet.update(progress, direction, pointerV, verticalDrag);
    const fractionalSpread = this.#spreadIndex + (direction === 'forward' ? progress : -progress);
    this.#book?.setProgress(this.#readingProgress(fractionalSpread));
    this.#renderer.shadowMap.needsUpdate = true;
    this.invalidate();
  }

  async #completeTurn(targetIndex: number): Promise<void> {
    this.#spreadIndex = targetIndex;
    this.#spreadRevision += 1;
    await this.#showSpread(targetIndex, 'reading', this.#loadController?.signal);
    this.#book?.turningSheet.hide();
    this.#book?.setProgress(this.#readingProgress(targetIndex));
    this.#renderer.shadowMap.needsUpdate = true;
    this.#stateMachine.transition('OPEN', {
      spreadIndex: targetIndex,
      pageCount: this.pageCount,
    });
    this.invalidate();
    this.#schedulePrefetch(this.#generation);
    this.#scheduleReadingUpgrade(this.#generation);
  }

  async #restoreCurrentSpread(): Promise<void> {
    await this.#showSpread(this.#spreadIndex, 'reading', this.#loadController?.signal);
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
  ): Promise<RenderedPage> {
    const provider = this.#provider;
    if (!provider) throw new Error('尚未载入 PDF。');
    const targetWidth = this.#targetTextureWidth(quality);
    const key = createPageCacheKey(pageNumber, targetWidth, quality);
    const cached = this.#pageCache.get(key);
    if (cached) return cached;
    const pending = this.#pendingPages.get(key);
    if (pending) return pending;
    const generation = this.#generation;
    const render = provider
      .renderPage(pageNumber, { targetWidth, quality, signal })
      .then((page) => {
        if (this.#disposed || generation !== this.#generation || signal?.aborted) {
          page.dispose();
          throw new DOMException('PDF 页面渲染已取消。', 'AbortError');
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

  #targetTextureWidth(quality: PageRenderQuality): number {
    const width = Math.max(320, this.#host.clientWidth);
    const height = Math.max(260, this.#host.clientHeight);
    const cssWidth = Math.min(width * 0.42, height * 0.61 * this.#pageAspect);
    const ratio = quality === 'reading' ? 1 : 0.52;
    return Math.max(
      quality === 'reading' ? 640 : 320,
      Math.min(
        this.#config.maxTextureEdge * Math.min(1, this.#pageAspect),
        Math.round(cssWidth * Math.min(2, globalThis.devicePixelRatio || 1) * ratio * this.#zoom),
      ),
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
      context.fillStyle = '#fffdf8';
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

  #scheduleReadingUpgrade(generation: number): void {
    if (this.#idleHandle) cancelIdle(this.#idleHandle);
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
      void this.#showSpread(spreadIndex, 'reading', this.#loadController?.signal)
        .then(() => {
          if (
            this.#disposed ||
            generation !== this.#generation ||
            spreadRevision !== this.#spreadRevision ||
            spreadIndex !== this.#spreadIndex ||
            (this.#stateMachine.state !== 'OPEN' && this.#stateMachine.state !== 'CLOSED')
          ) {
            if (this.#stateMachine.state === 'OPEN' || this.#stateMachine.state === 'CLOSED') {
              void this.#showSpread(
                this.#spreadIndex,
                'reading',
                this.#loadController?.signal,
              ).catch(() => undefined);
            }
          }
        })
        .catch(() => undefined);
    });
  }

  #schedulePrefetch(generation: number): void {
    this.#prefetchController?.abort();
    const controller = new AbortController();
    this.#prefetchController = controller;
    const pageNumbers = new Set<number>();
    for (
      let index = Math.max(0, this.#spreadIndex - 3);
      index <= Math.min(getLastSpreadIndex(this.pageCount), this.#spreadIndex + 3);
      index += 1
    ) {
      const spread = getSpread(index, this.pageCount);
      if (spread.leftPage) pageNumbers.add(spread.leftPage);
      if (spread.rightPage) pageNumbers.add(spread.rightPage);
    }
    const queue = [...pageNumbers];
    const work = async (): Promise<void> => {
      while (!this.#disposed && !controller.signal.aborted && generation === this.#generation) {
        const pageNumber = queue.shift();
        if (!pageNumber) return;
        await this.#getPage(pageNumber, 'preview', controller.signal).catch(() => undefined);
      }
    };
    void Promise.all([work(), work()]);
  }

  #animate(
    from: number,
    to: number,
    duration: number,
    update: (value: number) => void,
  ): Promise<void> {
    this.#cancelAnimation(new DOMException('动画已被新操作替换。', 'AbortError'));
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const safeDuration = reduced ? 1 : Math.max(1, duration);
    return new Promise((resolve, reject) => {
      const startedAt = performance.now();
      const frame = (now: number): void => {
        const progress = clamp((now - startedAt) / safeDuration, 0, 1);
        const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
        update(from + (to - from) * eased);
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
    const spring = new Spring({ initialPosition: from, initialVelocity: velocity, target });
    return new Promise((resolve, reject) => {
      let previous = performance.now();
      const frame = (now: number): void => {
        const value = spring.step((now - previous) / 1000);
        previous = now;
        update(clamp(value, 0, 1));
        if (!spring.isSettled() && !this.#disposed) {
          const nextFrame = requestAnimationFrame(frame);
          if (this.#animation) this.#animation.frame = nextFrame;
          return;
        }
        spring.settle();
        update(target);
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

  #onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.#stateMachine.state !== 'OPEN' || !this.#book) return;
    const point = this.#localBookPoint(event);
    if (!point) return;
    const pageWidth = this.#config.pageHeight * this.#pageAspect;
    const pageHeight = this.#config.pageHeight;
    if (Math.abs(point.y) > pageHeight * 0.55) return;
    const outerThreshold = this.#zoom > 1.05 ? 0.76 : 0.28;
    const direction: TurnDirection | null =
      point.x > pageWidth * outerThreshold && this.canGoForward
        ? 'forward'
        : point.x < -pageWidth * outerThreshold && this.canGoBackward
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
    this.#renderer.domElement.setPointerCapture(event.pointerId);
    this.#stateMachine.transition('DRAGGING', { turnDirection: direction });
    const prepared = this.#prepareTurn(direction);
    const drag: DragSession = {
      pointerId: event.pointerId,
      direction,
      start: point.clone(),
      previousProgress: 0,
      previousTime: performance.now(),
      progress: 0,
      velocity: 0,
      pointerV: clamp(point.y / pageHeight + 0.5, 0, 1),
      verticalDrag: 0,
      prepared,
      ready: false,
    };
    this.#drag = drag;
    void prepared
      .then(() => {
        if (this.#drag === drag) {
          drag.ready = true;
          this.#updateTurn(drag.progress, drag.direction, drag.pointerV, drag.verticalDrag);
        }
      })
      .catch((reason) => this.#handleRuntimeError(reason));
  };

  #onPointerMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = this.#localBookPoint(event);
    if (!point) return;
    event.preventDefault();
    const pageWidth = this.#config.pageHeight * this.#pageAspect;
    const pageHeight = this.#config.pageHeight;
    const progress = progressFromDrag(drag.start.x, point.x, pageWidth * 1.55, drag.direction);
    const now = performance.now();
    const elapsed = Math.max(8, now - drag.previousTime) / 1000;
    drag.velocity = (progress - drag.previousProgress) / elapsed;
    drag.previousProgress = progress;
    drag.previousTime = now;
    drag.progress = progress;
    drag.pointerV = clamp(point.y / pageHeight + 0.5, 0, 1);
    drag.verticalDrag = clamp((point.y - drag.start.y) / pageHeight, -1, 1);
    if (drag.ready) {
      this.#updateTurn(progress, drag.direction, drag.pointerV, drag.verticalDrag);
    }
  };

  #onPointerUp = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    this.#drag = null;
    if (this.#renderer.domElement.hasPointerCapture(event.pointerId)) {
      this.#renderer.domElement.releasePointerCapture(event.pointerId);
    }
    void this.#finishDrag(drag);
  };

  #onPointerCancel = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.#drag = null;
    void this.#finishDrag(drag, true);
  };

  #onWheel = (event: WheelEvent): void => {
    if (this.#stateMachine.state !== 'OPEN') return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.#host.clientHeight : 1;
    const delta = clamp(event.deltaY * unit, -240, 240);
    const focus = this.#localBookPoint(event);
    this.#setZoom(this.#zoom * Math.exp(-delta * 0.0018), focus);
  };

  async #finishDrag(drag: DragSession, cancelled = false): Promise<void> {
    try {
      await drag.prepared;
      if (this.#stateMachine.state !== 'DRAGGING') return;
      const isClick = drag.progress < 0.035 && Math.abs(drag.velocity) < 0.16;
      const commit =
        !cancelled &&
        (isClick || shouldCommitTurn({ progress: drag.progress, velocity: drag.velocity }));
      if (commit) {
        this.#stateMachine.transition('TURNING', { turnDirection: drag.direction });
        await this.#animateSpring(drag.progress, 1, Math.max(0, drag.velocity), (progress) => {
          this.#updateTurn(progress, drag.direction, drag.pointerV, drag.verticalDrag);
        });
        const target = getAdjacentSpreadIndex(this.#spreadIndex, this.pageCount, drag.direction);
        if (target === null) throw new Error('已经到达书籍边缘。');
        await this.#completeTurn(target);
      } else {
        this.#stateMachine.transition('SNAPPING_BACK', { turnDirection: drag.direction });
        await this.#animateSpring(drag.progress, 0, Math.min(0, drag.velocity), (progress) => {
          this.#updateTurn(progress, drag.direction, drag.pointerV, drag.verticalDrag);
        });
        await this.#restoreCurrentSpread();
        this.#stateMachine.transition('OPEN', { spreadIndex: this.#spreadIndex });
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
    return this.#book?.root.worldToLocal(point.clone()) ?? null;
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
  const gradient = context.createRadialGradient(128, 64, 2, 128, 64, 116);
  gradient.addColorStop(0, 'rgba(0,0,0,0.72)');
  gradient.addColorStop(0.42, 'rgba(0,0,0,0.36)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}
