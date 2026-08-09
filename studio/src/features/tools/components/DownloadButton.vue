<script setup lang="ts">
import { IconDownload } from '@tabler/icons-vue';

const props = withDefaults(
  defineProps<{
    content: string;
    filename: string;
    mimeType?: string;
    label?: string;
  }>(),
  {
    mimeType: 'text/plain;charset=utf-8',
    label: '下载',
  },
);

function download(): void {
  if (!props.content) return;
  const url = URL.createObjectURL(new Blob([props.content], { type: props.mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = props.filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>

<template>
  <button
    type="button"
    class="tool-button tool-button--quiet"
    :disabled="!content"
    @click="download"
  >
    <IconDownload :size="16" aria-hidden="true" />
    {{ label }}
  </button>
</template>
