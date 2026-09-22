/* global self, caches, fetch, URL */

// 构建期注入，不要写死。
//
// `sw.js` 是原样拷贝到 dist 的，内容不参与构建哈希 —— 写死一个常量（这里曾经是 'v1'）会让
// 浏览器逐字节比对后发现「SW 没变」，于是永远不触发更新，下面的 activate 清理也就永远不执行，
// 历史版本的资源在 Cache Storage 里无限累积。
//
// 注入逻辑见 vite/serviceWorkerPlugin.ts；取值是本次全部产物文件名 + 本文件的摘要，
// 所以任何内容变化都会换版本，内容没变则版本不变。
const CACHE_VERSION = '__STUDIO_CACHE_VERSION__';
const CACHE_PREFIX = 'meowv-studio-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-${CACHE_VERSION}`;
const ASSET_CACHE = `${CACHE_PREFIX}assets-${CACHE_VERSION}`;
const OFFICE_CACHE = `${CACHE_PREFIX}office-${CACHE_VERSION}`;
const CURRENT_CACHES = new Set([SHELL_CACHE, ASSET_CACHE, OFFICE_CACHE]);
const APP_SHELL = ['/', '/manifest.webmanifest', '/brand/studio.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.has(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match('/'));
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js' || url.pathname === '/manifest.webmanifest') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith('/office-assets/')) {
    event.respondWith(cacheFirst(request, OFFICE_CACHE));
    return;
  }

  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname.startsWith('/icons/')
  ) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
