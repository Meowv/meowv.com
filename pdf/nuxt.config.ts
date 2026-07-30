import { resolve } from "node:path";

const toolRoutes = [
  "/merge-pdf",
  "/split-pdf",
  "/organize-pdf",
  "/delete-pdf-pages",
  "/extract-pdf-pages",
  "/rotate-pdf",
  "/images-to-pdf",
  "/pdf-to-images",
  "/watermark-pdf",
  "/add-pdf-page-numbers",
  "/pdf-metadata"
];

export default defineNuxtConfig({
  compatibilityDate: "2026-07-28",
  devServer: {
    port: 4003
  },
  devtools: { enabled: false },
  css: ["~/assets/css/main.css"],
  modules: ["@nuxt/eslint"],
  components: [{ path: "~/components", pathPrefix: false }],
  alias: {
    "@pdf": resolve("./core/pdf")
  },
  app: {
    head: {
      htmlAttrs: { lang: "zh-CN" },
      link: [
        { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
        { rel: "apple-touch-icon", sizes: "192x192", href: "/app-icon-192.png" }
      ],
      meta: [
        { name: "theme-color", content: "#d84a4a" },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1, viewport-fit=cover"
        }
      ],
      script: [
        {
          async: true,
          src: "https://www.googletagmanager.com/gtag/js?id=G-CKC14F63ME"
        },
        {
          src: "/google-analytics.js"
        }
      ]
    }
  },
  typescript: {
    strict: true,
    typeCheck: false
  },
  nitro: {
    preset: "static",
    prerender: {
      crawlLinks: true,
      failOnError: true,
      routes: ["/", ...toolRoutes, "/privacy", "/help", "/donate"]
    }
  },
  routeRules: {
    "/": { prerender: true },
    "/privacy": { prerender: true },
    "/help": { prerender: true },
    "/donate": { prerender: true },
    ...Object.fromEntries(toolRoutes.map((route) => [route, { prerender: true }]))
  },
  vite: {
    worker: {
      format: "es"
    },
    optimizeDeps: {
      exclude: ["pdfjs-dist"]
    }
  }
});
