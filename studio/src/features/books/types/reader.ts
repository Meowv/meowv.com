import type { TurnDirection } from '../engine/turn/PageCurl';

export type { TurnDirection } from '../engine/turn/PageCurl';

export const BOOK_STATES = [
  'EMPTY',
  'LOADING',
  'CLOSED',
  'OPENING',
  'OPEN',
  'DRAGGING',
  'TURNING',
  'SNAPPING_BACK',
  'CLOSING',
  'ERROR',
] as const;

export type BookState = (typeof BOOK_STATES)[number];
export type PageRenderQuality = 'preview' | 'reading';

export const BOOK_FORMATS = ['pdf', 'epub', 'txt', 'mobi', 'azw3', 'fb2', 'cbz'] as const;

export type BookFormat = (typeof BOOK_FORMATS)[number];
export type BookLayoutKind = 'fixed' | 'reflowable';
export type PageTheme = 'paper' | 'warm' | 'night';
export type ReaderFontFamily = 'publisher' | 'serif' | 'sans';
export type BookDisplayMode = 'spread' | 'focused';

export interface PublicationMetadata {
  title: string;
  authors: string[];
  language?: string;
  description?: string;
}

export interface TocItem {
  label: string;
  locator: BookLocator;
  children?: TocItem[];
}

export type BookLocator =
  | { kind: 'fixed'; pageNumber: number }
  | {
      kind: 'reflowable';
      sectionIndex: number;
      progression: number;
      cfi?: string;
    };

export interface ReaderLayoutProfile {
  fontFamily: ReaderFontFamily;
  fontSize: number;
  lineHeight: number;
  pageMargin: number;
  theme: PageTheme;
}

export interface PublicationProgress {
  stage: 'detecting' | 'parsing' | 'paginating' | 'cover' | 'warming';
  value: number;
  message: string;
}

export interface PublicationPaginateOptions {
  signal?: AbortSignal;
  onProgress?: (progress: PublicationProgress) => void;
  paginationKey?: string;
}

export interface PageSize {
  width: number;
  height: number;
}

export interface PageRenderOptions {
  /** Canvas 的目标像素宽度，而不是 CSS 宽度。 */
  targetWidth: number;
  quality: PageRenderQuality;
  /** 数值越小越优先；后台预热使用较低优先级。 */
  priority?: number;
  signal?: AbortSignal;
}

export interface RenderedPage extends PageSize {
  pageNumber: number;
  canvas: HTMLCanvasElement;
  targetWidth: number;
  quality: PageRenderQuality;
  byteSize: number;
  dispose(): void;
}

export interface PageProvider {
  readonly pageCount: number;
  /** 页面提供器可安全并行执行的渲染数量；DOM 截图类实现必须保持串行。 */
  readonly renderConcurrency?: number;
  getPageSize(pageNumber: number): Promise<PageSize>;
  renderPage(pageNumber: number, options: PageRenderOptions): Promise<RenderedPage>;
  locatorForPage(pageNumber: number): BookLocator;
  pageForLocator(locator: BookLocator): number;
  setAppearance?(theme: PageTheme): void | Promise<void>;
  dispose(): Promise<void>;
}

export interface Publication {
  readonly format: BookFormat;
  readonly layout: BookLayoutKind;
  readonly metadata: PublicationMetadata;
  readonly toc: TocItem[];
  readonly cover: Blob | null;
  paginate(
    profile: ReaderLayoutProfile,
    options?: PublicationPaginateOptions,
  ): Promise<PageProvider>;
  dispose(): Promise<void>;
}

export interface BookSnapshot {
  state: BookState;
  previousState: BookState | null;
  pageCount: number;
  spreadIndex: number;
  currentPage: number;
  displayMode: BookDisplayMode;
  turnDirection: TurnDirection | null;
  error: Error | null;
  changedAt: number;
}

export type BookSnapshotPatch = Partial<
  Pick<
    BookSnapshot,
    'pageCount' | 'spreadIndex' | 'currentPage' | 'displayMode' | 'turnDirection' | 'error'
  >
>;

export type BookStateListener = (
  snapshot: Readonly<BookSnapshot>,
  previousSnapshot: Readonly<BookSnapshot>,
) => void;
