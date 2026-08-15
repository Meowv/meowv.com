import type { BookshelfEntry } from '../persistence/BookshelfRepository';
import { formatForFileName, slugForFileName, titleForFileName, type BuiltinBookDef } from './types';

export const BUILTIN_ID_PREFIX = 'builtin:';

const REMOVED_KEY = 'meowv-studio:books:builtin-removed:v1';
const MANIFEST_CACHE_MS = 30 * 1000;

let manifestPromise: Promise<BuiltinBookDef[]> | null = null;
let manifestFetchedAt = 0;
const fileCache = new Map<string, Promise<File>>();

export function builtinDirectoryUrl(): string {
  return `${import.meta.env.BASE_URL}data/books/`;
}

function builtinFileUrl(fileName: string): string {
  return builtinDirectoryUrl() + encodeURIComponent(fileName);
}

export function builtinVirtualId(slug: string): string {
  return `${BUILTIN_ID_PREFIX}${slug}`;
}

export function isBuiltinEntry(entry: BookshelfEntry): boolean {
  return entry.builtIn === true;
}

/** 解码 autoindex 转义过的 HTML 实体（与浏览器解析 <a href> 行为一致，仅单层解码）。 */
export function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

/** 由书架条目重建内置书籍定义（slug 即文件名去扩展名，格式由扩展名判断，可精确还原）。 */
export function builtinDefForEntry(entry: {
  builtinSlug: string;
  format: BookshelfEntry['format'];
}): BuiltinBookDef {
  const slug = decodeHtmlEntities(entry.builtinSlug);
  return {
    slug,
    title: slug,
    format: entry.format,
    url: builtinFileUrl(`${slug}.${entry.format}`),
  };
}

/** 解析 autoindex 页面中的文件链接；href 属性由浏览器自动完成 HTML 实体解码。 */
function parseAutoindexNames(html: string): string[] {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const names: string[] = [];
  for (const anchor of Array.from(document.querySelectorAll('a'))) {
    const raw = anchor.getAttribute('href')?.trim() ?? '';
    if (!raw || raw === '../' || raw === '..' || raw === '/') continue;
    let name = raw;
    try {
      name = decodeURIComponent(raw);
    } catch {
      // 非百分号编码的文件名保持原样。
    }
    names.push(name);
  }
  return names;
}

/** 读取内置书库目录的文件列表；目录不可用时返回空数组，不影响本地书架。 */
export async function listBuiltinBooks(force = false): Promise<BuiltinBookDef[]> {
  if (manifestPromise && (force || Date.now() - manifestFetchedAt < MANIFEST_CACHE_MS)) {
    return manifestPromise;
  }
  manifestPromise = (async () => {
    const response = await fetch(builtinDirectoryUrl(), { cache: 'no-cache' });
    if (!response.ok) return [];
    const html = await response.text();
    return parseAutoindexNames(html)
      .filter((name) => !name.startsWith('.'))
      .map((name) => {
        const format = formatForFileName(name);
        if (!format) return null;
        return {
          slug: slugForFileName(name),
          title: titleForFileName(name),
          format,
          url: builtinFileUrl(name),
        } satisfies BuiltinBookDef;
      })
      .filter((def): def is BuiltinBookDef => def !== null)
      .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
  })().catch(() => []);
  manifestFetchedAt = Date.now();
  manifestPromise.then(() => {
    manifestFetchedAt = Date.now();
  });
  return manifestPromise;
}

/** 将内置书库与持久化书架合并：未移出且未打开过的书籍生成虚拟条目。 */
export async function mergeBuiltinEntries(stored: BookshelfEntry[]): Promise<BookshelfEntry[]> {
  const defs = await listBuiltinBooks();
  if (!defs.length) return stored;
  const removed = getRemovedSlugs();
  // 旧版本 slug 经过 trim 可能与实际文件名不一致；按 trim 后的名称对齐书库定义，修正为精确文件名。
  const exactByTrimmed = new Map<string, string>();
  for (const def of defs) exactByTrimmed.set(def.slug.trim(), def.slug);
  const entries = stored.map((entry) => {
    if (!entry.builtIn || !entry.builtinSlug) return entry;
    const exact = exactByTrimmed.get(entry.builtinSlug.trim());
    if (!exact || exact === entry.builtinSlug) return entry;
    return { ...entry, builtinSlug: exact };
  });
  const openedSlugs = new Set(
    entries.filter((entry) => entry.builtinSlug).map((entry) => entry.builtinSlug as string),
  );
  for (const def of defs) {
    const removedKey = def.slug.trim();
    if (removed.has(def.slug) || removed.has(removedKey) || openedSlugs.has(def.slug)) continue;
    entries.push({
      id: builtinVirtualId(def.slug),
      format: def.format,
      metadata: { title: def.title, authors: [] },
      availability: 'available',
      builtIn: true,
      builtinSlug: def.slug,
      addedAt: 0,
      lastOpenedAt: 0,
    } satisfies BookshelfEntry);
  }
  return entries;
}

/** 获取内置书籍文件；lastModified 固定为 0，保证指纹与进度跨会话稳定。 */
export function fetchBuiltinFile(def: BuiltinBookDef): Promise<File> {
  const cached = fileCache.get(def.slug);
  if (cached) return cached;
  const task = (async () => {
    const response = await fetch(def.url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`内置书籍加载失败：${def.url}`);
    return new File([await response.arrayBuffer()], def.title + `.${def.format}`, {
      lastModified: 0,
    });
  })();
  fileCache.set(def.slug, task);
  task.catch(() => fileCache.delete(def.slug));
  return task;
}

export function getRemovedSlugs(): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(REMOVED_KEY) ?? '[]');
    return new Set(
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [],
    );
  } catch {
    return new Set();
  }
}

export function markBuiltinRemoved(slug: string): void {
  const removed = getRemovedSlugs();
  removed.add(slug);
  try {
    localStorage.setItem(REMOVED_KEY, JSON.stringify([...removed]));
  } catch {
    // 隐私模式下仅当前会话生效。
  }
}

export function restoreBuiltin(slug: string): void {
  const removed = getRemovedSlugs();
  if (!removed.delete(slug)) return;
  try {
    localStorage.setItem(REMOVED_KEY, JSON.stringify([...removed]));
  } catch {
    // 隐私模式下仅当前会话生效。
  }
}
