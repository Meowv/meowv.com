<script setup lang="ts">
import { ArrowLeft, ImageOff } from "@lucide/vue";
</script>

<template>
  <main
    id="main-content"
    class="grid min-h-[calc(100vh-72px)] place-items-center bg-white px-4 py-16 dark:bg-slate-950"
  >
    <div class="max-w-xl text-center">
      <span
        class="mx-auto grid size-16 place-items-center rounded-2xl bg-violet-50 text-violet-700 ring-1 ring-violet-100 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900"
        aria-hidden="true"
      >
        <ImageOff :size="30" :stroke-width="1.8" />
      </span>
      <p class="mt-7 text-sm font-black tracking-[0.2em] text-violet-700 dark:text-violet-300">
        404
      </p>
      <h1
        class="mt-3 text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl dark:text-white"
      >
        这个页面不存在
      </h1>
      <p class="mt-5 text-base leading-7 text-slate-600 dark:text-slate-400">
        地址可能已经变化，或者你打开了一条无效链接。回到首页即可继续使用图片工具。
      </p>
      <RouterLink
        class="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 font-bold text-white outline-none transition hover:bg-violet-700 focus-visible:ring-4 focus-visible:ring-violet-200 dark:focus-visible:ring-violet-900"
        to="/"
      >
        <ArrowLeft :size="18" aria-hidden="true" />
        返回首页
      </RouterLink>
    </div>
  </main>
</template>
