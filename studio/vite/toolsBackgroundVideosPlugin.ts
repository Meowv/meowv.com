import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import type { Plugin } from 'vite';

const backgroundDirectory = fileURLToPath(new URL('../public/data/background', import.meta.url));
const backgroundVirtualModuleId = 'virtual:tools-background-videos';
const resolvedBackgroundVirtualModuleId = `\0${backgroundVirtualModuleId}`;

function readBackgroundEntries() {
  if (!existsSync(backgroundDirectory)) return [];

  return readdirSync(backgroundDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp4'))
    .map((entry) => {
      const stats = statSync(join(backgroundDirectory, entry.name));
      return {
        name: entry.name,
        type: 'file',
        mtime: stats.mtime.toUTCString(),
        size: stats.size,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
}

function readBackgroundVideos(): string[] {
  return readBackgroundEntries().map(
    (entry) => `/data/background/${encodeURIComponent(entry.name)}`,
  );
}

export function toolsBackgroundVideosPlugin(): Plugin {
  return {
    name: 'tools-background-videos',
    resolveId(id) {
      return id === backgroundVirtualModuleId ? resolvedBackgroundVirtualModuleId : undefined;
    },
    load(id) {
      if (id !== resolvedBackgroundVirtualModuleId) return undefined;
      return `export default ${JSON.stringify(readBackgroundVideos())};`;
    },
    configureServer(server) {
      server.watcher.add(backgroundDirectory);
      server.middlewares.use((request, response, next) => {
        const requestUrl = new URL(request.url ?? '/', 'http://localhost');
        if (requestUrl.pathname !== '/data/background/') {
          next();
          return;
        }

        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify(readBackgroundEntries()));
      });
    },
    handleHotUpdate(context) {
      const relativePath = relative(backgroundDirectory, context.file);
      if (!relativePath || relativePath.startsWith(`..${sep}`) || dirname(relativePath) !== '.') {
        return undefined;
      }
      if (!relativePath.toLowerCase().endsWith('.mp4')) return undefined;

      const module = context.server.moduleGraph.getModuleById(resolvedBackgroundVirtualModuleId);
      if (module) context.server.moduleGraph.invalidateModule(module);
      context.server.ws.send({ type: 'full-reload', path: '*' });
      return [];
    },
  };
}
