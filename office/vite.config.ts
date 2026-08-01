import fs from 'node:fs';
import path, { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig, type Plugin } from 'vite';

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

// 将目录型 URL 映射到真实静态 index.html，开发和预览行为保持一致。
const cleanUrls = (): Plugin => {
  const middlewareFor = (root: string) => {
    return (
      req: import('node:http').IncomingMessage,
      res: import('node:http').ServerResponse,
      next: () => void,
    ): void => {
      const [pathname, query] = (req.url ?? '/').split('?');
      if (pathname === '/' || pathname.includes('.')) return next();
      if (!pathname.endsWith('/') && fs.existsSync(path.join(root, pathname, 'index.html'))) {
        // 目录 URL 缺少尾部斜杠时，按静态服务器的常见行为重定向。
        res.writeHead(308, { Location: `${pathname}/${query ? `?${query}` : ''}` });
        res.end();
        return;
      }
      const candidate = pathname.endsWith('/') ? `${pathname}index.html` : `${pathname}/index.html`;
      if (fs.existsSync(path.join(root, candidate))) req.url = candidate + (query ? `?${query}` : '');
      next();
    };
  };
  return {
    name: 'clean-urls',
    configureServer(server) {
      server.middlewares.use(middlewareFor(path.join(__dirname, 'public')));
    },
    configurePreviewServer(server) {
      server.middlewares.use(middlewareFor(path.join(__dirname, 'dist/client')));
    },
  };
};

export default defineConfig({
  base: '/',
  publicDir: 'public',
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('r-') || tag === 'pwa-install',
        },
      },
    }),
    cleanUrls(),
  ],
  resolve: {
    alias: {
      '@/lib': resolve(__dirname, 'lib'),
      '@/store': resolve(__dirname, 'store'),
      '@/assets': resolve(__dirname, 'assets'),
      '@/types': resolve(__dirname, 'types'),
      '@/styles': resolve(__dirname, 'styles'),
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@import "@/styles/base.css";`,
      },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 2200,
  },
  server: {
    host: '::',
    port: 4006,
    strictPort: true,
    allowedHosts: ['terminal.local'],
  },
});
