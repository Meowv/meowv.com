import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageProvider, PageRenderOptions, RenderedPage } from '../types/reader';
import type { BookConfig } from './BookConfig';

const rendererCanvases: TestCanvas[] = [];
let latestBookPages: { left: HTMLCanvasElement | null; right: HTMLCanvasElement | null } | null =
  null;

class TestCanvas extends EventTarget {
  width = 1200;
  height = 800;
  tabIndex = 0;
  style = { removeProperty: () => undefined };
  #captured = new Set<number>();

  setAttribute(): void {}
  remove(): void {}
  getBoundingClientRect(): DOMRect {
    return { left: 0, top: 0, width: 1200, height: 800 } as DOMRect;
  }
  setPointerCapture(id: number): void {
    this.#captured.add(id);
  }
  hasPointerCapture(id: number): boolean {
    return this.#captured.has(id);
  }
  releasePointerCapture(id: number): void {
    this.#captured.delete(id);
  }
  getContext(): object {
    return {
      fillRect: () => undefined,
      createRadialGradient: () => ({ addColorStop: () => undefined }),
      getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
    };
  }
}

vi.mock('three', async (importOriginal) => {
  const original = await importOriginal<typeof import('three')>();
  return {
    ...original,
    WebGLRenderer: class {
      domElement = new TestCanvas();
      constructor() {
        rendererCanvases.push(this.domElement);
      }
      capabilities = { getMaxAnisotropy: () => 1 };
      info = { render: { frame: 0 }, memory: { textures: 0, geometries: 0 } };
      shadowMap = { enabled: false, autoUpdate: false, needsUpdate: false };
      renderLists = { dispose: () => undefined };
      setPixelRatio(): void {}
      setSize(): void {}
      render(): void {
        this.info.render.frame += 1;
      }
      initTexture(): void {}
      compileAsync(): Promise<void> {
        return Promise.resolve();
      }
      dispose(): void {}
      forceContextLoss(): void {}
      forceContextRestore(): void {
        this.domElement.dispatchEvent(new Event('webglcontextrestored'));
      }
    },
  };
});

vi.mock('./book/BookModel', async () => {
  const { Group } = await import('three');
  return {
    BookModel: class {
      root = new Group();
      #left: HTMLCanvasElement | null = null;
      #right: HTMLCanvasElement | null = null;
      turningSheet = {
        mesh: new Group(),
        setEdgeKind: () => undefined,
        setPages: () => undefined,
        update: () => undefined,
        hide: () => undefined,
      };
      surfaceMetrics = { entries: 0, byteSize: 0, maxBytes: 0 };
      get staticPageCanvases(): {
        left: HTMLCanvasElement | null;
        right: HTMLCanvasElement | null;
      } {
        return { left: this.#left, right: this.#right };
      }
      setCover(): void {}
      setStaticPages(left: HTMLCanvasElement, right: HTMLCanvasElement): void {
        this.#left = left;
        this.#right = right;
        latestBookPages = { left, right };
      }
      setProgress(): void {}
      setTurnPreparationPage(): void {}
      setTurnDeformation(): void {}
      resetTurnDeformation(): void {}
      prewarmSurfaces(): [] {
        return [];
      }
      pruneSurfaces(): void {}
      beginBoundaryTurn(): void {}
      setBoundaryOpenProgress(): void {}
      settleBoundaryTurn(): void {}
      clearCornerLift(): void {}
      refreshSurfaceTextures(): void {}
      dispose(): void {}
    },
  };
});

function renderedPage(pageNumber: number, options: PageRenderOptions): RenderedPage {
  const canvas = new TestCanvas() as unknown as HTMLCanvasElement;
  canvas.width = options.targetWidth;
  canvas.height = Math.round(options.targetWidth / 0.72);
  return {
    pageNumber,
    canvas,
    width: canvas.width,
    height: canvas.height,
    targetWidth: canvas.width,
    quality: options.quality,
    byteSize: canvas.width * canvas.height * 4,
    dispose: () => {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

function createProvider(
  render: (pageNumber: number, options: PageRenderOptions) => Promise<RenderedPage>,
): PageProvider {
  return {
    pageCount: 7,
    renderConcurrency: 2,
    getPageSize: async () => ({ width: 720, height: 1000 }),
    renderPage: render,
    locatorForPage: (pageNumber) => ({ kind: 'fixed', pageNumber }),
    pageForLocator: (locator) => (locator.kind === 'fixed' ? locator.pageNumber : 1),
    dispose: async () => undefined,
  };
}

async function createEngine(
  render: (pageNumber: number, options: PageRenderOptions) => Promise<RenderedPage>,
  config?: Partial<BookConfig>,
) {
  const { BookEngine } = await import('./BookEngine');
  const host = {
    clientWidth: 1200,
    clientHeight: 800,
    append: () => undefined,
  } as unknown as HTMLElement;
  const onError = vi.fn();
  const onPagePreparationTimeout = vi.fn();
  const onPagePreparationFailure = vi.fn();
  const onPagePreparationChange = vi.fn();
  const onRenderingUnavailableChange = vi.fn();
  const engine = new BookEngine(host, {
    config,
    onError,
    onPagePreparationTimeout,
    onPagePreparationFailure,
    onPagePreparationChange,
    onRenderingUnavailableChange,
  });
  await engine.load(createProvider(render), { initialSpreadIndex: 1 });
  const opening = engine.open();
  await vi.advanceTimersByTimeAsync(32);
  await opening;
  return {
    engine,
    onError,
    onPagePreparationTimeout,
    onPagePreparationFailure,
    onPagePreparationChange,
    onRenderingUnavailableChange,
  };
}

beforeEach(() => {
  rendererCanvases.length = 0;
  latestBookPages = null;
  vi.useFakeTimers();
  vi.stubGlobal('document', { createElement: () => new TestCanvas() });
  vi.stubGlobal('navigator', { deviceMemory: 8 });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16),
  );
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('BookEngine 翻页失败恢复', () => {
  it('封面开合释放动态纸张后，跳到首跨页仍有有效的空白补页', async () => {
    const { engine, onPagePreparationFailure } = await createEngine(async (number, options) =>
      renderedPage(number, options),
    );
    await engine.jumpToPage(1);
    expect(engine.currentPage).toBe(1);
    expect(engine.snapshot.state).toBe('OPEN');
    expect(latestBookPages?.left?.width).toBeGreaterThan(0);
    expect(latestBookPages?.right?.width).toBeGreaterThan(0);
    expect(onPagePreparationFailure).not.toHaveBeenCalled();
    await engine.dispose();
  });

  it('点击翻页超时后保留原跨页，迟到页面不能覆盖，之后可再次翻页', async () => {
    let releasePage: (() => void) | undefined;
    let slow = true;
    const deferred = new Promise<void>((resolve) => {
      releasePage = resolve;
    });
    const { engine, onError, onPagePreparationTimeout, onPagePreparationChange } =
      await createEngine(async (number, options) => {
        if (number >= 4 && slow) await deferred;
        return renderedPage(number, options);
      });
    const originalPage = engine.currentPage;
    const turn = engine.turn('forward');
    await vi.advanceTimersByTimeAsync(8001);
    await turn;
    expect(engine.snapshot.state).toBe('OPEN');
    expect(engine.currentPage).toBe(originalPage);
    expect(onPagePreparationTimeout).toHaveBeenCalledTimes(1);
    expect(onPagePreparationChange.mock.calls).toEqual([[true], [false]]);
    expect(onError).not.toHaveBeenCalled();

    slow = false;
    releasePage?.();
    await Promise.resolve();
    const retry = engine.turn('forward');
    await vi.advanceTimersByTimeAsync(32);
    await retry;
    expect(engine.snapshot.state).toBe('OPEN');
    expect(engine.currentPage).toBe(4);
    await engine.dispose();
  });

  it('页面渲染错误只恢复当前页，重试仍能翻页', async () => {
    let fail = true;
    const { engine, onError, onPagePreparationFailure } = await createEngine(
      async (number, options) => {
        if (number >= 4 && fail) throw new Error('模拟单页渲染失败');
        return renderedPage(number, options);
      },
    );
    const retry = engine.turn('forward');
    await vi.advanceTimersByTimeAsync(32);
    await retry;
    expect(engine.snapshot.state).toBe('OPEN');
    expect(engine.currentPage).toBe(2);
    expect(onPagePreparationFailure).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    fail = false;
    const success = engine.turn('forward');
    await vi.advanceTimersByTimeAsync(32);
    await success;
    expect(engine.currentPage).toBe(4);
    await engine.dispose();
  });

  it('低缓存预算且目标页部分失败时原跨页 Canvas 仍有效', async () => {
    const originalPages = new Map<number, RenderedPage[]>();
    const { engine, onPagePreparationFailure } = await createEngine(
      async (number, options) => {
        if (number === 5) throw new Error('目标右页失败');
        const page = renderedPage(number, options);
        if (number === 2 || number === 3) {
          const pages = originalPages.get(number) ?? [];
          pages.push(page);
          originalPages.set(number, pages);
        }
        return page;
      },
      { textureBudgetBytes: 1_000_000 },
    );
    await engine.turn('forward');
    expect(engine.snapshot.state).toBe('OPEN');
    expect(engine.currentPage).toBe(2);
    expect(originalPages.get(2)?.some((page) => page.canvas.width > 0)).toBe(true);
    expect(originalPages.get(3)?.some((page) => page.canvas.width > 0)).toBe(true);
    expect(onPagePreparationFailure).toHaveBeenCalledTimes(1);
    await engine.dispose();
  });

  it('成功落页和反向翻页按时释放旧画布并保留新画布', async () => {
    const pages = new Map<number, RenderedPage[]>();
    const { engine } = await createEngine(
      async (number, options) => {
        const page = renderedPage(number, options);
        const entries = pages.get(number) ?? [];
        entries.push(page);
        pages.set(number, entries);
        return page;
      },
      { textureBudgetBytes: 1_000_000 },
    );

    const forward = engine.turn('forward');
    await vi.advanceTimersByTimeAsync(32);
    await forward;
    expect(engine.currentPage).toBe(4);
    expect(pages.get(2)?.every((page) => page.canvas.width === 0)).toBe(true);
    expect(pages.get(4)?.some((page) => page.canvas.width > 0)).toBe(true);
    expect(pages.get(5)?.some((page) => page.canvas.width > 0)).toBe(true);
    expect(engine.diagnostics.cpuCacheBytes).toBeLessThanOrEqual(
      engine.diagnostics.cpuCacheMaxBytes,
    );

    const backward = engine.turn('backward');
    await vi.advanceTimersByTimeAsync(32);
    await backward;
    expect(engine.currentPage).toBe(2);
    expect(pages.get(4)?.every((page) => page.canvas.width === 0)).toBe(true);
    expect(pages.get(5)?.every((page) => page.canvas.width === 0)).toBe(true);
    expect(pages.get(2)?.some((page) => page.canvas.width > 0)).toBe(true);
    expect(pages.get(3)?.some((page) => page.canvas.width > 0)).toBe(true);
    await engine.dispose();
  });

  it('拖拽准备超时只恢复原跨页，不进入致命错误并释放指针', async () => {
    let releasePage: (() => void) | undefined;
    const deferred = new Promise<void>((resolve) => {
      releasePage = resolve;
    });
    const { engine, onError, onPagePreparationTimeout, onPagePreparationChange } =
      await createEngine(async (number, options) => {
        if (number >= 4) await deferred;
        return renderedPage(number, options);
      });
    const canvas = rendererCanvases.at(-1)!;
    const pointerDown = new Event('pointerdown', { cancelable: true });
    Object.assign(pointerDown, { button: 0, pointerId: 1, clientX: 850, clientY: 400 });
    canvas.dispatchEvent(pointerDown);
    expect(engine.snapshot.state).toBe('DRAGGING');
    expect(canvas.hasPointerCapture(1)).toBe(true);

    await vi.advanceTimersByTimeAsync(8001);
    expect(engine.snapshot.state).toBe('OPEN');
    expect(engine.currentPage).toBe(2);
    expect(canvas.hasPointerCapture(1)).toBe(false);
    expect(onPagePreparationTimeout).toHaveBeenCalledTimes(1);
    expect(onPagePreparationChange.mock.calls).toEqual([[true], [false]]);
    expect(onError).not.toHaveBeenCalled();
    releasePage?.();
    await Promise.resolve();
    await engine.dispose();
  });

  it('跳页超时保留原跨页和原页码', async () => {
    const { engine, onError, onPagePreparationTimeout } = await createEngine(
      async (number, options) => {
        if (number >= 4) return new Promise<RenderedPage>(() => undefined);
        return renderedPage(number, options);
      },
    );
    const jump = engine.jumpToPage(4);
    await vi.advanceTimersByTimeAsync(8001);
    await jump;
    expect(engine.snapshot.state).toBe('OPEN');
    expect(engine.currentPage).toBe(2);
    expect(engine.spreadIndex).toBe(1);
    expect(onPagePreparationTimeout).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    await engine.dispose();
  });

  it('WebGL 上下文丢失后保留书籍并允许恢复纹理', async () => {
    const { engine, onError, onRenderingUnavailableChange } = await createEngine(
      async (number, options) => renderedPage(number, options),
    );
    const canvas = rendererCanvases.at(-1)!;
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(engine.snapshot.state).toBe('OPEN');
    expect(onRenderingUnavailableChange).toHaveBeenLastCalledWith(true);
    engine.retryRenderer();
    expect(onRenderingUnavailableChange).toHaveBeenLastCalledWith(false);
    expect(onError).not.toHaveBeenCalled();
    await engine.dispose();
  });

  it('后台同页渲染晚于交互完成时不能覆盖当前书页', async () => {
    let finishOld: (() => void) | undefined;
    const oldRender = new Promise<void>((resolve) => {
      finishOld = resolve;
    });
    let pageFourRenders = 0;
    const latePages: RenderedPage[] = [];
    const { engine, onError } = await createEngine(async (number, options) => {
      if (number === 4 && ++pageFourRenders === 1) {
        await oldRender;
        const latePage = renderedPage(number, options);
        latePages.push(latePage);
        return latePage;
      }
      return renderedPage(number, options);
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(pageFourRenders).toBe(1);
    const turn = engine.turn('forward');
    await vi.advanceTimersByTimeAsync(32);
    await turn;
    expect(engine.currentPage).toBe(4);
    expect(pageFourRenders).toBe(2);

    finishOld?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(latePages[0]?.canvas.width).toBe(0);
    expect(engine.snapshot.state).toBe('OPEN');
    expect(onError).not.toHaveBeenCalled();
    await engine.dispose();
  });
});
