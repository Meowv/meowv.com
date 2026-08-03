import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('r-'),
        },
      },
    }),
    AutoImport({
      imports: ['vue'],
      dirs: ['./src/features/pdf/composables'],
      dts: './src/features/pdf/auto-imports.d.ts',
    }),
    Components({
      dirs: ['./src/features/pdf/components'],
      dts: './src/features/pdf/components.d.ts',
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
    rollupOptions: {
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
    exclude: ['pdfjs-dist'],
  },
  worker: {
    format: 'es',
  },
  server: {
    host: '0.0.0.0',
    port: 4007,
    strictPort: true,
    allowedHosts: ['terminal.local'],
  },
  preview: {
    host: '0.0.0.0',
    port: 4007,
    strictPort: true,
    allowedHosts: ['terminal.local'],
  },
});
