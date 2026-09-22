import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { UserConfig } from 'vite';

const pdfJsRuntimeAssets = new Set([
  'jbig2.wasm',
  'jbig2_nowasm_fallback.js',
  'openjpeg.wasm',
  'openjpeg_nowasm_fallback.js',
  'qcms_bg.wasm',
]);

/** 读 `pdfjs-dist` 的版本号；读不到就让构建停下，不静默退回不带版本的路径。 */
function readPdfJsVersion(): string {
  const manifest = new URL('../node_modules/pdfjs-dist/package.json', import.meta.url);
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
    const version =
      parsed && typeof parsed === 'object' && 'version' in parsed
        ? (parsed as { version?: unknown }).version
        : undefined;
    if (typeof version === 'string' && version) return version;
  } catch {
    // 落到下面的报错。
  }
  throw new Error(
    '读不到 node_modules/pdfjs-dist/package.json 的版本号：pdfjs 运行时资源的缓存目录名由它决定。',
  );
}

/**
 * pdfjs 按**固定文件名**（jbig2.wasm / openjpeg.wasm / qcms_bg.wasm 及其 no-wasm 回退）从
 * `wasmUrl` 指向的**目录**里取这几个文件 —— 见 `PdfDocumentLoader.ts` 与
 * `_shared/pdf/core/render/pdfjs.ts` 里 `new URL('.', jbig2Wasm)` 的用法。
 * 所以不能给文件名加哈希（pdfjs 会找不到），只能把哈希加在**目录名**上。
 *
 * 目录随 pdfjs 版本变化 → 升级后 URL 全变 → nginx 的 `expires 1y` 与 Service Worker 的
 * cacheFirst 都不会再命中旧 wasm。此前是固定目录 `assets/pdfjs/`，升级 pdfjs 后
 * 用户会一直拿到旧文件。
 */
const pdfJsAssetDirectory = `assets/pdfjs-${readPdfJsVersion()}`;

/**
 * 取模块所属的 npm 包名（含作用域）；不属于任何包时返回 null。
 *
 * 不能只看第一段 `node_modules`：pnpm 的路径形如
 * `…/node_modules/.pnpm/@vue+runtime-core@3.5.40/node_modules/@vue/runtime-core/dist/…`，
 * 用 `lastIndexOf` 才能取到真正的包名。
 *
 * 这里曾经写成 `id.includes('/vue/')` —— 它匹配不到 `@vue/*` 作用域包（路径里是
 * `@vue+runtime-core`，没有 `/vue/` 这一段），所以 Vue 运行时是否落在独立 chunk 里
 * 全靠运气，不是靠规则。
 */
function packageNameOf(id: string): string | null {
  const marker = '/node_modules/';
  const index = id.lastIndexOf(marker);
  if (index < 0) return null;
  const segments = id.slice(index + marker.length).split('/');
  const first = segments[0];
  if (!first) return null;
  if (!first.startsWith('@')) return first;
  const second = segments[1];
  return second ? `${first}/${second}` : null;
}

export const studioBuildConfig = {
  outDir: 'dist',
  target: 'es2022',
  sourcemap: false,
  // 不要调高：调高等于把「单个 chunk 过大」这个信号静默掉。历史上这里被设成 7000，
  // 于是数 MB 的 chunk（monaco 的 ts.worker 6.9MB、editor.api 2.6MB）一直没有被提示过。
  // 500 是 Vite 默认值，是条有用的绊线。
  chunkSizeWarningLimit: 500,
  // 入口的静态依赖（Vue 运行时 + vue-router 所在的共享 chunk）必须在 HTML 阶段就预取，
  // 否则「index.html → main.js → 共享 chunk」是串行的：浏览器要等 main.js 下载并解析完
  // 才知道还要拉共享 chunk。构建目标已是 es2022，modulepreload 是原生能力，无需 polyfill。
  modulePreload: { polyfill: false },
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
        return pdfJsAssetName
          ? `${pdfJsAssetDirectory}/${pdfJsAssetName}`
          : 'assets/[name]-[hash][extname]';
      },
      manualChunks(id) {
        const packageName = packageNameOf(id);
        if (!packageName) return undefined;
        // 框架运行时单独成块：内容只随框架版本变化，发版时哈希不变，
        // 用户不必为了业务代码的改动重新下载整份 Vue / vue-router / pinia。
        //
        // 用一个名字而不是三个：这三者互相依赖、版本同步，拆成多个手动块时
        // rolldown 还会按内部依赖再切一次，块名与实际内容就对不上了
        // （实测拆开后装 Vue 运行时核心的那一块被命名成了 `pinia`，误导性很强）。
        if (
          packageName === 'vue' ||
          packageName.startsWith('@vue/') ||
          packageName === 'vue-router' ||
          packageName === 'pinia'
        ) {
          return 'framework';
        }
        return undefined;
      },
    },
  },
} satisfies NonNullable<UserConfig['build']>;
