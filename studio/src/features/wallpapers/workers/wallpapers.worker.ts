import type {
  WallpaperBootstrapResult,
  WallpaperCategory,
  WallpaperItem,
  WallpaperPageResult,
  WallpaperQuery,
  WallpaperWorkerRequest,
  WallpaperWorkerResponse,
} from '../types';

interface CatalogItem extends WallpaperItem {
  categoryIds: number[];
}

interface WallpaperCatalog {
  schemaVersion: number;
  generatedAt: string;
  categories: WallpaperCategory[];
  items: CatalogItem[];
}

interface CatalogManifest {
  schemaVersion?: number;
  catalog?: string;
  bootstrap?: string;
}

interface PersistedCatalog {
  version: string;
  payload: string;
}

const CATALOG_CACHE_DB = 'meowv-wallpapers-catalog';
const CATALOG_CACHE_STORE = 'catalogs';

let manifest: CatalogManifest | null = null;
let catalog: WallpaperCatalog | null = null;
let catalogPromise: Promise<WallpaperCatalog> | null = null;
let bootstrap: WallpaperBootstrapResult | null = null;
let bootstrapPromise: Promise<WallpaperBootstrapResult> | null = null;
let itemsById = new Map<number, CatalogItem>();

function dataBaseUrl(): string {
  return `${import.meta.env.BASE_URL}data/`;
}

async function loadManifest(): Promise<CatalogManifest> {
  if (manifest) return manifest;
  const response = await fetch(`${dataBaseUrl()}wallpapers.catalog.json`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`无法加载壁纸目录清单（HTTP ${response.status}）。`);
  manifest = (await response.json()) as CatalogManifest;
  if (!manifest.catalog) throw new Error('壁纸目录清单缺少 catalog 字段。');
  return manifest;
}

function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CATALOG_CACHE_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(CATALOG_CACHE_STORE, { keyPath: 'version' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开壁纸本地缓存。'));
  });
}

async function readCachedCatalog(version: string): Promise<string | null> {
  try {
    const db = await openCache();
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction(CATALOG_CACHE_STORE, 'readonly')
        .objectStore(CATALOG_CACHE_STORE)
        .get(version);
      request.onsuccess = () =>
        resolve((request.result as PersistedCatalog | undefined)?.payload ?? null);
      request.onerror = () => reject(request.error ?? new Error('无法读取壁纸本地缓存。'));
    });
  } catch {
    return null;
  }
}

async function writeCachedCatalog(version: string, payload: string): Promise<void> {
  try {
    const db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(CATALOG_CACHE_STORE, 'readwrite');
      const store = transaction.objectStore(CATALOG_CACHE_STORE);
      store.put({ version, payload } satisfies PersistedCatalog);
      store.openCursor().onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (!cursor) return;
        if (cursor.key !== version) cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('无法保存壁纸本地缓存。'));
    });
  } catch {
    // 本地缓存不可用时继续使用内存目录。
  }
}

function prepareCatalog(value: WallpaperCatalog): WallpaperCatalog {
  itemsById = new Map(value.items.map((item) => [item.id, item]));
  return value;
}

async function ensureCatalog(): Promise<WallpaperCatalog> {
  if (catalog) return catalog;
  if (catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    const currentManifest = await loadManifest();
    const version = currentManifest.catalog!;
    const cachedPayload = await readCachedCatalog(version);
    let payload = cachedPayload;
    if (!payload) {
      const response = await fetch(`${dataBaseUrl()}${version}`, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`无法加载壁纸目录（HTTP ${response.status}）。`);
      payload = await response.text();
      void writeCachedCatalog(version, payload);
    }
    catalog = prepareCatalog(JSON.parse(payload) as WallpaperCatalog);
    return catalog;
  })();
  try {
    return await catalogPromise;
  } finally {
    catalogPromise = null;
  }
}

async function getBootstrap(): Promise<WallpaperBootstrapResult> {
  if (bootstrap) return bootstrap;
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    const currentManifest = await loadManifest();
    if (!currentManifest.bootstrap) return { items: [], categories: [], generatedAt: null };
    const response = await fetch(`${dataBaseUrl()}${currentManifest.bootstrap}`, {
      cache: 'force-cache',
    });
    if (!response.ok) throw new Error(`无法加载壁纸首屏目录（HTTP ${response.status}）。`);
    const value = (await response.json()) as {
      items?: WallpaperItem[];
      categories?: WallpaperCategory[];
      generatedAt?: string;
    };
    bootstrap = {
      items: value.items ?? [],
      categories: value.categories ?? [],
      generatedAt: value.generatedAt ?? null,
    };
    return bootstrap;
  })();
  try {
    return await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }
}

async function getCategories(payload: {
  device: string;
  content: string;
}): Promise<WallpaperCategory[]> {
  const value = await getBootstrap();
  return value.categories.filter(
    (category) =>
      category.deviceType === payload.device &&
      (payload.content === 'dynamic' ? true : category.contentType === 'static'),
  );
}

function compareItems(
  left: CatalogItem,
  right: CatalogItem,
  content: WallpaperQuery['content'],
): number {
  if (content === 'dynamic' && left.contentType !== right.contentType) {
    return left.contentType === 'dynamic' ? -1 : 1;
  }
  const leftDate = left.remoteCreatedAt ?? '';
  const rightDate = right.remoteCreatedAt ?? '';
  if (leftDate !== rightDate) return leftDate > rightDate ? -1 : 1;
  return right.id - left.id;
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

function categoryMatches(
  item: CatalogItem,
  categoryId: number | null,
  categories: WallpaperCategory[],
): boolean {
  if (categoryId === null) return true;
  const allowed = new Set<number>([categoryId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
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
  return item.categoryIds.some((id) => allowed.has(id));
}

function matchesKeyword(item: CatalogItem, keyword: string | null): boolean {
  const value = keyword?.trim().toLocaleLowerCase();
  if (!value) return true;
  if ((item.title ?? '').toLocaleLowerCase().includes(value)) return true;
  if ((item.author ?? '').toLocaleLowerCase().includes(value)) return true;
  return item.tags.some((tag) => tag.toLocaleLowerCase() === value);
}

function publicItem(item: CatalogItem): WallpaperItem {
  const { categoryIds, ...result } = item;
  void categoryIds;
  return result;
}

async function queryWallpapers(query: WallpaperQuery): Promise<WallpaperPageResult> {
  const value = await ensureCatalog();
  const filtered = value.items
    .filter((item) => item.deviceType === query.device)
    .filter((item) => query.content === 'dynamic' || item.contentType === query.content)
    .filter((item) => categoryMatches(item, query.categoryId, value.categories))
    .filter((item) => matchesKeyword(item, query.keyword))
    .filter((item) => isAfterCursor(item, query.cursor, query.content))
    .sort((left, right) => compareItems(left, right, query.content));
  const pageSize = Math.max(1, Math.min(100, query.pageSize));
  const visible = filtered.slice(0, pageSize);
  const last = visible[visible.length - 1];
  return {
    items: visible.map(publicItem),
    hasMore: filtered.length > pageSize,
    nextCursor:
      filtered.length > pageSize && last
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

async function detail(id: number): Promise<WallpaperItem | null> {
  await ensureCatalog();
  const item = itemsById.get(id);
  if (!item) return null;
  return publicItem(item);
}

self.onmessage = async (event: MessageEvent<WallpaperWorkerRequest>) => {
  const request = event.data;
  const response: WallpaperWorkerResponse = { id: request.id, ok: true };
  try {
    if (request.action === 'init') await ensureCatalog();
    else if (request.action === 'bootstrap') response.data = await getBootstrap();
    else if (request.action === 'categories')
      response.data = await getCategories(request.payload as { device: string; content: string });
    else if (request.action === 'query')
      response.data = await queryWallpapers(request.payload as WallpaperQuery);
    else if (request.action === 'detail')
      response.data = await detail(Number((request.payload as { id: number }).id));
    self.postMessage(response);
  } catch (error) {
    response.ok = false;
    response.error = error instanceof Error ? error.message : '壁纸目录查询失败。';
    self.postMessage(response);
  }
};
