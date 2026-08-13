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

export interface PageSize {
  width: number;
  height: number;
}

export interface PageRenderOptions {
  /** Canvas 的目标像素宽度，而不是 CSS 宽度。 */
  targetWidth: number;
  quality: PageRenderQuality;
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
  getPageSize(pageNumber: number): Promise<PageSize>;
  renderPage(pageNumber: number, options: PageRenderOptions): Promise<RenderedPage>;
  dispose(): Promise<void>;
}

export interface BookSnapshot {
  state: BookState;
  previousState: BookState | null;
  pageCount: number;
  spreadIndex: number;
  turnDirection: TurnDirection | null;
  error: Error | null;
  changedAt: number;
}

export type BookSnapshotPatch = Partial<
  Pick<BookSnapshot, 'pageCount' | 'spreadIndex' | 'turnDirection' | 'error'>
>;

export type BookStateListener = (
  snapshot: Readonly<BookSnapshot>,
  previousSnapshot: Readonly<BookSnapshot>,
) => void;
