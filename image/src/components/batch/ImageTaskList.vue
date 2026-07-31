<script setup lang="ts">
import {
  AlertCircle,
  Check,
  Download,
  LoaderCircle,
  Trash2,
  XCircle,
} from "@lucide/vue";

import type { ImageTask } from "@/types/image";
import {
  formatBytes,
  formatDimensions,
  formatSizeChange,
} from "@/utils/format";

defineProps<{
  tasks: ImageTask[];
  isProcessing: boolean;
  controlsDisabled: boolean;
}>();

const emit = defineEmits<{
  remove: [id: string];
  download: [task: ImageTask];
}>();

const statusLabels: Record<ImageTask["status"], string> = {
  ready: "等待处理",
  processing: "处理中",
  success: "处理完成",
  failed: "处理失败",
  cancelled: "已取消",
};
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
    <div
      class="flex items-center justify-between gap-4 border-b border-[var(--border)] px-4 py-3.5 sm:px-5"
    >
      <div>
        <h2 class="text-sm font-bold text-[var(--text)]">任务列表</h2>
        <p class="mt-0.5 text-xs text-[var(--text-muted)]">{{ tasks.length }} 张图片</p>
      </div>
      <span
        class="rounded-full bg-[var(--surface-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--text-soft)]"
      >
        并发处理 2 张
      </span>
    </div>

    <ul class="divide-y divide-[var(--border)]" aria-label="图片处理任务">
      <li
        v-for="task in tasks"
        :key="task.id"
        class="grid gap-3 px-4 py-4 sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-center sm:px-5"
        :data-status="task.status"
      >
        <div
          class="checkerboard relative size-16 overflow-hidden rounded-xl border border-[var(--border)]"
        >
          <img
            class="size-full object-cover"
            :src="task.previewUrl"
            :alt="`${task.file.name} 预览`"
          />
        </div>

        <div class="min-w-0">
          <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <strong class="max-w-full truncate text-sm font-semibold text-[var(--text)]">
              {{ task.file.name }}
            </strong>
            <span
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              :class="{
                'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300':
                  task.status === 'ready',
                'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300':
                  task.status === 'processing',
                'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300':
                  task.status === 'success',
                'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300':
                  task.status === 'failed',
                'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300':
                  task.status === 'cancelled',
              }"
            >
              <LoaderCircle
                v-if="task.status === 'processing'"
                class="animate-spin"
                :size="12"
                aria-hidden="true"
              />
              <Check v-else-if="task.status === 'success'" :size="12" aria-hidden="true" />
              <AlertCircle
                v-else-if="task.status === 'failed'"
                :size="12"
                aria-hidden="true"
              />
              <XCircle
                v-else-if="task.status === 'cancelled'"
                :size="12"
                aria-hidden="true"
              />
              {{ statusLabels[task.status] }}
            </span>
          </div>

          <p class="mt-1.5 text-xs text-[var(--text-muted)]">
            {{ formatDimensions(task.width, task.height) }}
            <span aria-hidden="true"> · </span>
            {{ formatBytes(task.file.size) }}
          </p>

          <p
            v-if="task.result"
            class="mt-1 text-xs font-medium"
            :class="
              task.result.blob.size <= task.file.size
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-amber-700 dark:text-amber-300'
            "
          >
            输出 {{ formatDimensions(task.result.width, task.result.height) }}
            <span aria-hidden="true"> · </span>
            {{ formatBytes(task.result.blob.size) }}
            <span aria-hidden="true"> · </span>
            {{ formatSizeChange(task.file.size, task.result.blob.size) }}
          </p>

          <p
            v-else-if="task.error"
            class="mt-1.5 text-xs leading-5 text-rose-700 dark:text-rose-300"
          >
            {{ task.error }}
          </p>

          <div
            v-if="task.status === 'processing'"
            class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
            role="progressbar"
            :aria-label="`${task.file.name} 处理进度`"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="Math.round(task.progress)"
            :aria-valuetext="`${Math.round(task.progress)}%`"
          >
            <span
              class="block h-full rounded-full bg-indigo-500 transition-[width]"
              :style="{ width: `${task.progress}%` }"
            />
          </div>
        </div>

        <div class="flex items-center gap-1 sm:justify-end">
          <button
            v-if="task.result"
            type="button"
            class="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:bg-indigo-900"
            :disabled="controlsDisabled"
            :aria-label="`下载 ${task.result.filename}`"
            @click="emit('download', task)"
          >
            <Download :size="14" aria-hidden="true" />
            下载
          </button>
          <button
            type="button"
            class="grid size-9 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-45 dark:hover:bg-rose-950 dark:hover:text-rose-300"
            :disabled="isProcessing || controlsDisabled"
            :aria-label="`移除 ${task.file.name}`"
            @click="emit('remove', task.id)"
          >
            <Trash2 :size="15" aria-hidden="true" />
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
