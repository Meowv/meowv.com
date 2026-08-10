<script setup lang="ts">
import { ref } from 'vue';
import TextCodecTool from '../_shared/TextCodecTool.vue';
import type { TextCodecMode } from '../_shared/text-codecs';

const mode = ref<TextCodecMode>('html-encode');
const options: Array<{ value: TextCodecMode; label: string }> = [
  { value: 'html-encode', label: '编码（转义实体）' },
  { value: 'html-decode', label: '解码（还原字符）' },
];
</script>

<template>
  <div class="tool-stack">
    <label class="tool-inline-select">
      <span>操作</span>
      <select v-model="mode" aria-label="HTML 操作">
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </label>
    <TextCodecTool :key="mode" :mode="mode" />
  </div>
</template>
