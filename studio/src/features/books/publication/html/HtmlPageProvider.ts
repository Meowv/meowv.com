import { snapdom } from '@zumer/snapdom';
import DOMPurify from 'dompurify';
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

interface TextGlyph {
  text: string;
  rect: DOMRect;
}

interface TextRun {
  text: string;
  left: number;
  top: number;
  height: number;
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

function themeColors(profile: ReaderLayoutProfile): { background: string; foreground: string } {
  if (profile.theme === 'night') return { background: '#25221f', foreground: '#e8dfd2' };
  if (profile.theme === 'paper') return { background: '#fffdf8', foreground: '#241f1b' };
  return { background: '#ead0aa', foreground: '#2c241d' };
}

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

function scopeSelector(selector: string): string {
  const root = '.books-publication-body';
  const scoped = selector
    .trim()
    .replace(/(^|[\s>+~,(])(?::root|html|body)(?=$|[\s>+~.#[:])/gi, `$1${root}`);
  return scoped.includes(root) ? scoped : `${root} ${scoped}`;
}

function serializeScopedRule(rule: CSSRule): string {
  if (rule instanceof CSSStyleRule) {
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

function sanitizeHtml(source: string): string {
  const safe = DOMPurify.sanitize(source, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: BLOCKED_TAGS,
    FORBID_ATTR: ['srcdoc', 'srcset'],
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
      if (name === 'style') element.setAttribute('style', sanitizeCss(value));
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

function waitForImages(root: HTMLElement, signal?: AbortSignal): Promise<void> {
  const images = [...root.querySelectorAll('img')];
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
    const timeout = globalThis.setTimeout(() => finish(), 1200);
    signal?.addEventListener('abort', onAbort, { once: true });
    void Promise.all(
      images.map((image) => {
        if (image.complete) return Promise.resolve();
        return image.decode().catch(() => undefined);
      }),
    ).then(() => finish());
  });
}

export class HtmlPageProvider implements PageProvider {
  readonly #sections: HtmlBookSection[];
  readonly #profile: ReaderLayoutProfile;
  readonly #fixedLayout: boolean;
  readonly #onDispose?: () => void | Promise<void>;
  readonly #host = document.createElement('div');
  readonly #viewport = document.createElement('div');
  readonly #content = document.createElement('article');
  readonly #pagination: SectionPagination[] = [];
  readonly #sanitizedCache = new Map<number, string>();
  readonly #sanitizeInflight = new Map<number, Promise<string>>();
  #currentSection = -1;
  #pageSize: PageSize = REFLOWABLE_PAGE_SIZE;
  #fixedSourceSize: PageSize = REFLOWABLE_PAGE_SIZE;
  #pageCount = 0;
  #disposed = false;
  #renderQueue = Promise.resolve();

  static readonly SANITIZED_CACHE_LIMIT = 2;
  static readonly SANITIZED_CACHE_MAX_LENGTH = 2 * 1024 * 1024;

  private constructor(options: HtmlPageProviderOptions) {
    this.#sections = options.sections;
    this.#profile = options.profile;
    this.#fixedLayout = Boolean(options.fixedLayout);
    this.#onDispose = options.onDispose;
    this.#host.className = 'books-publication-render-host';
    this.#host.setAttribute('aria-hidden', 'true');
    Object.assign(this.#host.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      pointerEvents: 'none',
      zIndex: '-2147483647',
      contain: 'strict',
    });
    Object.assign(this.#viewport.style, {
      position: 'relative',
      overflow: 'hidden',
    });
    this.#syncViewportSize();
    this.#viewport.append(this.#content);
    this.#host.append(this.#viewport);
    document.body.append(this.#host);
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

  async #paginate(options: PublicationPaginateOptions = {}): Promise<void> {
    if (this.#fixedLayout) {
      // 固定版式以首个正文页面确定实体书比例，后续异尺寸页面在该比例内等比留白。
      await this.#mountSection(0, options.signal);
    }
    const cachedCounts = options.paginationKey
      ? await loadPaginationIndex(options.paginationKey, this.#sections.length)
      : null;
    if (cachedCounts && (await this.#verifyCachedPagination(cachedCounts, options.signal))) {
      for (const pageCount of cachedCounts) {
        this.#pagination.push({ startPage: this.#pageCount + 1, pageCount });
        this.#pageCount += pageCount;
      }
      options.onProgress?.({
        stage: 'paginating',
        value: 0.76,
        message: '正在复用分页索引…',
      });
      this.#unloadCurrentSection();
      return;
    }
    for (let index = 0; index < this.#sections.length; index += 1) {
      assertNotAborted(options.signal);
      await this.#mountSection(index, options.signal);
      const count = this.#fixedLayout
        ? 1
        : Math.max(
            1,
            Math.ceil(
              (this.#content.scrollWidth + this.#pageMarginPixels() * 2) / this.#pageSize.width,
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
    this.#unloadCurrentSection();
    if (options.paginationKey) {
      void savePaginationIndex(
        options.paginationKey,
        this.#pagination.map((item) => item.pageCount),
      );
    }
  }

  #pageMarginPixels(): number {
    return Math.round((this.#pageSize.width * this.#profile.pageMargin) / 100);
  }

  async #verifyCachedPagination(cachedCounts: number[], signal?: AbortSignal): Promise<boolean> {
    // 固定版式每章恒为一页，无需抽查。
    if (this.#fixedLayout) return true;
    try {
      await this.#mountSection(0, signal);
      const actual = Math.max(
        1,
        Math.ceil(
          (this.#content.scrollWidth + this.#pageMarginPixels() * 2) / this.#pageSize.width,
        ),
      );
      return actual === cachedCounts[0];
    } catch {
      return false;
    }
  }

  #syncViewportSize(): void {
    const width = `${this.#pageSize.width}px`;
    const height = `${this.#pageSize.height}px`;
    this.#host.style.width = width;
    this.#host.style.height = height;
    this.#viewport.style.width = width;
    this.#viewport.style.height = height;
  }

  #applyLayout(): void {
    const margin = this.#pageMarginPixels();
    const colors = themeColors(this.#profile);
    const family = fontFamily(this.#profile);
    Object.assign(this.#viewport.style, {
      background: colors.background,
      color: colors.foreground,
    });
    const fixedScale = this.#fixedLayout
      ? Math.min(
          this.#pageSize.width / this.#fixedSourceSize.width,
          this.#pageSize.height / this.#fixedSourceSize.height,
        )
      : 1;
    Object.assign(this.#content.style, {
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
    if (family) this.#content.style.setProperty('font-family', family, 'important');
    else this.#content.style.removeProperty('font-family');
    const publicationBody = this.#content.querySelector<HTMLElement>('.books-publication-body');
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
  }

  async #mountSection(index: number, signal?: AbortSignal): Promise<void> {
    if (this.#disposed) throw abortError('电子书页面提供器已释放。');
    if (this.#currentSection === index) return;
    this.#unloadCurrentSection();
    assertNotAborted(signal);
    const source = await this.#sections[index].load();
    assertNotAborted(signal);
    const html = /^(?:blob:|data:)/i.test(source)
      ? await fetch(source).then((response) => response.text())
      : source;
    assertNotAborted(signal);
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
    this.#content.innerHTML = await this.#sanitizeSection(index, html, signal);
    this.#applyLayout();
    this.#currentSection = index;
    await waitForImages(this.#content, signal);
    this.#scheduleAdjacentSanitize(index, signal);
  }

  async #sanitizeSection(index: number, html: string, signal?: AbortSignal): Promise<string> {
    const cached = this.#sanitizedCache.get(index);
    if (cached) return cached;
    const inflight = this.#sanitizeInflight.get(index);
    if (inflight) return inflight;
    const task = (async (): Promise<string> => {
      assertNotAborted(signal);
      const sanitized = sanitizeHtml(html);
      if (!this.#disposed && sanitized.length <= HtmlPageProvider.SANITIZED_CACHE_MAX_LENGTH) {
        this.#sanitizedCache.set(index, sanitized);
        this.#evictSanitizedCache();
      }
      return sanitized;
    })();
    this.#sanitizeInflight.set(index, task);
    try {
      return await task;
    } finally {
      this.#sanitizeInflight.delete(index);
    }
  }

  #evictSanitizedCache(): void {
    while (this.#sanitizedCache.size > HtmlPageProvider.SANITIZED_CACHE_LIMIT) {
      const oldest = this.#sanitizedCache.keys().next().value;
      if (oldest === undefined) return;
      this.#sanitizedCache.delete(oldest);
    }
  }

  #scheduleAdjacentSanitize(index: number, signal?: AbortSignal): void {
    for (const adjacent of [index + 1, index - 1]) {
      if (adjacent < 0 || adjacent >= this.#sections.length) continue;
      if (this.#sanitizedCache.has(adjacent) || this.#sanitizeInflight.has(adjacent)) continue;
      void this.#sections[adjacent]
        .load()
        .then(async (source) => {
          const html = /^(?:blob:|data:)/i.test(source)
            ? await fetch(source).then((response) => response.text())
            : source;
          await this.#sanitizeSection(adjacent, html, signal);
        })
        .catch(() => undefined);
    }
  }

  #unloadCurrentSection(): void {
    if (this.#currentSection >= 0) this.#sections[this.#currentSection].unload?.();
    this.#currentSection = -1;
    this.#content.replaceChildren();
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
      await this.#mountSection(sectionIndex, options.signal);
      if (!this.#fixedLayout) {
        this.#content.style.transform = `translateX(${-pageIndex * this.#pageSize.width}px)`;
      }
      const colors = themeColors(this.#profile);
      const targetWidth = Math.max(1, Math.round(options.targetWidth));
      this.#content.classList.add('books-publication-render-content--without-text');
      let capture;
      try {
        capture = await snapdom(this.#viewport, {
          backgroundColor: colors.background,
          scale: targetWidth / this.#pageSize.width,
          dpr: 1,
          embedFonts: false,
          burst: true,
          invalidate: true,
        });
      } finally {
        this.#content.classList.remove('books-publication-render-content--without-text');
      }
      const captured = await capture.toCanvas();
      if (this.#disposed || options.signal?.aborted) {
        disposeCanvas(captured);
        throw abortError();
      }
      assertNotAborted(options.signal);
      paintVisibleText(captured, this.#viewport, this.#content);
      const targetHeight = Math.max(
        1,
        Math.round(targetWidth / (this.#pageSize.width / this.#pageSize.height)),
      );
      if (captured.width === targetWidth && captured.height === targetHeight) {
        applyPageFinish(captured);
        return createRenderedPage(pageNumber, captured, options);
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
      return createRenderedPage(pageNumber, canvas, options);
    };
    const result = this.#renderQueue.then(execute, execute);
    this.#renderQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#sanitizedCache.clear();
    this.#sanitizeInflight.clear();
    this.#unloadCurrentSection();
    this.#host.remove();
    await this.#onDispose?.();
  }
}

const BLOCK_TEXT_TAGS = new Set([
  'P',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'BLOCKQUOTE',
  'PRE',
  'UL',
  'OL',
  'DL',
  'TABLE',
  'TR',
  'TD',
  'TH',
  'FIGCAPTION',
  'ASIDE',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
]);

function paintVisibleText(
  canvas: HTMLCanvasElement,
  viewport: HTMLElement,
  content: HTMLElement,
): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const viewportRect = viewport.getBoundingClientRect();
  const scaleX = canvas.width / viewportRect.width;
  const scaleY = canvas.height / viewportRect.height;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) return;

  // 块级预筛：整块落在视口外的文本节点不必逐字测量与重绘。
  const skippedBlocks = new Set<HTMLElement>();
  const blocksOf = new Map<Text, HTMLElement>();
  const blockWalker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  for (let node = blockWalker.nextNode(); node; node = blockWalker.nextNode()) {
    if (!(node instanceof Text) || !node.data.trim()) continue;
    const block = nearestTextBlock(node.parentElement);
    if (!block) continue;
    blocksOf.set(node, block);
    if (skippedBlocks.has(block)) continue;
    const rect = block.getBoundingClientRect();
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.right <= viewportRect.left ||
      rect.left >= viewportRect.right ||
      rect.bottom <= viewportRect.top ||
      rect.top >= viewportRect.bottom
    ) {
      skippedBlocks.add(block);
    }
  }

  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof Text) || !node.data.trim()) continue;
    const block = blocksOf.get(node);
    if (block && skippedBlocks.has(block)) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    const style = getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
      continue;
    const glyphs = visibleGlyphs(node, range, viewportRect);
    if (!glyphs.length) continue;
    context.save();
    context.fillStyle = style.color;
    context.font = [
      style.fontStyle,
      style.fontVariant,
      style.fontWeight,
      `${parseFloat(style.fontSize) * scaleY}px`,
      style.fontFamily,
    ].join(' ');
    context.textAlign = 'left';
    context.direction = style.direction === 'rtl' ? 'rtl' : 'ltr';
    context.textBaseline = 'alphabetic';
    for (const run of groupGlyphs(glyphs)) {
      const x = (run.left - viewportRect.left) * scaleX;
      const top = (run.top - viewportRect.top) * scaleY;
      const height = run.height * scaleY;
      const baseline = top + Math.min(height * 0.86, parseFloat(style.fontSize) * scaleY * 0.9);
      context.fillText(run.text, x, baseline);
    }
    context.restore();
  }
  range.detach();
}

function nearestTextBlock(element: HTMLElement | null): HTMLElement | null {
  let current: HTMLElement | null = element;
  while (current && current !== document.body) {
    if (BLOCK_TEXT_TAGS.has(current.tagName)) return current;
    current = current.parentElement;
  }
  return null;
}

function visibleGlyphs(node: Text, range: Range, viewport: DOMRect): TextGlyph[] {
  const glyphs: TextGlyph[] = [];
  for (let start = 0; start < node.data.length;) {
    const codePoint = node.data.codePointAt(start) ?? 0;
    const end = start + (codePoint > 0xffff ? 2 : 1);
    range.setStart(node, start);
    range.setEnd(node, end);
    const rect = range.getBoundingClientRect();
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > viewport.left &&
      rect.left < viewport.right &&
      rect.bottom > viewport.top &&
      rect.top < viewport.bottom
    ) {
      glyphs.push({ text: node.data.slice(start, end), rect });
    }
    start = end;
  }
  return glyphs;
}

function groupGlyphs(glyphs: readonly TextGlyph[]): TextRun[] {
  const runs: TextRun[] = [];
  for (const glyph of glyphs) {
    const previous = runs.at(-1);
    const sameLine = previous && Math.abs(previous.top - glyph.rect.top) < 1.5;
    if (sameLine) {
      previous.text += glyph.text;
      previous.height = Math.max(previous.height, glyph.rect.height);
    } else {
      runs.push({
        text: glyph.text,
        left: glyph.rect.left,
        top: glyph.rect.top,
        height: glyph.rect.height,
      });
    }
  }
  return runs;
}
