<script setup lang="ts">
import { ArrowDown, ArrowUp, FileText, GripVertical, Trash2 } from '@/features/pdf/icons';
import { VueDraggable } from 'vue-draggable-plus';
import type { LoadedPdfFile } from '@/features/pdf/core/types';
import { formatFileSize } from '@/features/pdf/core/shared/format';

const props = defineProps<{
  modelValue: LoadedPdfFile[];
  sortable?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [files: LoadedPdfFile[]];
  remove: [id: string];
}>();

const items = computed({
  get: () => props.modelValue,
  set: (value: LoadedPdfFile[]) => emit('update:modelValue', value),
});

function move(index: number, offset: -1 | 1): void {
  const target = index + offset;
  if (target < 0 || target >= items.value.length) {
    return;
  }
  const next = [...items.value];
  const [current] = next.splice(index, 1);
  if (current) {
    next.splice(target, 0, current);
    items.value = next;
  }
}
</script>

<template>
  <VueDraggable
    v-model="items"
    class="file-list"
    :disabled="!sortable"
    handle=".file-row__handle"
    :animation="180"
    aria-label="已添加的 PDF 文件"
  >
    <article v-for="(file, index) in items" :key="file.id" class="file-row">
      <button
        v-if="sortable"
        type="button"
        class="icon-button file-row__handle"
        aria-label="拖动调整文件顺序"
      >
        <GripVertical :size="18" />
      </button>
      <span class="file-row__type" aria-hidden="true"><FileText :size="20" /></span>
      <div class="file-row__content">
        <strong :title="file.name">{{ file.name }}</strong>
        <span>{{ file.pageCount }} 页 · {{ formatFileSize(file.size) }}</span>
      </div>
      <div v-if="sortable" class="file-row__order">
        <button
          type="button"
          class="icon-button"
          :disabled="index === 0"
          :aria-label="`上移 ${file.name}`"
          @click="move(index, -1)"
        >
          <ArrowUp :size="16" />
        </button>
        <button
          type="button"
          class="icon-button"
          :disabled="index === items.length - 1"
          :aria-label="`下移 ${file.name}`"
          @click="move(index, 1)"
        >
          <ArrowDown :size="16" />
        </button>
      </div>
      <button
        type="button"
        class="icon-button danger"
        :aria-label="`移除 ${file.name}`"
        @click="emit('remove', file.id)"
      >
        <Trash2 :size="17" />
      </button>
    </article>
  </VueDraggable>
</template>
