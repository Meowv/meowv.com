<script setup lang="ts">
import { ArrowUpRight, HeartHandshake, ShieldCheck } from "@lucide/vue";

import AppLogo from "@/components/layout/AppLogo.vue";
import { productLinks, tools } from "@/config/tools";

const enabledTools = tools.filter((tool) => tool.enabled && tool.route);
</script>

<template>
  <footer
    class="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950"
  >
    <div
      class="mx-auto grid max-w-7xl gap-y-10 px-4 py-12 sm:px-6 md:grid-cols-2 md:gap-x-12 lg:grid-cols-[minmax(260px,0.85fr)_minmax(340px,1fr)_minmax(360px,1.15fr)] lg:gap-x-16 lg:px-8"
    >
      <section class="max-w-md" aria-label="产品信息">
        <AppLogo />
        <p class="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-400">
          免费的浏览器本地图片处理工具。无需登录，图片不上传。
        </p>
        <span
          class="mt-4 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300"
        >
          <ShieldCheck :size="16" aria-hidden="true" />
          本地处理 · 数据不上传
        </span>
      </section>

      <nav
        class="grid gap-10 md:col-span-2 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:col-auto lg:contents"
        aria-label="页脚导航"
      >
        <div class="grid content-start gap-3">
          <strong class="image-studio-wordmark text-sm font-bold"
            >Image Studio</strong
          >
          <div class="grid gap-x-5 gap-y-2 sm:grid-cols-2">
            <RouterLink
              v-for="tool in enabledTools"
              :key="tool.slug"
              class="flex items-center gap-2 whitespace-nowrap text-sm text-slate-600 transition hover:text-violet-700 dark:text-slate-400 dark:hover:text-violet-300"
              :to="tool.route!"
            >
              <component :is="tool.icon" :size="15" aria-hidden="true" />
              {{ tool.name }}
            </RouterLink>
          </div>
          <div
            class="mt-1 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200 pt-3 text-sm dark:border-slate-800"
          >
            <RouterLink
              class="inline-flex items-center gap-2 text-slate-600 transition hover:text-violet-700 dark:text-slate-400 dark:hover:text-violet-300"
              to="/privacy"
            >
              <ShieldCheck :size="15" aria-hidden="true" />
              隐私说明
            </RouterLink>
            <RouterLink
              class="inline-flex items-center gap-2 text-slate-600 transition hover:text-violet-700 dark:text-slate-400 dark:hover:text-violet-300"
              to="/#donate"
            >
              <HeartHandshake :size="15" aria-hidden="true" />
              捐赠支持
            </RouterLink>
          </div>
        </div>

        <div class="grid content-start gap-3">
          <strong class="text-sm font-bold text-slate-950 dark:text-white"
            >更多工具</strong
          >
          <a
            v-for="product in productLinks"
            :key="product.href"
            class="group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-transparent px-2 py-2 text-slate-600 transition hover:border-slate-200 hover:bg-white hover:text-violet-700 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-900 dark:hover:text-violet-300"
            :href="product.href"
            target="_blank"
            rel="noopener noreferrer"
          >
            <component :is="product.icon" :size="18" aria-hidden="true" />
            <span class="grid gap-0.5">
              <b class="text-sm text-slate-900 dark:text-slate-100">{{
                product.name
              }}</b>
              <small
                class="text-xs leading-4 text-slate-500 dark:text-slate-500"
              >
                {{ product.description }}
              </small>
            </span>
            <ArrowUpRight
              class="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              :size="15"
              aria-hidden="true"
            />
          </a>
        </div>
      </nav>
    </div>
  </footer>
</template>
