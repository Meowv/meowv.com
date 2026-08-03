import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["assets/app-icon.png", "assets/app-icon-192.png", "assets/app-icon-512.png"],
      manifest: {
        name: "在线 Excel 处理",
        short_name: "在线 Excel 处理",
        description: "无需登录、数据不上传，在浏览器中创建、编辑和导出Excel文件。",
        theme_color: "#16a34a",
        background_color: "#f6f8f7",
        display: "standalone",
        start_url: "/",
        scope: "/",
        lang: "zh-CN",
        icons: [
          {
            src: "/assets/app-icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/assets/app-icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/assets/app-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
      },
    }),
  ],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 2400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@univerjs")) return "univer";
          if (id.includes("/xlsx/") || id.includes("/xlsx@")) return "sheetjs";
          if (id.includes("dexie")) return "storage";
          return undefined;
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    port: 4003,
    strictPort: true,
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.ts", "./src/views/WorkbookView.vue"],
    },
  },
});
