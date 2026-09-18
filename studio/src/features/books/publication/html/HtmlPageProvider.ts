import { snapdom } from '@zumer/snapdom';
import DOMPurify from 'dompurify';
import { themeColors } from '../../reader-theme';
import type {
  BookLocator,
  PageProvider,
  PageRenderOptions,
  PageSize,
  PublicationPaginateOptions,
  ReaderLayoutProfile,
  RenderedPage,
} from '../../types/reader';
import {
  loadPaginationIndex,
  savePaginationIndex,
} from '../../persistence/PaginationIndexRepository';
import {
  abortError,
  applyPageFinish,
  assertNotAborted,
  createRenderedPage,
  disposeCanvas,
} from '../rendered-page';
import { neutralizeNegativeVerticalMargins } from './margin-normalize';
import { SectionRefCounter, ViewportPool } from './viewport-pool';

export interface HtmlBookSection {
  id?: string;
  cfi?: string;
  load(): Promise<string>;
  unload?(): void;
}

interface SectionPagination {
  startPage: number;
  pageCount: number;
}

/** 一个离屏渲染槽位：各自持有 DOM，互不干扰。 */
interface ViewportSlot {
  readonly host: HTMLDivElement;
  readonly viewport: HTMLDivElement;
  readonly content: HTMLElement;
  /** 当前挂载的章节；-1 表示空。 */
  sectionIndex: number;
  /** 最近一次应用排版时的外观版本，用于判断是否需要重排。 */
  appearanceRevision: number;
}

function fixedViewport(source: string): PageSize {
  const documentNode = new DOMParser().parseFromString(source, 'text/html');
  const viewport =
    documentNode.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '';
  const width = Number(viewport.match(/(?:^|,)\s*width\s*=\s*([\d.]+)/i)?.[1]);
  const height = Number(viewport.match(/(?:^|,)\s*height\s*=\s*([\d.]+)/i)?.[1]);
  if (width > 0 && height > 0) return { width, height };
  const svg = documentNode.querySelector('svg');
  const viewBox = svg
    ?.getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (viewBox?.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
    return { width: viewBox[2], height: viewBox[3] };
  }
  return REFLOWABLE_PAGE_SIZE;
}

export interface HtmlPageProviderOptions {
  sections: HtmlBookSection[];
  profile: ReaderLayoutProfile;
  fixedLayout?: boolean;
  paginateOptions?: PublicationPaginateOptions;
  onDispose?: () => void | Promise<void>;
}

const REFLOWABLE_PAGE_SIZE: PageSize = { width: 700, height: 1000 };

const BLOCKED_TAGS = [
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'video',
  'audio',
];

function fontFamily(profile: ReaderLayoutProfile): string | null {
  if (profile.fontFamily === 'publisher') return null;
  if (profile.fontFamily === 'sans') {
    return 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  }
  return 'ui-serif, "Songti SC", "STSong", "Noto Serif CJK SC", serif';
}

function isSafeLocalResource(value: string): boolean {
  return (
    /^blob:/i.test(value) ||
    /^data:(?:image\/(?:avif|bmp|gif|jpe?g|png|webp)|font\/|application\/(?:font|vnd\.ms-fontobject|x-font-(?:opentype|ttf)))/i.test(
      value,
    )
  );
}

function sanitizeCss(css: string): string {
  return css
    .replace(/@import\s+[^;]+;?/gi, '')
    .replace(/local\(\s*(['"]?)[^)]+\1\s*\)\s*,?/gi, '')
    .replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi, (_match, _quote, value: string) =>
      isSafeLocalResource(value) ? `url("${value}")` : 'none',
    )
    .replace(/expression\s*\([^)]*\)/gi, '');
}

/** 内联样式也要归零负外边距：它不走 CSSStyleRule，`scopeCss` 覆盖不到。 */
let inlineStyleProbe: HTMLDivElement | null = null;
function sanitizeInlineStyle(value: string): string {
  const safe = sanitizeCss(value);
  // 便宜的预筛，避免给每个 style 属性都建一遍 CSSStyleDeclaration。
  if (!/margin/i.test(safe) || !/-\s*[\d.]/.test(safe)) return safe;
  inlineStyleProbe ??= document.createElement('div');
  inlineStyleProbe.style.cssText = safe;
  neutralizeNegativeVerticalMargins(inlineStyleProbe.style);
  const result = inlineStyleProbe.style.cssText;
  inlineStyleProbe.style.cssText = '';
  return result;
}

function scopeSelector(selector: string): string {
  const root = '.books-publication-body';
  const scoped = selector
    .trim()
    .replace(/(^|[\s>+~,(])(?::root|html|body)(?=$|[\s>+~.#[:])/gi, `$1${root}`);
  return scoped.includes(root) ? scoped : `${root} ${scoped}`;
}

function serializeScopedRule(rule: CSSRule): string {
  if (rule instanceof CSSStyleRule) {
    // 负的垂直外边距必须在这里就归零 —— 书内 CSS 的作用域是全局的（所有渲染槽位共享
    // `.books-publication-body`），一个槽位后插入的样式会命中其他已挂载的槽位，
    // 那时逐元素归一化早就跑过了，再也不会重跑。详见 margin-normalize.ts。
    neutralizeNegativeVerticalMargins(rule.style);
    const selectors = rule.selectorText.split(',').map(scopeSelector).join(', ');
    return `${selectors} { ${rule.style.cssText} }`;
  }
  if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) {
    const condition =
      rule instanceof CSSMediaRule
        ? `@media ${rule.conditionText}`
        : `@supports ${rule.conditionText}`;
    return `${condition} { ${[...rule.cssRules].map(serializeScopedRule).join('\n')} }`;
  }
  return rule.cssText;
}

function scopeCss(css: string): string {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(sanitizeCss(css));
    return [...sheet.cssRules].map(serializeScopedRule).join('\n');
  } catch {
    return '';
  }
}

const METRIC_SMOOTHING = 0.25;

/** 指数移动平均：首个样本直接采用，避免冷启动被 0 拉低。 */
function smoothMetric(previous: number, samples: number, next: number): number {
  return samples <= 1 ? next : previous + (next - previous) * METRIC_SMOOTHING;
}

function sanitizeHtml(source: string): string {
  const safe = DOMPurify.sanitize(source, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: BLOCKED_TAGS,
    FORBID_ATTR: ['srcdoc', 'srcset'],
    // Foliate 会把书内图片、字体和部分样式改写为 blob URL；先保留属性，
    // 再由下面的本地资源白名单做最终筛选。
    ADD_URI_SAFE_ATTR: ['src', 'href', 'poster', 'xlink:href'],
  });
  const documentNode = new DOMParser().parseFromString(safe, 'text/html');
  documentNode.querySelectorAll('meta[http-equiv], link').forEach((node) => node.remove());
  const scopedStyles = [...documentNode.querySelectorAll('style')]
    .map((style) => scopeCss(style.textContent ?? ''))
    .filter(Boolean)
    .join('\n');
  documentNode.querySelectorAll('style').forEach((style) => style.remove());
  documentNode.querySelectorAll<HTMLElement>('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on')) element.removeAttribute(attribute.name);
      if (name === 'src' || name === 'poster' || name === 'xlink:href') {
        if (!isSafeLocalResource(value) && !value.startsWith('#')) {
          element.removeAttribute(attribute.name);
        }
      }
      if (name === 'href') {
        const isSvgResource = element.localName === 'image' || element.localName === 'use';
        if (!value.startsWith('#') && !(isSvgResource && isSafeLocalResource(value))) {
          element.removeAttribute(attribute.name);
        }
      }
      if (name === 'style') element.setAttribute('style', sanitizeInlineStyle(value));
    }
  });
  documentNode.querySelectorAll('img').forEach((image) => {
    if (!image.hasAttribute('src')) image.remove();
  });
  documentNode.querySelectorAll('image').forEach((image) => {
    if (!image.hasAttribute('href') && !image.hasAttribute('xlink:href')) image.remove();
  });
  const wrapper = documentNode.createElement('div');
  wrapper.className = ['books-publication-body', documentNode.body.className]
    .filter(Boolean)
    .join(' ');
  for (const attribute of ['dir', 'lang', 'style'] as const) {
    const value = documentNode.body.getAttribute(attribute);
    if (value) wrapper.setAttribute(attribute, attribute === 'style' ? sanitizeCss(value) : value);
  }
  wrapper.append(...documentNode.body.childNodes);
  return `${scopedStyles ? `<style>${scopedStyles}</style>` : ''}${wrapper.outerHTML}`;
}

/**
 * 章节首页等待图片的最长时间。超过后先出文字、图片随后到位；
 * 翻页不该为了插图停住整条渲染链。
 */
const IMAGE_WAIT_TIMEOUT_MS = 400;

/**
 * 插图是否已经全部就位。加载失败的图片 `complete` 同样为 true，
 * 因此这里不会把坏图误判成「永久未就绪」。
 */
function visibleImages(root: HTMLElement, viewport: HTMLElement): HTMLImageElement[] {
  const bounds = viewport.getBoundingClientRect();
  return [...root.querySelectorAll('img')].filter((image) => {
    const imageBounds = image.getBoundingClientRect();
    return (
      imageBounds.right > bounds.left &&
      imageBounds.left < bounds.right &&
      imageBounds.bottom > bounds.top &&
      imageBounds.top < bounds.bottom
    );
  });
}

function imagesReady(root: HTMLElement, viewport: HTMLElement): boolean {
  for (const image of visibleImages(root, viewport)) {
    if (!image.complete) return false;
  }
  return true;
}

function waitForVisibleImages(
  root: HTMLElement,
  viewport: HTMLElement,
  signal?: AbortSignal,
): Promise<void> {
  const images = visibleImages(root, viewport);
  if (!images.length) return Promise.resolve();
  return waitForImages(images, signal);
}

function waitForImages(images: readonly HTMLImageElement[], signal?: AbortSignal): Promise<void> {
  if (!images.length) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown): void => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = (): void => finish(abortError());
    const timeout = globalThis.setTimeout(() => finish(), IMAGE_WAIT_TIMEOUT_MS);
    signal?.addEventListener('abort', onAbort, { once: true });
    void Promise.all(
      images.map((image) => {
        if (image.complete) return Promise.resolve();
        return image.decode().catch(() => undefined);
      }),
    ).then(() => finish());
  });
}

const SECTION_HTML_CACHE_LIMIT = 4;

/**
 * 已净化 HTML 的缓存预算（字节，LRU 淘汰）。
 * 原来是「最多 2 条」，在章节之间来回跳转会反复触发 DOMPurify + scopeCss —— 纯 CPU，
 * 对大章节并不便宜。改成按累计字节后，三体这种（净化后约 1.5MB）的书可以整本常驻，
 * 跳转几乎不再 re-sanitize。
 */
const SANITIZED_CACHE_BYTES = 8 * 1024 * 1024;
const SANITIZED_CACHE_BYTES_LOW_MEMORY = 3 * 1024 * 1024;

export class HtmlPageProvider implements PageProvider {
  readonly #sections: HtmlBookSection[];
  readonly #profile: ReaderLayoutProfile;
  readonly #fixedLayout: boolean;
  readonly #onDispose?: () => void | Promise<void>;
  readonly #slots: ViewportSlot[] = [];
  readonly #pool: ViewportPool<ViewportSlot>;
  readonly #sectionRefs = new SectionRefCounter();
  readonly #pagination: SectionPagination[] = [];
  readonly #sanitizedCache = new Map<number, string>();
  readonly #sanitizeInflight = new Map<number, Promise<string>>();
  readonly #linkedStylesCache = new Map<string, string | null>();
  readonly #sectionHtmlCache = new Map<number, string>();
  #pageSize: PageSize = REFLOWABLE_PAGE_SIZE;
  #fixedSourceSize: PageSize = REFLOWABLE_PAGE_SIZE;
  #pageCount = 0;
  #disposed = false;
  #appearanceRevision = 0;
  #captureChain: Promise<void> = Promise.resolve();
  #captureMs = 0;
  #captureSamples = 0;
  #imageWaitMs = 0;
  #imageWaitSamples = 0;

  readonly #sanitizedBudget: number;
  #sanitizedBytes = 0;

  private constructor(options: HtmlPageProviderOptions) {
    this.#sections = options.sections;
    this.#profile = options.profile;
    this.#fixedLayout = Boolean(options.fixedLayout);
    this.#onDispose = options.onDispose;
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    this.#sanitizedBudget =
      deviceMemory < 4 ? SANITIZED_CACHE_BYTES_LOW_MEMORY : SANITIZED_CACHE_BYTES;
    this.#pool = new ViewportPool<ViewportSlot>({
      // 一次 renderPage 会一直持有槽位直到截图完成。实测再多的槽位也不会更快：
      // snapdom 主体工作在主线程，4 路并行的加速比只有 0.91（反而更慢），
      // 却要多养 4 份大章节 DOM。保持 2 个槽位用于重叠「加载/等图」。
      maxSize: deviceMemory < 4 ? 1 : 2,
      create: () => {
        const slot = this.#createSlot();
        this.#slots.push(slot);
        return slot;
      },
      destroy: (slot) => {
        slot.host.remove();
        slot.content.replaceChildren();
      },
    });
  }

  /** 槽位数即并行上限；单槽位时行为与原来的串行链一致。 */
  get renderConcurrency(): number {
    return this.#pool.maxSize;
  }

  #createSlot(): ViewportSlot {
    const host = document.createElement('div');
    host.className = 'books-publication-render-host';
    host.setAttribute('aria-hidden', 'true');
    Object.assign(host.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      pointerEvents: 'none',
      zIndex: '-2147483647',
      contain: 'strict',
    });
    const viewport = document.createElement('div');
    Object.assign(viewport.style, {
      position: 'relative',
      overflow: 'hidden',
    });
    const content = document.createElement('article');
    this.#applyViewportSize(host, viewport);
    viewport.append(content);
    host.append(viewport);
    document.body.append(host);
    return { host, viewport, content, sectionIndex: -1, appearanceRevision: 0 };
  }

  static async create(options: HtmlPageProviderOptions): Promise<HtmlPageProvider> {
    if (!options.sections.length) throw new Error('电子书没有可阅读的章节。');
    const provider = new HtmlPageProvider(options);
    try {
      await provider.#paginate(options.paginateOptions);
      return provider;
    } catch (error) {
      await provider.dispose();
      throw error;
    }
  }

  get pageCount(): number {
    return this.#pageCount;
  }

  /**
   * 单页渲染耗时的指数移动平均（毫秒），仅用于开发期定位主线程阻塞点。
   * `captureMs` 覆盖 snapdom 截图与 toCanvas 的完整区间，`imageWaitMs` 覆盖 waitForImages。
   */
  get renderMetrics(): Readonly<{
    captureMs: number;
    imageWaitMs: number;
    captureSamples: number;
    imageWaitSamples: number;
  }> {
    return {
      captureMs: this.#captureMs,
      imageWaitMs: this.#imageWaitMs,
      captureSamples: this.#captureSamples,
      imageWaitSamples: this.#imageWaitSamples,
    };
  }

  setAppearance(theme: ReaderLayoutProfile['theme']): void {
    if (this.#profile.theme === theme) return;
    this.#profile.theme = theme;
    // 离屏槽位没人看，不必同步改 DOM；只提升外观版本，各槽位在下次截图前自行重排，
    // 避免与正在进行的截图撞车。
    this.#appearanceRevision += 1;
  }

  async #paginate(options: PublicationPaginateOptions = {}): Promise<void> {
    const slot = await this.#pool.acquire(options.signal);
    try {
      if (this.#fixedLayout) {
        // 固定版式以首个正文页面确定实体书比例，后续异尺寸页面在该比例内等比留白。
        await this.#mountSection(slot, 0, options.signal, false);
      }
      const cachedCounts = options.paginationKey
        ? await loadPaginationIndex(options.paginationKey, this.#sections.length)
        : null;
      if (
        cachedCounts &&
        (await this.#verifyCachedPagination(slot, cachedCounts, options.signal))
      ) {
        for (const pageCount of cachedCounts) {
          this.#pagination.push({ startPage: this.#pageCount + 1, pageCount });
          this.#pageCount += pageCount;
        }
        options.onProgress?.({
          stage: 'paginating',
          value: 0.76,
          message: '正在复用分页索引…',
        });
        return;
      }
      for (let index = 0; index < this.#sections.length; index += 1) {
        assertNotAborted(options.signal);
        await this.#mountSection(slot, index, options.signal, false);
        const count = this.#fixedLayout
          ? 1
          : Math.max(
              1,
              Math.ceil(
                (slot.content.scrollWidth + this.#pageMarginPixels() * 2) / this.#pageSize.width,
              ),
            );
        this.#pagination.push({ startPage: this.#pageCount + 1, pageCount: count });
        this.#pageCount += count;
        options.onProgress?.({
          stage: 'paginating',
          value: 0.18 + ((index + 1) / this.#sections.length) * 0.58,
          message: `正在排版书页… ${index + 1}/${this.#sections.length}`,
        });
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
      }
      if (options.paginationKey) {
        void savePaginationIndex(
          options.paginationKey,
          this.#pagination.map((item) => item.pageCount),
        );
      }
    } finally {
      // 分页结束就不需要这章了：归还槽位前先释放，否则 blob URL 与章节 HTML 缓存
      // 会一直挂在槽位上（SectionRefCounter 计数也不归零），书籍生命周期内不再回收。
      this.#releaseSlotSection(slot);
      this.#pool.release(slot);
    }
  }

  #pageMarginPixels(): number {
    return Math.round((this.#pageSize.width * this.#profile.pageMargin) / 100);
  }

  async #verifyCachedPagination(
    slot: ViewportSlot,
    cachedCounts: number[],
    signal?: AbortSignal,
  ): Promise<boolean> {
    // 固定版式每章恒为一页，无需抽查。
    if (this.#fixedLayout) return true;
    try {
      await this.#mountSection(slot, 0, signal, false);
      const actual = Math.max(
        1,
        Math.ceil((slot.content.scrollWidth + this.#pageMarginPixels() * 2) / this.#pageSize.width),
      );
      return actual === cachedCounts[0];
    } catch {
      return false;
    }
  }

  #applyViewportSize(host: HTMLElement, viewport: HTMLElement): void {
    const width = `${this.#pageSize.width}px`;
    const height = `${this.#pageSize.height}px`;
    host.style.width = width;
    host.style.height = height;
    viewport.style.width = width;
    viewport.style.height = height;
  }

  /** 页尺寸变化时同步所有槽位，含当前空闲的槽位。 */
  #syncViewportSize(): void {
    for (const slot of this.#slots) this.#applyViewportSize(slot.host, slot.viewport);
  }

  #applyLayout(slot: ViewportSlot): void {
    const margin = this.#pageMarginPixels();
    const colors = themeColors(this.#profile.theme);
    const family = fontFamily(this.#profile);
    Object.assign(slot.viewport.style, {
      background: colors.background,
      color: colors.foreground,
    });
    const fixedScale = this.#fixedLayout
      ? Math.min(
          this.#pageSize.width / this.#fixedSourceSize.width,
          this.#pageSize.height / this.#fixedSourceSize.height,
        )
      : 1;
    Object.assign(slot.content.style, {
      position: 'absolute',
      top: this.#fixedLayout
        ? `${(this.#pageSize.height - this.#fixedSourceSize.height * fixedScale) / 2}px`
        : `${margin}px`,
      left: this.#fixedLayout
        ? `${(this.#pageSize.width - this.#fixedSourceSize.width * fixedScale) / 2}px`
        : `${margin}px`,
      width: `${this.#fixedLayout ? this.#fixedSourceSize.width : this.#pageSize.width - margin * 2}px`,
      height: `${this.#fixedLayout ? this.#fixedSourceSize.height : this.#pageSize.height - margin * 2}px`,
      margin: '0',
      padding: '0',
      boxSizing: 'border-box',
      background: colors.background,
      color: colors.foreground,
      overflow: 'visible',
      columnWidth: this.#fixedLayout ? 'auto' : `${this.#pageSize.width - margin * 2}px`,
      columnGap: this.#fixedLayout ? 'normal' : `${margin * 2}px`,
      columnFill: this.#fixedLayout ? 'balance' : 'auto',
      fontSize: `${this.#profile.fontSize}px`,
      lineHeight: String(this.#profile.lineHeight),
      overflowWrap: 'break-word',
      wordBreak: 'break-word',
      transform: this.#fixedLayout ? `scale(${fixedScale})` : 'translateX(0)',
      transformOrigin: 'top left',
    });
    if (family) slot.content.style.setProperty('font-family', family, 'important');
    else slot.content.style.removeProperty('font-family');
    const publicationBody = slot.content.querySelector<HTMLElement>('.books-publication-body');
    if (this.#fixedLayout && publicationBody) {
      publicationBody.style.setProperty('width', '100%', 'important');
      publicationBody.style.setProperty('height', '100%', 'important');
      publicationBody.style.setProperty('box-sizing', 'border-box', 'important');
    } else if (publicationBody) {
      publicationBody.style.setProperty('background', 'transparent', 'important');
      publicationBody.style.setProperty('color', 'inherit', 'important');
      publicationBody.style.setProperty('min-height', '100%', 'important');
      if (family) publicationBody.style.setProperty('font-family', family, 'important');
    }
    slot.appearanceRevision = this.#appearanceRevision;
  }

  /**
   * 把章节挂到指定槽位。章节内容只在需要时重新加载；同一章节被多个槽位引用时
   * 共享同一份 HTML（含 blob URL），卸载交给 SectionRefCounter 决定。
   */
  async #mountSection(
    slot: ViewportSlot,
    index: number,
    signal?: AbortSignal,
    waitForContent = true,
  ): Promise<void> {
    if (this.#disposed) throw abortError('电子书页面提供器已释放。');
    if (slot.sectionIndex === index) {
      // 章节未变，但外观可能已经改变，需要重排后再截图。
      if (slot.appearanceRevision !== this.#appearanceRevision) this.#applyLayout(slot);
      return;
    }
    this.#releaseSlotSection(slot);
    assertNotAborted(signal);
    const html = await this.#loadSectionHtml(index, signal);
    if (this.#disposed) throw abortError('电子书页面提供器已释放。');
    if (this.#fixedLayout) {
      this.#fixedSourceSize = fixedViewport(html);
      if (index === 0) {
        const aspect = Math.min(
          1.65,
          Math.max(0.38, this.#fixedSourceSize.width / this.#fixedSourceSize.height),
        );
        this.#pageSize = { width: Math.round(1000 * aspect), height: 1000 };
        this.#syncViewportSize();
      }
    }
    slot.content.innerHTML = await this.#sanitizeSection(index, html, signal);
    // 离屏槽位里的 lazy 图片可能一直不触发加载，`complete` 会恒为 false，
    // 该页就会被永久判定为「素材未完备」而一直不进缓存。这里统一改为立即加载。
    for (const image of slot.content.querySelectorAll('img')) {
      if (image.loading === 'lazy') image.loading = 'eager';
    }
    this.#applyLayout(slot);
    slot.sectionIndex = index;
    this.#sectionRefs.retain(index);
    if (waitForContent) {
      const startedAt = performance.now();
      try {
        await waitForImages([...slot.content.querySelectorAll('img')], signal);
      } finally {
        this.#imageWaitSamples += 1;
        this.#imageWaitMs = smoothMetric(
          this.#imageWaitMs,
          this.#imageWaitSamples,
          performance.now() - startedAt,
        );
      }
    }
  }

  async #loadSectionHtml(index: number, signal?: AbortSignal): Promise<string> {
    const cached = this.#sectionHtmlCache.get(index);
    if (cached !== undefined) return cached;
    const source = await this.#sections[index].load();
    assertNotAborted(signal);
    const html = /^(?:blob:|data:)/i.test(source)
      ? await fetch(source).then((response) => response.text())
      : source;
    assertNotAborted(signal);
    // 缓存结果里可能含 blob URL；它们在章节引用归零被 unload() 时一并失效，
    // 因此这里同步丢弃缓存项（见 #releaseSlotSection），不会留悬挂引用。
    if (!this.#disposed) {
      this.#sectionHtmlCache.set(index, html);
      this.#evictSectionHtmlCache();
    }
    return html;
  }

  #evictSectionHtmlCache(): void {
    while (this.#sectionHtmlCache.size > SECTION_HTML_CACHE_LIMIT) {
      let evicted = false;
      for (const key of this.#sectionHtmlCache.keys()) {
        // 仍被槽位引用的章节不能丢缓存，否则会重新 load() 并泄漏一批 blob URL。
        if (this.#sectionRefs.count(key) > 0) continue;
        this.#sectionHtmlCache.delete(key);
        evicted = true;
        break;
      }
      if (!evicted) return;
    }
  }

  async #sanitizeSection(index: number, html: string, signal?: AbortSignal): Promise<string> {
    const cached = this.#sanitizedCache.get(index);
    if (cached) return cached;
    const inflight = this.#sanitizeInflight.get(index);
    if (inflight) return inflight;
    const task = (async (): Promise<string> => {
      assertNotAborted(signal);
      const sanitized = sanitizeHtml(await this.#inlineLinkedStyles(html, signal));
      if (!this.#disposed && !/\bblob:/i.test(html)) this.#cacheSanitized(index, sanitized);
      return sanitized;
    })();
    this.#sanitizeInflight.set(index, task);
    try {
      return await task;
    } finally {
      this.#sanitizeInflight.delete(index);
    }
  }

  async #inlineLinkedStyles(source: string, signal?: AbortSignal): Promise<string> {
    const documentNode = new DOMParser().parseFromString(source, 'text/html');
    const styleBlocks: string[] = [];
    for (const link of [
      ...documentNode.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]'),
    ]) {
      const href = link.getAttribute('href')?.trim() ?? '';
      if (isSafeLocalResource(href)) {
        assertNotAborted(signal);
        let css = this.#linkedStylesCache.get(href);
        if (css === undefined) {
          try {
            const response = await fetch(href, { signal });
            css = response.ok ? await response.text() : null;
            this.#linkedStylesCache.set(href, css);
          } catch {
            if (signal?.aborted) throw abortError();
            css = null;
            this.#linkedStylesCache.set(href, css);
            // 缺失的书内样式不应阻止正文打开，正文仍由默认版式渲染。
          }
        }
        if (css) styleBlocks.push(`<style>${css}</style>`);
      }
      link.remove();
    }
    if (styleBlocks.length)
      documentNode.head.insertAdjacentHTML('afterbegin', styleBlocks.join(''));
    return documentNode.documentElement.outerHTML;
  }

  /** 写入净化缓存并维持字节预算。单条就超预算的章节不缓存，避免把整池挤空。 */
  #cacheSanitized(index: number, html: string): void {
    if (html.length > this.#sanitizedBudget) return;
    const existing = this.#sanitizedCache.get(index);
    if (existing !== undefined) {
      // Map.set 覆盖已存在的键不会更新插入顺序，先删再写才能让 LRU 生效。
      this.#sanitizedCache.delete(index);
      this.#sanitizedBytes -= existing.length;
    }
    this.#sanitizedCache.set(index, html);
    this.#sanitizedBytes += html.length;
    this.#evictSanitizedCache();
  }

  #evictSanitizedCache(): void {
    while (this.#sanitizedBytes > this.#sanitizedBudget) {
      const oldest = this.#sanitizedCache.keys().next().value;
      if (oldest === undefined) return;
      const removed = this.#sanitizedCache.get(oldest);
      this.#sanitizedCache.delete(oldest);
      if (removed !== undefined) this.#sanitizedBytes -= removed.length;
    }
  }

  /**
   * 释放槽位当前持有的章节。只有引用计数归零时才真正 unload() ——
   * foliate 的 unload() 会 revoke 该章节的 blob URL，若另一个槽位还挂着同一章节，
   * 它的 `<img src="blob:...">` 会当场裂图。
   */
  #releaseSlotSection(slot: ViewportSlot): void {
    const index = slot.sectionIndex;
    slot.sectionIndex = -1;
    slot.content.replaceChildren();
    if (index < 0) return;
    if (!this.#sectionRefs.release(index)) return;
    this.#sections[index].unload?.();
    this.#sectionHtmlCache.delete(index);
  }

  #assertPage(pageNumber: number): void {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > this.pageCount) {
      throw new RangeError(`pageNumber 必须在 1 到 ${this.pageCount} 之间。`);
    }
  }

  #resolvePage(pageNumber: number): { sectionIndex: number; pageIndex: number } {
    this.#assertPage(pageNumber);
    const sectionIndex = this.#pagination.findIndex(
      ({ startPage, pageCount }) => pageNumber >= startPage && pageNumber < startPage + pageCount,
    );
    if (sectionIndex < 0) {
      // 分页索引过期时兜底到最后一章末页，避免越界导致整书渲染失败。
      const last = this.#pagination.length - 1;
      const pagination = this.#pagination[last];
      return { sectionIndex: last, pageIndex: pagination.pageCount - 1 };
    }
    const pagination = this.#pagination[sectionIndex];
    return { sectionIndex, pageIndex: pageNumber - pagination.startPage };
  }

  getPageSize(pageNumber: number): Promise<PageSize> {
    this.#assertPage(pageNumber);
    return Promise.resolve({ ...this.#pageSize });
  }

  locatorForPage(pageNumber: number): BookLocator {
    if (this.#fixedLayout) {
      this.#assertPage(pageNumber);
      return { kind: 'fixed', pageNumber };
    }
    const { sectionIndex, pageIndex } = this.#resolvePage(pageNumber);
    const section = this.#sections[sectionIndex];
    const count = this.#pagination[sectionIndex].pageCount;
    return {
      kind: 'reflowable',
      sectionIndex,
      progression: count <= 1 ? 0 : pageIndex / (count - 1),
      ...(section.cfi ? { cfi: section.cfi } : {}),
    };
  }

  pageForLocator(locator: BookLocator): number {
    if (locator.kind === 'fixed') {
      return Math.min(this.pageCount, Math.max(1, Math.trunc(locator.pageNumber)));
    }
    const sectionIndex = Math.min(
      this.#pagination.length - 1,
      Math.max(0, Math.trunc(locator.sectionIndex)),
    );
    const pagination = this.#pagination[sectionIndex];
    const progression = Math.min(1, Math.max(0, locator.progression));
    return pagination.startPage + Math.round((pagination.pageCount - 1) * progression);
  }

  renderPage(pageNumber: number, options: PageRenderOptions): Promise<RenderedPage> {
    const execute = async (): Promise<RenderedPage> => {
      assertNotAborted(options.signal);
      if (this.#disposed) throw new Error('电子书页面提供器已释放。');
      const { sectionIndex, pageIndex } = this.#resolvePage(pageNumber);
      const slot = await this.#pool.acquire(options.signal);
      try {
        // 章节首页等图，同章节后续页不等（图片通常已 complete，会立即 resolve）。
        await this.#mountSection(slot, sectionIndex, options.signal, pageIndex === 0);
        if (!this.#fixedLayout) {
          slot.content.style.transform = `translateX(${-pageIndex * this.#pageSize.width}px)`;
        }
        // 每一页都只等待当前视口内的图片，避免章节后面的未加载图片阻塞或污染本页结果。
        await waitForVisibleImages(slot.content, slot.viewport, options.signal);
        const colors = themeColors(this.#profile.theme);
        const targetWidth = Math.max(1, Math.round(options.targetWidth));
        const captured = await this.#capture(slot, colors, targetWidth);
        if (this.#disposed || options.signal?.aborted) {
          disposeCanvas(captured);
          throw abortError();
        }
        assertNotAborted(options.signal);
        // 截图时若还有插图没解码，这一版就是临时位图：照常交付展示，但不该被长期缓存，
        // 否则「缺图」会以缓存的形式固定下来，用户要等换主题或改窗口尺寸才会恢复。
        const provisional = !imagesReady(slot.content, slot.viewport);
        const targetHeight = Math.max(
          1,
          Math.round(targetWidth / (this.#pageSize.width / this.#pageSize.height)),
        );
        if (captured.width === targetWidth && captured.height === targetHeight) {
          applyPageFinish(captured);
          const page = createRenderedPage(pageNumber, captured, options);
          if (provisional) page.provisional = true;
          return page;
        }
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) {
          disposeCanvas(captured);
          disposeCanvas(canvas);
          throw new Error('浏览器无法创建电子书页面画布。');
        }
        context.fillStyle = colors.background;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(captured, 0, 0, canvas.width, canvas.height);
        applyPageFinish(canvas);
        disposeCanvas(captured);
        const page = createRenderedPage(pageNumber, canvas, options);
        if (provisional) page.provisional = true;
        return page;
      } finally {
        this.#pool.release(slot);
      }
    };
    return execute();
  }

  /**
   * 截图与画布转换。串行执行：snapdom 主体工作在主线程，并行没有收益
   * （实测 4 路并发加速比 0.91，且要多养 4 份大章节 DOM），
   * 能重叠的「章节加载 / 等图」已经由槽位池并行了。
   *
   * 试过但**没用**的两个方向，别再重复：
   * - `PARALLEL_CAPTURE`：主线程 CPU 密集，4 路并发加速比 0.91。
   * - snapdom 的 `clip`（只截当前列）：输出像素完全一致，但耗时只降约 5%。
   *   它省的是「样式内联」，而 `Ni()` 仍会为每个框外节点建占位克隆，
   *   节点总数不变 → SVG 序列化与光栅化成本不变。要真正降下来只能减少节点数
   *   （按页切片），不是靠 clip。
   */
  #capture(
    slot: ViewportSlot,
    colors: { background: string; foreground: string },
    targetWidth: number,
  ): Promise<HTMLCanvasElement> {
    const run = async (): Promise<HTMLCanvasElement> => {
      const captureStartedAt = performance.now();
      // 只截当前这一列。多列布局把整章都排在同一个容器里，而 snapdom 默认会把整棵子树
      // 内联样式再序列化 —— 大章节 1,869 个节点里当页只用 20~40 个。
      // `clip` 在克隆阶段就把框外的子树换成「保留尺寸的 visibility:hidden 占位」，
      // 布局与输出不变，但跳过它们的样式提取 / 字体解析 / 图片内联。
      const capture = await snapdom(slot.viewport, {
        backgroundColor: colors.background,
        scale: targetWidth / this.#pageSize.width,
        dpr: 1,
        // 系统字体无需逐页扫描和内嵌；出版方字体模式才保留书内字体资源。
        embedFonts: this.#profile.fontFamily === 'publisher',
        burst: true,
        invalidate: true,
      });
      const captured = await capture.toCanvas();
      this.#captureSamples += 1;
      this.#captureMs = smoothMetric(
        this.#captureMs,
        this.#captureSamples,
        performance.now() - captureStartedAt,
      );
      return captured;
    };
    const result = this.#captureChain.then(run, run);
    this.#captureChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#sanitizedCache.clear();
    this.#sanitizedBytes = 0;
    this.#sanitizeInflight.clear();
    this.#linkedStylesCache.clear();
    for (const slot of this.#slots) this.#releaseSlotSection(slot);
    this.#sectionHtmlCache.clear();
    this.#sectionRefs.clear();
    this.#pool.dispose();
    this.#slots.length = 0;
    await this.#onDispose?.();
  }
}
