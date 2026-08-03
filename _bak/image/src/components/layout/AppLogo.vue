<script setup lang="ts">
withDefaults(
  defineProps<{
    compact?: boolean;
  }>(),
  {
    compact: false,
  },
);
</script>

<template>
  <RouterLink
    class="inline-flex min-w-0 items-center gap-3 rounded-xl text-slate-950 outline-none transition focus-visible:ring-4 focus-visible:ring-violet-200 dark:text-white dark:focus-visible:ring-violet-900"
    to="/"
    aria-label="Image Studio 首页"
  >
    <img
      class="shrink-0 rounded-xl shadow-sm shadow-violet-600/25"
      :class="compact ? 'size-9' : 'size-10'"
      src="/app-icon-192.png"
      alt=""
      :width="compact ? 36 : 40"
      :height="compact ? 36 : 40"
      aria-hidden="true"
    />
    <span class="grid min-w-0">
      <strong
        class="image-studio-wordmark truncate font-bold"
        :class="compact ? 'text-base' : 'text-lg'"
      >
        Image Studio
      </strong>
      <small
        v-if="!compact"
        class="hidden truncate text-xs leading-4 font-medium text-slate-500 sm:block dark:text-slate-400"
      >
        浏览器本地图片处理
      </small>
    </span>
  </RouterLink>
</template>
