<script setup lang="ts">
import { ref } from 'vue';
import { IconFileUpload } from '@tabler/icons-vue';

const props = withDefaults(
  defineProps<{
    accept?: string;
    multiple?: boolean;
    maxSize?: number;
    title?: string;
    description?: string;
  }>(),
  {
    accept: '*/*',
    multiple: false,
    maxSize: 50 * 1024 * 1024,
    title: '拖拽文件到这里，或点击选择',
    description: '文件只在当前浏览器中处理',
  },
);

const emit = defineEmits<{
  files: [files: File[]];
}>();

const input = ref<HTMLInputElement | null>(null);
const dragging = ref(false);
const error = ref('');

function openPicker(): void {
  input.value?.click();
}

function select(files: FileList | null): void {
  dragging.value = false;
  error.value = '';
  if (!files?.length) return;
  const selected = Array.from(files);
  const oversized = selected.find((file) => file.size > props.maxSize);
  if (oversized) {
    error.value = `${oversized.name} 超过 ${(props.maxSize / 1024 / 1024).toFixed(0)} MB 限制。`;
    return;
  }
  emit('files', props.multiple ? selected : selected.slice(0, 1));
  if (input.value) input.value.value = '';
}
</script>

<template>
  <div class="tool-file-uploader">
    <button
      type="button"
      class="tool-file-uploader__dropzone"
      :class="{ 'is-dragging': dragging }"
      @click="openPicker"
      @dragenter.prevent="dragging = true"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="select($event.dataTransfer?.files ?? null)"
    >
      <span class="tool-file-uploader__icon" aria-hidden="true">
        <IconFileUpload :size="25" />
      </span>
      <strong>{{ title }}</strong>
      <span>{{ description }}</span>
    </button>
    <input
      ref="input"
      class="tool-visually-hidden"
      type="file"
      :accept="accept"
      :multiple="multiple"
      @change="select(($event.target as HTMLInputElement).files)"
    />
    <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
  </div>
</template>
