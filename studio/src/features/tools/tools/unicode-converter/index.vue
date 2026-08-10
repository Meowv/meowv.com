<script setup lang="ts">
import { ref } from 'vue';
import TextCodecTool from '../_shared/TextCodecTool.vue';
import type { TextCodecMode } from '../_shared/text-codecs';

const mode = ref<TextCodecMode>('chinese-to-unicode');
const options: Array<{ value: TextCodecMode; label: string }> = [
  { value: 'chinese-to-unicode', label: '文本转 Unicode' },
  { value: 'unicode-to-chinese', label: 'Unicode 转文本' },
];
</script>

<template>
  <div class="tool-stack">
    <label class="tool-inline-select">
      <span>操作</span>
      <select v-model="mode" aria-label="Unicode 操作">
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </label>
    <TextCodecTool :key="mode" :mode="mode" />
  </div>
</template>
