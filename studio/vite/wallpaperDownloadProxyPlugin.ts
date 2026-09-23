import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, Plugin } from 'vite';

const WALLPAPER_DOWNLOAD_PATH = '/__wallpaper-download';
const ALLOWED_WALLPAPER_HOSTS = ['shanhutech.cn', '25pan.com'];
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

function isAllowedWallpaperHost(url: URL): boolean {
  return ALLOWED_WALLPAPER_HOSTS.some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
  );
}

function isAllowedWallpaperUrl(url: URL): boolean {
  return (url.protocol === 'https:' || url.protocol === 'http:') && isAllowedWallpaperHost(url);
}

async function fetchWallpaper(url: URL): Promise<Response> {
  let currentUrl = url;
  let redirects = 0;

  while (true) {
    const upstream = await fetch(currentUrl, { credentials: 'omit', redirect: 'manual' });
    const location = upstream.headers.get('location');
    if (!REDIRECT_STATUSES.has(upstream.status) || !location) return upstream;

    if (redirects >= MAX_REDIRECTS) {
      await upstream.body?.cancel();
      throw new Error('Too many wallpaper redirects');
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      await upstream.body?.cancel();
      throw new Error('Invalid wallpaper redirect');
    }
    if (!isAllowedWallpaperUrl(nextUrl)) {
      await upstream.body?.cancel();
      throw new Error('Wallpaper redirect host is not allowed');
    }

    await upstream.body?.cancel();
    currentUrl = nextUrl;
    redirects += 1;
  }
}

function safeFilename(value: string | null): string {
  const fallback = 'wallpaper.jpg';
  if (!value) return fallback;
  const normalized = value.replace(/[\r\n"\\/]/g, '-').trim();
  return normalized.slice(0, 160) || fallback;
}

async function proxyWallpaperDownload(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost');
  const target = requestUrl.searchParams.get('url');
  if (!target) {
    response.statusCode = 400;
    response.end('Missing wallpaper URL');
    return;
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    response.statusCode = 400;
    response.end('Invalid wallpaper URL');
    return;
  }
  if (targetUrl.protocol !== 'https:' && targetUrl.protocol !== 'http:') {
    response.statusCode = 400;
    response.end('Unsupported wallpaper URL');
    return;
  }
  if (!isAllowedWallpaperHost(targetUrl)) {
    response.statusCode = 403;
    response.end('Wallpaper host is not allowed');
    return;
  }

  try {
    const upstream = await fetchWallpaper(targetUrl);
    response.statusCode = upstream.status;
    if (!upstream.ok) {
      response.end();
      return;
    }
    const contentType = upstream.headers.get('content-type');
    if (contentType) response.setHeader('Content-Type', contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(safeFilename(requestUrl.searchParams.get('filename')))}`,
    );
    const body = Buffer.from(await upstream.arrayBuffer());
    response.setHeader('Content-Length', body.byteLength);
    response.end(body);
  } catch {
    if (!response.headersSent) response.statusCode = 502;
    response.end('Wallpaper download failed');
  }
}

function wallpaperDownloadMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next: Connect.NextFunction,
): void {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost');
  if (requestUrl.pathname !== WALLPAPER_DOWNLOAD_PATH) {
    next();
    return;
  }
  if (request.method !== 'GET') {
    response.statusCode = 405;
    response.setHeader('Allow', 'GET');
    response.end();
    return;
  }
  void proxyWallpaperDownload(request, response);
}

export function wallpaperDownloadProxyPlugin(): Plugin {
  return {
    name: 'wallpaper-download-proxy',
    configureServer(server) {
      server.middlewares.use(wallpaperDownloadMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(wallpaperDownloadMiddleware);
    },
  };
}
