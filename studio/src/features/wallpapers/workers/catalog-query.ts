import type {
  WallpaperCategory,
  WallpaperContent,
  WallpaperDevice,
  WallpaperItem,
  WallpaperPageResult,
  WallpaperQuery,
} from '../types';

export interface CatalogItem extends WallpaperItem {
  categoryIds: number[];
}

export interface WallpaperCatalog {
  schemaVersion: 2;
  generatedAt: string;
  deviceType: WallpaperDevice;
  contentType: WallpaperContent;
  categories: WallpaperCategory[];
  items: CatalogItem[];
}

interface PreparedCatalogItem {
  item: CatalogItem;
  normalizedTitle: string;
  normalizedAuthor: string;
  normalizedTags: ReadonlySet<string>;
}

export interface PreparedCatalog {
  catalog: WallpaperCatalog;
  items: readonly PreparedCatalogItem[];
  allowedCategoryIds: ReadonlyMap<number, ReadonlySet<number>>;
}

function compareItems(left: CatalogItem, right: CatalogItem): number {
  const leftDate = left.remoteCreatedAt ?? '';
  const rightDate = right.remoteCreatedAt ?? '';
  if (leftDate !== rightDate) return leftDate > rightDate ? -1 : 1;
  return right.id - left.id;
}

function buildAllowedCategoryIds(
  categories: readonly WallpaperCategory[],
): ReadonlyMap<number, ReadonlySet<number>> {
  const childrenByParent = new Map<number, number[]>();
  for (const category of categories) {
    if (category.parentId === null) continue;
    const children = childrenByParent.get(category.parentId) ?? [];
    children.push(category.id);
    childrenByParent.set(category.parentId, children);
  }

  const allowedByCategory = new Map<number, ReadonlySet<number>>();
  for (const category of categories) {
    const allowed = new Set<number>();
    const pending = [category.id];
    while (pending.length) {
      const id = pending.pop();
      if (id === undefined || allowed.has(id)) continue;
      allowed.add(id);
      pending.push(...(childrenByParent.get(id) ?? []));
    }
    allowedByCategory.set(category.id, allowed);
  }
  return allowedByCategory;
}

export function prepareCatalog(catalog: WallpaperCatalog): PreparedCatalog {
  const items = catalog.items
    .map((item) => ({
      item,
      normalizedTitle: (item.title ?? '').toLocaleLowerCase(),
      normalizedAuthor: (item.author ?? '').toLocaleLowerCase(),
      normalizedTags: new Set((item.tags ?? []).map((tag) => tag.toLocaleLowerCase())),
    }))
    .sort((left, right) => compareItems(left.item, right.item));

  return {
    catalog,
    items,
    allowedCategoryIds: buildAllowedCategoryIds(catalog.categories),
  };
}

function itemMatchesKeyword(item: PreparedCatalogItem, keyword: string): boolean {
  if (item.normalizedTitle.includes(keyword)) return true;
  if (item.normalizedAuthor.includes(keyword)) return true;
  return item.normalizedTags.has(keyword);
}

function itemMatchesCategory(item: CatalogItem, allowedCategoryIds: ReadonlySet<number>): boolean {
  return item.categoryIds.some((id) => allowedCategoryIds.has(id));
}

function isAfterCursor(
  item: CatalogItem,
  cursor: WallpaperQuery['cursor'],
  content: WallpaperQuery['content'],
): boolean {
  if (!cursor?.remoteCreatedAt || cursor.id === null) return true;
  if (content === 'dynamic' && cursor.contentRank !== undefined) {
    const rank = item.contentType === 'dynamic' ? 0 : 1;
    if (rank !== cursor.contentRank) return rank > cursor.contentRank;
  }
  const date = item.remoteCreatedAt ?? '';
  return date < cursor.remoteCreatedAt || (date === cursor.remoteCreatedAt && item.id < cursor.id);
}

function cursorStartIndex(
  items: readonly PreparedCatalogItem[],
  cursor: WallpaperQuery['cursor'],
  content: WallpaperQuery['content'],
): number {
  if (!cursor?.remoteCreatedAt || cursor.id === null) return 0;
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const item = items[middle];
    if (item && isAfterCursor(item.item, cursor, content)) high = middle;
    else low = middle + 1;
  }
  return low;
}

export function publicItem(item: CatalogItem): WallpaperItem {
  const { categoryIds, ...result } = item;
  void categoryIds;
  return result;
}

export function queryPreparedCatalogs(
  catalogs: readonly PreparedCatalog[],
  query: WallpaperQuery,
): WallpaperPageResult {
  const pageSize = Math.max(1, Math.min(100, query.pageSize));
  const keyword = query.keyword?.trim().toLocaleLowerCase() ?? '';
  const visible: PreparedCatalogItem[] = [];
  let hasMore = false;
  const allowedCategoryIds =
    query.categoryId === null
      ? null
      : (catalogs[0]?.allowedCategoryIds.get(query.categoryId) ?? new Set([query.categoryId]));

  for (const prepared of catalogs) {
    const start = cursorStartIndex(prepared.items, query.cursor, query.content);

    for (let index = start; index < prepared.items.length; index += 1) {
      const item = prepared.items[index];
      if (!item) continue;
      if (item.item.deviceType !== query.device) continue;
      if (query.content !== 'dynamic' && item.item.contentType !== query.content) continue;
      if (allowedCategoryIds && !itemMatchesCategory(item.item, allowedCategoryIds)) continue;
      if (keyword && !itemMatchesKeyword(item, keyword)) continue;
      if (visible.length >= pageSize) {
        hasMore = true;
        break;
      }
      visible.push(item);
    }
    if (hasMore) break;
  }

  const last = visible.at(-1)?.item;
  return {
    items: visible.map(({ item }) => publicItem(item)),
    hasMore,
    nextCursor:
      hasMore && last
        ? {
            remoteCreatedAt: last.remoteCreatedAt,
            id: last.id,
            ...(query.content === 'dynamic'
              ? { contentRank: last.contentType === 'dynamic' ? 0 : 1 }
              : {}),
          }
        : null,
  };
}
