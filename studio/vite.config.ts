import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import { defineConfig } from 'vite';
import { builtinBooksDevPlugin } from './vite/builtinBooksDevPlugin.ts';
import { studioBuildConfig } from './vite/buildConfig.ts';
import { cubingWorkerPreloadPlugin } from './vite/cubingWorkerPreloadPlugin.ts';
import { toolsBackgroundVideosPlugin } from './vite/toolsBackgroundVideosPlugin.ts';
import { wallpaperCatalogDefine } from './vite/wallpaperCatalogConfig.ts';
import { wallpaperDownloadProxyPlugin } from './vite/wallpaperDownloadProxyPlugin.ts';
import { zitiePlugin } from './vite/zitiePlugin.ts';

export default defineConfig({
  define: wallpaperCatalogDefine(),
  plugins: [
    wallpaperDownloadProxyPlugin(),
    toolsBackgroundVideosPlugin(),
    builtinBooksDevPlugin(),
    zitiePlugin(),
    react({ include: /src\/features\/zitie\/.*\.[jt]sx$/ }),
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('r-') || tag === 'studio-header-toggle',
        },
      },
    }),
    AutoImport({
      imports: ['vue'],
      dts: './src/auto-imports.d.ts',
    }),
    tailwindcss(),
    cubingWorkerPreloadPlugin(),
  ],
  resolve: {
    alias: [
      {
        find: /^@ranuts\/shared\/(.+)$/,
        replacement: fileURLToPath(
          new URL('./src/features/office/runtime/shared/$1.ts', import.meta.url),
        ),
      },
      {
        find: '@ranuts/shared',
        replacement: fileURLToPath(
          new URL('./src/features/office/runtime/shared/index.ts', import.meta.url),
        ),
      },
      {
        find: '@ranuts/converter',
        replacement: fileURLToPath(
          new URL('./src/features/office/runtime/converter/index.ts', import.meta.url),
        ),
      },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  build: studioBuildConfig,
  optimizeDeps: {
    exclude: ['pdfjs-dist', 'cubing'],
  },
  worker: {
    format: 'es',
    rolldownOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 4001,
    strictPort: true,
    allowedHosts: ['terminal.local'],
  },
  preview: {
    host: '0.0.0.0',
    port: 4001,
    strictPort: true,
    allowedHosts: ['terminal.local'],
  },
});
