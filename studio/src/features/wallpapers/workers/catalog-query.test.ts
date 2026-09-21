import { describe, expect, it } from 'vitest';
import type { WallpaperCategory, WallpaperQuery } from '../types';
import {
  prepareCatalog,
  queryPreparedCatalogs,
  type CatalogItem,
  type WallpaperCatalog,
} from './catalog-query';

function item(
  id: number,
  overrides: Partial<CatalogItem> & Pick<CatalogItem, 'contentType'>,
): CatalogItem {
  return {
    id,
    title: `Wallpaper ${id}`,
    tags: [],
    author: null,
    deviceType: 'desktop',
    width: null,
    height: null,
    durationSeconds: null,
    remoteCreatedAt: '2026-01-01',
    coverUrl: null,
    previewVideoUrl: null,
    categoryIds: [1],
    ...overrides,
  };
}

function catalog(
  contentType: CatalogItem['contentType'],
  items: CatalogItem[],
  categories: WallpaperCategory[] = [],
): WallpaperCatalog {
  return {
    schemaVersion: 2,
    generatedAt: '2026-01-01T00:00:00.000Z',
    deviceType: 'desktop',
    contentType,
    categories,
    items,
  };
}

function query(overrides: Partial<WallpaperQuery> = {}): WallpaperQuery {
  return {
    device: 'desktop',
    content: 'dynamic',
    categoryId: null,
    keyword: null,
    cursor: null,
    pageSize: 20,
    ...overrides,
  };
}

function legacyQuery(
  catalogs: readonly WallpaperCatalog[],
  request: WallpaperQuery,
): ReturnType<typeof queryPreparedCatalogs> {
  const first = catalogs[0];
  if (!first) throw new Error('missing catalog');
  const categoryAllowed = (categoryId: number): Set<number> => {
    const allowed = new Set([categoryId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const category of first.categories) {
        if (
          category.parentId !== null &&
          allowed.has(category.parentId) &&
          !allowed.has(category.id)
        ) {
          allowed.add(category.id);
          changed = true;
        }
      }
    }
    return allowed;
  };
  const keyword = request.keyword?.trim().toLocaleLowerCase();
  const allowed = request.categoryId === null ? null : categoryAllowed(request.categoryId);
  const filtered = catalogs
    .flatMap((catalog) => catalog.items)
    .filter((item) => item.deviceType === request.device)
    .filter((item) => request.content === 'dynamic' || item.contentType === request.content)
    .filter((item) => !allowed || item.categoryIds.some((id) => allowed.has(id)))
    .filter((item) => {
      if (!keyword) return true;
      if ((item.title ?? '').toLocaleLowerCase().includes(keyword)) return true;
      if ((item.author ?? '').toLocaleLowerCase().includes(keyword)) return true;
      return item.tags.some((tag) => tag.toLocaleLowerCase() === keyword);
    })
    .filter((item) => {
      const cursor = request.cursor;
      if (!cursor?.remoteCreatedAt || cursor.id === null) return true;
      if (request.content === 'dynamic' && cursor.contentRank !== undefined) {
        const rank = item.contentType === 'dynamic' ? 0 : 1;
        if (rank !== cursor.contentRank) return rank > cursor.contentRank;
      }
      const date = item.remoteCreatedAt ?? '';
      return (
        date < cursor.remoteCreatedAt || (date === cursor.remoteCreatedAt && item.id < cursor.id)
      );
    })
    .sort((left, right) => {
      if (request.content === 'dynamic' && left.contentType !== right.contentType) {
        return left.contentType === 'dynamic' ? -1 : 1;
      }
      const leftDate = left.remoteCreatedAt ?? '';
      const rightDate = right.remoteCreatedAt ?? '';
      if (leftDate !== rightDate) return leftDate > rightDate ? -1 : 1;
      return right.id - left.id;
    });
  const pageSize = Math.max(1, Math.min(100, request.pageSize));
  const visible = filtered.slice(0, pageSize);
  const last = visible.at(-1);
  return {
    items: visible.map(({ categoryIds, ...item }) => {
      void categoryIds;
      return item;
    }),
    hasMore: filtered.length > pageSize,
    nextCursor:
      filtered.length > pageSize && last
        ? {
            remoteCreatedAt: last.remoteCreatedAt,
            id: last.id,
            ...(request.content === 'dynamic'
              ? { contentRank: last.contentType === 'dynamic' ? 0 : 1 }
              : {}),
          }
        : null,
  };
}

describe('queryPreparedCatalogs', () => {
  it('returns dynamic items before static items and paginates with a cursor', () => {
    const prepared = [
      prepareCatalog(
        catalog('dynamic', [
          item(1, { contentType: 'dynamic', remoteCreatedAt: '2026-02-01' }),
          item(2, { contentType: 'dynamic', remoteCreatedAt: '2026-01-01' }),
        ]),
      ),
      prepareCatalog(
        catalog('static', [item(3, { contentType: 'static', remoteCreatedAt: '2026-03-01' })]),
      ),
    ];

    const first = queryPreparedCatalogs(prepared, query({ pageSize: 2 }));
    expect(first.items.map(({ id }) => id)).toEqual([1, 2]);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toEqual({
      remoteCreatedAt: '2026-01-01',
      id: 2,
      contentRank: 0,
    });

    const second = queryPreparedCatalogs(
      prepared,
      query({ pageSize: 2, cursor: first.nextCursor }),
    );
    expect(second.items.map(({ id }) => id)).toEqual([3]);
    expect(second.hasMore).toBe(false);
  });

  it('matches descendants of the selected category', () => {
    const categories: WallpaperCategory[] = [
      {
        id: 1,
        name: 'root',
        level: 1,
        parentId: null,
        deviceType: 'desktop',
        contentType: 'dynamic',
        sortOrder: 0,
      },
      {
        id: 10,
        name: 'child',
        level: 2,
        parentId: 1,
        deviceType: 'desktop',
        contentType: 'dynamic',
        sortOrder: 0,
      },
      {
        id: 100,
        name: 'grandchild',
        level: 2,
        parentId: 10,
        deviceType: 'desktop',
        contentType: 'dynamic',
        sortOrder: 0,
      },
    ];
    const prepared = [
      prepareCatalog(
        catalog('dynamic', [item(1, { contentType: 'dynamic', categoryIds: [100] })], categories),
      ),
    ];

    expect(queryPreparedCatalogs(prepared, query({ categoryId: 1 })).items).toHaveLength(1);
  });

  it('matches keywords in title and author but requires an exact tag match', () => {
    const prepared = [
      prepareCatalog(
        catalog('dynamic', [
          item(1, { contentType: 'dynamic', title: 'Mountain Lake', tags: ['Nature'] }),
          item(2, { contentType: 'dynamic', author: 'Alice', tags: ['nature'] }),
          item(3, { contentType: 'dynamic', tags: ['nature-wallpaper'] }),
        ]),
      ),
    ];

    expect(
      queryPreparedCatalogs(prepared, query({ keyword: 'lake' })).items.map(({ id }) => id),
    ).toEqual([1]);
    expect(
      queryPreparedCatalogs(prepared, query({ keyword: 'NATURE' })).items.map(({ id }) => id),
    ).toEqual([2, 1]);
  });

  it('honours device and static content filters', () => {
    const prepared = [
      prepareCatalog(catalog('static', [item(1, { contentType: 'static' })])),
      prepareCatalog(
        catalog('dynamic', [item(2, { contentType: 'dynamic', deviceType: 'mobile' })]),
      ),
    ];

    const result = queryPreparedCatalogs(prepared, query({ content: 'static' }));
    expect(result.items.map(({ id }) => id)).toEqual([1]);
  });

  it('matches the legacy filtering, sorting, and cursor behavior', () => {
    const categories: WallpaperCategory[] = [
      {
        id: 1,
        name: 'root',
        level: 1,
        parentId: null,
        deviceType: 'desktop',
        contentType: 'dynamic',
        sortOrder: 0,
      },
      {
        id: 2,
        name: 'child',
        level: 2,
        parentId: 1,
        deviceType: 'desktop',
        contentType: 'dynamic',
        sortOrder: 0,
      },
    ];
    const dynamicItems = Array.from({ length: 18 }, (_, index) =>
      item(index + 1, {
        contentType: 'dynamic',
        title: index % 3 === 0 ? `Mountain ${index}` : `Wallpaper ${index}`,
        author: index % 4 === 0 ? 'Alice' : null,
        categoryIds: [index % 2 === 0 ? 1 : 2],
        remoteCreatedAt: `2026-02-${String((index % 9) + 1).padStart(2, '0')}`,
      }),
    );
    const staticItems = Array.from({ length: 12 }, (_, index) =>
      item(index + 100, {
        contentType: 'static',
        title: `Still ${index}`,
        categoryIds: [1],
        remoteCreatedAt: `2026-01-${String((index % 9) + 1).padStart(2, '0')}`,
      }),
    );
    const catalogs = [
      catalog('dynamic', dynamicItems, categories),
      catalog('static', staticItems, categories),
    ];
    const prepared = catalogs.map(prepareCatalog);
    const requests: WallpaperQuery[] = [
      query({ pageSize: 5 }),
      query({ pageSize: 5, categoryId: 1 }),
      query({ pageSize: 5, keyword: 'alice' }),
      query({ pageSize: 5, content: 'static', keyword: 'still' }),
      query({
        pageSize: 5,
        cursor: { remoteCreatedAt: '2026-02-01', id: 8, contentRank: 0 },
      }),
    ];

    for (const request of requests) {
      expect(queryPreparedCatalogs(prepared, request)).toEqual(legacyQuery(catalogs, request));
    }
  });
});
