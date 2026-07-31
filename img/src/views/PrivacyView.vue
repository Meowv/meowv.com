<script setup lang="ts">
import { Database, FileLock2, HardDrive, Info, ShieldCheck } from "@lucide/vue";
</script>

<template>
  <main id="main-content" class="bg-white dark:bg-slate-950">
    <div class="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <header class="max-w-3xl">
        <span
          class="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-bold text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300"
        >
          <ShieldCheck :size="16" aria-hidden="true" />
          隐私优先
        </span>
        <h1
          class="mt-6 text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl dark:text-white"
        >
          隐私说明
        </h1>
        <p class="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-300">
          你的图片由当前浏览器处理。我们不会用图片内容交换便利。
        </p>
      </header>

      <section
        class="mt-12 flex gap-5 rounded-2xl border border-violet-200 bg-violet-50 p-6 sm:p-8 dark:border-violet-900 dark:bg-violet-950/60"
        aria-labelledby="privacy-promise"
      >
        <span
          class="grid size-12 shrink-0 place-items-center rounded-xl bg-violet-600 text-white"
          aria-hidden="true"
        >
          <FileLock2 :size="24" />
        </span>
        <div>
          <h2 id="privacy-promise" class="text-xl font-bold text-slate-950 dark:text-white">
            图片不会上传到服务器
          </h2>
          <p class="mt-2 text-sm leading-7 text-slate-700 dark:text-slate-300">
            选择图片后，读取、预览、调整和导出均在当前页面完成。本站没有接收图片内容的上传接口，也不会把图片发送给第三方转换服务。
          </p>
        </div>
      </section>

      <div class="mt-8 grid gap-5 md:grid-cols-2">
        <section class="rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
          <HardDrive class="text-blue-700 dark:text-blue-300" :size="22" aria-hidden="true" />
          <h2 class="mt-5 text-xl font-bold text-slate-950 dark:text-white">处理期间</h2>
          <ul
            class="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600 marker:text-violet-500 dark:text-slate-400"
          >
            <li>图片仅在当前浏览器标签页的内存中参与处理。</li>
            <li>原始文件不会被修改，工具只生成新的结果文件。</li>
            <li>图片内容、文件名和预览不会写入 localStorage 或 Cookie。</li>
            <li>预览地址和临时缓冲区会在不再使用时释放。</li>
          </ul>
        </section>

        <section class="rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
          <Database class="text-blue-700 dark:text-blue-300" :size="22" aria-hidden="true" />
          <h2 class="mt-5 text-xl font-bold text-slate-950 dark:text-white">我们可能保存的设置</h2>
          <ul
            class="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600 marker:text-violet-500 dark:text-slate-400"
          >
            <li>浅色、深色或跟随系统的主题偏好。</li>
            <li>非敏感的界面偏好和工具默认参数。</li>
            <li>不会保存图片内容、文件名历史、水印文字或输出文件。</li>
          </ul>
        </section>
      </div>

      <section class="mt-12 border-t border-slate-200 pt-10 dark:border-slate-800">
        <h2 class="text-2xl font-bold text-slate-950 dark:text-white">关闭页面之后</h2>
        <p class="mt-4 text-base leading-8 text-slate-600 dark:text-slate-400">
          页面会释放当前工作区持有的图片引用和临时资源，网站不会保留一份可供之后恢复的副本。浏览器和操作系统如何回收内存由其自身负责，因此我们不会声称能彻底擦除设备上的所有内存痕迹。
        </p>
      </section>

      <section class="mt-10 border-t border-slate-200 pt-10 dark:border-slate-800">
        <h2 class="text-2xl font-bold text-slate-950 dark:text-white">站点运行所需的网络请求</h2>
        <p class="mt-4 text-base leading-8 text-slate-600 dark:text-slate-400">
          访问网站时，浏览器仍需下载本站的 HTML、CSS、JavaScript、图标和其他静态资源。这些请求不包含你选择的图片内容。图片处理所需的代码会随站点资源一同提供，不依赖远程图片转换服务。
        </p>
      </section>

      <aside
        class="mt-10 flex gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-100"
      >
        <Info class="mt-0.5 shrink-0" :size="19" aria-hidden="true" />
        <p>
          如果使用公共或共享设备，处理完成后请关闭页面并妥善管理已下载的结果文件。浏览器扩展和设备环境不由本站控制。
        </p>
      </aside>

      <div class="mt-10">
        <RouterLink
          class="inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white outline-none transition hover:bg-violet-700 focus-visible:ring-4 focus-visible:ring-violet-200 dark:focus-visible:ring-violet-900"
          to="/#tools"
        >
          查看图片工具
        </RouterLink>
      </div>
    </div>
  </main>
</template>
