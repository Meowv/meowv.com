<script setup lang="ts">
import { ref } from 'vue';
import JsonWorkbench from './JsonWorkbench.vue';
import DataConvertTool from './DataConvertTool.vue';
import type { DataConvertMode } from './data-converters';

type Mode = 'format' | 'minify' | 'validate' | DataConvertMode;

const mode = ref<Mode>('format');
const options: Array<{ value: Mode; label: string }> = [
  { value: 'format', label: '格式化' },
  { value: 'minify', label: '压缩' },
  { value: 'validate', label: '校验' },
  { value: 'json-to-yaml', label: '转 YAML' },
  { value: 'json-to-xml', label: '转 XML' },
  { value: 'json-to-csv', label: '转 CSV' },
  { value: 'json-to-toml', label: '转 TOML' },
  { value: 'json-to-typescript', label: '转 TypeScript' },
  { value: 'json-to-java', label: '转 Java' },
  { value: 'json-to-csharp', label: '转 C#' },
];
</script>

<template>
  <div class="tool-stack">
    <label class="tool-inline-select">
      <span>操作</span>
      <select v-model="mode" aria-label="JSON 操作">
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </label>
    <JsonWorkbench
      v-if="mode === 'format' || mode === 'minify' || mode === 'validate'"
      :key="mode"
      :mode="mode"
    />
    <DataConvertTool v-else :key="mode" :mode="mode" />
  </div>
</template>
