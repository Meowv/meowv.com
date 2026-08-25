import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import { defineConfig } from 'vite';
import { builtinBooksDevPlugin } from './vite/builtinBooksDevPlugin.ts';
import { toolsBackgroundVideosPlugin } from './vite/toolsBackgroundVideosPlugin.ts';

export default defineConfig({
  plugins: [
    toolsBackgroundVideosPlugin(),
    builtinBooksDevPlugin(),
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
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 7000,
    rolldownOptions: {
      checks: {
        pluginTimings: false,
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('vue-router')) return 'vue-router';
          if (id.includes('/vue/')) return 'vue';
          return undefined;
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist', 'cubing'],
  },
  worker: {
    format: 'es',
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
