import { existsSync, readdirSync } from 'node:fs';
import { dirname, relative, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import type { Plugin } from 'vite';

const backgroundDirectory = fileURLToPath(new URL('../public/data/background', import.meta.url));
const backgroundVirtualModuleId = 'virtual:tools-background-videos';
const resolvedBackgroundVirtualModuleId = `\0${backgroundVirtualModuleId}`;

function readBackgroundVideos(): string[] {
  if (!existsSync(backgroundDirectory)) return [];

  return readdirSync(backgroundDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp4'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((name) => `/data/background/${encodeURIComponent(name)}`);
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
