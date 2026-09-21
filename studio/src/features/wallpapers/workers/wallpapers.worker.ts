import type {
  WallpaperBootstrapResult,
  WallpaperCategory,
  WallpaperContent,
  WallpaperDevice,
  WallpaperItem,
  WallpaperQuery,
  WallpaperRandomBackgroundRequest,
  WallpaperWorkerRequest,
  WallpaperWorkerResponse,
} from '../types';
import { gunzipSync } from 'fflate';
import {
  prepareCatalog as prepareCatalogIndex,
  publicItem,
  queryPreparedCatalogs,
  type CatalogItem,
  type PreparedCatalog,
  type WallpaperCatalog,
} from './catalog-query';

interface CatalogEntry {
  file: string;
  fileSize?: number;
}

interface CatalogManifest {
  schemaVersion?: number;
  catalogs?: Record<string, CatalogEntry>;
  bootstrap?: string;
  encryption?: string;
  encryptionVersion?: number;
  compression?: string;
  generatedAt?: string;
}

interface PersistedCatalog {
  key: string;
  version: string;
  bucket: string;
  payload: ArrayBuffer;
}

const CATALOG_CACHE_DB = 'meowv-wallpapers-catalog';
const CATALOG_CACHE_STORE = 'catalogs';

let manifest: CatalogManifest | null = null;
let manifestPromise: Promise<CatalogManifest> | null = null;
const CATALOG_BUCKETS = [
  'desktop:dynamic',
  'desktop:static',
  'mobile:dynamic',
  'mobile:static',
] as const;
type CatalogBucket = (typeof CATALOG_BUCKETS)[number];
const TOOLS_BACKGROUND_CATEGORY_NAME = '美女';

const catalogs = new Map<CatalogBucket, PreparedCatalog>();
const catalogPromises = new Map<CatalogBucket, Promise<PreparedCatalog>>();
let bootstrap: WallpaperBootstrapResult | null = null;
let bootstrapPromise: Promise<WallpaperBootstrapResult> | null = null;
const itemsById = new Map<number, CatalogItem>();
let cacheCleanupPromise: Promise<void> | null = null;
let prefetchPromise: Promise<PromiseSettledResult<PreparedCatalog>[]> | null = null;

const CATALOG_ENCRYPTION_VERSION = 2;
const CATALOG_ENCRYPTION_NAME = 'aes-256-gcm';
const CATALOG_COMPRESSION = 'gzip';
const CATALOG_MAGIC = new Uint8Array([0x4d, 0x57, 0x50, 0x43]);
const WALLPAPER_RELEASE_KEY = import.meta.env.VITE_WALLPAPER_KEY as string | undefined;
const catalogKeyPromises = new Map<string, Promise<CryptoKey>>();

function dataBaseUrl(): string {
  return `${import.meta.env.BASE_URL}data/`;
}

async function loadManifest(): Promise<CatalogManifest> {
  if (manifest) return manifest;
  if (manifestPromise) return manifestPromise;
  manifestPromise = (async () => {
    const response = await fetch(`${dataBaseUrl()}wallpapers.catalog.json`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`无法加载壁纸目录清单（HTTP ${response.status}）。`);
    const value = (await response.json()) as CatalogManifest;
    if (value.schemaVersion !== 2 || !value.catalogs) {
      throw new Error('壁纸目录清单格式不受支持。');
    }
    for (const bucket of CATALOG_BUCKETS) {
      if (!value.catalogs[bucket]?.file) {
        throw new Error(`壁纸目录清单缺少 ${bucket} bucket。`);
      }
    }
    if (
      value.encryption !== CATALOG_ENCRYPTION_NAME ||
      value.encryptionVersion !== CATALOG_ENCRYPTION_VERSION ||
      value.compression !== CATALOG_COMPRESSION
    ) {
      throw new Error('壁纸目录加密格式不受支持。');
    }
    manifest = value;
    return value;
  })();
  try {
    return await manifestPromise;
  } finally {
    manifestPromise = null;
  }
}

function bucketKey(device: WallpaperDevice, content: WallpaperContent): CatalogBucket {
  return `${device}:${content}` as CatalogBucket;
}

function requiredBuckets(query: WallpaperQuery): CatalogBucket[] {
  const dynamic = bucketKey(query.device, 'dynamic');
  if (query.content === 'dynamic') return [dynamic, bucketKey(query.device, 'static')];
  return [bucketKey(query.device, 'static')];
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function encryptionKey(context: string): Promise<CryptoKey> {
  const pending = catalogKeyPromises.get(context);
  if (pending) return pending;
  const promise = (async () => {
    if (!WALLPAPER_RELEASE_KEY) throw new Error('壁纸目录解密密钥不可用。');
    const masterKey = decodeBase64(WALLPAPER_RELEASE_KEY);
    if (masterKey.length !== 32) throw new Error('壁纸目录解密密钥无效。');
    const contextBytes = new TextEncoder().encode(context);
    const material = new Uint8Array(
      masterKey.length + CATALOG_MAGIC.length + 1 + contextBytes.length,
    );
    material.set(masterKey, 0);
    material.set(CATALOG_MAGIC, masterKey.length);
    material[masterKey.length + CATALOG_MAGIC.length] = CATALOG_ENCRYPTION_VERSION;
    material.set(contextBytes, masterKey.length + CATALOG_MAGIC.length + 1);
    const digest = await crypto.subtle.digest('SHA-256', material);
    return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['decrypt']);
  })();
  catalogKeyPromises.set(context, promise);
  try {
    return await promise;
  } finally {
    catalogKeyPromises.delete(context);
  }
}

async function decryptPayload(payload: ArrayBuffer, context: string): Promise<string> {
  const bytes = new Uint8Array(payload);
  const headerSize = CATALOG_MAGIC.length + 1 + 12 + 16;
  if (bytes.length <= headerSize) throw new Error('壁纸目录加密文件格式无效。');
  for (let index = 0; index < CATALOG_MAGIC.length; index += 1) {
    if (bytes[index] !== CATALOG_MAGIC[index]) throw new Error('壁纸目录加密文件格式无效。');
  }
  if (bytes[CATALOG_MAGIC.length] !== CATALOG_ENCRYPTION_VERSION) {
    throw new Error('壁纸目录加密版本不匹配。');
  }
  const ivStart = CATALOG_MAGIC.length + 1;
  const tagStart = ivStart + 12;
  const ciphertextStart = tagStart + 16;
  const iv = bytes.slice(ivStart, tagStart);
  const encrypted = new Uint8Array(bytes.length - ciphertextStart + 16);
  encrypted.set(bytes.slice(ciphertextStart), 0);
  encrypted.set(bytes.slice(tagStart, ciphertextStart), bytes.length - ciphertextStart);
  try {
    const clear = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      await encryptionKey(context),
      encrypted,
    );
    return new TextDecoder().decode(gunzipSync(new Uint8Array(clear)));
  } catch {
    throw new Error('壁纸目录解密失败。');
  }
}

function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CATALOG_CACHE_DB, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(CATALOG_CACHE_STORE)) {
        db.deleteObjectStore(CATALOG_CACHE_STORE);
      }
      db.createObjectStore(CATALOG_CACHE_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开壁纸本地缓存。'));
  });
}

async function readCachedCatalog(key: string): Promise<PersistedCatalog | null> {
  try {
    const db = await openCache();
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction(CATALOG_CACHE_STORE, 'readonly')
        .objectStore(CATALOG_CACHE_STORE)
        .get(key);
      request.onsuccess = () => resolve((request.result as PersistedCatalog | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('无法读取壁纸本地缓存。'));
    });
  } catch {
    return null;
  }
}

async function writeCachedCatalog(record: PersistedCatalog): Promise<void> {
  try {
    const db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(CATALOG_CACHE_STORE, 'readwrite');
      const store = transaction.objectStore(CATALOG_CACHE_STORE);
      store.put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('无法保存壁纸本地缓存。'));
    });
  } catch {
    // 本地缓存不可用时继续使用内存目录。
  }
}

async function cleanupCachedCatalogs(version: string): Promise<void> {
  if (cacheCleanupPromise) return cacheCleanupPromise;
  cacheCleanupPromise = (async () => {
    try {
      const db = await openCache();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(CATALOG_CACHE_STORE, 'readwrite');
        transaction.objectStore(CATALOG_CACHE_STORE).openCursor().onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (!cursor) return;
          const value = cursor.value as PersistedCatalog;
          if (value.version !== version) cursor.delete();
          cursor.continue();
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('无法清理壁纸本地缓存。'));
      });
    } catch {
      // 本地缓存不可用时继续使用内存目录。
    }
  })();
  return cacheCleanupPromise;
}

function prepareCatalog(value: WallpaperCatalog, bucket: CatalogBucket): PreparedCatalog {
  if (value.schemaVersion !== 2 || bucketKey(value.deviceType, value.contentType) !== bucket) {
    throw new Error('壁纸目录分片内容不匹配。');
  }
  for (const item of value.items) itemsById.set(item.id, item);
  const prepared = prepareCatalogIndex(value);
  catalogs.set(bucket, prepared);
  return prepared;
}

async function loadCatalog(bucket: CatalogBucket): Promise<PreparedCatalog> {
  const existing = catalogs.get(bucket);
  if (existing) return existing;
  const pending = catalogPromises.get(bucket);
  if (pending) return pending;
  const promise = (async () => {
    const currentManifest = await loadManifest();
    const version = currentManifest.generatedAt ?? 'unknown';
    const file = currentManifest.catalogs![bucket].file;
    const key = `${version}:${bucket}`;
    const cached = await readCachedCatalog(key);
    let payload = cached?.payload ?? null;
    if (!payload) {
      const response = await fetch(`${dataBaseUrl()}${file}`, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`无法加载壁纸目录（HTTP ${response.status}）。`);
      payload = await response.arrayBuffer();
      void writeCachedCatalog({ key, version, bucket, payload });
    }
    await cleanupCachedCatalogs(version);
    return prepareCatalog(
      JSON.parse(await decryptPayload(payload, bucket)) as WallpaperCatalog,
      bucket,
    );
  })();
  catalogPromises.set(bucket, promise);
  try {
    return await promise;
  } finally {
    catalogPromises.delete(bucket);
  }
}

async function prefetchCatalogs(): Promise<PromiseSettledResult<PreparedCatalog>[]> {
  if (prefetchPromise) return prefetchPromise;
  prefetchPromise = Promise.allSettled(CATALOG_BUCKETS.map((bucket) => loadCatalog(bucket)));
  try {
    return await prefetchPromise;
  } finally {
    prefetchPromise = null;
  }
}

async function queryCatalogs(query: WallpaperQuery): Promise<PreparedCatalog[]> {
  const values = await Promise.all(requiredBuckets(query).map((bucket) => loadCatalog(bucket)));
  if (!values[0]) throw new Error('壁纸目录分片为空。');
  return values;
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
    const payload = await response.arrayBuffer();
    const value = JSON.parse(await decryptPayload(payload, 'bootstrap')) as {
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

async function queryWallpapers(query: WallpaperQuery) {
  const values = await queryCatalogs(query);
  return queryPreparedCatalogs(values, query);
}

async function detail(id: number): Promise<WallpaperItem | null> {
  for (const bucket of CATALOG_BUCKETS) {
    if (!itemsById.has(id) && !catalogs.has(bucket)) {
      try {
        await loadCatalog(bucket);
      } catch {
        // 单个分片损坏或暂时不可用时继续查找其他分片。
      }
    }
    const item = itemsById.get(id);
    if (item) return publicItem(item);
  }
  const item = itemsById.get(id);
  if (!item) return null;
  return publicItem(item);
}

async function randomBackground(
  payload: WallpaperRandomBackgroundRequest,
): Promise<WallpaperItem | null> {
  const catalog = await loadCatalog('desktop:dynamic');
  const category = catalog.catalog.categories.find(
    (item) =>
      item.deviceType === 'desktop' &&
      item.contentType === 'dynamic' &&
      item.name === TOOLS_BACKGROUND_CATEGORY_NAME,
  );
  if (!category) return null;
  const allowedCategoryIds = catalog.allowedCategoryIds.get(category.id) ?? new Set([category.id]);
  const playable: CatalogItem[] = [];
  for (const { item } of catalog.items) {
    if (
      item.deviceType === 'desktop' &&
      item.contentType === 'dynamic' &&
      item.categoryIds.some((id) => allowedCategoryIds.has(id)) &&
      Boolean(item.previewVideoUrl)
    ) {
      playable.push(item);
    }
  }
  if (!playable.length) return null;

  const excludeId = Number.isInteger(payload.excludeId) ? payload.excludeId : null;
  const candidates =
    playable.length > 1 && excludeId !== null
      ? playable.filter((item) => item.id !== excludeId)
      : playable;
  const pool = candidates.length ? candidates : playable;
  const selected = pool[Math.floor(Math.random() * pool.length)];
  return selected ? publicItem(selected) : null;
}

self.onmessage = async (event: MessageEvent<WallpaperWorkerRequest>) => {
  const request = event.data;
  const response: WallpaperWorkerResponse = { id: request.id, ok: true };
  try {
    if (request.action === 'init') {
      const payload = request.payload as { device: WallpaperDevice; content: WallpaperContent };
      await Promise.all(
        requiredBuckets({
          device: payload.device,
          content: payload.content,
          categoryId: null,
          keyword: null,
          cursor: null,
          pageSize: 1,
        }).map((bucket) => loadCatalog(bucket)),
      );
    } else if (request.action === 'prefetch') {
      const results = await prefetchCatalogs();
      response.data = {
        loaded: results.filter((result) => result.status === 'fulfilled').length,
        failed: results.filter((result) => result.status === 'rejected').length,
      };
    } else if (request.action === 'bootstrap') response.data = await getBootstrap();
    else if (request.action === 'categories')
      response.data = await getCategories(request.payload as { device: string; content: string });
    else if (request.action === 'query')
      response.data = await queryWallpapers(request.payload as WallpaperQuery);
    else if (request.action === 'detail')
      response.data = await detail(Number((request.payload as { id: number }).id));
    else if (request.action === 'random-background')
      response.data = await randomBackground(
        (request.payload ?? {}) as WallpaperRandomBackgroundRequest,
      );
    self.postMessage(response);
  } catch (error) {
    response.ok = false;
    response.error = error instanceof Error ? error.message : '壁纸目录查询失败。';
    self.postMessage(response);
  }
};
