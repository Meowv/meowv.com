import type { PageSize } from '../../types/reader';
import { abortError, assertNotAborted, disposeCanvas } from '../rendered-page';

const OFFSET_TOKEN = '__BOOKS_PAGE_OFFSET__';
const OFFSET_PROPERTY = '--books-page-offset';
export const SNAPSHOT_CONTENT_ATTRIBUTE = 'data-books-page-content';

export interface ChapterSnapshot {
  readonly prefix: string;
  readonly suffix: string;
}

/** 快照已内联样式与资源；只替换正文的水平位移，保留整章原始多列排版。 */
export function createChapterSnapshot(url: string, maxBytes = Infinity): ChapterSnapshot | null {
  if (!url.startsWith('data:image/svg+xml') || !url.includes(',')) return null;
  try {
    const source = decodeURIComponent(url.slice(url.indexOf(',') + 1));
    if (source.length * 2 > maxBytes) return null;
    // 章节卸载会撤销 blob URL，不能把仍引用这些 URL 的快照复用到后续请求。
    if (/\bblob:/i.test(source)) return null;
    const document = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (document.querySelector('parsererror')) return null;
    const content = document.querySelector<HTMLElement>(`[${SNAPSHOT_CONTENT_ATTRIBUTE}]`);
    const root = document.documentElement as unknown as SVGSVGElement;
    if (!content || root.localName !== 'svg') return null;
    content.style.setProperty('transform', `translateX(var(${OFFSET_PROPERTY}))`);
    root.style.setProperty(OFFSET_PROPERTY, OFFSET_TOKEN);
    const svg = new XMLSerializer().serializeToString(document);
    const offset = svg.indexOf(OFFSET_TOKEN);
    if (offset < 0) return null;
    return { prefix: svg.slice(0, offset), suffix: svg.slice(offset + OFFSET_TOKEN.length) };
  } catch {
    return null;
  }
}

/** 纯文本/矢量快照与纹理分辨率无关；图片可能已按捕获尺寸降采样，不能跨档位复用。 */
export function snapshotHasImages(snapshot: ChapterSnapshot): boolean {
  const image = /data:image\/|<(?:img|image)\b/i;
  return image.test(snapshot.prefix) || image.test(snapshot.suffix);
}

export function snapshotSvg(snapshot: ChapterSnapshot, offset: number): string {
  if (!Number.isFinite(offset)) throw new RangeError('书页位移必须为有限数值。');
  return `${snapshot.prefix}${offset}px${snapshot.suffix}`;
}

/** 以 UTF-16 上限估算占用；不同槽位共享章节快照，避免双页各克隆一次整章。 */
export class ChapterSnapshotCache {
  readonly #entries = new Map<string, ChapterSnapshot>();
  readonly maxBytes: number;
  #byteSize = 0;

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
  }

  get byteSize(): number {
    return this.#byteSize;
  }

  get size(): number {
    return this.#entries.size;
  }

  get(key: string): ChapterSnapshot | undefined {
    const snapshot = this.#entries.get(key);
    if (snapshot) {
      this.#entries.delete(key);
      this.#entries.set(key, snapshot);
    }
    return snapshot;
  }

  set(key: string, snapshot: ChapterSnapshot): void {
    this.delete(key);
    const bytes = this.#bytes(snapshot);
    if (bytes > this.maxBytes) return;
    this.#entries.set(key, snapshot);
    this.#byteSize += bytes;
    while (this.#byteSize > this.maxBytes) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.delete(oldest);
    }
  }

  delete(key: string): void {
    const snapshot = this.#entries.get(key);
    if (!snapshot) return;
    this.#byteSize -= this.#bytes(snapshot);
    this.#entries.delete(key);
  }

  clear(): void {
    this.#entries.clear();
    this.#byteSize = 0;
  }

  #bytes(snapshot: ChapterSnapshot): number {
    return (snapshot.prefix.length + snapshot.suffix.length) * 2;
  }
}

export async function renderChapterSnapshot(
  snapshot: ChapterSnapshot,
  offset: number,
  pageSize: PageSize,
  targetWidth: number,
  background: string,
  signal?: AbortSignal,
): Promise<HTMLCanvasElement> {
  assertNotAborted(signal);
  const image = new Image();
  const canvas = document.createElement('canvas');
  const abort = (): void => image.removeAttribute('src');
  signal?.addEventListener('abort', abort, { once: true });
  try {
    image.decoding = 'sync';
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(snapshotSvg(snapshot, offset))}`;
    await image.decode();
    assertNotAborted(signal);
    const scale = targetWidth / pageSize.width;
    const width = pageSize.width * scale;
    const height = pageSize.height * scale;
    // 与 snapdom.toCanvas 一致：Canvas 尺寸向下取整，drawImage 保留小数。
    // 提供器随后统一调整到目标尺寸；直接 round 会改变文字的亚像素采样。
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建电子书页面画布。');
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas;
  } catch (error) {
    disposeCanvas(canvas);
    if (signal?.aborted) throw abortError();
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    image.removeAttribute('src');
  }
}
