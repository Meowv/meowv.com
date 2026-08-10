<script setup lang="ts">
import { ref } from 'vue';
import CodeFormatterTool from '../_shared/CodeFormatterTool.vue';
import type { FormatterMode } from '../_shared/code-formatters';

const mode = ref<FormatterMode>('javascript');
const options: Array<{ value: FormatterMode; label: string }> = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'css', label: 'CSS' },
  { value: 'html', label: 'HTML' },
  { value: 'sql', label: 'SQL' },
  { value: 'xml', label: 'XML' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
];
</script>

<template>
  <div class="tool-stack">
    <label class="tool-inline-select">
      <span>格式</span>
      <select v-model="mode" aria-label="代码格式">
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </label>
    <CodeFormatterTool :key="mode" :mode="mode" />
  </div>
</template>
