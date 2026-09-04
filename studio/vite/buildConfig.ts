import { fileURLToPath } from 'node:url';
import type { UserConfig } from 'vite';

const pdfJsRuntimeAssets = new Set([
  'jbig2.wasm',
  'jbig2_nowasm_fallback.js',
  'openjpeg.wasm',
  'openjpeg_nowasm_fallback.js',
  'qcms_bg.wasm',
]);

export const studioBuildConfig = {
  outDir: 'dist',
  target: 'es2022',
  sourcemap: false,
  chunkSizeWarningLimit: 7000,
  modulePreload: false,
  rolldownOptions: {
    input: {
      main: fileURLToPath(new URL('../index.html', import.meta.url)),
      zitie: fileURLToPath(new URL('../zitie.html', import.meta.url)),
    },
    checks: {
      pluginTimings: false,
    },
    output: {
      assetFileNames(assetInfo) {
        const pdfJsAssetName = assetInfo.names.find((name) => pdfJsRuntimeAssets.has(name));
        return pdfJsAssetName ? `assets/pdfjs/${pdfJsAssetName}` : 'assets/[name]-[hash][extname]';
      },
      manualChunks(id) {
        if (!id.includes('node_modules')) return undefined;
        if (id.includes('vue-router')) return 'vue-router';
        if (id.includes('/vue/')) return 'vue';
        return undefined;
      },
    },
  },
} satisfies NonNullable<UserConfig['build']>;
