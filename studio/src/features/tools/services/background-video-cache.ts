const BACKGROUND_VIDEO_CACHE = 'meowv-tools-background-v1';

export type BackgroundVideoSource = {
  src: string;
  release: () => void;
};

function directSource(url: string): BackgroundVideoSource {
  return {
    src: url,
    release: () => undefined,
  };
}

function objectUrlSource(blob: Blob): BackgroundVideoSource {
  const src = URL.createObjectURL(blob);
  return {
    src,
    release: () => URL.revokeObjectURL(src),
  };
}

export async function loadBackgroundVideoSource(url: string): Promise<BackgroundVideoSource> {
  if (!('caches' in window)) return directSource(url);

  try {
    const cache = await caches.open(BACKGROUND_VIDEO_CACHE);
    const cachedResponse = await cache.match(url);
    if (cachedResponse) return objectUrlSource(await cachedResponse.blob());

    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) return directSource(url);

    const cacheResponse = response.clone();
    const [blob] = await Promise.all([
      response.blob(),
      cache.put(url, cacheResponse).catch(() => undefined),
    ]);
    return objectUrlSource(blob);
  } catch {
    // 隐私模式、存储空间不足或缓存 API 不可用时继续使用在线地址。
    return directSource(url);
  }
}

export async function pruneBackgroundVideoCache(videoUrls: readonly string[]): Promise<void> {
  if (!('caches' in window)) return;

  try {
    const cache = await caches.open(BACKGROUND_VIDEO_CACHE);
    const allowedUrls = new Set(videoUrls.map((url) => new URL(url, window.location.origin).href));
    const cachedRequests = await cache.keys();
    await Promise.all(
      cachedRequests
        .filter((request) => !allowedUrls.has(request.url))
        .map((request) => cache.delete(request)),
    );
  } catch {
    // 缓存清理失败不影响视频目录刷新与播放。
  }
}
