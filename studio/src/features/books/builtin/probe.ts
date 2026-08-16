import type { BookshelfEntry, BookshelfRepository } from '../persistence/BookshelfRepository';
import { drawCoverThumbnail, drawPlaceholderCover } from '../persistence/coverThumbnail';
import { getRemovedSlugs, listBuiltinBooks } from './BuiltinShelf';
import { probeBookMetadata } from './metadata';

const CONCURRENCY = 6;

/** 正在探测的内置书；失败后保留标记，本会话内不再重试，由打开书籍时纠正。 */
const probing = new Set<string>();

async function coverThumbnailForCover(cover?: Blob): Promise<Blob | undefined> {
  if (!cover || typeof createImageBitmap !== 'function') return undefined;
  const bitmap = await createImageBitmap(cover);
  try {
    return await drawCoverThumbnail(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

async function placeholderCover(
  title: string,
  authors?: readonly string[],
): Promise<Blob | undefined> {
  return drawPlaceholderCover(title, authors).catch(() => undefined);
}

/**
 * 对内置书籍做轻量元数据探测并写入书架：
 * 未打开过的书解析书名/作者，缺失封面缩略图的存量条目（如历史版本探测失败）补探测封面；
 * 解析失败的书保持文件名兜底，本会话内不再重试，由打开书籍时纠正。
 */
export async function probeBuiltinBooks(
  bookshelf: BookshelfRepository,
  stored: BookshelfEntry[],
  onUpdated?: () => void,
): Promise<void> {
  const defs = await listBuiltinBooks();
  const removed = getRemovedSlugs();
  const storedBySlug = new Map<string, BookshelfEntry>(
    stored
      .filter((entry) => entry.builtinSlug)
      .map((entry) => [entry.builtinSlug as string, entry]),
  );
  const pending = defs.filter((def) => {
    if (probing.has(def.slug)) return false;
    // 用户已移出的内置书不再重新探测，避免删除后又写回书架。
    if (removed.has(def.slug) || removed.has(def.slug.trim())) return false;
    const storedEntry = storedBySlug.get(def.slug);
    if (!storedEntry) return true;
    return !storedEntry.coverThumbnail;
  });
  if (!pending.length) return;

  let index = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
    while (index < pending.length) {
      const def = pending[index];
      index += 1;
      probing.add(def.slug);
      try {
        const result = await probeBookMetadata(def);
        if (!result) continue;
        const existing = await bookshelf.get(result.id);
        let coverThumbnail = existing?.coverThumbnail;
        let coverThumbnailPlaceholder = existing?.coverThumbnailPlaceholder;
        if (result.cover) {
          const real = await coverThumbnailForCover(result.cover).catch(() => undefined);
          if (real) {
            coverThumbnail = real;
            coverThumbnailPlaceholder = undefined;
          }
        } else if (!coverThumbnail) {
          // 无法轻量提取封面（如 PDF）时用书名占位，打开书籍后由真实封面替换。
          const placeholder = await placeholderCover(def.title, result.metadata?.authors);
          if (placeholder) {
            coverThumbnail = placeholder;
            coverThumbnailPlaceholder = true;
          }
        }
        const entry: BookshelfEntry = {
          ...(existing ?? {}),
          id: result.id,
          format: def.format,
          metadata: result.metadata ?? { title: def.title, authors: [] },
          availability: 'available',
          builtIn: true,
          builtinSlug: def.slug,
          ...(coverThumbnail
            ? {
                coverThumbnail,
                ...(coverThumbnailPlaceholder ? { coverThumbnailPlaceholder: true } : {}),
              }
            : {}),
          addedAt: existing?.addedAt ?? 0,
          lastOpenedAt: existing?.lastOpenedAt ?? 0,
        };
        // 探测期间用户可能已移出该书，写回前再次确认。
        const currentRemoved = getRemovedSlugs();
        if (currentRemoved.has(def.slug) || currentRemoved.has(def.slug.trim())) continue;
        await bookshelf.upsert(entry);
        probing.delete(def.slug);
        onUpdated?.();
      } catch {
        // 探测失败保留文件名兜底，不再重试；打开书籍时由内容元数据纠正。
      }
    }
  });
  await Promise.all(workers);
}
