<script setup lang="ts">
import { UploadCloud } from '@/features/image/icons';
import { ref } from 'vue';

const defaultAcceptedExtensions =
  '.jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,.ico,.heic,.heif,.svg,image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff,image/vnd.microsoft.icon,image/heic,image/heif,image/svg+xml';

const props = withDefaults(
  defineProps<{
    accept?: string;
    description?: string;
    disabled?: boolean;
    multiple?: boolean;
    compact?: boolean;
    prompt?: string;
  }>(),
  {
    accept: defaultAcceptedExtensions,
    description: '支持 JPG、PNG、WebP、GIF、BMP、ICO、SVG，最多 100 张',
    disabled: false,
    multiple: true,
    compact: false,
    prompt: '拖入图片，或点击选择本地文件',
  },
);

const emit = defineEmits<{
  files: [files: File[]];
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);

function selectFiles() {
  if (!props.disabled) {
    inputRef.value?.click();
  }
}

function emitFiles(list: FileList | null) {
  if (!list || props.disabled) {
    return;
  }
  emit('files', Array.from(list));
  if (inputRef.value) {
    inputRef.value.value = '';
  }
}

function onDrop(event: DragEvent) {
  isDragging.value = false;
  emitFiles(event.dataTransfer?.files ?? null);
}
</script>

<template>
  <button
    type="button"
    data-testid="image-dropzone"
    class="group relative flex w-full cursor-pointer flex-col items-center justify-center overflow-hidden border border-dashed text-center transition duration-200 disabled:cursor-not-allowed"
    :class="[
      compact ? 'min-h-40 rounded-2xl px-5 py-7' : 'min-h-64 rounded-[20px] px-8 py-12',
      isDragging
        ? 'border-indigo-500 bg-indigo-50/85 shadow-[0_0_0_4px_rgba(99,102,241,.12)] dark:bg-indigo-950/30'
        : 'border-[var(--border-strong)] bg-[var(--surface)] hover:border-indigo-400 hover:bg-indigo-50/35 dark:hover:bg-indigo-950/20',
      disabled ? 'opacity-55' : '',
    ]"
    :disabled="disabled"
    @click="selectFiles"
    @dragenter.prevent="isDragging = true"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    @drop.prevent="onDrop"
  >
    <span
      class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-300/70 to-transparent opacity-0 transition group-hover:opacity-100"
    />
    <span
      class="mb-4 grid size-13 place-items-center rounded-2xl border border-indigo-200 bg-indigo-50 text-indigo-600 shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300"
    >
      <UploadCloud :size="25" :stroke-width="1.8" aria-hidden="true" />
    </span>
    <strong class="text-[15px] font-semibold text-[var(--text)]">
      {{ prompt }}
    </strong>
    <span class="image-dropzone__description">
      <span>{{ description }}</span>
    </span>
  </button>

  <input
    ref="inputRef"
    class="sr-only"
    type="file"
    :accept="accept"
    :multiple="multiple"
    tabindex="-1"
    @change="emitFiles(($event.target as HTMLInputElement).files)"
  />
</template>
