<script setup lang="ts">
import CopyButton from '@/features/tools/components/CopyButton.vue';
import DownloadButton from '@/features/tools/components/DownloadButton.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';

withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    value: string;
    placeholder?: string;
    rows?: number;
    filename?: string;
    mimeType?: string;
  }>(),
  {
    title: '处理结果',
    description: '',
    placeholder: '处理结果将在这里显示',
    rows: 12,
    filename: 'studio-tools-result.txt',
    mimeType: 'text/plain;charset=utf-8',
  },
);
</script>

<template>
  <ToolSection :title="title" :description="description" tone="output">
    <template #actions>
      <CopyButton :text="value" />
      <DownloadButton :content="value" :filename="filename" :mime-type="mimeType" />
    </template>
    <textarea
      class="tool-output"
      :value="value"
      :rows="rows"
      :placeholder="placeholder"
      readonly
      spellcheck="false"
    ></textarea>
    <slot />
  </ToolSection>
</template>
