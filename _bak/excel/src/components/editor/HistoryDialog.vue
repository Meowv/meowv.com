<script setup lang="ts">
import { Clock3, RotateCcw, Trash2 } from "@lucide/vue";

import type { WorkbookRevision } from "@/models/workbook";

import EditorDialog from "./EditorDialog.vue";

withDefaults(
  defineProps<{
    open: boolean;
    revisions: WorkbookRevision[];
    busy?: boolean;
    allowCreate?: boolean;
    recoveryMode?: boolean;
  }>(),
  {
    busy: false,
    allowCreate: true,
    recoveryMode: false,
  },
);

defineEmits<{
  close: [];
  create: [];
  restore: [revision: WorkbookRevision];
  remove: [revision: WorkbookRevision];
}>();

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const typeLabels: Record<WorkbookRevision["type"], string> = {
  auto: "自动保存",
  manual: "手动创建",
  import: "文件导入",
  "before-restore": "恢复前备份",
};
</script>

<template>
  <EditorDialog
    :open="open"
    title="历史版本"
    :description="
      recoveryMode
        ? '选择一个可用版本后，应用会创建新的恢复工作簿；原工作簿不会被覆盖。'
        : '版本同样仅保存在当前浏览器。恢复前会自动保留当前内容。'
    "
    width="680px"
    @close="$emit('close')"
  >
    <div v-if="revisions.length" class="history-list">
      <article v-for="revision in revisions" :key="revision.id" class="history-item">
        <span class="history-item__icon"><Clock3 :size="18" /></span>
        <div class="history-item__copy">
          <strong>{{ revision.name }}</strong>
          <span>
            {{ typeLabels[revision.type] }} · {{ dateFormatter.format(revision.createdAt) }}
          </span>
        </div>
        <div class="history-item__actions">
          <button
            type="button"
            :disabled="busy"
            title="恢复此版本"
            @click="$emit('restore', revision)"
          >
            <RotateCcw :size="16" />
            {{ recoveryMode ? "复制恢复" : "恢复" }}
          </button>
          <button
            class="is-danger"
            type="button"
            :disabled="busy"
            title="删除此版本"
            @click="$emit('remove', revision)"
          >
            <Trash2 :size="16" />
          </button>
        </div>
      </article>
    </div>
    <div v-else class="history-empty">
      <Clock3 :size="28" />
      <strong>还没有历史版本</strong>
      <span>自动保存会按设置的时间间隔保留版本，也可以现在手动创建。</span>
    </div>

    <template #footer>
      <button class="button button--secondary" type="button" @click="$emit('close')">关闭</button>
      <button
        v-if="allowCreate"
        class="button button--primary"
        type="button"
        :disabled="busy"
        @click="$emit('create')"
      >
        创建当前版本
      </button>
    </template>
  </EditorDialog>
</template>

<style scoped>
.history-list {
  display: grid;
  gap: 8px;
}

.history-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
}

.history-item__icon {
  display: grid;
  width: 34px;
  height: 34px;
  border-radius: 7px;
  background: var(--primary-surface);
  color: var(--primary-text);
  place-items: center;
}

.history-item__copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.history-item__copy strong {
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-item__copy span {
  color: var(--text-tertiary);
  font-size: 11px;
}

.history-item__actions {
  display: flex;
  gap: 5px;
}

.history-item__actions button {
  display: inline-flex;
  min-width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface);
  padding: 0 9px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.history-item__actions button:hover {
  background: var(--surface-muted);
}

.history-item__actions button.is-danger {
  color: var(--danger-text);
}

.history-empty {
  display: grid;
  min-height: 210px;
  place-items: center;
  align-content: center;
  gap: 8px;
  color: var(--text-tertiary);
  text-align: center;
}

.history-empty strong {
  color: var(--text);
}

.history-empty span {
  max-width: 410px;
  font-size: 13px;
  line-height: 1.65;
}
</style>
