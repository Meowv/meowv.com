import { URL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, Plugin } from 'vite';

const DATABASE_PATTERN = /^\/data\/wallpapers\.catalog\.[^/]+\.db$/;
const MANIFEST_PATH = '/data/wallpapers.catalog.json';

function wallpapersCatalogCacheMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next: Connect.NextFunction,
): void {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (DATABASE_PATTERN.test(pathname)) {
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (pathname === MANIFEST_PATH) {
    response.setHeader('Cache-Control', 'public, max-age=60');
  }
  next();
}

export function wallpapersCatalogCachePlugin(): Plugin {
  return {
    name: 'wallpapers-catalog-cache',
    configureServer(server) {
      server.middlewares.use(wallpapersCatalogCacheMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(wallpapersCatalogCacheMiddleware);
    },
  };
}
