<script setup lang="ts">
import { FilePlus2, LockKeyhole, UploadCloud } from "@lucide/vue";

const props = withDefaults(
  defineProps<{
    accept?: string;
    multiple?: boolean;
    title?: string;
    hint?: string;
    disabled?: boolean;
  }>(),
  {
    accept: "application/pdf,.pdf",
    multiple: false,
    title: "将 PDF 拖到这里",
    hint: "文件仅在当前浏览器中处理，不会上传到服务器",
    disabled: false
  }
);

const emit = defineEmits<{
  files: [files: File[]];
}>();

const input = ref<HTMLInputElement | null>(null);
const dragging = ref(false);

function openPicker(): void {
  if (!props.disabled) {
    input.value?.click();
  }
}

function emitFiles(files: FileList | null): void {
  if (files?.length) {
    emit("files", Array.from(files));
  }
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  if (!props.disabled) {
    emitFiles(event.dataTransfer?.files ?? null);
  }
}
</script>

<template>
  <input
    ref="input"
    hidden
    type="file"
    :accept="accept"
    :multiple="multiple"
    :disabled="disabled"
    @change="emitFiles(($event.target as HTMLInputElement).files)"
  />
  <button
    class="dropzone"
    :class="{ 'is-dragging': dragging, 'is-disabled': disabled }"
    type="button"
    :disabled="disabled"
    @click="openPicker"
    @dragenter.prevent="dragging = true"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <span class="dropzone__icon" aria-hidden="true">
      <UploadCloud :size="28" />
    </span>
    <strong>{{ title }}</strong>
    <span class="dropzone__action"><FilePlus2 :size="16" /> 或点击选择文件</span>
    <small><LockKeyhole :size="14" /> {{ hint }}</small>
  </button>
</template>
